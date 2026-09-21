import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ClipboardList, Plus, WifiOff } from 'lucide-react';
import { Card } from '@/shared/ui/Card';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { EmptyState } from '@/shared/ui/EmptyState';
import { SegmentedControl } from '@/shared/ui/SegmentedControl';
import { api } from '@/lib/api';
import { useAtualizacaoAutomatica } from '@/lib/useAtualizacaoAutomatica';
import { usePlano } from '@/features/planos/usePlano';
import { Cadeado } from '@/features/planos/Cadeado';
import { formatDateTime } from '@/features/estoque/utils';
import type { Deposito, Material, Unidade } from '@/shared/types';
import { compararCotacao, formatarMoeda, type Cotacao, type Fornecedor } from '@/shared/cotacoes';
import { Fornecedores } from './Fornecedores';
import { NovaCotacao } from './NovaCotacao';
import { CotacaoDetalhe } from './CotacaoDetalhe';

type Aba = 'cotacoes' | 'fornecedores';

interface Props {
  catalogo: Material[];
  unidade: Unidade | null;
  /** Todos os estoques da organização — para dar entrada do pedido onde a pessoa escolher. */
  depositos: Deposito[];
}

/**
 * Compras: as cotações que a empresa mandou pelo WhatsApp e os
 * fornecedores que recebem. O sistema pergunta, a IA lê a resposta, a
 * tela compara — e a pessoa fecha o pedido.
 */
export function Compras({ catalogo, unidade, depositos }: Props) {
  const planoAtual = usePlano();
  const liberado = planoAtual.libera('cotacoes');
  const [aba, setAba] = useState<Aba>('cotacoes');
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [cotacoes, setCotacoes] = useState<Cotacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [criando, setCriando] = useState(false);
  const [aberta, setAberta] = useState<string | null>(null);
  /** Só quando a empresa usa o próprio número: se a sessão caiu, nada sai — melhor avisar antes de montar a cotação. */
  const [whatsappDaEmpresa, setWhatsappDaEmpresa] = useState<{ instancia: string | null; estado: string | null } | null>(null);

  const buscando = useRef(false);
  const carregar = useCallback(async (opcoes: { silencioso?: boolean } = {}) => {
    if (buscando.current) return;
    buscando.current = true;
    try {
      const [f, c] = await Promise.all([api.get<{ fornecedores: Fornecedor[] }>('/api/fornecedores'), api.get<{ cotacoes: Cotacao[] }>('/api/cotacoes')]);
      setFornecedores(f.fornecedores);
      setCotacoes(c.cotacoes);
    } catch (err: any) {
      if (!opcoes.silencioso) toast.error(err.message || 'Erro ao carregar compras.');
    } finally {
      buscando.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);
  // Fornecedor responde pelo WhatsApp a qualquer hora: a lista acompanha sozinha.
  const emSegundoPlano = useCallback(() => {
    carregar({ silencioso: true });
  }, [carregar]);
  useAtualizacaoAutomatica(emSegundoPlano, 30_000);

  useEffect(() => {
    api
      .get<{ instancia: string | null; estado: string | null }>('/api/whatsapp/empresa')
      .then(setWhatsappDaEmpresa)
      .catch(() => setWhatsappDaEmpresa(null));
  }, []);

  const ativos = fornecedores.filter((f) => f.ativo);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-[var(--text)]">Compras</h1>
          <p className="text-sm text-[var(--text-muted)]">Cotação pelo WhatsApp: o sistema pergunta aos fornecedores, lê as respostas e mostra onde está mais barato.</p>
        </div>
        <div className="flex items-center gap-3">
          <SegmentedControl value={aba} onChange={setAba} layoutId="compras-aba" options={[{ value: 'cotacoes', label: 'Cotações' }, { value: 'fornecedores', label: `Fornecedores (${fornecedores.length})` }]} />
          {aba === 'cotacoes' && (
            <Button icon={<Plus size={15} />} onClick={() => setCriando(true)} disabled={!liberado || ativos.length === 0} title={ativos.length === 0 ? 'Cadastre um fornecedor primeiro' : undefined}>
              Nova cotação
            </Button>
          )}
        </div>
      </div>

      {!liberado && <Cadeado texto={planoAtual.porQueNao('cotacoes')} />}

      {whatsappDaEmpresa?.instancia && whatsappDaEmpresa.estado !== 'open' && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-orange-500/30 bg-orange-500/10 p-4">
          <WifiOff size={18} className="shrink-0 text-orange-500" />
          <p className="min-w-0 flex-1 text-sm text-[var(--text)]">
            <strong>O WhatsApp da sua empresa está desconectado.</strong> Enquanto isso, cotações e pedidos não saem. Reconecte pelo QR em Configurações → Stok Aí no WhatsApp — ou desconecte o número da empresa para enviar pelo número do Stok Aí.
          </p>
        </div>
      )}

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
                    const comparacao = compararCotacao(c.itens, c.fornecedores.map((f) => ({ fornecedor_id: f.fornecedor_id, precos: f.precos })));
                    const melhor = comparacao.melhorTotal ? c.fornecedores.find((f) => f.fornecedor_id === comparacao.melhorTotal) : undefined;
                    const melhorInfo = comparacao.melhorTotal ? comparacao.totais[comparacao.melhorTotal] : null;
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
                          {melhor && melhorInfo ? (
                            <>
                              {formatarMoeda(melhorInfo.total)}{' '}
                              <span className="font-sans text-[11px] text-[var(--text-muted)]">
                                {melhor.fornecedor.nome}
                                {!melhorInfo.completo ? ` · ${melhorInfo.itensCotados} de ${c.itens.length} itens` : ''}
                              </span>
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
      <CotacaoDetalhe id={aberta} onClose={() => setAberta(null)} onMudou={carregar} depositos={depositos} />
    </div>
  );
}
