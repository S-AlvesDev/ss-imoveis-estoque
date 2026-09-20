import { CEO } from '../../shared/constants';
import { ErroDoMercadoPago, mensagemParaOPagador } from '../mercadopago';
import { ErroDeAssinatura } from '../assinaturas';
import { ErroDePlano } from '../../atende/server/plano';
import { acessosDaConta, ErroDaSevla } from './identidade';
import type { AcessoSevla, ContaSevla, ProdutoSevla } from '../../shared/sevla';

/**
 * O que as assinaturas e os combos da SEVLA têm em comum: quem pode mexer
 * na cobrança de cada produto (CEO no Stok Aí; administrador no Atende Aí)
 * e como os erros de cada produto e do Mercado Pago viram a frase certa
 * para a tela.
 */

export async function acessoEm(conta: ContaSevla, organizationId: string, produto: ProdutoSevla): Promise<AcessoSevla> {
  const acesso = (await acessosDaConta(conta.id)).find((a) => a.produto === produto && a.organization_id === organizationId);
  if (!acesso) throw new ErroDaSevla(`Você não participa desta empresa no ${produto === 'stok' ? 'Stok Aí' : 'Atende Aí'}.`, 403, 'sem_acesso');
  if (produto === 'stok' && acesso.papel !== CEO) throw new ErroDaSevla('No Stok Aí, só o titular (CEO) mexe na assinatura.', 403, 'sem_acesso');
  if (produto === 'atende' && acesso.papel !== 'admin') throw new ErroDaSevla('No Atende Aí, só o administrador mexe na assinatura.', 403, 'sem_acesso');
  return acesso;
}

/** Os erros dos produtos e do MP viram erros da SEVLA, com a frase certa para a tela. */
export function traduzir(e: unknown): unknown {
  if (e instanceof ErroDaSevla) return e;
  if (e instanceof ErroDeAssinatura) return new ErroDaSevla(e.message, e.status, 'invalido');
  if (e instanceof ErroDePlano) return new ErroDaSevla(e.message, e.status, 'invalido');
  if (e instanceof ErroDoMercadoPago) return new ErroDaSevla(mensagemParaOPagador(e), 402, 'invalido');
  return e;
}
