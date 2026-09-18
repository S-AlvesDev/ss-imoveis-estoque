import { useEffect } from 'react';
import { Toaster } from 'sonner';
import { motion } from 'motion/react';
import { BarChart3, Eye, RefreshCw } from 'lucide-react';
import { Button } from '@/shared/ui/Button';
import { Acesso } from './pages/Acesso';
import { Empresa } from './pages/Empresa';
import { Times } from './pages/Times';
import { Equipe } from './pages/Equipe';
import { Conta } from './pages/Conta';
import { Whatsapp } from './pages/Whatsapp';
import { Central } from './pages/central/Central';
import { EmConstrucao } from './pages/EmConstrucao';
import { Shell, itensDoMenu } from './Shell';
import { Simbolo } from './Marca';
import { lerCaminho, TELAS, TELAS_PUBLICAS, useRotaAtende, type Tela } from './router';
import { useSessaoAtende } from './store/sessao';
import { useDadosAtende } from './store/dados';
import { pode } from '../shared/papeis';

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

  // Raiz (/atende) e caminho desconhecido: para onde faz sentido.
  useEffect(() => {
    if (tela) return;
    ir(sessao ? primeiraTela(sessao.papel) : TELAS.entrar);
  }, [tela, sessao, ir]);

  if (!tela) return null;

  if (TELAS_PUBLICAS.includes(tela)) {
    // Logado numa tela pública (menos redefinir senha, que pode vir de link): vai para dentro.
    if (sessao && tela !== TELAS.redefinirSenha) {
      ir(primeiraTela(sessao.papel));
      return null;
    }
    return (
      <>
        <Acesso tela={tela} />
        <Toaster position="top-center" richColors />
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
      <Toaster position="top-right" richColors />
    </>
  );
}

function primeiraTela(papel: string): Tela {
  return itensDoMenu(papel)[0]?.tela ?? TELAS.conta;
}

function Dentro({ tela, resto }: { tela: Tela; resto: string }) {
  const sessao = useSessaoAtende((s) => s.sessao)!;
  const { carregado, erro, carregar } = useDadosAtende();
  const ir = useRotaAtende((s) => s.ir);

  useEffect(() => {
    if (!carregado) void carregar();
  }, [carregado, carregar]);

  if (!carregado) return <Carregando />;
  if (erro) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] p-6 text-center">
        <div className="max-w-sm">
          <p className="text-lg font-bold text-[var(--text)]">Não consegui carregar a empresa.</p>
          <p className="mt-1 text-sm text-[var(--text-muted)]">{erro}</p>
          <Button className="mt-5" icon={<RefreshCw size={15} />} onClick={() => carregar()}>
            Tentar de novo
          </Button>
        </div>
      </div>
    );
  }

  // Tela que o papel não alcança: volta para a primeira dele.
  const permitida = itensDoMenu(sessao.papel).some((i) => i.tela === tela) || tela === TELAS.conta;
  if (!permitida) {
    ir(primeiraTela(sessao.papel));
    return null;
  }

  return (
    <Shell tela={tela}>
      {tela === TELAS.central && <Central conversaId={resto || null} />}
      {tela === TELAS.supervisao && <EmConstrucao titulo="Supervisão" etapa="Etapa 4" icone={<Eye size={24} />} descricao="A equipe em tempo real — quem está online, quantas conversas, há quanto tempo sem responder — e a triagem da IA para corrigir, orientar, assumir ou transferir." />}
      {tela === TELAS.dashboard && <EmConstrucao titulo="Dashboard" etapa="Etapa 5" icone={<BarChart3 size={24} />} descricao="Leads, atendimentos, conversões, tempo de primeira resposta, desempenho por pessoa e por setor. Só números reais, do banco." />}
      {tela === TELAS.empresa && pode(sessao.papel, 'empresa.gerir') && <Empresa />}
      {tela === TELAS.times && pode(sessao.papel, 'times.gerir') && <Times />}
      {tela === TELAS.equipe && <Equipe />}
      {tela === TELAS.whatsapp && pode(sessao.papel, 'whatsapp.gerir') && <Whatsapp />}
      {tela === TELAS.conta && <Conta />}
    </Shell>
  );
}

function Carregando() {
  return (
    <div className="fundo-navy flex h-screen flex-col items-center justify-center gap-4">
      <motion.div animate={{ scale: [1, 1.08, 1], opacity: [0.85, 1, 0.85] }} transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }} className="rounded-2xl bg-white/10 p-3">
        <Simbolo tamanho={44} />
      </motion.div>
      <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-[var(--lilas)]">Carregando</p>
    </div>
  );
}
