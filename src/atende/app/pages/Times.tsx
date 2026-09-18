import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Pencil, Plus, Trash2, UsersRound } from 'lucide-react';
import { Button } from '@/shared/ui/Button';
import { Card } from '@/shared/ui/Card';
import { Badge } from '@/shared/ui/Badge';
import { EmptyState } from '@/shared/ui/EmptyState';
import { Modal } from '@/shared/ui/Modal';
import { Input, Textarea } from '@/shared/ui/Field';
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
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-[var(--text)]">Times</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">Os setores para onde a IA encaminha. Descreva bem o que cada um atende: é isso que ela lê.</p>
        </div>
        <Button icon={<Plus size={15} />} onClick={() => setEditando('novo')}>
          Novo time
        </Button>
      </div>

      {times.length === 0 ? (
        <Card className="p-8">
          <EmptyState icon={<UsersRound size={22} />} title="Nenhum time ainda" subtitle="Crie os setores da empresa. Sugestões:" />
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {SUGESTOES.map((s) => (
              <button key={s} type="button" onClick={() => setEditando({ id: '', nome: s, descricao_para_ia: null, palavras_chave: [], ordem: times.length, ativo: true, membros: [], supervisores: [] })} className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-bold text-[var(--text-muted)] hover:border-[var(--brand)] hover:text-[var(--text)]">
                + {s}
              </button>
            ))}
          </div>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {times.map((t) => (
            <Card key={t.id} className={`flex flex-col gap-3 p-4 ${t.ativo ? '' : 'opacity-60'}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-base font-extrabold text-[var(--text)]">{t.nome}</p>
                  <p className="mt-0.5 line-clamp-3 text-sm text-[var(--text-muted)]">{t.descricao_para_ia || <span className="italic">Sem descrição para a IA — ela não vai saber quando encaminhar para cá.</span>}</p>
                </div>
                {!t.ativo && <Badge variant="neutral">Inativo</Badge>}
              </div>
              {t.palavras_chave.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {t.palavras_chave.map((p) => (
                    <span key={p} className="rounded-full bg-[var(--brand)]/10 px-2 py-0.5 text-[11px] font-semibold text-[var(--brand)]">
                      {p}
                    </span>
                  ))}
                </div>
              )}
              <div className="flex items-center justify-between gap-2 border-t border-[var(--border)] pt-3 text-xs text-[var(--text-muted)]">
                <span>
                  {t.membros.length === 0 ? 'Ninguém neste time' : `${t.membros.length} ${t.membros.length === 1 ? 'pessoa' : 'pessoas'}: ${t.membros.slice(0, 3).map(nomeDe).join(', ')}${t.membros.length > 3 ? '…' : ''}`}
                </span>
                <span className="flex shrink-0 gap-1">
                  <button type="button" onClick={() => setEditando(t)} className="rounded-lg p-1.5 hover:bg-[var(--bg-2)] hover:text-[var(--text)]" aria-label="Editar">
                    <Pencil size={14} />
                  </button>
                  <button type="button" onClick={() => setExcluindo(t)} className="rounded-lg p-1.5 hover:bg-rose-500/10 hover:text-rose-600" aria-label="Excluir">
                    <Trash2 size={14} />
                  </button>
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}

      {editando && <ModalDoTime time={editando === 'novo' ? null : editando} onClose={() => setEditando(null)} />}

      <Modal
        open={Boolean(excluindo)}
        onClose={() => setExcluindo(null)}
        title={`Excluir ${excluindo?.nome}?`}
        subtitle="As pessoas continuam na equipe; só saem deste time. Se preferir, desative o time em vez de excluir."
        footer={
          <>
            <Button variant="ghost" onClick={() => setExcluindo(null)}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={excluir}>
              Excluir
            </Button>
          </>
        }
      >
        <span />
      </Modal>
    </div>
  );
}

function ModalDoTime({ time, onClose }: { time: Time | null; onClose: () => void }) {
  const aplicar = useDadosAtende((s) => s.aplicar);
  const [nome, setNome] = useState(time?.nome ?? '');
  const [descricao, setDescricao] = useState(time?.descricao_para_ia ?? '');
  const [palavras, setPalavras] = useState(time?.palavras_chave.join(', ') ?? '');
  const [ativo, setAtivo] = useState(time?.ativo ?? true);
  const [salvando, setSalvando] = useState(false);
  const novo = !time?.id;

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setSalvando(true);
    const corpo = { nome, descricao_para_ia: descricao, palavras_chave: palavras.split(',').map((p) => p.trim()).filter(Boolean), ativo };
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
      open
      onClose={onClose}
      title={novo ? 'Novo time' : `Editar ${time!.nome}`}
      subtitle="A descrição é o que a IA lê para decidir se uma conversa é deste setor."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="form-time" loading={salvando}>
            {novo ? 'Criar' : 'Salvar'}
          </Button>
        </>
      }
    >
      <form id="form-time" onSubmit={salvar} className="space-y-4">
        <Input label="Nome" required value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Vendas" maxLength={60} autoFocus />
        <Textarea label="O que este time atende (para a IA)" rows={4} value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex.: Quem quer comprar um imóvel, agendar visita, saber preço de venda, financiamento." maxLength={1000} />
        <Input label="Palavras-chave (separadas por vírgula)" value={palavras} onChange={(e) => setPalavras(e.target.value)} placeholder="comprar, financiamento, visita" />
        {!novo && (
          <label className="flex items-center gap-2 text-sm text-[var(--text)]">
            <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
            Time ativo (a IA só encaminha para times ativos)
          </label>
        )}
      </form>
    </Modal>
  );
}
