import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/shared/ui/Button';
import { Input, Select, Textarea } from '@/shared/ui/Field';
import { MaterialPicker } from '@/shared/ui/MaterialPicker';
import type { Deposito, Material } from '@/shared/types';
import { formatNumber, saldoEm } from './utils';

/** O que a tela manda para POST /api/estoques/:id/movimentacoes. */
export interface MovimentoPayload {
  material_id: number;
  operacao: 'ENTRADA' | 'SAIDA' | 'CONSUMO' | 'TRANSFERENCIA' | 'AJUSTE';
  quantidade: number;
  justificativa: string;
  destino_id?: string;
}

interface OperationOption {
  value: MovimentoPayload['operacao'];
  label: string;
  color: string;
  dica: string;
}

const OPERACOES: OperationOption[] = [
  { value: 'ENTRADA', label: 'Entrada', color: 'bg-[var(--verde)] text-white', dica: 'Chegou de fora: compra, doação, devolução de terceiro.' },
  { value: 'SAIDA', label: 'Saída', color: 'bg-[var(--amarelo)] text-white', dica: 'Saiu da empresa: venda, descarte, uso administrativo.' },
  { value: 'CONSUMO', label: 'Consumo', color: 'bg-[var(--vermelho)] text-white', dica: 'Foi usado no trabalho: obra, manutenção, aula.' },
  { value: 'TRANSFERENCIA', label: 'Transferir', color: 'bg-[var(--brand)] text-white', dica: 'Vai para outro estoque desta unidade. O total da unidade não muda.' },
  { value: 'AJUSTE', label: 'Ajuste', color: 'bg-[var(--roxo)] text-white', dica: 'Acerto de contagem, com sinal: +5 achou, −5 sumiu.' },
];

interface MovementFormProps {
  materials: Material[];
  /** O estoque onde a operação acontece. */
  deposito: Deposito;
  /** Os outros estoques da mesma unidade — destinos possíveis de transferência. */
  outrosEstoques: Deposito[];
  onSubmit: (payload: MovimentoPayload) => Promise<void>;
}

/**
 * O formulário de movimentação de um estoque no modo almoxarifado. As
 * operações são as mesmas para qualquer estoque; "Transferir" só aparece
 * quando a unidade tem outro estoque para onde mandar.
 */
export function MovementForm({ materials, deposito, outrosEstoques, onSubmit }: MovementFormProps) {
  const operacoes = useMemo(() => OPERACOES.filter((o) => o.value !== 'TRANSFERENCIA' || outrosEstoques.length > 0), [outrosEstoques.length]);
  const [operacao, setOperacao] = useState<MovimentoPayload['operacao']>('ENTRADA');
  const [materialId, setMaterialId] = useState(materials.length === 1 ? String(materials[0].id) : '');
  const [destinoId, setDestinoId] = useState(outrosEstoques[0]?.id ?? '');
  const [quantidade, setQuantidade] = useState('');
  const [justificativa, setJustificativa] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!outrosEstoques.some((d) => d.id === destinoId)) setDestinoId(outrosEstoques[0]?.id ?? '');
  }, [outrosEstoques, destinoId]);

  const selected = useMemo(() => materials.find((m) => String(m.id) === materialId), [materials, materialId]);
  const atual = operacoes.find((o) => o.value === operacao) ?? operacoes[0];
  const podeSerNegativo = operacao === 'AJUSTE';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!materialId) return toast.error('Selecione um material.');
    const qty = Number(quantidade);
    if (!quantidade || qty === 0 || (!podeSerNegativo && qty < 0)) return toast.error('Informe uma quantidade válida.');
    if (!justificativa.trim()) return toast.error('Justificativa é obrigatória.');
    if (operacao === 'TRANSFERENCIA' && !destinoId) return toast.error('Escolha o estoque de destino.');

    setSubmitting(true);
    try {
      await onSubmit({
        material_id: Number(materialId),
        operacao,
        quantidade: qty,
        justificativa: justificativa.trim(),
        destino_id: operacao === 'TRANSFERENCIA' ? destinoId : undefined,
      });
      setQuantidade('');
      setJustificativa('');
      toast.success('Movimentação registrada.');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao registrar movimentação.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Operação</p>
        <div className="flex flex-wrap gap-2">
          {operacoes.map((op) => (
            <button
              type="button"
              key={op.value}
              onClick={() => setOperacao(op.value)}
              className={`rounded-full px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-wide transition-colors ${
                operacao === op.value ? op.color : 'bg-[var(--bg-2)] text-[var(--text-muted)] hover:text-[var(--text)]'
              }`}
            >
              {op.label}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[11px] text-[var(--text-muted)]">{atual.dica}</p>
      </div>

      {operacao === 'TRANSFERENCIA' && (
        <Select label="Para qual estoque" required value={destinoId} onChange={(e) => setDestinoId(e.target.value)}>
          {outrosEstoques.map((d) => (
            <option key={d.id} value={d.id}>
              {d.nome}
            </option>
          ))}
        </Select>
      )}

      <MaterialPicker label="Material" required materials={materials} value={materialId} onChange={setMaterialId} depositoId={deposito.id} />

      {selected && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 rounded-lg bg-[var(--bg-2)] px-3 py-2 text-xs text-[var(--text-muted)]">
          <span>
            Aqui: <strong className="text-[var(--text)]">{formatNumber(saldoEm(selected, deposito.id))}</strong>
          </span>
          <span>
            Na unidade: <strong className="text-[var(--text)]">{formatNumber(selected.saldo_unidade)}</strong>
          </span>
          <span>
            Mínimo: <strong className="text-[var(--text)]">{formatNumber(selected.estoque_minimo)}</strong>
          </span>
        </div>
      )}

      <Input
        label="Quantidade"
        required
        type="number"
        step="0.01"
        value={quantidade}
        onChange={(e) => setQuantidade(e.target.value)}
        placeholder={podeSerNegativo ? 'Com sinal (ex.: -5)' : '0.00'}
      />

      <Textarea
        label="Justificativa / NFe / Guia"
        required
        rows={2}
        value={justificativa}
        onChange={(e) => setJustificativa(e.target.value)}
        placeholder="Descreva o motivo desta movimentação..."
      />

      <Button type="submit" fullWidth loading={submitting}>
        Registrar em {deposito.nome}
      </Button>
    </form>
  );
}
