import { PRODUTO as STOK, linkWhatsApp } from '@/shared/produto';
import { ATENDE } from '@/atende/shared/produto';

/**
 * A SEVLA INFINITY — a empresa-mãe.
 *
 * Não é um terceiro produto: é quem cria, desenvolve e conecta os produtos
 * (Stok Aí, Atende Aí e o que vier). Vive em /cloud enquanto não tem domínio
 * próprio; quando tiver, `/cloud/*` vira a raiz de sevlainfinity.com.
 *
 * Os arquivos da marca são os oficiais em public/sevla — não se redesenha a
 * logo nem se substitui por texto. As versões .webp são os mesmos arquivos,
 * só reduzidos para a tela (18 KB em vez de 320 KB); os PNG originais
 * continuam para favicon, ícone do app e compartilhamento.
 */
export const SEVLA = {
  nome: 'SEVLA INFINITY',
  slogan: 'Tecnologia que conecta possibilidades.',
  posicionamento: 'Empresa de tecnologia que cria, desenvolve e conecta produtos digitais.',
  descricao: 'Construímos produtos digitais que transformam operações, conectam pessoas e criam novas possibilidades para negócios.',
  base: '/cloud',
  /** Minha SEVLA (a conta central), na Fase 2. */
  conta: '/cloud/conta',
  logo: {
    /** Texto branco: para fundo escuro. */
    escuro: '/sevla/logo-horizontal-escuro.webp',
    /** Texto escuro: para fundo claro. */
    claro: '/sevla/sevla_logo_escuro.png',
    /** Proporção do arquivo (600 × 240 — a mesma do original), para reservar espaço antes de carregar. */
    proporcao: 600 / 240,
  },
  simbolo: '/sevla/simbolo.webp',
  cores: {
    fundo: '#0B0F17',
    grafite: '#1F2937',
    primaria: '#6366F1',
    suave: '#64748B',
    clara: '#F8FAFC',
  },
  /** Contato: só o que a empresa já usa hoje — o WhatsApp do Stok Aí e o e-mail da equipe. */
  contato: {
    email: 'team@stokai.app',
    whatsapp: STOK.whatsapp,
    linkWhatsApp: (mensagem: string) => linkWhatsApp(mensagem),
  },
} as const;

/** Os produtos do ecossistema, na ordem em que aparecem. Novo produto = nova linha aqui. */
export interface ProdutoDoEcossistema {
  id: 'stok' | 'atende';
  nome: string;
  slogan: string;
  categoria: string;
  descricao: string;
  /** A cor do produto (cada um mantém a própria identidade). */
  cor: string;
  conhecer: string;
  entrar: string;
  /** Marca para fundo escuro: arquivo, ou nulo (desenha símbolo + nome). */
  logo: string | null;
  simbolo: string;
}

export const PRODUTOS: readonly ProdutoDoEcossistema[] = [
  {
    id: 'stok',
    nome: STOK.nome,
    slogan: STOK.slogan,
    categoria: 'Gestão de estoque',
    descricao: 'Uma plataforma de gestão de estoque criada para tornar operações mais organizadas, eficientes e controláveis.',
    cor: '#ff8a24',
    conhecer: '/',
    entrar: '/login',
    logo: STOK.logoHorizontal.escuro,
    simbolo: STOK.simbolo,
  },
  {
    id: 'atende',
    nome: ATENDE.nome,
    slogan: 'Atendimento inteligente.',
    categoria: 'Atendimento inteligente',
    descricao: 'Uma plataforma de atendimento que conecta equipes, clientes e inteligência artificial em uma única operação.',
    cor: '#7c3aed',
    conhecer: ATENDE.base,
    entrar: `${ATENDE.base}/login`,
    logo: null,
    simbolo: ATENDE.simbolo,
  },
];
