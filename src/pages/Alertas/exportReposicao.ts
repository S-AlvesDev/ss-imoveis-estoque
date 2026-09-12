import type { Deposito, Material } from '@/shared/types';
import { nomeDaOrganizacao } from '@/store/marca';
import { formatNumber, saldoEm, stockStatus, stockTotal } from '@/features/estoque/utils';
import { categoriasPresentes } from '@/pages/Admin/exportWord';

/**
 * Lista de compras: apenas o que precisa de reposição externa. Itens que faltam
 * só em um estoque ficam de fora — esses resolvem-se com transferência.
 */
export function exportReposicaoToWord(materials: Material[], categorias: string[], depositos: Deposito[]) {
  const generatedAt = new Date().toLocaleString('pt-BR');
  const estoques = depositos.filter((d) => d.ativo);

  const sections = categoriasPresentes(materials, categorias).map((cat) => {
    const items = materials.filter((m) => m.categoria === cat);
    if (items.length === 0) return '';

    const rows = items
      .map((m) => {
        const total = stockTotal(m);
        const semEstoque = stockStatus(m, 'empresa') === 'RUPTURA';
        const sugestao = Math.max(m.estoque_minimo * 2 - total, m.estoque_minimo || 1);
        return `<tr style="${semEstoque ? 'background:#fee2e2;' : ''}">
          <td>${m.nome}${semEstoque ? ' &#9888;' : ''}</td>
          ${estoques.map((d) => `<td style="text-align:right">${formatNumber(saldoEm(m, d.id))}</td>`).join('')}
          <td style="text-align:right"><strong>${formatNumber(total)}</strong></td>
          <td style="text-align:right">${formatNumber(m.estoque_minimo)}</td>
          <td style="text-align:right"><strong>${formatNumber(sugestao)}</strong></td>
          <td>${m.unidade_medida}</td>
        </tr>`;
      })
      .join('');

    return `<h2>${cat}</h2>
      <table border="1" cellspacing="0" cellpadding="6" style="border-collapse:collapse;width:100%;font-size:12px;">
        <thead>
          <tr style="background:#ff8a24;color:#fff;">
            <th align="left">Material</th>
            ${estoques.map((d) => `<th align="right">${d.nome}</th>`).join('')}
            <th align="right">Total</th>
            <th align="right">Mínimo</th>
            <th align="right">Sugestão de compra</th>
            <th align="left">Un.</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;
  }).join('');

  const html = `<!doctype html>
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
      <head><meta charset="utf-8"><title>Lista de Compras</title></head>
      <body style="font-family:Arial,sans-serif;">
        <h1>Lista de Compras &mdash; ${nomeDaOrganizacao()}</h1>
        <p style="color:#666;font-size:12px;">
          Gerado em ${generatedAt}<br/>
          ${materials.length} material(is) abaixo do estoque mínimo da empresa (Central + Obra).<br/>
          Itens disponíveis em outro estoque não constam nesta lista &mdash; resolvem-se com transferência.
        </p>
        ${sections}
      </body>
    </html>`;

  const blob = new Blob([html], { type: 'application/msword' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `lista-compras-${new Date().toISOString().slice(0, 10)}.doc`;
  link.click();
  URL.revokeObjectURL(url);
}
