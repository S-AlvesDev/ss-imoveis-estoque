import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import { ArrowRight, Building2, Link2, Lock, Mail, User } from 'lucide-react';
import { Button } from '@/shared/ui/Button';
import { Input } from '@/shared/ui/Field';
import { api, ErroDaApi } from '../lib/api';
import { sessaoDoStokAi } from '../lib/ponte';
import { useSessaoAtende } from '../store/sessao';
import { TELAS, useRotaAtende, type Tela } from '../router';
import { MarcaAtende } from '../Marca';
import { ATENDE } from '../../shared/produto';
import { MIN_SENHA } from '../../shared/validacao';
import type { SessaoAtende } from '../../shared/tipos';
import { ADMIN_ROLES } from '../../../shared/constants';
import { SESSAO_DO_PRODUTO, type AcessoSevla, type RespostaDeEntrada } from '../../../shared/sevla';
import { entrarNaSevla, sessaoDoProduto, ativarAtendePelaSevla, deveCairNoLoginAntigo } from '../../../shared/sevlaNavegador';

/**
 * As telas de acesso do Atende Aí: entrar, criar a conta da empresa,
 * esqueci a senha e redefinir. Painel da esquerda é a marca — navy com o
 * brilho roxo; o formulário fica à direita, claro e curto.
 */

const pilares = [
  ['A IA entende', 'Lê a primeira mensagem, identifica assunto, intenção e setor.'],
  ['O atendente resolve', 'Recebe a conversa com contexto, não com "como posso ajudar?".'],
  ['O supervisor acompanha', 'Vê a equipe em tempo real, orienta, assume, corrige a triagem.'],
] as const;

function Moldura({ children, titulo, subtitulo }: { children: ReactNode; titulo: string; subtitulo: string }) {
  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[1.1fr_1fr]">
      <div className="fundo-navy relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between lg:p-14">
        <div className="pointer-events-none absolute inset-0 opacity-[0.07]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.5) 1px, transparent 1px)', backgroundSize: '48px 48px' }} />
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="relative z-10">
          <MarcaAtende tema="escuro" tamanho={40} />
        </motion.div>
        <div className="relative z-10 max-w-lg">
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }} className="font-mono text-xs font-semibold uppercase tracking-[0.3em] text-[var(--lilas)]">
            Atendimento pelo WhatsApp da sua empresa
          </motion.p>
          <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="mt-3 text-5xl font-extrabold leading-[1.05] tracking-tight text-white">
            Seu atendimento,
            <br />
            <span className="bg-gradient-to-r from-[#c4b5fd] to-[#7c3aed] bg-clip-text text-transparent">no controle.</span>
          </motion.h1>
          <motion.ul initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} className="mt-10 space-y-4">
            {pilares.map(([t, d]) => (
              <li key={t} className="flex gap-3">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[var(--brand)] shadow-[0_0_12px_var(--brand)]" />
                <div>
                  <p className="font-bold text-white">{t}</p>
                  <p className="text-sm text-[#a5abcf]">{d}</p>
                </div>
              </li>
            ))}
          </motion.ul>
        </div>
        <p className="relative z-10 text-xs text-[#6f76a0]">
          {ATENDE.nome} é da mesma casa do Stok Aí. <a href="/" className="underline decoration-[#6f76a0]/50 hover:text-white">Conhecer o Stok Aí</a>
        </p>
      </div>

      <div className="flex items-center justify-center bg-[var(--bg)] px-6 py-10">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <MarcaAtende tema="claro" tamanho={36} />
          </div>
          <h2 className="text-2xl font-extrabold tracking-tight text-[var(--text)]">{titulo}</h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">{subtitulo}</p>
          <div className="mt-6">{children}</div>
        </motion.div>
      </div>
    </div>
  );
}

function IrPara({ tela, children }: { tela: Tela; children: ReactNode }) {
  const ir = useRotaAtende((s) => s.ir);
  return (
    <button type="button" onClick={() => ir(tela)} className="font-semibold text-[var(--brand)] hover:underline">
      {children}
    </button>
  );
}

export function Acesso({ tela }: { tela: Tela }) {
  if (tela === TELAS.criarConta) return <CriarConta />;
  if (tela === TELAS.esqueciSenha) return <EsqueciSenha />;
  if (tela === TELAS.redefinirSenha) return <RedefinirSenha />;
  return <Entrar />;
}

/** A conta SEVLA entrou, mas nenhuma empresa dela usa o Atende Aí. */
interface SemAtende {
  token: string;
  /** Empresas do Stok Aí que esta pessoa administra — pode ativar o Atende nelas. */
  ativaveis: Array<{ organization_id: string; organizacao: string }>;
}

function Entrar() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [semAtende, setSemAtende] = useState<SemAtende | null>(null);
  const entrar = useSessaoAtende((s) => s.entrar);
  const ir = useRotaAtende((s) => s.ir);

  /** O login de sempre, direto na tabela do Atende Aí. */
  async function entrarPeloAtende() {
    const r = await api.post<{ sessao: SessaoAtende; token: string }>('/login', { email, senha });
    entrar(r.sessao, r.token);
    ir(TELAS.central);
  }

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setSemAtende(null);
    try {
      // Primeiro a identidade SEVLA: entra uma vez e recebe o token do Atende.
      // Se a SEVLA estiver indisponível (ou a conta não existir lá), o caminho antigo continua valendo.
      let sevla: RespostaDeEntrada | null = null;
      try {
        sevla = await entrarNaSevla(email.trim(), senha);
        const emitida = await sessaoDoProduto(sevla.token, 'atende');
        if (emitida.produto !== 'atende') throw new Error('Resposta inesperada.');
        entrar(emitida.sessao as SessaoAtende, emitida.token);
        ir(TELAS.central);
        return;
      } catch (err) {
        if (sevla && !deveCairNoLoginAntigo(err)) {
          // A conta existe e a senha está certa — só não tem o Atende Aí em nenhuma empresa.
          setSemAtende({ token: sevla.token, ativaveis: empresasAtivaveis(sevla.acessos) });
          return;
        }
      }
      await entrarPeloAtende();
    } catch (err) {
      toast.error(err instanceof ErroDaApi ? err.message : 'Não foi possível entrar.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Moldura titulo="Entrar" subtitulo="Use o e-mail e a senha cadastrados pela sua empresa.">
      <PonteComOStokAi />
      {semAtende && <AtivarPelaSevla dados={semAtende} />}
      <form onSubmit={enviar} className="space-y-4">
        <div className="relative">
          <Mail size={16} className="pointer-events-none absolute left-3 top-[38px] text-[var(--text-muted)]" />
          <Input label="E-mail" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="pl-9" placeholder="voce@empresa.com.br" />
        </div>
        <div className="relative">
          <Lock size={16} className="pointer-events-none absolute left-3 top-[38px] text-[var(--text-muted)]" />
          <Input label="Senha" type="password" autoComplete="current-password" required value={senha} onChange={(e) => setSenha(e.target.value)} className="pl-9" />
        </div>
        <Button type="submit" fullWidth size="lg" loading={enviando} icon={<ArrowRight size={16} />}>
          Entrar
        </Button>
        <div className="flex items-center justify-between text-sm">
          <IrPara tela={TELAS.esqueciSenha}>Esqueci minha senha</IrPara>
          <span className="text-[var(--text-muted)]">
            Empresa nova? <IrPara tela={TELAS.criarConta}>Criar conta</IrPara>
          </span>
        </div>
      </form>
    </Moldura>
  );
}

/** As empresas do Stok Aí que a pessoa administra e ainda não estão no Atende Aí. O servidor confere de novo ao ativar. */
function empresasAtivaveis(acessos: AcessoSevla[]): SemAtende['ativaveis'] {
  const jaNoAtende = new Set(acessos.filter((a) => a.produto === 'atende').map((a) => a.organization_id));
  const vistas = new Set<string>();
  return acessos
    .filter((a) => a.produto === 'stok' && ADMIN_ROLES.includes(a.papel) && !jaNoAtende.has(a.organization_id))
    .filter((a) => (vistas.has(a.organization_id) ? false : (vistas.add(a.organization_id), true)))
    .map((a) => ({ organization_id: a.organization_id, organizacao: a.organizacao }));
}

/**
 * A conta SEVLA existe, mas nenhuma empresa dela tem o Atende Aí. Quem
 * administra o Stok Aí de alguma empresa ativa aqui; quem não administra
 * nada vê o caminho para os planos.
 */
function AtivarPelaSevla({ dados }: { dados: SemAtende }) {
  const [ativando, setAtivando] = useState<string | null>(null);
  const entrar = useSessaoAtende((s) => s.entrar);
  const ir = useRotaAtende((s) => s.ir);

  async function ativar(org: SemAtende['ativaveis'][number]) {
    setAtivando(org.organization_id);
    try {
      const r = await ativarAtendePelaSevla(dados.token, org.organization_id);
      entrar(r.sessao as SessaoAtende, r.token);
      toast.success(r.ativou ? `Atende Aí ativado para ${org.organizacao}. Comece descrevendo a empresa.` : `Bem-vindo(a) de volta.`);
      ir(r.ativou ? TELAS.empresa : TELAS.central);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível ativar o Atende Aí.');
    } finally {
      setAtivando(null);
    }
  }

  if (dados.ativaveis.length === 0) {
    return (
      <div className="mb-5 rounded-xl border border-amber-400/40 bg-amber-50 p-4 text-sm text-amber-950 dark:bg-amber-500/10 dark:text-amber-100">
        <p className="font-bold">Você ainda não possui o Atende Aí.</p>
        <p className="mt-1">Sua conta SEVLA existe, mas nenhuma empresa sua usa o Atende Aí. Conheça os planos ou peça acesso a quem administra a empresa.</p>
        <div className="mt-3 flex flex-wrap gap-3 text-xs font-semibold">
          <a href={SESSAO_DO_PRODUTO.atende.planos} className="text-[var(--brand)] hover:underline">
            Conhecer os planos
          </a>
          <a href="/cloud/conta" className="text-[var(--brand)] hover:underline">
            Ver minha SEVLA
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-5 rounded-xl border border-[var(--brand)]/30 bg-[var(--brand)]/[0.06] p-4">
      <p className="text-sm text-[var(--text)]">
        Sua conta SEVLA entrou, mas o <strong>Atende Aí</strong> ainda não está ativo nas empresas que você administra.
      </p>
      <div className="mt-3 space-y-2">
        {dados.ativaveis.map((org) => (
          <Button key={org.organization_id} type="button" fullWidth loading={ativando === org.organization_id} disabled={ativando !== null && ativando !== org.organization_id} icon={<Link2 size={15} />} onClick={() => ativar(org)}>
            Ativar o Atende Aí para {org.organizacao}
          </Button>
        ))}
      </div>
      <p className="mt-2 text-xs text-[var(--text-muted)]">Cria a empresa no Atende Aí ligada à sua conta do Stok Aí; você entra como administrador.</p>
    </div>
  );
}

/**
 * Quem já está no Stok Aí neste navegador entra por aqui: a mesma empresa,
 * a mesma pessoa, sem outra senha. Se a empresa ainda não ativou o Atende,
 * quem administra o estoque ativa com um clique.
 */
function PonteComOStokAi() {
  const [stokai] = useState(() => sessaoDoStokAi());
  const [situacao, setSituacao] = useState<{ pessoa: { nome: string; email: string | null }; empresa: { nome: string }; vinculada: boolean; podeAtivar: boolean } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [entrando, setEntrando] = useState(false);
  const entrar = useSessaoAtende((s) => s.entrar);
  const ir = useRotaAtende((s) => s.ir);

  useEffect(() => {
    if (!stokai) return;
    api
      .post<typeof situacao>('/ponte/situacao', { token: stokai.token })
      .then(setSituacao)
      // Sessão do Stok Aí vencida é normal (só não mostra o cartão); qualquer outra falha aparece.
      .catch((e) => setErro(e instanceof ErroDaApi && e.status === 401 ? null : e instanceof ErroDaApi ? e.message : 'Não foi possível conferir a sua conta do Stok Aí.'));
  }, [stokai]);

  if (!stokai) return null;
  if (!situacao) {
    return erro ? (
      <div className="mb-5 rounded-xl border border-rose-500/30 bg-rose-500/[0.06] p-4 text-sm text-rose-700 dark:text-rose-300">
        Você está no Stok Aí como <strong>{stokai.nome}</strong>, mas a ponte falhou: {erro}
      </div>
    ) : null;
  }
  const ativar = !situacao.vinculada;
  if (ativar && !situacao.podeAtivar) {
    return (
      <div className="mb-5 rounded-xl border border-[var(--border)] bg-[var(--bg-2)] p-4 text-sm text-[var(--text-muted)]">
        Você está no Stok Aí como <strong className="text-[var(--text)]">{situacao.pessoa.nome}</strong> ({situacao.empresa.nome}), mas a empresa ainda não ativou o Atende Aí. Peça a um administrador do Stok Aí.
      </div>
    );
  }

  async function seguir() {
    setEntrando(true);
    setErro(null);
    try {
      const r = await api.post<{ sessao: SessaoAtende; token: string; ativou: boolean }>('/ponte/entrar', { token: stokai!.token });
      entrar(r.sessao, r.token);
      if (r.ativou) {
        toast.success(`Atende Aí ativado para ${situacao!.empresa.nome}. Comece descrevendo a empresa.`);
        ir(TELAS.empresa);
      } else ir(TELAS.central);
    } catch (err) {
      setErro(err instanceof ErroDaApi ? err.message : 'Não foi possível entrar com a conta do Stok Aí.');
    } finally {
      setEntrando(false);
    }
  }

  return (
    <div className="mb-5 rounded-xl border border-[var(--brand)]/30 bg-[var(--brand)]/[0.06] p-4">
      <p className="text-sm text-[var(--text)]">
        Você está no <strong>Stok Aí</strong> como <strong>{situacao.pessoa.nome}</strong> · {situacao.empresa.nome}.
      </p>
      <Button type="button" className="mt-3" fullWidth loading={entrando} icon={<Link2 size={15} />} onClick={seguir}>
        {ativar ? `Ativar o Atende Aí para ${situacao.empresa.nome}` : 'Entrar com essa conta'}
      </Button>
      {ativar && <p className="mt-2 text-xs text-[var(--text-muted)]">Cria a empresa no Atende Aí ligada à sua conta do Stok Aí; você entra como administrador.</p>}
      {erro && <p className="mt-2 text-xs font-semibold text-rose-600">{erro}</p>}
      <p className="mt-3 text-center text-xs text-[var(--text-muted)]">ou entre com e-mail e senha do Atende Aí</p>
    </div>
  );
}

function CriarConta() {
  const [empresa, setEmpresa] = useState('');
  const [segmento, setSegmento] = useState('');
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [enviando, setEnviando] = useState(false);
  const entrar = useSessaoAtende((s) => s.entrar);
  const ir = useRotaAtende((s) => s.ir);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    try {
      const r = await api.post<{ sessao: SessaoAtende; token: string }>('/cadastro', { empresa, segmento, nome, email, senha });
      entrar(r.sessao, r.token);
      toast.success(`${empresa} está no ${ATENDE.nome}. Comece descrevendo a empresa.`);
      ir(TELAS.empresa);
    } catch (err) {
      toast.error(err instanceof ErroDaApi ? err.message : 'Não foi possível criar a conta.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Moldura titulo="Criar a conta da empresa" subtitulo="Você será o administrador: cadastra os setores, a equipe e conecta o WhatsApp.">
      <form onSubmit={enviar} className="space-y-4">
        <div className="relative">
          <Building2 size={16} className="pointer-events-none absolute left-3 top-[38px] text-[var(--text-muted)]" />
          <Input label="Empresa" required value={empresa} onChange={(e) => setEmpresa(e.target.value)} className="pl-9" placeholder="Imobiliária X" maxLength={80} />
        </div>
        <Input label="Segmento (opcional)" value={segmento} onChange={(e) => setSegmento(e.target.value)} placeholder="Imobiliária, clínica, loja, escola…" maxLength={60} />
        <div className="relative">
          <User size={16} className="pointer-events-none absolute left-3 top-[38px] text-[var(--text-muted)]" />
          <Input label="Seu nome" required value={nome} onChange={(e) => setNome(e.target.value)} className="pl-9" maxLength={80} />
        </div>
        <div className="relative">
          <Mail size={16} className="pointer-events-none absolute left-3 top-[38px] text-[var(--text-muted)]" />
          <Input label="Seu e-mail" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="pl-9" />
        </div>
        <div className="relative">
          <Lock size={16} className="pointer-events-none absolute left-3 top-[38px] text-[var(--text-muted)]" />
          <Input label={`Senha (mínimo ${MIN_SENHA} caracteres)`} type="password" autoComplete="new-password" required minLength={MIN_SENHA} value={senha} onChange={(e) => setSenha(e.target.value)} className="pl-9" />
        </div>
        <Button type="submit" fullWidth size="lg" loading={enviando} icon={<ArrowRight size={16} />}>
          Criar conta
        </Button>
        <p className="text-center text-sm text-[var(--text-muted)]">
          Já tem conta? <IrPara tela={TELAS.entrar}>Entrar</IrPara>
        </p>
      </form>
    </Moldura>
  );
}

function EsqueciSenha() {
  const [email, setEmail] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    try {
      await api.post('/senha/esqueci', { email });
      setEnviado(true);
    } catch (err) {
      toast.error(err instanceof ErroDaApi ? err.message : 'Não foi possível enviar.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Moldura titulo="Esqueci minha senha" subtitulo="Se o e-mail estiver cadastrado, você recebe um link que vale por uma hora.">
      {enviado ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 text-sm text-[var(--text)]">
          <p className="font-semibold">Se existir uma conta com este e-mail, enviamos as instruções.</p>
          <p className="mt-1 text-[var(--text-muted)]">Confira também o spam. O link vale por uma hora.</p>
          <p className="mt-4">
            <IrPara tela={TELAS.entrar}>Voltar para entrar</IrPara>
          </p>
        </div>
      ) : (
        <form onSubmit={enviar} className="space-y-4">
          <Input label="E-mail" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <Button type="submit" fullWidth size="lg" loading={enviando}>
            Enviar link
          </Button>
          <p className="text-center text-sm">
            <IrPara tela={TELAS.entrar}>Voltar para entrar</IrPara>
          </p>
        </form>
      )}
    </Moldura>
  );
}

function RedefinirSenha() {
  const [senha, setSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [token, setToken] = useState('');
  const entrar = useSessaoAtende((s) => s.entrar);
  const ir = useRotaAtende((s) => s.ir);

  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get('token') ?? '');
  }, []);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (senha !== confirmacao) return toast.error('As senhas não conferem.');
    setEnviando(true);
    try {
      const r = await api.post<{ ok: true; sessao?: SessaoAtende; token?: string }>('/senha/redefinir', { token, senha });
      if (r.sessao && r.token) {
        entrar(r.sessao, r.token);
        toast.success('Senha criada. Bem-vindo!');
        ir(TELAS.central);
      } else {
        toast.success('Senha redefinida. Entre com ela.');
        ir(TELAS.entrar);
      }
    } catch (err) {
      toast.error(err instanceof ErroDaApi ? err.message : 'Não foi possível redefinir.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Moldura titulo="Criar nova senha" subtitulo={`Mínimo de ${MIN_SENHA} caracteres.`}>
      {!token ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 text-sm">
          <p className="font-semibold text-[var(--text)]">Este link não é válido.</p>
          <p className="mt-1 text-[var(--text-muted)]">
            Peça um novo em <IrPara tela={TELAS.esqueciSenha}>Esqueci minha senha</IrPara>.
          </p>
        </div>
      ) : (
        <form onSubmit={enviar} className="space-y-4">
          <Input label="Nova senha" type="password" autoComplete="new-password" required minLength={MIN_SENHA} value={senha} onChange={(e) => setSenha(e.target.value)} />
          <Input label="Confirme a senha" type="password" autoComplete="new-password" required minLength={MIN_SENHA} value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} />
          <Button type="submit" fullWidth size="lg" loading={enviando}>
            Salvar senha
          </Button>
        </form>
      )}
    </Moldura>
  );
}
