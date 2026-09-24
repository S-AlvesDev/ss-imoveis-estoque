import { useEffect, useState, type DragEvent, type FormEvent, type ReactNode } from 'react';
import { toast } from 'sonner';
import { FileCheck2, Kanban, MessageCircle, Plus, RefreshCw, Search, Sparkles, UserPlus, XCircle } from 'lucide-react';
import { Botao } from '../ui/Botao';
import { Cartao } from '../ui/Cartao';
import { Etiqueta } from '../ui/Etiqueta';
import { Modal } from '../ui/Modal';
import { Entrada, Selecao } from '../ui/Campo';
import { Pagina } from '../ui/Pagina';
import { Vazio, Esqueleto } from '../ui/Estados';
import { api, ErroDaApi } from '../lib/api';
import { useDadosAtende } from '../store/dados';
import { TELAS, useRotaAtende } from '../router';
import { ESTADOS_DO_LEAD, NOME_DO_ESTADO_DO_LEAD, NOME_DO_ESTADO_MCMV, type EstadoDoLead, type ItemDoFunilDeLeads } from '../../shared/tipos';

/**
 * As colunas do quadro são o funil de vendas — e só ele. A análise de
 * crédito (MCMV) é uma dimensão PARALELA: anda por conta própria e aparece
 * como etiqueta no cartão e no filtro, nunca prendendo o lead numa coluna.
 * Antes o `mcmv_status` virava uma coluna e o cartão ficava preso nela: a
 * etapa era salva mas o cartão não saía do lugar, e o funil travava.
 */
const COR_DA_COLUNA: Record<EstadoDoLead, string> = {
  novo: '#3b82f6',
  em_atendimento: '#7c3aed',
  em_negociacao: '#d97706',
  aguardando_cliente: '#94a3b8',
  convertido: '#16a34a',
  perdido: '#e11d48',
};

/** Quantos cartões cada coluna mostra antes de oferecer "ver todos". */
const LIMITE_POR_COLUNA = 12;

function tempoDesde(iso: string): string {
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000));
  if (dias <= 0) return 'hoje';
  if (dias === 1) return 'há 1 dia';
  return `há ${dias} dias`;
}

function moeda(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}

/** O somatório do topo da coluna, curto: "R$ 160 mil". */
function moedaCompacta(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 });
}

/** Tira acento e caixa, para a busca casar "Jose" com "José". */
function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/** A pílula da barra de resumo (origens): ícone, rótulo, contagem e a fatia do total. */
function PilulaDeResumo({ icone, cor, rotulo, quantidade, pct }: { icone: ReactNode; cor: string; rotulo: string; quantidade: number; pct: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-xs shadow-[0_1px_2px_rgba(23,21,58,0.03)]">
      <span className="flex shrink-0 items-center" style={{ color: cor }}>
        {icone}
      </span>
      <span className="font-semibold text-[var(--text)]">{rotulo}:</span>
      <span className="font-bold text-[var(--text)]">{quantidade}</span>
      <span className="text-[var(--text-muted)]">({pct}%)</span>
    </span>
  );
}

/**
 * O quadro geral do funil de vendas — todas as conversas da empresa, para
 * supervisor e admin. Diferente da Gestão de MCMV (que é o recorte que o
 * papel `analista` trabalha, sem abrir conversa): aqui dá para ver e mudar
 * a etapa geral — arrastando o cartão ou pelo modal — e encaminhar um lead
 * para a análise de crédito.
 */
export function GestaoDeLeads() {
  const ir = useRotaAtende((s) => s.ir);
  const [itens, setItens] = useState<ItemDoFunilDeLeads[] | null>(null);
  const [atualizando, setAtualizando] = useState(false);
  const [selecionado, setSelecionado] = useState<ItemDoFunilDeLeads | null>(null);
  const [novoLeadAberto, setNovoLeadAberto] = useState(false);
  const [expandidas, setExpandidas] = useState<Record<string, boolean>>({});
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<'todos' | 'credito' | 'sem_responsavel'>('todos');
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [colunaSobre, setColunaSobre] = useState<EstadoDoLead | null>(null);

  function carregar(mostrarSpinner = false) {
    if (mostrarSpinner) setAtualizando(true);
    api
      .get<{ itens: ItemDoFunilDeLeads[] }>('/funil-leads')
      .then((r) => setItens(r.itens))
      .catch((err) => toast.error(err instanceof ErroDaApi ? err.message : 'Erro ao carregar o funil.'))
      .finally(() => setAtualizando(false));
  }

  useEffect(() => {
    carregar();
  }, []);

  /** Move o lead de coluna: pinta na hora e desfaz se o servidor recusar. */
  async function mover(leadId: string, novo: EstadoDoLead) {
    const item = itens?.find((i) => i.lead_id === leadId);
    if (!item || item.estado === novo) return;
    const anterior = item.estado;
    setItens((atual) => (atual ?? []).map((i) => (i.lead_id === leadId ? { ...i, estado: novo } : i)));
    try {
      await api.patch(`/conversas/${item.conversa_id}/lead`, { estado: novo });
    } catch (err) {
      setItens((atual) => (atual ?? []).map((i) => (i.lead_id === leadId ? { ...i, estado: anterior } : i)));
      toast.error(err instanceof ErroDaApi ? err.message : 'Não foi possível mover o lead.');
    }
  }

  function soltarNa(coluna: EstadoDoLead) {
    return (e: DragEvent) => {
      e.preventDefault();
      setColunaSobre(null);
      setArrastando(null);
      const id = e.dataTransfer.getData('text/plain');
      if (id) void mover(id, coluna);
    };
  }

  const termo = normalizar(busca.trim());
  const visiveis = (itens ?? []).filter((i) => {
    if (filtro === 'credito' && !i.mcmv_status) return false;
    if (filtro === 'sem_responsavel' && i.atendente_id) return false;
    if (termo && !normalizar(i.cliente_nome).includes(termo) && !i.telefone.includes(termo)) return false;
    return true;
  });

  const total = itens?.length ?? 0;
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);
  const doWhatsapp = itens?.filter((i) => i.origem === 'whatsapp').length ?? 0;
  const manuais = itens?.filter((i) => i.origem === 'manual').length ?? 0;
  const filtrando = termo !== '' || filtro !== 'todos';

  return (
    <Pagina
      titulo="Gestão de Leads"
      descricao={itens === null ? 'O funil de vendas inteiro, de todas as conversas.' : `${total} ${total === 1 ? 'negociação' : 'negociações'} · arraste um cartão para mudar a etapa`}
      largura="cheia"
      acoes={
        <div className="flex items-center gap-2">
          <Botao tamanho="sm" variante="secundaria" icone={<RefreshCw size={14} />} carregando={atualizando} onClick={() => carregar(true)}>
            Atualizar
          </Botao>
          <Botao tamanho="sm" icone={<Plus size={14} />} onClick={() => setNovoLeadAberto(true)}>
            Novo Lead
          </Botao>
        </div>
      }
    >
      {itens === null ? (
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <Esqueleto key={i} className="h-56 w-72 shrink-0" />
          ))}
        </div>
      ) : itens.length === 0 ? (
        <Cartao>
          <Vazio icone={<Kanban size={22} />} titulo="Nenhum lead ainda" texto="Os leads aparecem aqui assim que uma conversa nova chega, ou você cadastra um com o botão Novo Lead." />
        </Cartao>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Entrada
              className="w-full sm:w-72"
              icone={<Search size={15} />}
              placeholder="Buscar por nome ou telefone…"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              aria-label="Buscar lead"
            />
            <Selecao className="w-full sm:w-56" value={filtro} onChange={(e) => setFiltro(e.target.value as typeof filtro)} aria-label="Filtrar leads">
              <option value="todos">Todos</option>
              <option value="credito">Em análise de crédito</option>
              <option value="sem_responsavel">Sem responsável</option>
            </Selecao>
            {filtrando && (
              <span className="text-xs text-[var(--text-muted)]">
                {visiveis.length} de {total}
              </span>
            )}
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Origens</span>
            <PilulaDeResumo icone={<MessageCircle size={13} />} cor="#0ea5e9" rotulo="WhatsApp" quantidade={doWhatsapp} pct={pct(doWhatsapp)} />
            <PilulaDeResumo icone={<UserPlus size={13} />} cor="#ec4899" rotulo="Manual" quantidade={manuais} pct={pct(manuais)} />
          </div>

          <div className="flex gap-3 overflow-x-auto pb-3">
            {ESTADOS_DO_LEAD.map((coluna) => {
              const doColuna = visiveis.filter((i) => i.estado === coluna);
              const expandida = expandidas[coluna];
              const mostrados = expandida ? doColuna : doColuna.slice(0, LIMITE_POR_COLUNA);
              const soma = doColuna.reduce((t, i) => t + (i.valor ?? 0), 0);
              const alvo = colunaSobre === coluna;
              return (
                <div
                  key={coluna}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (colunaSobre !== coluna) setColunaSobre(coluna);
                  }}
                  onDragLeave={() => setColunaSobre((c) => (c === coluna ? null : c))}
                  onDrop={soltarNa(coluna)}
                  className={`flex w-72 shrink-0 flex-col rounded-2xl border p-2 transition-colors ${alvo ? 'border-[var(--brand)] bg-[var(--brand-soft)]/60' : 'border-[var(--border)] bg-[var(--bg-2)]/70'}`}
                >
                  <div className="flex items-center gap-1.5 px-1.5 pb-2 pt-1">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: COR_DA_COLUNA[coluna] }} />
                    <span className="truncate text-[13px] font-semibold text-[var(--text)]">{NOME_DO_ESTADO_DO_LEAD[coluna]}</span>
                    <span className="ml-auto shrink-0 text-[11px] font-semibold tabular-nums text-[var(--text-muted)]">{doColuna.length}</span>
                  </div>
                  {soma > 0 && <p className="px-1.5 pb-2 text-xs font-bold text-emerald-600">{moedaCompacta(soma)}</p>}
                  <div className="space-y-2">
                    {doColuna.length === 0 ? (
                      <div className="px-3 py-8 text-center text-xs text-[var(--text-disable)]">{alvo ? 'Solte aqui' : 'Vazio'}</div>
                    ) : (
                      mostrados.map((item) => (
                        <div
                          key={item.lead_id}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData('text/plain', item.lead_id);
                            e.dataTransfer.effectAllowed = 'move';
                            setArrastando(item.lead_id);
                          }}
                          onDragEnd={() => {
                            setArrastando(null);
                            setColunaSobre(null);
                          }}
                          onClick={() => setSelecionado(item)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setSelecionado(item);
                            }
                          }}
                          role="button"
                          tabIndex={0}
                          className={`cursor-grab active:cursor-grabbing ${arrastando === item.lead_id ? 'opacity-40' : ''}`}
                        >
                          <Cartao className="p-3 transition-shadow hover:shadow-[var(--sombra-flutuante)]">
                            <p className="truncate text-sm font-bold text-[var(--text)]">{item.cliente_nome}</p>
                            {item.valor !== null && item.valor > 0 && <p className="mt-0.5 text-sm font-bold text-emerald-600">{moeda(item.valor)}</p>}
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              <Etiqueta tom={item.origem === 'manual' ? 'rosa' : 'azul'}>{item.origem === 'manual' ? 'Manual' : 'WhatsApp'}</Etiqueta>
                              {item.mcmv_status && (
                                <Etiqueta tom="ambar">
                                  <Sparkles size={10} className="mr-0.5 inline" /> {NOME_DO_ESTADO_MCMV[item.mcmv_status]}
                                </Etiqueta>
                              )}
                            </div>
                            <div className="mt-2 flex items-center justify-between border-t border-[var(--border)] pt-1.5 text-[11px] text-[var(--text-muted)]">
                              <span className="truncate">
                                <NomeDoAtendente id={item.atendente_id} />
                              </span>
                              <span className="shrink-0">{tempoDesde(item.atualizado_em)}</span>
                            </div>
                          </Cartao>
                        </div>
                      ))
                    )}
                    {doColuna.length > LIMITE_POR_COLUNA && (
                      <Botao variante="fantasma" tamanho="sm" largo onClick={() => setExpandidas((e) => ({ ...e, [coluna]: !expandida }))}>
                        {expandida ? 'Ver menos' : `Ver todos (${doColuna.length})`}
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
        <ModalDoLead
          item={selecionado}
          onFechar={() => setSelecionado(null)}
          onSalvo={(atualizado) => {
            setItens((atual) => (atual ?? []).map((i) => (i.lead_id === atualizado.lead_id ? atualizado : i)));
            setSelecionado(null);
          }}
        />
      )}

      {novoLeadAberto && (
        <NovoLeadModal
          onFechar={() => setNovoLeadAberto(false)}
          onCriado={(conversaId) => {
            setNovoLeadAberto(false);
            ir(TELAS.central, conversaId);
          }}
        />
      )}
    </Pagina>
  );
}

/** Resolve o nome do atendente pelo id, direto do store — "Sem responsável" quando não há. */
function NomeDoAtendente({ id }: { id: number | null }) {
  const equipe = useDadosAtende((s) => s.equipe);
  if (!id) return <>Sem responsável</>;
  return <>{equipe.find((f) => f.id === id)?.nome ?? `#${id}`}</>;
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

function ModalDoLead({ item, onFechar, onSalvo }: { item: ItemDoFunilDeLeads; onFechar: () => void; onSalvo: (item: ItemDoFunilDeLeads) => void }) {
  const equipe = useDadosAtende((s) => s.equipe);
  const [estado, setEstado] = useState<EstadoDoLead>(item.estado);
  const [salvando, setSalvando] = useState(false);
  const [encaminhando, setEncaminhando] = useState(false);

  async function salvarEstado(novo: EstadoDoLead = estado) {
    setSalvando(true);
    try {
      await api.patch(`/conversas/${item.conversa_id}/lead`, { estado: novo });
      onSalvo({ ...item, estado: novo });
      toast.success('Etapa atualizada.');
    } catch (err) {
      toast.error(err instanceof ErroDaApi ? err.message : 'Não foi possível salvar.');
    } finally {
      setSalvando(false);
    }
  }

  async function encaminhar() {
    setEncaminhando(true);
    try {
      await api.post(`/conversas/${item.conversa_id}/mcmv/iniciar`);
      onSalvo({ ...item, mcmv_status: 'em_analise' });
      toast.success('Encaminhado para a Gestão de MCMV.');
    } catch (err) {
      toast.error(err instanceof ErroDaApi ? err.message : 'Não foi possível encaminhar.');
    } finally {
      setEncaminhando(false);
    }
  }

  const responsavel = item.atendente_id ? (equipe.find((f) => f.id === item.atendente_id)?.nome ?? `#${item.atendente_id}`) : 'Sem responsável';

  return (
    <Modal aberto onFechar={onFechar} titulo={item.cliente_nome} descricao={`+${item.telefone}`} largura="md">
      <div className="space-y-5">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Selecao rotulo="Etapa do atendimento" value={estado} onChange={(e) => setEstado(e.target.value as EstadoDoLead)}>
              {ESTADOS_DO_LEAD.map((e) => (
                <option key={e} value={e}>
                  {NOME_DO_ESTADO_DO_LEAD[e]}
                </option>
              ))}
            </Selecao>
            <div>
              <p className="mb-1.5 block text-xs font-semibold text-[var(--text)]">Etapa de crédito</p>
              <div className="flex h-[42px] items-center rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3.5">
                {item.mcmv_status ? (
                  <Etiqueta tom="ambar">
                    <Sparkles size={10} className="mr-0.5 inline" /> {NOME_DO_ESTADO_MCMV[item.mcmv_status]}
                  </Etiqueta>
                ) : (
                  <span className="text-sm text-[var(--text-muted)]">Não iniciado</span>
                )}
              </div>
            </div>
          </div>
          <Botao className="mt-3" tamanho="sm" carregando={salvando} disabled={estado === item.estado} onClick={() => salvarEstado()}>
            Salvar etapa
          </Botao>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Info rotulo="Responsável">{responsavel}</Info>
          <Info rotulo="Valor proposto">{item.valor !== null && item.valor > 0 ? moeda(item.valor) : '—'}</Info>
          <Info rotulo="Origem">{item.origem === 'manual' ? 'Manual' : 'WhatsApp'}</Info>
          <Info rotulo="Atualizado em">{new Date(item.atualizado_em).toLocaleDateString('pt-BR')}</Info>
        </div>

        <div className="border-t border-[var(--border)] pt-4">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Análise de crédito (MCMV)</p>
          {item.mcmv_status ? (
            <p className="text-sm text-[var(--text-muted)]">
              Em andamento: <strong className="text-[var(--text)]">{NOME_DO_ESTADO_MCMV[item.mcmv_status]}</strong> — documentos e nota ficam na tela Gestão de MCMV. O lead segue andando pelo funil normalmente.
            </p>
          ) : (
            <Botao tamanho="sm" variante="secundaria" icone={<FileCheck2 size={13} />} carregando={encaminhando} onClick={encaminhar}>
              Encaminhar para análise de MCMV
            </Botao>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-[var(--border)] pt-4">
          {item.estado !== 'perdido' ? (
            <Botao variante="perigo" tamanho="sm" icone={<XCircle size={13} />} carregando={salvando} onClick={() => salvarEstado('perdido')}>
              Marcar como perdida
            </Botao>
          ) : (
            <span />
          )}
          <Botao variante="fantasma" onClick={onFechar}>
            Fechar
          </Botao>
        </div>
      </div>
    </Modal>
  );
}

function NovoLeadModal({ onFechar, onCriado }: { onFechar: () => void; onCriado: (conversaId: string) => void }) {
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function criar(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    try {
      const r = await api.post<{ conversa_id: string; reaproveitado: boolean }>('/leads', { nome, telefone });
      toast.success(r.reaproveitado ? 'Esse telefone já é um contato — abrindo o lead existente.' : `${nome} cadastrado.`);
      onCriado(r.conversa_id);
    } catch (err) {
      toast.error(err instanceof ErroDaApi ? err.message : 'Não foi possível criar o lead.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal
      aberto
      onFechar={onFechar}
      titulo="Novo Lead"
      descricao="Para quem chegou por outro canal (Instagram, indicação…), sem ter escrito no WhatsApp ainda."
      largura="sm"
      rodape={
        <>
          <Botao variante="fantasma" onClick={onFechar}>
            Cancelar
          </Botao>
          <Botao type="submit" form="form-novo-lead" carregando={enviando}>
            Criar
          </Botao>
        </>
      }
    >
      <form id="form-novo-lead" onSubmit={criar} className="space-y-4">
        <Entrada rotulo="Nome" required value={nome} onChange={(e) => setNome(e.target.value)} maxLength={80} autoFocus />
        <Entrada rotulo="Telefone" ajuda="Com DDD — vira o WhatsApp deste contato, mesmo que ele nunca tenha escrito." required value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="(84) 99999-9999" />
      </form>
    </Modal>
  );
}
