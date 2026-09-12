import type { ScopedDb } from './tenant';

/**
 * Saldo por depósito.
 *
 * O estoque nasceu com duas colunas fixas em `materials`, saldo_central e
 * saldo_obra. Enquanto o saldo era coluna, "Central" e "Obra" eram conceito
 * do código, e uma unidade em Natal não existia sem alterar programa. Hoje o
 * saldo é linha em `stock_balances`, uma por depósito — e depósito é
 * cadastro. As colunas antigas foram removidas pela migração 013.
 *
 * Tudo que lê ou grava saldo passa por aqui. O núcleo (calcularMovimento) é
 * puro e testado sozinho; o acesso ao banco fica no fim do arquivo.
 */

export type TipoDeposito = 'CENTRAL' | 'OBRA' | 'OUTRO';

/**
 * Como se opera um estoque (migração 018).
 *   almoxarifado  entrada, saída, consumo, ajuste, transferência na unidade.
 *   emprestimo    retirada por tempo limitado, com devolução.
 */
export type ModoEstoque = 'almoxarifado' | 'emprestimo';
export const MODOS: readonly ModoEstoque[] = ['almoxarifado', 'emprestimo'];

export interface Deposito {
  id: string;
  nome: string;
  /** Marca de transição (Central/Obra de antes). Estoque novo é OUTRO e ninguém decide nada por ele. */
  tipo: TipoDeposito;
  unit_id: string;
  ativo: boolean;
  modo: ModoEstoque;
  /** Só no modo empréstimo: quantas horas uma retirada tem, por padrão. */
  prazo_padrao_horas: number | null;
}

/**
 * As operações de um estoque no modo almoxarifado, já sem "Central" e "Obra"
 * no nome: cada uma diz de que lado do estoque escolhido ela acontece.
 * TRANSFERENCIA tem os dois lados (o estoque escolhido é a origem).
 */
export type OperacaoGenerica = 'ENTRADA' | 'SAIDA' | 'CONSUMO' | 'AJUSTE' | 'TRANSFERENCIA';

export interface DefinicaoDeOperacao {
  /** O estoque escolhido na tela é a origem ou o destino? */
  lado: 'origem' | 'destino';
  /** Precisa de um segundo estoque (o destino da transferência). */
  precisaDestino?: boolean;
  ajuste?: boolean;
  rotulo: string;
}

export const OPERACOES: Record<OperacaoGenerica, DefinicaoDeOperacao> = {
  ENTRADA: { lado: 'destino', rotulo: 'esta entrada' },
  SAIDA: { lado: 'origem', rotulo: 'esta saída' },
  CONSUMO: { lado: 'origem', rotulo: 'este consumo' },
  AJUSTE: { lado: 'destino', ajuste: true, rotulo: 'este ajuste' },
  TRANSFERENCIA: { lado: 'origem', precisaDestino: true, rotulo: 'esta transferência' },
};

export function ehOperacaoGenerica(s: unknown): s is OperacaoGenerica {
  return typeof s === 'string' && s in OPERACOES;
}

/**
 * Nome e modo de um estoque novo ou editado. Devolve o erro para a pessoa,
 * ou os campos limpos. Prazo só existe (e é obrigatório) no modo empréstimo.
 */
export function validarEstoque(body: unknown): { ok: true; nome: string; modo: ModoEstoque; prazo_padrao_horas: number | null } | { ok: false; erro: string } {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const nome = typeof b.nome === 'string' ? b.nome.trim() : '';
  if (nome.length < 2 || nome.length > 60) return { ok: false, erro: 'Informe o nome do estoque (2 a 60 caracteres).' };
  const modo = (typeof b.modo === 'string' ? b.modo : 'almoxarifado') as ModoEstoque;
  if (!MODOS.includes(modo)) return { ok: false, erro: 'Modo de estoque inválido.' };
  let prazo: number | null = null;
  if (modo === 'emprestimo') {
    prazo = Number(b.prazo_padrao_horas ?? 2);
    if (!Number.isInteger(prazo) || prazo < 1 || prazo > 8760) return { ok: false, erro: 'O prazo padrão deve ser de 1 a 8760 horas.' };
  }
  return { ok: true, nome, modo, prazo_padrao_horas: prazo };
}

/** Quanto existe de um material, por depósito. */
export type SaldosPorDeposito = Record<string, number>;

/**
 * Como cada operação move estoque: sai da origem, entra no destino.
 *
 * Repare que "remessa" e "devolução" têm os dois lados. Modelar assim é o que
 * permite, depois, uma transferência entre unidades diferentes — hoje ela é
 * Central→Obra porque só existem esses dois depósitos, não porque a operação
 * seja outra coisa.
 */
export interface Fluxo {
  origem?: TipoDeposito;
  destino?: TipoDeposito;
  /** Ajuste soma um delta com sinal no destino, em vez de mover quantidade. */
  ajuste?: boolean;
  /** Como a operação aparece numa mensagem de erro, com artigo: "esta remessa", "este consumo". */
  rotulo: string;
  /**
   * De que lado a pessoa precisa ter permissão de operar. Quem manda a remessa
   * é a origem; quem recebe entrada é o destino; devolução, qualquer um.
   */
  quemOpera: 'origem' | 'destino' | 'qualquer';
}

export const FLUXO_DA_OPERACAO: Record<string, Fluxo> = {
  ENTRADA_CENTRAL: { destino: 'CENTRAL', rotulo: 'esta entrada', quemOpera: 'destino' },
  SAIDA: { origem: 'CENTRAL', rotulo: 'esta saída', quemOpera: 'origem' },
  REMESSA_OBRA: { origem: 'CENTRAL', destino: 'OBRA', rotulo: 'esta remessa', quemOpera: 'origem' },
  DEVOLUCAO_CENTRAL: { origem: 'OBRA', destino: 'CENTRAL', rotulo: 'esta devolução', quemOpera: 'qualquer' },
  CONSUMO_OBRA: { origem: 'OBRA', rotulo: 'este consumo', quemOpera: 'origem' },
  AJUSTE_CENTRAL: { destino: 'CENTRAL', ajuste: true, rotulo: 'este ajuste', quemOpera: 'destino' },
  AJUSTE_OBRA: { destino: 'OBRA', ajuste: true, rotulo: 'este ajuste', quemOpera: 'destino' },
};

/**
 * O saldo é gravado com 2 casas. Arredondar aqui, e não só no banco, evita que
 * o servidor decida "tem saldo suficiente" olhando um número que o banco vai
 * guardar diferente.
 */
export function arredondar(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface MovimentoPedido {
  origem_id?: string;
  destino_id?: string;
  quantidade: number;
  ajuste?: boolean;
  rotulo: string;
  /** Nome do depósito, para o erro dizer onde faltou. */
  nomeDe: (id: string) => string;
}

export type Calculo =
  | { ok: false; erro: string }
  | { ok: true; novos: SaldosPorDeposito };

/**
 * Calcula os saldos depois da operação, ou recusa dizendo por quê.
 *
 * Pura de propósito: sem banco, sem rede. É a regra que decide se o estoque
 * pode ou não sair do lugar, então precisa ser possível testá-la sozinha.
 */
export function calcularMovimento(atuais: SaldosPorDeposito, p: MovimentoPedido): Calculo {
  const q = Number(p.quantidade);
  if (!Number.isFinite(q)) return { ok: false, erro: 'Quantidade inválida.' };

  // Ajuste de recontagem soma um delta com sinal — pode e deve ser negativo.
  // As demais operações movem uma quantidade, e mover "menos cinco" seria uma
  // entrada virando saída sem que o histórico mostre isso.
  if (!p.ajuste && q <= 0) {
    return { ok: false, erro: 'A quantidade precisa ser maior que zero.' };
  }

  const novos: SaldosPorDeposito = { ...atuais };
  const saldoDe = (id: string) => Number(novos[id] ?? 0);
  const tocados: string[] = [];

  if (p.ajuste) {
    if (!p.destino_id) return { ok: false, erro: 'Ajuste sem depósito de destino.' };
    novos[p.destino_id] = arredondar(saldoDe(p.destino_id) + q);
    tocados.push(p.destino_id);
  } else {
    if (!p.origem_id && !p.destino_id) {
      return { ok: false, erro: 'Movimentação sem origem nem destino.' };
    }
    if (p.origem_id) {
      if (q > saldoDe(p.origem_id)) {
        return { ok: false, erro: `Saldo insuficiente em ${p.nomeDe(p.origem_id)} para ${p.rotulo}.` };
      }
      novos[p.origem_id] = arredondar(saldoDe(p.origem_id) - q);
      tocados.push(p.origem_id);
    }
    if (p.destino_id) {
      novos[p.destino_id] = arredondar(saldoDe(p.destino_id) + q);
      tocados.push(p.destino_id);
    }
  }

  // Só os depósitos que esta operação encostou. Um saldo negativo herdado em
  // outro depósito é problema dele: travar uma operação que não tem relação
  // nenhuma com ele deixaria o estoque parado sem motivo.
  for (const id of tocados) {
    if (novos[id] < 0) return { ok: false, erro: 'A operação resultaria em saldo negativo.' };
  }

  return { ok: true, novos };
}

/**
 * Acha o depósito de um tipo. Enquanto existir uma unidade só, "o Central" é
 * uma frase sem ambiguidade; com duas unidades deixa de ser, e aí a operação
 * precisa dizer o depósito pelo id. Falhar aqui é melhor que escolher um.
 */
export function acharDeposito(depositos: Deposito[], tipo: TipoDeposito): Deposito {
  const achados = depositos.filter((d) => d.tipo === tipo);
  if (achados.length === 0) {
    throw new Error(`Não há depósito ${tipo} cadastrado nesta organização.`);
  }
  if (achados.length > 1) {
    throw new Error(
      `Há ${achados.length} depósitos ${tipo} nesta organização. A operação precisa informar de qual depósito se trata.`,
    );
  }
  return achados[0];
}

/**
 * Os depósitos em que uma operação pode acontecer.
 *
 * Com uma unidade só, é tudo. Com mais de uma, a operação precisa dizer em
 * qual — "o Central" passa a ser ambíguo, e ambiguidade em cima de saldo se
 * resolve recusando, não escolhendo.
 */
export function depositosDaUnidade(depositos: Deposito[], unitId?: string | null): Deposito[] {
  if (unitId) {
    const daUnidade = depositos.filter((d) => d.unit_id === unitId);
    if (daUnidade.length === 0) throw new Error('Unidade sem depósito cadastrado, ou inexistente.');
    return daUnidade;
  }
  const unidades = new Set(depositos.map((d) => d.unit_id));
  if (unidades.size > 1) {
    throw new Error('Há mais de uma unidade. A operação precisa informar em qual unidade acontece.');
  }
  return depositos;
}

/** Resolve origem e destino de uma operação em ids de depósito. */
export function depositosDoFluxo(
  fluxo: Fluxo,
  depositos: Deposito[],
): { origem_id?: string; destino_id?: string } {
  return {
    origem_id: fluxo.origem ? acharDeposito(depositos, fluxo.origem).id : undefined,
    destino_id: fluxo.destino ? acharDeposito(depositos, fluxo.destino).id : undefined,
  };
}

// -----------------------------------------------------------------------------
//  Acesso ao banco
// -----------------------------------------------------------------------------

/**
 * Depósitos da organização.
 *
 * Por padrão, só os de unidades ativas: desativar uma unidade não apaga
 * nada, mas não se opera nela. Configuração e histórico precisam enxergar
 * tudo — para reativar, resolver nomes, gerenciar materiais — e pedem
 * `incluirUnidadesInativas`.
 */
export async function depositosDaOrg(
  db: ScopedDb,
  opcoes: { incluirUnidadesInativas?: boolean } = {},
): Promise<Deposito[]> {
  let q = db
    .from('warehouses')
    .select('id, nome, tipo, unit_id, ativo, modo, prazo_padrao_horas, units!inner(ativo)')
    .eq('ativo', true);
  if (!opcoes.incluirUnidadesInativas) q = q.eq('units.ativo', true);
  const { data, error } = await q.order('nome', { ascending: true });
  if (error) throw error;
  return (data || []).map(({ units, ...d }: any) => d) as Deposito[];
}

export interface Unidade {
  id: string;
  nome: string;
  slug: string;
  ativo: boolean;
}

/** Todas as unidades, ativas ou não. Quem opera filtra por `ativo`; quem configura vê tudo. */
export async function unidadesDaOrg(db: ScopedDb): Promise<Unidade[]> {
  const { data, error } = await db
    .from('units')
    .select('id, nome, slug, ativo')
    .order('nome', { ascending: true });
  if (error) throw error;
  return (data || []) as Unidade[];
}

/**
 * Saldo de todos os materiais, agrupado por material.
 *
 * Pagina porque são duas linhas por material: com 310 materiais já são 620, e
 * o PostgREST corta em 1000. Um teto silencioso em cima de saldo apareceria
 * como material zerado sem motivo.
 */
export async function saldosDaOrg(db: ScopedDb): Promise<Map<number, SaldosPorDeposito>> {
  const porMaterial = new Map<number, SaldosPorDeposito>();
  const PAGINA = 1000;

  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await db
      .from('stock_balances')
      .select('material_id, warehouse_id, saldo')
      .range(de, de + PAGINA - 1);
    if (error) throw error;

    for (const linha of data || []) {
      const atual = porMaterial.get(linha.material_id) || {};
      atual[linha.warehouse_id] = Number(linha.saldo);
      porMaterial.set(linha.material_id, atual);
    }

    if (!data || data.length < PAGINA) break;
  }

  return porMaterial;
}

export async function saldosDoMaterial(db: ScopedDb, materialId: number): Promise<SaldosPorDeposito> {
  const { data, error } = await db
    .from('stock_balances')
    .select('warehouse_id, saldo')
    .eq('material_id', materialId);
  if (error) throw error;

  const saldos: SaldosPorDeposito = {};
  for (const linha of data || []) saldos[linha.warehouse_id] = Number(linha.saldo);
  return saldos;
}

/**
 * Grava o saldo por depósito. A única função que escreve saldo no sistema.
 *
 * Não encosta em `materials`: o saldo tem o próprio carimbo de data em
 * `stock_balances`, e o catálogo só muda quando o cadastro muda.
 */
export async function gravarSaldos(db: ScopedDb, materialId: number, novos: SaldosPorDeposito): Promise<void> {
  const linhas = Object.entries(novos).map(([warehouse_id, saldo]) => ({
    material_id: materialId,
    warehouse_id,
    saldo: arredondar(saldo),
    updated_at: new Date().toISOString(),
  }));
  if (linhas.length === 0) return;

  const { error } = await db
    .from('stock_balances')
    .upsert(linhas, { onConflict: 'warehouse_id,material_id' });
  if (error) throw error;
}

/** Total da empresa: o que existe somando todos os depósitos. */
export function totalDosDepositos(saldos: SaldosPorDeposito): number {
  return arredondar(Object.values(saldos).reduce((s, v) => s + Number(v), 0));
}
