import { useEffect, useRef } from 'react';
import { useCentral } from './central';

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
/** Depois de ~30 s sem nada. */
const CALMO_MS = 8_000;
/** Depois de ~3 min sem nada. */
const PARADO_MS = 12_000;
/** Aba escondida: ninguém está olhando. */
const ESCONDIDO_MS = 20_000;
const TIQUES_ATE_CALMO = 8;
const TIQUES_ATE_PARADO = 30;
/** Presença e conexão mudam devagar; não precisam vir a cada tique. */
const COMPLETO_A_CADA_MS = 30_000;

export function intervaloDoTique(vazios: number, escondido: boolean): number {
  if (escondido) return ESCONDIDO_MS;
  if (vazios >= TIQUES_ATE_PARADO) return PARADO_MS;
  if (vazios >= TIQUES_ATE_CALMO) return CALMO_MS;
  return RAPIDO_MS;
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
      relogio = window.setTimeout(tique, intervaloDoTique(vazios.current, document.hidden));
    }

    /** Voltou para a aba: a pessoa quer ver agora, e o ritmo volta ao rápido. */
    function acordar() {
      if (document.hidden) return agendar();
      vazios.current = 0;
      window.clearTimeout(relogio);
      void tique();
    }

    void tique();
    document.addEventListener('visibilitychange', acordar);
    window.addEventListener('focus', acordar);
    return () => {
      ativo = false;
      window.clearTimeout(relogio);
      document.removeEventListener('visibilitychange', acordar);
      window.removeEventListener('focus', acordar);
    };
  }, [carregarLista, sincronizar, comLista]);
}
