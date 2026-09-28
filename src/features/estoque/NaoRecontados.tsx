import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Check, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/shared/ui/Button';
import { Badge } from '@/shared/ui/Badge';
import { EmptyState } from '@/shared/ui/EmptyState';
import { SegmentedControl } from '@/shared/ui/SegmentedControl';
import { api } from '@/lib/api';
import { naUnidade } from '@/store/unidade';
import type { Deposito, Material } from '@/shared/types';
import { formatNumber } from './utils';

/** Uma linha do que falta conferir, como o servidor devolve. */
export interface ItemNaoRecontado {
  material_id: number;
  nome: string;
  categoria: string;
  unidade_medida: string;
  estoque_minimo: number;
  saldo: number;
  recontado_em: string | null;
  recontado_por: string | null;
}

/** O que conta como "recentemente". A recontagem aqui é rotina diária, mas
 *  ninguém confere o depósito inteiro todo dia — uma semana é o padrão. */
type Janela = '1' | '7' | '30';
const JANELAS: { value: Janela; label: string }[] = [
  { value: '1', label: 'Hoje' },
  { value: '7', label: '7 dias' },
  { value: '30', label: '30 dias' },
];

function inicioDaJanela(dias: Janela): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (dias !== '1') d.setDate(d.getDate() - (Number(dias) - 1));
  return d;
}

function diasDesde(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

interface NaoRecontadosProps {
  deposito: Deposito;
  materials: Material[];
  /** Abre a ficha do material para editar (o mesmo modal da tela de materiais). */
  onEditar: (m: Material) => void;
  refetch: () => Promise<void>;
  /** Avisa a aba quantos estão pendentes, para o contador no título. */
  onContagem?: (n: number) => void;
}

/**
 * A aba "Falta recontar": o que não passou por contagem na janela escolhida.
 *
 * Existe porque a recontagem só deixava rastro havendo divergência — material
 * conferido e material esquecido ficavam iguais no banco. Desde a migração
 * 055 toda contagem carimba o saldo, e esta aba mostra quem ficou sem.
 *
 * Quem nunca foi recontado vem primeiro, marcado como urgente: é o caso em
 * que o saldo do sistema nunca foi confrontado com a prateleira.
 */
export function NaoRecontados({ deposito, materials, onEditar, refetch, onContagem }: NaoRecontadosProps) {
  const [janela, setJanela] = useState<Janela>('7');
  const [itens, setItens] = useState<ItemNaoRecontado[] | null>(null);
  const [ocupado, setOcupado] = useState<number | null>(null);
  const [apagando, setApagando] = useState<number | null>(null);

  const carregar = useCallback(async () => {
    setItens(null);
    try {
      const desde = inicioDaJanela(janela).toISOString();
      const r = await api.get<{ itens: ItemNaoRecontado[] }>(`/api/materials/nao-recontados?warehouse_id=${encodeURIComponent(deposito.id)}&desde=${encodeURIComponent(desde)}`);
      // Nunca contado primeiro; depois o mais antigo, que é o mais atrasado.
      const ordenados = [...r.itens].sort((a, b) => {
        if (!a.recontado_em && b.recontado_em) return -1;
        if (a.recontado_em && !b.recontado_em) return 1;
        if (a.recontado_em && b.recontado_em) return a.recontado_em.localeCompare(b.recontado_em);
        return a.nome.localeCompare(b.nome, 'pt-BR');
      });
      setItens(ordenados);
      onContagem?.(ordenados.length);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao carregar o que falta recontar.');
      setItens([]);
    }
  }, [deposito.id, janela, onContagem]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  function tirarDaLista(materialId: number) {
    setItens((atual) => {
      const resto = (atual ?? []).filter((i) => i.material_id !== materialId);
      onContagem?.(resto.length);
      return resto;
    });
  }

  /** Grava uma contagem para o material — é o que carimba a recontagem. */
  async function contar(item: ItemNaoRecontado, contagem: number) {
    setOcupado(item.material_id);
    try {
      await api.post('/api/materials/bulk-recount', naUnidade({ warehouse_id: deposito.id, counts: [{ material_id: item.material_id, contagem }] }));
      tirarDaLista(item.material_id);
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
      tirarDaLista(item.material_id);
      setApagando(null);
      toast.success(`${item.nome} excluído.`);
      await refetch();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao excluir material.');
    } finally {
      setOcupado(null);
    }
  }

  const nunca = (itens ?? []).filter((i) => !i.recontado_em).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-[var(--text-muted)]">Sem contagem registrada em</p>
        <SegmentedControl value={janela} onChange={setJanela} layoutId={`recontar-${deposito.id}`} options={JANELAS} />
      </div>

      {nunca > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900">
          <AlertTriangle size={14} className="mt-px shrink-0" />
          <span>
            <strong>{nunca}</strong> material(is) nunca passaram por recontagem. O saldo deles nunca foi confrontado com a prateleira.
          </span>
        </div>
      )}

      {itens === null ? (
        <p className="py-10 text-center text-sm text-[var(--text-muted)]">Carregando…</p>
      ) : itens.length === 0 ? (
        <EmptyState icon={<Check size={22} />} title="Tudo conferido" subtitle="Nenhum material deste estoque ficou sem recontagem no período." />
      ) : (
        <div className="max-h-[420px] space-y-2 overflow-y-auto">
          {itens.map((item) => {
            const material = materials.find((m) => m.id === item.material_id) ?? null;
            const ocupadoAqui = ocupado === item.material_id;
            const urgente = !item.recontado_em;
            return (
              <div key={item.material_id} className={`rounded-lg border p-3 ${urgente ? 'border-rose-200 bg-rose-50/40' : 'border-[var(--border)] bg-[var(--surface)]'}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[var(--text)]">{item.nome}</p>
                    <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                      Sistema: <strong className="text-[var(--text)]">{formatNumber(item.saldo)}</strong> {item.unidade_medida} · {item.categoria}
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                      {item.recontado_em ? (
                        <>
                          Última recontagem: <strong className="text-[var(--text)]">{new Date(item.recontado_em).toLocaleDateString('pt-BR')}</strong> ({diasDesde(item.recontado_em)} dias)
                          {item.recontado_por && ` · por ${item.recontado_por}`}
                        </>
                      ) : (
                        'Nunca recontado'
                      )}
                    </p>
                  </div>
                  {urgente && <Badge variant="critical">Urgente</Badge>}
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
      )}
    </div>
  );
}
