import express from 'express';
import rateLimit from 'express-rate-limit';
import { entrar, lerSevla, contaPorId, sessaoDoProduto, ativarAtende, minhaSevla, ehProdutoSevla, ErroDaSevla } from './identidade';
import type { ContaSevla } from '../../shared/sevla';
import { assinaturasDaSevla, assinarPelaSevla, cancelarPelaSevla, conferirAvulsoPelaSevla } from './assinaturas';

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
