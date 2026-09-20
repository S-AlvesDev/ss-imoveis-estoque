import { CreditCard, Lock } from 'lucide-react';
import { Botao } from '../ui/Botao';
import { Cartao } from '../ui/Cartao';
import { Pagina } from '../ui/Pagina';
import { TELAS, useRotaAtende } from '../router';
import { useSessaoAtende } from '../store/sessao';
import { useDadosAtende } from '../store/dados';
import { pode } from '../../shared/papeis';
import { NOME_DO_PLANO_ATENDE, planoAtendeMinimoPara, type RecursoAtende } from '../../shared/planos';
import { ATENDE } from '../../shared/produto';

/**
 * As duas telas de "o plano não cobre": a empresa bloqueada (avaliação
 * terminou, ou plano vencido além da carência) e o recurso que o plano de
 * hoje não inclui. Quem administra vê o botão para o plano; quem não, o
 * recado para falar com o administrador.
 */

function ChamadaParaOPlano() {
  const sessao = useSessaoAtende((s) => s.sessao)!;
  const ir = useRotaAtende((s) => s.ir);
  if (pode(sessao.papel, 'empresa.gerir')) {
    return (
      <Botao className="mt-5" icone={<CreditCard size={15} />} onClick={() => ir(TELAS.plano)}>
        Ver os planos
      </Botao>
    );
  }
  return <p className="mt-5 text-sm text-[var(--text-muted)]">Fale com quem administra o {ATENDE.nome} na sua empresa.</p>;
}

export function Bloqueada() {
  const conta = useDadosAtende((s) => s.conta);
  const venceu = conta && conta.plano !== 'avaliacao';
  return (
    <Pagina titulo={venceu ? 'Plano vencido' : 'Avaliação encerrada'} largura="sm">
      <Cartao className="p-8 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-rose-500">
          <Lock size={24} />
        </span>
        <h2 className="mt-5 text-2xl font-semibold tracking-tight text-[var(--text)]">{venceu ? 'O plano venceu.' : 'A avaliação terminou.'}</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">O atendimento fica pausado até um plano ser ativado: as mensagens que chegarem no WhatsApp continuam guardadas, mas ninguém consegue responder por aqui. Seus dados, times e equipe estão intactos.</p>
        <ChamadaParaOPlano />
      </Cartao>
    </Pagina>
  );
}

const NOME: Record<RecursoAtende, string> = {
  'triagem-ia': 'A triagem por IA',
  supervisao: 'A supervisão em tempo real',
  dashboard: 'O dashboard',
  push: 'As notificações no celular',
  leads: 'Os leads no funil',
  'ponte-stok': 'Entrar com a conta do Stok Aí',
};

export function SemRecurso({ recurso }: { recurso: RecursoAtende }) {
  const conta = useDadosAtende((s) => s.conta);
  const minimo = planoAtendeMinimoPara(recurso);
  return (
    <div className="mx-auto max-w-lg py-6">
      <Cartao className="p-6 text-center sm:p-8">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--brand-soft)] text-[var(--brand)]">
          <Lock size={20} />
        </span>
        <h1 className="mt-4 text-xl font-semibold tracking-tight text-[var(--text)]">
          {NOME[recurso]} está no plano {NOME_DO_PLANO_ATENDE[minimo]}.
        </h1>
        <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
          {conta ? `Hoje a empresa está no plano ${NOME_DO_PLANO_ATENDE[conta.plano]}.` : ''} Para usar, é preciso o {NOME_DO_PLANO_ATENDE[minimo]} ou superior.
        </p>
        <ChamadaParaOPlano />
      </Cartao>
    </div>
  );
}
