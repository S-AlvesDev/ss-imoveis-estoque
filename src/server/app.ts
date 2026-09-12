import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import nodemailer from 'nodemailer';
import { supabaseServer } from '../lib/supabaseServer';
import { ADMIN_ROLES, ALL_INVENTORY_ROLES, ASSIGNABLE_ROLES } from '../shared/constants';
// Mesma regra de saldo que a interface usa — fonte única da verdade.
import { needsPurchase, stockStatus, stockTotal } from '../features/estoque/utils';
import { scopedDb, type ScopedDb } from './tenant';
import { validarPedidoDemo, ehRobo, emailDoPedido } from './demo';
import { validarRetirada, prazoEm } from './emprestimos';
import { validarEntrega, validoAte } from './entregas';
import { alocarSaida, descreverConsumos, validarLote, type LoteBase, type Consumo } from './lotes';
import { validarItem, validarEvento, transicionar } from './patrimonio';
import { contaDaOrg, negarRecurso, negarLimite } from './planos';
import { planoLibera, ehPlano, CICLOS, PLANOS, precoDo, AVALIACAO_DIAS, type PlanoEfetivo, type Conta, type Ciclo } from '../shared/planos';
import { mpConfigurado, assinaturaDoWebhookValida, idDoEvento, tipoDoEvento, buscarAssinatura, modoTeste, mpPlanId, diagnostico } from './mercadopago';
import { contaDe, assinaturaAtual, pagamentosDe, iniciarAssinatura, cancelarAssinatura, aplicarPreapproval, procurarEAplicar, tratarEvento, registrarEvento, ErroDeAssinatura } from './assinaturas';
import { configuracaoSmtp, remetente, destinatarioAdmin, destinatarioDemo } from './mail';
import {
  gerarToken,
  hashDoToken,
  tokenPlausivel,
  tokenValido,
  validarNovaSenha,
  linkDeRedefinicao,
  emailDeRecuperacao,
  emailDeBoasVindas,
  emailDeNovaEmpresa,
  VALIDADE_DO_TOKEN_MS,
} from './senha';
import {
  calcularMovimento,
  depositosDaUnidade,
  acharDeposito,
  depositosDaOrg,
  validarEstoque,
  OPERACOES,
  ehOperacaoGenerica,
  operacaoPermitida,
  unidadesDaOrg,
  saldosDaOrg,
  saldosDoMaterial,
  gravarSaldos,
  totalDosDepositos,
  arredondar,
  type Deposito,
  type SaldosPorDeposito,
} from './estoque';
import { acessosDoUsuario, podeVer, podeOperar, podeExecutar, type Acessos } from './acessos';

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
  if (transporter) return transporter;
  const config = configuracaoSmtp();
  if (!config) return null; // sem SMTP configurado: o sistema segue sem e-mail
  transporter = nodemailer.createTransport(config);
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
      /** Depósitos que a pessoa pode ver/operar. `null` = administrador. Ver withAcessos. */
      acessos?: Acessos;
      /** O plano em vigor da organização da sessão (ou avaliação). Ver withTenant. */
      plano?: PlanoEfetivo;
      /** A situação da conta: assinada, avaliação, carência ou bloqueada. Ver withTenant. */
      conta?: Conta;
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
async function withTenant(req: express.Request, res: express.Response, next: express.NextFunction) {
  const organizationId = req.user?.organization_id;
  if (!organizationId) {
    // Token antigo, emitido antes da Fase 1b. Melhor exigir novo login do que
    // atender a requisição sem saber a que organização ela pertence.
    return res.status(401).json({ error: 'Sessão desatualizada. Entre novamente.' });
  }
  req.db = scopedDb(organizationId);
  // A conta vem junto: é ela que diz o que esta organização pode. Cache de
  // um minuto, então não custa uma leitura por requisição.
  try {
    req.conta = await contaDaOrg(organizationId);
    req.plano = req.conta.plano;
  } catch (err: any) {
    console.error('[withTenant] conta:', err.message);
    return res.status(500).json({ error: 'Erro ao carregar a organização.' });
  }
  // Conta bloqueada (avaliação terminou, ou cartão recusado além da carência)
  // só consegue falar com as rotas de assinatura — o caminho para voltar.
  if (req.conta.situacao === 'bloqueada' && !req.path.startsWith('/api/assinatura')) {
    return res.status(402).json({
      error: ehPlano(req.conta.plano) || req.conta.ate ? 'Sua conta está bloqueada. Assine um plano para continuar.' : 'Sua conta está bloqueada.',
      bloqueada: true,
      conta: req.conta,
    });
  }
  next();
}

/**
 * Carrega o que a pessoa pode ver e operar, por depósito. Depois de withTenant.
 * Administrador não consulta nada: `null` significa "tudo".
 */
async function withAcessos(req: express.Request, res: express.Response, next: express.NextFunction) {
  try {
    req.acessos = await acessosDoUsuario(req.db!, req.user!.id, req.user!.role);
    next();
  } catch (err: any) {
    console.error('[withAcessos] erro:', err.message);
    res.status(500).json({ error: 'Erro ao carregar permissões.' });
  }
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
      // Matrícula é única DENTRO de cada organização, não entre elas: "001"
      // pode existir na São Severino e numa empresa que se cadastrou ontem. Por
      // isso não dá para pegar "a" conta — pega-se as candidatas e a senha
      // decide. E-mail, ao contrário, é único no sistema inteiro.
      const { data: candidatas, error } = await supabaseServer
        .from(ESTOQUE_USERS)
        .select('*')
        .or(`matricula.eq.${identificador},email.eq.${identificador.toLowerCase()}`)
        // Contas desativadas não entram.
        .eq('ativo', true)
        .limit(10);

      if (error || !candidatas || candidatas.length === 0) {
        // Nunca registrar o valor digitado: quando alguém erra o campo e digita
        // a senha aqui, nenhum usuário casa e o log guardaria a senha em claro.
        console.warn('[Login] falha: nenhuma conta para o identificador informado', {
          ip: req.ip,
          tamanho: identificador.length,
        });
        return res.status(401).json({ error: 'Credenciais inválidas.' });
      }

      // A senha escolhe entre as candidatas. Comparar com todas custa um
      // bcrypt a mais por homônimo — e homônimo entre organizações é raro.
      const validas: any[] = [];
      for (const c of candidatas) {
        if (await verifyPassword(senha, c.senha)) validas.push(c);
      }

      if (validas.length === 0) {
        // Trilha para investigar tentativa de invasão; a senha nunca é registrada.
        console.warn('[Login] falha: senha incorreta', { candidatas: candidatas.length, ip: req.ip });
        return res.status(401).json({ error: 'Credenciais inválidas.' });
      }
      if (validas.length > 1) {
        // Mesma matrícula e mesma senha em duas organizações. Não dá para
        // saber qual é; deixar entrar em uma seria chutar o escopo dos dados.
        console.error('[Login] ambíguo: mesma credencial em mais de uma organização', { ip: req.ip });
        return res.status(401).json({ error: 'Credenciais ambíguas. Entre com o seu e-mail.' });
      }
      const userRow = validas[0];

      const role = userRow.role || (String(userRow.matricula || '').startsWith('E') ? 'OPERADOR' : null);
      if (!role || !ALL_INVENTORY_ROLES.includes(role)) {
        return res.status(403).json({ error: 'Este usuário não tem acesso ao sistema de estoque.' });
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

  // --------------------------- CRIAR CONTA (público) ---------------------------
  /**
   * Uma empresa nova entra sozinha: organização, primeira unidade, os dois
   * depósitos dela e o responsável como administrador — tudo numa função do
   * banco (migração 014), que faz ou tudo ou nada.
   *
   * É a única rota pública que cria dados. Por isso: limite apertado por IP,
   * validação antes de qualquer custo, senha protegida aqui (bcrypt) e nunca
   * enviada em claro ao banco, e a função confere tudo de novo por dentro.
   */
  const signupLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 5,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Muitas contas criadas a partir desta rede. Tente novamente em uma hora.' },
  });

  app.post('/api/signup', signupLimiter, async (req, res) => {
    try {
      const empresa = String(req.body?.empresa ?? '').trim();
      const nome = String(req.body?.nome ?? '').trim();
      const email = String(req.body?.email ?? '').trim().toLowerCase();
      const senha = String(req.body?.senha ?? '');

      if (empresa.length < 2 || empresa.length > 60) return res.status(400).json({ error: 'Informe o nome da empresa (2 a 60 caracteres).' });
      if (nome.length < 2 || nome.length > 80) return res.status(400).json({ error: 'Informe o seu nome (2 a 80 caracteres).' });
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 120) return res.status(400).json({ error: 'Informe um e-mail válido.' });
      if (senha.length < MIN_PASSWORD_LENGTH) return res.status(400).json({ error: `A senha deve ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.` });
      if (senha.length > 200) return res.status(400).json({ error: 'Senha longa demais.' });

      const hash = await bcrypt.hash(senha, 10);

      // Chave de serviço de propósito: ainda não existe organização no contexto.
      const { data, error } = await supabaseServer.rpc('criar_organizacao', {
        p_empresa: empresa,
        p_nome: nome,
        p_email: email,
        p_senha_hash: hash,
      });

      if (error) {
        // A função devolve mensagens pensadas para a pessoa; só as de negócio
        // passam. Erro de infraestrutura vira 500 genérico.
        if (/Já existe uma conta/.test(error.message)) return res.status(409).json({ error: 'Já existe uma conta com este e-mail. Entre com ela, ou use outro e-mail.' });
        if (error.code === '23514' || /caracteres|inválido/.test(error.message)) return res.status(400).json({ error: error.message });
        throw error;
      }

      const criado = Array.isArray(data) ? data[0] : data;
      if (!criado?.organization_id || !criado?.user_id) throw new Error('criar_organizacao não devolveu ids.');

      // Já entra logado: ninguém cria uma conta para ver uma tela de login.
      const authedUser: AuthedUser = {
        id: Number(criado.user_id),
        nome,
        matricula: 'ADMIN',
        role: 'ADMINISTRADOR',
        organization_id: criado.organization_id,
      };
      const token = jwt.sign(authedUser, JWT_SECRET as string, { expiresIn: '12h' });

      console.info('[Signup] organização criada', { slug: criado.slug, ip: req.ip });

      // Boas-vindas para quem criou e um aviso para o comercial. Aguardado
      // (serverless congela a função ao responder) e à prova de falha: a
      // conta já existe, e-mail nenhum pode desfazê-la.
      try {
        const t = await getTransporter();
        if (t) {
          const boasVindas = emailDeBoasVindas(nome, empresa);
          const aviso = emailDeNovaEmpresa({ empresa, nome, email, slug: criado.slug, ip: req.ip });
          await Promise.allSettled([
            t.sendMail({ from: remetente(), to: email, ...boasVindas }),
            t.sendMail({ from: remetente(), to: destinatarioDemo(), replyTo: email, ...aviso }),
          ]).then((r) => r.forEach((x) => x.status === 'rejected' && console.error('[Signup] falha ao enviar e-mail:', x.reason?.message)));
        }
      } catch (mailErr: any) {
        console.error('[Signup] falha ao enviar e-mail:', mailErr.message);
      }

      res.status(201).json({ user: authedUser, token, organizacao: { slug: criado.slug, nome: empresa } });
    } catch (err: any) {
      console.error('[POST /api/signup] erro:', err.message);
      res.status(500).json({ error: 'Não foi possível criar a conta agora. Tente novamente em instantes.' });
    }
  });

  // --------------------------- ESQUECI MINHA SENHA (público) ---------------------------
  /**
   * Quem tem e-mail na conta pede um link, o link vale uma hora e uma vez.
   * A resposta é a mesma exista a conta ou não — ninguém descobre por aqui
   * quais e-mails estão cadastrados. Quem entra por matrícula sem e-mail
   * continua com o administrador (Usuários → trocar senha).
   *
   * Dois limites: por IP (varredura) e por e-mail (encher a caixa de alguém).
   */
  const esqueciIpLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Muitos pedidos a partir desta rede. Tente novamente em uma hora.' },
  });
  const esqueciEmailLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 3,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (req) => String(req.body?.email ?? '').trim().toLowerCase().slice(0, 120) || 'sem-email',
    message: { error: 'Já enviamos instruções para este e-mail há pouco. Confira a caixa de entrada e o spam.' },
  });

  app.post('/api/senha/esqueci', esqueciIpLimiter, esqueciEmailLimiter, async (req, res) => {
    const resposta = { ok: true, mensagem: 'Se existir uma conta com este e-mail, enviamos as instruções. Confira também o spam.' };
    try {
      const email = String(req.body?.email ?? '').trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 120) return res.status(400).json({ error: 'Informe um e-mail válido.' });

      // Sem SMTP não há como entregar o link. Dizer isso é melhor do que
      // prometer um e-mail que nunca vai chegar.
      const t = await getTransporter();
      if (!t) {
        console.error('[Senha] pedido de recuperação sem SMTP configurado');
        return res.status(503).json({ error: 'A recuperação por e-mail está indisponível no momento. Fale com o administrador da sua empresa ou pelo WhatsApp.' });
      }

      // ilike, e não eq: contas antigas podem ter o e-mail com maiúsculas.
      // % e _ escapados para não virarem curinga.
      const padrao = email.replace(/[\\%_]/g, '\\$&');
      const { data: usuario, error } = await supabaseServer
        .from(ESTOQUE_USERS)
        .select('id, nome, email')
        .ilike('email', padrao)
        .eq('ativo', true)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!usuario?.email) return res.json(resposta);

      const { token, hash } = gerarToken();
      const { error: erroInsert } = await supabaseServer.from('password_resets').insert({
        user_id: usuario.id,
        token_hash: hash,
        expires_at: new Date(Date.now() + VALIDADE_DO_TOKEN_MS).toISOString(),
      });
      if (erroInsert) throw erroInsert;

      const { subject, html } = emailDeRecuperacao(usuario.nome, linkDeRedefinicao(token));
      await t.sendMail({ from: remetente(), to: usuario.email, subject, html });

      console.info('[Senha] link de recuperação enviado', { user_id: usuario.id, ip: req.ip });
      res.json(resposta);
    } catch (err: any) {
      console.error('[POST /api/senha/esqueci] erro:', err.message);
      res.status(500).json({ error: 'Não foi possível enviar agora. Tente novamente em instantes.' });
    }
  });

  const redefinirLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Muitas tentativas. Aguarde alguns minutos.' },
  });

  app.post('/api/senha/redefinir', redefinirLimiter, async (req, res) => {
    try {
      const { token, senha } = req.body || {};
      const erroSenha = validarNovaSenha(senha);
      if (erroSenha) return res.status(400).json({ error: erroSenha });
      if (!tokenPlausivel(token)) return res.status(400).json({ error: 'Este link não é válido. Peça um novo em "Esqueci minha senha".' });

      const { data: pedido, error } = await supabaseServer
        .from('password_resets')
        .select('id, user_id, expires_at, used_at')
        .eq('token_hash', hashDoToken(token))
        .maybeSingle();
      if (error) throw error;
      if (!pedido || !tokenValido(pedido)) {
        return res.status(400).json({ error: 'Este link expirou ou já foi usado. Peça um novo em "Esqueci minha senha".' });
      }

      const hash = await bcrypt.hash(senha, 10);
      const { data: usuario, error: erroUpdate } = await supabaseServer
        .from(ESTOQUE_USERS)
        .update({ senha: hash, senha_alterada_em: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', pedido.user_id)
        .eq('ativo', true)
        .select('id, nome, matricula, role, organization_id')
        .maybeSingle();
      if (erroUpdate) throw erroUpdate;
      if (!usuario) return res.status(400).json({ error: 'Esta conta não está mais ativa. Procure o administrador.' });

      // Queima este link e qualquer outro pendente da mesma pessoa.
      await supabaseServer.from('password_resets').update({ used_at: new Date().toISOString() }).eq('user_id', pedido.user_id).is('used_at', null);

      // Já entra: quem acabou de criar a senha não precisa digitá-la de novo.
      if (!usuario.role || !ALL_INVENTORY_ROLES.includes(usuario.role) || !usuario.organization_id) {
        return res.json({ ok: true });
      }
      const authedUser: AuthedUser = {
        id: usuario.id,
        nome: usuario.nome,
        matricula: usuario.matricula,
        role: usuario.role,
        organization_id: usuario.organization_id,
      };
      const jwtToken = jwt.sign(authedUser, JWT_SECRET as string, { expiresIn: '12h' });

      console.info('[Senha] senha redefinida', { user_id: usuario.id, ip: req.ip });
      res.json({ ok: true, user: authedUser, token: jwtToken });
    } catch (err: any) {
      console.error('[POST /api/senha/redefinir] erro:', err.message);
      res.status(500).json({ error: 'Não foi possível redefinir agora. Tente novamente em instantes.' });
    }
  });

  // --------------------------- DEMONSTRAÇÃO (público) ---------------------------
  /**
   * O formulário da Home. Grava em demo_requests (migração 016) e avisa por
   * e-mail; se o e-mail falhar, o pedido já está no banco e a pessoa não
   * fica sabendo de nada. Limite apertado por IP: ninguém pede cinco
   * demonstrações numa hora.
   */
  const demoLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 5,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Muitos pedidos a partir desta rede. Tente novamente em uma hora.' },
  });

  app.post('/api/demo', demoLimiter, async (req, res) => {
    try {
      // Robô caiu na armadilha: finge que deu certo e não grava nada.
      if (ehRobo(req.body)) return res.status(201).json({ ok: true });

      const validado = validarPedidoDemo(req.body);
      if (!validado.ok) return res.status(400).json({ error: validado.erro });
      const pedido = validado.pedido;

      const { error } = await supabaseServer.from('demo_requests').insert(pedido);
      if (error) throw error;

      try {
        const t = await getTransporter();
        if (t) {
          const { subject, html } = emailDoPedido(pedido);
          await t.sendMail({
            from: remetente(),
            to: destinatarioDemo(),
            replyTo: pedido.email,
            subject,
            html,
          });
        }
      } catch (mailErr: any) {
        // O pedido está salvo; o e-mail é conveniência.
        console.error('[Demo] falha ao enviar e-mail:', mailErr.message);
      }

      console.info('[Demo] pedido recebido', { empresa: pedido.empresa, origem: pedido.origem, ip: req.ip });
      res.status(201).json({ ok: true });
    } catch (err: any) {
      console.error('[POST /api/demo] erro:', err.message);
      res.status(500).json({ error: 'Não foi possível enviar o pedido agora. Tente novamente em instantes.' });
    }
  });

  app.get('/api/me', authenticate, (req, res) => {
    res.json({ user: req.user });
  });

  // --------------------------- DATA ---------------------------
  app.get('/api/data', authenticate, withTenant, requireRole(ALL_INVENTORY_ROLES), withAcessos, async (req, res) => {
    try {
      // Toda leitura desta rota já nasce presa à organização da sessão.
      const db = scopedDb(req.user!.organization_id);

      const [materialsRes, movements, staffRes, unidades, depositos, saldos, orgRes, categoriasRes, emprestimosRes, lotesRes, itensRes] = await Promise.all([
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
        depositosDaOrg(db, { incluirUnidadesInativas: true }),
        saldosDaOrg(db),
        db.from('organizations').select('id, nome, slug, cor_primaria, logo_url, plano, plano_ate, avaliacao_ate').eq('id', req.user!.organization_id).single(),
        db.from('categories').select('id, nome, ordem').order('ordem', { ascending: true }).order('nome', { ascending: true }),
        // Só o que está na rua: pendentes/atrasados dos estoques de empréstimo e entregas abertas dos de EPI.
        db.from('loans').select('*, materials(nome, unidade_medida)').is('devolvido_em', null).is('encerrado_em', null).order('prazo_em', { ascending: true }),
        // Lotes com saldo dos estoques de validade, e os itens dos estoques de patrimônio.
        db.from('lots').select('*, materials(nome, unidade_medida)').gt('quantidade', 0).order('validade', { ascending: true, nullsFirst: false }),
        db.from('assets').select('*, materials(nome)').order('codigo', { ascending: true }),
      ]);

      if (materialsRes.error) throw materialsRes.error;
      if (categoriasRes.error) throw categoriasRes.error;
      if (emprestimosRes.error) throw emprestimosRes.error;
      if (lotesRes.error) throw lotesRes.error;
      if (itensRes.error) throw itensRes.error;

      // Quem não é admin só recebe os depósitos que pode ver — e as unidades
      // que têm algum deles. O saldo dos outros não sai do servidor.
      const acessos = req.acessos ?? null;
      const depositosVisiveis = depositos.filter((d) => podeVer(acessos, d.id));
      const unidadesComAcesso = new Set(depositosVisiveis.map((d) => d.unit_id));
      // Admin vê todas as unidades, inclusive uma que ainda não tem estoque —
      // é nela que o primeiro acesso cria o primeiro. Operador só vê as que
      // têm algum estoque dele.
      const unidadesVisiveis = acessos === null ? unidades : unidades.filter((u) => unidadesComAcesso.has(u.id));
      const visivel = new Set(depositosVisiveis.map((d) => d.id));

      // Cada material sai com o saldo por depósito: { [depositoId]: saldo }.
      // O front deriva daí a visão da unidade escolhida.
      const materials = (materialsRes.data || []).map((m: any) => {
        const todos: SaldosPorDeposito = saldos.get(m.id) || {};
        const porDeposito: SaldosPorDeposito = acessos === null
          ? todos
          : Object.fromEntries(Object.entries(todos).filter(([id]) => visivel.has(id)));
        return { ...m, saldos: porDeposito };
      });

      const emprestimos = (emprestimosRes.data || [])
        .filter((e: any) => visivel.has(e.warehouse_id))
        .map(({ materials: mat, ...e }: any) => ({ ...e, material_nome: mat?.nome ?? 'Material removido', unidade_medida: mat?.unidade_medida ?? '' }));

      const lotes = (lotesRes.data || [])
        .filter((l: any) => visivel.has(l.warehouse_id))
        .map(({ materials: mat, ...l }: any) => ({ ...l, material_nome: mat?.nome ?? 'Material removido', unidade_medida: mat?.unidade_medida ?? '' }));
      const itens = (itensRes.data || [])
        .filter((i: any) => visivel.has(i.warehouse_id))
        .map(({ materials: mat, ...i }: any) => ({ ...i, material_nome: mat?.nome ?? 'Modelo removido' }));

      res.json({
        materials,
        materialMovements: movements,
        staff: staffRes.data || [],
        unidades: unidadesVisiveis,
        depositos: depositosVisiveis,
        categorias: categoriasRes.data || [],
        emprestimos,
        lotes,
        itens,
        // O que ESTA pessoa pode fazer, para o front montar o menu. Admin: null.
        acessos: acessos === null ? null : [...acessos.entries()].map(([warehouse_id, nivel]) => ({ warehouse_id, nivel })),
        // Nome, cor e logo — a identidade que as telas vestem por dentro — e o plano em vigor.
        organizacao: orgRes.data ? { ...orgRes.data, plano_efetivo: req.plano, conta: req.conta } : null,
      });
    } catch (err: any) {
      console.error('[GET /api/data] erro:', err.message);
      res.status(500).json({ error: 'Erro ao carregar dados do estoque.' });
    }
  });


  // --------------------------- IDENTIDADE DA ORGANIZAÇÃO (admin) ---------------------------
  const LOGO_MAX_BYTES = 5 * 1024 * 1024;
  const LOGO_TIPOS: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
  };
  const COR_HEX = /^#[0-9a-fA-F]{6}$/;

  /** Caminho do arquivo no bucket a partir da URL pública, ou null se não for nossa. */
  function caminhoDoLogo(logoUrl: string | null | undefined): string | null {
    if (!logoUrl) return null;
    const m = logoUrl.match(/\/object\/public\/logos\/([^?]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  }

  /** Nome e cor. O logo tem fluxo próprio, porque o arquivo não passa por aqui. */
  app.patch('/api/organization', authenticate, withTenant, requireRole(ADMIN_ROLES), async (req, res) => {
    try {
      const patch: Record<string, any> = {};
      if (req.body?.nome !== undefined) {
        const nome = String(req.body.nome).trim();
        if (nome.length < 2 || nome.length > 60) return res.status(400).json({ error: 'Nome deve ter de 2 a 60 caracteres.' });
        patch.nome = nome;
      }
      if (req.body?.cor_primaria !== undefined) {
        const negada = negarRecurso(req.plano!, 'identidade-visual');
        if (negada) return res.status(negada.status).json(negada.body);
        const cor = req.body.cor_primaria === null ? null : String(req.body.cor_primaria).trim().toLowerCase();
        if (cor !== null && !COR_HEX.test(cor)) return res.status(400).json({ error: 'Cor inválida. Use o formato #rrggbb.' });
        patch.cor_primaria = cor;
      }
      if (Object.keys(patch).length === 0) return res.status(400).json({ error: 'Nada para alterar.' });

      const { data, error } = await req.db!.from('organizations').update(patch)
        .eq('id', req.user!.organization_id).select('id, nome, slug, cor_primaria, logo_url, plano, plano_ate').single();
      if (error || !data) throw error ?? new Error('organização não encontrada');
      res.json({ organizacao: { ...data, plano_efetivo: req.plano, conta: req.conta } });
    } catch (err: any) {
      console.error('[PATCH /api/organization] erro:', err.message);
      res.status(500).json({ error: 'Erro ao atualizar a organização.' });
    }
  });

  /**
   * Passo 1 do logo: o servidor autoriza um envio. O arquivo em si vai do
   * navegador direto ao Storage — a Vercel corta requisições em 4,5 MB, e o
   * limite do logo é 5 MB. A URL assinada vale para UM caminho, dentro da
   * pasta desta organização, e expira.
   */
  app.post('/api/organization/logo-upload-url', authenticate, withTenant, requireRole(ADMIN_ROLES), async (req, res) => {
    try {
      const negada = negarRecurso(req.plano!, 'identidade-visual');
      if (negada) return res.status(negada.status).json(negada.body);
      const tipo = String(req.body?.content_type ?? '');
      const tamanho = Number(req.body?.size ?? 0);
      const ext = LOGO_TIPOS[tipo];
      if (!ext) return res.status(400).json({ error: 'Use PNG, JPG, WebP ou SVG.' });
      if (!Number.isFinite(tamanho) || tamanho <= 0) return res.status(400).json({ error: 'Arquivo vazio.' });
      if (tamanho > LOGO_MAX_BYTES) return res.status(400).json({ error: 'O logo pode ter no máximo 5 MB.' });

      const caminho = `${req.user!.organization_id}/logo-${Date.now()}.${ext}`;
      const { data, error } = await supabaseServer.storage.from('logos').createSignedUploadUrl(caminho);
      if (error || !data) throw error ?? new Error('sem URL assinada');

      res.json({ signedUrl: data.signedUrl, token: data.token, path: caminho });
    } catch (err: any) {
      console.error('[POST /api/organization/logo-upload-url] erro:', err.message);
      res.status(500).json({ error: 'Erro ao preparar o envio do logo.' });
    }
  });

  /**
   * Passo 2: o navegador avisa que enviou. O servidor confere que o arquivo
   * existe (não confia num caminho vindo de fora), grava a URL pública e
   * apaga o logo anterior.
   */
  app.post('/api/organization/logo', authenticate, withTenant, requireRole(ADMIN_ROLES), async (req, res) => {
    try {
      const negada = negarRecurso(req.plano!, 'identidade-visual');
      if (negada) return res.status(negada.status).json(negada.body);
      const caminho = String(req.body?.path ?? '');
      const pasta = req.user!.organization_id + '/';
      if (!caminho.startsWith(pasta) || caminho.includes('..')) return res.status(400).json({ error: 'Caminho inválido.' });

      const nomeArquivo = caminho.slice(pasta.length);
      const { data: lista, error: lErr } = await supabaseServer.storage.from('logos').list(req.user!.organization_id, { search: nomeArquivo });
      if (lErr) throw lErr;
      if (!lista?.some((f) => f.name === nomeArquivo)) return res.status(404).json({ error: 'Arquivo não encontrado no Storage. Envie de novo.' });

      const { data: atual } = await req.db!.from('organizations').select('logo_url').eq('id', req.user!.organization_id).single();
      const anterior = caminhoDoLogo(atual?.logo_url);

      const publicUrl = supabaseServer.storage.from('logos').getPublicUrl(caminho).data.publicUrl;
      const { data, error } = await req.db!.from('organizations').update({ logo_url: publicUrl })
        .eq('id', req.user!.organization_id).select('id, nome, slug, cor_primaria, logo_url, plano, plano_ate').single();
      if (error || !data) throw error ?? new Error('organização não encontrada');

      if (anterior && anterior !== caminho) {
        const { error: rErr } = await supabaseServer.storage.from('logos').remove([anterior]);
        if (rErr) console.warn('[logo] não apagou o anterior:', rErr.message);
      }

      res.json({ organizacao: { ...data, plano_efetivo: req.plano, conta: req.conta } });
    } catch (err: any) {
      console.error('[POST /api/organization/logo] erro:', err.message);
      res.status(500).json({ error: 'Erro ao salvar o logo.' });
    }
  });

  app.delete('/api/organization/logo', authenticate, withTenant, requireRole(ADMIN_ROLES), async (req, res) => {
    try {
      const { data: atual } = await req.db!.from('organizations').select('logo_url').eq('id', req.user!.organization_id).single();
      const caminho = caminhoDoLogo(atual?.logo_url);
      const { data, error } = await req.db!.from('organizations').update({ logo_url: null })
        .eq('id', req.user!.organization_id).select('id, nome, slug, cor_primaria, logo_url, plano, plano_ate').single();
      if (error || !data) throw error ?? new Error('organização não encontrada');
      if (caminho) {
        const { error: rErr } = await supabaseServer.storage.from('logos').remove([caminho]);
        if (rErr) console.warn('[logo] não apagou o arquivo:', rErr.message);
      }
      res.json({ organizacao: { ...data, plano_efetivo: req.plano, conta: req.conta } });
    } catch (err: any) {
      console.error('[DELETE /api/organization/logo] erro:', err.message);
      res.status(500).json({ error: 'Erro ao remover o logo.' });
    }
  });

  // --------------------------- UNIDADES (admin) ---------------------------
  /**
   * Cria uma unidade com os dois depósitos que toda unidade tem. Nasce SEM
   * material: um material existe numa unidade quando o admin o coloca lá
   * (POST /api/units/:id/materials). Uma filial nova não trabalha com o
   * catálogo inteiro da matriz, e listar 300 itens zerados esconderia os que
   * ela de fato tem.
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

      // O plano diz quantas unidades ativas cabem.
      const { count: ativas } = await req.db!.from('units').select('*', { count: 'exact', head: true }).eq('ativo', true);
      const negada = negarLimite(req.plano!, 'unidades', ativas ?? 0);
      if (negada) return res.status(negada.status).json(negada.body);

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

      // O primeiro estoque vem junto, se quem criou já disse qual é. Sem ele a
      // unidade nasce vazia e a tela de Configurações pede para criar um.
      let depositos: Deposito[] = [];
      if (req.body?.estoque) {
        const v = validarEstoque(req.body.estoque);
        if (!v.ok) return res.status(400).json({ error: v.erro });
        const { data: dep, error: depErr } = await req.db!
          .from('warehouses')
          .insert({ unit_id: unidade.id, nome: v.nome, tipo: 'OUTRO', modo: v.modo, prazo_padrao_horas: v.prazo_padrao_horas, operacoes_permitidas: v.operacoes_permitidas, exige_assinatura: v.exige_assinatura, dias_aviso_validade: v.dias_aviso_validade })
          .select('id, nome, tipo, unit_id, ativo, modo, prazo_padrao_horas, operacoes_permitidas, exige_assinatura, dias_aviso_validade')
          .single();
        if (depErr) throw depErr;
        depositos = [dep as Deposito];
      }

      console.info(`[POST /api/units] "${nome}" criada por ${req.user!.matricula} com ${depositos.length} estoque(s).`);
      res.status(201).json({ unidade, depositos });
    } catch (err: any) {
      console.error('[POST /api/units] erro:', err.message);
      res.status(500).json({ error: 'Erro ao criar unidade.' });
    }
  });

  /** Renomeia ou desativa uma unidade. Desativar não apaga nada: some do seletor. */
  app.patch('/api/units/:id', authenticate, withTenant, requireRole(ADMIN_ROLES), async (req, res) => {
    try {
      const patch: Record<string, any> = {};
      if (req.body?.nome !== undefined) {
        const nome = String(req.body.nome).trim();
        if (nome.length < 2 || nome.length > 60) return res.status(400).json({ error: 'Nome deve ter de 2 a 60 caracteres.' });
        patch.nome = nome;
      }
      if (req.body?.ativo !== undefined) patch.ativo = Boolean(req.body.ativo);
      if (Object.keys(patch).length === 0) return res.status(400).json({ error: 'Nada para alterar.' });

      if (patch.ativo === false) {
        // A última unidade ativa não pode ser desativada: sem unidade não há
        // onde operar, e a tela ficaria sem "Central" nem "Obra" para mostrar.
        const { count } = await req.db!.from('units').select('*', { count: 'exact', head: true }).eq('ativo', true);
        if ((count ?? 0) <= 1) return res.status(409).json({ error: 'Não dá para desativar a única unidade ativa.' });
      }
      if (patch.ativo === true) {
        // Reativar também conta no limite do plano.
        const { count } = await req.db!.from('units').select('*', { count: 'exact', head: true }).eq('ativo', true).neq('id', req.params.id);
        const negada = negarLimite(req.plano!, 'unidades', count ?? 0);
        if (negada) return res.status(negada.status).json(negada.body);
      }

      const { data, error } = await req.db!.from('units').update(patch).eq('id', req.params.id).select('id, nome, slug, ativo').single();
      if (error || !data) return res.status(404).json({ error: 'Unidade não encontrada.' });
      res.json({ unidade: data });
    } catch (err: any) {
      console.error('[PATCH /api/units/:id] erro:', err.message);
      res.status(500).json({ error: 'Erro ao atualizar unidade.' });
    }
  });

  /**
   * Edita um estoque: nome, modo, prazo padrão, ativo. Mudar o modo com
   * retirada pendente é recusado — a devolução precisa de um lugar para
   * acontecer. Desativar não apaga saldo nem histórico: some do menu.
   */
  app.patch('/api/warehouses/:id', authenticate, withTenant, requireRole(ADMIN_ROLES), async (req, res) => {
    try {
      const { data: atual, error: erroAtual } = await req.db!
        .from('warehouses')
        .select('id, nome, tipo, unit_id, ativo, modo, prazo_padrao_horas, operacoes_permitidas, exige_assinatura, dias_aviso_validade')
        .eq('id', req.params.id)
        .maybeSingle();
      if (erroAtual) throw erroAtual;
      if (!atual) return res.status(404).json({ error: 'Estoque não encontrado.' });

      // O que não veio no corpo continua como está; a validação vê o estoque inteiro.
      const v = validarEstoque({
        nome: req.body?.nome ?? atual.nome,
        modo: req.body?.modo ?? atual.modo,
        prazo_padrao_horas: req.body?.prazo_padrao_horas ?? atual.prazo_padrao_horas ?? undefined,
        operacoes_permitidas: req.body?.operacoes_permitidas ?? atual.operacoes_permitidas ?? undefined,
        exige_assinatura: req.body?.exige_assinatura ?? atual.exige_assinatura,
        dias_aviso_validade: req.body?.dias_aviso_validade ?? atual.dias_aviso_validade,
      });
      if (!v.ok) return res.status(400).json({ error: v.erro });

      const patch: Record<string, any> = { nome: v.nome, modo: v.modo, prazo_padrao_horas: v.prazo_padrao_horas, operacoes_permitidas: v.operacoes_permitidas, exige_assinatura: v.exige_assinatura, dias_aviso_validade: v.dias_aviso_validade };
      if (req.body?.ativo !== undefined) patch.ativo = Boolean(req.body.ativo);

      if (patch.ativo === true && !atual.ativo) {
        // Reativar também conta no limite do plano.
        const { count } = await req.db!.from('warehouses').select('*', { count: 'exact', head: true }).eq('unit_id', atual.unit_id).eq('ativo', true);
        const negada = negarLimite(req.plano!, 'depositosPorUnidade', count ?? 0);
        if (negada) return res.status(negada.status).json(negada.body);
      }

      if (v.modo !== atual.modo || patch.ativo === false) {
        // Retirada na rua, entrega em mãos, lote com saldo ou item não baixado: nada disso pode ficar órfão.
        const [{ count: abertos }, { count: lotes }, { count: itens }] = await Promise.all([
          req.db!.from('loans').select('*', { count: 'exact', head: true }).eq('warehouse_id', atual.id).is('devolvido_em', null).is('encerrado_em', null),
          req.db!.from('lots').select('*', { count: 'exact', head: true }).eq('warehouse_id', atual.id).gt('quantidade', 0),
          req.db!.from('assets').select('*', { count: 'exact', head: true }).eq('warehouse_id', atual.id).neq('estado', 'baixado'),
        ]);
        if ((abertos ?? 0) > 0) return res.status(409).json({ error: `Há ${abertos} retirada(s)/entrega(s) em aberto neste estoque. Encerre-as antes de mudar o modo ou desativar.` });
        if ((lotes ?? 0) > 0) return res.status(409).json({ error: `Há ${lotes} lote(s) com saldo neste estoque. Zere-os antes de mudar o modo ou desativar.` });
        if ((itens ?? 0) > 0) return res.status(409).json({ error: `Há ${itens} item(ns) de patrimônio ativos neste estoque. Dê baixa antes de mudar o modo ou desativar.` });
      }

      const { data, error } = await req.db!
        .from('warehouses')
        .update(patch)
        .eq('id', atual.id)
        .select('id, nome, tipo, unit_id, ativo, modo, prazo_padrao_horas, operacoes_permitidas, exige_assinatura, dias_aviso_validade')
        .single();
      if (error) {
        if (/duplicate|unique/i.test(error.message)) return res.status(409).json({ error: 'Já existe um estoque com esse nome nesta unidade.' });
        throw error;
      }
      res.json({ deposito: data });
    } catch (err: any) {
      console.error('[PATCH /api/warehouses/:id] erro:', err.message);
      res.status(500).json({ error: 'Erro ao atualizar estoque.' });
    }
  });

  /**
   * Cria um estoque numa unidade. Os materiais que a unidade já trabalha
   * ganham linha de saldo zero nele — o estoque novo nasce vendo o catálogo
   * da unidade, não vazio.
   */
  app.post('/api/units/:id/estoques', authenticate, withTenant, requireRole(ADMIN_ROLES), async (req, res) => {
    try {
      const v = validarEstoque(req.body);
      if (!v.ok) return res.status(400).json({ error: v.erro });

      const { data: unidade } = await req.db!.from('units').select('id, ativo').eq('id', req.params.id).maybeSingle();
      if (!unidade) return res.status(404).json({ error: 'Unidade não encontrada.' });

      // O plano diz quantos estoques ativos cabem por unidade.
      const { count: ativos } = await req.db!.from('warehouses').select('*', { count: 'exact', head: true }).eq('unit_id', unidade.id).eq('ativo', true);
      const negada = negarLimite(req.plano!, 'depositosPorUnidade', ativos ?? 0);
      if (negada) return res.status(negada.status).json(negada.body);

      const { data: dep, error } = await req.db!
        .from('warehouses')
        .insert({ unit_id: unidade.id, nome: v.nome, tipo: 'OUTRO', modo: v.modo, prazo_padrao_horas: v.prazo_padrao_horas, operacoes_permitidas: v.operacoes_permitidas, exige_assinatura: v.exige_assinatura, dias_aviso_validade: v.dias_aviso_validade })
        .select('id, nome, tipo, unit_id, ativo, modo, prazo_padrao_horas, operacoes_permitidas, exige_assinatura, dias_aviso_validade')
        .single();
      if (error) {
        if (/duplicate|unique/i.test(error.message)) return res.status(409).json({ error: 'Já existe um estoque com esse nome nesta unidade.' });
        throw error;
      }

      // Materiais que já estão na unidade (têm saldo em algum estoque dela).
      const { data: outros } = await req.db!.from('warehouses').select('id').eq('unit_id', unidade.id).neq('id', dep.id);
      const idsOutros = (outros || []).map((d: any) => d.id as string);
      let adicionados = 0;
      if (idsOutros.length > 0) {
        const { data: linhas } = await req.db!.from('stock_balances').select('material_id').in('warehouse_id', idsOutros);
        const materiais = [...new Set((linhas || []).map((l: any) => l.material_id as number))];
        if (materiais.length > 0) {
          const { error: erroSaldos } = await req.db!
            .from('stock_balances')
            .upsert(materiais.map((material_id) => ({ material_id, warehouse_id: dep.id, saldo: 0 })), { onConflict: 'warehouse_id,material_id', ignoreDuplicates: true });
          if (erroSaldos) throw erroSaldos;
          adicionados = materiais.length;
        }
      }

      console.info(`[POST /api/units/:id/estoques] "${v.nome}" (${v.modo}) criado por ${req.user!.matricula}; ${adicionados} materiais herdados.`);
      res.status(201).json({ deposito: dep, materiais: adicionados });
    } catch (err: any) {
      console.error('[POST /api/units/:id/estoques] erro:', err.message);
      res.status(500).json({ error: 'Erro ao criar estoque.' });
    }
  });

  // --------------------------- CATEGORIAS (admin) ---------------------------
  /**
   * Categorias são cadastro da organização. Renomear uma renomeia nos
   * materiais; apagar só é possível se nenhum material a usa — ou movendo
   * os materiais para outra, quando o corpo diz para qual.
   */
  app.post('/api/categorias', authenticate, withTenant, requireRole(ADMIN_ROLES), async (req, res) => {
    try {
      const nome = String(req.body?.nome ?? '').trim();
      if (nome.length < 1 || nome.length > 60) return res.status(400).json({ error: 'Informe o nome da categoria (até 60 caracteres).' });
      const { data: ultima } = await req.db!.from('categories').select('ordem').order('ordem', { ascending: false }).limit(1).maybeSingle();
      const { data, error } = await req.db!
        .from('categories')
        .insert({ nome, ordem: (ultima?.ordem ?? 0) + 1 })
        .select('id, nome, ordem')
        .single();
      if (error) {
        if (/duplicate|unique/i.test(error.message)) return res.status(409).json({ error: 'Já existe uma categoria com esse nome.' });
        throw error;
      }
      res.status(201).json({ categoria: data });
    } catch (err: any) {
      console.error('[POST /api/categorias] erro:', err.message);
      res.status(500).json({ error: 'Erro ao criar categoria.' });
    }
  });

  app.patch('/api/categorias/:id', authenticate, withTenant, requireRole(ADMIN_ROLES), async (req, res) => {
    try {
      const { data: atual } = await req.db!.from('categories').select('id, nome, ordem').eq('id', req.params.id).maybeSingle();
      if (!atual) return res.status(404).json({ error: 'Categoria não encontrada.' });

      const patch: Record<string, any> = {};
      if (req.body?.nome !== undefined) {
        const nome = String(req.body.nome).trim();
        if (nome.length < 1 || nome.length > 60) return res.status(400).json({ error: 'Informe o nome da categoria (até 60 caracteres).' });
        patch.nome = nome;
      }
      if (req.body?.ordem !== undefined) {
        const ordem = Number(req.body.ordem);
        if (!Number.isInteger(ordem)) return res.status(400).json({ error: 'Ordem inválida.' });
        patch.ordem = ordem;
      }
      if (Object.keys(patch).length === 0) return res.status(400).json({ error: 'Nada para alterar.' });

      const { data, error } = await req.db!.from('categories').update(patch).eq('id', atual.id).select('id, nome, ordem').single();
      if (error) {
        if (/duplicate|unique/i.test(error.message)) return res.status(409).json({ error: 'Já existe uma categoria com esse nome.' });
        throw error;
      }
      // Os materiais guardam o nome; renomear a categoria os acompanha.
      if (patch.nome && patch.nome !== atual.nome) {
        const { error: erroMat } = await req.db!.from('materials').update({ categoria: patch.nome }).eq('categoria', atual.nome);
        if (erroMat) throw erroMat;
      }
      res.json({ categoria: data });
    } catch (err: any) {
      console.error('[PATCH /api/categorias/:id] erro:', err.message);
      res.status(500).json({ error: 'Erro ao atualizar categoria.' });
    }
  });

  app.delete('/api/categorias/:id', authenticate, withTenant, requireRole(ADMIN_ROLES), async (req, res) => {
    try {
      const { data: atual } = await req.db!.from('categories').select('id, nome').eq('id', req.params.id).maybeSingle();
      if (!atual) return res.status(404).json({ error: 'Categoria não encontrada.' });

      const { count: total } = await req.db!.from('categories').select('*', { count: 'exact', head: true });
      if ((total ?? 0) <= 1) return res.status(409).json({ error: 'A organização precisa ter pelo menos uma categoria.' });

      const { count: emUso } = await req.db!.from('materials').select('*', { count: 'exact', head: true }).eq('categoria', atual.nome);
      if ((emUso ?? 0) > 0) {
        // Só apaga movendo os materiais para outra categoria, dita pelo corpo.
        const destinoId = String(req.body?.mover_para ?? '');
        const { data: destino } = destinoId ? await req.db!.from('categories').select('id, nome').eq('id', destinoId).maybeSingle() : { data: null };
        if (!destino || destino.id === atual.id) {
          return res.status(409).json({ error: `${emUso} material(is) usam esta categoria. Escolha para qual categoria movê-los.`, em_uso: emUso });
        }
        const { error: erroMat } = await req.db!.from('materials').update({ categoria: destino.nome }).eq('categoria', atual.nome);
        if (erroMat) throw erroMat;
      }

      const { error } = await req.db!.from('categories').delete().eq('id', atual.id);
      if (error) throw error;
      res.json({ ok: true, movidos: emUso ?? 0 });
    } catch (err: any) {
      console.error('[DELETE /api/categorias/:id] erro:', err.message);
      res.status(500).json({ error: 'Erro ao remover categoria.' });
    }
  });

  /**
   * Coloca materiais numa unidade: cria a linha de saldo zero em cada depósito
   * dela. Idempotente — material que já está lá continua com o saldo que tem.
   */
  app.post('/api/units/:id/materials', authenticate, withTenant, requireRole(ADMIN_ROLES), async (req, res) => {
    try {
      const ids: number[] = Array.isArray(req.body?.material_ids) ? req.body.material_ids.map(Number).filter(Number.isFinite) : [];
      if (ids.length === 0) return res.status(400).json({ error: 'Selecione ao menos um material.' });

      const depositos = (await depositosDaOrg(req.db!, { incluirUnidadesInativas: true })).filter((d) => d.unit_id === req.params.id);
      if (depositos.length === 0) return res.status(404).json({ error: 'Unidade não encontrada.' });

      // Só materiais que existem nesta organização — o filtro do req.db garante.
      const { data: existentes, error: matErr } = await req.db!.from('materials').select('id').in('id', ids);
      if (matErr) throw matErr;
      const validos = (existentes || []).map((m: any) => m.id as number);

      // "ignoreDuplicates" é o que faz ser idempotente: quem já tem linha
      // mantém o saldo, em vez de ser zerado por engano.
      const zeros = validos.flatMap((materialId: number) => depositos.map((d) => ({ material_id: materialId, warehouse_id: d.id, saldo: 0 })));
      if (zeros.length > 0) {
        const { error } = await req.db!
          .from('stock_balances')
          .upsert(zeros, { onConflict: 'warehouse_id,material_id', ignoreDuplicates: true });
        if (error) throw error;
      }

      res.json({ success: true, adicionados: validos.length });
    } catch (err: any) {
      console.error('[POST /api/units/:id/materials] erro:', err.message);
      res.status(500).json({ error: 'Erro ao adicionar materiais à unidade.' });
    }
  });

  /**
   * Tira de uma unidade todo material que pode sair: saldo zero em todos os
   * depósitos dela e nenhuma movimentação ali. Existe para desfazer o "entrou
   * o catálogo inteiro" de uma unidade nova — 300 cliques um a um não é opção.
   */
  app.delete('/api/units/:id/materials', authenticate, withTenant, requireRole(ADMIN_ROLES), async (req, res) => {
    try {
      const depositos = (await depositosDaOrg(req.db!, { incluirUnidadesInativas: true })).filter((d) => d.unit_id === req.params.id);
      if (depositos.length === 0) return res.status(404).json({ error: 'Unidade não encontrada.' });
      const depositoIds = depositos.map((d) => d.id);

      // Materiais que têm linha nesta unidade e, entre elas, algum saldo ≠ 0.
      const { data: linhas, error: lErr } = await req.db!
        .from('stock_balances').select('material_id, saldo').in('warehouse_id', depositoIds);
      if (lErr) throw lErr;
      const comSaldo = new Set<number>();
      const todos = new Set<number>();
      for (const l of linhas || []) {
        todos.add(l.material_id);
        if (Number(l.saldo) !== 0) comSaldo.add(l.material_id);
      }

      // E os que já tiveram movimentação em algum depósito daqui.
      const { data: movs, error: mErr } = await req.db!
        .from('material_movements').select('material_id')
        .or(`warehouse_origem_id.in.(${depositoIds.join(',')}),warehouse_destino_id.in.(${depositoIds.join(',')})`);
      if (mErr) throw mErr;
      const comHistorico = new Set<number>((movs || []).map((m: any) => m.material_id).filter((x: any) => x != null));

      const removiveis = [...todos].filter((id) => !comSaldo.has(id) && !comHistorico.has(id));
      if (removiveis.length > 0) {
        const { error } = await req.db!.from('stock_balances').delete().in('material_id', removiveis).in('warehouse_id', depositoIds);
        if (error) throw error;
      }

      console.info(`[DELETE /api/units/:id/materials] ${removiveis.length} material(is) removidos da unidade ${req.params.id} por ${req.user!.matricula}.`);
      res.json({ success: true, removidos: removiveis.length, mantidos: todos.size - removiveis.length });
    } catch (err: any) {
      console.error('[DELETE /api/units/:id/materials] erro:', err.message);
      res.status(500).json({ error: 'Erro ao remover materiais da unidade.' });
    }
  });

  /**
   * Tira um material de uma unidade. Só se o saldo for zero em todos os
   * depósitos dela e nunca tiver havido movimentação ali: saldo nunca some
   * em silêncio, e histórico nunca fica apontando para o nada.
   */
  app.delete('/api/units/:id/materials/:materialId', authenticate, withTenant, requireRole(ADMIN_ROLES), async (req, res) => {
    try {
      const materialId = Number(req.params.materialId);
      const depositos = (await depositosDaOrg(req.db!, { incluirUnidadesInativas: true })).filter((d) => d.unit_id === req.params.id);
      if (depositos.length === 0) return res.status(404).json({ error: 'Unidade não encontrada.' });
      const depositoIds = depositos.map((d) => d.id);

      const saldos = await saldosDoMaterial(req.db!, materialId);
      const comSaldo = depositoIds.filter((id) => Number(saldos[id] ?? 0) !== 0);
      if (comSaldo.length > 0) {
        return res.status(409).json({ error: 'Este material ainda tem saldo nesta unidade. Zere o saldo antes de removê-lo.' });
      }

      const { count } = await req.db!
        .from('material_movements')
        .select('*', { count: 'exact', head: true })
        .eq('material_id', materialId)
        .or(`warehouse_origem_id.in.(${depositoIds.join(',')}),warehouse_destino_id.in.(${depositoIds.join(',')})`);
      if ((count ?? 0) > 0) {
        return res.status(409).json({ error: 'Este material já teve movimentação nesta unidade. O histórico precisa continuar apontando para ela.' });
      }

      const { error } = await req.db!.from('stock_balances').delete().eq('material_id', materialId).in('warehouse_id', depositoIds);
      if (error) throw error;
      res.json({ success: true });
    } catch (err: any) {
      console.error('[DELETE /api/units/:id/materials/:materialId] erro:', err.message);
      res.status(500).json({ error: 'Erro ao remover material da unidade.' });
    }
  });

  // --------------------------- MATERIALS CRUD (admin) ---------------------------
  /** Validade de troca (modo entrega): dias inteiros entre 1 e 3650, ou nulo (sem troca programada). */
  function validadeDeTroca(v: unknown): { ok: true; dias: number | null } | { ok: false; erro: string } {
    if (v === undefined || v === null || v === '') return { ok: true, dias: null };
    const n = Number(v);
    if (!Number.isInteger(n) || n < 1 || n > 3650) return { ok: false, erro: 'Validade de troca inválida: use de 1 a 3650 dias.' };
    return { ok: true, dias: n };
  }

  app.post('/api/materials', authenticate, withTenant, requireRole(ADMIN_ROLES), async (req, res) => {
    try {
      const { nome, unidade_medida, qtd_volumes, fator_multiplicador, estoque_minimo, categoria, unit_id, validade_troca_dias } = req.body || {};
      if (!nome || !unidade_medida || qtd_volumes == null || fator_multiplicador == null || estoque_minimo == null) {
        return res.status(400).json({ error: 'Preencha todos os campos obrigatórios.' });
      }
      const troca = validadeDeTroca(validade_troca_dias);
      if (!troca.ok) return res.status(400).json({ error: troca.erro });

      // O material nasce em todos os estoques da unidade informada, com o
      // saldo inicial no estoque escolhido (`warehouse_id`) — ou, sem escolha,
      // no primeiro do modo almoxarifado (o Central de antes, onde existir).
      // Resolver isso ANTES de criar: material sem saldo em lugar nenhum é
      // material invisível.
      const depositos = await depositosDaOrg(req.db!);
      let daUnidade: Deposito[];
      try {
        daUnidade = depositosDaUnidade(depositos, unit_id);
      } catch (e: any) {
        return res.status(409).json({ error: e.message });
      }
      const destino =
        daUnidade.find((d) => d.id === req.body?.warehouse_id) ??
        daUnidade.find((d) => d.tipo === 'CENTRAL') ??
        daUnidade.find((d) => d.modo === 'almoxarifado') ??
        daUnidade[0];
      if (!destino) return res.status(409).json({ error: 'A unidade não tem estoque cadastrado.' });

      // Patrimônio conta item por item e validade conta por lote: o saldo
      // inicial desses modos entra pela tela deles, não pelo cadastro.
      const saldoInicial = destino.modo === 'patrimonio' || destino.modo === 'validade' ? 0 : arredondar(Number(qtd_volumes) * Number(fator_multiplicador));

      const { data: material, error } = await req.db!
        .from('materials')
        .insert({
          nome,
          unidade_medida,
          qtd_volumes,
          fator_multiplicador,
          estoque_minimo,
          categoria: categoria || 'Outros',
          validade_troca_dias: troca.dias,
        })
        .select()
        .single();

      if (error) throw error;

      // Zero explícito nos outros estoques: o saldo é sempre uma consulta,
      // nunca uma ausência a interpretar.
      const saldos: SaldosPorDeposito = Object.fromEntries(daUnidade.map((d) => [d.id, d.id === destino.id ? saldoInicial : 0]));
      await gravarSaldos(req.db!, material.id, saldos);

      if (saldoInicial > 0) {
        await req.db!.from('material_movements').insert({
          material_id: material.id,
          tipo_operacao: destino.tipo === 'CENTRAL' ? 'ENTRADA_CENTRAL' : 'ENTRADA',
          quantidade: saldoInicial,
          warehouse_destino_id: destino.id,
          funcionario_matricula: req.user!.matricula,
          justificativa: 'Cadastro inicial de material',
        });
      }

      res.status(201).json({ ...material, saldos });
    } catch (err: any) {
      console.error('[POST /api/materials] erro:', err.message);
      res.status(500).json({ error: 'Erro ao cadastrar material.' });
    }
  });

  app.put('/api/materials/:id', authenticate, withTenant, requireRole(ADMIN_ROLES), async (req, res) => {
    try {
      const { id } = req.params;
      const { nome, categoria, unidade_medida, estoque_minimo, fator_multiplicador, validade_troca_dias } = req.body || {};

      const updates: Record<string, any> = { updated_at: new Date().toISOString() };
      if (nome !== undefined) updates.nome = nome;
      if (categoria !== undefined) updates.categoria = categoria;
      if (unidade_medida !== undefined) updates.unidade_medida = unidade_medida;
      if (estoque_minimo !== undefined) updates.estoque_minimo = estoque_minimo;
      if (validade_troca_dias !== undefined) {
        const troca = validadeDeTroca(validade_troca_dias);
        if (!troca.ok) return res.status(400).json({ error: troca.erro });
        updates.validade_troca_dias = troca.dias;
      }
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
      const depositos = await depositosDaOrg(req.db!, { incluirUnidadesInativas: true });
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
      await gravarSaldos(req.db!, targetId, novosSaldos);

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
  // --------------------------- MOVIMENTAÇÕES (estoque genérico) ---------------------------
  /**
   * Aviso de mínimo por e-mail, depois de qualquer operação que mexa em
   * saldo. A regra é a mesma da interface (needsPurchase), calculada sobre a
   * UNIDADE onde a operação aconteceu. Nunca derruba a operação.
   */
  async function avisarMinimo(plano: PlanoEfetivo, material: any, saldosNovos: SaldosPorDeposito, saldosAntes: SaldosPorDeposito, depositosDaUnidadeDela: Deposito[], resumo: string) {
    // Na tela o alerta é de todo mundo; o e-mail é dos planos que o incluem.
    if (!planoLibera(plano, 'alertas-por-email')) return;
    const saldos_unidade: Record<string, number> = {};
    for (const d of depositosDaUnidadeDela) saldos_unidade[d.id] = Number(saldosNovos[d.id] ?? saldosAntes[d.id] ?? 0);
    const saldo_unidade = Object.values(saldos_unidade).reduce((s, v) => s + v, 0);
    const campos = { saldo_unidade, saldos_unidade, estoque_minimo: material.estoque_minimo };
    if (!needsPurchase(campos)) return;
    const semEstoque = stockStatus(campos, 'empresa') === 'RUPTURA';
    try {
      const t = await getTransporter();
      if (!t) return;
      const linhas = depositosDaUnidadeDela.map((d) => `${d.nome}: ${saldos_unidade[d.id]} ${material.unidade_medida}`).join('<br/>');
      await t.sendMail({
        from: remetente(),
        to: destinatarioAdmin(),
        subject: `${semEstoque ? 'Sem estoque' : 'Estoque abaixo do mínimo'}: ${material.nome}`,
        html:
          `<p>O material <strong>${material.nome}</strong> ${semEstoque ? 'está <strong>sem estoque</strong> em todos os estoques da unidade.' : 'está com o saldo da unidade <strong>abaixo do estoque mínimo</strong>.'}</p>` +
          `<p>${linhas}<br/><strong>Total: ${stockTotal(campos)} ${material.unidade_medida}</strong><br/>Estoque mínimo: ${material.estoque_minimo} ${material.unidade_medida}</p>` +
          `<p>${resumo}</p>`,
      });
    } catch (mailErr: any) {
      console.error('[Alerta de Estoque] falha ao enviar e-mail:', mailErr.message);
    }
  }

  /**
   * Uma operação num estoque do modo almoxarifado ou validade. O estoque da
   * URL é o lado da operação (origem para saída/consumo/transferência,
   * destino para entrada/ajuste); transferência ainda pede o destino, da
   * mesma unidade. Quem opera precisa OPERAR o estoque da URL.
   *
   * No modo validade a quantidade vive em lotes: a entrada diz o lote (e a
   * validade), a saída consome pelo FEFO ou por um lote apontado, e o ajuste
   * acerta um lote. O saldo em stock_balances acompanha a soma dos lotes.
   */
  app.post('/api/estoques/:id/movimentacoes', authenticate, withTenant, requireRole(ALL_INVENTORY_ROLES), withAcessos, async (req, res) => {
    try {
      const { operacao, material_id, quantidade, justificativa, destino_id, lote_id } = req.body || {};
      if (!ehOperacaoGenerica(operacao)) return res.status(400).json({ error: 'Operação inválida.' });
      if (!material_id || quantidade == null || !String(justificativa ?? '').trim()) {
        return res.status(400).json({ error: 'Preencha material, quantidade e justificativa.' });
      }

      const depositos = await depositosDaOrg(req.db!);
      const estoque = depositos.find((d) => d.id === req.params.id);
      if (!estoque) return res.status(404).json({ error: 'Estoque não encontrado.' });
      if (estoque.modo === 'emprestimo') return res.status(409).json({ error: 'Este estoque é de empréstimo: registre retiradas e devoluções.' });
      if (estoque.modo === 'entrega') return res.status(409).json({ error: 'Este estoque é de entrega: registre entregas na tela dele.' });
      if (estoque.modo === 'patrimonio') return res.status(409).json({ error: 'Este estoque é de patrimônio: cadastre, aloque e baixe itens na tela dele.' });
      if (!podeOperar(req.acessos ?? null, estoque.id)) return res.status(403).json({ error: 'Você não tem permissão para operar este estoque.' });
      if (!operacaoPermitida(estoque, operacao)) return res.status(409).json({ error: `A operação ${operacao} está desligada em ${estoque.nome}.` });
      if (operacao === 'TRANSFERENCIA') {
        const negada = negarRecurso(req.plano!, 'transferencia');
        if (negada) return res.status(negada.status).json(negada.body);
      }

      const def = OPERACOES[operacao];
      const lados: { origem_id?: string; destino_id?: string } = def.lado === 'origem' ? { origem_id: estoque.id } : { destino_id: estoque.id };
      let destino: Deposito | undefined;
      if (def.precisaDestino) {
        destino = depositos.find((d) => d.id === destino_id);
        if (!destino) return res.status(400).json({ error: 'Escolha o estoque de destino.' });
        if (destino.id === estoque.id) return res.status(400).json({ error: 'Origem e destino são o mesmo estoque.' });
        if (destino.unit_id !== estoque.unit_id) return res.status(409).json({ error: 'Transferência só entre estoques da mesma unidade.' });
        if (destino.modo === 'patrimonio') return res.status(409).json({ error: 'Não dá para transferir quantidade para um estoque de patrimônio.' });
        lados.destino_id = destino.id;
      }

      const { data: material, error: fetchError } = await req.db!.from('materials').select('*').eq('id', material_id).single();
      if (fetchError || !material) return res.status(404).json({ error: 'Material não encontrado.' });

      const nomeDo = (id: string) => depositos.find((d) => d.id === id)?.nome ?? id;
      const q = Number(quantidade);
      const atuais = await saldosDoMaterial(req.db!, Number(material_id));
      const calculo = calcularMovimento(atuais, { ...lados, quantidade: q, ajuste: def.ajuste, rotulo: def.rotulo, nomeDe: nomeDo });
      if (!calculo.ok) return res.status(400).json({ error: calculo.erro });

      // ---- Lotes (modo validade) ----
      // Tudo decidido antes de gravar qualquer coisa: se um lote não tem saldo,
      // nada muda. As gravações de lote vêm antes do saldo; se falharem, o
      // saldo continua igual à soma dos lotes.
      let detalheLotes = '';
      const gravacoesDeLote: Array<() => Promise<void>> = [];
      const origemValidade = estoque.modo === 'validade' && (operacao === 'SAIDA' || operacao === 'CONSUMO' || operacao === 'TRANSFERENCIA');

      const lotesDoOrigem = async () => {
        const { data, error } = await req.db!.from('lots').select('id, lote, validade, quantidade').eq('warehouse_id', estoque.id).eq('material_id', material_id);
        if (error) throw error;
        return (data || []) as LoteBase[];
      };

      let consumos: Consumo[] = [];
      if (origemValidade) {
        const lotes = await lotesDoOrigem();
        const aloc = alocarSaida(lotes, q, lote_id ? String(lote_id) : null);
        if (!aloc.ok) return res.status(400).json({ error: aloc.erro });
        consumos = aloc.consumos;
        detalheLotes = ` — lote(s) ${descreverConsumos(consumos)}`;
        for (const c of consumos) {
          const l = lotes.find((x) => x.id === c.id)!;
          gravacoesDeLote.push(async () => {
            const { error } = await req.db!.from('lots').update({ quantidade: arredondar(Number(l.quantidade) - c.quantidade), updated_at: new Date().toISOString() }).eq('id', c.id);
            if (error) throw error;
          });
        }
      }

      if (estoque.modo === 'validade' && operacao === 'ENTRADA') {
        const v = validarLote(req.body);
        if (!v.ok) return res.status(400).json({ error: v.erro });
        detalheLotes = ` — lote ${v.lote.lote}${v.lote.validade ? ` (val. ${v.lote.validade})` : ''}`;
        gravacoesDeLote.push(async () => {
          const { data: existente } = await req.db!.from('lots').select('id, quantidade, validade').eq('warehouse_id', estoque.id).eq('material_id', material_id).eq('lote', v.lote.lote).maybeSingle();
          if (existente) {
            const { error } = await req.db!.from('lots').update({ quantidade: arredondar(Number(existente.quantidade) + q), validade: v.lote.validade ?? existente.validade, updated_at: new Date().toISOString() }).eq('id', existente.id);
            if (error) throw error;
          } else {
            const { error } = await req.db!.from('lots').insert({ warehouse_id: estoque.id, material_id, lote: v.lote.lote, validade: v.lote.validade, quantidade: q });
            if (error) throw error;
          }
        });
      }

      if (estoque.modo === 'validade' && operacao === 'AJUSTE') {
        // Ajuste acerta UM lote: positivo achou, negativo sumiu. Sem lote apontado, recusa.
        const lotes = await lotesDoOrigem();
        const l = lotes.find((x) => x.id === String(lote_id ?? ''));
        if (!l) return res.status(400).json({ error: 'Aponte o lote que está sendo ajustado.' });
        if (Number(l.quantidade) + q < 0) return res.status(400).json({ error: `O lote ${l.lote} tem ${l.quantidade}; o ajuste deixaria negativo.` });
        detalheLotes = ` — lote ${l.lote}`;
        gravacoesDeLote.push(async () => {
          const { error } = await req.db!.from('lots').update({ quantidade: arredondar(Number(l.quantidade) + q), updated_at: new Date().toISOString() }).eq('id', l.id);
          if (error) throw error;
        });
      }

      if (operacao === 'TRANSFERENCIA' && destino?.modo === 'validade') {
        // O destino também controla lotes: cada lote consumido na origem entra
        // lá com o mesmo nome e validade. Origem sem lotes (almoxarifado) entra
        // como lote "TRANSF" sem validade — a pessoa acerta depois.
        let partes: Array<{ lote: string; validade: string | null; quantidade: number }>;
        if (consumos.length > 0) {
          const lotesOrigem = await lotesDoOrigem();
          partes = consumos.map((c) => ({ lote: c.lote, validade: lotesOrigem.find((l) => l.id === c.id)?.validade ?? null, quantidade: c.quantidade }));
        } else {
          partes = [{ lote: 'TRANSF', validade: null, quantidade: q }];
        }
        for (const p of partes) {
          gravacoesDeLote.push(async () => {
            const { data: existente } = await req.db!.from('lots').select('id, quantidade').eq('warehouse_id', destino!.id).eq('material_id', material_id).eq('lote', p.lote).maybeSingle();
            if (existente) {
              const { error } = await req.db!.from('lots').update({ quantidade: arredondar(Number(existente.quantidade) + p.quantidade), updated_at: new Date().toISOString() }).eq('id', existente.id);
              if (error) throw error;
            } else {
              const { error } = await req.db!.from('lots').insert({ warehouse_id: destino!.id, material_id, lote: p.lote, validade: p.validade, quantidade: p.quantidade });
              if (error) throw error;
            }
          });
        }
      }

      for (const gravar of gravacoesDeLote) await gravar();
      await gravarSaldos(req.db!, Number(material_id), calculo.novos);
      await req.db!.from('material_movements').insert({
        material_id,
        tipo_operacao: operacao,
        quantidade: q,
        warehouse_origem_id: lados.origem_id ?? null,
        warehouse_destino_id: lados.destino_id ?? null,
        funcionario_matricula: req.user!.matricula,
        justificativa: `${String(justificativa).trim()}${detalheLotes}`,
      });

      await avisarMinimo(req.plano!, material, calculo.novos, atuais, depositos.filter((d) => d.unit_id === estoque.unit_id), `Operação: ${operacao} em ${estoque.nome} | Quantidade: ${q} | Responsável: ${req.user!.nome}`);

      res.json({ success: true, material_id, saldos: calculo.novos, lotes: consumos });
    } catch (err: any) {
      console.error('[POST /api/estoques/:id/movimentacoes] erro:', err.message);
      res.status(500).json({ error: 'Erro ao registrar movimentação.' });
    }
  });

  // --------------------------- EMPRÉSTIMOS (estoque no modo empréstimo) ---------------------------
  /** Histórico de retiradas de um estoque, mais novas primeiro. As pendentes já vêm no /api/data. */
  app.get('/api/estoques/:id/emprestimos', authenticate, withTenant, requireRole(ALL_INVENTORY_ROLES), withAcessos, async (req, res) => {
    try {
      if (!podeVer(req.acessos ?? null, req.params.id)) return res.status(403).json({ error: 'Você não tem acesso a este estoque.' });
      const { data, error } = await req.db!
        .from('loans')
        .select('*, materials(nome, unidade_medida)')
        .eq('warehouse_id', req.params.id)
        .order('retirado_em', { ascending: false })
        .limit(300);
      if (error) throw error;
      res.json({
        emprestimos: (data || []).map(({ materials: mat, ...e }: any) => ({ ...e, material_nome: mat?.nome ?? 'Material removido', unidade_medida: mat?.unidade_medida ?? '' })),
      });
    } catch (err: any) {
      console.error('[GET /api/estoques/:id/emprestimos] erro:', err.message);
      res.status(500).json({ error: 'Erro ao carregar retiradas.' });
    }
  });

  /** Retirada: sai do saldo do estoque e fica pendente até a devolução. */
  app.post('/api/estoques/:id/emprestimos', authenticate, withTenant, requireRole(ALL_INVENTORY_ROLES), withAcessos, async (req, res) => {
    try {
      const depositos = await depositosDaOrg(req.db!);
      const estoque = depositos.find((d) => d.id === req.params.id);
      if (!estoque) return res.status(404).json({ error: 'Estoque não encontrado.' });
      if (estoque.modo !== 'emprestimo') return res.status(409).json({ error: 'Este estoque não é de empréstimo.' });
      if (!podeOperar(req.acessos ?? null, estoque.id)) return res.status(403).json({ error: 'Você não tem permissão para operar este estoque.' });

      const v = validarRetirada(req.body, estoque.prazo_padrao_horas);
      if (!v.ok) return res.status(400).json({ error: v.erro });
      const r = v.retirada;

      const { data: material } = await req.db!.from('materials').select('*').eq('id', r.material_id).maybeSingle();
      if (!material) return res.status(404).json({ error: 'Material não encontrado.' });

      const atuais = await saldosDoMaterial(req.db!, r.material_id);
      const calculo = calcularMovimento(atuais, { origem_id: estoque.id, quantidade: r.quantidade, rotulo: 'esta retirada', nomeDe: () => estoque.nome });
      if (!calculo.ok) return res.status(400).json({ error: calculo.erro });

      const agora = new Date();
      const { data: emprestimo, error } = await req.db!
        .from('loans')
        .insert({
          warehouse_id: estoque.id,
          material_id: r.material_id,
          quantidade: r.quantidade,
          tomador_nome: r.tomador_nome,
          tomador_referencia: r.tomador_referencia,
          observacao: r.observacao,
          retirado_em: agora.toISOString(),
          prazo_em: prazoEm(r.prazo_horas, agora).toISOString(),
          retirada_matricula: req.user!.matricula,
        })
        .select('*')
        .single();
      if (error) throw error;

      await gravarSaldos(req.db!, r.material_id, calculo.novos);
      await req.db!.from('material_movements').insert({
        material_id: r.material_id,
        tipo_operacao: 'EMPRESTIMO',
        quantidade: r.quantidade,
        warehouse_origem_id: estoque.id,
        warehouse_destino_id: null,
        funcionario_matricula: req.user!.matricula,
        justificativa: `Retirada por ${r.tomador_nome}${r.tomador_referencia ? ` (${r.tomador_referencia})` : ''} — prazo ${r.prazo_horas} h`,
      });

      await avisarMinimo(req.plano!, material, calculo.novos, atuais, depositos.filter((d) => d.unit_id === estoque.unit_id), `Retirada em ${estoque.nome} por ${r.tomador_nome} | Quantidade: ${r.quantidade} | Registrou: ${req.user!.nome}`);

      res.status(201).json({ emprestimo: { ...emprestimo, material_nome: material.nome, unidade_medida: material.unidade_medida }, saldos: calculo.novos });
    } catch (err: any) {
      console.error('[POST /api/estoques/:id/emprestimos] erro:', err.message);
      res.status(500).json({ error: 'Erro ao registrar retirada.' });
    }
  });

  /** Devolução: o saldo volta ao estoque. Sem quantidade no corpo, devolve o que falta. */
  app.post('/api/emprestimos/:id/devolver', authenticate, withTenant, requireRole(ALL_INVENTORY_ROLES), withAcessos, async (req, res) => {
    try {
      const { data: emp } = await req.db!.from('loans').select('*, materials(nome, unidade_medida)').eq('id', req.params.id).maybeSingle();
      if (!emp) return res.status(404).json({ error: 'Retirada não encontrada.' });
      if (emp.devolvido_em) return res.status(409).json({ error: 'Esta retirada já foi devolvida.' });
      if (!podeOperar(req.acessos ?? null, emp.warehouse_id)) return res.status(403).json({ error: 'Você não tem permissão para operar este estoque.' });

      const falta = Math.round((Number(emp.quantidade) - Number(emp.quantidade_devolvida)) * 100) / 100;
      const q = req.body?.quantidade == null || req.body.quantidade === '' ? falta : Math.round(Number(req.body.quantidade) * 100) / 100;
      if (!Number.isFinite(q) || q <= 0 || q > falta) return res.status(400).json({ error: `Informe uma quantidade entre 0 e ${falta}.` });

      const atuais = await saldosDoMaterial(req.db!, emp.material_id);
      const calculo = calcularMovimento(atuais, { destino_id: emp.warehouse_id, quantidade: q, rotulo: 'esta devolução', nomeDe: (id) => id });
      if (!calculo.ok) return res.status(400).json({ error: calculo.erro });

      const agora = new Date().toISOString();
      const devolvidaTotal = Math.round((Number(emp.quantidade_devolvida) + q) * 100) / 100;
      const completa = devolvidaTotal >= Number(emp.quantidade);
      const { data: atualizado, error } = await req.db!
        .from('loans')
        .update({ quantidade_devolvida: devolvidaTotal, devolvido_em: completa ? agora : null, devolucao_matricula: req.user!.matricula })
        .eq('id', emp.id)
        .select('*')
        .single();
      if (error) throw error;

      await gravarSaldos(req.db!, emp.material_id, calculo.novos);
      await req.db!.from('material_movements').insert({
        material_id: emp.material_id,
        tipo_operacao: 'DEVOLUCAO_EMPRESTIMO',
        quantidade: q,
        warehouse_origem_id: null,
        warehouse_destino_id: emp.warehouse_id,
        funcionario_matricula: req.user!.matricula,
        justificativa: `Devolução de ${emp.tomador_nome}${completa ? '' : ' (parcial)'}`,
      });

      res.json({ emprestimo: { ...atualizado, material_nome: emp.materials?.nome ?? '', unidade_medida: emp.materials?.unidade_medida ?? '' }, saldos: calculo.novos });
    } catch (err: any) {
      console.error('[POST /api/emprestimos/:id/devolver] erro:', err.message);
      res.status(500).json({ error: 'Erro ao registrar devolução.' });
    }
  });

  // --------------------------- ENTREGAS / EPI (estoque no modo entrega) ---------------------------
  const selecionarEntrega = '*, materials(nome, unidade_medida)';
  const comMaterial = ({ materials: mat, ...e }: any) => ({ ...e, material_nome: mat?.nome ?? 'Material removido', unidade_medida: mat?.unidade_medida ?? '' });

  /** Histórico de entregas de um estoque, mais novas primeiro. As abertas já vêm no /api/data. */
  app.get('/api/estoques/:id/entregas', authenticate, withTenant, requireRole(ALL_INVENTORY_ROLES), withAcessos, async (req, res) => {
    try {
      if (!podeVer(req.acessos ?? null, req.params.id)) return res.status(403).json({ error: 'Você não tem acesso a este estoque.' });
      const { data, error } = await req.db!.from('loans').select(selecionarEntrega).eq('warehouse_id', req.params.id).eq('tipo', 'entrega').order('retirado_em', { ascending: false }).limit(500);
      if (error) throw error;
      res.json({ entregas: (data || []).map(comMaterial) });
    } catch (err: any) {
      console.error('[GET /api/estoques/:id/entregas] erro:', err.message);
      res.status(500).json({ error: 'Erro ao carregar entregas.' });
    }
  });

  /** Registra uma entrega: sai do saldo, fica aberta com a pessoa, "válido até" vem da validade de troca do material. */
  async function registrarEntrega(req: express.Request, estoque: Deposito, corpo: unknown) {
    const v = validarEntrega(corpo, estoque.exige_assinatura);
    if (!v.ok) return { status: 400, body: { error: v.erro } };
    const e = v.entrega;

    const { data: material } = await req.db!.from('materials').select('*').eq('id', e.material_id).maybeSingle();
    if (!material) return { status: 404, body: { error: 'Material não encontrado.' } };

    const atuais = await saldosDoMaterial(req.db!, e.material_id);
    const calculo = calcularMovimento(atuais, { origem_id: estoque.id, quantidade: e.quantidade, rotulo: 'esta entrega', nomeDe: () => estoque.nome });
    if (!calculo.ok) return { status: 400, body: { error: calculo.erro } };

    const agora = new Date();
    const ate = validoAte(material.validade_troca_dias, agora);
    const { data: entrega, error } = await req.db!
      .from('loans')
      .insert({
        tipo: 'entrega',
        warehouse_id: estoque.id,
        material_id: e.material_id,
        quantidade: e.quantidade,
        tomador_nome: e.tomador_nome,
        tomador_referencia: e.tomador_referencia,
        observacao: e.observacao,
        assinatura: e.assinatura,
        retirado_em: agora.toISOString(),
        prazo_em: ate ? ate.toISOString() : null,
        retirada_matricula: req.user!.matricula,
      })
      .select('*')
      .single();
    if (error) throw error;

    await gravarSaldos(req.db!, e.material_id, calculo.novos);
    await req.db!.from('material_movements').insert({
      material_id: e.material_id,
      tipo_operacao: 'ENTREGA',
      quantidade: e.quantidade,
      warehouse_origem_id: estoque.id,
      warehouse_destino_id: null,
      funcionario_matricula: req.user!.matricula,
      justificativa: `Entrega a ${e.tomador_nome}${e.tomador_referencia ? ` (${e.tomador_referencia})` : ''}${ate ? ` — trocar até ${ate.toISOString().slice(0, 10)}` : ''}`,
    });
    return { status: 201, body: { entrega: { ...entrega, material_nome: material.nome, unidade_medida: material.unidade_medida }, saldos: calculo.novos }, material, saldosNovos: calculo.novos, saldosAntes: atuais };
  }

  app.post('/api/estoques/:id/entregas', authenticate, withTenant, requireRole(ALL_INVENTORY_ROLES), withAcessos, async (req, res) => {
    try {
      const depositos = await depositosDaOrg(req.db!);
      const estoque = depositos.find((d) => d.id === req.params.id);
      if (!estoque) return res.status(404).json({ error: 'Estoque não encontrado.' });
      if (estoque.modo !== 'entrega') return res.status(409).json({ error: 'Este estoque não é de entrega.' });
      if (!podeOperar(req.acessos ?? null, estoque.id)) return res.status(403).json({ error: 'Você não tem permissão para operar este estoque.' });

      const r = await registrarEntrega(req, estoque, req.body);
      if (r.status === 201 && r.material) {
        await avisarMinimo(req.plano!, r.material, r.saldosNovos!, r.saldosAntes!, depositos.filter((d) => d.unit_id === estoque.unit_id), `Entrega em ${estoque.nome} | Registrou: ${req.user!.nome}`);
      }
      res.status(r.status).json(r.body);
    } catch (err: any) {
      console.error('[POST /api/estoques/:id/entregas] erro:', err.message);
      res.status(500).json({ error: 'Erro ao registrar entrega.' });
    }
  });

  /**
   * Encerra uma entrega: `devolvido` volta ao estoque (desligamento, item em
   * bom estado); `consumido` não volta (gasto, perdido); `substituido` fecha
   * a antiga e registra uma nova para a mesma pessoa e material (a troca).
   */
  app.post('/api/entregas/:id/encerrar', authenticate, withTenant, requireRole(ALL_INVENTORY_ROLES), withAcessos, async (req, res) => {
    try {
      const { data: ent } = await req.db!.from('loans').select(selecionarEntrega).eq('id', req.params.id).eq('tipo', 'entrega').maybeSingle();
      if (!ent) return res.status(404).json({ error: 'Entrega não encontrada.' });
      if (ent.devolvido_em || ent.encerrado_em) return res.status(409).json({ error: 'Esta entrega já foi encerrada.' });
      if (!podeOperar(req.acessos ?? null, ent.warehouse_id)) return res.status(403).json({ error: 'Você não tem permissão para operar este estoque.' });

      const modo = String(req.body?.modo ?? '');
      const agora = new Date().toISOString();
      const falta = arredondar(Number(ent.quantidade) - Number(ent.quantidade_devolvida));

      if (modo === 'devolvido') {
        const atuais = await saldosDoMaterial(req.db!, ent.material_id);
        const calculo = calcularMovimento(atuais, { destino_id: ent.warehouse_id, quantidade: falta, rotulo: 'esta devolução', nomeDe: (id) => id });
        if (!calculo.ok) return res.status(400).json({ error: calculo.erro });
        const { data: atualizado, error } = await req.db!.from('loans').update({ quantidade_devolvida: Number(ent.quantidade), devolvido_em: agora, devolucao_matricula: req.user!.matricula }).eq('id', ent.id).select(selecionarEntrega).single();
        if (error) throw error;
        await gravarSaldos(req.db!, ent.material_id, calculo.novos);
        await req.db!.from('material_movements').insert({
          material_id: ent.material_id, tipo_operacao: 'DEVOLUCAO_ENTREGA', quantidade: falta, warehouse_origem_id: null, warehouse_destino_id: ent.warehouse_id,
          funcionario_matricula: req.user!.matricula, justificativa: `Devolução de ${ent.tomador_nome}${req.body?.detalhe ? ` — ${String(req.body.detalhe).slice(0, 200)}` : ''}`,
        });
        return res.json({ entrega: comMaterial(atualizado) });
      }

      if (modo === 'consumido') {
        const { data: atualizado, error } = await req.db!.from('loans').update({ encerrado_em: agora, encerramento: 'consumido', devolucao_matricula: req.user!.matricula }).eq('id', ent.id).select(selecionarEntrega).single();
        if (error) throw error;
        return res.json({ entrega: comMaterial(atualizado) });
      }

      if (modo === 'substituido') {
        // A troca: nova entrega igual (mesma pessoa, mesmo material, mesma quantidade), assinatura nova se veio.
        const depositos = await depositosDaOrg(req.db!);
        const estoque = depositos.find((d) => d.id === ent.warehouse_id);
        if (!estoque) return res.status(409).json({ error: 'O estoque desta entrega não está mais ativo.' });
        const r = await registrarEntrega(req, estoque, {
          material_id: ent.material_id,
          quantidade: falta,
          tomador_nome: ent.tomador_nome,
          tomador_referencia: ent.tomador_referencia,
          observacao: req.body?.detalhe ? String(req.body.detalhe) : `Troca da entrega de ${String(ent.retirado_em).slice(0, 10)}`,
          assinatura: req.body?.assinatura ?? null,
        });
        if (r.status !== 201) return res.status(r.status).json(r.body);
        const nova = (r.body as any).entrega;
        const { data: antiga, error } = await req.db!.from('loans').update({ encerrado_em: agora, encerramento: 'substituido', substituido_por: nova.id, devolucao_matricula: req.user!.matricula }).eq('id', ent.id).select(selecionarEntrega).single();
        if (error) throw error;
        return res.status(201).json({ entrega: comMaterial(antiga), nova });
      }

      return res.status(400).json({ error: 'Informe como encerrar: devolvido, consumido ou substituido.' });
    } catch (err: any) {
      console.error('[POST /api/entregas/:id/encerrar] erro:', err.message);
      res.status(500).json({ error: 'Erro ao encerrar entrega.' });
    }
  });

  // --------------------------- PATRIMÔNIO (estoque no modo patrimonio) ---------------------------
  const selecionarItem = '*, materials(nome)';
  const itemComMaterial = ({ materials: mat, ...i }: any) => ({ ...i, material_nome: mat?.nome ?? 'Modelo removido' });

  /** Mantém o saldo do modelo no estoque igual ao número de itens não baixados. */
  async function sincronizarSaldoDoModelo(req: express.Request, warehouseId: string, materialId: number) {
    const { count } = await req.db!.from('assets').select('*', { count: 'exact', head: true }).eq('warehouse_id', warehouseId).eq('material_id', materialId).neq('estado', 'baixado');
    const atuais = await saldosDoMaterial(req.db!, materialId);
    await gravarSaldos(req.db!, materialId, { ...atuais, [warehouseId]: count ?? 0 });
  }

  app.get('/api/estoques/:id/patrimonio', authenticate, withTenant, requireRole(ALL_INVENTORY_ROLES), withAcessos, async (req, res) => {
    try {
      if (!podeVer(req.acessos ?? null, req.params.id)) return res.status(403).json({ error: 'Você não tem acesso a este estoque.' });
      const { data, error } = await req.db!.from('assets').select(selecionarItem).eq('warehouse_id', req.params.id).order('codigo', { ascending: true });
      if (error) throw error;
      res.json({ itens: (data || []).map(itemComMaterial) });
    } catch (err: any) {
      console.error('[GET /api/estoques/:id/patrimonio] erro:', err.message);
      res.status(500).json({ error: 'Erro ao carregar itens.' });
    }
  });

  app.post('/api/estoques/:id/patrimonio', authenticate, withTenant, requireRole(ALL_INVENTORY_ROLES), withAcessos, async (req, res) => {
    try {
      const depositos = await depositosDaOrg(req.db!);
      const estoque = depositos.find((d) => d.id === req.params.id);
      if (!estoque) return res.status(404).json({ error: 'Estoque não encontrado.' });
      if (estoque.modo !== 'patrimonio') return res.status(409).json({ error: 'Este estoque não é de patrimônio.' });
      if (!podeOperar(req.acessos ?? null, estoque.id)) return res.status(403).json({ error: 'Você não tem permissão para operar este estoque.' });

      const v = validarItem(req.body);
      if (!v.ok) return res.status(400).json({ error: v.erro });
      const { data: material } = await req.db!.from('materials').select('id, nome').eq('id', v.item.material_id).maybeSingle();
      if (!material) return res.status(404).json({ error: 'Modelo (material) não encontrado.' });

      const { data: item, error } = await req.db!.from('assets').insert({ ...v.item, warehouse_id: estoque.id }).select(selecionarItem).single();
      if (error) {
        if (/duplicate|unique/i.test(error.message)) return res.status(409).json({ error: `Já existe um item com o número ${v.item.codigo}.` });
        throw error;
      }
      await req.db!.from('asset_events').insert({ asset_id: item.id, tipo: 'cadastro', detalhe: v.item.local ? `Local: ${v.item.local}` : null, funcionario_matricula: req.user!.matricula });
      await sincronizarSaldoDoModelo(req, estoque.id, v.item.material_id);
      await req.db!.from('material_movements').insert({
        material_id: v.item.material_id, tipo_operacao: 'ENTRADA', quantidade: 1, warehouse_origem_id: null, warehouse_destino_id: estoque.id,
        funcionario_matricula: req.user!.matricula, justificativa: `Cadastro do item ${v.item.codigo}`,
      });
      res.status(201).json({ item: itemComMaterial(item) });
    } catch (err: any) {
      console.error('[POST /api/estoques/:id/patrimonio] erro:', err.message);
      res.status(500).json({ error: 'Erro ao cadastrar item.' });
    }
  });

  /** Edita os dados de um item (não o estado — isso é evento). */
  app.patch('/api/patrimonio/:id', authenticate, withTenant, requireRole(ALL_INVENTORY_ROLES), withAcessos, async (req, res) => {
    try {
      const { data: atual } = await req.db!.from('assets').select(selecionarItem).eq('id', req.params.id).maybeSingle();
      if (!atual) return res.status(404).json({ error: 'Item não encontrado.' });
      if (!podeOperar(req.acessos ?? null, atual.warehouse_id)) return res.status(403).json({ error: 'Você não tem permissão para operar este estoque.' });
      const v = validarItem({ ...atual, ...req.body, material_id: atual.material_id });
      if (!v.ok) return res.status(400).json({ error: v.erro });
      // O modelo não muda pela edição: trocar de modelo é baixar e cadastrar de novo.
      const { codigo, serie, local, observacao, adquirido_em, valor } = v.item;
      const { data: item, error } = await req.db!.from('assets').update({ codigo, serie, local, observacao, adquirido_em, valor, updated_at: new Date().toISOString() }).eq('id', atual.id).select(selecionarItem).single();
      if (error) {
        if (/duplicate|unique/i.test(error.message)) return res.status(409).json({ error: `Já existe um item com o número ${v.item.codigo}.` });
        throw error;
      }
      await req.db!.from('asset_events').insert({ asset_id: atual.id, tipo: 'edicao', detalhe: 'Dados do item alterados', funcionario_matricula: req.user!.matricula });
      res.json({ item: itemComMaterial(item) });
    } catch (err: any) {
      console.error('[PATCH /api/patrimonio/:id] erro:', err.message);
      res.status(500).json({ error: 'Erro ao editar item.' });
    }
  });

  /** Alocar, devolver, mandar para manutenção, retornar, baixar. O estado muda pela transição permitida. */
  app.post('/api/patrimonio/:id/eventos', authenticate, withTenant, requireRole(ALL_INVENTORY_ROLES), withAcessos, async (req, res) => {
    try {
      const { data: atual } = await req.db!.from('assets').select(selecionarItem).eq('id', req.params.id).maybeSingle();
      if (!atual) return res.status(404).json({ error: 'Item não encontrado.' });
      if (!podeOperar(req.acessos ?? null, atual.warehouse_id)) return res.status(403).json({ error: 'Você não tem permissão para operar este estoque.' });

      const v = validarEvento(req.body);
      if (!v.ok) return res.status(400).json({ error: v.erro });
      const t = transicionar(atual.estado, v.evento.tipo);
      if (!t.ok) return res.status(409).json({ error: t.erro });

      const patch: Record<string, any> = { estado: t.para, updated_at: new Date().toISOString() };
      if (v.evento.tipo === 'alocacao') {
        patch.responsavel_nome = v.evento.para_nome;
        patch.responsavel_referencia = v.evento.para_referencia;
      }
      // Devolvido, na manutenção ou baixado, o item não está mais com ninguém.
      if (v.evento.tipo === 'devolucao' || v.evento.tipo === 'manutencao' || v.evento.tipo === 'baixa') {
        patch.responsavel_nome = null;
        patch.responsavel_referencia = null;
      }
      const { data: item, error } = await req.db!.from('assets').update(patch).eq('id', atual.id).select(selecionarItem).single();
      if (error) throw error;

      const { data: evento, error: erroEv } = await req.db!
        .from('asset_events')
        .insert({ asset_id: atual.id, tipo: v.evento.tipo, detalhe: v.evento.detalhe, para_nome: v.evento.para_nome, para_referencia: v.evento.para_referencia, funcionario_matricula: req.user!.matricula })
        .select('*')
        .single();
      if (erroEv) throw erroEv;

      if (v.evento.tipo === 'baixa') {
        await sincronizarSaldoDoModelo(req, atual.warehouse_id, atual.material_id);
        await req.db!.from('material_movements').insert({
          material_id: atual.material_id, tipo_operacao: 'BAIXA', quantidade: 1, warehouse_origem_id: atual.warehouse_id, warehouse_destino_id: null,
          funcionario_matricula: req.user!.matricula, justificativa: `Baixa do item ${atual.codigo}${v.evento.detalhe ? ` — ${v.evento.detalhe}` : ''}`,
        });
      }
      res.json({ item: itemComMaterial(item), evento });
    } catch (err: any) {
      console.error('[POST /api/patrimonio/:id/eventos] erro:', err.message);
      res.status(500).json({ error: 'Erro ao registrar evento.' });
    }
  });

  app.get('/api/patrimonio/:id/eventos', authenticate, withTenant, requireRole(ALL_INVENTORY_ROLES), withAcessos, async (req, res) => {
    try {
      const { data: item } = await req.db!.from('assets').select('id, warehouse_id').eq('id', req.params.id).maybeSingle();
      if (!item) return res.status(404).json({ error: 'Item não encontrado.' });
      if (!podeVer(req.acessos ?? null, item.warehouse_id)) return res.status(403).json({ error: 'Você não tem acesso a este estoque.' });
      const { data, error } = await req.db!.from('asset_events').select('*').eq('asset_id', item.id).order('created_at', { ascending: false }).limit(200);
      if (error) throw error;
      res.json({ eventos: data || [] });
    } catch (err: any) {
      console.error('[GET /api/patrimonio/:id/eventos] erro:', err.message);
      res.status(500).json({ error: 'Erro ao carregar histórico do item.' });
    }
  });


  // --------------------------- ASSINATURA (Mercado Pago) ---------------------------
  // Estas rotas funcionam mesmo com a conta bloqueada: são o caminho de volta.
  const resumoDaAssinatura = async (organizationId: string) => {
    const [c, assinatura, pagamentos] = await Promise.all([contaDe(organizationId), assinaturaAtual(organizationId), pagamentosDe(organizationId)]);
    return {
      organizacao: c?.organizacao ?? null,
      conta: c?.conta ?? null,
      assinatura,
      pagamentos,
      // O que dá para assinar agora: por plano e ciclo, se existe caminho (plano no painel ou API configurada).
      disponivel: Object.fromEntries(CICLOS.map((ciclo: Ciclo) => [ciclo, mpConfigurado() || PLANOS.some((p) => mpPlanId(p, ciclo))])),
      modo_teste: modoTeste(),
      avaliacao_dias: AVALIACAO_DIAS,
    };
  };

  app.get('/api/assinatura', authenticate, withTenant, requireRole(ADMIN_ROLES), async (req, res) => {
    try {
      res.json(await resumoDaAssinatura(req.user!.organization_id));
    } catch (err: any) {
      console.error('[GET /api/assinatura] erro:', err.message);
      res.status(500).json({ error: 'Erro ao carregar a assinatura.' });
    }
  });

  /** Começa (ou troca, com `trocar: true`) uma assinatura: devolve a URL do checkout do Mercado Pago. */
  app.post('/api/assinatura', authenticate, withTenant, requireRole(ADMIN_ROLES), async (req, res) => {
    try {
      const plano = req.body?.plano;
      const ciclo = req.body?.ciclo ?? 'mensal';
      if (!ehPlano(plano)) return res.status(400).json({ error: 'Escolha o plano.' });
      if (!CICLOS.includes(ciclo)) return res.status(400).json({ error: 'Ciclo inválido: mensal ou anual.' });
      if (!mpPlanId(plano, ciclo) && !mpConfigurado()) return res.status(503).json({ error: 'Pagamento ainda não configurado para este ciclo. Fale com a gente.' });

      // O e-mail do pagador: o do administrador que está assinando.
      const { data: eu } = await req.db!.from(ESTOQUE_USERS).select('email').eq('id', req.user!.id).maybeSingle();
      const email = String(eu?.email || '').trim().toLowerCase();
      if (!email) return res.status(400).json({ error: 'Cadastre um e-mail no seu usuário antes de assinar: é para onde vão os recibos.' });

      const r = await iniciarAssinatura({ organizationId: req.user!.organization_id, plano, ciclo, payerEmail: email, trocar: Boolean(req.body?.trocar) });
      console.info(`[assinatura] ${req.user!.organization_id} → ${plano}/${ciclo} (${r.assinatura.mp_plan_id ? 'plano do painel' : 'API'})`);
      res.json({ url: r.url, valor: precoDo(plano, ciclo) });
    } catch (err: any) {
      if (err instanceof ErroDeAssinatura) return res.status(err.status).json({ error: err.message });
      console.error('[POST /api/assinatura] erro:', err.message);
      res.status(500).json({ error: 'Não foi possível iniciar a assinatura.' });
    }
  });

  /** O que a credencial do Mercado Pago enxerga — para diagnosticar "paguei e não liberou". Só administrador; nunca devolve segredos. */
  app.get('/api/assinatura/diagnostico', authenticate, withTenant, requireRole(ADMIN_ROLES), async (_req, res) => {
    try {
      res.json(await diagnostico());
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/assinatura/cancelar', authenticate, withTenant, requireRole(ADMIN_ROLES), async (req, res) => {
    try {
      await cancelarAssinatura(req.user!.organization_id);
      res.json(await resumoDaAssinatura(req.user!.organization_id));
    } catch (err: any) {
      if (err instanceof ErroDeAssinatura) return res.status(err.status).json({ error: err.message });
      console.error('[POST /api/assinatura/cancelar] erro:', err.message);
      res.status(500).json({ error: 'Não foi possível cancelar a assinatura.' });
    }
  });

  /**
   * A volta do checkout: o Mercado Pago manda a pessoa para /assinatura/retorno
   * com `preapproval_id`. Buscamos a assinatura lá e aplicamos — sem esperar o
   * webhook, que pode chegar depois.
   */
  app.post('/api/assinatura/sincronizar', authenticate, withTenant, requireRole(ADMIN_ROLES), async (req, res) => {
    try {
      if (!mpConfigurado()) return res.status(503).json({ error: 'Pagamento ainda não configurado no servidor (MP_ACCESS_TOKEN).' });
      const id = String(req.body?.preapproval_id ?? '').trim();
      let r;
      if (id) {
        if (!/^[A-Za-z0-9_-]{6,80}$/.test(id)) return res.status(400).json({ error: 'Assinatura inválida.' });
        r = await aplicarPreapproval(await buscarAssinatura(id), { organizationId: req.user!.organization_id });
      } else {
        // Sem id: procura no MP uma assinatura desta conta (pagou pelo link, webhook não chegou...).
        const { data: admins } = await req.db!.from(ESTOQUE_USERS).select('email').in('role', ADMIN_ROLES);
        r = await procurarEAplicar(req.user!.organization_id, (admins || []).map((a: any) => String(a.email || '')));
      }
      if (!r.casou) return res.status(409).json({ error: r.motivo ?? 'A assinatura não corresponde a esta conta.' });
      res.json(await resumoDaAssinatura(req.user!.organization_id));
    } catch (err: any) {
      console.error('[POST /api/assinatura/sincronizar] erro:', err.message);
      res.status(500).json({ error: 'Não foi possível confirmar a assinatura. O Mercado Pago ainda vai avisar a gente; tente de novo em instantes.' });
    }
  });

  /**
   * O webhook do Mercado Pago. Nunca confia no corpo: pega o id, busca o
   * objeto na API com a nossa credencial e aplica. Responde 200 rápido — o MP
   * reenvia o que não for respondido.
   */
  app.post('/api/webhooks/mercadopago', async (req, res) => {
    const tipo = tipoDoEvento(req.body, req.query as Record<string, unknown>);
    const id = idDoEvento(req.body, req.query as Record<string, unknown>);
    if (!id) return res.status(400).json({ error: 'Evento sem id.' });

    const valida = assinaturaDoWebhookValida({
      xSignature: req.header('x-signature'),
      xRequestId: req.header('x-request-id'),
      dataId: id,
      secret: process.env.MP_WEBHOOK_SECRET,
    });
    if (valida === false) {
      console.warn('[webhook MP] assinatura inválida', { tipo, id });
      return res.status(401).json({ error: 'Assinatura do webhook inválida.' });
    }
    if (valida === null) console.warn('[webhook MP] MP_WEBHOOK_SECRET não configurado — evento aceito sem conferir a assinatura.');

    // Todo o trabalho ANTES de responder: na Vercel, a função pode ser
    // congelada assim que a resposta sai, e o que ficou pendente some.
    // Duas chamadas à API e umas gravações cabem folgado no prazo do MP.
    try {
      const r = await tratarEvento(tipo, id);
      const casou = 'casou' in r ? r.casou : true;
      await registrarEvento({ tipo, mpId: id, organizationId: 'organizationId' in r ? r.organizationId : null, tratado: casou, erro: 'motivo' in r ? (r.motivo ?? null) : null, payload: req.body });
      if (!('ignorado' in r)) console.info(`[webhook MP] ${tipo} ${id}: ${casou ? 'aplicado' : `não casou (${r.motivo})`}`);
      // Não casou = fica no diário para resolver à mão; repetir não ajudaria.
      res.status(200).json({ ok: true, aplicado: casou });
    } catch (err: any) {
      // Falha de rede, credencial ou banco: 500 para o MP reenviar mais tarde.
      console.error('[webhook MP] erro:', err.message);
      await registrarEvento({ tipo, mpId: id, organizationId: null, tratado: false, erro: err.message, payload: req.body });
      res.status(500).json({ error: 'Falha ao processar; o Mercado Pago pode reenviar.' });
    }
  });

  // --------------------------- RECONTAGEM (ajuste em lote) ---------------------------
  app.post('/api/materials/bulk-recount', authenticate, withTenant, requireRole(ALL_INVENTORY_ROLES), withAcessos, async (req, res) => {
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

      // Quem opera o estoque pode recontá-lo. Os de antes (Central/Obra)
      // mantêm o nome antigo do ajuste no histórico; os novos usam AJUSTE.
      const tipo_operacao = deposito.tipo === 'CENTRAL' ? 'AJUSTE_CENTRAL' : deposito.tipo === 'OBRA' ? 'AJUSTE_OBRA' : 'AJUSTE';
      if (!podeOperar(req.acessos ?? null, deposito.id)) {
        return res.status(403).json({ error: 'Você não tem permissão para ajustar este depósito.' });
      }
      // Onde o saldo é a soma de lotes ou de itens, a recontagem mexeria só
      // no total e deixaria o detalhe mentindo. Cada modo acerta na tela dele.
      if (deposito.modo === 'validade') return res.status(409).json({ error: 'Este estoque controla lotes: ajuste lote a lote na tela dele.' });
      if (deposito.modo === 'patrimonio') return res.status(409).json({ error: 'Este estoque é de patrimônio: cadastre ou baixe itens na tela dele.' });
      if (!operacaoPermitida(deposito, 'AJUSTE')) return res.status(409).json({ error: `Ajuste está desligado em ${deposito.nome}.` });
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
          await gravarSaldos(req.db!, Number(materialId), novos);
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
              from: remetente(),
              to: destinatarioAdmin(),
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

      // As atribuições de todo mundo numa consulta só, agrupadas por pessoa.
      const { data: atribuicoes, error: aErr } = await req.db!
        .from('estoque_user_warehouses')
        .select('user_id, warehouse_id, nivel');
      if (aErr) throw aErr;
      const porUsuario = new Map<number, { warehouse_id: string; nivel: string }[]>();
      for (const a of atribuicoes || []) {
        const lista = porUsuario.get(a.user_id) || [];
        lista.push({ warehouse_id: a.warehouse_id, nivel: a.nivel });
        porUsuario.set(a.user_id, lista);
      }

      // A senha nunca sai daqui — só o indicador de que ainda está em texto puro.
      const users = (data || []).map(({ senha, ...u }: any) => ({
        ...u,
        senha_em_texto_puro: !/^\$2[aby]\$/.test(String(senha || '')),
        acessos: porUsuario.get(u.id) || [],
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
      if (!ASSIGNABLE_ROLES.includes(String(role))) return res.status(400).json({ error: 'Perfil inválido: use Administrador, Administrativo ou Operador.' });
      if (String(senha).length < MIN_PASSWORD_LENGTH) {
        return res.status(400).json({ error: `A senha deve ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.` });
      }

      const { data: existing } = await req.db!.from(ESTOQUE_USERS).select('id').eq('matricula', matricula).maybeSingle();
      if (existing) return res.status(409).json({ error: 'Já existe um usuário com esta matrícula.' });

      // O plano diz quantas pessoas cabem.
      const { count: pessoas } = await req.db!.from(ESTOQUE_USERS).select('*', { count: 'exact', head: true });
      const negada = negarLimite(req.plano!, 'usuarios', pessoas ?? 0);
      if (negada) return res.status(negada.status).json(negada.body);

      const { data, error } = await req.db!
        .from(ESTOQUE_USERS)
        .insert({
          nome: String(nome).trim(),
          matricula: String(matricula).trim(),
          email: email ? String(email).trim().toLowerCase() : null,
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
      if (email !== undefined) patch.email = email ? String(email).trim().toLowerCase() : null; // minúsculo como no cadastro: a recuperação de senha busca assim
      if (role !== undefined) {
        if (!ASSIGNABLE_ROLES.includes(String(role))) return res.status(400).json({ error: 'Perfil inválido: use Administrador, Administrativo ou Operador.' });
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

  /**
   * Define o que uma pessoa pode ver e operar, depósito a depósito. Substitui
   * o conjunto inteiro: o que não vier na lista deixa de valer. Administrador
   * não tem atribuição — a dele é implícita e total.
   */
  app.put('/api/users/:id/acessos', authenticate, withTenant, requireRole(ADMIN_ROLES), async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { data: alvo } = await req.db!.from(ESTOQUE_USERS).select('id, nome, role').eq('id', id).maybeSingle();
      if (!alvo) return res.status(404).json({ error: 'Usuário não encontrado.' });
      if (!assertManageable(alvo.role)) return res.status(403).json({ error: 'Este usuário não pertence ao estoque.' });
      if (ADMIN_ROLES.includes(alvo.role)) {
        return res.status(400).json({ error: 'Administrador vê e opera tudo; não recebe atribuição por depósito.' });
      }

      const pedidos: { warehouse_id: string; nivel: string }[] = Array.isArray(req.body?.acessos) ? req.body.acessos : [];
      for (const a of pedidos) {
        if (!a?.warehouse_id || !['OPERA', 'CONSULTA'].includes(a?.nivel)) {
          return res.status(400).json({ error: 'Cada acesso precisa de depósito e nível (OPERA ou CONSULTA).' });
        }
      }

      // Só depósitos desta organização — o req.db já filtra, então um id de
      // fora simplesmente não aparece e é recusado.
      const depositos = await depositosDaOrg(req.db!, { incluirUnidadesInativas: true });
      const validos = new Set(depositos.map((d) => d.id));
      const invalido = pedidos.find((a) => !validos.has(a.warehouse_id));
      if (invalido) return res.status(404).json({ error: 'Depósito não encontrado.' });

      // Troca tudo: apaga o que havia e grava o novo conjunto. Um por depósito.
      const { error: dErr } = await req.db!.from('estoque_user_warehouses').delete().eq('user_id', id);
      if (dErr) throw dErr;
      const unicos = new Map(pedidos.map((a) => [a.warehouse_id, a.nivel]));
      if (unicos.size > 0) {
        const { error: iErr } = await req.db!.from('estoque_user_warehouses').insert(
          [...unicos.entries()].map(([warehouse_id, nivel]) => ({ user_id: id, warehouse_id, nivel })),
        );
        if (iErr) throw iErr;
      }

      console.info(`[PUT /api/users/:id/acessos] ${alvo.nome} agora tem ${unicos.size} atribuição(ões), por ${req.user!.matricula}.`);
      res.json({ success: true, acessos: [...unicos.entries()].map(([warehouse_id, nivel]) => ({ warehouse_id, nivel })) });
    } catch (err: any) {
      console.error('[PUT /api/users/:id/acessos] erro:', err.message);
      res.status(500).json({ error: 'Erro ao salvar acessos.' });
    }
  });

  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  return app;
}
