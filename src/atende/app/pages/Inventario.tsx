import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Package, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { Botao } from '../ui/Botao';
import { Cartao } from '../ui/Cartao';
import { Etiqueta } from '../ui/Etiqueta';
import { Modal } from '../ui/Modal';
import { Entrada, AreaDeTexto } from '../ui/Campo';
import { Pagina } from '../ui/Pagina';
import { Vazio, Esqueleto } from '../ui/Estados';
import { api, ErroDaApi } from '../lib/api';
import { useSessaoAtende } from '../store/sessao';
import { pode } from '../../shared/papeis';

interface ItemDoInventario {
  id: string;
  nome: string;
  categoria: string | null;
  quantidade: number;
  preco: number | null;
  descricao: string | null;
  ativo: boolean;
}

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * O catálogo de itens da empresa — casas para alugar, remédios de uma
 * farmácia, o que for. Quem atende consulta na hora; o Jatobá também lê
 * daqui para responder "quantos/quantas X têm disponíveis?".
 */
export function Inventario() {
  const sessao = useSessaoAtende((s) => s.sessao)!;
  const podeGerir = pode(sessao.papel, 'inventario.gerir');
  const [itens, setItens] = useState<ItemDoInventario[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState('');
  const [editando, setEditando] = useState<ItemDoInventario | 'novo' | null>(null);
  const [excluindo, setExcluindo] = useState<ItemDoInventario | null>(null);

  useEffect(() => {
    api
      .get<{ itens: ItemDoInventario[] }>('/inventario')
      .then((r) => setItens(r.itens))
      .catch((err) => toast.error(err instanceof ErroDaApi ? err.message : 'Erro ao carregar o inventário.'))
      .finally(() => setCarregando(false));
  }, []);

  const filtrados = itens.filter((i) => {
    const alvo = busca.trim().toLowerCase();
    if (!alvo) return true;
    return i.nome.toLowerCase().includes(alvo) || (i.categoria ?? '').toLowerCase().includes(alvo);
  });

  async function excluir() {
    if (!excluindo) return;
    try {
      const r = await api.delete<{ itens: ItemDoInventario[] }>(`/inventario/${excluindo.id}`);
      setItens(r.itens);
      toast.success(`${excluindo.nome} desativado.`);
      setExcluindo(null);
    } catch (err) {
      toast.error(err instanceof ErroDaApi ? err.message : 'Não foi possível desativar.');
    }
  }

  return (
    <Pagina
      titulo="Inventário"
      descricao="O que a empresa vende, aluga ou tem em estoque. O Jatobá consulta daqui para responder na hora."
      largura="md"
      acoes={
        podeGerir && (
          <Botao icone={<Plus size={15} />} onClick={() => setEditando('novo')}>
            Novo item
          </Botao>
        )
      }
    >
      <Entrada icone={<Search size={15} />} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome ou categoria…" className="mb-4" />

      {carregando ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Esqueleto className="h-24" />
          <Esqueleto className="h-24" />
        </div>
      ) : itens.length === 0 ? (
        <Cartao>
          <Vazio
            icone={<Package size={22} />}
            titulo="Nenhum item ainda"
            texto={podeGerir ? 'Cadastre o que a empresa vende ou aluga — o Jatobá passa a responder com esse dado.' : 'Ainda não há itens cadastrados.'}
          />
        </Cartao>
      ) : filtrados.length === 0 ? (
        <Cartao>
          <Vazio icone={<Search size={22} />} titulo="Nada encontrado" texto="Tente outro termo de busca." compacto />
        </Cartao>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {filtrados.map((i) => (
            <Cartao key={i.id} className={`flex flex-col gap-2 p-4 ${i.ativo ? '' : 'opacity-60'}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-semibold text-[var(--text)]">{i.nome}</p>
                  {i.categoria && <p className="mt-0.5 text-xs text-[var(--text-muted)]">{i.categoria}</p>}
                </div>
                {podeGerir && (
                  <span className="flex shrink-0 gap-0.5">
                    <Botao tamanho="sm" variante="fantasma" quadrado icone={<Pencil size={14} />} onClick={() => setEditando(i)} aria-label="Editar" />
                    <Botao tamanho="sm" variante="fantasma" quadrado icone={<Trash2 size={14} />} onClick={() => setExcluindo(i)} aria-label="Desativar" className="hover:!bg-rose-50 hover:!text-rose-600" />
                  </span>
                )}
              </div>
              {i.descricao && <p className="line-clamp-2 text-sm text-[var(--text-muted)]">{i.descricao}</p>}
              <div className="mt-auto flex items-center justify-between gap-2 border-t border-[var(--border)] pt-2.5 text-sm">
                <Etiqueta tom={i.quantidade > 0 ? 'verde' : 'cinza'}>{i.quantidade > 0 ? `${i.quantidade} disponível${i.quantidade > 1 ? 'eis' : ''}` : 'Indisponível'}</Etiqueta>
                {i.preco !== null && <span className="font-semibold text-[var(--text)]">{moeda.format(i.preco)}</span>}
                {!i.ativo && <Etiqueta tom="cinza">Inativo</Etiqueta>}
              </div>
            </Cartao>
          ))}
        </div>
      )}

      {editando && podeGerir && <ModalDoItem item={editando === 'novo' ? null : editando} onSalvo={setItens} onClose={() => setEditando(null)} />}

      <Modal
        aberto={Boolean(excluindo)}
        onFechar={() => setExcluindo(null)}
        titulo={`Desativar ${excluindo?.nome}?`}
        descricao="O item sai da lista e das respostas do Jatobá; dá para reativar editando de novo."
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

function ModalDoItem({ item, onSalvo, onClose }: { item: ItemDoInventario | null; onSalvo: (itens: ItemDoInventario[]) => void; onClose: () => void }) {
  const [nome, setNome] = useState(item?.nome ?? '');
  const [categoria, setCategoria] = useState(item?.categoria ?? '');
  const [quantidade, setQuantidade] = useState(String(item?.quantidade ?? 0));
  const [preco, setPreco] = useState(item?.preco !== null && item?.preco !== undefined ? String(item.preco) : '');
  const [descricao, setDescricao] = useState(item?.descricao ?? '');
  const [ativo, setAtivo] = useState(item?.ativo ?? true);
  const [salvando, setSalvando] = useState(false);
  const novo = !item?.id;

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setSalvando(true);
    const corpo = { nome, categoria: categoria || null, quantidade: Number(quantidade) || 0, preco: preco === '' ? null : Number(preco), descricao: descricao || null, ativo };
    try {
      const r = novo ? await api.post<{ itens: ItemDoInventario[] }>('/inventario', corpo) : await api.put<{ itens: ItemDoInventario[] }>(`/inventario/${item!.id}`, corpo);
      onSalvo(r.itens);
      toast.success(novo ? `${nome} cadastrado.` : 'Item salvo.');
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
      titulo={novo ? 'Novo item' : `Editar ${item!.nome}`}
      rodape={
        <>
          <Botao variante="fantasma" onClick={onClose}>
            Cancelar
          </Botao>
          <Botao type="submit" form="form-inventario" carregando={salvando}>
            {novo ? 'Criar' : 'Salvar'}
          </Botao>
        </>
      }
    >
      <form id="form-inventario" onSubmit={salvar} className="space-y-4">
        <Entrada rotulo="Nome" required value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Casa 3 quartos, Centro" maxLength={120} autoFocus />
        <div className="grid grid-cols-2 gap-3">
          <Entrada rotulo="Categoria" value={categoria} onChange={(e) => setCategoria(e.target.value)} placeholder="aluguel, venda…" maxLength={60} />
          <Entrada rotulo="Quantidade disponível" type="number" min="0" step="1" value={quantidade} onChange={(e) => setQuantidade(e.target.value)} />
        </div>
        <Entrada rotulo="Preço" ajuda="Opcional." type="number" min="0" step="0.01" value={preco} onChange={(e) => setPreco(e.target.value)} placeholder="0,00" />
        <AreaDeTexto rotulo="Descrição" ajuda="Opcional — aparece só para quem atende, não vai para o Jatobá." rows={3} value={descricao} onChange={(e) => setDescricao(e.target.value)} maxLength={500} />
        {!novo && (
          <label className="inline-flex cursor-pointer items-center gap-2.5 text-sm text-[var(--text)]">
            <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} className="h-4 w-4 rounded border-[var(--border-strong)] accent-[var(--brand)]" />
            Item ativo (aparece na lista e para o Jatobá)
          </label>
        )}
      </form>
    </Modal>
  );
}
