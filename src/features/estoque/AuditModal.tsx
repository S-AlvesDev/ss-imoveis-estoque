import { useMemo, useState } from 'react';
import { Download, Search, Inbox } from 'lucide-react';
import { Modal } from '@/shared/ui/Modal';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { EmptyState } from '@/shared/ui/EmptyState';
import type { Material, MaterialMovement, StaffUser } from '@/shared/types';
import { PERIODS, type Period, formatDateTime, formatNumber, movementMaterialName, staffName, withinPeriod } from './utils';
import { OPERATION_LABELS } from '@/shared/constants';

interface AuditModalProps {
  open: boolean;
  onClose: () => void;
  movements: MaterialMovement[];
  materials: Material[];
  staff: StaffUser[];
  typeOptions: string[];
  exportFilename: string;
  title?: string;
}

function badgeVariant(tipo: string): 'success' | 'critical' | 'info' | 'indigo' | 'neutral' {
  if (tipo.includes('ENTRADA') || tipo.includes('DEVOLUCAO')) return 'success';
  if (tipo.includes('SAIDA') || tipo.includes('CONSUMO') || tipo === 'EXCLUSÃO') return 'critical';
  if (tipo.includes('AJUSTE')) return 'indigo';
  if (tipo.includes('REMESSA')) return 'info';
  return 'neutral';
}

export function AuditModal({ open, onClose, movements, materials, staff, typeOptions, exportFilename, title = 'Auditoria de Movimentações' }: AuditModalProps) {
  const [search, setSearch] = useState('');
  const [period, setPeriod] = useState<Period>('TODOS');
  const [type, setType] = useState('TODOS');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return movements
      .filter((m) => withinPeriod(m.created_at, period))
      .filter((m) => type === 'TODOS' || m.tipo_operacao === type)
      .filter((m) => {
        if (!q) return true;
        const nome = movementMaterialName(m, materials).toLowerCase();
        const resp = staffName(m.funcionario_matricula, staff).toLowerCase();
        return nome.includes(q) || resp.includes(q) || (m.justificativa || '').toLowerCase().includes(q);
      });
  }, [movements, materials, staff, search, period, type]);

  async function exportPdf() {
    const { default: jsPDF } = await import('jspdf');
    const autoTable = (await import('jspdf-autotable')).default;
    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text(title, 14, 16);
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text(`Gerado em ${new Date().toLocaleString('pt-BR')}`, 14, 22);

    autoTable(doc, {
      startY: 28,
      head: [['Data', 'Material', 'Tipo', 'Qtd', 'Responsável', 'Justificativa']],
      body: filtered.map((m) => [
        formatDateTime(m.created_at),
        movementMaterialName(m, materials),
        OPERATION_LABELS[m.tipo_operacao] || m.tipo_operacao,
        formatNumber(m.quantidade),
        staffName(m.funcionario_matricula, staff),
        m.justificativa || '',
      ]),
      headStyles: { fillColor: [37, 99, 235] },
      styles: { fontSize: 8 },
      columnStyles: { 5: { cellWidth: 50 } },
    });

    doc.save(`${exportFilename}-${new Date().toISOString().slice(0, 10)}.pdf`);
  }

  return (
    <Modal open={open} onClose={onClose} title={title} maxWidth="max-w-4xl" subtitle={`${filtered.length} registro(s)`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center mb-4">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por material, responsável ou justificativa..."
            className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15"
          />
        </div>
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value as Period)}
          className="rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-500"
        >
          {PERIODS.map((p) => (
            <option key={p} value={p}>
              {p === 'TODOS' ? 'Todo o período' : p}
            </option>
          ))}
        </select>
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-500"
        >
          <option value="TODOS">Todas as operações</option>
          {typeOptions.map((t) => (
            <option key={t} value={t}>
              {OPERATION_LABELS[t] || t}
            </option>
          ))}
        </select>
        <Button variant="outline" size="md" icon={<Download size={15} />} onClick={exportPdf}>
          PDF
        </Button>
      </div>

      <div className="max-h-[50vh] overflow-y-auto rounded-xl border border-slate-100">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-3 py-2.5 text-left font-bold">Data</th>
              <th className="px-3 py-2.5 text-left font-bold">Material</th>
              <th className="px-3 py-2.5 text-left font-bold">Tipo</th>
              <th className="px-3 py-2.5 text-right font-bold">Qtd</th>
              <th className="px-3 py-2.5 text-left font-bold">Responsável</th>
              <th className="px-3 py-2.5 text-left font-bold">Justificativa</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((m) => (
              <tr key={m.id} className="odd:bg-slate-50/40 hover:bg-blue-50/40">
                <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[11px] text-slate-500">{formatDateTime(m.created_at)}</td>
                <td className="px-3 py-2.5 font-semibold text-slate-800">{movementMaterialName(m, materials)}</td>
                <td className="px-3 py-2.5">
                  <Badge variant={badgeVariant(m.tipo_operacao)}>{OPERATION_LABELS[m.tipo_operacao] || m.tipo_operacao}</Badge>
                </td>
                <td className="px-3 py-2.5 text-right font-mono tabular-nums font-medium">{formatNumber(m.quantidade)}</td>
                <td className="px-3 py-2.5 text-slate-500">{staffName(m.funcionario_matricula, staff)}</td>
                <td className="px-3 py-2.5 max-w-[220px] truncate text-slate-500" title={m.justificativa || ''}>
                  {m.justificativa}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6}>
                  <EmptyState icon={<Inbox size={20} />} title="Nenhuma movimentação encontrada" subtitle="Ajuste os filtros de busca, período ou tipo." />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
