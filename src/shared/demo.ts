/** Faixas de unidades que a empresa opera — as mesmas do <select> da Home e do check no banco (migração 016). */
export const TAMANHOS_DE_OPERACAO = ['1', '2-5', '6-20', '20+'] as const;
export type TamanhoDeOperacao = (typeof TAMANHOS_DE_OPERACAO)[number];

export const ROTULO_DO_TAMANHO: Record<TamanhoDeOperacao, string> = {
  '1': 'Uma unidade',
  '2-5': '2 a 5 unidades',
  '6-20': '6 a 20 unidades',
  '20+': 'Mais de 20 unidades',
};
