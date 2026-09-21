import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { MessageSquareText, Pencil, Plus, Trash2 } from 'lucide-react';
import { Botao } from '../ui/Botao';
import { Cartao } from '../ui/Cartao';
import { Etiqueta } from '../ui/Etiqueta';
import { Modal } from '../ui/Modal';
import { Entrada, AreaDeTexto } from '../ui/Campo';
import { Pagina } from '../ui/Pagina';
import { Vazio, Esqueleto } from '../ui/Estados';
import { api, ErroDaApi } from '../lib/api';

export interface ModeloDeMensagem {
  id: string;
  titulo: string;
  texto: string;
  ativo: boolean;
}

/**
 * Os modelos de mensagem: texto pronto (com o placeholder {nome}) que quem
 * atende insere de um clique no campo de resposta (ver o botão "Modelos"
 * no Composer). Criar e editar é de quem gerencia a empresa.
 */
export function Modelos() {
  const [modelos, setModelos] = useState<ModeloDeMensagem[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [editando, setEditando] = useState<ModeloDeMensagem | 'novo' | null>(null);
  const [excluindo, setExcluindo] = useState<ModeloDeMensagem | null>(null);

  useEffect(() => {
    api
      .get<{ modelos: ModeloDeMensagem[] }>('/modelos')
      .then((r) => setModelos(r.modelos))
      .catch((err) => toast.error(err instanceof ErroDaApi ? err.message : 'Erro ao carregar os modelos.'))
      .finally(() => setCarregando(false));
  }, []);

  async function excluir() {
    if (!excluindo) return;
    try {
      const r = await api.delete<{ modelos: ModeloDeMensagem[] }>(`/modelos/${excluindo.id}`);
      setModelos(r.modelos);
      toast.success(`${excluindo.titulo} desativado.`);
      setExcluindo(null);
    } catch (err) {
      toast.error(err instanceof ErroDaApi ? err.message : 'Não foi possível desativar.');
    }
  }

  return (
    <Pagina
      titulo="Modelos de mensagem"
      descricao="Textos prontos que a equipe usa de um clique ao responder. Use {nome} para o primeiro nome do cliente."
      largura="md"
      acoes={
        <Botao icone={<Plus size={15} />} onClick={() => setEditando('novo')}>
          Novo modelo
        </Botao>
      }
    >
      {carregando ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Esqueleto className="h-28" />
          <Esqueleto className="h-28" />
        </div>
      ) : modelos.length === 0 ? (
        <Cartao>
          <Vazio icone={<MessageSquareText size={22} />} titulo="Nenhum modelo ainda" texto="Cadastre as respostas que a equipe mais repete — quem atende insere de um clique." />
        </Cartao>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {modelos.map((m) => (
            <Cartao key={m.id} className={`flex flex-col gap-2 p-4 ${m.ativo ? '' : 'opacity-60'}`}>
              <div className="flex items-start justify-between gap-3">
                <p className="truncate text-[15px] font-semibold text-[var(--text)]">{m.titulo}</p>
                <span className="flex shrink-0 gap-0.5">
                  <Botao tamanho="sm" variante="fantasma" quadrado icone={<Pencil size={14} />} onClick={() => setEditando(m)} aria-label="Editar" />
                  <Botao tamanho="sm" variante="fantasma" quadrado icone={<Trash2 size={14} />} onClick={() => setExcluindo(m)} aria-label="Desativar" className="hover:!bg-rose-50 hover:!text-rose-600" />
                </span>
              </div>
              <p className="line-clamp-4 whitespace-pre-wrap text-sm text-[var(--text-muted)]">{m.texto}</p>
              {!m.ativo && <Etiqueta tom="cinza" className="mt-auto self-start">Inativo</Etiqueta>}
            </Cartao>
          ))}
        </div>
      )}

      {editando && <ModalDoModelo modelo={editando === 'novo' ? null : editando} onSalvo={setModelos} onClose={() => setEditando(null)} />}

      <Modal
        aberto={Boolean(excluindo)}
        onFechar={() => setExcluindo(null)}
        titulo={`Desativar ${excluindo?.titulo}?`}
        descricao="O modelo some da lista de quem atende; dá para reativar editando de novo."
        largura="sm"
        rodape={
          <>
            <Botao variante="fantasma" onClick={() => setExcluindo(null)}>
              Cancelar
            </Botao>
            <Botao variante="perigo" onClick={excluir}>
              Desativar
            </Botao>
          </>
        }
      >
        <span />
      </Modal>
    </Pagina>
  );
}

function ModalDoModelo({ modelo, onSalvo, onClose }: { modelo: ModeloDeMensagem | null; onSalvo: (modelos: ModeloDeMensagem[]) => void; onClose: () => void }) {
  const [titulo, setTitulo] = useState(modelo?.titulo ?? '');
  const [texto, setTexto] = useState(modelo?.texto ?? '');
  const [ativo, setAtivo] = useState(modelo?.ativo ?? true);
  const [salvando, setSalvando] = useState(false);
  const novo = !modelo?.id;

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setSalvando(true);
    const corpo = { titulo, texto, ativo };
    try {
      const r = novo ? await api.post<{ modelos: ModeloDeMensagem[] }>('/modelos', corpo) : await api.put<{ modelos: ModeloDeMensagem[] }>(`/modelos/${modelo!.id}`, corpo);
      onSalvo(r.modelos);
      toast.success(novo ? `${titulo} criado.` : 'Modelo salvo.');
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
      titulo={novo ? 'Novo modelo' : `Editar ${modelo!.titulo}`}
      rodape={
        <>
          <Botao variante="fantasma" onClick={onClose}>
            Cancelar
          </Botao>
          <Botao type="submit" form="form-modelo" carregando={salvando}>
            {novo ? 'Criar' : 'Salvar'}
          </Botao>
        </>
      }
    >
      <form id="form-modelo" onSubmit={salvar} className="space-y-4">
        <Entrada rotulo="Título" ajuda="É por ele que quem atende encontra o modelo." required value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Horário de funcionamento" maxLength={60} autoFocus />
        <AreaDeTexto rotulo="Texto" ajuda="Use {nome} para o primeiro nome do cliente." required rows={5} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Oi {nome}! Funcionamos de segunda a sexta, das 9h às 18h." maxLength={4000} />
        {!novo && (
          <label className="inline-flex cursor-pointer items-center gap-2.5 text-sm text-[var(--text)]">
            <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} className="h-4 w-4 rounded border-[var(--border-strong)] accent-[var(--brand)]" />
            Modelo ativo (aparece para quem atende)
          </label>
        )}
      </form>
    </Modal>
  );
}
