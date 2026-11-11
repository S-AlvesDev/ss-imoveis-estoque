/**
 * Quando o silêncio de uma instância deixa de ser normal.
 *
 * O caso que motivou isto: a instância de um cliente parou de entregar às
 * 15h28 e ninguém soube até a reclamação, horas depois. A conexão dizia
 * "conectada" o tempo todo, e o vigia que existia só olhava o estado — não
 * tinha o que ver. Para essa falha o estado mente; o sinal honesto é o
 * silêncio.
 *
 * Mas silêncio normal existe, e um aviso que toca à toa é um aviso que se
 * aprende a ignorar. Então duas regras: só contam as horas de expediente, e
 * o limite sai do movimento da própria empresa.
 *
 * Mora em `shared` porque tanto o vigia (servidor) quanto o diagnóstico
 * (tela) precisam dar a mesma resposta — não adianta o painel dizer que
 * está tudo bem enquanto o e-mail de alerta sai.
 */

/** America/Sao_Paulo, em minutos. O Brasil não tem horário de verão desde 2019. */
const FUSO_BR_MIN = -3 * 60;
/** O expediente que se assume para contar silêncio: segunda a sábado, 8h às 20h. */
const ABRE_AS = 8;
const FECHA_AS = 20;
const HORA_MS = 3600 * 1000;
export const DIA_MS = 24 * HORA_MS;

/**
 * Horas de expediente entre dois instantes. Madrugada e domingo não contam —
 * é o que impede o aviso de disparar porque a empresa estava fechada.
 */
export function horasUteisEntre(de: Date, ate: Date): number {
  const fim = ate.getTime() + FUSO_BR_MIN * 60_000;
  // Nada além de 60 dias interessa: o que passa disso já estourou qualquer limite.
  const inicio = Math.max(de.getTime() + FUSO_BR_MIN * 60_000, fim - 60 * DIA_MS);
  if (!(fim > inicio)) return 0;
  let total = 0;
  for (let dia = Math.floor(inicio / DIA_MS) * DIA_MS; dia < fim; dia += DIA_MS) {
    if (new Date(dia).getUTCDay() === 0) continue; // domingo
    const a = Math.max(inicio, dia + ABRE_AS * HORA_MS);
    const b = Math.min(fim, dia + FECHA_AS * HORA_MS);
    if (b > a) total += b - a;
  }
  return total / HORA_MS;
}

/**
 * Nunca avisa antes disto, por mais parada que a empresa esteja.
 *
 * Era 3 h, escolhido quando eu ainda achava que o silêncio podia ser
 * oscilação. Não é: quando acontece, é uma instância que ficou conectada e
 * surda, e só volta com um QR novo. Três horas de expediente é meio dia de
 * atendimento perdido — numa empresa que recebe dez mensagens por hora, meia
 * hora calada já é certeza suficiente para incomodar alguém.
 */
export const SILENCIO_MINIMO_H = 0.5;
/** Nem depois disto, por mais movimentada que seja. */
export const SILENCIO_MAXIMO_H = 24;
/** Horas de expediente em 14 dias: 12 por dia, 12 dias (sem os dois domingos). */
const HORAS_UTEIS_EM_14_DIAS = 144;
/**
 * Quantas mensagens deveriam ter chegado no intervalo para que o silêncio
 * deixe de ser azar e passe a ser defeito. Seis é um número que, no ritmo
 * normal da empresa, não se perde por acaso.
 */
export const MENSAGENS_QUE_FALTARAM = 6;

/**
 * O limite de silêncio desta empresa, em horas úteis, a partir do quanto ela
 * costuma receber. Quem recebe 2 por hora é cobrado em 3h; quem recebe 1 a
 * cada 2 horas, em 12h; quem mal recebe não é cobrado.
 */
export function limiteDeSilencio(entradasEm14Dias: number): number {
  if (entradasEm14Dias <= 0) return Infinity;
  const porHoraUtil = entradasEm14Dias / HORAS_UTEIS_EM_14_DIAS;
  return Math.min(SILENCIO_MAXIMO_H, Math.max(SILENCIO_MINIMO_H, MENSAGENS_QUE_FALTARAM / porHoraUtil));
}

/**
 * Esta conexão está calada além do normal DELA?
 *
 * Mesma conta no servidor (que manda o e-mail) e na tela (que avisa quem
 * está atendendo): os dois não podem discordar. O limite vem guardado na
 * conexão, recalculado uma vez por dia — a tela não consulta nada.
 */
export function silencioAnormal(
  c: { ultimo_evento_em?: string | null; limite_silencio_h?: number | null } | null | undefined,
  agora: Date = new Date(),
): { horas: number; limite: number; anormal: boolean } | null {
  if (!c?.ultimo_evento_em || c.limite_silencio_h == null || !Number.isFinite(Number(c.limite_silencio_h))) return null;
  const limite = Math.max(SILENCIO_MINIMO_H, Number(c.limite_silencio_h));
  const horas = horasUteisEntre(new Date(c.ultimo_evento_em), agora);
  return { horas, limite, anormal: horas >= limite };
}

/** "40 min", "2,5 h" — horas de expediente, do jeito que se fala. */
export function duracaoUtil(h: number): string {
  if (h < 1) return `${Math.round(h * 60)} min`;
  if (h < 24) return `${h.toFixed(1).replace('.', ',')} h`;
  return 'mais de um dia';
}
