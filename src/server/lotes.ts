/**
 * Lotes — o modo "Validade e lotes" de um estoque.
 *
 * O saldo de um material num estoque deste modo é a soma dos lotes dele. A
 * entrada diz o lote (e a validade); a saída consome o que vence primeiro
 * (FEFO — first expired, first out), a menos que a pessoa aponte um lote.
 * As funções aqui são puras; a rota em app.ts lê e grava.
 */

const DIA_MS = 24 * 60 * 60 * 1000;

export interface LoteBase {
  id: string;
  lote: string;
  /** AAAA-MM-DD, ou nulo (sem validade — vai por último). */
  validade: string | null;
  quantidade: number;
}

export interface Consumo {
  id: string;
  lote: string;
  quantidade: number;
}

export type Alocacao = { ok: true; consumos: Consumo[] } | { ok: false; erro: string };

/** Vence primeiro, sai primeiro. Sem validade fica para o fim; empate desempata pelo nome do lote. */
export function ordenarFefo<T extends LoteBase>(lotes: T[]): T[] {
  return [...lotes].sort((a, b) => {
    if (a.validade === b.validade) return a.lote.localeCompare(b.lote);
    if (a.validade === null) return 1;
    if (b.validade === null) return -1;
    return a.validade < b.validade ? -1 : 1;
  });
}

/**
 * Distribui uma saída pelos lotes. Com `loteId`, sai só daquele lote; sem,
 * FEFO. Recusa se não houver saldo suficiente — e diz quanto há.
 */
export function alocarSaida(lotes: LoteBase[], quantidade: number, loteId?: string | null): Alocacao {
  const q = Math.round(Number(quantidade) * 100) / 100;
  if (!Number.isFinite(q) || q <= 0) return { ok: false, erro: 'A quantidade precisa ser maior que zero.' };

  const candidatos = loteId ? lotes.filter((l) => l.id === loteId) : ordenarFefo(lotes.filter((l) => Number(l.quantidade) > 0));
  if (loteId && candidatos.length === 0) return { ok: false, erro: 'Lote não encontrado neste estoque.' };

  const disponivel = Math.round(candidatos.reduce((s, l) => s + Number(l.quantidade), 0) * 100) / 100;
  if (disponivel < q) {
    return { ok: false, erro: loteId ? `O lote ${candidatos[0].lote} tem só ${disponivel}.` : `Saldo insuficiente: há ${disponivel} somando todos os lotes.` };
  }

  const consumos: Consumo[] = [];
  let falta = q;
  for (const l of candidatos) {
    if (falta <= 0) break;
    const tira = Math.min(Number(l.quantidade), falta);
    if (tira <= 0) continue;
    consumos.push({ id: l.id, lote: l.lote, quantidade: Math.round(tira * 100) / 100 });
    falta = Math.round((falta - tira) * 100) / 100;
  }
  return { ok: true, consumos };
}

/** "L2026-03 (5), L2026-04 (2)" — para a justificativa no histórico. */
export function descreverConsumos(consumos: Consumo[]): string {
  return consumos.map((c) => `${c.lote} (${c.quantidade})`).join(', ');
}

export interface EntradaDeLote {
  lote: string;
  validade: string | null;
}

export type ValidacaoLote = { ok: true; lote: EntradaDeLote } | { ok: false; erro: string };

const DATA = /^\d{4}-\d{2}-\d{2}$/;

/** O lote e a validade que a entrada informa. Validade é opcional, mas se vier tem que ser data. */
export function validarLote(body: unknown): ValidacaoLote {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const lote = typeof b.lote === 'string' ? b.lote.trim() : '';
  if (lote.length < 1 || lote.length > 60) return { ok: false, erro: 'Informe o lote (até 60 caracteres).' };
  let validade: string | null = null;
  if (b.validade !== undefined && b.validade !== null && b.validade !== '') {
    const v = String(b.validade);
    if (!DATA.test(v) || Number.isNaN(new Date(`${v}T00:00:00`).getTime())) return { ok: false, erro: 'Validade inválida: use AAAA-MM-DD.' };
    validade = v;
  }
  return { ok: true, lote: { lote, validade } };
}

/** Situação de um lote hoje: vencido, vencendo (dentro do aviso), ok ou sem validade. */
export type SituacaoDoLote = 'vencido' | 'vencendo' | 'ok' | 'sem-validade';

export function situacaoDoLote(validade: string | null, diasAviso: number, agora: Date = new Date()): SituacaoDoLote {
  if (!validade) return 'sem-validade';
  const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate()).getTime();
  const fim = new Date(`${validade}T00:00:00`).getTime();
  if (fim < hoje) return 'vencido';
  if (fim <= hoje + diasAviso * DIA_MS) return 'vencendo';
  return 'ok';
}

/** Dias até vencer (negativo = vencido há N dias). */
export function diasParaVencer(validade: string, agora: Date = new Date()): number {
  const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate()).getTime();
  const fim = new Date(`${validade}T00:00:00`).getTime();
  return Math.round((fim - hoje) / DIA_MS);
}
