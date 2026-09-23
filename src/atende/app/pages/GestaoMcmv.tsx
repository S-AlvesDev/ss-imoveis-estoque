import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { FileCheck2, Phone } from 'lucide-react';
import { Botao } from '../ui/Botao';
import { Cartao } from '../ui/Cartao';
import { Etiqueta } from '../ui/Etiqueta';
import { Modal } from '../ui/Modal';
import { AreaDeTexto } from '../ui/Campo';
import { Pagina } from '../ui/Pagina';
import { Vazio, Esqueleto } from '../ui/Estados';
import { DocumentosDoCliente } from '../ui/DocumentosDoCliente';
import { api, ErroDaApi } from '../lib/api';
import { ESTADOS_MCMV, NOME_DO_ESTADO_MCMV, type EstadoMcmv, type ItemDoPipelineMcmv } from '../../shared/tipos';

const TOM_DA_ETAPA: Record<EstadoMcmv, 'azul' | 'ambar' | 'verde' | 'vermelho'> = {
  em_analise: 'azul',
  aprovado_condicionado: 'ambar',
  aprovado: 'verde',
  reprovado: 'vermelho',
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
  const [selecionado, setSelecionado] = useState<ItemDoPipelineMcmv | null>(null);

  function carregar() {
    api
      .get<{ itens: ItemDoPipelineMcmv[] }>('/mcmv')
      .then((r) => setItens(r.itens))
      .catch((err) => toast.error(err instanceof ErroDaApi ? err.message : 'Erro ao carregar o pipeline.'));
  }

  useEffect(() => {
    carregar();
  }, []);

  return (
    <Pagina titulo="Gestão de MCMV" descricao="Quem está em análise de financiamento — etapa, documentos e notas, sem abrir a conversa do WhatsApp." largura="xl">
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
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                  {NOME_DO_ESTADO_MCMV[etapa]} <span className="rounded-full bg-[var(--bg-2)] px-1.5 text-[10px]">{doEtapa.length}</span>
                </p>
                <div className="space-y-2">
                  {doEtapa.map((item) => (
                    <button key={item.lead_id} type="button" onClick={() => setSelecionado(item)} className="block w-full text-left">
                      <Cartao className="p-3 transition-shadow hover:shadow-[var(--sombra-flutuante)]">
                        <p className="truncate text-sm font-semibold text-[var(--text)]">{item.cliente_nome}</p>
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-[var(--text-muted)]">
                          <Phone size={11} /> +{item.telefone}
                        </p>
                        <p className="mt-1.5 text-[11px] text-[var(--text-muted)]">Atualizado {tempoDesde(item.mcmv_atualizado_em)}</p>
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
            setSelecionado(null);
          }}
        />
      )}
    </Pagina>
  );
}

function ModalDoItem({ item, onFechar, onSalvo }: { item: ItemDoPipelineMcmv; onFechar: () => void; onSalvo: (item: ItemDoPipelineMcmv) => void }) {
  const [status, setStatus] = useState<EstadoMcmv>(item.mcmv_status);
  const [nota, setNota] = useState('');
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    setSalvando(true);
    try {
      const r = await api.put<{ item: ItemDoPipelineMcmv }>(`/mcmv/${item.lead_id}`, { status, nota: nota || undefined });
      toast.success('Etapa atualizada.');
      onSalvo(r.item);
    } catch (err) {
      toast.error(err instanceof ErroDaApi ? err.message : 'Não foi possível salvar.');
    } finally {
      setSalvando(false);
    }
  }

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
