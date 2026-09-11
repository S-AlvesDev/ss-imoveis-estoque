import type { Material } from '@/shared/types';
import { CATEGORIES } from '@/shared/constants';
import { nomeDaOrganizacao } from '@/store/marca';
import { formatNumber, needsPurchase } from '@/features/estoque/utils';

export function exportMaterialsToWord(materials: Material[]) {
  const generatedAt = new Date().toLocaleString('pt-BR');

  const sections = CATEGORIES.map((cat) => {
    const items = materials.filter((m) => m.categoria === cat);
    if (items.length === 0) return '';
    const rows = items
      .map((m) => {
        const critical = needsPurchase(m);
        return `<tr style="${critical ? 'background:#fee2e2;' : ''}">
          <td>${m.nome}${critical ? ' &#9888;' : ''}</td>
          <td style="text-align:right">${formatNumber(m.saldo_central)}</td>
          <td style="text-align:right">${formatNumber(m.saldo_obra)}</td>
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
            <th align="right">Saldo Central</th>
            <th align="right">Saldo Obra</th>
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
