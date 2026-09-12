import type { Deposito, Material } from '@/shared/types';
import { nomeDaOrganizacao } from '@/store/marca';
import { formatNumber, needsPurchase, saldoEm } from '@/features/estoque/utils';

/** As categorias na ordem da organização, mais qualquer outra que os materiais ainda usem. */
export function categoriasPresentes(materials: Material[], categorias: string[]): string[] {
  const extras = [...new Set(materials.map((m) => m.categoria))].filter((c) => !categorias.includes(c)).sort();
  return [...categorias, ...extras];
}

export function exportMaterialsToWord(materials: Material[], categorias: string[], depositos: Deposito[]) {
  const generatedAt = new Date().toLocaleString('pt-BR');
  const estoques = depositos.filter((d) => d.ativo);

  const sections = categoriasPresentes(materials, categorias).map((cat) => {
    const items = materials.filter((m) => m.categoria === cat);
    if (items.length === 0) return '';
    const rows = items
      .map((m) => {
        const critical = needsPurchase(m);
        return `<tr style="${critical ? 'background:#fee2e2;' : ''}">
          <td>${m.nome}${critical ? ' &#9888;' : ''}</td>
          ${estoques.map((d) => `<td style="text-align:right">${formatNumber(saldoEm(m, d.id))}</td>`).join('')}
          <td style="text-align:right">${formatNumber(m.estoque_minimo)}</td>
          <td>${m.unidade_medida}</td>
        </tr>`;
      })
      .join('');
    return `<h2>${cat}</h2>
      <table border="1" cellspacing="0" cellpadding="6" style="border-collapse:collapse;width:100%;font-size:12px;">
        <thead>
          <tr style="background:#2563eb;color:#fff;">
            <th align="left">Material</th>
            ${estoques.map((d) => `<th align="right">${d.nome}</th>`).join('')}
            <th align="right">Estoque Mínimo</th>
            <th align="left">Unidade</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table><br/>`;
  }).join('');

  const html = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
    <head><meta charset="utf-8"><title>Relatório de Estoque</title></head>
    <body style="font-family: Calibri, Arial, sans-serif;">
      <h1>Relatório de Estoque — ${nomeDaOrganizacao()}</h1>
      <p>Gerado em ${generatedAt}</p>
      <p>Itens marcados com &#9888; estão em nível crítico de estoque.</p>
      ${sections}
    </body>
    </html>`;

  const blob = new Blob(['﻿', html], { type: 'application/msword' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `Relatorio_Estoque_${new Date().toISOString().slice(0, 10)}.doc`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
