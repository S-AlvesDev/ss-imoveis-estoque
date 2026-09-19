/**
 * O que a SEVLA Identity troca com as telas — compartilhado pelo servidor,
 * pelo Stok Aí, pelo Atende Aí e pela página da SEVLA. Sem lógica de
 * produto aqui: só o vocabulário do ecossistema.
 */

/** Os produtos do ecossistema. Produto novo = uma linha aqui + a participação dele na view sevla_acessos. */
export type ProdutoSevla = 'stok' | 'atende';
export const PRODUTOS_SEVLA: readonly ProdutoSevla[] = ['stok', 'atende'];
export const NOME_DO_PRODUTO: Record<ProdutoSevla, string> = { stok: 'Stok Aí', atende: 'Atende Aí' };

/** A pessoa. */
export interface ContaSevla {
  id: string;
  email: string;
  nome: string;
}

/** Uma participação: a conta, num produto, numa empresa, com um papel. */
export interface AcessoSevla {
  produto: ProdutoSevla;
  organization_id: string;
  organizacao: string;
  usuario_id: number;
  papel: string;
  nome: string;
  matricula: string | null;
  /** Só no Atende Aí: a empresa do produto ligada à organização. */
  empresa_id: string | null;
}

export interface RespostaDeEntrada {
  conta: ContaSevla;
  token: string;
  acessos: AcessoSevla[];
}

export interface EmpresaNaMinhaSevla {
  organization_id: string;
  organizacao: string;
  papel: string;
  /** 'assinada' | 'avaliacao' | 'carencia' | 'bloqueada' | 'encerrada' (Stok) ou sem 'encerrada' (Atende). Nulo quando não se sabe. */
  situacao: string | null;
  plano: string | null;
  empresa_id: string | null;
}

export interface ProdutoNaMinhaSevla {
  produto: ProdutoSevla;
  empresas: EmpresaNaMinhaSevla[];
  /** Empresas onde a pessoa pode ativar este produto agora (administra o Stok Aí e o Atende ainda não existe lá). */
  podeAtivarEm: Array<{ organization_id: string; organizacao: string }>;
}

export interface MinhaSevla {
  conta: ContaSevla;
  produtos: ProdutoNaMinhaSevla[];
}

/** Onde cada sessão de produto fica no navegador e para onde ir depois de entrar. */
export const SESSAO_DO_PRODUTO: Record<ProdutoSevla, { chave: string; inicio: string; entrar: string; conhecer: string; planos: string }> = {
  stok: { chave: 'estoque-auth', inicio: '/', entrar: '/entrar', conhecer: '/', planos: '/#planos' },
  atende: { chave: 'atende-sessao', inicio: '/atende/central', entrar: '/atende/entrar', conhecer: '/atende', planos: '/atende/planos' },
};

/** A chave do token SEVLA no navegador. */
export const CHAVE_DA_SESSAO_SEVLA = 'sevla-sessao';
