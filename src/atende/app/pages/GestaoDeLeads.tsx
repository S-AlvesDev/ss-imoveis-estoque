import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { FileCheck2, Kanban, MessageCircle, Plus, RefreshCw, Sparkles } from 'lucide-react';
import { Botao } from '../ui/Botao';
import { Cartao } from '../ui/Cartao';
import { Etiqueta, type TomDaEtiqueta } from '../ui/Etiqueta';
import { Modal } from '../ui/Modal';
import { Entrada } from '../ui/Campo';
import { Pagina } from '../ui/Pagina';
import { Vazio, Esqueleto } from '../ui/Estados';
import { api, ErroDaApi } from '../lib/api';
import { useDadosAtende } from '../store/dados';
import { TELAS, useRotaAtende } from '../router';
import { ESTADOS_DO_LEAD, NOME_DO_ESTADO_DO_LEAD, NOME_DO_ESTADO_MCMV, type EstadoDoLead, type ItemDoFunilDeLeads } from '../../shared/tipos';

/** As colunas do quadro: o funil geral, mais "Em Análise de Crédito" — que é
 * um recorte por `mcmv_status`, não um estado a mais no funil. Um lead com
 * mcmv_status preenchido aparece aqui, não na coluna do `estado` por baixo. */
type Coluna = EstadoDoLead | 'credito';
const COLUNAS: Coluna[] = ['novo', 'em_atendimento', 'em_negociacao', 'aguardando_cliente', 'credito', 'convertido', 'perdido'];
const NOME_DA_COLUNA: Record<Coluna, string> = { ...NOME_DO_ESTADO_DO_LEAD, credito: 'Em Análise de Crédito' };
/** A bolinha de cada coluna — a mesma linguagem de cor das etiquetas do resto do produto. */
const COR_DA_COLUNA: Record<Coluna, string> = {
  novo: '#3b82f6',
  em_atendimento: '#7c3aed',
  em_negociacao: '#d97706',
  aguardando_cliente: '#94a3b8',
  credito: '#f59e0b',
  convertido: '#16a34a',
  perdido: '#e11d48',
};

function colunaDoItem(item: ItemDoFunilDeLeads): Coluna {
  return item.mcmv_status ? 'credito' : item.estado;
}

function tempoDesde(iso: string): string {
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000));
  if (dias <= 0) return 'hoje';
  if (dias === 1) return 'há 1 dia';
  return `há ${dias} dias`;
}

/**
 * O quadro geral do funil de vendas — todas as conversas da empresa, para
 * supervisor e admin. Diferente da Gestão de MCMV (que é o recorte que o
 * papel `analista` trabalha, sem abrir conversa): aqui dá para ver e mudar
 * a etapa geral, e encaminhar um lead para a análise de crédito.
 */
export function GestaoDeLeads() {
  const equipe = useDadosAtende((s) => s.equipe);
  const ir = useRotaAtende((s) => s.ir);
  const [itens, setItens] = useState<ItemDoFunilDeLeads[] | null>(null);
  const [atualizando, setAtualizando] = useState(false);
  const [selecionado, setSelecionado] = useState<ItemDoFunilDeLeads | null>(null);
  const [novoLeadAberto, setNovoLeadAberto] = useState(false);

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

  const nomeDoAtendente = (id: number | null) => (id ? (equipe.find((f) => f.id === id)?.nome ?? `#${id}`) : 'Sem responsável');
  const doWhatsapp = itens?.filter((i) => i.origem === 'whatsapp').length ?? 0;
  const manuais = itens?.filter((i) => i.origem === 'manual').length ?? 0;

  return (
    <Pagina
      titulo="Gestão de Leads"
      descricao="O funil de vendas inteiro, de todas as conversas."
      largura="xl"
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
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Esqueleto className="h-40" />
          <Esqueleto className="h-40" />
        </div>
      ) : itens.length === 0 ? (
        <Cartao>
          <Vazio icone={<Kanban size={22} />} titulo="Nenhum lead ainda" texto="Os leads aparecem aqui assim que uma conversa nova chega, ou você cadastra um com o botão Novo Lead." />
        </Cartao>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
            <span className="font-semibold text-[var(--text-muted)]">Origens:</span>
            <Etiqueta tom="azul" ponto>
              <MessageCircle size={11} className="mr-0.5 inline" /> WhatsApp: {doWhatsapp}
            </Etiqueta>
            <Etiqueta tom="rosa" ponto>
              Manual: {manuais}
            </Etiqueta>
          </div>
          <div className="grid gap-4 lg:grid-cols-7">
            {COLUNAS.map((coluna) => {
              const doColuna = itens.filter((i) => colunaDoItem(i) === coluna);
              return (
                <div key={coluna} className="space-y-2">
                  <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: COR_DA_COLUNA[coluna] }} />
                    <span className="truncate">{NOME_DA_COLUNA[coluna]}</span>
                    <span className="ml-auto shrink-0 rounded-full bg-[var(--bg-2)] px-2 py-0.5 text-[10px] font-bold text-[var(--text)]">{doColuna.length}</span>
                  </p>
                  <div className="space-y-2">
                    {doColuna.map((item) => (
                      <button key={item.lead_id} type="button" onClick={() => setSelecionado(item)} className="block w-full text-left">
                        <Cartao className="p-3 transition-shadow hover:shadow-[var(--sombra-flutuante)]">
                          <p className="truncate text-sm font-bold text-[var(--text)]">{item.cliente_nome}</p>
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            <Etiqueta tom={item.origem === 'manual' ? 'rosa' : 'azul'}>{item.origem === 'manual' ? 'Manual' : 'WhatsApp'}</Etiqueta>
                            {item.mcmv_status && (
                              <Etiqueta tom="ambar">
                                <Sparkles size={10} className="mr-0.5 inline" /> {NOME_DO_ESTADO_MCMV[item.mcmv_status]}
                              </Etiqueta>
                            )}
                            {item.valor !== null && <Etiqueta tom="verde">{item.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</Etiqueta>}
                          </div>
                          <div className="mt-2 flex items-center justify-between border-t border-[var(--border)] pt-1.5 text-[11px] text-[var(--text-muted)]">
                            <span className="truncate">{nomeDoAtendente(item.atendente_id)}</span>
                            <span className="shrink-0">{tempoDesde(item.atualizado_em)}</span>
                          </div>
                        </Cartao>
                      </button>
                    ))}
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

function ModalDoLead({ item, onFechar, onSalvo }: { item: ItemDoFunilDeLeads; onFechar: () => void; onSalvo: (item: ItemDoFunilDeLeads) => void }) {
  const [estado, setEstado] = useState<EstadoDoLead>(item.estado);
  const [salvando, setSalvando] = useState(false);
  const [encaminhando, setEncaminhando] = useState(false);

  async function salvarEstado() {
    setSalvando(true);
    try {
      await api.patch(`/conversas/${item.conversa_id}/lead`, { estado });
      onSalvo({ ...item, estado });
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

  return (
    <Modal aberto onFechar={onFechar} titulo={item.cliente_nome} descricao={`+${item.telefone}`} largura="md">
      <div className="space-y-5">
        <div>
          <p className="mb-1.5 text-xs font-semibold text-[var(--text)]">Etapa</p>
          <div className="flex flex-wrap gap-1.5">
            {ESTADOS_DO_LEAD.map((e) => (
              <button key={e} type="button" onClick={() => setEstado(e)} className={estado === e ? '' : 'opacity-60 transition-opacity hover:opacity-100'}>
                <Etiqueta tom={estado === e ? 'azul' : 'cinza'} tamanho="md">
                  {NOME_DO_ESTADO_DO_LEAD[e]}
                </Etiqueta>
              </button>
            ))}
          </div>
          <Botao className="mt-3" tamanho="sm" carregando={salvando} disabled={estado === item.estado} onClick={salvarEstado}>
            Salvar etapa
          </Botao>
        </div>

        <div className="border-t border-[var(--border)] pt-4">
          <p className="mb-1.5 text-xs font-semibold text-[var(--text)]">Análise de crédito (MCMV)</p>
          {item.mcmv_status ? (
            <p className="text-sm text-[var(--text-muted)]">
              Em andamento: <strong className="text-[var(--text)]">{NOME_DO_ESTADO_MCMV[item.mcmv_status]}</strong> — documentos e nota ficam na tela Gestão de MCMV.
            </p>
          ) : (
            <Botao tamanho="sm" variante="secundaria" icone={<FileCheck2 size={13} />} carregando={encaminhando} onClick={encaminhar}>
              Encaminhar para análise de MCMV
            </Botao>
          )}
        </div>

        <div className="flex justify-end border-t border-[var(--border)] pt-4">
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
