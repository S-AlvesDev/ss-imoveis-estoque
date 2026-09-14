/**
 * O recibo (não fiscal) de um pagamento: os mesmos dados no e-mail (servidor)
 * e no PDF (navegador). Puro; quem chama diz quem é o emitente.
 */
import { NOME_DO_PLANO, NOME_DO_CICLO, NOME_DO_METODO, type Plano, type Ciclo, type Metodo } from './planos';
import { PRODUTO } from './produto';

/** O que um pagamento precisa ter para virar recibo (o servidor e a tela têm mais que isso). */
export interface PagamentoParaRecibo {
  id: string;
  data: string;
  valor: number | string;
  metodo: Metodo;
  plano: Plano | null;
  ciclo: Ciclo | null;
  periodo_de: string | null;
  periodo_ate: string | null;
  mp_payment_id: string | null;
  mp_authorized_payment_id?: string | null;
  pagador: { nome?: string; doc?: string; email?: string } | Record<string, unknown> | null;
}

export interface DadosDoRecibo {
  numero: string;
  emitente: string;
  pagador: { nome: string; doc: string | null; email: string | null };
  descricao: string;
  valor: number;
  metodo: string;
  data: string;
  transacao: string | null;
}

const fmtData = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: 'America/Sao_Paulo' });
const fmtDataHora = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' });

/** "R-2026-0914-7A3F" — curto, legível, único por pagamento. */
export function numeroDoRecibo(pg: Pick<PagamentoParaRecibo, 'id' | 'data'>): string {
  const d = new Date(pg.data);
  const ano = d.getUTCFullYear();
  const mes = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dia = String(d.getUTCDate()).padStart(2, '0');
  return `R-${ano}-${mes}${dia}-${pg.id.replace(/-/g, '').slice(-4).toUpperCase()}`;
}

/** O que descreve o pagamento em uma linha. */
export function descricaoDoRecibo(pg: PagamentoParaRecibo): string {
  const plano = pg.plano ? `Plano ${NOME_DO_PLANO[pg.plano]}` : 'Assinatura';
  const ciclo = pg.ciclo ? ` (${NOME_DO_CICLO[pg.ciclo].toLowerCase()})` : '';
  const periodo = pg.periodo_de && pg.periodo_ate ? ` — período de ${fmtData.format(new Date(pg.periodo_de))} a ${fmtData.format(new Date(pg.periodo_ate))}` : '';
  return `${plano}${ciclo} do ${PRODUTO.nome}${periodo}`;
}

export function formatarDoc(doc: string | null | undefined): string | null {
  const d = String(doc ?? '').replace(/\D/g, '');
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  return d || null;
}

/** CPF/CNPJ com o começo e o fim escondidos: `***.456.789-**`, `**.345.678/0001-**`. */
export function mascararDoc(doc: string | null | undefined): string | null {
  const f = formatarDoc(doc);
  if (!f) return null;
  const d = f.replace(/\D/g, '');
  if (d.length === 11) return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`;
  if (d.length === 14) return `**.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-**`;
  return f;
}

/** "Stok Aí · CPF ***.456.789-**" — quem assina o recibo, sem expor o documento inteiro. */
export function linhaDoEmitente(nome: string, doc: string | null | undefined): string {
  const m = mascararDoc(doc);
  if (!m) return nome;
  const tipo = String(doc ?? '').replace(/\D/g, '').length === 14 ? 'CNPJ' : 'CPF';
  return `${nome} · ${tipo} ${m}`;
}

/** Tudo que o recibo mostra, tirado do pagamento. */
export function dadosDoRecibo(pg: PagamentoParaRecibo, empresa: string, emitente: string): DadosDoRecibo {
  const pagador = (pg.pagador ?? {}) as { nome?: string; doc?: string; email?: string };
  return {
    numero: numeroDoRecibo(pg),
    emitente,
    pagador: { nome: (pagador.nome && pagador.nome.trim()) || empresa, doc: formatarDoc(pagador.doc), email: pagador.email?.trim() || null },
    descricao: descricaoDoRecibo(pg),
    valor: Number(pg.valor),
    metodo: NOME_DO_METODO[pg.metodo] ?? pg.metodo,
    data: fmtDataHora.format(new Date(pg.data)),
    transacao: pg.mp_payment_id ?? pg.mp_authorized_payment_id ?? null,
  };
}
