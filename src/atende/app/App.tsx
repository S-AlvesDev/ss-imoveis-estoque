import { useEffect } from 'react';
import { Toaster } from 'sonner';
import { motion } from 'motion/react';
import { RefreshCw } from 'lucide-react';
import { Acesso } from './pages/Acesso';
import { Landing } from './pages/Landing';
import { Planos } from './pages/Planos';
import { Empresa } from './pages/Empresa';
import { Times } from './pages/Times';
import { Equipe } from './pages/Equipe';
import { Conta } from './pages/Conta';
import { Whatsapp } from './pages/Whatsapp';
import { Central } from './pages/central/Central';
import { Supervisao } from './pages/Supervisao';
import { Dashboard } from './pages/Dashboard';
import { Avaliacoes } from './pages/Avaliacoes';
import { Plano } from './pages/Plano';
import { Bloqueada, SemRecurso } from './pages/SemPlano';
import { planoAtendeLibera } from '../shared/planos';
import { Shell, itensDoMenu } from './Shell';
import { Simbolo } from './Marca';
import { lerCaminho, TELAS, TELAS_PUBLICAS, useRotaAtende, type Tela } from './router';
import { useSessaoAtende } from './store/sessao';
import { useDadosAtende } from './store/dados';
import { pode } from '../shared/papeis';
import { Botao } from './ui/Botao';
import { Erro } from './ui/Estados';

/**
 * O Atende Aí. A URL decide a tela; a sessão decide se pode. Sem sessão,
 * qualquer tela privada cai em Entrar; com sessão, as telas públicas levam
 * para a primeira tela do menu da pessoa.
 */
export default function App() {
  const path = useRotaAtende((s) => s.path);
  const ir = useRotaAtende((s) => s.ir);
  const sessao = useSessaoAtende((s) => s.sessao);
  const { tela, resto } = lerCaminho(path);

  // Raiz (/atende) e caminho desconhecido: quem já entrou vai para dentro; quem não, vê a landing.
  useEffect(() => {
    if (tela || !sessao) return;
    ir(primeiraTela(sessao.papel));
  }, [tela, sessao, ir]);

  if (!tela) {
    if (sessao) return null;
    return (
      <>
        <Landing />
        <Toaster position="top-center" richColors />
      </>
    );
  }

  if (TELAS_PUBLICAS.includes(tela)) {
    // Planos é público para todo mundo, logado ou não.
    if (tela === TELAS.planos) {
      return (
        <>
          <Planos />
          <Toaster position="top-center" richColors />
        </>
      );
    }
    // Logado numa tela pública (menos redefinir senha, que pode vir de link): vai para dentro.
    if (sessao && tela !== TELAS.redefinirSenha) {
      ir(primeiraTela(sessao.papel));
      return null;
    }
    return (
      <>
        <Acesso tela={tela} />
        <Toaster position="top-center" richColors mobileOffset={{ top: 'calc(16px + env(safe-area-inset-top, 0px))' }} />
      </>
    );
  }

  if (!sessao) {
    ir(TELAS.entrar);
    return null;
  }

  return (
    <>
      <Dentro tela={tela} resto={resto} />
      <Toaster position="top-center" richColors toastOptions={{ style: { borderRadius: 14 } }} mobileOffset={{ top: 'calc(16px + env(safe-area-inset-top, 0px))' }} />
    </>
  );
}

function primeiraTela(papel: string): Tela {
  return itensDoMenu(papel)[0]?.tela ?? TELAS.conta;
}

function Dentro({ tela, resto }: { tela: Tela; resto: string }) {
  const sessao = useSessaoAtende((s) => s.sessao)!;
  const { carregado, erro, carregar, conta } = useDadosAtende();
  const ir = useRotaAtende((s) => s.ir);

  useEffect(() => {
    if (!carregado) void carregar();
  }, [carregado, carregar]);

  if (!carregado) return <Carregando />;
  if (erro) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[var(--bg)] p-6">
        <div className="w-full max-w-md">
          <Erro mensagem={`Não consegui carregar a empresa. ${erro}`} aoTentar={() => carregar()} />
          <div className="mt-4 text-center">
            <Botao variante="fantasma" tamanho="sm" icone={<RefreshCw size={14} />} onClick={() => carregar()}>
              Recarregar
            </Botao>
          </div>
        </div>
      </div>
    );
  }

  // Tela que o papel não alcança: volta para a primeira dele.
  const permitida = itensDoMenu(sessao.papel).some((i) => i.tela === tela) || tela === TELAS.conta;
  // Empresa bloqueada (avaliação terminou): só o plano e a própria conta abrem.
  const bloqueada = conta?.situacao === 'bloqueada' && tela !== TELAS.plano && tela !== TELAS.conta;
  const libera = (recurso: 'supervisao' | 'dashboard') => !conta || planoAtendeLibera(conta.plano, recurso);
  if (!permitida) {
    ir(primeiraTela(sessao.papel));
    return null;
  }

  return (
    <Shell tela={tela} resto={resto}>
      {bloqueada ? (
        <Bloqueada />
      ) : (
        <>
          {tela === TELAS.central && <Central conversaId={resto || null} />}
          {tela === TELAS.supervisao && pode(sessao.papel, 'conversas.supervisionar') && (libera('supervisao') ? <Supervisao /> : <SemRecurso recurso="supervisao" />)}
          {tela === TELAS.dashboard && pode(sessao.papel, 'dashboard.ver') && (libera('dashboard') ? <Dashboard /> : <SemRecurso recurso="dashboard" />)}
          {tela === TELAS.avaliacoes && pode(sessao.papel, 'conversas.supervisionar') && (libera('supervisao') ? <Avaliacoes /> : <SemRecurso recurso="supervisao" />)}
          {tela === TELAS.empresa && pode(sessao.papel, 'empresa.gerir') && <Empresa aba={resto === 'ia' ? 'ia' : 'empresa'} />}
          {tela === TELAS.times && pode(sessao.papel, 'times.gerir') && <Times />}
          {tela === TELAS.equipe && <Equipe />}
          {tela === TELAS.whatsapp && pode(sessao.papel, 'whatsapp.gerir') && <Whatsapp />}
          {tela === TELAS.plano && pode(sessao.papel, 'empresa.gerir') && <Plano />}
          {tela === TELAS.conta && <Conta />}
        </>
      )}
    </Shell>
  );
}

function Carregando() {
  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-5 bg-[var(--bg)]">
      <motion.div animate={{ scale: [1, 1.06, 1], opacity: [0.85, 1, 0.85] }} transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 shadow-[var(--sombra-cartao)]">
        <Simbolo tamanho={44} />
      </motion.div>
      <div className="flex items-center gap-1.5" aria-label="Carregando">
        <span className="ponto-ia h-1.5 w-1.5 rounded-full bg-[var(--brand)]" />
        <span className="ponto-ia h-1.5 w-1.5 rounded-full bg-[var(--brand)]" />
        <span className="ponto-ia h-1.5 w-1.5 rounded-full bg-[var(--brand)]" />
      </div>
    </div>
  );
}
