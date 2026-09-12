/**
 * Patrimônio — o modo em que cada unidade é um item com número próprio.
 *
 * O material é o modelo ("Notebook Dell Latitude 5420"); o item é a
 * unidade física (PAT-0042, série ABC123), com estado, responsável e local.
 * Aqui ficam as regras puras: o que um item precisa ter e que transições
 * de estado existem. A rota em app.ts grava e mantém o saldo do modelo
 * igual ao número de itens não baixados.
 */

export type EstadoDoItem = 'disponivel' | 'em_uso' | 'manutencao' | 'baixado';
export type EventoDoItem = 'alocacao' | 'devolucao' | 'manutencao' | 'retorno' | 'baixa';

export interface ItemLimpo {
  material_id: number;
  codigo: string;
  serie: string | null;
  local: string | null;
  observacao: string | null;
  adquirido_em: string | null;
  valor: number | null;
}

export type ValidacaoItem = { ok: true; item: ItemLimpo } | { ok: false; erro: string };

function texto(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

const DATA = /^\d{4}-\d{2}-\d{2}$/;

export function validarItem(body: unknown): ValidacaoItem {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;

  const material_id = Number(b.material_id);
  if (!Number.isInteger(material_id) || material_id <= 0) return { ok: false, erro: 'Escolha o modelo (material).' };

  const codigo = texto(b.codigo);
  if (codigo.length < 1 || codigo.length > 40) return { ok: false, erro: 'Informe o número de patrimônio (até 40 caracteres).' };

  const serie = texto(b.serie);
  if (serie.length > 80) return { ok: false, erro: 'Série longa demais (até 80 caracteres).' };

  const local = texto(b.local);
  if (local.length > 80) return { ok: false, erro: 'Local longo demais (até 80 caracteres).' };

  const observacao = texto(b.observacao);
  if (observacao.length > 300) return { ok: false, erro: 'Observação longa demais (até 300 caracteres).' };

  let adquirido_em: string | null = null;
  if (b.adquirido_em !== undefined && b.adquirido_em !== null && b.adquirido_em !== '') {
    const v = String(b.adquirido_em);
    if (!DATA.test(v)) return { ok: false, erro: 'Data de aquisição inválida: use AAAA-MM-DD.' };
    adquirido_em = v;
  }

  let valor: number | null = null;
  if (b.valor !== undefined && b.valor !== null && b.valor !== '') {
    valor = Number(b.valor);
    if (!Number.isFinite(valor) || valor < 0) return { ok: false, erro: 'Valor inválido.' };
    valor = Math.round(valor * 100) / 100;
  }

  return { ok: true, item: { material_id, codigo, serie: serie || null, local: local || null, observacao: observacao || null, adquirido_em, valor } };
}

/**
 * De que estado para qual, com cada evento. Baixa é o fim: item baixado não
 * volta, e a lista diz isso em vez de deixar a rota adivinhar.
 */
const TRANSICOES: Record<EventoDoItem, { de: EstadoDoItem[]; para: EstadoDoItem }> = {
  alocacao: { de: ['disponivel'], para: 'em_uso' },
  devolucao: { de: ['em_uso'], para: 'disponivel' },
  manutencao: { de: ['disponivel', 'em_uso'], para: 'manutencao' },
  retorno: { de: ['manutencao'], para: 'disponivel' },
  baixa: { de: ['disponivel', 'em_uso', 'manutencao'], para: 'baixado' },
};

export const EVENTOS: readonly EventoDoItem[] = ['alocacao', 'devolucao', 'manutencao', 'retorno', 'baixa'];

export function ehEvento(s: unknown): s is EventoDoItem {
  return typeof s === 'string' && (EVENTOS as readonly string[]).includes(s);
}

export type Transicao = { ok: true; para: EstadoDoItem } | { ok: false; erro: string };

const NOME: Record<EstadoDoItem, string> = { disponivel: 'disponível', em_uso: 'em uso', manutencao: 'em manutenção', baixado: 'baixado' };

export function transicionar(estadoAtual: EstadoDoItem, evento: EventoDoItem): Transicao {
  const t = TRANSICOES[evento];
  if (!t.de.includes(estadoAtual)) {
    if (estadoAtual === 'baixado') return { ok: false, erro: 'Item baixado não muda mais de estado.' };
    return { ok: false, erro: `Um item ${NOME[estadoAtual]} não pode receber "${evento}".` };
  }
  return { ok: true, para: t.para };
}

export interface EventoLimpo {
  tipo: EventoDoItem;
  para_nome: string | null;
  para_referencia: string | null;
  detalhe: string | null;
}

export type ValidacaoEvento = { ok: true; evento: EventoLimpo } | { ok: false; erro: string };

/** Alocação precisa dizer para quem; os outros eventos aceitam só um detalhe. */
export function validarEvento(body: unknown): ValidacaoEvento {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  if (!ehEvento(b.tipo)) return { ok: false, erro: 'Evento inválido.' };
  const para_nome = texto(b.para_nome);
  const para_referencia = texto(b.para_referencia);
  const detalhe = texto(b.detalhe);
  if (b.tipo === 'alocacao' && (para_nome.length < 2 || para_nome.length > 80)) return { ok: false, erro: 'Informe para quem o item vai (2 a 80 caracteres).' };
  if (para_referencia.length > 40) return { ok: false, erro: 'Referência longa demais (até 40 caracteres).' };
  if (detalhe.length > 300) return { ok: false, erro: 'Detalhe longo demais (até 300 caracteres).' };
  return {
    ok: true,
    evento: { tipo: b.tipo, para_nome: b.tipo === 'alocacao' ? para_nome : null, para_referencia: b.tipo === 'alocacao' ? para_referencia || null : null, detalhe: detalhe || null },
  };
}
