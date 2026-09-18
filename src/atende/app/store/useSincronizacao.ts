import { useEffect, useRef } from 'react';
import { useCentral } from './central';

/**
 * O relógio do sync: a cada 4 s com a aba visível, 15 s escondida, e na hora
 * ao voltar o foco. Roda no Shell — em qualquer tela a pessoa continua
 * presente (o sync é o batimento) e Central e Supervisão leem o mesmo
 * estado (useCentral).
 */
export function useSincronizacao(opcoes: { carregarLista?: boolean } = {}) {
  const carregarLista = useCentral((s) => s.carregarLista);
  const sincronizar = useCentral((s) => s.sincronizar);
  const sincronizando = useRef(false);
  const comLista = opcoes.carregarLista !== false;

  useEffect(() => {
    if (comLista) void carregarLista();
    let ativo = true;
    async function tique() {
      if (!ativo || sincronizando.current) return;
      sincronizando.current = true;
      try {
        await sincronizar();
      } catch {
        /* o próximo tique tenta de novo */
      } finally {
        sincronizando.current = false;
      }
    }
    void tique();
    let relogio = window.setInterval(tique, document.hidden ? 15_000 : 4_000);
    function visibilidade() {
      window.clearInterval(relogio);
      relogio = window.setInterval(tique, document.hidden ? 15_000 : 4_000);
      if (!document.hidden) void tique();
    }
    document.addEventListener('visibilitychange', visibilidade);
    window.addEventListener('focus', visibilidade);
    return () => {
      ativo = false;
      window.clearInterval(relogio);
      document.removeEventListener('visibilitychange', visibilidade);
      window.removeEventListener('focus', visibilidade);
    };
  }, [carregarLista, sincronizar, comLista]);
}
