import { useEffect, useRef } from 'react';
import { useCentral } from './central';
import { inscricaoLocal } from '../notificacoes';
import { intervaloDoSync } from './ritmo';

/**
 * O relógio do sync, que roda no Shell — em qualquer tela a pessoa continua
 * presente (o sync é o batimento) e Central e Supervisão leem o mesmo estado
 * (useCentral).
 *
 * O ritmo não é fixo: acompanha o movimento do atendimento e o fato de a aba
 * estar ou não na frente. Quem decide é `intervaloDoSync`, em ritmo.ts, com o
 * porquê de cada número. Aqui fica só o relógio.
 *
 * Por isso é `setTimeout` encadeado e não `setInterval`: o intervalo muda a
 * cada volta.
 *
 * `sincronizar` devolve se veio alguma coisa. Tique vazio afrouxa o ritmo;
 * novidade, foco ou volta da aba trazem de novo para o rápido.
 */
export function useSincronizacao(opcoes: { carregarLista?: boolean } = {}) {
  const carregarLista = useCentral((s) => s.carregarLista);
  const sincronizar = useCentral((s) => s.sincronizar);
  const sincronizando = useRef(false);
  const tiquesVazios = useRef(0);
  const comLista = opcoes.carregarLista !== false;

  useEffect(() => {
    if (comLista) void carregarLista();
    let ativo = true;
    let relogio: number | undefined;
    // Enquanto não se sabe, trata como sem push: erra para o lado de avisar.
    let temPush = false;
    void inscricaoLocal()
      .then((i) => {
        temPush = Boolean(i);
      })
      .catch(() => {
        /* sem suporte a push: segue sem */
      });

    function agendar() {
      if (!ativo) return;
      window.clearTimeout(relogio);
      const escondido = typeof document !== 'undefined' && document.hidden;
      relogio = window.setTimeout(tique, intervaloDoSync({ escondido, temPush, tiquesVazios: tiquesVazios.current }));
    }

    async function tique() {
      if (!ativo) return;
      // Um sync em voo já vai trazer o que houver: não empilha pedido.
      if (sincronizando.current) {
        agendar();
        return;
      }
      sincronizando.current = true;
      try {
        const houveNovidade = await sincronizar();
        tiquesVazios.current = houveNovidade ? 0 : tiquesVazios.current + 1;
      } catch {
        /* o próximo tique tenta de novo */
      } finally {
        sincronizando.current = false;
      }
      agendar();
    }

    void tique();

    /** Voltou para a tela (ou a aba mudou de estado): ritmo rápido de novo. */
    function acordar() {
      tiquesVazios.current = 0;
      if (typeof document !== 'undefined' && document.hidden) agendar();
      else void tique();
    }
    document.addEventListener('visibilitychange', acordar);
    window.addEventListener('focus', acordar);
    window.addEventListener('online', acordar);
    return () => {
      ativo = false;
      window.clearTimeout(relogio);
      document.removeEventListener('visibilitychange', acordar);
      window.removeEventListener('focus', acordar);
      window.removeEventListener('online', acordar);
    };
  }, [carregarLista, sincronizar, comLista]);
}
