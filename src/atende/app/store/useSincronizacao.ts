import { useEffect, useRef } from 'react';
import { useCentral } from './central';
import { inscricaoLocal } from '../notificacoes';

/**
 * O relógio do sync.
 *
 * Roda no Shell — em qualquer tela a pessoa continua presente (o sync é o
 * batimento) e Central e Supervisão leem o mesmo estado (useCentral).
 *
 * O ritmo não é fixo, e a razão é cota: a cada tique saem consultas ao
 * banco, e cada consulta vira uma linha de log na Supabase. Com 4 segundos
 * cravados o dia inteiro, uma aba aberta sozinha gerava dezenas de milhares
 * de consultas por dia sem nada acontecer — foi isso, e não o volume de
 * atendimento, que estourou a cota.
 *
 * Então: 4 segundos enquanto há movimento, e vai afrouxando no silêncio.
 * Qualquer novidade traz de volta para 4 na hora, e voltar à aba também —
 * de modo que a pessoa atendendo nunca sente a diferença, e a aba esquecida
 * aberta na mesa de alguém para de custar.
 */

/** Com movimento, ou logo depois dele. */
const RAPIDO_MS = 4_000;
/**
 * Depois de ~30 s sem nada — e é até onde se afrouxa com a aba à vista.
 *
 * Cheguei a pôr um terceiro degrau de 12 s. Economizava pouco a mais e
 * custava o que não devia: alguém olhando a tela à espera de um cliente
 * veria a mensagem 8 segundos depois do que vê hoje. A maior parte da
 * economia veio de cortar as consultas por tique, que não muda nada para
 * quem usa; esticar o relógio até doer seria cobrar da pessoa errada.
 */
const CALMO_MS = 8_000;
/**
 * Aba escondida e SEM push: ninguém está olhando, mas este relógio é a única
 * coisa que faz a notificação aparecer (notificarDaPagina só dispara com a aba
 * escondida). Por isso 20 s, e não mais.
 */
const ESCONDIDO_MS = 20_000;
/**
 * Aba escondida e COM push: o service worker já entrega mensagem nova e
 * cutucada — `cutucar()`, em server/conversas.ts, manda as duas coisas. O
 * relógio vira rede de segurança, e aí não precisa ser de 20 s.
 *
 * Não esticamos mais que isto porque uma cutucada vale 2 minutos
 * (CUTUCADA_VALE_MS). Com 60 s, mesmo que o push falhe, o alarme ainda chega
 * pelo delta dentro da validade — a trava do teste continua valendo, só que
 * garantida por dois caminhos em vez de um.
 */
const ESCONDIDO_COM_PUSH_MS = 60_000;
const TIQUES_ATE_CALMO = 8;
/** Presença e conexão mudam devagar; não precisam vir a cada tique. */
const COMPLETO_A_CADA_MS = 30_000;

export function intervaloDoTique(vazios: number, escondido: boolean, temPush = false): number {
  if (escondido) return temPush ? ESCONDIDO_COM_PUSH_MS : ESCONDIDO_MS;
  return vazios >= TIQUES_ATE_CALMO ? CALMO_MS : RAPIDO_MS;
}

export function useSincronizacao(opcoes: { carregarLista?: boolean } = {}) {
  const carregarLista = useCentral((s) => s.carregarLista);
  const sincronizar = useCentral((s) => s.sincronizar);
  const comLista = opcoes.carregarLista !== false;

  const vazios = useRef(0);
  const ultimoCompleto = useRef(0);
  const ocupado = useRef(false);

  useEffect(() => {
    if (comLista) void carregarLista();
    let ativo = true;
    let relogio: number | undefined;
    // Enquanto não se sabe, trata como sem push: erra para o lado de avisar.
    // Relido ao voltar para a aba, para quem acabou de ativar não precisar
    // recarregar a página (inscricaoLocal guarda o estado e se atualiza ao
    // ativar e ao cancelar).
    let temPush = false;
    const lerPush = () => {
      void inscricaoLocal()
        .then((i) => {
          temPush = Boolean(i);
        })
        .catch(() => {
          /* navegador sem suporte a push: segue sem */
        });
    };
    lerPush();

    async function tique() {
      if (!ativo || ocupado.current) return agendar();
      ocupado.current = true;
      try {
        const completo = Date.now() - ultimoCompleto.current >= COMPLETO_A_CADA_MS;
        const houveNovidade = await sincronizar(completo);
        // Só depois de dar certo: um completo que falhou não pode adiar o
        // próximo por mais 30 s — o batimento de presença vai nele.
        if (completo) ultimoCompleto.current = Date.now();
        vazios.current = houveNovidade ? 0 : vazios.current + 1;
      } catch {
        // O próximo tique tenta de novo. Falha não acelera nem desacelera:
        // acelerar viraria martelada em servidor fora do ar.
      } finally {
        ocupado.current = false;
      }
      agendar();
    }

    function agendar() {
      if (!ativo) return;
      window.clearTimeout(relogio);
      relogio = window.setTimeout(tique, intervaloDoTique(vazios.current, document.hidden, temPush));
    }

    /** Voltou para a aba: a pessoa quer ver agora, e o ritmo volta ao rápido. */
    function acordar() {
      lerPush();
      if (document.hidden) return agendar();
      vazios.current = 0;
      window.clearTimeout(relogio);
      void tique();
    }

    /**
     * Mexeu no painel — clicou, digitou, rolou a lista: está trabalhando.
     * Volta para o ritmo rápido sem forçar um tique, que seria uma consulta
     * a cada clique. Só desfaz o afrouxamento.
     */
    function mexeu() {
      vazios.current = 0;
    }

    void tique();
    document.addEventListener('visibilitychange', acordar);
    window.addEventListener('focus', acordar);
    for (const evento of ['pointerdown', 'keydown', 'wheel'] as const) {
      window.addEventListener(evento, mexeu, { passive: true });
    }
    return () => {
      ativo = false;
      window.clearTimeout(relogio);
      document.removeEventListener('visibilitychange', acordar);
      window.removeEventListener('focus', acordar);
      for (const evento of ['pointerdown', 'keydown', 'wheel'] as const) window.removeEventListener(evento, mexeu);
    };
  }, [carregarLista, sincronizar, comLista]);
}
