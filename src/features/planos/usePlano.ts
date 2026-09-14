import { useMemo } from 'react';
import { useMarca } from '@/store/marca';
import { definicaoDe, planoLibera, limiteDo, cabeMaisUm, mensagemDeRecurso, mensagemDeLimite, NOME_DO_PLANO, type Conta, type Limite, type PlanoEfetivo, type Recurso } from '@/shared/planos';

/**
 * O plano da organização em uso, visto pelas telas. Enquanto o /api/data
 * não chegou, assume avaliação (tudo liberado): melhor mostrar o botão e o
 * servidor recusar do que esconder por um instante o que a pessoa pode.
 */
const SEM_PRAZO: Conta = { situacao: 'avaliacao', renovacao: null, plano: 'avaliacao', ate: null, dias_restantes: null };

export function usePlano() {
  const organizacao = useMarca((s) => s.organizacao);
  const plano: PlanoEfetivo = organizacao?.plano_efetivo ?? 'avaliacao';
  const conta: Conta = organizacao?.conta ?? SEM_PRAZO;
  return useMemo(
    () => ({
      plano,
      /** Assinada, avaliação, carência ou bloqueada — e até quando. */
      conta,
      nome: NOME_DO_PLANO[plano],
      emAvaliacao: plano === 'avaliacao',
      definicao: definicaoDe(plano),
      /** "Este plano libera isto?" */
      libera: (recurso: Recurso) => planoLibera(plano, recurso),
      /** O limite para uma contagem; null = ilimitado. */
      limite: (limite: Limite) => limiteDo(plano, limite),
      /** Dá para criar mais um, dado quantos já existem? */
      cabeMaisUm: (limite: Limite, atual: number) => cabeMaisUm(plano, limite, atual),
      /** As mensagens de cadeado, iguais às do servidor. */
      porQueNao: (recurso: Recurso) => mensagemDeRecurso(recurso),
      porQueNaoMais: (limite: Limite) => mensagemDeLimite(plano, limite),
    }),
    [plano, conta],
  );
}
