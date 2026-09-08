import { useMemo, useState } from 'react';
import { Download, Search, Inbox } from 'lucide-react';
import { Modal } from '@/shared/ui/Modal';
import { Button } from '@/shared/ui/Button';
import { EmptyState } from '@/shared/ui/EmptyState';
import { MovementsTable } from './MovementsTable';
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
      headStyles: { fillColor: [255, 142, 41] },
      styles: { fontSize: 8 },
      columnStyles: { 5: { cellWidth: 50 } },
    });

    doc.save(`${exportFilename}-${new Date().toISOString().slice(0, 10)}.pdf`);
  }

  return (
    <Modal open={open} onClose={onClose} title={title} maxWidth="max-w-4xl" subtitle={`${filtered.length} registro(s)`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center mb-4">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por material, responsável ou justificativa..."
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] py-2.5 pl-9 pr-3 text-sm outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/20"
          />
        </div>
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value as Period)}
          className="rounded-lg border border-[var(--border)] px-3 py-2.5 text-sm outline-none focus:border-[var(--brand)]"
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
          className="rounded-lg border border-[var(--border)] px-3 py-2.5 text-sm outline-none focus:border-[var(--brand)]"
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

      <div className="max-h-[50vh] overflow-y-auto rounded-xl border border-[var(--border)]">
        {filtered.length > 0 ? (
          <MovementsTable movements={filtered} materials={materials} staff={staff} />
        ) : (
          <EmptyState
            icon={<Inbox size={20} />}
            title="Nenhuma movimentação encontrada"
            subtitle="Ajuste os filtros de busca, período ou tipo."
          />
        )}
      </div>
    </Modal>
  );
}
