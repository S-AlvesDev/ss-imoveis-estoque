import { formatarPreco } from '@/shared/planos';
import { PRODUTO } from '@/shared/produto';
import { dadosDoRecibo, type PagamentoParaRecibo } from '@/shared/recibo';

/**
 * O recibo em PDF, montado no navegador com os mesmos dados do e-mail.
 * Uma página, sem tabela de biblioteca: cabeçalho com a marca, o texto do
 * recibo, os detalhes e a nota de que não é documento fiscal.
 */
export async function baixarReciboPdf(pg: PagamentoParaRecibo, empresa: string, emitente: string) {
  const { default: jsPDF } = await import('jspdf');
  const r = dadosDoRecibo(pg, empresa, emitente);
  const doc = new jsPDF();
  const larguraUtil = 182;

  // Faixa de cabeçalho
  doc.setFillColor(5, 11, 24);
  doc.rect(0, 0, 210, 30, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('Stok Aí', 14, 14);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(180, 190, 205);
  doc.text(PRODUTO.slogan, 14, 20);
  doc.setTextColor(255, 138, 36);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(`RECIBO ${r.numero}`, 196, 14, { align: 'right' });
  doc.setTextColor(180, 190, 205);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(r.data, 196, 20, { align: 'right' });

  // Corpo
  doc.setTextColor(20, 24, 33);
  doc.setFontSize(11);
  const texto = `Recebemos de ${r.pagador.nome}${r.pagador.doc ? ` (${r.pagador.doc})` : ''} a importância de ${formatarPreco(r.valor)} referente a ${r.descricao}.`;
  const linhas = doc.splitTextToSize(texto, larguraUtil);
  doc.text(linhas, 14, 44);
  let y = 44 + linhas.length * 6 + 6;

  const detalhes: Array<[string, string]> = [
    ['Valor', formatarPreco(r.valor)],
    ['Forma de pagamento', r.metodo],
    ['Data do pagamento', r.data],
    ['Transação (Mercado Pago)', r.transacao ?? '—'],
    ['Pagador', r.pagador.email ? `${r.pagador.nome} · ${r.pagador.email}` : r.pagador.nome],
    ['Emitido por', r.emitente],
  ];
  doc.setDrawColor(226, 232, 240);
  for (const [rotulo, valor] of detalhes) {
    doc.setFontSize(9);
    doc.setTextColor(96, 112, 137);
    doc.text(rotulo, 14, y);
    doc.setFontSize(10);
    doc.setTextColor(20, 24, 33);
    doc.setFont('helvetica', 'bold');
    const v = doc.splitTextToSize(valor, larguraUtil - 60);
    doc.text(v, 74, y);
    doc.setFont('helvetica', 'normal');
    y += Math.max(1, v.length) * 5 + 3;
    doc.line(14, y - 1, 196, y - 1);
    y += 4;
  }

  y += 6;
  doc.setFontSize(9);
  doc.setTextColor(96, 112, 137);
  doc.text(doc.splitTextToSize('Este recibo comprova o pagamento e não substitui nota fiscal. Gerado pelo Stok Aí a partir do registro da transação no Mercado Pago.', larguraUtil), 14, y);

  doc.save(`recibo-${r.numero}.pdf`);
}
