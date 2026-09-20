import express from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { entrar, lerSevla, contaPorId, sessaoDoProduto, ativarAtende, minhaSevla, ehProdutoSevla, ErroDaSevla } from './identidade';
import type { ContaSevla } from '../../shared/sevla';
import { assinaturasDaSevla, assinarPelaSevla, cancelarPelaSevla, conferirAvulsoPelaSevla } from './assinaturas';
import { assinarCombo, conferirCombo } from './combos';
import { claudeConfigurado } from '../claude';
import { LIMITE_HOME_DIA, TAMANHO_MAXIMO_DA_MENSAGEM, perguntasHojeNaSevla, registrarJatobaDaSevla, responderNaContaDaSevla, responderNaHomeDaSevla, sanearHistorico } from './jatoba';

/**
 * As rotas da SEVLA Identity, montadas em /api/sevla pelo createApp().
 *
 *   POST /entrar              e-mail + senha → conta, token SEVLA, acessos
 *   GET  /minha               (token SEVLA) a conta e os produtos dela
 *   POST /sessao/:produto     (token SEVLA) → o token DO PRODUTO, no formato dele
 *   POST /ativar/atende       (token SEVLA) ativa o Atende para uma organização que administro
 *
 * As rotas antigas de login dos produtos continuam existindo; estas são o
 * caminho novo, que as telas passam a usar primeiro.
 */

interface RequisicaoSevla extends express.Request {
  contaSevla?: ContaSevla;
}

function tratar(res: express.Response, err: any, rotulo: string, mensagem: string) {
  if (err instanceof ErroDaSevla) return res.status(err.status).json({ error: err.message, motivo: err.motivo });
  console.error(`[${rotulo}] erro:`, err.message);
  return res.status(500).json({ error: mensagem });
}

export function criarRouterSevla(): express.Router {
  const r = express.Router();
  r.use(express.json({ limit: '32kb' }));

  const porConta = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    keyGenerator: (req) => String(req.body?.email ?? '').trim().toLowerCase().slice(0, 120) || 'sem-email',
    message: { error: 'Muitas tentativas para esta conta. Aguarde 15 minutos.' },
  });
  const porIp = rateLimit({ windowMs: 15 * 60 * 1000, limit: 60, standardHeaders: 'draft-7', legacyHeaders: false, skipSuccessfulRequests: true, message: { error: 'Muitas tentativas a partir desta rede. Aguarde alguns minutos.' } });

  r.post('/entrar', porIp, porConta, async (req, res) => {
    try {
      const resposta = await entrar(req.body?.email, req.body?.senha);
      res.json(resposta);
    } catch (err: any) {
      if (err instanceof ErroDaSevla && err.motivo === 'credenciais') console.warn('[sevla entrar] falha', { ip: req.ip });
      tratar(res, err, 'POST /api/sevla/entrar', 'Não foi possível entrar agora.');
    }
  });

  /** O Jatobá da página da SEVLA: tira dúvidas de quem ainda não é cliente — a casa, os produtos, os planos, os combos. Público, com teto por IP e por dia. */
  const jatobaHomeLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'O Jatobá já respondeu bastante por aqui. Fale com a equipe pelo WhatsApp ou volte em uma hora.' } });
  r.post('/jatoba/home', jatobaHomeLimiter, async (req, res) => {
    try {
      const pergunta = String(req.body?.pergunta ?? '').trim().slice(0, TAMANHO_MAXIMO_DA_MENSAGEM);
      if (!pergunta) return res.status(400).json({ error: 'Escreva a pergunta.' });
      if (!claudeConfigurado()) return res.status(503).json({ error: 'O Jatobá está descansando. Fale com a equipe pelo WhatsApp.' });
      if ((await perguntasHojeNaSevla()) >= LIMITE_HOME_DIA) return res.status(429).json({ error: 'O Jatobá atingiu o limite de hoje. Fale com a equipe pelo WhatsApp.' });
      const historico = sanearHistorico(req.body?.historico);
      const r2 = await responderNaHomeDaSevla(historico, pergunta);
      await registrarJatobaDaSevla({ canal: 'sevla-home', ip: req.ip ?? null, pergunta, resposta: r2.texto, uso: r2.uso });
      res.json({ texto: r2.texto });
    } catch (err: any) {
      console.error('[POST /api/sevla/jatoba/home] erro:', err.message);
      res.status(500).json({ error: 'O Jatobá não conseguiu responder agora. Tente de novo em instantes.' });
    }
  });

  // Daqui para baixo, token SEVLA.
  r.use(async (req: RequisicaoSevla, res, next) => {
    const h = req.headers.authorization;
    const token = h?.startsWith('Bearer ') ? h.slice(7) : null;
    const t = token ? lerSevla(token) : null;
    if (!t) return res.status(401).json({ error: 'Entre na sua conta SEVLA.', motivo: 'invalido' });
    try {
      const conta = await contaPorId(t.cid);
      if (!conta) return res.status(401).json({ error: 'Esta conta não existe mais.', motivo: 'invalido' });
      req.contaSevla = conta;
      next();
    } catch (err: any) {
      tratar(res, err, 'sevla autenticar', 'Não foi possível conferir a sessão.');
    }
  });

  r.get('/minha', async (req: RequisicaoSevla, res) => {
    try {
      res.json(await minhaSevla(req.contaSevla!));
    } catch (err: any) {
      tratar(res, err, 'GET /api/sevla/minha', 'Não foi possível carregar a sua SEVLA.');
    }
  });

  r.post('/sessao/:produto', async (req: RequisicaoSevla, res) => {
    try {
      const produto = req.params.produto;
      if (!ehProdutoSevla(produto)) return res.status(404).json({ error: 'Produto desconhecido.', motivo: 'invalido' });
      const org = typeof req.body?.organization_id === 'string' ? req.body.organization_id : null;
      res.json(await sessaoDoProduto(req.contaSevla!.id, produto, org));
    } catch (err: any) {
      tratar(res, err, 'POST /api/sevla/sessao', 'Não foi possível abrir o produto.');
    }
  });

  /** O Jatobá da Minha SEVLA: a conta da pessoa — empresas, produtos, assinaturas — e o caminho para cada lugar. Ele não assina nem paga por ninguém. */
  const jatobaContaLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 60, standardHeaders: 'draft-7', legacyHeaders: false, keyGenerator: (req) => `c:${(req as RequisicaoSevla).contaSevla?.id ?? ipKeyGenerator(req.ip ?? '')}`, message: { error: 'O Jatobá já respondeu bastante nesta hora. Volte daqui a pouco.' } });
  r.post('/jatoba', jatobaContaLimiter, async (req: RequisicaoSevla, res) => {
    try {
      const texto = String(req.body?.texto ?? '').trim().slice(0, TAMANHO_MAXIMO_DA_MENSAGEM);
      if (!texto) return res.status(400).json({ error: 'Escreva a pergunta.' });
      if (!claudeConfigurado()) return res.status(503).json({ error: 'O Jatobá está descansando neste servidor.' });
      const conta = req.contaSevla!;
      const historico = sanearHistorico(req.body?.historico);
      const r2 = await responderNaContaDaSevla({ conta, minha: await minhaSevla(conta) }, historico, texto);
      await registrarJatobaDaSevla({ canal: 'sevla-conta', contaId: conta.id, ip: req.ip ?? null, pergunta: texto, resposta: r2.texto, ferramentas: r2.ferramentas, uso: r2.uso });
      res.json({ texto: r2.texto, abrir: r2.abrir });
    } catch (err: any) {
      console.error('[POST /api/sevla/jatoba] erro:', err.message);
      res.status(500).json({ error: 'O Jatobá não conseguiu responder agora. Tente de novo em instantes.' });
    }
  });

  // ---- Assinaturas dos dois produtos, pela conta central
  r.get('/assinaturas', async (req: RequisicaoSevla, res) => {
    try {
      res.json(await assinaturasDaSevla(req.contaSevla!));
    } catch (err: any) {
      tratar(res, err, 'GET /api/sevla/assinaturas', 'Não foi possível carregar as assinaturas.');
    }
  });
  const assinarLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false, keyGenerator: (req) => `c:${(req as RequisicaoSevla).contaSevla?.id ?? req.ip}`, message: { error: 'Muitos pedidos nesta hora. Aguarde um pouco.' } });
  r.post('/assinar', assinarLimiter, async (req: RequisicaoSevla, res) => {
    try {
      const r2 = await assinarPelaSevla(req.contaSevla!, req.body);
      console.info('[sevla assinar]', { conta: req.contaSevla!.id, produto: r2.produto, metodo: r2.metodo });
      res.json(r2);
    } catch (err: any) {
      tratar(res, err, 'POST /api/sevla/assinar', 'Não foi possível iniciar a assinatura.');
    }
  });
  r.post('/cancelar', assinarLimiter, async (req: RequisicaoSevla, res) => {
    try {
      await cancelarPelaSevla(req.contaSevla!, req.body);
      res.json(await assinaturasDaSevla(req.contaSevla!));
    } catch (err: any) {
      tratar(res, err, 'POST /api/sevla/cancelar', 'Não foi possível cancelar.');
    }
  });
  /** O combo: os dois produtos com desconto — dois checkouts (cartão) ou um Pix/boleto só. */
  r.post('/assinar-combo', assinarLimiter, async (req: RequisicaoSevla, res) => {
    try {
      const r2 = await assinarCombo(req.contaSevla!, req.body);
      console.info('[sevla combo]', { conta: req.contaSevla!.id, combo: r2.combo, metodo: r2.metodo });
      res.json(r2);
    } catch (err: any) {
      tratar(res, err, 'POST /api/sevla/assinar-combo', 'Não foi possível iniciar o combo.');
    }
  });
  r.get('/combo/:organization_id/:id', async (req: RequisicaoSevla, res) => {
    try {
      const p = await conferirCombo(req.contaSevla!, req.params.organization_id, req.params.id);
      if (!p) return res.status(404).json({ error: 'Pagamento não encontrado.', motivo: 'invalido' });
      res.json({ pagamento: p });
    } catch (err: any) {
      tratar(res, err, 'GET /api/sevla/combo', 'Não foi possível consultar o pagamento do combo.');
    }
  });
  r.get('/avulso/:produto/:organization_id/:id', async (req: RequisicaoSevla, res) => {
    try {
      const p = await conferirAvulsoPelaSevla(req.contaSevla!, req.params.produto, req.params.organization_id, req.params.id);
      if (!p) return res.status(404).json({ error: 'Pagamento não encontrado.', motivo: 'invalido' });
      res.json({ pagamento: p });
    } catch (err: any) {
      tratar(res, err, 'GET /api/sevla/avulso', 'Não foi possível consultar o pagamento.');
    }
  });

  r.post('/ativar/atende', async (req: RequisicaoSevla, res) => {
    try {
      const org = String(req.body?.organization_id ?? '');
      if (!org) return res.status(400).json({ error: 'Informe a empresa.', motivo: 'invalido' });
      const r2 = await ativarAtende(req.contaSevla!.id, org);
      res.json({ produto: 'atende', ...r2 });
    } catch (err: any) {
      tratar(res, err, 'POST /api/sevla/ativar/atende', 'Não foi possível ativar o Atende Aí.');
    }
  });

  return r;
}
