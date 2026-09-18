import { useEffect, useState, type FormEvent } from 'react';
import { ArrowRight, ArrowUpRight, Building2, Link2, Lock, LogOut, Mail, Plus, Sparkles } from 'lucide-react';
import { SEVLA, PRODUTOS } from './produto';
import { Botao, Container, MarcaDoProduto, MarcaSevla, Revelar, Eyebrow, cta } from './ui';
import { NOME_DO_PRODUTO, SESSAO_DO_PRODUTO, type EmpresaNaMinhaSevla, type MinhaSevla as DadosDaMinhaSevla, type ProdutoNaMinhaSevla, type ProdutoSevla } from '@/shared/sevla';
import { ErroDaSevlaNoNavegador, ativarAtendePelaSevla, entrarNaSevla, guardarSessaoDoProduto, lerSessaoSevla, minhaSevla, sairDaSevla, sessaoDoProduto } from '@/shared/sevlaNavegador';

/**
 * Minha SEVLA — a conta central, em /cloud/conta. Uma pessoa, os produtos
 * que ela tem, e um botão para entrar em cada um sem digitar senha de novo.
 *
 * Não é um painel: não há dados de estoque nem de atendimento aqui. Só a
 * identidade e as portas. Quem tem um produto entra; quem administra o Stok
 * Aí de uma empresa pode ativar o Atende Aí lá; quem não tem nada vê os
 * planos. Tudo é conferido no servidor — a página só desenha o que
 * /api/sevla/minha devolve.
 */

type Estado = { fase: 'carregando' } | { fase: 'entrar'; aviso?: string } | { fase: 'indisponivel' } | { fase: 'pronta'; dados: DadosDaMinhaSevla; token: string };

function mensagemDe(e: unknown, padrao: string) {
  return e instanceof Error && e.message ? e.message : padrao;
}

export function MinhaSevla() {
  const [estado, setEstado] = useState<Estado>({ fase: 'carregando' });

  useEffect(() => {
    document.title = 'Minha SEVLA — SEVLA INFINITY';
    // A conta é privada: não entra no índice dos buscadores.
    const robots = document.createElement('meta');
    robots.name = 'robots';
    robots.content = 'noindex, nofollow';
    document.head.appendChild(robots);
    return () => robots.remove();
  }, []);

  async function carregar(token: string) {
    try {
      const dados = await minhaSevla(token);
      setEstado({ fase: 'pronta', dados, token });
    } catch (e) {
      if (e instanceof ErroDaSevlaNoNavegador && e.motivo === 'indisponivel') return setEstado({ fase: 'indisponivel' });
      if (e instanceof ErroDaSevlaNoNavegador && e.status === 401) {
        sairDaSevla();
        return setEstado({ fase: 'entrar', aviso: 'Sua sessão venceu. Entre de novo.' });
      }
      setEstado({ fase: 'entrar', aviso: mensagemDe(e, 'Não foi possível carregar a sua SEVLA.') });
    }
  }

  useEffect(() => {
    const sessao = lerSessaoSevla();
    if (sessao) void carregar(sessao.token);
    else setEstado({ fase: 'entrar' });
  }, []);

  function sair() {
    sairDaSevla();
    setEstado({ fase: 'entrar' });
  }

  return (
    <div className="min-h-dvh">
      <header className="border-b border-[var(--linha)]">
        <Container className="flex h-[68px] items-center justify-between gap-4">
          <a href={SEVLA.base} className="shrink-0 rounded-lg" aria-label={`${SEVLA.nome} — início`} onClick={() => cta('conta-logo')}>
            <MarcaSevla altura={40} />
          </a>
          {estado.fase === 'pronta' && (
            <button type="button" onClick={sair} className="inline-flex min-h-11 items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-slate-300 hover:bg-white/[0.06] hover:text-white">
              <LogOut size={15} /> Sair
            </button>
          )}
        </Container>
      </header>

      <main className="luz-suave relative pb-24 pt-12 sm:pt-16">
        <Container>
          {estado.fase === 'carregando' && <p className="text-sm text-[var(--texto-suave)]">Carregando a sua SEVLA…</p>}
          {estado.fase === 'indisponivel' && <Indisponivel />}
          {estado.fase === 'entrar' && <Entrar aviso={estado.aviso} aoEntrar={carregar} aoIndisponivel={() => setEstado({ fase: 'indisponivel' })} />}
          {estado.fase === 'pronta' && <Painel dados={estado.dados} token={estado.token} aoMudar={() => carregar(estado.token)} />}
        </Container>
      </main>

      <footer className="border-t border-[var(--linha)] py-8 text-xs text-[var(--suave)]">
        <Container className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p>© 2026 SEVLA INFINITY. Todos os direitos reservados.</p>
          <p>
            <a href={SEVLA.base} className="hover:text-white">
              Voltar para a SEVLA
            </a>
          </p>
        </Container>
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------------------
//  Entrar
// ---------------------------------------------------------------------------

function Entrar({ aviso, aoEntrar, aoIndisponivel }: { aviso?: string; aoEntrar: (token: string) => Promise<void>; aoIndisponivel: () => void }) {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setErro(null);
    try {
      const r = await entrarNaSevla(email.trim(), senha);
      cta('conta-entrar');
      await aoEntrar(r.token);
    } catch (err) {
      // Sem a migração da SEVLA no banco, a página mostra as portas dos produtos em vez de um erro.
      if (err instanceof ErroDaSevlaNoNavegador && err.motivo === 'indisponivel') return aoIndisponivel();
      setErro(mensagemDe(err, 'Não foi possível entrar.'));
      setEnviando(false);
    }
  }

  const campo = 'w-full rounded-xl border border-[var(--linha)] bg-[var(--fundo-2)] py-3 pl-10 pr-3 text-base text-white placeholder:text-[var(--suave)] focus:border-[var(--primaria)] focus:outline-none focus:ring-2 focus:ring-[var(--primaria)]/40';

  return (
    <Revelar className="mx-auto max-w-md">
      <Eyebrow className="mb-3">Conta SEVLA</Eyebrow>
      <h1 className="text-[clamp(1.75rem,4vw,2.5rem)] font-bold leading-[1.1] text-white">Entrar na minha SEVLA</h1>
      <p className="mt-3 text-sm leading-relaxed text-[var(--texto-suave)]">Use o e-mail e a senha que você já usa no Stok Aí ou no Atende Aí. É a mesma conta.</p>
      {aviso && <p className="mt-4 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">{aviso}</p>}
      <form onSubmit={enviar} className="mt-8 space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-slate-300">E-mail</span>
          <span className="relative block">
            <Mail size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--suave)]" />
            <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={campo} placeholder="voce@empresa.com.br" />
          </span>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-slate-300">Senha</span>
          <span className="relative block">
            <Lock size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--suave)]" />
            <input type="password" autoComplete="current-password" required value={senha} onChange={(e) => setSenha(e.target.value)} className={campo} />
          </span>
        </label>
        {erro && <p className="text-sm font-semibold text-rose-300">{erro}</p>}
        <button type="submit" disabled={enviando} className="fundo-gradiente inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full px-6 text-sm font-semibold text-white shadow-[0_12px_32px_-12px_rgba(99,102,241,0.7)] transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-60">
          {enviando ? 'Entrando…' : 'Entrar'} {!enviando && <ArrowRight size={16} />}
        </button>
      </form>
      <div className="mt-8 border-t border-[var(--linha)] pt-6 text-sm text-[var(--texto-suave)]">
        <p>Esqueceu a senha? Redefina pelo produto que você usa:</p>
        <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
          <li>
            <a href="/esqueci-senha" className="font-semibold text-[var(--primaria-clara)] hover:underline">
              Stok Aí
            </a>
          </li>
          <li>
            <a href="/atende/esqueci-senha" className="font-semibold text-[var(--primaria-clara)] hover:underline">
              Atende Aí
            </a>
          </li>
        </ul>
      </div>
    </Revelar>
  );
}

function Indisponivel() {
  return (
    <Revelar className="mx-auto max-w-md">
      <Eyebrow className="mb-3">Conta SEVLA</Eyebrow>
      <h1 className="text-[clamp(1.75rem,4vw,2.5rem)] font-bold leading-[1.1] text-white">A conta central ainda não está disponível.</h1>
      <p className="mt-3 text-sm leading-relaxed text-[var(--texto-suave)]">Enquanto isso, cada produto continua com a própria porta de entrada.</p>
      <ul className="mt-6 space-y-2">
        {PRODUTOS.map((p) => (
          <li key={p.id}>
            <a href={p.entrar} onClick={() => cta(`conta-indisponivel-${p.id}`)} className="cartao flex items-center gap-3 rounded-2xl px-5 py-4 text-white">
              <img src={p.simbolo} alt="" className="h-8 w-8 rounded-lg object-contain" aria-hidden />
              <span className="font-semibold">Entrar no {p.nome}</span>
              <ArrowUpRight size={16} className="ml-auto text-slate-500" />
            </a>
          </li>
        ))}
      </ul>
    </Revelar>
  );
}

// ---------------------------------------------------------------------------
//  Painel: a pessoa e os produtos
// ---------------------------------------------------------------------------

function Painel({ dados, token, aoMudar }: { dados: DadosDaMinhaSevla; token: string; aoMudar: () => void }) {
  const primeiro = dados.conta.nome.trim().split(/\s+/)[0] || dados.conta.nome;
  return (
    <>
      <Revelar>
        <Eyebrow className="mb-3">Minha SEVLA</Eyebrow>
        <h1 className="text-[clamp(1.75rem,4.2vw,3rem)] font-bold leading-[1.08] text-white">Olá, {primeiro} 👋</h1>
        <p className="mt-2 text-sm text-[var(--texto-suave)]">{dados.conta.email}</p>
      </Revelar>

      <div className="mt-10 grid grid-cols-1 gap-5 lg:grid-cols-2">
        {dados.produtos.map((prod, i) => (
          <Revelar key={prod.produto} delay={0.05 * i}>
            <CartaoDoProduto prod={prod} token={token} aoMudar={aoMudar} />
          </Revelar>
        ))}
        <Revelar delay={0.05 * dados.produtos.length}>
          <a href={`${SEVLA.base}#ecossistema`} onClick={() => cta('conta-novos-produtos')} className="cartao flex h-full min-h-40 flex-col items-center justify-center gap-3 rounded-3xl border-dashed p-6 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--linha)] text-[var(--primaria-clara)]">
              <Plus size={18} />
            </span>
            <span className="font-display text-base font-bold text-white">Conhecer novos produtos</span>
            <span className="text-xs text-[var(--texto-suave)]">O ecossistema da SEVLA INFINITY continua crescendo.</span>
          </a>
        </Revelar>
      </div>
    </>
  );
}

function CartaoDoProduto({ prod, token, aoMudar }: { prod: ProdutoNaMinhaSevla; token: string; aoMudar: () => void }) {
  const p = PRODUTOS.find((x) => x.id === prod.produto)!;
  const rotas = SESSAO_DO_PRODUTO[prod.produto];
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const semNada = prod.empresas.length === 0 && prod.podeAtivarEm.length === 0;

  async function acessar(e: EmpresaNaMinhaSevla) {
    setOcupado(`acessar:${e.organization_id}`);
    setErro(null);
    try {
      const emitida = await sessaoDoProduto(token, prod.produto, e.organization_id);
      guardarSessaoDoProduto(emitida);
      cta(`conta-acessar-${prod.produto}`);
      window.location.href = rotas.inicio;
    } catch (err) {
      setErro(mensagemDe(err, `Não foi possível abrir o ${p.nome}.`));
      setOcupado(null);
    }
  }

  async function ativar(org: { organization_id: string; organizacao: string }) {
    setOcupado(`ativar:${org.organization_id}`);
    setErro(null);
    try {
      const r = await ativarAtendePelaSevla(token, org.organization_id);
      guardarSessaoDoProduto(r);
      cta('conta-ativar-atende');
      // Empresa recém-criada começa pela descrição dela; quem já existia vai para a central.
      window.location.href = r.ativou ? '/atende/empresa' : rotas.inicio;
    } catch (err) {
      setErro(mensagemDe(err, 'Não foi possível ativar o Atende Aí.'));
      setOcupado(null);
      aoMudar();
    }
  }

  return (
    <article className="cartao flex h-full flex-col rounded-3xl p-6" style={{ ['--cor' as string]: p.cor }}>
      <div className="flex items-start justify-between gap-4">
        <MarcaDoProduto p={p} tamanho={30} />
        <span className="shrink-0 rounded-full border border-[var(--linha)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--texto-suave)]">{p.categoria}</span>
      </div>

      {semNada ? (
        <div className="mt-6 flex flex-1 flex-col">
          <p className="font-semibold text-white">Você ainda não possui um plano.</p>
          <p className="mt-1 text-sm text-[var(--texto-suave)]">{p.descricao}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Botao href={rotas.planos} alvo={`conta-planos-${prod.produto}`} variante="contorno" className="!min-h-10 !px-5 !py-2">
              Conhecer planos <ArrowUpRight size={14} />
            </Botao>
          </div>
        </div>
      ) : (
        <ul className="mt-6 flex flex-1 flex-col gap-3">
          {prod.empresas.map((e) => (
            <li key={e.organization_id} className="flex flex-col gap-3 rounded-2xl border border-[var(--linha)] bg-[var(--fundo)]/50 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.05] text-slate-300">
                  <Building2 size={15} />
                </span>
                <div className="min-w-0">
                  <p className="truncate font-semibold text-white">{e.organizacao}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-[var(--texto-suave)]">
                    <span>{papelLegivel(e.papel)}</span>
                    <Situacao e={e} produto={prod.produto} />
                  </p>
                </div>
              </div>
              <button type="button" onClick={() => acessar(e)} disabled={ocupado !== null} className="fundo-gradiente inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold text-white transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-60">
                {ocupado === `acessar:${e.organization_id}` ? 'Abrindo…' : 'Acessar'} {ocupado !== `acessar:${e.organization_id}` && <ArrowRight size={14} />}
              </button>
            </li>
          ))}
          {prod.podeAtivarEm.map((org) => (
            <li key={org.organization_id} className="rounded-2xl border border-dashed border-[var(--primaria)]/40 bg-[var(--primaria)]/[0.06] p-4">
              <p className="text-sm text-slate-200">
                Você administra o Stok Aí de <strong className="text-white">{org.organizacao}</strong>. O {NOME_DO_PRODUTO.atende} pode ser ativado para ela agora.
              </p>
              <button type="button" onClick={() => ativar(org)} disabled={ocupado !== null} className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-full border border-[var(--primaria)]/60 px-5 text-sm font-semibold text-white transition-all hover:bg-[var(--primaria)]/10 active:scale-[0.98] disabled:opacity-60 sm:w-auto">
                <Link2 size={14} /> {ocupado === `ativar:${org.organization_id}` ? 'Ativando…' : `Ativar o ${NOME_DO_PRODUTO.atende} para ${org.organizacao}`}
              </button>
            </li>
          ))}
        </ul>
      )}

      {erro && <p className="mt-3 text-sm font-semibold text-rose-300">{erro}</p>}

      {!semNada && (
        <p className="mt-5 text-xs text-[var(--suave)]">
          <a href={p.conhecer} className="hover:text-white">
            Sobre o {p.nome}
          </a>
          {' · '}
          <a href={rotas.planos} className="hover:text-white">
            Planos
          </a>
        </p>
      )}
    </article>
  );
}

/** O papel como a pessoa lê: "Administrador", "Supervisor"… Os produtos guardam de jeitos diferentes. */
function papelLegivel(papel: string) {
  const p = papel.trim().toLowerCase().replace(/_/g, ' ');
  return p ? p.charAt(0).toUpperCase() + p.slice(1) : '—';
}

const SITUACAO: Record<string, { rotulo: string; cor: string }> = {
  assinada: { rotulo: 'Plano ativo', cor: 'text-emerald-300' },
  avaliacao: { rotulo: 'Em avaliação', cor: 'text-sky-300' },
  carencia: { rotulo: 'Pagamento pendente', cor: 'text-amber-300' },
  bloqueada: { rotulo: 'Bloqueada', cor: 'text-rose-300' },
  encerrada: { rotulo: 'Encerrada', cor: 'text-rose-300' },
  ativa: { rotulo: 'Ativo', cor: 'text-emerald-300' },
};

/** A situação da empresa no produto — só o que o servidor sabe; sem plano, não se mostra plano. */
function Situacao({ e, produto }: { e: EmpresaNaMinhaSevla; produto: ProdutoSevla }) {
  if (!e.situacao) return null;
  const s = SITUACAO[e.situacao] ?? { rotulo: e.situacao, cor: 'text-[var(--texto-suave)]' };
  const plano = e.plano && produto === 'stok' && e.situacao === 'assinada' ? ` · ${papelLegivel(e.plano)}` : '';
  return (
    <span className={`inline-flex items-center gap-1 ${s.cor}`}>
      <Sparkles size={11} aria-hidden />
      {s.rotulo}
      {plano}
    </span>
  );
}
