/**
 * O que a SEVLA Identity troca com as telas — compartilhado pelo servidor,
 * pelo Stok Aí, pelo Atende Aí e pela página da SEVLA. Sem lógica de
 * produto aqui: só o vocabulário do ecossistema.
 */

/** Quem é a SEVLA, em texto — lido pela página (/cloud) e pelo Jatobá no servidor. */
export const SEVLA_NOME = 'SEVLA INFINITY';
export const SEVLA_SLOGAN = 'Tecnologia que conecta possibilidades.';
export const SEVLA_POSICIONAMENTO = 'Empresa de tecnologia que cria, desenvolve e conecta produtos digitais.';
export const SEVLA_DESCRICAO = 'Construímos produtos digitais que transformam operações, conectam pessoas e criam novas possibilidades para negócios.';

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

// ---------------------------------------------------------------------------
//  Combos: os dois produtos juntos, com desconto
// ---------------------------------------------------------------------------

/** O desconto do combo, em %, sobre o preço de cada produto — cada um cobra o seu, já descontado. */
export const COMBO_DESCONTO = 5;

/** O nome que vai na fatura, no recibo e na nota: "combo SEVLA". */
export const NOME_DO_COMBO = 'combo SEVLA';

/**
 * Um preço com o desconto do combo. Conta em centavos inteiros e arredonda
 * para baixo: nunca um centavo a mais do que os 5% prometem (199,90 → 189,90).
 */
export function comDescontoDoCombo(valor: number): number {
  return Math.floor((Math.round(valor * 100) * (100 - COMBO_DESCONTO)) / 100) / 100;
}
