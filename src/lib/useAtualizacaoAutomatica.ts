import { useEffect } from 'react';

/** De quanto em quanto tempo uma tela busca sozinha, com a aba à frente. */
export const INTERVALO_PADRAO_MS = 45_000;

/**
 * A tela se atualiza sozinha.
 *
 * O estoque é operado por várias pessoas ao mesmo tempo — e agora também
 * pelo WhatsApp, longe de qualquer navegador. Esperar um F5 é esperar que
 * alguém desconfie de que a tela está velha.
 *
 * Sem websocket: a cada intervalo, e sempre que a aba volta ao foco ou a
 * internet volta. Aba escondida não busca nada — celular no bolso não gasta
 * bateria nem dado, e um painel esquecido aberto a noite toda não vira carga
 * no servidor.
 *
 * `refetch` precisa ser estável (useCallback) e não empilhar pedidos.
 */
export function useAtualizacaoAutomatica(refetch: () => void, intervaloMs: number = INTERVALO_PADRAO_MS): void {
  useEffect(() => {
    const visivel = () => typeof document === 'undefined' || document.visibilityState === 'visible';
    const agora = () => {
      if (visivel()) refetch();
    };
    const relogio = setInterval(agora, intervaloMs);
    window.addEventListener('focus', agora);
    window.addEventListener('online', agora);
    document.addEventListener('visibilitychange', agora);
    return () => {
      clearInterval(relogio);
      window.removeEventListener('focus', agora);
      window.removeEventListener('online', agora);
      document.removeEventListener('visibilitychange', agora);
    };
  }, [refetch, intervaloMs]);
}
