/**
 * Planos do Stok Aí — o catálogo que a Home vende e o sistema cobra.
 *
 * É o ÚNICO lugar que sabe o que cada plano libera: preço, limites
 * (unidades, depósitos por unidade, usuários) e recursos. A Home lê daqui
 * para montar os cartões; o servidor lê daqui para recusar o que passa do
 * limite; as telas leem daqui para mostrar o cadeado com o nome do plano
 * certo. Mudar um número aqui muda nos três.
 *
 * Os modos de estoque (empréstimo, entrega, validade, patrimônio) não são
 * gate de plano: o que limita é o número de depósitos por unidade.
 */

export type Plano = 'essencial' | 'profissional' | 'empresarial';
export const PLANOS: readonly Plano[] = ['essencial', 'profissional', 'empresarial'];

/**
 * Organização sem plano gravado está em avaliação: enquanto não existe
 * assinatura, tem tudo do Empresarial. É o estado de toda conta nova hoje.
 */
export type PlanoEfetivo = Plano | 'avaliacao';

/** Cada coisa que um plano liga ou desliga no sistema. */
export type Recurso =
  /** Transferir quantidade entre depósitos da mesma unidade. */
  | 'transferencia'
  /** Logo e cor da organização por dentro do sistema. */
  | 'identidade-visual'
  /** Auditoria em PDF e exportação de materiais em Word. A lista de compras é de todos. */
  | 'exportacoes'
  /** E-mail quando um material cai abaixo do mínimo. Na tela, o alerta é de todos. */
  | 'alertas-por-email'
  /** Relatórios enviados sozinhos por e-mail (ainda não existe). */
  | 'relatorios-automaticos'
  /** O assistente no WhatsApp: a equipe consulta e registra pelo celular. */
  | 'whatsapp'
  /** Cotações e pedidos a fornecedores pelo WhatsApp. */
  | 'cotacoes';

/** Os limites numéricos. `null` = ilimitado (sujeito a uso justo). */
export type Limite = 'unidades' | 'depositosPorUnidade' | 'usuarios';

export interface DefinicaoDoPlano {
  id: Plano;
  nome: string;
  /** Em reais, por mês. */
  preco: number;
  /** Para quem é — a linha abaixo do preço. */
  publico: string;
  limites: Record<Limite, number | null>;
  recursos: readonly Recurso[];
  /** Como o plano descreve o nível de cada área — texto de venda, não regra. */
  niveis: { auditoria: string; alertas: string; dashboard: string; relatorios: string; permissoes: string; suporte: string };
  /** O que o cartão da Home lista, na ordem. */
  destaques: readonly string[];
  /** Serviços incluídos (implantação, treinamento), fora do sistema. */
  servicos: readonly string[];
}

export const DEFINICOES: Record<Plano, DefinicaoDoPlano> = {
  essencial: {
    id: 'essencial',
    nome: 'Essencial',
    preco: 199.9,
    publico: 'Pequenas operações',
    limites: { unidades: 1, depositosPorUnidade: 1, usuarios: 3 },
    recursos: [],
    niveis: { auditoria: 'Básica', alertas: 'Básicos', dashboard: 'Básico', relatorios: 'Básicos', permissoes: 'Básicas', suporte: 'Normal' },
    destaques: ['1 unidade, 1 depósito', 'Até 3 usuários', 'Materiais, categorias e estoque mínimo', 'Entradas, saídas e histórico', 'Alertas na tela e lista de compras', 'Sistema de chamados'],
    servicos: [],
  },
  profissional: {
    id: 'profissional',
    nome: 'Profissional',
    preco: 399.9,
    publico: 'Empresas em expansão',
    limites: { unidades: 2, depositosPorUnidade: 3, usuarios: 10 },
    recursos: ['transferencia', 'identidade-visual', 'exportacoes', 'alertas-por-email'],
    niveis: { auditoria: 'Completa', alertas: 'Completos', dashboard: 'Completo', relatorios: 'Completos', permissoes: 'Por depósito', suporte: 'Prioritário' },
    destaques: ['2 unidades, 3 depósitos em cada', 'Até 10 usuários', 'Transferência entre depósitos', 'Auditoria em PDF e exportações', 'Alertas por e-mail', 'Logo e cor da sua empresa', 'WhatsApp opcional'],
    servicos: ['Implantação assistida', 'Suporte prioritário'],
  },
  empresarial: {
    id: 'empresarial',
    nome: 'Empresarial',
    preco: 1200,
    publico: 'Operações maiores',
    limites: { unidades: 4, depositosPorUnidade: null, usuarios: null },
    recursos: ['transferencia', 'identidade-visual', 'exportacoes', 'alertas-por-email', 'relatorios-automaticos', 'whatsapp', 'cotacoes'],
    niveis: { auditoria: 'Avançada', alertas: 'Automáticos', dashboard: 'Avançado', relatorios: 'Avançados', permissoes: 'Avançadas', suporte: 'Prioridade máxima' },
    destaques: ['4 unidades, depósitos ilimitados*', 'Usuários ilimitados*', 'Tudo do Profissional', 'Stok Aí no WhatsApp: a equipe opera pelo celular', 'Cotações a fornecedores pelo WhatsApp', 'Avisos diários e resumo semanal', 'Acesso antecipado a novos módulos'],
    servicos: ['Implantação e treinamento da equipe', 'Acompanhamento dedicado', 'Prioridade máxima no suporte'],
  },
};

// ---------------------------------------------------------------------------
//  Ciclos, avaliação e carência
// ---------------------------------------------------------------------------

export type Ciclo = 'mensal' | 'anual';
export const CICLOS: readonly Ciclo[] = ['mensal', 'anual'];

/** Conta nova entra com tudo liberado por estes dias; depois precisa assinar. */
export const AVALIACAO_DIAS = 7;
/** Cartão recusado: a conta continua por estes dias depois do vencimento, com aviso; depois trava. */
export const CARENCIA_DIAS = 2;
/** No anual, paga-se 12 meses menos estes. */
export const MESES_GRATIS_NO_ANUAL = 2;
/** Quem paga por Pix/boleto recebe o aviso de renovação com esta antecedência. */
export const LEMBRETE_DIAS = 5;
/** Quanto tempo um Pix gerado fica válido, e um boleto. */
export const PIX_VALIDADE_HORAS = 24;
export const BOLETO_VALIDADE_DIAS = 3;

/** Como se paga: cartão (assinatura automática) ou avulso por Pix/boleto (renova à mão). */
export type Metodo = 'cartao' | 'pix' | 'boleto';
export const METODOS: readonly Metodo[] = ['cartao', 'pix', 'boleto'];
export const NOME_DO_METODO: Record<Metodo, string> = { cartao: 'Cartão de crédito', pix: 'Pix', boleto: 'Boleto' };

/** O fim de um período pago que começa em `de`. */
export function fimDoPeriodo(de: Date, ciclo: Ciclo): Date {
  const d = new Date(de);
  d.setMonth(d.getMonth() + (ciclo === 'anual' ? 12 : 1));
  return d;
}

/** O que se paga por ciclo: mensal é o preço; anual é 12 meses menos os grátis. */
export function precoDo(plano: Plano, ciclo: Ciclo): number {
  const mensal = DEFINICOES[plano].preco;
  return ciclo === 'anual' ? Math.round(mensal * (12 - MESES_GRATIS_NO_ANUAL) * 100) / 100 : mensal;
}

export const NOME_DO_CICLO: Record<Ciclo, string> = { mensal: 'Mensal', anual: 'Anual' };

/**
 * Os planos de assinatura criados no painel do Mercado Pago (o id que vai na
 * URL do checkout deles). Um por plano e ciclo; nulo = ainda não existe no
 * painel e a assinatura é criada pela API com o valor do catálogo.
 */
export const MP_PLANO_ID: Record<Plano, Record<Ciclo, string | null>> = {
  essencial: { mensal: '80d0a2509b3747b29c6ac81861ff32dd', anual: null },
  profissional: { mensal: '146fe762b8a6479c91eb942920b6d2ce', anual: null },
  empresarial: { mensal: '2aa62da2af554e63806660ac1aa7c145', anual: null },
};

/**
 * De um id de plano do Mercado Pago para o nosso plano e ciclo. `planoDeTeste`
 * é o id de um plano barato do painel que, quando configurado (variável
 * MP_PLANO_DE_TESTE), entra no lugar do Essencial mensal para testar o fluxo.
 */
export function planoDoMpPlanId(planId: string | null | undefined, planoDeTeste: string | null = null): { plano: Plano; ciclo: Ciclo } | null {
  if (!planId) return null;
  if (planoDeTeste && planId === planoDeTeste) return { plano: 'essencial', ciclo: 'mensal' };
  for (const plano of PLANOS) for (const ciclo of CICLOS) if (MP_PLANO_ID[plano][ciclo] === planId) return { plano, ciclo };
  return null;
}

// ---------------------------------------------------------------------------
//  A situação da conta: assinada, em avaliação, em carência ou bloqueada
// ---------------------------------------------------------------------------

export type SituacaoDaConta = 'assinada' | 'avaliacao' | 'carencia' | 'bloqueada';

export interface Conta {
  situacao: SituacaoDaConta;
  /** Automática (cartão) ou manual (Pix/boleto, paga de novo a cada período); nulo sem cobrança. */
  renovacao: 'automatica' | 'manual' | null;
  /** O plano que vale hoje (na avaliação e na carência ainda vale; bloqueada não vale nenhum). */
  plano: PlanoEfetivo;
  /** Quando a situação atual termina (fim da avaliação, próxima cobrança, fim da carência). Nulo = sem prazo. */
  ate: string | null;
  /** Dias até `ate`, arredondado para cima; nulo sem prazo. */
  dias_restantes: number | null;
}

export interface CamposDaConta {
  plano: string | null;
  plano_ate: string | null;
  avaliacao_ate: string | null;
  cobranca?: string | null;
}

const DIA_MS = 24 * 60 * 60 * 1000;

function dias(ate: Date, agora: Date): number {
  return Math.max(0, Math.ceil((ate.getTime() - agora.getTime()) / DIA_MS));
}

/**
 * A regra inteira de "esta conta pode usar o sistema?":
 *  - plano gravado e sem vencimento (cortesia) ou vencimento no futuro → assinada;
 *  - plano vencido há menos de CARENCIA_DIAS → carência (funciona, com aviso);
 *  - sem plano e avaliação ainda no prazo → avaliação (tudo do Empresarial);
 *  - o resto → bloqueada.
 */
export function situacaoDaConta(c: CamposDaConta, agora: Date = new Date()): Conta {
  const renovacao = c.cobranca === 'cartao' ? 'automatica' : c.cobranca === 'avulso' ? 'manual' : null;
  if (ehPlano(c.plano)) {
    if (!c.plano_ate) return { situacao: 'assinada', renovacao, plano: c.plano, ate: null, dias_restantes: null };
    const vence = new Date(c.plano_ate);
    if (vence.getTime() >= agora.getTime()) return { situacao: 'assinada', renovacao, plano: c.plano, ate: vence.toISOString(), dias_restantes: dias(vence, agora) };
    const fimDaCarencia = new Date(vence.getTime() + CARENCIA_DIAS * DIA_MS);
    if (fimDaCarencia.getTime() >= agora.getTime()) return { situacao: 'carencia', renovacao, plano: c.plano, ate: fimDaCarencia.toISOString(), dias_restantes: dias(fimDaCarencia, agora) };
    return { situacao: 'bloqueada', renovacao, plano: 'avaliacao', ate: fimDaCarencia.toISOString(), dias_restantes: 0 };
  }
  if (c.avaliacao_ate) {
    const fim = new Date(c.avaliacao_ate);
    if (fim.getTime() >= agora.getTime()) return { situacao: 'avaliacao', renovacao: null, plano: 'avaliacao', ate: fim.toISOString(), dias_restantes: dias(fim, agora) };
    return { situacao: 'bloqueada', renovacao: null, plano: 'avaliacao', ate: fim.toISOString(), dias_restantes: 0 };
  }
  // Sem plano e sem data de avaliação: conta de antes da cobrança existir. Não trava.
  return { situacao: 'avaliacao', renovacao: null, plano: 'avaliacao', ate: null, dias_restantes: null };
}

/** A nota de rodapé dos "ilimitados". */
export const USO_JUSTO = '* Sujeito a uso justo e limites operacionais definidos em contrato.';

/** Acima de 4 unidades, ou com requisitos especiais. */
export const ENTERPRISE = { nome: 'Enterprise', descricao: 'Acima de 4 unidades ou com requisitos especiais: preço sob consulta.' };

export const NOME_DO_PLANO: Record<PlanoEfetivo, string> = { essencial: 'Essencial', profissional: 'Profissional', empresarial: 'Empresarial', avaliacao: 'Avaliação' };

export function ehPlano(s: unknown): s is Plano {
  return typeof s === 'string' && (PLANOS as readonly string[]).includes(s);
}

/** O plano em vigor de uma organização: o gravado, ou avaliação quando não há. */
export function planoEfetivo(plano: string | null | undefined): PlanoEfetivo {
  return ehPlano(plano) ? plano : 'avaliacao';
}

/** A definição que vale: avaliação usa a do Empresarial. */
export function definicaoDe(plano: PlanoEfetivo): DefinicaoDoPlano {
  return DEFINICOES[plano === 'avaliacao' ? 'empresarial' : plano];
}

/** A pergunta que as telas e o servidor fazem: "este plano libera isto?" */
export function planoLibera(plano: PlanoEfetivo, recurso: Recurso): boolean {
  return definicaoDe(plano).recursos.includes(recurso);
}

/** O limite de um plano para uma contagem. `null` = sem limite. */
export function limiteDo(plano: PlanoEfetivo, limite: Limite): number | null {
  return definicaoDe(plano).limites[limite];
}

/** Dá para criar mais um? `atual` é quantos já existem. */
export function cabeMaisUm(plano: PlanoEfetivo, limite: Limite, atual: number): boolean {
  const max = limiteDo(plano, limite);
  return max === null || atual < max;
}

/** O plano mais barato que tem o recurso — para dizer "disponível a partir do plano X". */
export function planoMinimoPara(recurso: Recurso): Plano {
  return PLANOS.find((p) => DEFINICOES[p].recursos.includes(recurso)) ?? 'empresarial';
}

/** O plano mais barato cujo limite comporta `necessario`. `null` se nenhum (Enterprise). */
export function planoMinimoParaLimite(limite: Limite, necessario: number): Plano | null {
  return PLANOS.find((p) => cabeMaisUm(p, limite, necessario - 1)) ?? null;
}

const ROTULO_DO_LIMITE: Record<Limite, [singular: string, plural: string]> = {
  unidades: ['unidade', 'unidades'],
  depositosPorUnidade: ['depósito por unidade', 'depósitos por unidade'],
  usuarios: ['usuário', 'usuários'],
};

/** "1 unidade", "3 depósitos por unidade", "usuários ilimitados". */
export function descreverLimite(limite: Limite, valor: number | null): string {
  const [um, varios] = ROTULO_DO_LIMITE[limite];
  if (valor === null) return `${varios} ilimitados`;
  return `${valor} ${valor === 1 ? um : varios}`;
}

/** "R$ 199,90". */
export function formatarPreco(valor: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);
}

/**
 * A mensagem que o servidor devolve (e a tela mostra) quando o plano não
 * cobre. Fala do plano que resolve, não do que falta.
 */
export function mensagemDeRecurso(recurso: Recurso): string {
  const nome = NOME_DO_PLANO[planoMinimoPara(recurso)];
  const oque: Record<Recurso, string> = {
    transferencia: 'Transferência entre depósitos',
    'identidade-visual': 'Logo e cor da empresa',
    exportacoes: 'Exportação de relatórios',
    'alertas-por-email': 'Alertas por e-mail',
    'relatorios-automaticos': 'Relatórios automáticos',
    whatsapp: 'Stok Aí no WhatsApp',
    cotacoes: 'Cotações pelo WhatsApp',
  };
  return `${oque[recurso]}: disponível a partir do plano ${nome}.`;
}

export function mensagemDeLimite(plano: PlanoEfetivo, limite: Limite): string {
  const max = limiteDo(plano, limite);
  const proximo = max === null ? null : planoMinimoParaLimite(limite, max + 1);
  const sufixo = proximo ? ` Para mais, o plano ${NOME_DO_PLANO[proximo]}.` : ' Para mais, fale com a gente (Enterprise).';
  return `O plano ${NOME_DO_PLANO[plano]} inclui ${descreverLimite(limite, max)}.${sufixo}`;
}

/** Os `status_detail` do Mercado Pago que mais aparecem, em português. Desconhecido volta como veio. */
export function detalheDoPagamento(detalhe: string | null | undefined): string | null {
  if (!detalhe) return null;
  const d = detalhe.toLowerCase();
  const MAPA: Array<[RegExp, string]> = [
    [/^accredited$/, 'aprovado'],
    [/^pending_waiting_payment$/, 'aguardando pagamento'],
    [/^pending_waiting_transfer$/, 'aguardando o Pix'],
    [/^pending_review_manual$/, 'em análise pelo Mercado Pago'],
    [/^pending_contingency$/, 'processando'],
    [/^expired$/, 'expirado'],
    [/^cc_rejected_high_risk$/, 'recusado pelo antifraude do cartão'],
    [/^cc_rejected_insufficient_amount$/, 'saldo/limite insuficiente'],
    [/^cc_rejected_bad_filled/, 'dados do cartão incorretos'],
    [/^cc_rejected_call_for_authorize$/, 'o banco pediu para autorizar a compra'],
    [/^cc_rejected_card_disabled$/, 'cartão desativado'],
    [/^cc_rejected_duplicated_payment$/, 'pagamento duplicado'],
    [/^cc_rejected_max_attempts$/, 'muitas tentativas'],
    [/^cc_rejected_blacklist$/, 'cartão bloqueado pelo Mercado Pago'],
    [/^cc_rejected_other_reason$/, 'recusado pelo banco'],
    [/^by_collector$/, 'cancelado por nós'],
    [/^by_payer$/, 'cancelado por você'],
    [/^refunded$/, 'reembolsado'],
  ];
  for (const [re, texto] of MAPA) if (re.test(d)) return texto;
  return detalhe;
}

