/**
 * Empréstimos — o modo "retirada por tempo limitado" de um estoque.
 *
 * Um aluno pega três bolas na coordenação de esportes e devolve daqui a
 * duas horas. Aqui ficam as regras puras: o que uma retirada precisa ter,
 * quando ela está atrasada, como se calcula o prazo. A rota em app.ts grava
 * e mexe no saldo.
 */

export const MAX_PRAZO_HORAS = 8760; // um ano
export const PRAZO_PADRAO_HORAS = 2;

export interface RetiradaLimpa {
  material_id: number;
  quantidade: number;
  tomador_nome: string;
  tomador_referencia: string | null;
  observacao: string | null;
  prazo_horas: number;
}

export type ValidacaoRetirada = { ok: true; retirada: RetiradaLimpa } | { ok: false; erro: string };

function texto(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/**
 * Valida o corpo de uma retirada. O prazo vem em horas: o que a pessoa
 * digitou, ou o padrão do estoque quando ela não mexeu.
 */
export function validarRetirada(body: unknown, prazoPadraoHoras: number | null): ValidacaoRetirada {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;

  const material_id = Number(b.material_id);
  if (!Number.isInteger(material_id) || material_id <= 0) return { ok: false, erro: 'Escolha o material.' };

  const quantidade = Number(b.quantidade);
  if (!Number.isFinite(quantidade) || quantidade <= 0) return { ok: false, erro: 'A quantidade precisa ser maior que zero.' };

  const tomador_nome = texto(b.tomador_nome);
  if (tomador_nome.length < 2 || tomador_nome.length > 80) return { ok: false, erro: 'Informe quem está retirando (2 a 80 caracteres).' };

  const referencia = texto(b.tomador_referencia);
  if (referencia.length > 40) return { ok: false, erro: 'Referência longa demais (até 40 caracteres).' };

  const observacao = texto(b.observacao);
  if (observacao.length > 300) return { ok: false, erro: 'Observação longa demais (até 300 caracteres).' };

  const prazoInformado = b.prazo_horas === undefined || b.prazo_horas === null || b.prazo_horas === '' ? null : Number(b.prazo_horas);
  const prazo_horas = prazoInformado ?? prazoPadraoHoras ?? PRAZO_PADRAO_HORAS;
  if (!Number.isFinite(prazo_horas) || prazo_horas <= 0 || prazo_horas > MAX_PRAZO_HORAS) {
    return { ok: false, erro: `O prazo deve ser de 1 a ${MAX_PRAZO_HORAS} horas.` };
  }

  return {
    ok: true,
    retirada: {
      material_id,
      quantidade: Math.round(quantidade * 100) / 100,
      tomador_nome,
      tomador_referencia: referencia || null,
      observacao: observacao || null,
      prazo_horas,
    },
  };
}

/** Quando a retirada vence: agora + prazo. Aceita fração de hora (1,5 h = 90 min). */
export function prazoEm(prazoHoras: number, agora: Date = new Date()): Date {
  return new Date(agora.getTime() + prazoHoras * 60 * 60 * 1000);
}

export interface EmprestimoBase {
  prazo_em: string;
  devolvido_em: string | null;
}

/** Pendente é o que ainda não voltou. Atrasado é pendente com o prazo vencido. */
export function estaPendente(e: EmprestimoBase): boolean {
  return !e.devolvido_em;
}

export function estaAtrasado(e: EmprestimoBase, agora: Date = new Date()): boolean {
  return estaPendente(e) && new Date(e.prazo_em).getTime() < agora.getTime();
}

/** "2 h", "1 h 30 min", "45 min", "3 dias" — o prazo como a pessoa lê. */
export function formatarHoras(horas: number): string {
  if (horas >= 48 && Number.isInteger(horas / 24)) return `${horas / 24} dias`;
  const h = Math.floor(horas);
  const min = Math.round((horas - h) * 60);
  if (h === 0) return `${min} min`;
  if (min === 0) return `${h} h`;
  return `${h} h ${min} min`;
}
