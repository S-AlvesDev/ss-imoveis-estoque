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
  /** Avisos por WhatsApp (ainda não existe). */
  | 'whatsapp';

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
    preco: 999.9,
    publico: 'Operações maiores',
    limites: { unidades: 4, depositosPorUnidade: null, usuarios: null },
    recursos: ['transferencia', 'identidade-visual', 'exportacoes', 'alertas-por-email', 'relatorios-automaticos', 'whatsapp'],
    niveis: { auditoria: 'Avançada', alertas: 'Automáticos', dashboard: 'Avançado', relatorios: 'Avançados', permissoes: 'Avançadas', suporte: 'Prioridade máxima' },
    destaques: ['4 unidades, depósitos ilimitados*', 'Usuários ilimitados*', 'Tudo do Profissional', 'WhatsApp incluído', 'Relatórios automáticos', 'Personalização completa', 'Acesso antecipado a novos módulos'],
    servicos: ['Implantação e treinamento da equipe', 'Acompanhamento dedicado', 'Prioridade máxima no suporte'],
  },
};

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
    whatsapp: 'Avisos por WhatsApp',
  };
  return `${oque[recurso]}: disponível a partir do plano ${nome}.`;
}

export function mensagemDeLimite(plano: PlanoEfetivo, limite: Limite): string {
  const max = limiteDo(plano, limite);
  const proximo = max === null ? null : planoMinimoParaLimite(limite, max + 1);
  const sufixo = proximo ? ` Para mais, o plano ${NOME_DO_PLANO[proximo]}.` : ' Para mais, fale com a gente (Enterprise).';
  return `O plano ${NOME_DO_PLANO[plano]} inclui ${descreverLimite(limite, max)}.${sufixo}`;
}
