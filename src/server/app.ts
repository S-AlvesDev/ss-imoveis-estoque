import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import nodemailer from 'nodemailer';
import { supabaseServer } from '../lib/supabaseServer';
import { ADMIN_ROLES, CENTRAL_ROLES, OBRA_ROLES, ALL_INVENTORY_ROLES } from '../shared/constants';
// Mesma regra de saldo que a interface usa — fonte única da verdade.
import { needsPurchase, stockStatus, stockTotal } from '../features/estoque/utils';
import { scopedDb, type ScopedDb } from './tenant';
import {
  FLUXO_DA_OPERACAO,
  calcularMovimento,
  depositosDoFluxo,
  depositosDaUnidade,
  acharDeposito,
  depositosDaOrg,
  unidadesDaOrg,
  saldosDaOrg,
  saldosDoMaterial,
  gravarSaldos,
  totalDosDepositos,
  arredondar,
  type Deposito,
  type SaldosPorDeposito,
} from './estoque';

/**
 * Tabela de identidades DO ESTOQUE. Antes o login vinha de `users`, que é
 * compartilhada com o CRM da imobiliária — clientes e corretores na mesma
 * estrutura dos almoxarifes. A separação é o que permite o estoque existir
 * como produto próprio.
 */
const ESTOQUE_USERS = 'estoque_users';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('[Server] JWT_SECRET não definido — configure essa variável de ambiente antes de subir o servidor.');
}

let transporter: nodemailer.Transporter | null = null;
async function getTransporter() {
  if (!process.env.BREVO_SMTP_LOGIN || !process.env.BREVO_SMTP_KEY) return null;
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: 'smtp-relay.brevo.com',
    port: 2525,
    secure: false,
    auth: { user: process.env.BREVO_SMTP_LOGIN, pass: process.env.BREVO_SMTP_KEY },
  });
  return transporter;
}

// O PostgREST (Supabase) limita cada resposta a 1000 linhas por padrão. Esta
// função pagina via .range() até trazer todos os registros, evitando que a
// auditoria "pare de contar" ao atingir 1000 movimentações.
const SUPABASE_PAGE_SIZE = 1000;

async function fetchAllRows<T = any>(buildQuery: () => any): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await buildQuery().range(from, from + SUPABASE_PAGE_SIZE - 1);
    if (error) throw error;
    const batch = (data || []) as T[];
    all.push(...batch);
    if (batch.length < SUPABASE_PAGE_SIZE) break;
    from += SUPABASE_PAGE_SIZE;
  }
  return all;
}

// Operações de movimentação de estoque e quais papéis podem executá-las.
const OPERATION_ROLES: Record<string, string[]> = {
  ENTRADA_CENTRAL: CENTRAL_ROLES,
  SAIDA: CENTRAL_ROLES,
  REMESSA_OBRA: CENTRAL_ROLES,
  DEVOLUCAO_CENTRAL: ALL_INVENTORY_ROLES,
  CONSUMO_OBRA: OBRA_ROLES,
  // Ajustes de recontagem: cada equipe pode corrigir o saldo do próprio local (fica tudo auditado por quem fez).
  AJUSTE_CENTRAL: CENTRAL_ROLES,
  AJUSTE_OBRA: OBRA_ROLES,
};

interface AuthedUser {
  id: number;
  nome: string;
  matricula: string;
  role: string;
  /** Organização dona dos dados que esta sessão enxerga. */
  organization_id: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthedUser;
      /** Acesso a dados já preso à organização da sessão. Ver withTenant. */
      db?: ScopedDb;
    }
  }
}

function authenticate(req: express.Request, res: express.Response, next: express.NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Token de acesso ausente.' });
  try {
    const payload = jwt.verify(token, JWT_SECRET as string) as AuthedUser;
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido ou expirado.' });
  }
}

/**
 * Prende o acesso a dados à organização da sessão.
 *
 * Vem depois de authenticate porque depende de req.user. A partir daqui, a
 * rota usa `req.db` e não precisa lembrar de filtrar por organização — nem
 * consegue esquecer, porque não tem outro caminho para o banco.
 */
function withTenant(req: express.Request, res: express.Response, next: express.NextFunction) {
  const organizationId = req.user?.organization_id;
  if (!organizationId) {
    // Token antigo, emitido antes da Fase 1b. Melhor exigir novo login do que
    // atender a requisição sem saber a que organização ela pertence.
    return res.status(401).json({ error: 'Sessão desatualizada. Entre novamente.' });
  }
  req.db = scopedDb(organizationId);
  next();
}

function requireRole(allowed: string[]) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!req.user || !allowed.includes(req.user.role)) {
      return res.status(403).json({ error: 'Você não tem permissão para executar esta ação.' });
    }
    next();
  };
}

async function verifyPassword(inputPassword: string, storedValue: string): Promise<boolean> {
  const looksHashed = /^\$2[aby]\$/.test(storedValue);
  if (looksHashed) {
    return bcrypt.compare(inputPassword, storedValue);
  }
  // Compatibilidade com o sistema principal (senha ainda em texto puro nesse cadastro).
  return inputPassword === storedValue;
}

/**
 * Origens autorizadas a chamar a API de outro domínio.
 *
 * O frontend é servido pela mesma origem da API (a Vercel reescreve /api/* para
 * a função), então em operação normal nenhuma origem externa é necessária:
 * requisição de mesma origem não passa por CORS. A lista existe para casos
 * pontuais — um painel separado, um ambiente de teste — via ALLOWED_ORIGINS.
 */
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

/** Monta o app Express com todas as rotas da API, sem iniciar nenhum servidor HTTP. */
export function createApp() {
  const app = express();

  // Atrás de um proxy (Vercel) o IP real vem em X-Forwarded-For. Mas confiar
  // nesse cabeçalho SEM proxy na frente é pior que não confiar em nada: o
  // cliente passa a escolher o próprio `req.ip` e burla o rate limit trocando
  // o header a cada requisição. Só liga onde existe proxy de verdade.
  if (process.env.VERCEL || process.env.TRUST_PROXY === 'true') {
    app.set('trust proxy', 1);
  }

  app.use(helmet({ contentSecurityPolicy: false }));

  app.use(
    cors({
      origin(origin, callback) {
        // Sem cabeçalho Origin: mesma origem, curl ou health check. Liberado.
        if (!origin) return callback(null, true);
        if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
        // Nega omitindo o cabeçalho CORS, em vez de estourar um erro 500.
        return callback(null, false);
      },
      credentials: false,
    }),
  );

  // Abaixo do padrão do body-parser (100kb). A maior carga real é a recontagem
  // dos 317 materiais, que dá 13KB — 64kb deixa folga de sobra.
  app.use(express.json({ limit: '64kb' }));

  /**
   * Tentativas de login por CONTA.
   *
   * Limitar só por IP tranca o escritório inteiro: a equipe do almoxarifado sai
   * por uma conexão só, então dez erros de digitação de uma pessoa deixariam
   * todas as outras de fora. Contando por conta, o erro de um não afeta ninguém.
   *
   * ATENÇÃO: o armazenamento é em memória. Em serverless cada instância tem a
   * própria contagem, então isso atrasa um ataque, mas não o impede em escala.
   * Proteção real exige armazenamento compartilhado (Redis ou tabela no banco).
   */
  const loginAccountLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skipSuccessfulRequests: true, // só conta tentativa que falhou
    // Roda depois do express.json(), então req.body já está disponível.
    keyGenerator: (req) =>
      String(req.body?.matricula ?? '')
        .trim()
        .toLowerCase()
        .slice(0, 120) || 'sem-identificador',
    message: { error: 'Muitas tentativas para esta conta. Aguarde 15 minutos e tente novamente.' },
  });

  /**
   * Teto por IP no login, folgado. Não serve para proteger uma conta — isso é
   * do limitador acima —, e sim para conter quem varre muitas contas a partir
   * de um mesmo lugar. 60 falhas em 15 minutos já é muito acima do uso normal
   * de um escritório inteiro.
   */
  const loginIpLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 60,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    message: { error: 'Muitas tentativas de login a partir desta rede. Aguarde alguns minutos.' },
  });

  /** Teto geral, folgado o bastante para uso normal e apertado para varredura. */
  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 600,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Muitas requisições. Aguarde alguns minutos.' },
  });

  app.use('/api/', apiLimiter);

  // --------------------------- AUTH ---------------------------
  app.post('/api/login', loginIpLimiter, loginAccountLimiter, async (req, res) => {
    try {
      const { matricula, senha } = req.body || {};
      if (typeof matricula !== 'string' || typeof senha !== 'string' || !matricula || !senha) {
        return res.status(400).json({ error: 'Informe matrícula e senha.' });
      }

      const identificador = matricula.trim();

      // O valor entra num filtro `.or()` do PostgREST, onde vírgula e parênteses
      // são estrutura da consulta, não dado. Sem esta checagem, uma matrícula
      // como `x,role.eq.CLIENTE` reescreveria a condição de busca.
      if (identificador.length > 120 || /[,()"]/.test(identificador)) {
        console.warn('[Login] identificador rejeitado por conter caracteres de filtro', {
          ip: req.ip,
          tamanho: identificador.length,
        });
        return res.status(401).json({ error: 'Credenciais inválidas.' });
      }

      // Acesso privilegiado de propósito: o login precisa encontrar a pessoa
      // ANTES de existir uma organização no contexto. Rotas de autenticação
      // usam service_role; rotas de dados usam scopedDb.
      const { data: userRow, error } = await supabaseServer
        .from(ESTOQUE_USERS)
        .select('*')
        .or(`matricula.eq.${identificador},email.eq.${identificador}`)
        // Sem filtro de CLIENTE: esta tabela só contém gente do estoque.
        // Contas desativadas não entram.
        .eq('ativo', true)
        .maybeSingle();

      if (error || !userRow) {
        // Nunca registrar o valor digitado: quando alguém erra o campo e digita
        // a senha aqui, nenhum usuário casa e o log guardaria a senha em claro.
        console.warn('[Login] falha: nenhuma conta para o identificador informado', {
          ip: req.ip,
          tamanho: identificador.length,
        });
        return res.status(401).json({ error: 'Credenciais inválidas.' });
      }

      const role = userRow.role || (String(userRow.matricula || '').startsWith('E') ? 'ALMOXARIFE_GERAL' : null);
      if (!role || !ALL_INVENTORY_ROLES.includes(role)) {
        return res.status(403).json({ error: 'Este usuário não tem acesso ao sistema de estoque.' });
      }

      const passwordOk = await verifyPassword(senha, userRow.senha);
      if (!passwordOk) {
        // Trilha para investigar tentativa de invasão; a senha nunca é registrada.
        console.warn('[Login] falha: senha incorreta', { matricula: userRow.matricula, ip: req.ip });
        return res.status(401).json({ error: 'Credenciais inválidas.' });
      }

      if (!userRow.organization_id) {
        // Conta sem organização não tem escopo de dados definido. Recusar é
        // melhor do que deixar entrar sem saber o que ela pode enxergar.
        console.error('[Login] conta sem organization_id', { matricula: userRow.matricula });
        return res.status(403).json({ error: 'Conta sem organização vinculada. Procure a gestão.' });
      }

      const authedUser: AuthedUser = {
        id: userRow.id,
        nome: userRow.nome,
        matricula: userRow.matricula,
        role,
        organization_id: userRow.organization_id,
      };

      // Aguardado de propósito: em serverless a função pode ser congelada assim
      // que a resposta sai, e uma escrita solta simplesmente não chegaria ao
      // banco. O try/catch garante que uma falha aqui não impeça o login — e
      // que uma rejeição não vire unhandled rejection derrubando o processo.
      try {
        const { error: acessoError } = await supabaseServer
          .from(ESTOQUE_USERS)
          .update({ ultimo_acesso: new Date().toISOString() })
          .eq('id', userRow.id);
        if (acessoError) console.warn('[Login] não foi possível gravar ultimo_acesso:', acessoError.message);
      } catch (acessoErr: any) {
        console.warn('[Login] não foi possível gravar ultimo_acesso:', acessoErr?.message);
      }

      // Converte a senha legada para bcrypt neste momento — o único em que o
      // servidor tem a senha correta em mãos.
      //
      // A conversão é feita aqui, e não na migração, de propósito: bcryptjs
      // gera E verifica o hash, então não existe risco de duas bibliotecas
      // discordarem sobre os mesmos bytes. Fazer isso em SQL com pgcrypto
      // funciona em UTF-8, mas uma divergência de encoding trancaria a pessoa
      // para fora, e a conferência da migração não teria como perceber.
      if (!/^\$2[aby]\$/.test(String(userRow.senha || ''))) {
        try {
          const hash = await bcrypt.hash(senha, 10);
          const { error: upgradeError } = await supabaseServer
            .from(ESTOQUE_USERS)
            .update({ senha: hash, senha_alterada_em: new Date().toISOString() })
            .eq('id', userRow.id);

          if (upgradeError) {
            console.warn('[Login] falha ao proteger senha legada:', upgradeError.message);
          } else {
            console.info('[Login] senha legada convertida para bcrypt', { matricula: userRow.matricula });
          }
        } catch (upgradeErr: any) {
          // O login não pode falhar por causa disto.
          console.warn('[Login] falha ao proteger senha legada:', upgradeErr?.message);
        }
      }

      const token = jwt.sign(authedUser, JWT_SECRET as string, { expiresIn: '12h' });
      res.json({ user: authedUser, token });
    } catch (err: any) {
      console.error('[Login] erro:', err.message);
      res.status(500).json({ error: 'Erro interno ao autenticar.' });
    }
  });

  app.get('/api/me', authenticate, (req, res) => {
    res.json({ user: req.user });
  });

  // --------------------------- DATA ---------------------------
  app.get('/api/data', authenticate, withTenant, requireRole(ALL_INVENTORY_ROLES), async (req, res) => {
    try {
      // Toda leitura desta rota já nasce presa à organização da sessão.
      const db = scopedDb(req.user!.organization_id);

      const [materialsRes, movements, staffRes, unidades, depositos, saldos] = await Promise.all([
        db.from('materials').select('*').order('nome', { ascending: true }),
        fetchAllRows(() =>
          db
            .from('material_movements')
            .select('*, materials(nome)')
            .order('created_at', { ascending: false })
            .order('id', { ascending: false }),
        ),
        // Sem filtro de CLIENTE: esta tabela só tem gente do estoque.
        req.db!.from(ESTOQUE_USERS).select('id, nome, matricula, role'),
        unidadesDaOrg(db),
        depositosDaOrg(db),
        saldosDaOrg(db),
      ]);

      if (materialsRes.error) throw materialsRes.error;

      // Cada material sai com o saldo por depósito ao lado das colunas antigas.
      // O front ainda lê as colunas; passa a ler `saldos` na próxima etapa.
      let divergentes = 0;
      const materials = (materialsRes.data || []).map((m: any) => {
        const porDeposito: SaldosPorDeposito = saldos.get(m.id) || {};
        // Os dois modelos têm que contar a mesma história. Se não contarem,
        // isso precisa aparecer no log ANTES de o front trocar de fonte —
        // depois, apareceria como número errado na tela de alguém.
        const totalColunas = arredondar(Number(m.saldo_central) + Number(m.saldo_obra));
        if (totalColunas !== totalDosDepositos(porDeposito)) divergentes++;
        return { ...m, saldos: porDeposito };
      });

      if (divergentes > 0) {
        console.warn(`[GET /api/data] ${divergentes} material(is) com saldo divergente entre colunas e depósitos.`);
      }

      res.json({
        materials,
        materialMovements: movements,
        staff: staffRes.data || [],
        unidades,
        depositos,
      });
    } catch (err: any) {
      console.error('[GET /api/data] erro:', err.message);
      res.status(500).json({ error: 'Erro ao carregar dados do estoque.' });
    }
  });

  // --------------------------- UNIDADES (admin) ---------------------------
  /**
   * Cria uma unidade com os dois depósitos que toda unidade tem, e uma linha
   * de saldo zero para cada material em cada um. Assim a unidade nova já
   * aparece em toda tela com "0", em vez de aparecer como ausência.
   *
   * Isto é o que o blueprint chamou de "criar Natal sem alterar código".
   */
  app.post('/api/units', authenticate, withTenant, requireRole(ADMIN_ROLES), async (req, res) => {
    try {
      const nome = String(req.body?.nome || '').trim();
      if (nome.length < 2 || nome.length > 60) {
        return res.status(400).json({ error: 'Informe o nome da unidade (2 a 60 caracteres).' });
      }

      const slug = nome
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '') // tira os acentos: 'São Gonçalo' -> 'sao-goncalo'
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      if (!slug) return res.status(400).json({ error: 'Nome inválido para unidade.' });

      const { data: unidade, error: unidadeErr } = await req.db!
        .from('units')
        .insert({ nome, slug })
        .select('id, nome, slug, ativo')
        .single();
      if (unidadeErr) {
        if (/duplicate|unique/i.test(unidadeErr.message)) {
          return res.status(409).json({ error: 'Já existe uma unidade com esse nome.' });
        }
        throw unidadeErr;
      }

      const { data: depositos, error: depErr } = await req.db!
        .from('warehouses')
        .insert([
          { unit_id: unidade.id, nome: 'Almoxarifado Central', tipo: 'CENTRAL' },
          { unit_id: unidade.id, nome: 'Almoxarifado de Obra', tipo: 'OBRA' },
        ])
        .select('id, nome, tipo, unit_id, ativo');
      if (depErr) throw depErr;

      // Saldo zero explícito em cada depósito novo, para cada material.
      const { data: materiais, error: matErr } = await req.db!.from('materials').select('id');
      if (matErr) throw matErr;
      const zeros = (materiais || []).flatMap((m: any) =>
        (depositos || []).map((d: any) => ({ material_id: m.id, warehouse_id: d.id, saldo: 0 })),
      );
      if (zeros.length > 0) {
        const { error: zErr } = await req.db!
          .from('stock_balances')
          .upsert(zeros, { onConflict: 'warehouse_id,material_id' });
        if (zErr) throw zErr;
      }

      console.info(`[POST /api/units] "${nome}" criada por ${req.user!.matricula} com ${depositos?.length} depósitos e ${zeros.length} saldos zerados.`);
      res.status(201).json({ unidade, depositos });
    } catch (err: any) {
      console.error('[POST /api/units] erro:', err.message);
      res.status(500).json({ error: 'Erro ao criar unidade.' });
    }
  });

  // --------------------------- MATERIALS CRUD (admin) ---------------------------
  app.post('/api/materials', authenticate, withTenant, requireRole(ADMIN_ROLES), async (req, res) => {
    try {
      const { nome, unidade_medida, qtd_volumes, fator_multiplicador, estoque_minimo, categoria, unit_id } = req.body || {};
      if (!nome || !unidade_medida || qtd_volumes == null || fator_multiplicador == null || estoque_minimo == null) {
        return res.status(400).json({ error: 'Preencha todos os campos obrigatórios.' });
      }

      const saldoInicial = arredondar(Number(qtd_volumes) * Number(fator_multiplicador));

      // O estoque inicial entra na Central da unidade informada. Resolver o
      // depósito ANTES de criar o material: se não houver Central, é melhor
      // não deixar material sem saldo em lugar nenhum.
      const depositos = await depositosDaOrg(req.db!);
      let central: Deposito, obra: Deposito;
      try {
        const daUnidade = depositosDaUnidade(depositos, unit_id);
        central = acharDeposito(daUnidade, 'CENTRAL');
        obra = acharDeposito(daUnidade, 'OBRA');
      } catch (e: any) {
        return res.status(409).json({ error: e.message });
      }

      const { data: material, error } = await req.db!
        .from('materials')
        .insert({
          nome,
          unidade_medida,
          qtd_volumes,
          fator_multiplicador,
          estoque_minimo,
          categoria: categoria || 'Outros',
          saldo_central: saldoInicial,
          saldo_obra: 0,
        })
        .select()
        .single();

      if (error) throw error;

      // Zero explícito na Obra: o saldo é sempre uma consulta, nunca uma
      // ausência a interpretar.
      const saldos: SaldosPorDeposito = { [central.id]: saldoInicial, [obra.id]: 0 };
      await gravarSaldos(req.db!, material.id, saldos, depositos);

      await req.db!.from('material_movements').insert({
        material_id: material.id,
        tipo_operacao: 'ENTRADA_CENTRAL',
        quantidade: saldoInicial,
        warehouse_destino_id: central.id,
        funcionario_matricula: req.user!.matricula,
        justificativa: 'Cadastro inicial de material',
      });

      res.status(201).json({ ...material, saldos });
    } catch (err: any) {
      console.error('[POST /api/materials] erro:', err.message);
      res.status(500).json({ error: 'Erro ao cadastrar material.' });
    }
  });

  app.put('/api/materials/:id', authenticate, withTenant, requireRole(ADMIN_ROLES), async (req, res) => {
    try {
      const { id } = req.params;
      const { nome, categoria, unidade_medida, estoque_minimo, fator_multiplicador } = req.body || {};

      const updates: Record<string, any> = { updated_at: new Date().toISOString() };
      if (nome !== undefined) updates.nome = nome;
      if (categoria !== undefined) updates.categoria = categoria;
      if (unidade_medida !== undefined) updates.unidade_medida = unidade_medida;
      if (estoque_minimo !== undefined) updates.estoque_minimo = estoque_minimo;
      if (fator_multiplicador !== undefined) updates.fator_multiplicador = fator_multiplicador;

      const { data, error } = await req.db!
        .from('materials')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      res.json(data);
    } catch (err: any) {
      console.error('[PUT /api/materials/:id] erro:', err.message);
      res.status(500).json({ error: 'Erro ao atualizar material.' });
    }
  });

  app.delete('/api/materials/:id', authenticate, withTenant, requireRole(ADMIN_ROLES), async (req, res) => {
    try {
      const { id } = req.params;

      const { data: material, error: fetchError } = await req.db!
        .from('materials')
        .select('*')
        .eq('id', id)
        .single();

      if (fetchError || !material) return res.status(404).json({ error: 'Material não encontrado.' });

      const { data: relatedMovements } = await req.db!
        .from('material_movements')
        .select('id, justificativa')
        .eq('material_id', id);

      for (const mov of relatedMovements || []) {
        await req.db!
          .from('material_movements')
          .update({ material_id: null, justificativa: `[${material.nome}] ${mov.justificativa || ''}`.trim() })
          .eq('id', mov.id);
      }

      // O registro guarda o total da empresa. Antes guardava só a Central, e um
      // material que existia só na Obra era excluído com "saldo era 0".
      const saldoTotal = totalDosDepositos(await saldosDoMaterial(req.db!, Number(id)));

      await req.db!.from('material_movements').insert({
        material_id: null,
        tipo_operacao: 'EXCLUSÃO',
        quantidade: saldoTotal,
        funcionario_matricula: req.user!.matricula,
        justificativa: `EXCLUSÃO DO MATERIAL: O material '${material.nome}' (Saldo em estoque era de ${saldoTotal} ${material.unidade_medida}) foi excluído do sistema permanentemente por ${req.user!.nome}.`,
      });

      const { error: deleteError } = await req.db!.from('materials').delete().eq('id', id);
      if (deleteError) throw deleteError;

      res.json({ success: true });
    } catch (err: any) {
      console.error('[DELETE /api/materials/:id] erro:', err.message);
      res.status(500).json({ error: 'Erro ao excluir material.' });
    }
  });

  // --------------------------- EDIÇÃO EM LOTE ---------------------------
  app.patch('/api/materials/bulk-minimo', authenticate, withTenant, requireRole(ADMIN_ROLES), async (req, res) => {
    try {
      const { ids, estoque_minimo } = req.body || {};
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: 'Selecione ao menos um material.' });
      }
      const minimo = Number(estoque_minimo);
      if (Number.isNaN(minimo) || minimo < 0) {
        return res.status(400).json({ error: 'Informe um estoque mínimo válido.' });
      }

      const { error } = await req.db!
        .from('materials')
        .update({ estoque_minimo: minimo, updated_at: new Date().toISOString() })
        .in('id', ids);

      if (error) throw error;
      res.json({ success: true, updated: ids.length });
    } catch (err: any) {
      console.error('[PATCH /api/materials/bulk-minimo] erro:', err.message);
      res.status(500).json({ error: 'Erro ao atualizar estoque mínimo em lote.' });
    }
  });

  // --------------------------- UNIFICAR MATERIAIS ---------------------------
  app.post('/api/materials/merge', authenticate, withTenant, requireRole(ADMIN_ROLES), async (req, res) => {
    try {
      const { targetId, sourceIds } = req.body || {};
      const sources: number[] = Array.isArray(sourceIds) ? sourceIds.filter((id) => id !== targetId) : [];
      if (!targetId || sources.length === 0) {
        return res.status(400).json({ error: 'Selecione um material principal e ao menos mais um para unificar.' });
      }

      const { data: allSelected, error: fetchError } = await req.db!
        .from('materials')
        .select('*')
        .in('id', [targetId, ...sources]);

      if (fetchError || !allSelected || allSelected.length !== sources.length + 1) {
        return res.status(404).json({ error: 'Um ou mais materiais selecionados não foram encontrados.' });
      }

      const target = allSelected.find((m: any) => m.id === targetId)!;
      const donors = allSelected.filter((m: any) => m.id !== targetId);

      const unidadesDiferentes = donors.some((d: any) => d.unidade_medida !== target.unidade_medida);
      if (unidadesDiferentes) {
        return res.status(400).json({
          error: `As unidades de medida não coincidem (${target.unidade_medida} vs. outras). Ajuste antes de unificar.`,
        });
      }

      // Soma depósito a depósito: o saldo de cada doador entra no mesmo
      // depósito do principal. Funciona igual com dois depósitos ou vinte.
      const depositos = await depositosDaOrg(req.db!);
      const saldosAlvo = await saldosDoMaterial(req.db!, targetId);
      const somaPorDeposito: SaldosPorDeposito = {};
      const totalDoDoador = new Map<number, number>();

      for (const donor of donors) {
        const saldosDoador = await saldosDoMaterial(req.db!, donor.id);
        totalDoDoador.set(donor.id, totalDosDepositos(saldosDoador));
        for (const [depositoId, saldo] of Object.entries(saldosDoador)) {
          somaPorDeposito[depositoId] = arredondar((somaPorDeposito[depositoId] ?? 0) + saldo);
        }
      }

      const novosSaldos: SaldosPorDeposito = { ...saldosAlvo };
      for (const [depositoId, soma] of Object.entries(somaPorDeposito)) {
        novosSaldos[depositoId] = arredondar((novosSaldos[depositoId] ?? 0) + soma);
      }
      await gravarSaldos(req.db!, targetId, novosSaldos, depositos);

      const somaTotal = totalDosDepositos(somaPorDeposito);
      const nomeDo = (id: string) => depositos.find((d) => d.id === id)?.nome ?? id;
      if (somaTotal !== 0) {
        const detalhe = Object.entries(somaPorDeposito)
          .filter(([, v]) => v !== 0)
          .map(([id, v]) => `${nomeDo(id)} +${v}`)
          .join(', ');
        await req.db!.from('material_movements').insert({
          material_id: targetId,
          tipo_operacao: 'UNIFICACAO',
          quantidade: somaTotal,
          funcionario_matricula: req.user!.matricula,
          justificativa: `Unificação: incorporou o saldo de ${donors.map((d: any) => `'${d.nome}'`).join(', ')} (${detalhe}).`,
        });
      }

      for (const donor of donors) {
        const { data: relatedMovements } = await req.db!
          .from('material_movements')
          .select('id, justificativa')
          .eq('material_id', donor.id);

        for (const mov of relatedMovements || []) {
          await req.db!
            .from('material_movements')
            .update({ material_id: null, justificativa: `[${donor.nome}] ${mov.justificativa || ''}`.trim() })
            .eq('id', mov.id);
        }

        await req.db!.from('material_movements').insert({
          material_id: null,
          tipo_operacao: 'EXCLUSÃO',
          quantidade: totalDoDoador.get(donor.id) ?? 0,
          funcionario_matricula: req.user!.matricula,
          justificativa: `UNIFICAÇÃO: o material '${donor.nome}' foi unificado com '${target.nome}' e removido do sistema por ${req.user!.nome}.`,
        });

        await req.db!.from('materials').delete().eq('id', donor.id);
      }

      res.json({ success: true, targetId, saldos: novosSaldos });
    } catch (err: any) {
      console.error('[POST /api/materials/merge] erro:', err.message);
      res.status(500).json({ error: 'Erro ao unificar materiais.' });
    }
  });

  // --------------------------- MOVEMENTS ---------------------------
  app.post('/api/materials/:id/movement', authenticate, withTenant, requireRole(ALL_INVENTORY_ROLES), async (req, res) => {
    try {
      const { id } = req.params;
      const { tipo_operacao, quantidade, justificativa, unit_id } = req.body || {};

      if (!tipo_operacao || quantidade == null || !justificativa) {
        return res.status(400).json({ error: 'Preencha operação, quantidade e justificativa.' });
      }

      const allowedRoles = OPERATION_ROLES[tipo_operacao];
      if (!allowedRoles) return res.status(400).json({ error: 'Operação inválida.' });
      if (!allowedRoles.includes(req.user!.role)) {
        return res.status(403).json({ error: 'Você não tem permissão para esta operação.' });
      }

      const { data: material, error: fetchError } = await req.db!
        .from('materials')
        .select('*')
        .eq('id', id)
        .single();

      if (fetchError || !material) return res.status(404).json({ error: 'Material não encontrado.' });

      const fluxo = FLUXO_DA_OPERACAO[tipo_operacao];
      if (!fluxo) return res.status(400).json({ error: 'Operação inválida.' });

      const q = Number(quantidade);
      const depositos = await depositosDaOrg(req.db!);
      const nomeDo = (depositoId: string) => depositos.find((d) => d.id === depositoId)?.nome ?? depositoId;

      // A operação diz "Central" ou "Obra"; a unidade diz de qual. Sem unidade
      // informada só funciona enquanto houver uma — depois disso recusa.
      let lados: { origem_id?: string; destino_id?: string };
      try {
        lados = depositosDoFluxo(fluxo, depositosDaUnidade(depositos, unit_id));
      } catch (e: any) {
        return res.status(409).json({ error: e.message });
      }

      const atuais = await saldosDoMaterial(req.db!, Number(id));
      const calculo = calcularMovimento(atuais, { ...lados, quantidade: q, ajuste: fluxo.ajuste, rotulo: fluxo.rotulo, nomeDe: nomeDo });
      if (!calculo.ok) return res.status(400).json({ error: calculo.erro });

      await gravarSaldos(req.db!, Number(id), calculo.novos, depositos);

      await req.db!.from('material_movements').insert({
        material_id: id,
        tipo_operacao,
        quantidade: q,
        warehouse_origem_id: lados.origem_id ?? null,
        warehouse_destino_id: lados.destino_id ?? null,
        funcionario_matricula: req.user!.matricula,
        justificativa,
      });

      // A regra de "precisa comprar" vive num lugar só, compartilhada com a
      // interface. Quando o servidor tinha a própria cópia, as duas podiam
      // divergir sem ninguém perceber — e é a divergência, não a regra, que
      // volta a produzir alarme falso.
      const central = depositos.find((d) => d.tipo === 'CENTRAL');
      const obra = depositos.find((d) => d.tipo === 'OBRA');
      const novoSaldoCentral = central ? calculo.novos[central.id] ?? 0 : 0;
      const novoSaldoObra = obra ? calculo.novos[obra.id] ?? 0 : 0;
      const saldoAtualizado = {
        saldo_central: novoSaldoCentral,
        saldo_obra: novoSaldoObra,
        estoque_minimo: material.estoque_minimo,
      };
      const saldoTotal = stockTotal(saldoAtualizado);
      const semEstoque = stockStatus(saldoAtualizado, 'empresa') === 'RUPTURA';

      if (needsPurchase(saldoAtualizado)) {
        try {
          const t = await getTransporter();
          if (t) {
            await t.sendMail({
              from: process.env.SMTP_FROM_EMAIL || 'noreply@ssimoveisbrasil.app',
              to: process.env.ADMIN_EMAIL || 'admin@ssimoveis.com',
              subject: `${semEstoque ? 'Sem estoque' : 'Estoque abaixo do mínimo'}: ${material.nome}`,
              html: `<p>O material <strong>${material.nome}</strong> ${
                semEstoque
                  ? 'está <strong>sem estoque</strong> nos dois almoxarifados.'
                  : 'está com o saldo total <strong>abaixo do estoque mínimo</strong>.'
              }</p>
                     <p>Saldo Central: ${novoSaldoCentral} ${material.unidade_medida}<br/>
                     Saldo Obra: ${novoSaldoObra} ${material.unidade_medida}<br/>
                     <strong>Total: ${saldoTotal} ${material.unidade_medida}</strong><br/>
                     Estoque Mínimo: ${material.estoque_minimo} ${material.unidade_medida}</p>
                     <p>Operação: ${tipo_operacao} | Quantidade: ${q} | Responsável: ${req.user!.nome}</p>`,
            });
          }
        } catch (mailErr: any) {
          console.error('[Alerta de Estoque] falha ao enviar e-mail:', mailErr.message);
        }
      }

      res.json({ success: true, material_id: id, novoSaldo: novoSaldoCentral, saldoObra: novoSaldoObra, saldos: calculo.novos });
    } catch (err: any) {
      console.error('[POST /api/materials/:id/movement] erro:', err.message);
      res.status(500).json({ error: 'Erro ao registrar movimentação.' });
    }
  });

  // --------------------------- RECONTAGEM (ajuste em lote) ---------------------------
  app.post('/api/materials/bulk-recount', authenticate, withTenant, requireRole(ALL_INVENTORY_ROLES), async (req, res) => {
    try {
      const { location, warehouse_id, unit_id, counts } = req.body || {};

      // O depósito vem pelo id, ou pelo tipo dentro de uma unidade. Os dois
      // caminhos acabam no mesmo lugar: um depósito concreto desta organização.
      const depositos = await depositosDaOrg(req.db!);
      let deposito: Deposito | undefined;
      if (warehouse_id) {
        deposito = depositos.find((d) => d.id === warehouse_id);
        if (!deposito) return res.status(404).json({ error: 'Depósito não encontrado.' });
      } else {
        if (location !== 'CENTRAL' && location !== 'OBRA') {
          return res.status(400).json({ error: 'Local inválido.' });
        }
        try {
          deposito = acharDeposito(depositosDaUnidade(depositos, unit_id), location);
        } catch (e: any) {
          return res.status(409).json({ error: e.message });
        }
      }

      // A permissão continua por tipo de depósito: quem cuida da Obra ajusta a
      // Obra. Depósito de outro tipo ainda não tem dono definido — bloqueia.
      const tipo_operacao = deposito.tipo === 'CENTRAL' ? 'AJUSTE_CENTRAL' : deposito.tipo === 'OBRA' ? 'AJUSTE_OBRA' : null;
      if (!tipo_operacao || !OPERATION_ROLES[tipo_operacao].includes(req.user!.role)) {
        return res.status(403).json({ error: 'Você não tem permissão para ajustar este estoque.' });
      }
      if (!Array.isArray(counts) || counts.length === 0) {
        return res.status(400).json({ error: 'Nenhuma contagem enviada.' });
      }

      const applied: { material_id: number; nome: string; diferenca: number }[] = [];
      const criticalItems: { nome: string; novoSaldo: number; estoque_minimo: number }[] = [];

      for (const entry of counts) {
        const materialId = entry?.material_id;
        const contagem = arredondar(Number(entry?.contagem));
        if (materialId == null || Number.isNaN(contagem)) continue;
        if (contagem < 0) continue;

        const { data: material } = await req.db!.from('materials').select('id, nome, estoque_minimo').eq('id', materialId).single();
        if (!material) continue;

        const atuais = await saldosDoMaterial(req.db!, Number(materialId));
        const saldoAtual = atuais[deposito.id] ?? 0;
        const diferenca = arredondar(contagem - saldoAtual);
        if (diferenca === 0) continue;

        // Recontagem não é um delta: é "o físico diz que tem X". Grava X.
        const novos: SaldosPorDeposito = { ...atuais, [deposito.id]: contagem };
        try {
          await gravarSaldos(req.db!, Number(materialId), novos, depositos);
        } catch (e: any) {
          console.error(`[bulk-recount] material ${materialId}:`, e.message);
          continue;
        }

        await req.db!.from('material_movements').insert({
          material_id: materialId,
          tipo_operacao,
          quantidade: diferenca,
          warehouse_destino_id: deposito.id,
          funcionario_matricula: req.user!.matricula,
          justificativa: `Recontagem diária: sistema indicava ${saldoAtual}, contagem física apontou ${contagem}.`,
        });

        applied.push({ material_id: materialId, nome: material.nome, diferenca });

        if (contagem <= material.estoque_minimo) {
          criticalItems.push({ nome: material.nome, novoSaldo: contagem, estoque_minimo: material.estoque_minimo });
        }
      }

      if (criticalItems.length > 0) {
        try {
          const t = await getTransporter();
          if (t) {
            await t.sendMail({
              from: process.env.SMTP_FROM_EMAIL || 'noreply@ssimoveisbrasil.app',
              to: process.env.ADMIN_EMAIL || 'admin@ssimoveis.com',
              subject: `Recontagem (${deposito.nome}): ${criticalItems.length} item(ns) em estoque crítico`,
              html: `<p>Após a recontagem de ${req.user!.nome}, os itens abaixo ficaram em nível crítico:</p>
                     <ul>${criticalItems.map((i) => `<li>${i.nome}: ${i.novoSaldo} (mínimo ${i.estoque_minimo})</li>`).join('')}</ul>`,
            });
          }
        } catch (mailErr: any) {
          console.error('[Alerta de Recontagem] falha ao enviar e-mail:', mailErr.message);
        }
      }

      res.json({ success: true, applied });
    } catch (err: any) {
      console.error('[POST /api/materials/bulk-recount] erro:', err.message);
      res.status(500).json({ error: 'Erro ao salvar recontagem.' });
    }
  });

  // --------------------------- SUPORTE ---------------------------
  // Almoxarifes abrem chamados sobre materiais (duplicados, nome/informação
  // errados). A gestão revisa e resolve. Quem não é admin só enxerga o que abriu.

  /**
   * As tabelas de suporte vêm da migração 001. Enquanto ela não roda, o
   * PostgREST responde 42P01/PGRST205 — traduzimos isso num aviso claro em vez
   * de um "erro interno" genérico.
   */
  const MISSING_TABLE_CODES = ['42P01', 'PGRST205'];
  function isMissingSupportTable(err: any): boolean {
    return MISSING_TABLE_CODES.includes(err?.code) || /support_tickets/.test(err?.message || '');
  }
  const SETUP_ERROR = 'O módulo de suporte ainda não foi instalado no banco. Rode a migração migrations/001_suporte_e_seguranca.sql no Supabase.';

  const TICKET_TYPES = ['DUPLICADO', 'NOME_INCORRETO', 'INFO_INCORRETA', 'FALTA_CADASTRO', 'OUTRO'];
  const TICKET_STATUSES = ['ABERTO', 'EM_ANALISE', 'RESOLVIDO', 'RECUSADO'];
  const TICKET_PRIORITIES = ['BAIXA', 'NORMAL', 'ALTA'];

  // Recebe o acessor com escopo em vez de alcançar o banco por conta própria:
  // é o que garante que um helper não escape do isolamento da rota.
  async function loadTickets(db: ScopedDb, onlyMatricula?: string) {
    let query = db
      .from('support_tickets')
      .select('*, materiais:support_ticket_materials(id, material_id, material_nome)')
      .order('created_at', { ascending: false });
    if (onlyMatricula) query = query.eq('autor_matricula', onlyMatricula);
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  app.get('/api/support', authenticate, withTenant, requireRole(ALL_INVENTORY_ROLES), async (req, res) => {
    try {
      const isAdmin = ADMIN_ROLES.includes(req.user!.role);
      res.json({ tickets: await loadTickets(req.db!, isAdmin ? undefined : req.user!.matricula) });
    } catch (err: any) {
      if (isMissingSupportTable(err)) return res.status(503).json({ error: SETUP_ERROR, setup_required: true });
      console.error('[GET /api/support] erro:', err.message);
      res.status(500).json({ error: 'Erro ao carregar chamados de suporte.' });
    }
  });

  app.get('/api/support/:id/comments', authenticate, withTenant, requireRole(ALL_INVENTORY_ROLES), async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { data: ticket } = await req.db!.from('support_tickets').select('autor_matricula').eq('id', id).maybeSingle();
      if (!ticket) return res.status(404).json({ error: 'Chamado não encontrado.' });
      if (!ADMIN_ROLES.includes(req.user!.role) && ticket.autor_matricula !== req.user!.matricula) {
        return res.status(403).json({ error: 'Você não tem acesso a este chamado.' });
      }

      const { data, error } = await req.db!
        .from('support_ticket_comments')
        .select('*')
        .eq('ticket_id', id)
        .order('created_at', { ascending: true });
      if (error) throw error;
      res.json({ comments: data || [] });
    } catch (err: any) {
      console.error('[GET /api/support/:id/comments] erro:', err.message);
      res.status(500).json({ error: 'Erro ao carregar mensagens do chamado.' });
    }
  });

  app.post('/api/support', authenticate, withTenant, requireRole(ALL_INVENTORY_ROLES), async (req, res) => {
    try {
      const { tipo, assunto, descricao, prioridade, material_ids } = req.body || {};

      if (!TICKET_TYPES.includes(tipo)) return res.status(400).json({ error: 'Tipo de chamado inválido.' });
      if (!assunto || String(assunto).trim().length < 3) return res.status(400).json({ error: 'Descreva o assunto em pelo menos 3 caracteres.' });
      if (!descricao || String(descricao).trim().length < 5) return res.status(400).json({ error: 'Descreva o problema em pelo menos 5 caracteres.' });
      if (prioridade && !TICKET_PRIORITIES.includes(prioridade)) return res.status(400).json({ error: 'Prioridade inválida.' });

      const ids: number[] = Array.isArray(material_ids) ? [...new Set(material_ids.map(Number))].filter(Boolean) : [];
      // Duplicado só faz sentido comparando pelo menos dois materiais.
      if (tipo === 'DUPLICADO' && ids.length < 2) {
        return res.status(400).json({ error: 'Para relatar duplicidade, selecione pelo menos dois materiais.' });
      }
      if (tipo !== 'OUTRO' && tipo !== 'FALTA_CADASTRO' && ids.length === 0) {
        return res.status(400).json({ error: 'Selecione ao menos um material.' });
      }

      const { data: ticket, error } = await req.db!
        .from('support_tickets')
        .insert({
          tipo,
          assunto: String(assunto).trim(),
          descricao: String(descricao).trim(),
          prioridade: prioridade || 'NORMAL',
          autor_matricula: req.user!.matricula,
          autor_nome: req.user!.nome,
          autor_role: req.user!.role,
        })
        .select()
        .single();
      if (error) throw error;

      if (ids.length > 0) {
        const { data: mats } = await req.db!.from('materials').select('id, nome').in('id', ids);
        const rows = (mats || []).map((m: any) => ({
          ticket_id: ticket.id,
          material_id: m.id,
          material_nome: m.nome, // snapshot: sobrevive a exclusão/unificação
        }));
        if (rows.length > 0) await req.db!.from('support_ticket_materials').insert(rows);
      }

      res.status(201).json({ ticket });
    } catch (err: any) {
      if (isMissingSupportTable(err)) return res.status(503).json({ error: SETUP_ERROR, setup_required: true });
      console.error('[POST /api/support] erro:', err.message);
      res.status(500).json({ error: 'Erro ao abrir chamado.' });
    }
  });

  app.post('/api/support/:id/comments', authenticate, withTenant, requireRole(ALL_INVENTORY_ROLES), async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { mensagem } = req.body || {};
      if (!mensagem || String(mensagem).trim().length === 0) {
        return res.status(400).json({ error: 'Escreva uma mensagem.' });
      }

      const { data: ticket } = await req.db!.from('support_tickets').select('autor_matricula').eq('id', id).maybeSingle();
      if (!ticket) return res.status(404).json({ error: 'Chamado não encontrado.' });
      if (!ADMIN_ROLES.includes(req.user!.role) && ticket.autor_matricula !== req.user!.matricula) {
        return res.status(403).json({ error: 'Você não tem acesso a este chamado.' });
      }

      const { data, error } = await req.db!
        .from('support_ticket_comments')
        .insert({
          ticket_id: id,
          autor_matricula: req.user!.matricula,
          autor_nome: req.user!.nome,
          mensagem: String(mensagem).trim(),
        })
        .select()
        .single();
      if (error) throw error;

      // Responder reabre um chamado já encerrado — a conversa continua viva.
      await req.db!.from('support_tickets').update({ status: 'EM_ANALISE' }).eq('id', id).in('status', ['RESOLVIDO', 'RECUSADO']);

      res.status(201).json({ comment: data });
    } catch (err: any) {
      console.error('[POST /api/support/:id/comments] erro:', err.message);
      res.status(500).json({ error: 'Erro ao enviar mensagem.' });
    }
  });

  app.patch('/api/support/:id', authenticate, withTenant, requireRole(ADMIN_ROLES), async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { status, prioridade, resolucao } = req.body || {};

      const patch: Record<string, any> = {};
      if (status !== undefined) {
        if (!TICKET_STATUSES.includes(status)) return res.status(400).json({ error: 'Status inválido.' });
        patch.status = status;
        if (status === 'RESOLVIDO' || status === 'RECUSADO') {
          patch.resolved_at = new Date().toISOString();
          patch.resolvido_por = req.user!.nome;
        } else {
          patch.resolved_at = null;
          patch.resolvido_por = null;
        }
      }
      if (prioridade !== undefined) {
        if (!TICKET_PRIORITIES.includes(prioridade)) return res.status(400).json({ error: 'Prioridade inválida.' });
        patch.prioridade = prioridade;
      }
      if (resolucao !== undefined) patch.resolucao = resolucao ? String(resolucao).trim() : null;

      if (Object.keys(patch).length === 0) return res.status(400).json({ error: 'Nada para atualizar.' });

      const { data, error } = await req.db!.from('support_tickets').update(patch).eq('id', id).select().single();
      if (error) throw error;
      res.json({ ticket: data });
    } catch (err: any) {
      console.error('[PATCH /api/support/:id] erro:', err.message);
      res.status(500).json({ error: 'Erro ao atualizar chamado.' });
    }
  });

  // --------------------------- USUÁRIOS (admin) ---------------------------
  // A tabela `users` é compartilhada com o CRM. Este gerenciador só enxerga e
  // altera perfis de estoque — nunca CLIENTE nem os papéis do CRM.

  const MANAGEABLE_ROLES = ALL_INVENTORY_ROLES;
  const MIN_PASSWORD_LENGTH = 8;
  const USER_COLUMNS = 'id, nome, email, matricula, role, created_at';

  function assertManageable(role: string | null | undefined): boolean {
    return !!role && MANAGEABLE_ROLES.includes(role);
  }

  app.get('/api/users', authenticate, withTenant, requireRole(ADMIN_ROLES), async (req, res) => {
    try {
      const { data, error } = await req.db!
        .from(ESTOQUE_USERS)
        .select(`${USER_COLUMNS}, senha`)
        .in('role', MANAGEABLE_ROLES)
        .order('nome', { ascending: true });
      if (error) throw error;

      // A senha nunca sai daqui — só o indicador de que ainda está em texto puro.
      const users = (data || []).map(({ senha, ...u }: any) => ({
        ...u,
        senha_em_texto_puro: !/^\$2[aby]\$/.test(String(senha || '')),
      }));
      res.json({ users });
    } catch (err: any) {
      console.error('[GET /api/users] erro:', err.message);
      res.status(500).json({ error: 'Erro ao carregar usuários.' });
    }
  });

  app.post('/api/users', authenticate, withTenant, requireRole(ADMIN_ROLES), async (req, res) => {
    try {
      const { nome, matricula, email, role, senha } = req.body || {};
      if (!nome || !matricula || !senha) return res.status(400).json({ error: 'Informe nome, matrícula e senha.' });
      if (!assertManageable(role)) return res.status(400).json({ error: 'Perfil inválido para o sistema de estoque.' });
      if (String(senha).length < MIN_PASSWORD_LENGTH) {
        return res.status(400).json({ error: `A senha deve ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.` });
      }

      const { data: existing } = await req.db!.from(ESTOQUE_USERS).select('id').eq('matricula', matricula).maybeSingle();
      if (existing) return res.status(409).json({ error: 'Já existe um usuário com esta matrícula.' });

      const { data, error } = await req.db!
        .from(ESTOQUE_USERS)
        .insert({
          nome: String(nome).trim(),
          matricula: String(matricula).trim(),
          email: email ? String(email).trim() : null,
          role,
          senha: await bcrypt.hash(String(senha), 10),
        })
        .select(USER_COLUMNS)
        .single();
      if (error) throw error;

      res.status(201).json({ user: data });
    } catch (err: any) {
      console.error('[POST /api/users] erro:', err.message);
      res.status(500).json({ error: 'Erro ao criar usuário.' });
    }
  });

  app.patch('/api/users/:id', authenticate, withTenant, requireRole(ADMIN_ROLES), async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { nome, email, role, senha } = req.body || {};

      const { data: target } = await req.db!.from(ESTOQUE_USERS).select('id, role, matricula').eq('id', id).maybeSingle();
      if (!target) return res.status(404).json({ error: 'Usuário não encontrado.' });
      if (!assertManageable(target.role)) {
        return res.status(403).json({ error: 'Este usuário pertence a outro sistema e não pode ser editado aqui.' });
      }

      const patch: Record<string, any> = {};
      if (nome !== undefined) patch.nome = String(nome).trim();
      if (email !== undefined) patch.email = email ? String(email).trim() : null;
      if (role !== undefined) {
        if (!assertManageable(role)) return res.status(400).json({ error: 'Perfil inválido para o sistema de estoque.' });
        // Sem isso, o último admin pode se rebaixar e trancar todo mundo para fora.
        if (target.id === req.user!.id && !ADMIN_ROLES.includes(role)) {
          return res.status(400).json({ error: 'Você não pode remover o seu próprio acesso de administrador.' });
        }
        patch.role = role;
      }
      if (senha) {
        if (String(senha).length < MIN_PASSWORD_LENGTH) {
          return res.status(400).json({ error: `A senha deve ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.` });
        }
        patch.senha = await bcrypt.hash(String(senha), 10);
      }

      if (Object.keys(patch).length === 0) return res.status(400).json({ error: 'Nada para atualizar.' });

      const { data, error } = await req.db!.from(ESTOQUE_USERS).update(patch).eq('id', id).select(USER_COLUMNS).single();
      if (error) throw error;
      res.json({ user: data });
    } catch (err: any) {
      console.error('[PATCH /api/users/:id] erro:', err.message);
      res.status(500).json({ error: 'Erro ao atualizar usuário.' });
    }
  });

  app.delete('/api/users/:id', authenticate, withTenant, requireRole(ADMIN_ROLES), async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (id === req.user!.id) return res.status(400).json({ error: 'Você não pode excluir a própria conta.' });

      const { data: target } = await req.db!.from(ESTOQUE_USERS).select('id, role').eq('id', id).maybeSingle();
      if (!target) return res.status(404).json({ error: 'Usuário não encontrado.' });
      if (!assertManageable(target.role)) {
        return res.status(403).json({ error: 'Este usuário pertence a outro sistema e não pode ser excluído aqui.' });
      }

      // Não deixa o sistema ficar sem administrador.
      if (ADMIN_ROLES.includes(target.role)) {
        const { count } = await req.db!
          .from(ESTOQUE_USERS)
          .select('id', { count: 'exact', head: true })
          .in('role', ADMIN_ROLES);
        if ((count ?? 0) <= 1) return res.status(400).json({ error: 'Este é o último administrador — não é possível excluí-lo.' });
      }

      const { error } = await req.db!.from(ESTOQUE_USERS).delete().eq('id', id);
      if (error) throw error;
      res.json({ success: true });
    } catch (err: any) {
      console.error('[DELETE /api/users/:id] erro:', err.message);
      res.status(500).json({ error: 'Erro ao excluir usuário.' });
    }
  });

  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  return app;
}
