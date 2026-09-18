import { DEFINICOES, PLANOS, AVALIACAO_DIAS, precoDo } from '../shared/planos';
import { PRODUTO as STOK } from '../shared/produto';
import { ATENDE } from '../atende/shared/produto';

/**
 * O catálogo da casa: cada sistema, o que ele resolve, e por onde se entra.
 * Os preços do Stok Aí vêm de planos.ts (os mesmos que ele cobra); os do
 * Atende Aí e dos combos ainda não existem — `preco: null` — e a página diz
 * isso com honestidade em vez de inventar. Quando o Samuel definir, é só
 * preencher aqui.
 */

export type Situacao = 'no-ar' | 'em-breve';

export interface Sistema {
  id: 'stok' | 'atende';
  nome: string;
  slogan: string;
  /** Uma linha: para quem e para quê. */
  chamada: string;
  descricao: string;
  cor: string;
  corSuave: string;
  situacao: Situacao;
  /** O que ele faz — quatro a cinco coisas concretas, sem adjetivo. */
  entrega: readonly string[];
  /** Para quem é, em exemplos. */
  paraQuem: readonly string[];
  /** Onde se conhece o produto e onde se entra. */
  conhecer: string;
  entrar: string;
  /** Marca em fundo escuro: imagem, ou nulo para desenhar o nome. */
  logo: string | null;
  simbolo: string | null;
}

export const SISTEMAS: readonly Sistema[] = [
  {
    id: 'stok',
    nome: STOK.nome,
    slogan: STOK.slogan,
    chamada: 'Controle de estoque para quem opera de verdade.',
    descricao: 'Estoques, depósitos e unidades em um só lugar. A equipe registra pelo WhatsApp, os fornecedores respondem cotações, e você decide com os dados na tela.',
    cor: '#ff8a24',
    corSuave: 'rgba(255,138,36,0.16)',
    situacao: 'no-ar',
    entrega: ['Saldo por depósito e mínimo por material', 'Movimentações com origem, destino e responsável', 'Cinco modos: almoxarifado, empréstimo, EPI, validade, patrimônio', 'Cotações a fornecedores pelo WhatsApp', 'Assistente no WhatsApp: propõe, você confirma, o sistema grava'],
    paraQuem: ['construtoras e obras', 'escolas e almoxarifados', 'clínicas e laboratórios', 'lojas e distribuidoras'],
    conhecer: '/',
    entrar: '/entrar',
    logo: STOK.logoHorizontal.escuro,
    simbolo: STOK.simbolo,
  },
  {
    id: 'atende',
    nome: ATENDE.nome,
    slogan: ATENDE.slogan,
    chamada: 'A central do WhatsApp da sua empresa.',
    descricao: 'A IA entende a mensagem, identifica o assunto e encaminha para o setor certo. O atendente resolve com contexto. O supervisor acompanha em tempo real.',
    cor: '#7c3aed',
    corSuave: 'rgba(124,58,237,0.18)',
    situacao: 'no-ar',
    entrega: ['O WhatsApp da própria empresa, conectado por QR', 'Triagem por IA: assunto, intenção, setor, prioridade', 'Central com mídia, notas internas e fila por time', 'Supervisor orienta, assume, transfere e corrige a triagem', 'Painel com leads, conversões e tempo de resposta'],
    paraQuem: ['imobiliárias', 'clínicas e consultórios', 'lojas com atendimento por WhatsApp', 'prestadores de serviço'],
    conhecer: `${ATENDE.base}/entrar`,
    entrar: `${ATENDE.base}/entrar`,
    logo: null,
    simbolo: ATENDE.simbolo,
  },
];

export interface Combo {
  id: string;
  nome: string;
  /** Em uma linha, para quem. */
  publico: string;
  /** Ids dos sistemas incluídos. */
  sistemas: ReadonlyArray<Sistema['id']>;
  /** Por mês, em reais. Nulo = ainda não definido (a página diz "em breve"). */
  preco: number | null;
  /** "a partir de": quando o combo tem mais de um plano por dentro. */
  aPartirDe: boolean;
  destaque: boolean;
  inclui: readonly string[];
}

/** Menor plano do Stok Aí — "a partir de". */
const menorDoStok = Math.min(...PLANOS.map((p) => precoDo(p, 'mensal')));

export const COMBOS: readonly Combo[] = [
  {
    id: 'stok',
    nome: 'Só estoque',
    publico: 'Quem precisa colocar o almoxarifado em ordem.',
    sistemas: ['stok'],
    preco: menorDoStok,
    aPartirDe: true,
    destaque: false,
    inclui: [`Stok Aí nos planos ${PLANOS.map((p) => DEFINICOES[p].nome).join(', ')}`, `${AVALIACAO_DIAS} dias grátis com tudo liberado`, 'Sistema de chamados e suporte'],
  },
  {
    id: 'atende',
    nome: 'Só atendimento',
    publico: 'Quem atende clientes pelo WhatsApp e quer time, fila e supervisão.',
    sistemas: ['atende'],
    preco: null,
    aPartirDe: false,
    destaque: false,
    inclui: ['Atende Aí com o WhatsApp da sua empresa', 'Triagem por IA e central completa', 'Supervisão e painel'],
  },
  {
    id: 'completo',
    nome: 'Casa completa',
    publico: 'Estoque e atendimento na mesma conta — e o próximo sistema quando chegar.',
    sistemas: ['stok', 'atende'],
    preco: null,
    aPartirDe: false,
    destaque: true,
    inclui: ['Stok Aí + Atende Aí', 'Uma conta, uma equipe, um suporte', 'Acesso antecipado ao que a casa lançar'],
  },
];

export { AVALIACAO_DIAS };
