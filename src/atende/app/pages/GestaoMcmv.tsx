import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { FileCheck2, Phone, RefreshCw } from 'lucide-react';
import { Botao } from '../ui/Botao';
import { Cartao } from '../ui/Cartao';
import { Etiqueta } from '../ui/Etiqueta';
import { Modal } from '../ui/Modal';
import { AreaDeTexto } from '../ui/Campo';
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

function tempoDesde(iso: string): string {
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000));
  if (dias <= 0) return 'hoje';
  if (dias === 1) return 'há 1 dia';
  return `há ${dias} dias`;
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

  return (
    <Pagina
      titulo="Gestão de MCMV"
      descricao="Quem está em análise de financiamento — etapa, documentos e notas, sem abrir a conversa do WhatsApp."
      largura="xl"
      acoes={
        <Botao tamanho="sm" variante="secundaria" icone={<RefreshCw size={14} />} carregando={atualizando} onClick={() => carregar(true)}>
          Atualizar
        </Botao>
      }
    >
      {itens === null ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Esqueleto className="h-40" />
          <Esqueleto className="h-40" />
        </div>
      ) : itens.length === 0 ? (
        <Cartao>
          <Vazio icone={<FileCheck2 size={22} />} titulo="Ninguém no pipeline de MCMV ainda" texto="Quem atende encaminha um lead para cá pela conversa, no painel da triagem." />
        </Cartao>
      ) : (
        <div className="grid gap-4 lg:grid-cols-4">
          {ESTADOS_MCMV.map((etapa) => {
            const doEtapa = itens.filter((i) => i.mcmv_status === etapa);
            return (
              <div key={etapa} className="space-y-2">
                <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: COR_DA_ETAPA[etapa] }} />
                  <span className="truncate">{NOME_DO_ESTADO_MCMV[etapa]}</span>
                  <span className="ml-auto shrink-0 rounded-full bg-[var(--bg-2)] px-2 py-0.5 text-[10px] font-bold text-[var(--text)]">{doEtapa.length}</span>
                </p>
                <div className="space-y-2">
                  {doEtapa.map((item) => (
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
                  ))}
                </div>
              </div>
            );
          })}
        </div>
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
        <div>
          <p className="mb-1.5 text-xs font-semibold text-[var(--text)]">Etapa</p>
          <div className="flex flex-wrap gap-1.5">
            {ESTADOS_MCMV.map((e) => (
              <button key={e} type="button" onClick={() => setStatus(e)} className={status === e ? '' : 'opacity-60 transition-opacity hover:opacity-100'}>
                <Etiqueta tom={TOM_DA_ETAPA[e]} tamanho="md">
                  {NOME_DO_ESTADO_MCMV[e]}
                </Etiqueta>
              </button>
            ))}
          </div>
        </div>

        <AreaDeTexto rotulo="Nota" ajuda="Registrada no histórico junto com a mudança de etapa." rows={3} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="O que foi feito, o que falta…" maxLength={1000} />

        <div>
          <p className="mb-1.5 text-xs font-semibold text-[var(--text)]">Documentos</p>
          <DocumentosDoCliente clienteId={item.cliente_id} />
        </div>

        <div className="border-t border-[var(--border)] pt-4">
          <p className="mb-1.5 text-xs font-semibold text-[var(--text)]">Histórico</p>
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
