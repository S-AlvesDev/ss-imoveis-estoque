import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ClipboardList, Plus } from 'lucide-react';
import { Card } from '@/shared/ui/Card';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { EmptyState } from '@/shared/ui/EmptyState';
import { SegmentedControl } from '@/shared/ui/SegmentedControl';
import { api } from '@/lib/api';
import { usePlano } from '@/features/planos/usePlano';
import { Cadeado } from '@/features/planos/Cadeado';
import { formatDateTime } from '@/features/estoque/utils';
import type { Material, Unidade } from '@/shared/types';
import { formatarMoeda, type Cotacao, type Fornecedor } from '@/shared/cotacoes';
import { Fornecedores } from './Fornecedores';
import { NovaCotacao } from './NovaCotacao';
import { CotacaoDetalhe } from './CotacaoDetalhe';

type Aba = 'cotacoes' | 'fornecedores';

interface Props {
  catalogo: Material[];
  unidade: Unidade | null;
}

/**
 * Compras: as cotações que a empresa mandou pelo WhatsApp e os
 * fornecedores que recebem. O sistema pergunta, a IA lê a resposta, a
 * tela compara — e a pessoa fecha o pedido.
 */
export function Compras({ catalogo, unidade }: Props) {
  const planoAtual = usePlano();
  const liberado = planoAtual.libera('cotacoes');
  const [aba, setAba] = useState<Aba>('cotacoes');
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [cotacoes, setCotacoes] = useState<Cotacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [criando, setCriando] = useState(false);
  const [aberta, setAberta] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const [f, c] = await Promise.all([api.get<{ fornecedores: Fornecedor[] }>('/api/fornecedores'), api.get<{ cotacoes: Cotacao[] }>('/api/cotacoes')]);
      setFornecedores(f.fornecedores);
      setCotacoes(c.cotacoes);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao carregar compras.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const ativos = fornecedores.filter((f) => f.ativo);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-[var(--text)]">Compras</h1>
          <p className="text-sm text-[var(--text-muted)]">Cotação pelo WhatsApp: o sistema pergunta aos fornecedores, lê as respostas e mostra onde está mais barato.</p>
        </div>
        <div className="flex items-center gap-3">
          <SegmentedControl value={aba} onChange={setAba} layoutId="compras-aba" options={[{ value: 'cotacoes', label: 'Cotações' }, { value: 'fornecedores', label: `Fornecedores (${ativos.length})` }]} />
          {aba === 'cotacoes' && (
            <Button icon={<Plus size={15} />} onClick={() => setCriando(true)} disabled={!liberado || ativos.length === 0} title={ativos.length === 0 ? 'Cadastre um fornecedor primeiro' : undefined}>
              Nova cotação
            </Button>
          )}
        </div>
      </div>

      {!liberado && <Cadeado texto={planoAtual.porQueNao('cotacoes')} />}

      {aba === 'fornecedores' ? (
        <Fornecedores fornecedores={fornecedores} loading={loading} refetch={carregar} />
      ) : (
        <Card className="overflow-hidden">
          {loading ? (
            <p className="p-10 text-center text-sm text-[var(--text-muted)]">Carregando…</p>
          ) : cotacoes.length === 0 ? (
            <EmptyState
              icon={<ClipboardList size={20} />}
              title="Nenhuma cotação ainda"
              subtitle={ativos.length === 0 ? 'Cadastre os fornecedores na aba ao lado; depois é só montar a lista e enviar.' : 'Monte a lista do que precisa, escolha os fornecedores e envie — as respostas chegam aqui.'}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-sm">
                <thead className="bg-[var(--surface)]">
                  <tr className="border-b border-[var(--border)] text-left">
                    <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Cotação</th>
                    <th className="px-3 py-3 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Itens</th>
                    <th className="px-3 py-3 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Fornecedores</th>
                    <th className="px-3 py-3 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Melhor total</th>
                    <th className="px-3 py-3 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {cotacoes.map((c) => {
                    const responderam = c.fornecedores.filter((f) => f.status === 'respondida' || f.status === 'pedido');
                    const melhor = responderam.filter((f) => f.total !== null).sort((a, b) => (a.total ?? 0) - (b.total ?? 0))[0];
                    const doPedido = c.pedido ? c.fornecedores.find((f) => f.fornecedor_id === c.pedido!.fornecedor_id) : null;
                    return (
                      <tr key={c.id} onClick={() => setAberta(c.id)} className="cursor-pointer border-b border-[var(--border)] transition-colors hover:bg-[var(--brand)]/5">
                        <td className="px-4 py-3">
                          <p className="font-semibold text-[var(--text)]">{c.titulo}</p>
                          <p className="text-[11px] text-[var(--text-muted)]">{formatDateTime(c.created_at)}{c.entrega ? ` · ${c.entrega}` : ''}</p>
                        </td>
                        <td className="px-3 py-3 text-xs text-[var(--text)]">{c.itens.length}</td>
                        <td className="px-3 py-3 text-xs text-[var(--text)]">
                          {responderam.length} de {c.fornecedores.length} responderam
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 font-mono text-xs text-[var(--text)]">
                          {melhor ? (
                            <>
                              {formatarMoeda(melhor.total)} <span className="font-sans text-[11px] text-[var(--text-muted)]">{melhor.fornecedor.nome}</span>
                            </>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3">
                          {c.status === 'aberta' && <Badge variant="info" dot>Aberta</Badge>}
                          {c.status === 'encerrada' && <Badge variant="success">Pedido{doPedido ? `: ${doPedido.fornecedor.nome}` : ''}</Badge>}
                          {c.status === 'cancelada' && <Badge variant="neutral">Cancelada</Badge>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      <NovaCotacao
        open={criando}
        onClose={() => setCriando(false)}
        onCriada={(c) => {
          carregar();
          setAberta(c.id);
        }}
        catalogo={catalogo}
        fornecedores={fornecedores}
        unidade={unidade}
      />
      <CotacaoDetalhe id={aberta} onClose={() => setAberta(null)} onMudou={carregar} />
    </div>
  );
}
