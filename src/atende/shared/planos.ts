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

/** O texto do preço: "R$ 199,90" ou o placeholder "R$ XX". */
export function precoFormatado(plano: PlanoAtende, ciclo: CicloAtende): string {
  const p = precoAtende(plano, ciclo);
  return p === null ? 'R$ XX' : p.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function planoAtendeLibera(plano: PlanoAtende, recurso: RecursoAtende): boolean {
  return DEFINICOES_ATENDE[plano].recursos.includes(recurso);
}
