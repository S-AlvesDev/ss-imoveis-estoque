/**
 * Recibo de pagamento — o comprovante que o Stok Aí emite por conta
 * própria, sem ser nota fiscal. Vai por e-mail a cada pagamento aprovado
 * e pode ser baixado em PDF na lista de cobranças (o PDF é montado no
 * navegador com os mesmos dados — ver shared/recibo.ts).
 */
import type { Pagamento } from './assinaturas';
import { layoutEmail, escapeHtml, p, tabela } from './email-layout';
import { formatarPreco } from '../shared/planos';
import { PRODUTO } from '../shared/produto';
import { dadosDoRecibo as montar, linhaDoEmitente, type DadosDoRecibo } from '../shared/recibo';

export type { DadosDoRecibo };

/**
 * Quem emite o recibo: o nome em RECIBO_EMITENTE (padrão "Stok Aí") e, se
 * houver RECIBO_EMITENTE_DOC, o CPF/CNPJ com o meio visível e as pontas
 * escondidas — identifica sem expor.
 */
export function emitente(env: Record<string, string | undefined> = process.env): string {
  return linhaDoEmitente((env.RECIBO_EMITENTE ?? '').trim() || PRODUTO.nome, env.RECIBO_EMITENTE_DOC);
}

/** Tudo que o recibo mostra, tirado do pagamento. */
export function dadosDoRecibo(pg: Pagamento, empresa: string, env?: Record<string, string | undefined>): DadosDoRecibo {
  return montar(pg, empresa, emitente(env));
}

/** O e-mail com o recibo. Nulo se não há para quem mandar. */
export function emailDeRecibo(pg: Pagamento, empresa: string, env?: Record<string, string | undefined>): { to: string; subject: string; html: string } | null {
  const r = dadosDoRecibo(pg, empresa, env);
  if (!r.pagador.email) return null;
  return {
    to: r.pagador.email,
    subject: `Recibo ${r.numero} — ${PRODUTO.nome}`,
    html: layoutEmail({
      titulo: `Recibo ${r.numero}`,
      corpo:
        p(`Recebemos de <strong>${escapeHtml(r.pagador.nome)}</strong>${r.pagador.doc ? ` (${escapeHtml(r.pagador.doc)})` : ''} a importância de <strong>${escapeHtml(formatarPreco(r.valor))}</strong> referente a ${escapeHtml(r.descricao)}.`) +
        tabela([
          ['Valor', formatarPreco(r.valor)],
          ['Forma de pagamento', r.metodo],
          ['Data', r.data],
          ['Transação (Mercado Pago)', r.transacao],
          ['Emitido por', r.emitente],
        ]),
      observacao: 'Este recibo comprova o pagamento e não substitui nota fiscal. Ele também fica disponível em PDF em Configurações → Plano e assinatura, na lista de cobranças.',
    }),
  };
}
