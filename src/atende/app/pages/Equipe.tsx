import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Pencil, Plus, UserX, Users } from 'lucide-react';
import { Button } from '@/shared/ui/Button';
import { Card } from '@/shared/ui/Card';
import { Badge } from '@/shared/ui/Badge';
import { EmptyState } from '@/shared/ui/EmptyState';
import { Modal } from '@/shared/ui/Modal';
import { Input, Select } from '@/shared/ui/Field';
import { api, ErroDaApi } from '../lib/api';
import { useDadosAtende } from '../store/dados';
import { useSessaoAtende } from '../store/sessao';
import { DESCRICAO_DO_PAPEL, NOME_DO_PAPEL, PAPEIS_ATRIBUIVEIS, pode, type Papel } from '../../shared/papeis';
import { MIN_SENHA } from '../../shared/validacao';
import type { Funcionario, Time } from '../../shared/tipos';

/**
 * A equipe: quem atende, quem supervisiona, quem administra — e em que
 * times cada um está. Admin gere; supervisor e atendente só veem.
 */
const COR_DA_PRESENCA = { online: 'bg-emerald-500', ausente: 'bg-amber-400', offline: 'bg-slate-400' } as const;

export function Equipe() {
  const equipe = useDadosAtende((s) => s.equipe);
  const times = useDadosAtende((s) => s.times);
  const aplicar = useDadosAtende((s) => s.aplicar);
  const sessao = useSessaoAtende((s) => s.sessao)!;
  const gere = pode(sessao.papel, 'equipe.gerir');
  const [editando, setEditando] = useState<Funcionario | 'novo' | null>(null);
  const [desativando, setDesativando] = useState<Funcionario | null>(null);
  const [mostrarInativos, setMostrarInativos] = useState(false);

  const nomeDoTime = (id: string) => times.find((t) => t.id === id)?.nome ?? '—';
  const visiveis = equipe.filter((f) => mostrarInativos || f.ativo);
  const inativos = equipe.filter((f) => !f.ativo).length;

  async function desativar() {
    if (!desativando) return;
    try {
      const r = await api.delete<{ equipe: Funcionario[]; times: Time[] }>(`/equipe/${desativando.id}`);
      aplicar({ equipe: r.equipe, times: r.times });
      toast.success(`${desativando.nome} desativado.`);
      setDesativando(null);
    } catch (err) {
      toast.error(err instanceof ErroDaApi ? err.message : 'Não foi possível desativar.');
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-[var(--text)]">Equipe</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">{gere ? 'Quem atende, quem supervisiona, quem administra — e em que times.' : 'Quem está na equipe e em que times.'}</p>
        </div>
        {gere && (
          <Button icon={<Plus size={15} />} onClick={() => setEditando('novo')}>
            Nova pessoa
          </Button>
        )}
      </div>

      {visiveis.length === 0 ? (
        <Card className="p-8">
          <EmptyState icon={<Users size={22} />} title="Só você por aqui" subtitle="Cadastre a equipe: cada pessoa entra com o próprio e-mail e vê só o que o papel dela permite." />
        </Card>
      ) : (
        <Card className="divide-y divide-[var(--border)] p-0">
          {visiveis.map((f) => (
            <div key={f.id} className={`flex flex-wrap items-center gap-3 px-4 py-3 ${f.ativo ? '' : 'opacity-60'}`}>
              <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--brand)]/12 text-sm font-extrabold text-[var(--brand)]">
                {iniciais(f.nome)}
                <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[var(--surface)] ${COR_DA_PRESENCA[f.ativo ? f.presenca : 'offline']}`} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-[var(--text)]">
                  {f.nome} {f.id === sessao.id && <span className="text-xs font-normal text-[var(--text-muted)]">(você)</span>}
                </p>
                <p className="truncate text-xs text-[var(--text-muted)]">{f.email}</p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant={f.papel === 'admin' ? 'indigo' : f.papel === 'supervisor' ? 'info' : 'neutral'}>{NOME_DO_PAPEL[f.papel]}</Badge>
                {f.times.map((id) => (
                  <span key={id} className="rounded-full bg-[var(--bg-2)] px-2 py-0.5 text-[11px] font-semibold text-[var(--text-muted)]">
                    {nomeDoTime(id)}
                  </span>
                ))}
                {!f.ativo && <Badge variant="critical">Inativo</Badge>}
              </div>
              {gere && (
                <span className="flex shrink-0 gap-1 text-[var(--text-muted)]">
                  <button type="button" onClick={() => setEditando(f)} className="rounded-lg p-1.5 hover:bg-[var(--bg-2)] hover:text-[var(--text)]" aria-label="Editar">
                    <Pencil size={14} />
                  </button>
                  {f.ativo && f.id !== sessao.id && (
                    <button type="button" onClick={() => setDesativando(f)} className="rounded-lg p-1.5 hover:bg-rose-500/10 hover:text-rose-600" aria-label="Desativar">
                      <UserX size={14} />
                    </button>
                  )}
                </span>
              )}
            </div>
          ))}
        </Card>
      )}

      {inativos > 0 && (
        <button type="button" onClick={() => setMostrarInativos((v) => !v)} className="text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text)]">
          {mostrarInativos ? 'Ocultar' : 'Mostrar'} {inativos} {inativos === 1 ? 'pessoa inativa' : 'pessoas inativas'}
        </button>
      )}

      {editando && <ModalDaPessoa pessoa={editando === 'novo' ? null : editando} times={times} onClose={() => setEditando(null)} />}

      <Modal
        open={Boolean(desativando)}
        onClose={() => setDesativando(null)}
        title={`Desativar ${desativando?.nome}?`}
        subtitle="A pessoa deixa de entrar em até um minuto. O histórico de atendimentos dela continua."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDesativando(null)}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={desativar}>
              Desativar
            </Button>
          </>
        }
      >
        <span />
      </Modal>
    </div>
  );
}

function iniciais(nome: string): string {
  const p = nome.trim().split(/\s+/);
  return ((p[0]?.[0] ?? '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
}

function ModalDaPessoa({ pessoa, times, onClose }: { pessoa: Funcionario | null; times: Time[]; onClose: () => void }) {
  const aplicar = useDadosAtende((s) => s.aplicar);
  const sessao = useSessaoAtende((s) => s.sessao)!;
  const [nome, setNome] = useState(pessoa?.nome ?? '');
  const [email, setEmail] = useState(pessoa?.email ?? '');
  const [senha, setSenha] = useState('');
  const [papel, setPapel] = useState<Papel>(pessoa?.papel ?? 'atendente');
  const [ativo, setAtivo] = useState(pessoa?.ativo ?? true);
  const [selecionados, setSelecionados] = useState<string[]>(pessoa?.times ?? []);
  const [salvando, setSalvando] = useState(false);
  const novo = !pessoa;
  const ehEu = pessoa?.id === sessao.id;

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setSalvando(true);
    try {
      const corpo: Record<string, unknown> = { nome, email, papel, times: selecionados };
      if (senha) corpo.senha = senha;
      if (!novo) corpo.ativo = ativo;
      const r = novo ? await api.post<{ equipe: Funcionario[]; times: Time[] }>('/equipe', corpo) : await api.patch<{ equipe: Funcionario[]; times: Time[] }>(`/equipe/${pessoa!.id}`, corpo);
      aplicar({ equipe: r.equipe, times: r.times });
      toast.success(novo ? `${nome} cadastrado. Se houver e-mail configurado, um convite foi enviado.` : 'Salvo.');
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
      title={novo ? 'Nova pessoa' : `Editar ${pessoa!.nome}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="form-pessoa" loading={salvando}>
            {novo ? 'Cadastrar' : 'Salvar'}
          </Button>
        </>
      }
    >
      <form id="form-pessoa" onSubmit={salvar} className="space-y-4">
        <Input label="Nome" required value={nome} onChange={(e) => setNome(e.target.value)} maxLength={80} autoFocus />
        <Input label="E-mail (é o login)" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Input label={novo ? `Senha inicial (mínimo ${MIN_SENHA})` : 'Nova senha (deixe em branco para manter)'} type="password" autoComplete="new-password" required={novo} minLength={MIN_SENHA} value={senha} onChange={(e) => setSenha(e.target.value)} />
        <Select label="Papel" value={papel} onChange={(e) => setPapel(e.target.value as Papel)} disabled={ehEu}>
          {PAPEIS_ATRIBUIVEIS.map((p) => (
            <option key={p} value={p}>
              {NOME_DO_PAPEL[p]}
            </option>
          ))}
        </Select>
        <p className="-mt-2 text-xs text-[var(--text-muted)]">{DESCRICAO_DO_PAPEL[papel]}</p>
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Times</p>
          {times.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">Nenhum time criado ainda. Crie em Times e volte aqui.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {times.map((t) => {
                const marcado = selecionados.includes(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSelecionados((l) => (marcado ? l.filter((x) => x !== t.id) : [...l, t.id]))}
                    className={`rounded-full px-3 py-1 text-xs font-bold transition-colors ${marcado ? 'bg-[var(--brand)] text-white' : 'bg-[var(--bg-2)] text-[var(--text-muted)] hover:text-[var(--text)]'}`}
                  >
                    {t.nome}
                  </button>
                );
              })}
            </div>
          )}
          <p className="mt-1.5 text-xs text-[var(--text-muted)]">{papel === 'supervisor' ? 'Um supervisor acompanha os times em que está.' : papel === 'admin' ? 'Administrador vê todos os times; marcar aqui só diz onde ele também atende.' : 'Atendente recebe conversas dos times em que está.'}</p>
        </div>
        {!novo && !ehEu && (
          <label className="flex items-center gap-2 text-sm text-[var(--text)]">
            <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
            Conta ativa
          </label>
        )}
      </form>
    </Modal>
  );
}
