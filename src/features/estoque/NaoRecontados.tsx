import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Check, Pencil, Trash2 } from 'lucide-react';
import { Modal } from '@/shared/ui/Modal';
import { Button } from '@/shared/ui/Button';
import { Badge } from '@/shared/ui/Badge';
import { EmptyState } from '@/shared/ui/EmptyState';
import { api } from '@/lib/api';
import { naUnidade } from '@/store/unidade';
import type { Deposito, Material } from '@/shared/types';
import { formatNumber } from './utils';

/** Uma linha do que falta conferir, como o servidor devolve. */
interface ItemNaoRecontado {
  material_id: number;
  nome: string;
  categoria: string;
  unidade_medida: string;
  estoque_minimo: number;
  saldo: number;
  recontado_em: string | null;
  recontado_por: string | null;
}

interface NaoRecontadosProps {
  open: boolean;
  onClose: () => void;
  deposito: Deposito;
  materials: Material[];
  /** Abre a ficha do material para editar (o mesmo modal da tela de materiais). */
  onEditar: (m: Material) => void;
  refetch: () => Promise<void>;
}

/** A data de hoje à meia-noite, no formato que o <input type="date"> usa. */
function hojeISO(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * O que ainda não foi recontado num estoque — só para a gestão.
 *
 * Existe porque a recontagem só deixava rastro quando havia divergência:
 * material conferido e material esquecido ficavam iguais no banco, e ninguém
 * sabia o que tinha sido conferido. Desde a migração 055 toda contagem
 * carimba o saldo, e esta tela mostra quem ficou sem carimbo.
 *
 * Daqui dá para resolver o item sem sair: conferir (o sistema está certo),
 * zerar (não existe mais no físico), editar a ficha ou apagar o cadastro.
 */
export function NaoRecontados({ open, onClose, deposito, materials, onEditar, refetch }: NaoRecontadosProps) {
  const [desde, setDesde] = useState(hojeISO());
  const [itens, setItens] = useState<ItemNaoRecontado[] | null>(null);
  const [ocupado, setOcupado] = useState<number | null>(null);
  const [apagando, setApagando] = useState<number | null>(null);

  const carregar = useCallback(async () => {
    setItens(null);
    try {
      const r = await api.get<{ itens: ItemNaoRecontado[] }>(`/api/materials/nao-recontados?warehouse_id=${encodeURIComponent(deposito.id)}&desde=${encodeURIComponent(new Date(`${desde}T00:00:00`).toISOString())}`);
      setItens(r.itens);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao carregar o que falta recontar.');
      setItens([]);
    }
  }, [deposito.id, desde]);

  useEffect(() => {
    if (open) void carregar();
  }, [open, carregar]);

  /** Grava uma contagem para o material — é o que carimba a recontagem. */
  async function contar(item: ItemNaoRecontado, contagem: number) {
    setOcupado(item.material_id);
    try {
      await api.post('/api/materials/bulk-recount', naUnidade({ warehouse_id: deposito.id, counts: [{ material_id: item.material_id, contagem }] }));
      setItens((atual) => (atual ?? []).filter((i) => i.material_id !== item.material_id));
      toast.success(contagem === item.saldo ? `${item.nome} conferido.` : `${item.nome} zerado.`);
      await refetch();
    } catch (err: any) {
      toast.error(err.message || 'Não foi possível salvar.');
    } finally {
      setOcupado(null);
    }
  }

  async function apagar(item: ItemNaoRecontado) {
    setOcupado(item.material_id);
    try {
      await api.delete(`/api/materials/${item.material_id}`);
      setItens((atual) => (atual ?? []).filter((i) => i.material_id !== item.material_id));
      setApagando(null);
      toast.success(`${item.nome} excluído.`);
      await refetch();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao excluir material.');
    } finally {
      setOcupado(null);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Falta recontar"
      subtitle={`${deposito.nome} — materiais sem contagem registrada no período`}
      maxWidth="max-w-3xl"
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3">
          <div>
            <label htmlFor="recontado-desde" className="mb-1 block text-xs font-semibold text-[var(--text)]">
              Conferidos a partir de
            </label>
            <input
              id="recontado-desde"
              type="date"
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)]"
            />
          </div>
          <p className="flex-1 text-xs text-[var(--text-muted)]">
            Aparece aqui quem não foi contado nesta data ou depois dela — incluindo quem nunca passou por uma recontagem.
          </p>
        </div>

        {itens === null ? (
          <p className="py-10 text-center text-sm text-[var(--text-muted)]">Carregando…</p>
        ) : itens.length === 0 ? (
          <EmptyState icon={<Check size={22} />} title="Tudo conferido" subtitle="Nenhum material deste estoque ficou sem recontagem no período escolhido." />
        ) : (
          <>
            <p className="text-sm font-semibold text-[var(--text)]">
              {itens.length} material(is) sem conferência
            </p>
            <div className="space-y-2">
              {itens.map((item) => {
                const material = materials.find((m) => m.id === item.material_id) ?? null;
                const ocupadoAqui = ocupado === item.material_id;
                return (
                  <div key={item.material_id} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[var(--text)]">{item.nome}</p>
                        <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                          Sistema: <strong className="text-[var(--text)]">{formatNumber(item.saldo)}</strong> {item.unidade_medida} · {item.categoria}
                        </p>
                        <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                          {item.recontado_em ? `Última contagem em ${new Date(item.recontado_em).toLocaleDateString('pt-BR')}${item.recontado_por ? ` por ${item.recontado_por}` : ''}` : 'Nunca recontado'}
                        </p>
                      </div>
                      {!item.recontado_em && <Badge variant="warning">Nunca contado</Badge>}
                    </div>

                    {apagando === item.material_id ? (
                      <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3">
                        <p className="flex items-start gap-2 text-xs text-rose-900">
                          <AlertTriangle size={14} className="mt-px shrink-0" />
                          Excluir <strong>{item.nome}</strong> apaga o cadastro do material. Se ele tem saldo ou histórico, prefira zerar.
                        </p>
                        <div className="mt-2 flex gap-2">
                          <Button variant="outline" onClick={() => setApagando(null)}>
                            Cancelar
                          </Button>
                          <Button variant="danger" loading={ocupadoAqui} onClick={() => apagar(item)}>
                            Excluir mesmo assim
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button variant="accent" icon={<Check size={14} />} loading={ocupadoAqui} onClick={() => contar(item, item.saldo)}>
                          Conferir ({formatNumber(item.saldo)})
                        </Button>
                        <Button variant="outline" loading={ocupadoAqui} onClick={() => contar(item, 0)} disabled={item.saldo === 0}>
                          Zerar
                        </Button>
                        {material && (
                          <Button variant="outline" icon={<Pencil size={14} />} onClick={() => onEditar(material)}>
                            Editar
                          </Button>
                        )}
                        <Button variant="outline" icon={<Trash2 size={14} />} onClick={() => setApagando(item.material_id)}>
                          Apagar
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
