import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Pencil, Plus, UserX, Users } from 'lucide-react';
import { Botao } from '../ui/Botao';
import { Cartao } from '../ui/Cartao';
import { Etiqueta } from '../ui/Etiqueta';
import { Avatar } from '../ui/Avatar';
import { Modal } from '../ui/Modal';
import { Entrada, Selecao, Marcar } from '../ui/Campo';
import { Pagina } from '../ui/Pagina';
import { Vazio } from '../ui/Estados';
import { Tabela, type Coluna } from '../ui/Tabela';
import { api, ErroDaApi } from '../lib/api';
import { useDadosAtende } from '../store/dados';
import { useSessaoAtende } from '../store/sessao';
import { useCentral } from '../store/central';
import { presencaEfetiva, NOME_DA_PRESENCA } from '../../shared/presenca';
import { DESCRICAO_DO_PAPEL, NOME_DO_PAPEL, PAPEIS_ATRIBUIVEIS, pode, type Papel } from '../../shared/papeis';
import { MIN_SENHA } from '../../shared/validacao';
import type { Funcionario, Time } from '../../shared/tipos';

/**
 * A equipe: quem atende, quem supervisiona, quem administra — e em que
 * times cada um está. Admin gere; supervisor e atendente só veem.
 */
export function Equipe() {
  const equipe = useDadosAtende((s) => s.equipe);
  const times = useDadosAtende((s) => s.times);
  const aplicar = useDadosAtende((s) => s.aplicar);
  const presenca = useCentral((s) => s.presenca);
  const sessao = useSessaoAtende((s) => s.sessao)!;
  const gere = pode(sessao.papel, 'equipe.gerir');
  const [editando, setEditando] = useState<Funcionario | 'novo' | null>(null);
  const [desativando, setDesativando] = useState<Funcionario | null>(null);
  const [mostrarInativos, setMostrarInativos] = useState(false);

  const nomeDoTime = (id: string) => times.find((t) => t.id === id)?.nome ?? '—';
  const visiveis = equipe.filter((f) => mostrarInativos || f.ativo);
  const inativos = equipe.filter((f) => !f.ativo).length;
  const agora = Date.now();
  const estadoDe = (f: Funcionario) => (f.ativo ? presencaEfetiva(presenca[f.id] ?? f, agora) : 'offline');
  const online = equipe.filter((f) => f.ativo && estadoDe(f) === 'online').length;

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

  const tomDoPapel = (p: Papel) => (p === 'admin' ? 'roxo' : p === 'supervisor' ? 'azul' : 'cinza');
  const colunas: Coluna<Funcionario>[] = [
    {
      chave: 'pessoa',
      titulo: 'Pessoa',
      principal: true,
      render: (f) => (
        <span className={`flex items-center gap-3 ${f.ativo ? '' : 'opacity-60'}`}>
          <Avatar nome={f.nome} tamanho={36} presenca={estadoDe(f)} />
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-[var(--text)]">
              {f.nome} {f.id === sessao.id && <span className="text-xs font-normal text-[var(--text-muted)]">(você)</span>}
            </span>
            <span className="block truncate text-xs text-[var(--text-muted)]">{f.email}</span>
          </span>
        </span>
      ),
    },
    { chave: 'papel', titulo: 'Papel', render: (f) => <span className="inline-flex flex-wrap gap-1"><Etiqueta tom={tomDoPapel(f.papel)}>{NOME_DO_PAPEL[f.papel]}</Etiqueta>{!f.ativo && <Etiqueta tom="vermelho">Inativo</Etiqueta>}</span> },
    { chave: 'times', titulo: 'Times', render: (f) => (f.times.length === 0 ? <span className="text-xs text-[var(--text-muted)]">nenhum</span> : <span className="inline-flex flex-wrap gap-1">{f.times.map((id) => <span key={id} className="rounded-full bg-[var(--bg-2)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-muted)]">{nomeDoTime(id)}</span>)}</span>) },
    { chave: 'presenca', titulo: 'Presença', render: (f) => <span className="text-xs text-[var(--text-muted)]">{f.ativo ? NOME_DA_PRESENCA[estadoDe(f)] : '—'}</span> },
    ...(gere
      ? [
          {
            chave: 'acoes',
            titulo: <span className="sr-only">Ações</span>,
            alinhar: 'direita' as const,
            acoes: true,
            render: (f: Funcionario) => (
              <span className="inline-flex gap-0.5">
                <Botao tamanho="sm" variante="fantasma" quadrado icone={<Pencil size={14} />} onClick={() => setEditando(f)} aria-label="Editar" />
                {f.ativo && f.id !== sessao.id && <Botao tamanho="sm" variante="fantasma" quadrado icone={<UserX size={14} />} onClick={() => setDesativando(f)} aria-label="Desativar" className="hover:!bg-rose-50 hover:!text-rose-600" />}
              </span>
            ),
          } satisfies Coluna<Funcionario>,
        ]
      : []),
  ];

  return (
    <Pagina titulo="Equipe" descricao={gere ? 'Quem atende, quem supervisiona, quem administra — e em que times.' : 'Quem está na equipe e em que times.'} largura="md" acoes={gere ? <Botao icone={<Plus size={15} />} onClick={() => setEditando('novo')}>Nova pessoa</Botao> : undefined}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
          <Etiqueta tom="verde" ponto>{online} online</Etiqueta>
          <span>{equipe.filter((f) => f.ativo).length} {equipe.filter((f) => f.ativo).length === 1 ? 'pessoa ativa' : 'pessoas ativas'}</span>
          {inativos > 0 && (
            <button type="button" onClick={() => setMostrarInativos((v) => !v)} className="font-semibold text-[var(--brand)] hover:underline">
              {mostrarInativos ? 'Ocultar' : 'Mostrar'} {inativos} {inativos === 1 ? 'inativa' : 'inativas'}
            </button>
          )}
        </div>

        <Cartao className="p-3 sm:p-5">
          <Tabela colunas={colunas} linhas={visiveis} chave={(f) => String(f.id)} vazio={<Vazio icone={<Users size={22} />} titulo="Só você por aqui" texto="Cadastre a equipe: cada pessoa entra com o próprio e-mail e vê só o que o papel dela permite." acao={gere ? <Botao icone={<Plus size={15} />} onClick={() => setEditando('novo')}>Nova pessoa</Botao> : undefined} />} />
        </Cartao>
      </div>

      {editando && <ModalDaPessoa pessoa={editando === 'novo' ? null : editando} times={times} onClose={() => setEditando(null)} />}

      <Modal
        aberto={Boolean(desativando)}
        onFechar={() => setDesativando(null)}
        titulo={`Desativar ${desativando?.nome}?`}
        descricao="A pessoa deixa de entrar em até um minuto. O histórico de atendimentos dela continua."
        largura="sm"
        rodape={
          <>
            <Botao variante="fantasma" onClick={() => setDesativando(null)}>
              Cancelar
            </Botao>
            <Botao variante="perigo" onClick={desativar}>
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
      aberto
      onFechar={onClose}
      titulo={novo ? 'Nova pessoa' : `Editar ${pessoa!.nome}`}
      descricao={novo ? 'Ela entra com o próprio e-mail e vê só o que o papel permite.' : undefined}
      rodape={
        <>
          <Botao variante="fantasma" onClick={onClose}>
            Cancelar
          </Botao>
          <Botao type="submit" form="form-pessoa" carregando={salvando}>
            {novo ? 'Cadastrar' : 'Salvar'}
          </Botao>
        </>
      }
    >
      <form id="form-pessoa" onSubmit={salvar} className="space-y-4">
        <Entrada rotulo="Nome" required value={nome} onChange={(e) => setNome(e.target.value)} maxLength={80} autoFocus />
        <Entrada rotulo="E-mail (é o login)" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Entrada rotulo={novo ? `Senha inicial (mínimo ${MIN_SENHA})` : 'Nova senha'} ajuda={novo ? undefined : 'Deixe em branco para manter a atual.'} type="password" autoComplete="new-password" required={novo} minLength={MIN_SENHA} value={senha} onChange={(e) => setSenha(e.target.value)} />
        <Selecao rotulo="Papel" value={papel} onChange={(e) => setPapel(e.target.value as Papel)} disabled={ehEu} ajuda={DESCRICAO_DO_PAPEL[papel]}>
          {PAPEIS_ATRIBUIVEIS.map((p) => (
            <option key={p} value={p}>
              {NOME_DO_PAPEL[p]}
            </option>
          ))}
        </Selecao>
        <div>
          <p className="mb-1.5 text-xs font-semibold text-[var(--text)]">Times</p>
          {times.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">Nenhum time criado ainda. Crie em Times e volte aqui.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {times.map((t) => {
                const marcado = selecionados.includes(t.id);
                return (
                  <button key={t.id} type="button" aria-pressed={marcado} onClick={() => setSelecionados((l) => (marcado ? l.filter((x) => x !== t.id) : [...l, t.id]))} className={`h-8 rounded-full px-3 text-xs font-semibold transition-colors ${marcado ? 'bg-[var(--brand)] text-white' : 'border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:border-[var(--brand)]/40 hover:text-[var(--text)]'}`}>
                    {t.nome}
                  </button>
                );
              })}
            </div>
          )}
          <p className="mt-1.5 text-xs text-[var(--text-muted)]">{papel === 'supervisor' ? 'Um supervisor acompanha os times em que está.' : papel === 'admin' ? 'Administrador vê todos os times; marcar aqui só diz onde ele também atende.' : 'Atendente recebe conversas dos times em que está.'}</p>
        </div>
        {!novo && !ehEu && (
          <Marcar marcado={ativo} onChange={setAtivo}>
            Conta ativa
          </Marcar>
        )}
      </form>
    </Modal>
  );
}
