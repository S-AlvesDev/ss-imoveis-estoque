/**
 * De quanto em quanto tempo o sync bate.
 *
 * O PROBLEMA QUE ISTO RESOLVE
 * O relógio era fixo: 4 s com a aba visível, 15 s escondida, para sempre.
 * Uma aba de atendente aberta o dia inteiro fazia ~11 mil chamadas por dia —
 * e uma aba esquecida no fim de semana fazia 11 mil sem ninguém olhando.
 * Em função sem servidor isso é CPU paga por invocação, e o custo não tinha
 * relação nenhuma com o movimento real do atendimento.
 *
 * COMO FICOU
 * Com a aba na frente, o ritmo acompanha o que está acontecendo: 4 s enquanto
 * chega coisa, afrouxando até 20 s depois de um tempo de silêncio — e voltando
 * a 4 s no instante em que chega qualquer novidade.
 *
 * Com a aba escondida, quem avisa depende do push:
 *   - com push, o service worker recebe e acorda a tela; o relógio aqui é só
 *     rede de segurança, de 5 em 5 minutos;
 *   - sem push, ESTE relógio é a única coisa que faz a notificação do sistema
 *     aparecer (ver notificarDaPagina). Por isso ele continua batendo, a cada
 *     minuto. Parar aqui deixaria o atendente sem aviso de mensagem nova.
 *
 * Puro de propósito: a decisão de ritmo é a regra, e dá para testá-la sozinha.
 */

/** Com a aba na frente e movimento acontecendo. */
export const ATIVO_MS = 4_000;

/**
 * Com a aba na frente e silêncio: um degrau por tique vazio, até o teto.
 * O teto é o atraso máximo para uma mensagem aparecer sozinha na tela de
 * quem está olhando — 20 s. Subir isto economiza mais e demora mais.
 */
export const OCIOSO_MS = [8_000, 15_000, 20_000];

/** Aba escondida, sem push: o relógio é quem dispara a notificação do sistema. */
export const ESCONDIDO_SEM_PUSH_MS = 60_000;

/** Aba escondida, com push: o service worker avisa; isto é só rede de segurança. */
export const ESCONDIDO_COM_PUSH_MS = 300_000;

export interface EstadoDoRitmo {
  /** `document.hidden`. */
  escondido: boolean;
  /** Este navegador tem inscrição de push ativa. */
  temPush: boolean;
  /** Quantos tiques seguidos voltaram sem nada. Zero = acabou de chegar novidade. */
  tiquesVazios: number;
}

/** Quanto esperar até o próximo sync. */
export function intervaloDoSync({ escondido, temPush, tiquesVazios }: EstadoDoRitmo): number {
  if (escondido) return temPush ? ESCONDIDO_COM_PUSH_MS : ESCONDIDO_SEM_PUSH_MS;
  if (tiquesVazios <= 0) return ATIVO_MS;
  return OCIOSO_MS[Math.min(tiquesVazios, OCIOSO_MS.length) - 1];
}
