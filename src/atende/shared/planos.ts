/**
 * Os planos do Atende Aí — o catálogo público, no mesmo formato do Stok Aí
 * (src/shared/planos.ts), para a cobrança reaproveitar o mesmo mecanismo.
 *
 * Preços da tabela comercial da SEVLA INFINITY (PDF de 2026-09-18): Essencial
 * 299,90 · Profissional 599,90 · Empresarial 1.199,90 por mês. `preco: null`
 * voltaria a mostrar "R$ XX/mês". Os limites e recursos abaixo são só do que o
 * produto FAZ hoje — nada é vendido antes de existir.
 */

export type PlanoAtende = 'essencial' | 'profissional' | 'empresarial';
export const PLANOS_ATENDE: readonly PlanoAtende[] = ['essencial', 'profissional', 'empresarial'];

export type CicloAtende = 'mensal' | 'anual';
/** Dias de avaliação com tudo liberado — igual ao Stok Aí (a regra é a mesma função). */
export const AVALIACAO_DIAS_ATENDE = 7;
/** Meses de desconto no anual — igual ao Stok Aí. */
export const MESES_GRATIS_NO_ANUAL_ATENDE = 2;

/** Os recursos que existem no produto hoje (o gating da Fase 3 usa estes nomes). */
export type RecursoAtende =
  /** Triagem por IA: assunto, intenção, setor, prioridade, resumo, resposta automática, esclarecimento, fora do horário. */
  | 'triagem-ia'
  /** Supervisão em tempo real: fila, sem resposta, presença, orientar, assumir, transferir, corrigir a triagem. */
  | 'supervisao'
  /** Dashboard por período: conversas, leads, conversão, tempos, por pessoa e por setor. */
  | 'dashboard'
  /** Notificações por push no celular e no computador. */
  | 'push'
  /** Leads no funil, com sugestão da IA. */
  | 'leads'
  /** Entrar com a conta do Stok Aí (a ponte). */
  | 'ponte-stok';

export type LimiteAtende = 'atendentes' | 'numeros' | 'times' | 'triagens_por_mes';

export interface DefinicaoDoPlanoAtende {
  id: PlanoAtende;
  nome: string;
  /** Em reais, por mês. `null` = ainda não definido (a tela mostra "R$ XX"). */
  preco: number | null;
  publico: string;
  /** `null` = ilimitado. */
  limites: Record<LimiteAtende, number | null>;
  recursos: readonly RecursoAtende[];
  /** O que o cartão lista, na ordem — só o que existe. */
  destaques: readonly string[];
  suporte: string;
  destaque?: boolean;
}

/** O que TODO plano tem, porque é o produto (não é diferencial): aparece uma vez, fora dos cartões. */
export const BASE_DE_TODO_PLANO: readonly string[] = [
  'WhatsApp da própria empresa, conectado por QR (1 número)',
  'Central com texto, imagem, vídeo, áudio, documentos, localização e contato',
  'Notas internas, etiquetas, ficha e histórico do cliente',
  'Times (setores) e três papéis: administrador, supervisor e atendente',
  'Auditoria de cada conversa (quem fez o quê)',
  'App instalável no celular, com aviso de nova mensagem na aba',
];

export const DEFINICOES_ATENDE: Record<PlanoAtende, DefinicaoDoPlanoAtende> = {
  essencial: {
    id: 'essencial',
    nome: 'Essencial',
    preco: 299.9,
    publico: 'Para começar a atender pelo sistema',
    limites: { atendentes: 3, numeros: 1, times: 2, triagens_por_mes: null },
    recursos: ['leads', 'ponte-stok'],
    destaques: ['Até 3 atendentes', '1 número de WhatsApp', 'Até 2 setores', 'Fila e atribuição manual (assumir e transferir)', 'Leads no funil', 'Entrar com a conta do Stok Aí'],
    suporte: 'Por e-mail',
  },
  profissional: {
    id: 'profissional',
    nome: 'Profissional',
    preco: 599.9,
    publico: 'Para equipes que atendem o dia inteiro',
    limites: { atendentes: 10, numeros: 1, times: null, triagens_por_mes: null },
    recursos: ['triagem-ia', 'leads', 'push', 'supervisao', 'ponte-stok'],
    destaques: ['Até 10 atendentes', '1 número de WhatsApp', 'Setores ilimitados', 'Triagem por IA: setor, prioridade, resumo e primeira resposta', 'Supervisão em tempo real: orientar, assumir, transferir, corrigir', 'Notificações no celular (push)', 'Tudo do Essencial'],
    suporte: 'Prioritário',
    destaque: true,
  },
  empresarial: {
    id: 'empresarial',
    nome: 'Empresarial',
    preco: 1199.9,
    publico: 'Para operações maiores, com metas',
    limites: { atendentes: null, numeros: 1, times: null, triagens_por_mes: null },
    recursos: ['triagem-ia', 'leads', 'push', 'supervisao', 'dashboard', 'ponte-stok'],
    destaques: ['Atendentes ilimitados', '1 número de WhatsApp', 'Dashboard: leads, conversão, tempo de resposta, por pessoa e por setor', 'Simulador da triagem e ajuste fino por setor', 'Tudo do Profissional', 'Acesso antecipado a novos recursos'],
    suporte: 'Prioridade máxima',
  },
};

/** Preço por mês no ciclo escolhido; nulo enquanto não definido. */
export function precoAtende(plano: PlanoAtende, ciclo: CicloAtende): number | null {
  const p = DEFINICOES_ATENDE[plano].preco;
  if (p === null) return null;
  return ciclo === 'anual' ? Math.round(((p * (12 - MESES_GRATIS_NO_ANUAL_ATENDE)) / 12) * 100) / 100 : p;
}

/** O que se paga por ciclo (a cobrança): mensal é o preço; anual é 12 meses menos os grátis, de uma vez. Nulo enquanto não definido. */
export function precoDoPeriodoAtende(plano: PlanoAtende, ciclo: CicloAtende): number | null {
  const p = DEFINICOES_ATENDE[plano].preco;
  if (p === null) return null;
  return ciclo === 'anual' ? Math.round(p * (12 - MESES_GRATIS_NO_ANUAL_ATENDE) * 100) / 100 : p;
}

/** O texto do preço: "R$ 199,90" ou o placeholder "R$ XX". */
export function precoFormatado(plano: PlanoAtende, ciclo: CicloAtende): string {
  const p = precoAtende(plano, ciclo);
  return p === null ? 'R$ XX' : p.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// ---------------------------------------------------------------------------
//  O plano em vigor e o que ele libera (o servidor e as telas perguntam aqui)
// ---------------------------------------------------------------------------

/** O plano que vale hoje: um dos três, ou a avaliação (7 dias com tudo liberado). */
export type PlanoAtendeEfetivo = PlanoAtende | 'avaliacao';

export const NOME_DO_PLANO_ATENDE: Record<PlanoAtendeEfetivo, string> = { essencial: 'Essencial', profissional: 'Profissional', empresarial: 'Empresarial', avaliacao: 'Avaliação' };

export function ehPlanoAtende(s: unknown): s is PlanoAtende {
  return typeof s === 'string' && (PLANOS_ATENDE as readonly string[]).includes(s);
}

export function ehCicloAtende(s: unknown): s is CicloAtende {
  return s === 'mensal' || s === 'anual';
}

/** A definição que vale: a avaliação usa a do Empresarial, como no Stok Aí. */
export function definicaoAtende(plano: PlanoAtendeEfetivo): DefinicaoDoPlanoAtende {
  return DEFINICOES_ATENDE[plano === 'avaliacao' ? 'empresarial' : plano];
}

export function planoAtendeLibera(plano: PlanoAtendeEfetivo, recurso: RecursoAtende): boolean {
  return definicaoAtende(plano).recursos.includes(recurso);
}

/** O limite do plano para uma contagem. `null` = sem limite. */
export function limiteAtende(plano: PlanoAtendeEfetivo, limite: LimiteAtende): number | null {
  return definicaoAtende(plano).limites[limite];
}

/** Com `atual` já existentes, cabe mais um? */
export function cabeMaisUmNoAtende(plano: PlanoAtendeEfetivo, limite: LimiteAtende, atual: number): boolean {
  const max = limiteAtende(plano, limite);
  return max === null || atual < max;
}

/** O plano mais barato que tem o recurso. */
export function planoAtendeMinimoPara(recurso: RecursoAtende): PlanoAtende {
  return PLANOS_ATENDE.find((p) => DEFINICOES_ATENDE[p].recursos.includes(recurso)) ?? 'empresarial';
}

/** O plano mais barato cujo limite comporta `necessario`. `null` se nenhum. */
export function planoAtendeMinimoParaLimite(limite: LimiteAtende, necessario: number): PlanoAtende | null {
  return PLANOS_ATENDE.find((p) => cabeMaisUmNoAtende(p, limite, necessario - 1)) ?? null;
}

const NOME_DO_RECURSO: Record<RecursoAtende, string> = {
  'triagem-ia': 'Triagem por IA',
  supervisao: 'Supervisão em tempo real',
  dashboard: 'Dashboard',
  push: 'Notificações no celular (push)',
  leads: 'Leads no funil',
  'ponte-stok': 'Entrar com a conta do Stok Aí',
};

const ROTULO_DO_LIMITE: Record<LimiteAtende, [singular: string, plural: string]> = {
  atendentes: ['pessoa na equipe', 'pessoas na equipe'],
  numeros: ['número de WhatsApp', 'números de WhatsApp'],
  times: ['setor', 'setores'],
  triagens_por_mes: ['triagem por mês', 'triagens por mês'],
};

function descreverLimite(limite: LimiteAtende, max: number | null): string {
  const [um, varios] = ROTULO_DO_LIMITE[limite];
  if (max === null) return `${varios} sem limite`;
  return max === 1 ? `1 ${um}` : `até ${max} ${varios}`;
}

/** A frase do 402 quando o plano não tem o recurso. */
export function mensagemDeRecursoAtende(recurso: RecursoAtende): string {
  return `${NOME_DO_RECURSO[recurso]} está disponível a partir do plano ${NOME_DO_PLANO_ATENDE[planoAtendeMinimoPara(recurso)]}.`;
}

/** A frase do 402 quando a contagem bateu no teto. */
export function mensagemDeLimiteAtende(plano: PlanoAtendeEfetivo, limite: LimiteAtende): string {
  const max = limiteAtende(plano, limite);
  const proximo = max === null ? null : planoAtendeMinimoParaLimite(limite, max + 1);
  const sufixo = proximo ? ` Para mais, o plano ${NOME_DO_PLANO_ATENDE[proximo]}.` : ' Para mais, fale com a gente.';
  return `O plano ${NOME_DO_PLANO_ATENDE[plano]} inclui ${descreverLimite(limite, max)}.${sufixo}`;
}

/** Nome do ciclo, para as telas. */
export const NOME_DO_CICLO_ATENDE: Record<CicloAtende, string> = { mensal: 'Mensal', anual: 'Anual' };
