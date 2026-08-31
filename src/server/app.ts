import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import nodemailer from 'nodemailer';
import { supabaseServer } from '../lib/supabaseServer';
import { ADMIN_ROLES, CENTRAL_ROLES, OBRA_ROLES, ALL_INVENTORY_ROLES } from '../shared/constants';

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
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthedUser;
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

/** Monta o app Express com todas as rotas da API, sem iniciar nenhum servidor HTTP. */
export function createApp() {
  const app = express();

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors());
  app.use(express.json());

  // --------------------------- AUTH ---------------------------
  app.post('/api/login', async (req, res) => {
    try {
      const { matricula, senha } = req.body || {};
      if (!matricula || !senha) {
        return res.status(400).json({ error: 'Informe matrícula e senha.' });
      }

      const { data: userRow, error } = await supabaseServer
        .from('users')
        .select('*')
        .or(`matricula.eq.${matricula},email.eq.${matricula}`)
        .neq('role', 'CLIENTE')
        .maybeSingle();

      if (error || !userRow) {
        return res.status(401).json({ error: 'Credenciais inválidas.' });
      }

      const role = userRow.role || (String(userRow.matricula || '').startsWith('E') ? 'ALMOXARIFE_GERAL' : null);
      if (!role || !ALL_INVENTORY_ROLES.includes(role)) {
        return res.status(403).json({ error: 'Este usuário não tem acesso ao sistema de estoque.' });
      }

      const passwordOk = await verifyPassword(senha, userRow.senha);
      if (!passwordOk) {
        return res.status(401).json({ error: 'Credenciais inválidas.' });
      }

      const authedUser: AuthedUser = {
        id: userRow.id,
        nome: userRow.nome,
        matricula: userRow.matricula,
        role,
      };

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
  app.get('/api/data', authenticate, requireRole(ALL_INVENTORY_ROLES), async (_req, res) => {
    try {
      const [materialsRes, movements, staffRes] = await Promise.all([
        supabaseServer.from('materials').select('*').order('nome', { ascending: true }),
        fetchAllRows(() =>
          supabaseServer
            .from('material_movements')
            .select('*, materials(nome)')
            .order('created_at', { ascending: false })
            .order('id', { ascending: false }),
        ),
        supabaseServer.from('users').select('id, nome, matricula, role').neq('role', 'CLIENTE'),
      ]);

      if (materialsRes.error) throw materialsRes.error;

      res.json({
        materials: materialsRes.data || [],
        materialMovements: movements,
        staff: staffRes.data || [],
      });
    } catch (err: any) {
      console.error('[GET /api/data] erro:', err.message);
      res.status(500).json({ error: 'Erro ao carregar dados do estoque.' });
    }
  });

  // --------------------------- MATERIALS CRUD (admin) ---------------------------
  app.post('/api/materials', authenticate, requireRole(ADMIN_ROLES), async (req, res) => {
    try {
      const { nome, unidade_medida, qtd_volumes, fator_multiplicador, estoque_minimo, categoria } = req.body || {};
      if (!nome || !unidade_medida || qtd_volumes == null || fator_multiplicador == null || estoque_minimo == null) {
        return res.status(400).json({ error: 'Preencha todos os campos obrigatórios.' });
      }

      const saldo_central = Number(qtd_volumes) * Number(fator_multiplicador);

      const { data: material, error } = await supabaseServer
        .from('materials')
        .insert({
          nome,
          unidade_medida,
          qtd_volumes,
          fator_multiplicador,
          estoque_minimo,
          categoria: categoria || 'Outros',
          saldo_central,
          saldo_obra: 0,
        })
        .select()
        .single();

      if (error) throw error;

      await supabaseServer.from('material_movements').insert({
        material_id: material.id,
        tipo_operacao: 'ENTRADA_CENTRAL',
        quantidade: saldo_central,
        funcionario_matricula: req.user!.matricula,
        justificativa: 'Cadastro inicial de material',
      });

      res.status(201).json(material);
    } catch (err: any) {
      console.error('[POST /api/materials] erro:', err.message);
      res.status(500).json({ error: 'Erro ao cadastrar material.' });
    }
  });

  app.put('/api/materials/:id', authenticate, requireRole(ADMIN_ROLES), async (req, res) => {
    try {
      const { id } = req.params;
      const { nome, categoria, unidade_medida, estoque_minimo, fator_multiplicador } = req.body || {};

      const updates: Record<string, any> = { updated_at: new Date().toISOString() };
      if (nome !== undefined) updates.nome = nome;
      if (categoria !== undefined) updates.categoria = categoria;
      if (unidade_medida !== undefined) updates.unidade_medida = unidade_medida;
      if (estoque_minimo !== undefined) updates.estoque_minimo = estoque_minimo;
      if (fator_multiplicador !== undefined) updates.fator_multiplicador = fator_multiplicador;

      const { data, error } = await supabaseServer
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

  app.delete('/api/materials/:id', authenticate, requireRole(ADMIN_ROLES), async (req, res) => {
    try {
      const { id } = req.params;

      const { data: material, error: fetchError } = await supabaseServer
        .from('materials')
        .select('*')
        .eq('id', id)
        .single();

      if (fetchError || !material) return res.status(404).json({ error: 'Material não encontrado.' });

      const { data: relatedMovements } = await supabaseServer
        .from('material_movements')
        .select('id, justificativa')
        .eq('material_id', id);

      for (const mov of relatedMovements || []) {
        await supabaseServer
          .from('material_movements')
          .update({ material_id: null, justificativa: `[${material.nome}] ${mov.justificativa || ''}`.trim() })
          .eq('id', mov.id);
      }

      await supabaseServer.from('material_movements').insert({
        material_id: null,
        tipo_operacao: 'EXCLUSÃO',
        quantidade: material.saldo_central,
        funcionario_matricula: req.user!.matricula,
        justificativa: `EXCLUSÃO DO MATERIAL: O material '${material.nome}' (Saldo em estoque era de ${material.saldo_central} ${material.unidade_medida}) foi excluído do sistema permanentemente por ${req.user!.nome}.`,
      });

      const { error: deleteError } = await supabaseServer.from('materials').delete().eq('id', id);
      if (deleteError) throw deleteError;

      res.json({ success: true });
    } catch (err: any) {
      console.error('[DELETE /api/materials/:id] erro:', err.message);
      res.status(500).json({ error: 'Erro ao excluir material.' });
    }
  });

  // --------------------------- EDIÇÃO EM LOTE ---------------------------
  app.patch('/api/materials/bulk-minimo', authenticate, requireRole(ADMIN_ROLES), async (req, res) => {
    try {
      const { ids, estoque_minimo } = req.body || {};
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: 'Selecione ao menos um material.' });
      }
      const minimo = Number(estoque_minimo);
      if (Number.isNaN(minimo) || minimo < 0) {
        return res.status(400).json({ error: 'Informe um estoque mínimo válido.' });
      }

      const { error } = await supabaseServer
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
  app.post('/api/materials/merge', authenticate, requireRole(ADMIN_ROLES), async (req, res) => {
    try {
      const { targetId, sourceIds } = req.body || {};
      const sources: number[] = Array.isArray(sourceIds) ? sourceIds.filter((id) => id !== targetId) : [];
      if (!targetId || sources.length === 0) {
        return res.status(400).json({ error: 'Selecione um material principal e ao menos mais um para unificar.' });
      }

      const { data: allSelected, error: fetchError } = await supabaseServer
        .from('materials')
        .select('*')
        .in('id', [targetId, ...sources]);

      if (fetchError || !allSelected || allSelected.length !== sources.length + 1) {
        return res.status(404).json({ error: 'Um ou mais materiais selecionados não foram encontrados.' });
      }

      const target = allSelected.find((m) => m.id === targetId)!;
      const donors = allSelected.filter((m) => m.id !== targetId);

      const unidadesDiferentes = donors.some((d) => d.unidade_medida !== target.unidade_medida);
      if (unidadesDiferentes) {
        return res.status(400).json({
          error: `As unidades de medida não coincidem (${target.unidade_medida} vs. outras). Ajuste antes de unificar.`,
        });
      }

      const somaCentral = donors.reduce((s, d) => s + Number(d.saldo_central), 0);
      const somaObra = donors.reduce((s, d) => s + Number(d.saldo_obra), 0);
      const novoSaldoCentral = Number(target.saldo_central) + somaCentral;
      const novoSaldoObra = Number(target.saldo_obra) + somaObra;

      const { error: updateError } = await supabaseServer
        .from('materials')
        .update({ saldo_central: novoSaldoCentral, saldo_obra: novoSaldoObra, updated_at: new Date().toISOString() })
        .eq('id', targetId);
      if (updateError) throw updateError;

      if (somaCentral !== 0 || somaObra !== 0) {
        await supabaseServer.from('material_movements').insert({
          material_id: targetId,
          tipo_operacao: 'UNIFICACAO',
          quantidade: somaCentral + somaObra,
          funcionario_matricula: req.user!.matricula,
          justificativa: `Unificação: incorporou o saldo de ${donors.map((d) => `'${d.nome}'`).join(', ')} (Central +${somaCentral}, Obra +${somaObra}).`,
        });
      }

      for (const donor of donors) {
        const { data: relatedMovements } = await supabaseServer
          .from('material_movements')
          .select('id, justificativa')
          .eq('material_id', donor.id);

        for (const mov of relatedMovements || []) {
          await supabaseServer
            .from('material_movements')
            .update({ material_id: null, justificativa: `[${donor.nome}] ${mov.justificativa || ''}`.trim() })
            .eq('id', mov.id);
        }

        await supabaseServer.from('material_movements').insert({
          material_id: null,
          tipo_operacao: 'EXCLUSÃO',
          quantidade: donor.saldo_central + donor.saldo_obra,
          funcionario_matricula: req.user!.matricula,
          justificativa: `UNIFICAÇÃO: o material '${donor.nome}' foi unificado com '${target.nome}' e removido do sistema por ${req.user!.nome}.`,
        });

        await supabaseServer.from('materials').delete().eq('id', donor.id);
      }

      res.json({ success: true, targetId, novoSaldoCentral, novoSaldoObra });
    } catch (err: any) {
      console.error('[POST /api/materials/merge] erro:', err.message);
      res.status(500).json({ error: 'Erro ao unificar materiais.' });
    }
  });

  // --------------------------- MOVEMENTS ---------------------------
  app.post('/api/materials/:id/movement', authenticate, requireRole(ALL_INVENTORY_ROLES), async (req, res) => {
    try {
      const { id } = req.params;
      const { tipo_operacao, quantidade, justificativa } = req.body || {};

      if (!tipo_operacao || quantidade == null || !justificativa) {
        return res.status(400).json({ error: 'Preencha operação, quantidade e justificativa.' });
      }

      const allowedRoles = OPERATION_ROLES[tipo_operacao];
      if (!allowedRoles) return res.status(400).json({ error: 'Operação inválida.' });
      if (!allowedRoles.includes(req.user!.role)) {
        return res.status(403).json({ error: 'Você não tem permissão para esta operação.' });
      }

      const { data: material, error: fetchError } = await supabaseServer
        .from('materials')
        .select('*')
        .eq('id', id)
        .single();

      if (fetchError || !material) return res.status(404).json({ error: 'Material não encontrado.' });

      const q = Number(quantidade);
      let novoSaldoCentral = Number(material.saldo_central);
      let novoSaldoObra = Number(material.saldo_obra);

      switch (tipo_operacao) {
        case 'ENTRADA_CENTRAL':
          novoSaldoCentral += q;
          break;
        case 'SAIDA':
          if (q > novoSaldoCentral) return res.status(400).json({ error: 'Saldo Central insuficiente para esta saída.' });
          novoSaldoCentral -= q;
          break;
        case 'REMESSA_OBRA':
          if (q > novoSaldoCentral) return res.status(400).json({ error: 'Saldo Central insuficiente para esta remessa.' });
          novoSaldoCentral -= q;
          novoSaldoObra += q;
          break;
        case 'CONSUMO_OBRA':
          if (q > novoSaldoObra) return res.status(400).json({ error: 'Saldo de Obra insuficiente para este consumo.' });
          novoSaldoObra -= q;
          break;
        case 'DEVOLUCAO_CENTRAL':
          if (q > novoSaldoObra) return res.status(400).json({ error: 'Saldo de Obra insuficiente para esta devolução.' });
          novoSaldoObra -= q;
          novoSaldoCentral += q;
          break;
        case 'AJUSTE_CENTRAL':
          novoSaldoCentral += q;
          break;
        case 'AJUSTE_OBRA':
          novoSaldoObra += q;
          break;
        default:
          return res.status(400).json({ error: 'Operação inválida.' });
      }

      if (novoSaldoCentral < 0 || novoSaldoObra < 0) {
        return res.status(400).json({ error: 'A operação resultaria em saldo negativo.' });
      }

      const { error: updateError } = await supabaseServer
        .from('materials')
        .update({ saldo_central: novoSaldoCentral, saldo_obra: novoSaldoObra, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (updateError) throw updateError;

      await supabaseServer.from('material_movements').insert({
        material_id: id,
        tipo_operacao,
        quantidade: q,
        funcionario_matricula: req.user!.matricula,
        justificativa,
      });

      const isCritical = novoSaldoCentral <= material.estoque_minimo || novoSaldoObra <= material.estoque_minimo;
      if (isCritical) {
        try {
          const t = await getTransporter();
          if (t) {
            await t.sendMail({
              from: process.env.SMTP_FROM_EMAIL || 'noreply@ssimoveisbrasil.app',
              to: process.env.ADMIN_EMAIL || 'admin@ssimoveis.com',
              subject: `Alerta de Estoque: ${material.nome}`,
              html: `<p>O material <strong>${material.nome}</strong> atingiu nível crítico de estoque.</p>
                     <p>Saldo Central: ${novoSaldoCentral} ${material.unidade_medida}<br/>
                     Saldo Obra: ${novoSaldoObra} ${material.unidade_medida}<br/>
                     Estoque Mínimo: ${material.estoque_minimo} ${material.unidade_medida}</p>
                     <p>Operação: ${tipo_operacao} | Quantidade: ${q} | Responsável: ${req.user!.nome}</p>`,
            });
          }
        } catch (mailErr: any) {
          console.error('[Alerta de Estoque] falha ao enviar e-mail:', mailErr.message);
        }
      }

      res.json({ success: true, material_id: id, novoSaldo: novoSaldoCentral, saldoObra: novoSaldoObra });
    } catch (err: any) {
      console.error('[POST /api/materials/:id/movement] erro:', err.message);
      res.status(500).json({ error: 'Erro ao registrar movimentação.' });
    }
  });

  // --------------------------- RECONTAGEM (ajuste em lote) ---------------------------
  app.post('/api/materials/bulk-recount', authenticate, requireRole(ALL_INVENTORY_ROLES), async (req, res) => {
    try {
      const { location, counts } = req.body || {};
      if (location !== 'CENTRAL' && location !== 'OBRA') {
        return res.status(400).json({ error: 'Local inválido.' });
      }
      const tipo_operacao = location === 'CENTRAL' ? 'AJUSTE_CENTRAL' : 'AJUSTE_OBRA';
      if (!OPERATION_ROLES[tipo_operacao].includes(req.user!.role)) {
        return res.status(403).json({ error: 'Você não tem permissão para ajustar este estoque.' });
      }
      if (!Array.isArray(counts) || counts.length === 0) {
        return res.status(400).json({ error: 'Nenhuma contagem enviada.' });
      }

      const applied: { material_id: number; nome: string; diferenca: number }[] = [];
      const criticalItems: { nome: string; novoSaldo: number; estoque_minimo: number }[] = [];

      for (const entry of counts) {
        const materialId = entry?.material_id;
        const contagem = Number(entry?.contagem);
        if (materialId == null || Number.isNaN(contagem)) continue;

        const { data: material } = await supabaseServer.from('materials').select('*').eq('id', materialId).single();
        if (!material) continue;

        const saldoAtual = location === 'CENTRAL' ? Number(material.saldo_central) : Number(material.saldo_obra);
        const diferenca = contagem - saldoAtual;
        if (diferenca === 0) continue;
        if (contagem < 0) continue;

        const novoSaldoCentral = location === 'CENTRAL' ? contagem : Number(material.saldo_central);
        const novoSaldoObra = location === 'OBRA' ? contagem : Number(material.saldo_obra);

        const { error: updateError } = await supabaseServer
          .from('materials')
          .update({ saldo_central: novoSaldoCentral, saldo_obra: novoSaldoObra, updated_at: new Date().toISOString() })
          .eq('id', materialId);
        if (updateError) continue;

        await supabaseServer.from('material_movements').insert({
          material_id: materialId,
          tipo_operacao,
          quantidade: diferenca,
          funcionario_matricula: req.user!.matricula,
          justificativa: `Recontagem diária: sistema indicava ${saldoAtual}, contagem física apontou ${contagem}.`,
        });

        applied.push({ material_id: materialId, nome: material.nome, diferenca });

        const novoSaldoLocal = location === 'CENTRAL' ? novoSaldoCentral : novoSaldoObra;
        if (novoSaldoLocal <= material.estoque_minimo) {
          criticalItems.push({ nome: material.nome, novoSaldo: novoSaldoLocal, estoque_minimo: material.estoque_minimo });
        }
      }

      if (criticalItems.length > 0) {
        try {
          const t = await getTransporter();
          if (t) {
            await t.sendMail({
              from: process.env.SMTP_FROM_EMAIL || 'noreply@ssimoveisbrasil.app',
              to: process.env.ADMIN_EMAIL || 'admin@ssimoveis.com',
              subject: `Recontagem (${location === 'CENTRAL' ? 'Central' : 'Obra'}): ${criticalItems.length} item(ns) em estoque crítico`,
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

  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  return app;
}
