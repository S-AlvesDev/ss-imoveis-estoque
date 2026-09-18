import express from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { supabaseServer } from '../../lib/supabaseServer';
import { getTransporter } from '../../server/mail';
import { gerarToken, hashDoToken, tokenPlausivel, tokenValido, VALIDADE_DO_TOKEN_MS } from '../../server/senha';
import { assinarSessao, autenticar, exigir, esquecerUsuario, type RequisicaoAtende } from './auth';
import { emailDeBoasVindasAtende, emailDeConviteAtende, emailDeRecuperacaoAtende, linkDeRedefinicaoAtende, remetenteAtende } from './email';
import { validarCadastro, validarEmpresa, validarTime, validarNovoFuncionario, validarEdicaoDeFuncionario, validarEmail, validarSenha } from '../shared/validacao';
import { NOME_DO_PAPEL } from '../shared/papeis';
import { lerSessaoDoStokAi, situacaoDaPonte, entrarPelaPonte, ErroDaPonte } from './ponte';
import { processarWebhook, conectar, situacaoDaConexao, desconectar, conexaoDaEmpresa } from './whatsapp';
import { listarConversas, conversaPorId, mensagensDaConversa, urlDaMidia, enviarMensagem, prepararUpload, notaInterna, assumir, encerrar, reabrir, marcarComoLida, atualizarCliente, conversasDoCliente, listarEtiquetas, criarEtiqueta, definirEtiquetas, delta, triagemDaConversa, corrigirTriagem, atualizarLead, transferir, eventosDaConversa, definirPresenca, ErroDeConversa, type Filtro } from './conversas';
import { simular } from './triagem';
import { montarDashboard, PERIODOS } from './dashboard';
import type { PeriodoDoDashboard } from '../shared/tipos';
import type { BootstrapAtende, Empresa, Funcionario, Time, SessaoAtende } from '../shared/tipos';

/**
 * As rotas do Atende Aí, montadas em /api/atende pelo createApp() do Stok Aí
 * — o único ponto de contato entre os dois produtos no servidor.
 *
 * Tudo que é dado passa por `req.dbAtende` (preso à empresa da sessão). As
 * rotas públicas (cadastro, login, senha) usam a chave de serviço porque
 * acontecem antes de existir empresa no contexto — como no Stok Aí.
 */

const EMPRESA_COLUNAS = 'id, nome, slug, segmento, descricao, produtos_servicos, informacoes_ia, faq, horario_atendimento, regras_atendimento, mensagem_fora_do_horario, triagem_ativa, responde_fora_do_horario, criado_em';
const USUARIO_COLUNAS = 'id, nome, email, papel, ativo, presenca, presenca_em, ultimo_acesso, criado_em';

/** E-mail vira padrão de ilike sem curingas: % e _ escapados. */
const padraoDeEmail = (email: string) => email.replace(/[\\%_]/g, '\\$&');

async function enviarEmail(para: string, conteudo: { subject: string; html: string }, contexto: string) {
  try {
    const t = await getTransporter();
    if (!t) return;
    await t.sendMail({ from: remetenteAtende(), to: para, ...conteudo });
  } catch (e: any) {
    console.error(`[atende ${contexto}] e-mail:`, e.message);
  }
}

export function criarRouterAtende(): express.Router {
  const r = express.Router();

  // O corpo. Arquivos NÃO passam por aqui: sobem direto para o Storage por URL assinada.
  r.use(express.json({ limit: '1mb' }));

  // O teto geral do produto: por pessoa (o id do token, sem validar — a validação vem depois),
  // ou por IP para quem não está logado. Folgado para a central atualizando a cada 4 s.
  r.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 4000,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      keyGenerator: (req) => {
        const token = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null;
        const id = token ? (jwt.decode(token) as any)?.id : null;
        return typeof id === 'number' ? `u:${id}` : ipKeyGenerator(req.ip ?? '');
      },
      message: { error: 'Muitas requisições. Aguarde alguns minutos.' },
    }),
  );

  // -------------------------------------------------------------------------
  //  Limites (próprios do produto; o geral do /api continua valendo por cima)
  // -------------------------------------------------------------------------
  const cadastroLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 5, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Muitas contas criadas a partir desta rede. Tente novamente em uma hora.' } });
  const loginContaLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    keyGenerator: (req) => String(req.body?.email ?? '').trim().toLowerCase().slice(0, 120) || 'sem-email',
    message: { error: 'Muitas tentativas para esta conta. Aguarde 15 minutos.' },
  });
  const loginIpLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 60, standardHeaders: 'draft-7', legacyHeaders: false, skipSuccessfulRequests: true, message: { error: 'Muitas tentativas a partir desta rede. Aguarde alguns minutos.' } });
  const esqueciLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Muitos pedidos a partir desta rede. Tente novamente em uma hora.' } });
  const redefinirLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Muitas tentativas. Aguarde alguns minutos.' } });

  // -------------------------------------------------------------------------
  //  Público: cadastro, login, senha
  // -------------------------------------------------------------------------
  r.post('/cadastro', cadastroLimiter, async (req, res) => {
    try {
      const v = validarCadastro(req.body);
      if (!v.ok) return res.status(400).json({ error: v.erro });
      const hash = await bcrypt.hash(v.valor.senha, 10);
      const { data, error } = await supabaseServer.rpc('atende_criar_empresa', {
        p_empresa: v.valor.empresa,
        p_segmento: v.valor.segmento,
        p_nome: v.valor.nome,
        p_email: v.valor.email,
        p_senha_hash: hash,
      });
      if (error) {
        if (/Já existe uma conta/.test(error.message)) return res.status(409).json({ error: 'Já existe uma conta com este e-mail. Entre com ela, ou use outro e-mail.' });
        if (error.code === '23514' || /caracteres|inválido/.test(error.message)) return res.status(400).json({ error: error.message });
        throw error;
      }
      const criado = Array.isArray(data) ? data[0] : data;
      if (!criado?.empresa_id || !criado?.usuario_id) throw new Error('atende_criar_empresa não devolveu ids.');

      const sessao: SessaoAtende = { id: Number(criado.usuario_id), nome: v.valor.nome, email: v.valor.email, papel: 'admin', empresa_id: criado.empresa_id };
      console.info('[atende cadastro] empresa criada', { slug: criado.slug, ip: req.ip });
      await enviarEmail(v.valor.email, emailDeBoasVindasAtende(v.valor.nome, v.valor.empresa), 'cadastro');
      res.status(201).json({ sessao, token: assinarSessao(sessao) });
    } catch (err: any) {
      console.error('[POST /api/atende/cadastro] erro:', err.message);
      res.status(500).json({ error: 'Não foi possível criar a conta agora. Tente novamente em instantes.' });
    }
  });

  r.post('/login', loginIpLimiter, loginContaLimiter, async (req, res) => {
    try {
      const email = validarEmail(req.body?.email);
      const senha = String(req.body?.senha ?? '');
      if (!email.ok || !senha) return res.status(400).json({ error: 'Informe e-mail e senha.' });

      const { data: u, error } = await supabaseServer.from('atende_usuarios').select(`${USUARIO_COLUNAS}, senha, empresa_id`).ilike('email', padraoDeEmail(email.valor)).limit(1).maybeSingle();
      if (error) throw error;
      // Mesma resposta exista ou não a conta, e a senha nunca vai para o log.
      if (!u || !u.ativo || !(await bcrypt.compare(senha, u.senha))) {
        console.warn('[atende login] falha', { ip: req.ip, existe: Boolean(u) });
        return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
      }
      await supabaseServer.from('atende_usuarios').update({ ultimo_acesso: new Date().toISOString() }).eq('id', u.id);
      const sessao: SessaoAtende = { id: Number(u.id), nome: u.nome, email: u.email, papel: u.papel, empresa_id: u.empresa_id };
      res.json({ sessao, token: assinarSessao(sessao) });
    } catch (err: any) {
      console.error('[POST /api/atende/login] erro:', err.message);
      res.status(500).json({ error: 'Erro interno ao autenticar.' });
    }
  });

  r.post('/senha/esqueci', esqueciLimiter, async (req, res) => {
    const resposta = { ok: true, mensagem: 'Se existir uma conta com este e-mail, enviamos as instruções. Confira também o spam.' };
    try {
      const email = validarEmail(req.body?.email);
      if (!email.ok) return res.status(400).json({ error: email.erro });
      const t = await getTransporter();
      if (!t) return res.status(503).json({ error: 'A recuperação por e-mail está indisponível no momento. Fale com o administrador da sua empresa.' });

      const { data: u } = await supabaseServer.from('atende_usuarios').select('id, nome, email').ilike('email', padraoDeEmail(email.valor)).eq('ativo', true).limit(1).maybeSingle();
      if (!u) return res.json(resposta);

      const { token, hash } = gerarToken();
      const { error } = await supabaseServer.from('atende_recuperacoes_senha').insert({ usuario_id: u.id, token_hash: hash, expira_em: new Date(Date.now() + VALIDADE_DO_TOKEN_MS).toISOString() });
      if (error) throw error;
      await t.sendMail({ from: remetenteAtende(), to: u.email, ...emailDeRecuperacaoAtende(u.nome, linkDeRedefinicaoAtende(token)) });
      console.info('[atende senha] link enviado', { usuario_id: u.id, ip: req.ip });
      res.json(resposta);
    } catch (err: any) {
      console.error('[POST /api/atende/senha/esqueci] erro:', err.message);
      res.status(500).json({ error: 'Não foi possível enviar agora. Tente novamente em instantes.' });
    }
  });

  r.post('/senha/redefinir', redefinirLimiter, async (req, res) => {
    try {
      const { token } = req.body || {};
      const senha = validarSenha(req.body?.senha);
      if (!senha.ok) return res.status(400).json({ error: senha.erro });
      if (!tokenPlausivel(token)) return res.status(400).json({ error: 'Este link não é válido. Peça um novo em "Esqueci minha senha".' });

      const { data: pedido, error } = await supabaseServer.from('atende_recuperacoes_senha').select('id, usuario_id, expira_em, usado_em').eq('token_hash', hashDoToken(token)).maybeSingle();
      if (error) throw error;
      if (!pedido || !tokenValido({ expires_at: pedido.expira_em, used_at: pedido.usado_em })) {
        return res.status(400).json({ error: 'Este link expirou ou já foi usado. Peça um novo em "Esqueci minha senha".' });
      }
      const hash = await bcrypt.hash(senha.valor, 10);
      const { data: u, error: erroUpdate } = await supabaseServer.from('atende_usuarios').update({ senha: hash }).eq('id', pedido.usuario_id).eq('ativo', true).select(`${USUARIO_COLUNAS}, empresa_id`).maybeSingle();
      if (erroUpdate) throw erroUpdate;
      if (!u) return res.status(400).json({ error: 'Esta conta não está mais ativa. Procure o administrador.' });
      await supabaseServer.from('atende_recuperacoes_senha').update({ usado_em: new Date().toISOString() }).eq('usuario_id', pedido.usuario_id).is('usado_em', null);
      esquecerUsuario(Number(u.id));

      const sessao: SessaoAtende = { id: Number(u.id), nome: u.nome, email: u.email, papel: u.papel, empresa_id: u.empresa_id };
      console.info('[atende senha] redefinida', { usuario_id: u.id, ip: req.ip });
      res.json({ ok: true, sessao, token: assinarSessao(sessao) });
    } catch (err: any) {
      console.error('[POST /api/atende/senha/redefinir] erro:', err.message);
      res.status(500).json({ error: 'Não foi possível redefinir agora. Tente novamente em instantes.' });
    }
  });

  // -------------------------------------------------------------------------
  //  A ponte com o Stok Aí: entra com a sessão de lá (ver ponte.ts)
  // -------------------------------------------------------------------------
  const ponteLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 60, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Muitas tentativas. Aguarde alguns minutos.' } });

  r.post('/ponte/situacao', ponteLimiter, async (req, res) => {
    try {
      const sessao = lerSessaoDoStokAi(String(req.body?.token ?? ''));
      if (!sessao) return res.status(401).json({ error: 'Sessão do Stok Aí inválida ou expirada.' });
      const situacao = await situacaoDaPonte(sessao);
      if (!situacao) return res.status(401).json({ error: 'Sessão do Stok Aí não vale mais.' });
      res.json(situacao);
    } catch (err: any) {
      console.error('[POST /api/atende/ponte/situacao] erro:', err.message);
      res.status(500).json({ error: 'Não foi possível conferir a sua conta do Stok Aí.' });
    }
  });

  r.post('/ponte/entrar', ponteLimiter, async (req, res) => {
    try {
      const sessao = lerSessaoDoStokAi(String(req.body?.token ?? ''));
      if (!sessao) return res.status(401).json({ error: 'Sessão do Stok Aí inválida ou expirada.' });
      const r2 = await entrarPelaPonte(sessao);
      res.json(r2);
    } catch (err: any) {
      if (err instanceof ErroDaPonte) return res.status(err.status).json({ error: err.message });
      console.error('[POST /api/atende/ponte/entrar] erro:', err.message);
      res.status(500).json({ error: 'Não foi possível entrar com a conta do Stok Aí agora.' });
    }
  });

  // -------------------------------------------------------------------------
  //  O webhook da Evolution (uma instância por empresa; a empresa vem do nome
  //  da instância). Trabalha antes de responder: na Vercel, a função congela
  //  quando a resposta sai.
  // -------------------------------------------------------------------------
  r.post('/webhooks/whatsapp', async (req, res) => {
    const esperado = process.env.EVOLUTION_WEBHOOK_TOKEN;
    if (!esperado) return res.status(503).json({ error: 'Webhook do WhatsApp não configurado (EVOLUTION_WEBHOOK_TOKEN).' });
    if (req.query.token !== esperado) return res.status(401).json({ error: 'Token inválido.' });
    try {
      const r2 = await processarWebhook(req.body);
      res.json({ ok: true, ...r2 });
    } catch (err: any) {
      console.error('[atende webhook] erro:', err.message);
      res.status(500).json({ error: 'Falha ao processar.' });
    }
  });

  // -------------------------------------------------------------------------
  //  Logado
  // -------------------------------------------------------------------------
  r.use(autenticar);

  async function carregarEmpresa(req: RequisicaoAtende): Promise<Empresa> {
    const { data, error } = await req.dbAtende!.from('atende_empresas').select(EMPRESA_COLUNAS).eq('id', req.sessao!.empresa_id).single();
    if (error || !data) throw error ?? new Error('empresa não encontrada');
    return { ...data, faq: Array.isArray(data.faq) ? data.faq : [], horario_atendimento: data.horario_atendimento ?? {} } as Empresa;
  }

  async function carregarTimes(req: RequisicaoAtende): Promise<Time[]> {
    const [{ data: times, error }, { data: membros, error: erroM }] = await Promise.all([
      req.dbAtende!.from('atende_times').select('id, nome, descricao_para_ia, palavras_chave, ordem, ativo').order('ordem', { ascending: true }).order('nome', { ascending: true }),
      req.dbAtende!.from('atende_time_membros').select('time_id, usuario_id, supervisiona'),
    ]);
    if (error) throw error;
    if (erroM) throw erroM;
    return ((times || []) as any[]).map((t) => ({
      ...t,
      palavras_chave: t.palavras_chave ?? [],
      membros: ((membros || []) as any[]).filter((m) => m.time_id === t.id).map((m) => Number(m.usuario_id)),
      supervisores: ((membros || []) as any[]).filter((m) => m.time_id === t.id && m.supervisiona).map((m) => Number(m.usuario_id)),
    }));
  }

  async function carregarEquipe(req: RequisicaoAtende): Promise<Funcionario[]> {
    const [{ data: pessoas, error }, { data: membros, error: erroM }] = await Promise.all([
      req.dbAtende!.from('atende_usuarios').select(USUARIO_COLUNAS).order('nome', { ascending: true }),
      req.dbAtende!.from('atende_time_membros').select('time_id, usuario_id'),
    ]);
    if (error) throw error;
    if (erroM) throw erroM;
    return ((pessoas || []) as any[]).map((p) => ({ ...p, id: Number(p.id), times: ((membros || []) as any[]).filter((m) => Number(m.usuario_id) === Number(p.id)).map((m) => m.time_id) }));
  }

  /** Um supervisor supervisiona os times de que é membro; admin, todos. A flag no membro segue o papel. */
  async function gravarTimesDoUsuario(req: RequisicaoAtende, usuarioId: number, papel: string, times: string[]) {
    const db = req.dbAtende!;
    const { error: erroDel } = await db.from('atende_time_membros').delete().eq('usuario_id', usuarioId);
    if (erroDel) throw erroDel;
    if (times.length === 0) return;
    // Só times desta empresa (a lista veio do navegador).
    const { data: validos, error } = await db.from('atende_times').select('id').in('id', times);
    if (error) throw error;
    const ids = ((validos || []) as any[]).map((t) => t.id);
    if (ids.length === 0) return;
    const { error: erroIns } = await db.from('atende_time_membros').insert(ids.map((time_id: string) => ({ time_id, usuario_id: usuarioId, supervisiona: papel === 'supervisor' })));
    if (erroIns) throw erroIns;
  }

  r.get('/me', (req: RequisicaoAtende, res) => res.json({ sessao: req.sessao }));

  r.get('/bootstrap', async (req: RequisicaoAtende, res) => {
    try {
      const [empresa, times, equipe, conexao] = await Promise.all([carregarEmpresa(req), carregarTimes(req), carregarEquipe(req), conexaoDaEmpresa(req.sessao!.empresa_id)]);
      const resposta: BootstrapAtende = { sessao: req.sessao!, empresa, times, equipe, conexao: conexao ? { id: conexao.id, instancia: conexao.instancia, numero: conexao.numero, estado: conexao.estado, conectado_em: conexao.conectado_em, ultimo_evento_em: conexao.ultimo_evento_em } : null };
      res.json(resposta);
    } catch (err: any) {
      console.error('[GET /api/atende/bootstrap] erro:', err.message);
      res.status(500).json({ error: 'Erro ao carregar os dados da empresa.' });
    }
  });

  // ---- Empresa
  r.patch('/empresa', exigir('empresa.gerir'), async (req: RequisicaoAtende, res) => {
    try {
      const v = validarEmpresa(req.body);
      if (!v.ok) return res.status(400).json({ error: v.erro });
      const { error } = await req.dbAtende!.from('atende_empresas').update(v.valor).eq('id', req.sessao!.empresa_id);
      if (error) throw error;
      res.json({ empresa: await carregarEmpresa(req) });
    } catch (err: any) {
      console.error('[PATCH /api/atende/empresa] erro:', err.message);
      res.status(500).json({ error: 'Erro ao salvar a empresa.' });
    }
  });

  // ---- Times
  r.post('/times', exigir('times.gerir'), async (req: RequisicaoAtende, res) => {
    try {
      const v = validarTime(req.body);
      if (!v.ok) return res.status(400).json({ error: v.erro });
      const { error } = await req.dbAtende!.from('atende_times').insert(v.valor);
      if (error) {
        if (error.code === '23505') return res.status(409).json({ error: 'Já existe um time com esse nome.' });
        throw error;
      }
      res.status(201).json({ times: await carregarTimes(req) });
    } catch (err: any) {
      console.error('[POST /api/atende/times] erro:', err.message);
      res.status(500).json({ error: 'Erro ao criar o time.' });
    }
  });

  r.patch('/times/:id', exigir('times.gerir'), async (req: RequisicaoAtende, res) => {
    try {
      const { data: atual } = await req.dbAtende!.from('atende_times').select('nome, descricao_para_ia, palavras_chave, ordem, ativo').eq('id', req.params.id).maybeSingle();
      if (!atual) return res.status(404).json({ error: 'Time não encontrado.' });
      const v = validarTime(req.body, atual);
      if (!v.ok) return res.status(400).json({ error: v.erro });
      const { error } = await req.dbAtende!.from('atende_times').update(v.valor).eq('id', req.params.id);
      if (error) {
        if (error.code === '23505') return res.status(409).json({ error: 'Já existe um time com esse nome.' });
        throw error;
      }
      res.json({ times: await carregarTimes(req) });
    } catch (err: any) {
      console.error('[PATCH /api/atende/times/:id] erro:', err.message);
      res.status(500).json({ error: 'Erro ao salvar o time.' });
    }
  });

  r.delete('/times/:id', exigir('times.gerir'), async (req: RequisicaoAtende, res) => {
    try {
      const { data: atual } = await req.dbAtende!.from('atende_times').select('id').eq('id', req.params.id).maybeSingle();
      if (!atual) return res.status(404).json({ error: 'Time não encontrado.' });
      const { error } = await req.dbAtende!.from('atende_times').delete().eq('id', req.params.id);
      if (error) throw error;
      res.json({ times: await carregarTimes(req) });
    } catch (err: any) {
      console.error('[DELETE /api/atende/times/:id] erro:', err.message);
      res.status(500).json({ error: 'Erro ao excluir o time.' });
    }
  });

  // ---- Equipe
  r.post('/equipe', exigir('equipe.gerir'), async (req: RequisicaoAtende, res) => {
    try {
      const v = validarNovoFuncionario(req.body);
      if (!v.ok) return res.status(400).json({ error: v.erro });
      const hash = await bcrypt.hash(v.valor.senha, 10);
      const { data: novo, error } = await req.dbAtende!.from('atende_usuarios').insert({ nome: v.valor.nome, email: v.valor.email, senha: hash, papel: v.valor.papel }).select('id').single();
      if (error) {
        if (error.code === '23505') return res.status(409).json({ error: 'Já existe uma conta com este e-mail.' });
        throw error;
      }
      await gravarTimesDoUsuario(req, Number(novo.id), v.valor.papel, v.valor.times);

      // Convite: um link para a pessoa criar a própria senha (vale 1 h). Se não
      // houver SMTP, a senha que o administrador definiu é a que vale.
      const { token, hash: tokenHash } = gerarToken();
      const { error: erroToken } = await supabaseServer.from('atende_recuperacoes_senha').insert({ usuario_id: novo.id, token_hash: tokenHash, expira_em: new Date(Date.now() + VALIDADE_DO_TOKEN_MS).toISOString() });
      if (!erroToken) {
        const empresa = await carregarEmpresa(req);
        await enviarEmail(v.valor.email, emailDeConviteAtende(v.valor.nome, empresa.nome, NOME_DO_PAPEL[v.valor.papel], linkDeRedefinicaoAtende(token)), 'convite');
      }
      res.status(201).json({ equipe: await carregarEquipe(req), times: await carregarTimes(req) });
    } catch (err: any) {
      console.error('[POST /api/atende/equipe] erro:', err.message);
      res.status(500).json({ error: 'Erro ao cadastrar a pessoa.' });
    }
  });

  r.patch('/equipe/:id', exigir('equipe.gerir'), async (req: RequisicaoAtende, res) => {
    try {
      const id = Number(req.params.id);
      const v = validarEdicaoDeFuncionario(req.body);
      if (!v.ok) return res.status(400).json({ error: v.erro });
      const { data: alvo } = await req.dbAtende!.from('atende_usuarios').select('id, papel, ativo').eq('id', id).maybeSingle();
      if (!alvo) return res.status(404).json({ error: 'Pessoa não encontrada.' });

      const ehEu = Number(alvo.id) === req.sessao!.id;
      const perdeAdmin = alvo.papel === 'admin' && ((v.valor.papel && v.valor.papel !== 'admin') || v.valor.ativo === false);
      if (perdeAdmin) {
        // Não deixa a empresa sem administrador.
        const { count } = await req.dbAtende!.from('atende_usuarios').select('id', { count: 'exact', head: true }).eq('papel', 'admin').eq('ativo', true);
        if ((count ?? 0) <= 1) return res.status(400).json({ error: ehEu ? 'Você é o único administrador: promova outra pessoa antes.' : 'Este é o único administrador da empresa.' });
      }
      if (ehEu && v.valor.ativo === false) return res.status(400).json({ error: 'Você não pode desativar a própria conta.' });

      const patch: Record<string, unknown> = {};
      if (v.valor.nome !== undefined) patch.nome = v.valor.nome;
      if (v.valor.email !== undefined) patch.email = v.valor.email;
      if (v.valor.papel !== undefined) patch.papel = v.valor.papel;
      if (v.valor.ativo !== undefined) patch.ativo = v.valor.ativo;
      if (v.valor.senha) patch.senha = await bcrypt.hash(v.valor.senha, 10);
      if (Object.keys(patch).length) {
        const { error } = await req.dbAtende!.from('atende_usuarios').update(patch).eq('id', id);
        if (error) {
          if (error.code === '23505') return res.status(409).json({ error: 'Já existe uma conta com este e-mail.' });
          throw error;
        }
      }
      const papelFinal = v.valor.papel ?? alvo.papel;
      if (v.valor.times !== undefined) await gravarTimesDoUsuario(req, id, papelFinal, v.valor.times);
      else if (v.valor.papel !== undefined && v.valor.papel !== alvo.papel) {
        // Mudou o papel: a flag de supervisão nos times acompanha.
        await req.dbAtende!.from('atende_time_membros').update({ supervisiona: papelFinal === 'supervisor' }).eq('usuario_id', id);
      }
      esquecerUsuario(id);
      res.json({ equipe: await carregarEquipe(req), times: await carregarTimes(req) });
    } catch (err: any) {
      console.error('[PATCH /api/atende/equipe/:id] erro:', err.message);
      res.status(500).json({ error: 'Erro ao salvar a pessoa.' });
    }
  });

  /** Desativar, não apagar: o histórico de atendimento continua apontando para a pessoa. */
  r.delete('/equipe/:id', exigir('equipe.gerir'), async (req: RequisicaoAtende, res) => {
    try {
      const id = Number(req.params.id);
      if (id === req.sessao!.id) return res.status(400).json({ error: 'Você não pode desativar a própria conta.' });
      const { data: alvo } = await req.dbAtende!.from('atende_usuarios').select('id, papel').eq('id', id).maybeSingle();
      if (!alvo) return res.status(404).json({ error: 'Pessoa não encontrada.' });
      if (alvo.papel === 'admin') {
        const { count } = await req.dbAtende!.from('atende_usuarios').select('id', { count: 'exact', head: true }).eq('papel', 'admin').eq('ativo', true);
        if ((count ?? 0) <= 1) return res.status(400).json({ error: 'Este é o único administrador da empresa.' });
      }
      const { error } = await req.dbAtende!.from('atende_usuarios').update({ ativo: false, presenca: 'offline' }).eq('id', id);
      if (error) throw error;
      await req.dbAtende!.from('atende_time_membros').delete().eq('usuario_id', id);
      esquecerUsuario(id);
      res.json({ equipe: await carregarEquipe(req), times: await carregarTimes(req) });
    } catch (err: any) {
      console.error('[DELETE /api/atende/equipe/:id] erro:', err.message);
      res.status(500).json({ error: 'Erro ao desativar a pessoa.' });
    }
  });

  // ---- WhatsApp da empresa
  r.get('/whatsapp', exigir('whatsapp.gerir'), async (req: RequisicaoAtende, res) => {
    try {
      res.json(await situacaoDaConexao(req.sessao!.empresa_id));
    } catch (err: any) {
      console.error('[GET /api/atende/whatsapp] erro:', err.message);
      res.status(500).json({ error: 'Não foi possível consultar o WhatsApp.' });
    }
  });
  r.post('/whatsapp/conectar', exigir('whatsapp.gerir'), async (req: RequisicaoAtende, res) => {
    try {
      res.json(await conectar(req.sessao!.empresa_id));
    } catch (err: any) {
      console.error('[POST /api/atende/whatsapp/conectar] erro:', err.message);
      res.status(502).json({ error: `Não foi possível falar com o WhatsApp: ${err.message}` });
    }
  });
  r.delete('/whatsapp', exigir('whatsapp.gerir'), async (req: RequisicaoAtende, res) => {
    try {
      await desconectar(req.sessao!.empresa_id);
      res.json({ ok: true });
    } catch (err: any) {
      console.error('[DELETE /api/atende/whatsapp] erro:', err.message);
      res.status(502).json({ error: `Não foi possível desconectar: ${err.message}` });
    }
  });

  // ---- Conversas
  const tratar = (res: express.Response, err: any, rotulo: string, mensagem: string) => {
    if (err instanceof ErroDeConversa) return res.status(err.status).json({ error: err.message });
    console.error(`[${rotulo}] erro:`, err.message);
    return res.status(500).json({ error: mensagem });
  };
  const FILTROS: readonly Filtro[] = ['abertas', 'minhas', 'fila', 'aguardando', 'encerradas', 'todas'];

  r.get('/conversas', exigir('conversas.atender'), async (req: RequisicaoAtende, res) => {
    try {
      const filtro = (FILTROS as readonly string[]).includes(String(req.query.filtro)) ? (String(req.query.filtro) as Filtro) : 'abertas';
      res.json({ conversas: await listarConversas(req, { filtro, timeId: typeof req.query.time === 'string' ? req.query.time : null, busca: typeof req.query.busca === 'string' ? req.query.busca : '' }) });
    } catch (err: any) {
      tratar(res, err, 'GET /api/atende/conversas', 'Erro ao listar as conversas.');
    }
  });

  r.get('/sync', exigir('conversas.atender'), async (req: RequisicaoAtende, res) => {
    try {
      const desde = typeof req.query.desde === 'string' && !Number.isNaN(Date.parse(req.query.desde)) ? req.query.desde : null;
      res.json(await delta(req, desde));
    } catch (err: any) {
      tratar(res, err, 'GET /api/atende/sync', 'Erro ao sincronizar.');
    }
  });

  r.get('/conversas/:id', exigir('conversas.atender'), async (req: RequisicaoAtende, res) => {
    try {
      const conversa = await conversaPorId(req, req.params.id);
      if (!conversa) return res.status(404).json({ error: 'Conversa não encontrada.' });
      const [mensagens, anteriores] = await Promise.all([mensagensDaConversa(req, conversa.id, { antesDe: typeof req.query.antes_de === 'string' ? req.query.antes_de : null }), conversasDoCliente(req, conversa.cliente_id)]);
      res.json({ conversa, mensagens, anteriores: anteriores.filter((c) => c.id !== conversa.id) });
    } catch (err: any) {
      tratar(res, err, 'GET /api/atende/conversas/:id', 'Erro ao abrir a conversa.');
    }
  });

  /** Passo 1 de um arquivo/áudio: a URL para o navegador subir direto no Storage. */
  r.post('/conversas/:id/midias/url', exigir('conversas.atender'), async (req: RequisicaoAtende, res) => {
    try {
      res.json(await prepararUpload(req, req.params.id, req.body ?? {}));
    } catch (err: any) {
      tratar(res, err, 'POST /api/atende/conversas/:id/midias/url', 'Não foi possível preparar o envio.');
    }
  });

  r.post('/conversas/:id/mensagens', exigir('conversas.atender'), async (req: RequisicaoAtende, res) => {
    try {
      res.status(201).json({ mensagem: await enviarMensagem(req, req.params.id, req.body ?? {}) });
    } catch (err: any) {
      tratar(res, err, 'POST /api/atende/conversas/:id/mensagens', 'Não foi possível enviar.');
    }
  });

  r.post('/conversas/:id/notas', exigir('conversas.atender'), async (req: RequisicaoAtende, res) => {
    try {
      res.status(201).json({ mensagem: await notaInterna(req, req.params.id, req.body?.texto) });
    } catch (err: any) {
      tratar(res, err, 'POST /api/atende/conversas/:id/notas', 'Não foi possível anotar.');
    }
  });

  r.post('/conversas/:id/assumir', exigir('conversas.atender'), async (req: RequisicaoAtende, res) => {
    try {
      res.json({ conversa: await assumir(req, req.params.id) });
    } catch (err: any) {
      tratar(res, err, 'POST /api/atende/conversas/:id/assumir', 'Não foi possível assumir.');
    }
  });

  r.post('/conversas/:id/encerrar', exigir('conversas.atender'), async (req: RequisicaoAtende, res) => {
    try {
      res.json({ conversa: await encerrar(req, req.params.id, req.body?.motivo) });
    } catch (err: any) {
      tratar(res, err, 'POST /api/atende/conversas/:id/encerrar', 'Não foi possível encerrar.');
    }
  });

  r.post('/conversas/:id/reabrir', exigir('conversas.atender'), async (req: RequisicaoAtende, res) => {
    try {
      res.json({ conversa: await reabrir(req, req.params.id) });
    } catch (err: any) {
      tratar(res, err, 'POST /api/atende/conversas/:id/reabrir', 'Não foi possível reabrir.');
    }
  });

  r.post('/conversas/:id/lida', exigir('conversas.atender'), async (req: RequisicaoAtende, res) => {
    try {
      await marcarComoLida(req, req.params.id);
      res.json({ ok: true });
    } catch (err: any) {
      tratar(res, err, 'POST /api/atende/conversas/:id/lida', 'Não foi possível marcar como lida.');
    }
  });

  r.put('/conversas/:id/etiquetas', exigir('conversas.atender'), async (req: RequisicaoAtende, res) => {
    try {
      res.json({ conversa: await definirEtiquetas(req, req.params.id, req.body?.etiquetas) });
    } catch (err: any) {
      tratar(res, err, 'PUT /api/atende/conversas/:id/etiquetas', 'Não foi possível salvar as etiquetas.');
    }
  });

  // ---- Dashboard (Etapa 5): contagens do banco, no período pedido
  r.get('/dashboard', exigir('dashboard.ver'), async (req: RequisicaoAtende, res) => {
    try {
      const periodo = (PERIODOS as readonly string[]).includes(String(req.query.periodo)) ? (String(req.query.periodo) as PeriodoDoDashboard) : '7d';
      res.json(await montarDashboard(req, periodo));
    } catch (err: any) {
      tratar(res, err, 'GET /api/atende/dashboard', 'Erro ao montar o dashboard.');
    }
  });

  // ---- Supervisão (Etapa 4): transferir, auditoria, presença
  r.post('/conversas/:id/transferir', exigir('conversas.atender'), async (req: RequisicaoAtende, res) => {
    try {
      res.json({ conversa: await transferir(req, req.params.id, req.body ?? {}) });
    } catch (err: any) {
      tratar(res, err, 'POST /api/atende/conversas/:id/transferir', 'Não foi possível transferir.');
    }
  });

  r.get('/conversas/:id/eventos', exigir('conversas.atender'), async (req: RequisicaoAtende, res) => {
    try {
      res.json({ eventos: await eventosDaConversa(req, req.params.id) });
    } catch (err: any) {
      tratar(res, err, 'GET /api/atende/conversas/:id/eventos', 'Erro ao carregar o histórico.');
    }
  });

  r.post('/presenca', async (req: RequisicaoAtende, res) => {
    try {
      await definirPresenca(req, req.body?.presenca);
      res.json({ ok: true });
    } catch (err: any) {
      tratar(res, err, 'POST /api/atende/presenca', 'Não foi possível mudar a presença.');
    }
  });

  // ---- A triagem da IA e o lead (Etapa 3)
  r.get('/conversas/:id/triagem', exigir('conversas.atender'), async (req: RequisicaoAtende, res) => {
    try {
      res.json(await triagemDaConversa(req, req.params.id));
    } catch (err: any) {
      tratar(res, err, 'GET /api/atende/conversas/:id/triagem', 'Erro ao carregar a triagem.');
    }
  });

  /** Supervisor/admin: o setor certo é outro. */
  r.post('/conversas/:id/triagem/corrigir', exigir('conversas.supervisionar'), async (req: RequisicaoAtende, res) => {
    try {
      res.json({ conversa: await corrigirTriagem(req, req.params.id, req.body ?? {}) });
    } catch (err: any) {
      tratar(res, err, 'POST /api/atende/conversas/:id/triagem/corrigir', 'Não foi possível corrigir a triagem.');
    }
  });

  r.patch('/conversas/:id/lead', exigir('conversas.atender'), async (req: RequisicaoAtende, res) => {
    try {
      res.json({ lead: await atualizarLead(req, req.params.id, req.body ?? {}) });
    } catch (err: any) {
      tratar(res, err, 'PATCH /api/atende/conversas/:id/lead', 'Não foi possível atualizar o lead.');
    }
  });

  /** O administrador testa a triagem com uma mensagem inventada: nada é gravado nem enviado. */
  const simularLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 60, standardHeaders: 'draft-7', legacyHeaders: false, keyGenerator: (req) => `e:${(req as RequisicaoAtende).sessao?.empresa_id ?? ipKeyGenerator(req.ip ?? '')}`, message: { error: 'Muitas simulações nesta hora. Aguarde um pouco.' } });
  r.post('/triagem/simular', exigir('empresa.gerir'), simularLimiter, async (req: RequisicaoAtende, res) => {
    try {
      const texto = String(req.body?.texto ?? '').trim().slice(0, 2000);
      if (!texto) return res.status(400).json({ error: 'Escreva a mensagem do cliente para simular.' });
      res.json(await simular(req.sessao!.empresa_id, texto, typeof req.body?.nome === 'string' ? req.body.nome.slice(0, 80) : null));
    } catch (err: any) {
      console.error('[POST /api/atende/triagem/simular] erro:', err.message);
      res.status(502).json({ error: `A IA não respondeu: ${String(err.message).slice(0, 200)}` });
    }
  });

  /** A URL assinada de uma mídia (vale 10 min). `?download=1` força o download com o nome original. */
  r.get('/midias/:mensagemId', exigir('conversas.atender'), async (req: RequisicaoAtende, res) => {
    try {
      const url = await urlDaMidia(req, req.params.mensagemId, req.query.download === '1');
      if (!url) return res.status(404).json({ error: 'Arquivo não encontrado.' });
      res.json({ url });
    } catch (err: any) {
      tratar(res, err, 'GET /api/atende/midias/:id', 'Não foi possível abrir o arquivo.');
    }
  });

  r.patch('/clientes/:id', exigir('conversas.atender'), async (req: RequisicaoAtende, res) => {
    try {
      res.json({ cliente: await atualizarCliente(req, req.params.id, req.body ?? {}) });
    } catch (err: any) {
      tratar(res, err, 'PATCH /api/atende/clientes/:id', 'Não foi possível salvar o cliente.');
    }
  });

  r.get('/etiquetas', exigir('conversas.atender'), async (req: RequisicaoAtende, res) => {
    try {
      res.json({ etiquetas: await listarEtiquetas(req) });
    } catch (err: any) {
      tratar(res, err, 'GET /api/atende/etiquetas', 'Erro ao listar etiquetas.');
    }
  });
  r.post('/etiquetas', exigir('conversas.atender'), async (req: RequisicaoAtende, res) => {
    try {
      res.status(201).json({ etiquetas: await criarEtiqueta(req, req.body?.nome, req.body?.cor) });
    } catch (err: any) {
      tratar(res, err, 'POST /api/atende/etiquetas', 'Não foi possível criar a etiqueta.');
    }
  });

  /** A própria pessoa troca a própria senha (qualquer papel). */
  r.post('/minha-senha', async (req: RequisicaoAtende, res) => {
    try {
      const atual = String(req.body?.atual ?? '');
      const nova = validarSenha(req.body?.nova);
      if (!nova.ok) return res.status(400).json({ error: nova.erro });
      const { data: u } = await req.dbAtende!.from('atende_usuarios').select('senha').eq('id', req.sessao!.id).single();
      if (!u || !(await bcrypt.compare(atual, u.senha))) return res.status(400).json({ error: 'A senha atual não confere.' });
      const { error } = await req.dbAtende!.from('atende_usuarios').update({ senha: await bcrypt.hash(nova.valor, 10) }).eq('id', req.sessao!.id);
      if (error) throw error;
      res.json({ ok: true });
    } catch (err: any) {
      console.error('[POST /api/atende/minha-senha] erro:', err.message);
      res.status(500).json({ error: 'Erro ao trocar a senha.' });
    }
  });

  return r;
}
