import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Pencil, Plus, Trash2, UsersRound } from 'lucide-react';
import { Botao } from '../ui/Botao';
import { Cartao } from '../ui/Cartao';
import { Etiqueta } from '../ui/Etiqueta';
import { Avatar, Avatares } from '../ui/Avatar';
import { Modal } from '../ui/Modal';
import { Entrada, AreaDeTexto, Marcar } from '../ui/Campo';
import { Pagina } from '../ui/Pagina';
import { Vazio } from '../ui/Estados';
import { SeloIa } from '../ui/Ia';
import { api, ErroDaApi } from '../lib/api';
import { useDadosAtende } from '../store/dados';
import type { Time } from '../../shared/tipos';

/**
 * Os times (setores) da empresa: Vendas, Aluguel, Financeiro… Cada um com
 * a descrição que a IA usa para decidir o encaminhamento. Quem está em cada
 * time é definido na Equipe, pessoa a pessoa.
 */
const SUGESTOES = ['Vendas', 'Aluguel', 'Financeiro', 'Suporte', 'Manutenção', 'Administrativo'];

export function Times() {
  const times = useDadosAtende((s) => s.times);
  const equipe = useDadosAtende((s) => s.equipe);
  const aplicar = useDadosAtende((s) => s.aplicar);
  const [editando, setEditando] = useState<Time | 'novo' | null>(null);
  const [excluindo, setExcluindo] = useState<Time | null>(null);

  const nomeDe = (id: number) => equipe.find((f) => f.id === id)?.nome ?? '—';

  async function excluir() {
    if (!excluindo) return;
    try {
      const r = await api.delete<{ times: Time[] }>(`/times/${excluindo.id}`);
      aplicar({ times: r.times });
      toast.success(`Time ${excluindo.nome} excluído.`);
      setExcluindo(null);
    } catch (err) {
      toast.error(err instanceof ErroDaApi ? err.message : 'Não foi possível excluir.');
    }
  }

  return (
    <Pagina titulo="Times" descricao="Os setores para onde a IA encaminha. Descreva bem o que cada um atende: é isso que ela lê." largura="md" acoes={<Botao icone={<Plus size={15} />} onClick={() => setEditando('novo')}>Novo time</Botao>}>
      {times.length === 0 ? (
        <Cartao>
          <Vazio
            icone={<UsersRound size={22} />}
            titulo="Nenhum time ainda"
            texto="Crie os setores da empresa. A IA encaminha cada conversa para o time certo pela descrição. Sugestões:"
            acao={
              <div className="flex flex-wrap justify-center gap-2">
                {SUGESTOES.map((s) => (
                  <button key={s} type="button" onClick={() => setEditando({ id: '', nome: s, descricao_para_ia: null, palavras_chave: [], ordem: times.length, ativo: true, anonimo: false, membros: [], supervisores: [] })} className="h-8 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 text-xs font-semibold text-[var(--text-muted)] transition-colors hover:border-[var(--brand)]/50 hover:text-[var(--brand)]">
                    + {s}
                  </button>
                ))}
              </div>
            }
          />
        </Cartao>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {times.map((t) => (
            <Cartao key={t.id} className={`flex flex-col gap-3 p-4 sm:p-5 ${t.ativo ? '' : 'opacity-60'}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <Avatar nome={t.nome} tamanho={40} quadrado />
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-semibold text-[var(--text)]">{t.nome}</p>
                    <p className="mt-0.5 line-clamp-3 text-sm leading-5 text-[var(--text-muted)]">{t.descricao_para_ia || <span className="italic">Sem descrição para a IA — ela não vai saber quando encaminhar para cá.</span>}</p>
                  </div>
                </div>
                <span className="flex shrink-0 gap-0.5">
                  <Botao tamanho="sm" variante="fantasma" quadrado icone={<Pencil size={14} />} onClick={() => setEditando(t)} aria-label="Editar" />
                  <Botao tamanho="sm" variante="fantasma" quadrado icone={<Trash2 size={14} />} onClick={() => setExcluindo(t)} aria-label="Excluir" className="hover:!bg-rose-50 hover:!text-rose-600" />
                </span>
              </div>
              {t.palavras_chave.length > 0 && (
                <div className="flex flex-wrap items-center gap-1">
                  <SeloIa>palavras-chave</SeloIa>
                  {t.palavras_chave.map((p) => (
                    <span key={p} className="rounded-full bg-[var(--bg-2)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-muted)]">
                      {p}
                    </span>
                  ))}
                </div>
              )}
              <div className="mt-auto flex items-center justify-between gap-2 border-t border-[var(--border)] pt-3 text-xs text-[var(--text-muted)]">
                {t.membros.length === 0 ? (
                  <span>Ninguém neste time</span>
                ) : (
                  <span className="flex min-w-0 items-center gap-2">
                    <Avatares nomes={t.membros.map(nomeDe)} tamanho={22} maximo={4} />
                    <span className="truncate">
                      {t.membros.length} {t.membros.length === 1 ? 'pessoa' : 'pessoas'}
                    </span>
                  </span>
                )}
                {t.anonimo && <Etiqueta tom="roxo">Anônimo</Etiqueta>}
                {!t.ativo ? <Etiqueta tom="cinza">Inativo</Etiqueta> : t.supervisores.length > 0 ? <span className="shrink-0">{t.supervisores.length} {t.supervisores.length === 1 ? 'supervisor' : 'supervisores'}</span> : null}
              </div>
            </Cartao>
          ))}
        </div>
      )}

      {editando && <ModalDoTime time={editando === 'novo' ? null : editando} onClose={() => setEditando(null)} />}

      <Modal
        aberto={Boolean(excluindo)}
        onFechar={() => setExcluindo(null)}
        titulo={`Excluir ${excluindo?.nome}?`}
        descricao="As pessoas continuam na equipe; só saem deste time. Se preferir, desative o time em vez de excluir."
        largura="sm"
        rodape={
          <>
            <Botao variante="fantasma" onClick={() => setExcluindo(null)}>
              Cancelar
            </Botao>
            <Botao variante="perigo" onClick={excluir}>
              Excluir
            </Botao>
          </>
        }
      >
        <span />
      </Modal>
    </Pagina>
  );
}

function ModalDoTime({ time, onClose }: { time: Time | null; onClose: () => void }) {
  const aplicar = useDadosAtende((s) => s.aplicar);
  const [nome, setNome] = useState(time?.nome ?? '');
  const [descricao, setDescricao] = useState(time?.descricao_para_ia ?? '');
  const [palavras, setPalavras] = useState(time?.palavras_chave.join(', ') ?? '');
  const [ativo, setAtivo] = useState(time?.ativo ?? true);
  const [anonimo, setAnonimo] = useState(time?.anonimo ?? false);
  const [salvando, setSalvando] = useState(false);
  const novo = !time?.id;

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setSalvando(true);
    const corpo = { nome, descricao_para_ia: descricao, palavras_chave: palavras.split(',').map((p) => p.trim()).filter(Boolean), ativo, anonimo };
    try {
      const r = novo ? await api.post<{ times: Time[] }>('/times', corpo) : await api.patch<{ times: Time[] }>(`/times/${time!.id}`, corpo);
      aplicar({ times: r.times });
      toast.success(novo ? `Time ${nome} criado.` : 'Time salvo.');
      onClose();
    } catch (err) {
      toast.error(err instanceof ErroDaApi ? err.message : 'Não foi possível salvar.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      aberto
      onFechar={onClose}
      titulo={novo ? 'Novo time' : `Editar ${time!.nome}`}
      descricao="A descrição é o que a IA lê para decidir se uma conversa é deste setor."
      rodape={
        <>
          <Botao variante="fantasma" onClick={onClose}>
            Cancelar
          </Botao>
          <Botao type="submit" form="form-time" carregando={salvando}>
            {novo ? 'Criar' : 'Salvar'}
          </Botao>
        </>
      }
    >
      <form id="form-time" onSubmit={salvar} className="space-y-4">
        <Entrada rotulo="Nome" required value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Vendas" maxLength={60} autoFocus />
        <AreaDeTexto rotulo={<span className="inline-flex items-center gap-1.5">O que este time atende <SeloIa>a IA lê isto</SeloIa></span>} rows={4} value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex.: Quem quer comprar um imóvel, agendar visita, saber preço de venda, financiamento." maxLength={1000} />
        <Entrada rotulo="Palavras-chave" ajuda="Separadas por vírgula. Reforçam a decisão da IA (e valem sozinhas se a IA estiver desligada)." value={palavras} onChange={(e) => setPalavras(e.target.value)} placeholder="comprar, financiamento, visita" />
        {!novo && (
          <Marcar marcado={ativo} onChange={setAtivo}>
            Time ativo (a IA só encaminha para times ativos)
          </Marcar>
        )}
        <div>
          <Marcar marcado={anonimo} onChange={setAnonimo}>
            Atendimento anônimo
          </Marcar>
          <p className="mt-1.5 text-xs text-[var(--text-muted)]">
            O cliente recebe só a mensagem, sem o nome de quem escreveu. Dentro do Atende Aí a equipe continua vendo o autor.
          </p>
        </div>
      </form>
    </Modal>
  );
}
