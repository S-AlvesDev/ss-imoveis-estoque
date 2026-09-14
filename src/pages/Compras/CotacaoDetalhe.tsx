import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, MessageSquareText, RefreshCw, Send, Trophy, XCircle } from 'lucide-react';
import { Modal } from '@/shared/ui/Modal';
import { Button } from '@/shared/ui/Button';
import { Badge } from '@/shared/ui/Badge';
import { Textarea } from '@/shared/ui/Field';
import { api } from '@/lib/api';
import { formatDateTime } from '@/features/estoque/utils';
import { compararCotacao, formatarMoeda, NOME_DO_STATUS_DO_FORNECEDOR, type Cotacao, type FornecedorNaCotacao } from '@/shared/cotacoes';

const BADGE: Record<FornecedorNaCotacao['status'], 'neutral' | 'info' | 'success' | 'warning' | 'critical' | 'indigo'> = {
  pendente: 'neutral',
  enviada: 'info',
  respondida: 'success',
  sem_estoque: 'warning',
  erro: 'critical',
  pedido: 'indigo',
};

interface Props {
  id: string | null;
  onClose: () => void;
  onMudou: () => void;
}

/**
 * Uma cotação por dentro: a tabela item × fornecedor com o mais barato
 * marcado, o total de cada um, a conversa e o botão de fechar o pedido.
 * Recarrega sozinha a cada 20 s enquanto está aberta — resposta chega
 * pelo WhatsApp a qualquer hora.
 */
export function CotacaoDetalhe({ id, onClose, onMudou }: Props) {
  const [c, setC] = useState<Cotacao | null>(null);
  const [conversaDe, setConversaDe] = useState<string | null>(null);
  const [fechandoCom, setFechandoCom] = useState<string | null>(null);
  const [obsPedido, setObsPedido] = useState('');
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    if (!id) {
      setC(null);
      return;
    }
    let vivo = true;
    const carregar = () =>
      api
        .get<{ cotacao: Cotacao }>(`/api/cotacoes/${id}`)
        .then((r) => vivo && setC(r.cotacao))
        .catch(() => {});
    carregar();
    const t = setInterval(carregar, 20_000);
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, [id]);

  const comp = useMemo(() => (c ? compararCotacao(c.itens, c.fornecedores.map((f) => ({ fornecedor_id: f.fornecedor_id, precos: f.precos }))) : null), [c]);

  async function reenviar(fornecedorId?: string) {
    if (!c) return;
    setOcupado(true);
    try {
      const r = await api.post<{ cotacao: Cotacao; envio: { enviados: number; falhas: number } }>(`/api/cotacoes/${c.id}/reenviar`, fornecedorId ? { fornecedores: [fornecedorId] } : {});
      setC(r.cotacao);
      toast.success(r.envio.enviados ? `Reenviada para ${r.envio.enviados}.` : 'Ninguém para reenviar.');
      onMudou();
    } catch (err: any) {
      toast.error(err.message || 'Não foi possível reenviar.');
    } finally {
      setOcupado(false);
    }
  }

  async function fecharPedido() {
    if (!c || !fechandoCom) return;
    setOcupado(true);
    try {
      const r = await api.post<{ cotacao: Cotacao }>(`/api/cotacoes/${c.id}/pedido`, { fornecedor_id: fechandoCom, observacoes: obsPedido.trim() || null });
      setC(r.cotacao);
      setFechandoCom(null);
      setObsPedido('');
      toast.success('Pedido enviado ao fornecedor pelo WhatsApp.');
      onMudou();
    } catch (err: any) {
      toast.error(err.message || 'Não foi possível fechar o pedido.');
    } finally {
      setOcupado(false);
    }
  }

  async function cancelar() {
    if (!c) return;
    setOcupado(true);
    try {
      const r = await api.post<{ cotacao: Cotacao }>(`/api/cotacoes/${c.id}/cancelar`, {});
      setC(r.cotacao);
      toast.success('Cotação cancelada.');
      onMudou();
    } catch (err: any) {
      toast.error(err.message || 'Não foi possível cancelar.');
    } finally {
      setOcupado(false);
    }
  }

  const aberta = c?.status === 'aberta';
  const fornecedorDoPedido = c?.pedido ? c.fornecedores.find((f) => f.fornecedor_id === c.pedido!.fornecedor_id) : null;
  const conversa = conversaDe ? c?.fornecedores.find((f) => f.fornecedor_id === conversaDe) : null;
  const escolhido = fechandoCom ? c?.fornecedores.find((f) => f.fornecedor_id === fechandoCom) : null;

  return (
    <>
    <Modal
      open={!!id}
      onClose={onClose}
      title={c?.titulo ?? 'Cotação'}
      subtitle={
        c ? (
          <span>
            {c.status === 'aberta' && <Badge variant="info" dot>Aberta</Badge>}
            {c.status === 'encerrada' && <Badge variant="success">Pedido fechado{fornecedorDoPedido ? ` com ${fornecedorDoPedido.fornecedor.nome}` : ''}</Badge>}
            {c.status === 'cancelada' && <Badge variant="neutral">Cancelada</Badge>}
            <span className="ml-2 text-[11px] text-[var(--text-muted)]">criada em {formatDateTime(c.created_at)}{c.entrega ? ` · entrega em ${c.entrega}` : ''}</span>
          </span>
        ) : undefined
      }
      maxWidth="max-w-4xl"
      footer={
        <>
          {aberta && (
            <Button variant="ghost" onClick={cancelar} disabled={ocupado} icon={<XCircle size={14} />}>
              Cancelar cotação
            </Button>
          )}
          {aberta && (
            <Button variant="outline" onClick={() => reenviar()} loading={ocupado} icon={<RefreshCw size={14} />}>
              Lembrar quem não respondeu
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>Fechar</Button>
        </>
      }
    >
      {!c || !comp ? (
        <p className="py-8 text-center text-sm text-[var(--text-muted)]">Carregando…</p>
      ) : (
        <div className="space-y-5">
          <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead className="bg-[var(--surface)]">
                <tr className="border-b border-[var(--border)] text-left">
                  <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Item</th>
                  {c.fornecedores.map((f) => (
                    <th key={f.fornecedor_id} className="px-3 py-2.5 align-top">
                      <p className="text-xs font-bold text-[var(--text)]">{f.fornecedor.nome}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <Badge variant={BADGE[f.status]}>{NOME_DO_STATUS_DO_FORNECEDOR[f.status]}</Badge>
                        {f.status === 'erro' && aberta && (
                          <button onClick={() => reenviar(f.fornecedor_id)} className="text-[10px] font-bold text-[var(--brand)] hover:underline">reenviar</button>
                        )}
                      </div>
                      {f.erro && <p className="mt-1 max-w-[180px] text-[10px] text-rose-500">{f.erro}</p>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {c.itens.map((item) => {
                  const linha = comp.porItem.find((p) => p.n === item.n)!;
                  return (
                    <tr key={item.n} className="border-b border-[var(--border)]">
                      <td className="px-3 py-2.5">
                        <p className="font-semibold text-[var(--text)]">
                          <span className="mr-1.5 text-[var(--text-muted)]">{item.n})</span>
                          {item.descricao}
                        </p>
                        <p className="text-[11px] text-[var(--text-muted)]">{item.quantidade} {item.unidade}</p>
                      </td>
                      {c.fornecedores.map((f) => {
                        const p = linha.precos[f.fornecedor_id];
                        const melhor = linha.melhor === f.fornecedor_id && c.fornecedores.filter((x) => linha.precos[x.fornecedor_id]?.preco_unitario != null).length > 1;
                        return (
                          <td key={f.fornecedor_id} className={`px-3 py-2.5 align-top ${melhor ? 'bg-emerald-500/8' : ''}`}>
                            {!p ? (
                              <span className="text-xs text-[var(--text-muted)]">—</span>
                            ) : !p.disponivel ? (
                              <span className="text-xs text-[var(--text-muted)]">não tem</span>
                            ) : (
                              <>
                                <p className={`font-mono text-sm ${melhor ? 'font-bold text-emerald-600 dark:text-emerald-400' : 'text-[var(--text)]'}`}>
                                  {formatarMoeda(p.preco_unitario)}
                                  {melhor && <Trophy size={12} className="ml-1 inline-block" />}
                                </p>
                                {p.preco_unitario !== null && <p className="text-[11px] text-[var(--text-muted)]">= {formatarMoeda(p.preco_unitario * item.quantidade)}</p>}
                                {p.prazo && <p className="text-[11px] text-[var(--text-muted)]">prazo {p.prazo}</p>}
                                {p.observacao && <p className="text-[11px] italic text-[var(--text-muted)]">{p.observacao}</p>}
                              </>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-[var(--surface)]">
                <tr>
                  <td className="px-3 py-3 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Total</td>
                  {c.fornecedores.map((f) => {
                    const t = comp.totais[f.fornecedor_id];
                    const ganhador = comp.melhorTotal === f.fornecedor_id && Object.values(comp.totais).filter((x) => x.itensCotados > 0).length > 1;
                    return (
                      <td key={f.fornecedor_id} className={`px-3 py-3 align-top ${ganhador ? 'bg-emerald-500/8' : ''}`}>
                        {t && t.itensCotados > 0 ? (
                          <>
                            <p className={`font-mono text-base font-bold ${ganhador ? 'text-emerald-600 dark:text-emerald-400' : 'text-[var(--text)]'}`}>{formatarMoeda(t.total)}</p>
                            <p className="text-[11px] text-[var(--text-muted)]">{t.completo ? 'todos os itens' : `${t.itensCotados} de ${c.itens.length} itens`}</p>
                          </>
                        ) : (
                          <span className="text-xs text-[var(--text-muted)]">—</span>
                        )}
                        <div className="mt-2 flex flex-wrap gap-1">
                          <button onClick={() => setConversaDe(f.fornecedor_id)} className="inline-flex items-center gap-1 rounded-md bg-[var(--bg-2)] px-2 py-1 text-[10px] font-bold text-[var(--text-muted)] hover:text-[var(--text)]" title="Ver a conversa">
                            <MessageSquareText size={11} /> conversa
                          </button>
                          {aberta && t && t.itensCotados > 0 && (
                            <button onClick={() => setFechandoCom(f.fornecedor_id)} className="inline-flex items-center gap-1 rounded-md bg-[var(--brand)] px-2 py-1 text-[10px] font-bold text-white hover:brightness-105">
                              <CheckCircle2 size={11} /> fechar pedido
                            </button>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              </tfoot>
            </table>
          </div>

          {Object.values(comp.totais).filter((t) => t.itensCotados > 0).length > 1 && comp.melhorCombinado > 0 && (
            <p className="text-xs text-[var(--text-muted)]">
              Comprando cada item do mais barato daria <strong className="text-[var(--text)]">{formatarMoeda(comp.melhorCombinado)}</strong>
              {comp.melhorTotal && comp.totais[comp.melhorTotal] ? <> — contra {formatarMoeda(comp.totais[comp.melhorTotal].total)} fechando tudo com um só.</> : '.'}
            </p>
          )}

          {c.observacoes && <p className="text-xs text-[var(--text-muted)]">Observações enviadas: {c.observacoes}</p>}
        </div>
      )}
    </Modal>

      <Modal open={!!conversa} onClose={() => setConversaDe(null)} title={conversa ? `Conversa com ${conversa.fornecedor.nome}` : ''} subtitle="O que o sistema mandou e o que o fornecedor respondeu, pelo WhatsApp." maxWidth="max-w-lg">
        <div className="max-h-[60vh] space-y-2 overflow-y-auto">
          {conversa?.conversa.length === 0 && <p className="text-xs text-[var(--text-muted)]">Nada ainda.</p>}
          {conversa?.conversa.map((f, i) => (
            <div key={i} className={`flex flex-col ${f.de === 'nos' ? 'items-end' : 'items-start'}`}>
              <p className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${f.de === 'nos' ? 'rounded-br-sm bg-[var(--brand)] text-white' : 'rounded-bl-sm bg-[var(--bg-2)] text-[var(--text)]'}`}>{f.texto}</p>
              <span className="mt-0.5 text-[10px] text-[var(--text-muted)]">{formatDateTime(f.em)}</span>
            </div>
          ))}
        </div>
      </Modal>

      <Modal
        open={!!escolhido}
        onClose={() => setFechandoCom(null)}
        title={escolhido ? `Fechar pedido com ${escolhido.fornecedor.nome}?` : ''}
        subtitle={escolhido ? `Vai pelo WhatsApp: os itens com preço, o total de ${formatarMoeda(escolhido.total)}, o endereço de entrega e o pedido da nota fiscal em nome da empresa. A cotação encerra.` : ''}
        footer={
          <>
            <Button variant="ghost" onClick={() => setFechandoCom(null)}>Voltar</Button>
            <Button onClick={fecharPedido} loading={ocupado} icon={<Send size={14} />}>Enviar pedido</Button>
          </>
        }
      >
        <Textarea label="Recado extra para o fornecedor (opcional)" value={obsPedido} onChange={(e) => setObsPedido(e.target.value)} rows={2} placeholder="Entregar de manhã, falar com o Carlos no portão." />
      </Modal>
    </>
  );
}
