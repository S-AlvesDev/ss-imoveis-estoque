import { useEffect } from 'react';
import { toast } from 'sonner';
import { useCentral, type Novidade } from './central';
import { useDadosAtende } from './dados';
import { useSessaoAtende } from './sessao';
import { lerCaminho, TELAS, useRotaAtende } from '../router';
import { registrarServiceWorker, tocarAviso, atualizarTitulo, notificarDaPagina } from '../notificacoes';
import type { Conversa } from '../../shared/tipos';

/**
 * Liga as novidades do sync às notificações: som, toast e (com a aba
 * escondida e sem push) a notificação do sistema. Também registra o
 * service worker e obedece ao que ele manda: "abrir esta conversa" quando
 * a pessoa toca numa notificação, "sincroniza agora" quando chegou push
 * com a aba visível.
 *
 * O que interessa para mim: conversa minha, ou sem atendente na fila de um
 * time meu (ou sem time; admin vê todas as filas). O resto é dos outros.
 */
function nomeDoCliente(c: Conversa): string {
  return c.cliente.nome?.trim() || c.cliente.nome_whatsapp?.trim() || `+${c.cliente.telefone}`;
}

export function useNotificacoes(naoLidas: number) {
  const sessao = useSessaoAtende((s) => s.sessao)!;
  const times = useDadosAtende((s) => s.times);
  const ir = useRotaAtende((s) => s.ir);

  useEffect(() => {
    void registrarServiceWorker();
  }, []);

  useEffect(() => {
    atualizarTitulo(naoLidas);
    return () => atualizarTitulo(0);
  }, [naoLidas]);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const ouvir = (e: MessageEvent) => {
      const m = e.data;
      if (!m || typeof m !== 'object') return;
      if (m.tipo === 'abrir' && typeof m.url === 'string') {
        const { tela, resto } = lerCaminho(m.url);
        if (tela) ir(tela, resto);
      } else if (m.tipo === 'push') void useCentral.getState().sincronizar();
    };
    navigator.serviceWorker.addEventListener('message', ouvir);
    return () => navigator.serviceWorker.removeEventListener('message', ouvir);
  }, [ir]);

  useEffect(() => {
    const meusTimes = new Set(times.filter((t) => t.membros.includes(sessao.id) || t.supervisores.includes(sessao.id)).map((t) => t.id));
    const ehComigo = (c: Conversa) => {
      if (c.atendente_id === sessao.id) return true;
      if (c.atendente_id) return false;
      return !c.time_id || meusTimes.has(c.time_id) || sessao.papel === 'admin';
    };
    useCentral.setState({
      ouvinte: (novidades: Novidade[]) => {
        const aberta = useCentral.getState().selecionada;
        // A conversa que está na tela, com a aba visível, não precisa de aviso: a pessoa está vendo.
        const avisar = novidades.filter((n) => ehComigo(n.conversa) && !(n.conversa.id === aberta && !document.hidden));
        if (!avisar.length) return;
        tocarAviso();
        for (const n of avisar.slice(0, 3)) {
          const nome = nomeDoCliente(n.conversa);
          const titulo = n.tipo === 'mensagem' ? nome : n.tipo === 'atribuida' ? `Conversa para você: ${nome}` : `Nova conversa na fila: ${nome}`;
          const corpo = (n.tipo === 'mensagem' ? n.conversa.ultima_mensagem_texto : (n.conversa.assunto ?? n.conversa.ultima_mensagem_texto)) ?? 'Nova mensagem';
          const abrir = () => ir(TELAS.central, n.conversa.id);
          toast(titulo, { description: corpo, action: { label: 'Abrir', onClick: abrir }, duration: 8000 });
          void notificarDaPagina(titulo, corpo, `conversa-${n.conversa.id}`, abrir);
        }
        if (avisar.length > 3) toast(`+${avisar.length - 3} conversas com novidade`, { duration: 5000 });
      },
    });
    return () => useCentral.setState({ ouvinte: null });
  }, [sessao.id, sessao.papel, times, ir]);
}
