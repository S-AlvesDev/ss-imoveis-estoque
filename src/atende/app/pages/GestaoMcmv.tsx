import { useEffect, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { FileCheck2, Phone, RefreshCw } from 'lucide-react';
import { Botao } from '../ui/Botao';
import { Cartao } from '../ui/Cartao';
import { Etiqueta } from '../ui/Etiqueta';
import { Modal } from '../ui/Modal';
import { AreaDeTexto, Selecao } from '../ui/Campo';
import { Pagina } from '../ui/Pagina';
import { Vazio, Esqueleto } from '../ui/Estados';
import { DocumentosDoCliente } from '../ui/DocumentosDoCliente';
import { api, ErroDaApi } from '../lib/api';
import { useDadosAtende } from '../store/dados';
import { ESTADOS_MCMV, NOME_DO_ESTADO_MCMV, type EstadoMcmv, type EventoMcmv, type ItemDoPipelineMcmv } from '../../shared/tipos';

const TOM_DA_ETAPA: Record<EstadoMcmv, 'azul' | 'ambar' | 'verde' | 'vermelho'> = {
  em_analise: 'azul',
  aprovado_condicionado: 'ambar',
  aprovado: 'verde',
  reprovado: 'vermelho',
};

/** A bolinha de cada coluna — a mesma cor da etiqueta daquela etapa. */
const COR_DA_ETAPA: Record<EstadoMcmv, string> = {
  em_analise: '#0ea5e9',
  aprovado_condicionado: '#f59e0b',
  aprovado: '#16a34a',
  reprovado: '#e11d48',
};

/** Quantos cartões cada coluna mostra antes de oferecer "ver todos". */
const LIMITE_POR_COLUNA = 12;

function tempoDesde(iso: string): string {
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000));
  if (dias <= 0) return 'hoje';
  if (dias === 1) return 'há 1 dia';
  return `há ${dias} dias`;
}

/** A pílula da barra de resumo: bolinha da etapa, rótulo, contagem e a fatia do total. */
function PilulaDeResumo({ cor, rotulo, quantidade, pct }: { cor: string; rotulo: string; quantidade: number; pct: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-xs shadow-[0_1px_2px_rgba(23,21,58,0.03)]">
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: cor }} />
      <span className="font-semibold text-[var(--text)]">{rotulo}:</span>
      <span className="font-bold text-[var(--text)]">{quantidade}</span>
      <span className="text-[var(--text-muted)]">({pct}%)</span>
    </span>
  );
}

/** Um item da grade de informações do modal: rótulo miúdo em caixa alta + valor. */
function Info({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">{rotulo}</p>
      <p className="mt-0.5 text-sm font-medium text-[var(--text)]">{children}</p>
    </div>
  );
}

/**
 * O pipeline de análise de financiamento MCMV — separado do funil de vendas
 * geral. Quem atende encaminha um lead para cá (na conversa, painel de
 * Triagem); daqui em diante, quem analisa move a etapa e cuida dos
 * documentos, sem abrir a conversa do WhatsApp.
 */
export function GestaoMcmv() {
  const [itens, setItens] = useState<ItemDoPipelineMcmv[] | null>(null);
  const [atualizando, setAtualizando] = useState(false);
  const [selecionado, setSelecionado] = useState<ItemDoPipelineMcmv | null>(null);
  const [expandidas, setExpandidas] = useState<Record<string, boolean>>({});

  function carregar(mostrarSpinner = false) {
    if (mostrarSpinner) setAtualizando(true);
    api
      .get<{ itens: ItemDoPipelineMcmv[] }>('/mcmv')
      .then((r) => setItens(r.itens))
      .catch((err) => toast.error(err instanceof ErroDaApi ? err.message : 'Erro ao carregar o pipeline.'))
      .finally(() => setAtualizando(false));
  }

  useEffect(() => {
    carregar();
  }, []);

  const total = itens?.length ?? 0;
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);

  return (
    <Pagina
      titulo="Gestão de MCMV"
      descricao={itens === null ? 'Quem está em análise de financiamento, etapa por etapa.' : `${total} ${total === 1 ? 'financiamento em análise' : 'financiamentos em análise'} · documentos e notas sem abrir o WhatsApp`}
      largura="cheia"
      acoes={
        <Botao tamanho="sm" variante="secundaria" icone={<RefreshCw size={14} />} carregando={atualizando} onClick={() => carregar(true)}>
          Atualizar
        </Botao>
      }
    >
      {itens === null ? (
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <Esqueleto key={i} className="h-56 w-72 shrink-0" />
          ))}
        </div>
      ) : itens.length === 0 ? (
        <Cartao>
          <Vazio icone={<FileCheck2 size={22} />} titulo="Ninguém no pipeline de MCMV ainda" texto="Quem atende encaminha um lead para cá pela conversa, no painel da triagem." />
        </Cartao>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Etapas</span>
            {ESTADOS_MCMV.map((etapa) => (
              <PilulaDeResumo key={etapa} cor={COR_DA_ETAPA[etapa]} rotulo={NOME_DO_ESTADO_MCMV[etapa]} quantidade={itens.filter((i) => i.mcmv_status === etapa).length} pct={pct(itens.filter((i) => i.mcmv_status === etapa).length)} />
            ))}
          </div>

          <div className="flex gap-3 overflow-x-auto pb-3">
            {ESTADOS_MCMV.map((etapa) => {
              const doEtapa = itens.filter((i) => i.mcmv_status === etapa);
              const expandida = expandidas[etapa];
              const visiveis = expandida ? doEtapa : doEtapa.slice(0, LIMITE_POR_COLUNA);
              return (
                <div key={etapa} className="flex w-72 shrink-0 flex-col rounded-2xl border border-[var(--border)] bg-[var(--bg-2)]/70 p-2">
                  <div className="flex items-center gap-1.5 px-1.5 pb-2 pt-1">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: COR_DA_ETAPA[etapa] }} />
                    <span className="truncate text-[13px] font-semibold text-[var(--text)]">{NOME_DO_ESTADO_MCMV[etapa]}</span>
                    <span className="ml-auto shrink-0 text-[11px] font-semibold tabular-nums text-[var(--text-muted)]">{doEtapa.length}</span>
                  </div>
                  <div className="space-y-2">
                    {doEtapa.length === 0 ? (
                      <div className="px-3 py-8 text-center text-xs text-[var(--text-disable)]">Vazio</div>
                    ) : (
                      visiveis.map((item) => (
                        <button key={item.lead_id} type="button" onClick={() => setSelecionado(item)} className="block w-full text-left">
                          <Cartao className="p-3 transition-shadow hover:shadow-[var(--sombra-flutuante)]">
                            <p className="truncate text-sm font-bold text-[var(--text)]">{item.cliente_nome}</p>
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              <Etiqueta tom="cinza">
                                <Phone size={10} className="mr-0.5 inline" /> +{item.telefone}
                              </Etiqueta>
                            </div>
                            <div className="mt-2 border-t border-[var(--border)] pt-1.5 text-[11px] text-[var(--text-muted)]">Atualizado {tempoDesde(item.mcmv_atualizado_em)}</div>
                          </Cartao>
                        </button>
                      ))
                    )}
                    {doEtapa.length > LIMITE_POR_COLUNA && (
                      <Botao variante="fantasma" tamanho="sm" largo onClick={() => setExpandidas((e) => ({ ...e, [etapa]: !expandida }))}>
                        {expandida ? 'Ver menos' : `Ver todos (${doEtapa.length})`}
                      </Botao>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {selecionado && (
        <ModalDoItem
          item={selecionado}
          onFechar={() => setSelecionado(null)}
          onSalvo={(atualizado) => {
            setItens((atual) => (atual ?? []).map((i) => (i.lead_id === atualizado.lead_id ? atualizado : i)));
            setSelecionado(atualizado);
          }}
        />
      )}
    </Pagina>
  );
}

function ModalDoItem({ item, onFechar, onSalvo }: { item: ItemDoPipelineMcmv; onFechar: () => void; onSalvo: (item: ItemDoPipelineMcmv) => void }) {
  const equipe = useDadosAtende((s) => s.equipe);
  const [status, setStatus] = useState<EstadoMcmv>(item.mcmv_status);
  const [nota, setNota] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [eventos, setEventos] = useState<EventoMcmv[] | null>(null);

  function carregarHistorico() {
    api
      .get<{ eventos: EventoMcmv[] }>(`/mcmv/${item.lead_id}/historico`)
      .then((r) => setEventos(r.eventos))
      .catch(() => setEventos([]));
  }

  useEffect(() => {
    carregarHistorico();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.lead_id]);

  async function salvar() {
    setSalvando(true);
    try {
      const r = await api.put<{ item: ItemDoPipelineMcmv }>(`/mcmv/${item.lead_id}`, { status, nota: nota || undefined });
      toast.success('Etapa atualizada.');
      setNota('');
      carregarHistorico();
      onSalvo(r.item);
    } catch (err) {
      toast.error(err instanceof ErroDaApi ? err.message : 'Não foi possível salvar.');
    } finally {
      setSalvando(false);
    }
  }

  const nomeDe = (id: number | null) => (id ? (equipe.find((f) => f.id === id)?.nome ?? `#${id}`) : 'Alguém');

  return (
    <Modal aberto onFechar={onFechar} titulo={item.cliente_nome} descricao={`+${item.telefone}`} largura="lg">
      <div className="space-y-5">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Selecao rotulo="Etapa de crédito" value={status} onChange={(e) => setStatus(e.target.value as EstadoMcmv)}>
              {ESTADOS_MCMV.map((e) => (
                <option key={e} value={e}>
                  {NOME_DO_ESTADO_MCMV[e]}
                </option>
              ))}
            </Selecao>
            <div>
              <p className="mb-1.5 block text-xs font-semibold text-[var(--text)]">Etapa atual</p>
              <div className="flex h-[42px] items-center rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3.5">
                <Etiqueta tom={TOM_DA_ETAPA[item.mcmv_status]}>{NOME_DO_ESTADO_MCMV[item.mcmv_status]}</Etiqueta>
              </div>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4 border-t border-[var(--border)] pt-4">
            <Info rotulo="Entrou na análise">{new Date(item.mcmv_iniciado_em).toLocaleDateString('pt-BR')}</Info>
            <Info rotulo="Atualizado em">{new Date(item.mcmv_atualizado_em).toLocaleDateString('pt-BR')}</Info>
          </div>
        </div>

        <AreaDeTexto rotulo="Nota" ajuda="Registrada no histórico junto com a mudança de etapa." rows={3} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="O que foi feito, o que falta…" maxLength={1000} />

        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Documentos</p>
          <DocumentosDoCliente clienteId={item.cliente_id} />
        </div>

        <div className="border-t border-[var(--border)] pt-4">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Histórico</p>
          {eventos === null ? (
            <p className="text-xs text-[var(--text-muted)]">Carregando…</p>
          ) : eventos.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)]">Nenhuma mudança registrada ainda.</p>
          ) : (
            <ul className="space-y-2 text-xs">
              {eventos.map((e) => (
                <li key={e.id} className="rounded-lg border border-[var(--border)] px-2.5 py-2">
                  <p className="text-[var(--text)]">
                    <strong>{nomeDe(e.usuario_id)}</strong> moveu: {e.de ? NOME_DO_ESTADO_MCMV[e.de] : 'fora do pipeline'} → {NOME_DO_ESTADO_MCMV[e.para]}
                  </p>
                  {e.nota && <p className="mt-0.5 text-[var(--text-muted)]">{e.nota}</p>}
                  <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">{new Date(e.criado_em).toLocaleString('pt-BR')}</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-[var(--border)] pt-4">
          <Botao variante="fantasma" onClick={onFechar}>
            Fechar
          </Botao>
          <Botao onClick={salvar} carregando={salvando} disabled={status === item.mcmv_status && !nota}>
            Salvar
          </Botao>
        </div>
      </div>
    </Modal>
  );
}
