/**
 * O Stok Aí no WhatsApp.
 *
 * Uma mensagem chega de um número; o número diz quem é a pessoa e de qual
 * empresa. A partir daí o assistente age COMO ela: vê os estoques que ela
 * vê, opera os que ela opera, e só as operações liberadas para o WhatsApp.
 * Consulta responde na hora. Gravação vira uma proposta que espera um
 * "SIM" — e quem executa é código, nunca o modelo.
 */
import bcrypt from 'bcryptjs';
import { supabaseServer } from '../lib/supabaseServer';
import { scopedDb, type ScopedDb } from './tenant';
import { acessosDoUsuario, podeVer, podeOperar, ehAdmin, type Acessos } from './acessos';
import { depositosDaOrg, unidadesDaOrg, saldosDaOrg, saldosDoMaterial, calcularMovimento, gravarSaldos, operacaoPermitida, arredondar, type Deposito, type OperacaoGenerica } from './estoque';
import { conversar, claudeConfigurado, systemComCache, type BlocoDeSistema, type Ferramenta, type MensagemDoChat, type Uso } from './claude';
import { variantesDoTelefone } from './evolution';
import { fornecedorPeloTelefone, responderFornecedor, avisarQuemPediu } from './cotacoes';
import { ehInstanciaDoStokAi, type Midia } from './evolution';
import { contaDaOrg } from './planos';
import { planoLibera, NOME_DO_PLANO } from '../shared/planos';
import { stockStatus } from '../features/estoque/utils';
import { podeRegistrarOperacao } from '../shared/constants';

// ---------------------------------------------------------------------------
//  Quem pode o quê pelo WhatsApp
// ---------------------------------------------------------------------------

/** As operações que existem pelo WhatsApp (ajuste, recontagem e cadastro ficam no painel). */
export type OperacaoWhatsapp = 'SAIDA' | 'CONSUMO' | 'TRANSFERENCIA' | 'ENTRADA' | 'DEVOLUCAO';
export const OPERACOES_WHATSAPP: readonly OperacaoWhatsapp[] = ['SAIDA', 'CONSUMO', 'TRANSFERENCIA', 'ENTRADA', 'DEVOLUCAO'];
export const NOME_DA_OPERACAO_WHATSAPP: Record<OperacaoWhatsapp, string> = { SAIDA: 'saída', CONSUMO: 'consumo', TRANSFERENCIA: 'transferência', ENTRADA: 'entrada', DEVOLUCAO: 'devolução de empréstimo' };

/** O padrão do cargo, quando o usuário não tem lista própria. */
export function operacoesPadrao(role: string): OperacaoWhatsapp[] {
  return OPERACOES_WHATSAPP.filter((o) => podeRegistrarOperacao(role, o));
}

export function ehOperacaoWhatsapp(s: unknown): s is OperacaoWhatsapp {
  return typeof s === 'string' && (OPERACOES_WHATSAPP as readonly string[]).includes(s);
}

/**
 * A lista válida a partir do que o administrador marcou (nulo = padrão do
 * cargo). O que o cargo não pode (entrada, para operador) sai mesmo que
 * esteja marcado — a regra do cargo vale acima da configuração.
 */
export function operacoesDoUsuario(role: string, lista: unknown): OperacaoWhatsapp[] {
  if (!Array.isArray(lista)) return operacoesPadrao(role);
  return lista.filter(ehOperacaoWhatsapp).filter((o) => podeRegistrarOperacao(role, o));
}

/** "SIM", "sim 1234", "confirmo" → a confirmação e o PIN, se veio. */
export function lerConfirmacao(texto: string): { confirma: boolean; nega: boolean; pin: string | null } {
  // Nunca estoura: quem chama vem do webhook, e mensagem sem texto é rotina.
  const t = String(texto ?? '').trim().toLowerCase();
  const m = t.match(/^(sim|s|confirmo|confirmar|ok|pode|isso)(?:[\s,.]+(\d{4,6}))?[.!]*$/);
  if (m) return { confirma: true, nega: false, pin: m[2] ?? null };
  if (/^(n[aã]o|n|cancela|cancelar|deixa|esquece|para)[.!]*$/.test(t)) return { confirma: false, nega: true, pin: null };
  return { confirma: false, nega: false, pin: null };
}

// ---------------------------------------------------------------------------
//  Quem está falando
// ---------------------------------------------------------------------------

export interface Falante {
  id: number;
  nome: string;
  matricula: string;
  role: string;
  organization_id: string;
  organizacao: string;
  operacoes: OperacaoWhatsapp[];
  temPin: boolean;
  pinHash: string | null;
}

export async function falantePeloTelefone(telefone: string): Promise<Falante | null> {
  const { data } = await supabaseServer.from('estoque_users').select('id, nome, matricula, role, organization_id, whatsapp_operacoes, whatsapp_pin, ativo, organizations(nome)').in('whatsapp', variantesDoTelefone(telefone)).limit(1).maybeSingle();
  if (!data || data.ativo === false) return null;
  return {
    id: Number(data.id),
    nome: data.nome,
    matricula: data.matricula,
    role: data.role,
    organization_id: data.organization_id,
    organizacao: (data as any).organizations?.nome ?? 'sua empresa',
    operacoes: operacoesDoUsuario(data.role, data.whatsapp_operacoes),
    temPin: Boolean(data.whatsapp_pin),
    pinHash: data.whatsapp_pin ?? null,
  };
}

// ---------------------------------------------------------------------------
//  O que a pessoa enxerga (e o que a IA recebe como contexto)
// ---------------------------------------------------------------------------

interface MaterialVisivel {
  id: number;
  nome: string;
  unidade_medida: string;
  estoque_minimo: number;
  saldos: Record<string, number>;
}

export interface Contexto {
  db: ScopedDb;
  falante: Falante;
  acessos: Acessos;
  depositos: Deposito[];
  unidades: Array<{ id: string; nome: string }>;
  /** Nulo até alguma ferramenta precisar — ver materiaisDoContexto(). */
  materiais: MaterialVisivel[] | null;
}

/**
 * O que a IA precisa saber antes de falar: quem é a pessoa, o que ela
 * enxerga e quais estoques existem.
 *
 * O catálogo com saldos NÃO entra aqui: numa empresa com mil materiais,
 * carregar tudo a cada "oi" custa segundos que a pessoa espera olhando a
 * tela. Ele é lido na primeira ferramenta que precisar — e uma vez só por
 * mensagem, porque fica guardado no contexto.
 */
export async function montarContexto(falante: Falante): Promise<Contexto> {
  const db = scopedDb(falante.organization_id);
  const [acessos, todos, unidades] = await Promise.all([acessosDoUsuario(db, falante.id, falante.role), depositosDaOrg(db), unidadesDaOrg(db)]);
  const depositos = todos.filter((d) => d.ativo && podeVer(acessos, d.id));
  return { db, falante, acessos, depositos, unidades: unidades.map((u) => ({ id: u.id, nome: u.nome })), materiais: null };
}

/** O catálogo com os saldos que esta pessoa enxerga. Lê do banco na primeira vez; depois é de graça. */
async function materiaisDoContexto(ctx: Contexto): Promise<MaterialVisivel[]> {
  if (ctx.materiais) return ctx.materiais;
  const [saldos, materiaisRes] = await Promise.all([saldosDaOrg(ctx.db), ctx.db.from('materials').select('id, nome, unidade_medida, estoque_minimo').order('nome')]);
  const visiveis = new Set(ctx.depositos.map((d) => d.id));
  ctx.materiais = ((materiaisRes.data || []) as any[]).map((m) => {
    const s = saldos.get(m.id) || {};
    return { id: m.id, nome: m.nome, unidade_medida: m.unidade_medida, estoque_minimo: Number(m.estoque_minimo), saldos: Object.fromEntries(Object.entries(s).filter(([id]) => visiveis.has(id))) };
  });
  return ctx.materiais;
}

function normalizar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/** Acha materiais pelo nome (todas as palavras da busca aparecem no nome). Poucos = certeza; muitos = a IA pergunta. */
export function acharMateriais<T extends { nome: string }>(lista: T[], busca: string): T[] {
  const palavras = normalizar(busca).split(/\s+/).filter(Boolean);
  if (!palavras.length) return [];
  const exato = lista.filter((m) => normalizar(m.nome) === normalizar(busca));
  if (exato.length) return exato;
  return lista.filter((m) => {
    const n = normalizar(m.nome);
    return palavras.every((p) => n.includes(p));
  });
}

/** Acha um estoque pelo nome (ou parte dele). */
export function acharDepositoPorNome<T extends { nome: string }>(lista: T[], busca: string | undefined | null): T[] {
  if (!busca) return [];
  const b = normalizar(busca);
  const exato = lista.filter((d) => normalizar(d.nome) === b);
  if (exato.length) return exato;
  return lista.filter((d) => normalizar(d.nome).includes(b) || b.includes(normalizar(d.nome)));
}

// ---------------------------------------------------------------------------
//  A proposta (o que espera "SIM") e a execução
// ---------------------------------------------------------------------------

export interface Proposta {
  tipo: 'movimentacao' | 'devolucao';
  resumo: string;
  dados: Record<string, any>;
  expira_em: string;
}

const PROPOSTA_MINUTOS = 10;

/** Monta a proposta de movimentação, já conferida: material único, estoques certos, permissão, saldo. */
async function proporMovimentacao(ctx: Contexto, input: Record<string, unknown>): Promise<{ ok: true; proposta: Proposta } | { ok: false; erro: string }> {
  const operacao = String(input.operacao ?? '').toUpperCase();
  if (!ehOperacaoWhatsapp(operacao) || operacao === 'DEVOLUCAO') return { ok: false, erro: 'Operação inválida. Use SAIDA, CONSUMO, TRANSFERENCIA ou ENTRADA.' };
  if (!ctx.falante.operacoes.includes(operacao)) {
    // Entrada é de administrador em qualquer lugar; as outras podem estar só desligadas no WhatsApp desta pessoa.
    if (!podeRegistrarOperacao(ctx.falante.role, operacao)) return { ok: false, erro: `Entrada de material é registrada por um administrador — ${ctx.falante.nome} é operador e não dá entrada nem pelo WhatsApp nem pelo painel. Diga isso à pessoa e sugira avisar quem administra o estoque.` };
    return { ok: false, erro: `${ctx.falante.nome} não pode registrar ${NOME_DA_OPERACAO_WHATSAPP[operacao]} pelo WhatsApp. Peça ao administrador ou use o painel.` };
  }

  const quantidade = arredondar(Number(input.quantidade));
  if (!Number.isFinite(quantidade) || quantidade <= 0) return { ok: false, erro: 'Informe uma quantidade maior que zero.' };

  const achados = acharMateriais(await materiaisDoContexto(ctx), String(input.material ?? ''));
  if (achados.length === 0) return { ok: false, erro: `Não achei nenhum material parecido com "${input.material}". Peça para a pessoa dizer o nome como está no cadastro.` };
  if (achados.length > 1) return { ok: false, erro: `Mais de um material combina com "${input.material}": ${achados.map((m) => m.nome).join('; ')}. Pergunte qual.` };
  const material = achados[0];

  const operaveis = ctx.depositos.filter((d) => d.modo === 'almoxarifado' && podeOperar(ctx.acessos, d.id));
  const escolher = (busca: unknown, papel: string): { ok: true; dep: Deposito } | { ok: false; erro: string } => {
    const lista = busca ? acharDepositoPorNome(operaveis, String(busca)) : operaveis;
    if (lista.length === 1) return { ok: true, dep: lista[0] };
    if (lista.length === 0) return { ok: false, erro: busca ? `Não achei um estoque "${busca}" que ${ctx.falante.nome} opere. Estoques dela: ${operaveis.map((d) => d.nome).join('; ') || 'nenhum'}.` : `${ctx.falante.nome} não opera nenhum estoque de almoxarifado.` };
    return { ok: false, erro: `Qual estoque de ${papel}? ${lista.map((d) => d.nome).join('; ')}.` };
  };

  let origem: Deposito | null = null;
  let destino: Deposito | null = null;
  if (operacao === 'ENTRADA') {
    const r = escolher(input.estoque_destino ?? input.estoque, 'destino');
    if (!r.ok) return r;
    destino = r.dep;
  } else {
    const r = escolher(input.estoque_origem ?? input.estoque, 'origem');
    if (!r.ok) return r;
    origem = r.dep;
    if (operacao === 'TRANSFERENCIA') {
      // Destino: qualquer estoque da mesma unidade que a pessoa veja (não precisa operar o destino), menos patrimônio.
      const candidatos = ctx.depositos.filter((d) => d.unit_id === origem!.unit_id && d.id !== origem!.id && d.modo !== 'patrimonio');
      const lista = input.estoque_destino ? acharDepositoPorNome(candidatos, String(input.estoque_destino)) : candidatos;
      if (lista.length === 0) return { ok: false, erro: `Não achei um estoque de destino "${input.estoque_destino ?? ''}" na unidade de ${origem.nome}. Opções: ${candidatos.map((d) => d.nome).join('; ') || 'nenhuma'}.` };
      if (lista.length > 1) return { ok: false, erro: `Qual estoque de destino? ${lista.map((d) => d.nome).join('; ')}.` };
      destino = lista[0];
    }
  }
  const lado = origem ?? destino!;
  if (!operacaoPermitida(lado, operacao as OperacaoGenerica)) return { ok: false, erro: `A operação ${NOME_DA_OPERACAO_WHATSAPP[operacao]} está desligada em ${lado.nome}.` };

  const saldoOrigem = origem ? Number(material.saldos[origem.id] ?? 0) : null;
  if (origem && saldoOrigem !== null && saldoOrigem < quantidade) return { ok: false, erro: `${material.nome} tem só ${saldoOrigem} ${material.unidade_medida} em ${origem.nome}; não dá para tirar ${quantidade}.` };

  const nomeOp = NOME_DA_OPERACAO_WHATSAPP[operacao];
  const resumo =
    operacao === 'TRANSFERENCIA'
      ? `Transferir ${quantidade} ${material.unidade_medida} de ${material.nome} de ${origem!.nome} para ${destino!.nome}`
      : operacao === 'ENTRADA'
        ? `Dar entrada de ${quantidade} ${material.unidade_medida} de ${material.nome} em ${destino!.nome}`
        : `Registrar ${nomeOp} de ${quantidade} ${material.unidade_medida} de ${material.nome} de ${origem!.nome}`;
  const justificativa = String(input.justificativa ?? '').trim().slice(0, 200) || `${nomeOp} registrada pelo WhatsApp`;
  return {
    ok: true,
    proposta: {
      tipo: 'movimentacao',
      resumo,
      dados: { operacao, material_id: material.id, material_nome: material.nome, unidade_medida: material.unidade_medida, quantidade, origem_id: origem?.id ?? null, destino_id: destino?.id ?? null, origem_nome: origem?.nome ?? null, destino_nome: destino?.nome ?? null, justificativa },
      expira_em: new Date(Date.now() + PROPOSTA_MINUTOS * 60_000).toISOString(),
    },
  };
}

async function proporDevolucao(ctx: Contexto, input: Record<string, unknown>): Promise<{ ok: true; proposta: Proposta } | { ok: false; erro: string }> {
  if (!ctx.falante.operacoes.includes('DEVOLUCAO')) return { ok: false, erro: `${ctx.falante.nome} não pode registrar devoluções pelo WhatsApp.` };
  const { data } = await ctx.db.from('loans').select('id, warehouse_id, material_id, tomador_nome, tomador_referencia, quantidade, quantidade_devolvida, materials(nome, unidade_medida)').eq('tipo', 'emprestimo').is('devolvido_em', null).is('encerrado_em', null);
  const abertos = ((data || []) as any[]).filter((e) => podeOperar(ctx.acessos, e.warehouse_id));
  const quem = normalizar(String(input.tomador ?? ''));
  const material = normalizar(String(input.material ?? ''));
  const lista = abertos.filter((e) => (!quem || normalizar(e.tomador_nome).includes(quem) || normalizar(e.tomador_referencia ?? '').includes(quem)) && (!material || normalizar(e.materials?.nome ?? '').includes(material)));
  if (lista.length === 0) return { ok: false, erro: quem ? `Não achei retirada pendente de "${input.tomador}"${material ? ` com ${input.material}` : ''}.` : 'Diga quem está devolvendo.' };
  if (lista.length > 1) return { ok: false, erro: `Mais de uma retirada pendente: ${lista.map((e) => `${e.tomador_nome} — ${e.materials?.nome} (${Number(e.quantidade) - Number(e.quantidade_devolvida)})`).join('; ')}. Pergunte qual (pessoa + material).` };
  const e = lista[0];
  const falta = arredondar(Number(e.quantidade) - Number(e.quantidade_devolvida));
  const estoque = ctx.depositos.find((d) => d.id === e.warehouse_id);
  return {
    ok: true,
    proposta: {
      tipo: 'devolucao',
      resumo: `Registrar a devolução de ${falta} ${e.materials?.unidade_medida ?? ''} de ${e.materials?.nome} por ${e.tomador_nome} em ${estoque?.nome ?? 'estoque'}`,
      dados: { loan_id: e.id, warehouse_id: e.warehouse_id, material_id: e.material_id, quantidade: falta, tomador_nome: e.tomador_nome },
      expira_em: new Date(Date.now() + PROPOSTA_MINUTOS * 60_000).toISOString(),
    },
  };
}

/** Executa o que foi confirmado. Só chega aqui depois do "SIM". */
export async function executarProposta(falante: Falante, proposta: Proposta): Promise<string> {
  const db = scopedDb(falante.organization_id);
  const d = proposta.dados;
  const nomeDe = async (id: string) => (await depositosDaOrg(db)).find((x) => x.id === id)?.nome ?? id;
  if (proposta.tipo === 'movimentacao') {
    const atuais = await saldosDoMaterial(db, Number(d.material_id));
    const lados = { origem_id: d.origem_id ?? undefined, destino_id: d.destino_id ?? undefined };
    const calculo = calcularMovimento(atuais, { ...lados, quantidade: Number(d.quantidade), rotulo: NOME_DA_OPERACAO_WHATSAPP[d.operacao as OperacaoWhatsapp], nomeDe: (id) => (id === d.origem_id ? d.origem_nome : d.destino_nome) ?? id });
    if (!calculo.ok) return `❌ ${proposta.resumo}: ${calculo.erro}`;
    await gravarSaldos(db, Number(d.material_id), calculo.novos);
    await db.from('material_movements').insert({
      material_id: d.material_id,
      tipo_operacao: d.operacao,
      quantidade: d.quantidade,
      warehouse_origem_id: d.origem_id ?? null,
      warehouse_destino_id: d.destino_id ?? null,
      funcionario_matricula: falante.matricula,
      justificativa: `${d.justificativa} (via WhatsApp)`,
    });
    const onde = d.origem_id ? `${d.origem_nome}: ${calculo.novos[d.origem_id]}` : `${d.destino_nome}: ${calculo.novos[d.destino_id]}`;
    return `✅ ${proposta.resumo}. Saldo agora — ${onde} ${d.unidade_medida}${d.destino_id && d.origem_id ? `; ${d.destino_nome}: ${calculo.novos[d.destino_id]} ${d.unidade_medida}` : ''}.`;
  }
  if (proposta.tipo === 'devolucao') {
    const { data: emp } = await db.from('loans').select('*').eq('id', d.loan_id).maybeSingle();
    if (!emp || emp.devolvido_em) return `❌ ${proposta.resumo}: essa retirada já foi devolvida.`;
    const falta = arredondar(Number(emp.quantidade) - Number(emp.quantidade_devolvida));
    const atuais = await saldosDoMaterial(db, emp.material_id);
    const calculo = calcularMovimento(atuais, { destino_id: emp.warehouse_id, quantidade: falta, rotulo: 'esta devolução', nomeDe: (id) => id });
    if (!calculo.ok) return `❌ ${proposta.resumo}: ${calculo.erro}`;
    const agora = new Date().toISOString();
    await db.from('loans').update({ quantidade_devolvida: Number(emp.quantidade), devolvido_em: agora, devolucao_matricula: falante.matricula }).eq('id', emp.id);
    await gravarSaldos(db, emp.material_id, calculo.novos);
    await db.from('material_movements').insert({ material_id: emp.material_id, tipo_operacao: 'DEVOLUCAO_EMPRESTIMO', quantidade: falta, warehouse_origem_id: null, warehouse_destino_id: emp.warehouse_id, funcionario_matricula: falante.matricula, justificativa: `Devolução de ${emp.tomador_nome} (via WhatsApp)` });
    return `✅ ${proposta.resumo}. Saldo em ${await nomeDe(emp.warehouse_id)}: ${calculo.novos[emp.warehouse_id]}.`;
  }
  return 'Não sei executar isso.';
}

// ---------------------------------------------------------------------------
//  As ferramentas que a IA pode chamar
// ---------------------------------------------------------------------------

export const FERRAMENTAS: Ferramenta[] = [
  {
    name: 'consultar_saldo',
    description: 'Saldo de um material nos estoques que a pessoa enxerga. Use quando perguntarem quanto tem, onde está, se tem.',
    input_schema: { type: 'object', properties: { material: { type: 'string', description: 'Nome (ou parte) do material' } }, required: ['material'] },
  },
  {
    name: 'listar_pendencias',
    description: 'O que precisa de atenção: materiais sem estoque ou abaixo do mínimo e empréstimos atrasados, nos estoques da pessoa.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'listar_estoques',
    description: 'Os estoques (depósitos) que a pessoa vê e quais ela opera, com o modo de cada um.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'propor_movimentacao',
    description: 'Prepara UMA movimentação (SAIDA, CONSUMO, TRANSFERENCIA ou ENTRADA) para a pessoa confirmar. NUNCA executa: devolve o resumo que deve ser apresentado pedindo "SIM". Se a pessoa disser várias movimentações numa mensagem, chame uma vez para cada — todas ficam esperando um único SIM. Se faltar dado (material ambíguo, estoque), devolve o que perguntar.',
    input_schema: {
      type: 'object',
      properties: {
        operacao: { type: 'string', enum: ['SAIDA', 'CONSUMO', 'TRANSFERENCIA', 'ENTRADA'] },
        material: { type: 'string' },
        quantidade: { type: 'number' },
        estoque_origem: { type: 'string', description: 'De onde sai (saída, consumo, transferência). Opcional se a pessoa opera um só.' },
        estoque_destino: { type: 'string', description: 'Para onde vai (transferência, entrada).' },
        justificativa: { type: 'string', description: 'Motivo, se a pessoa disse (obra, cliente, NF).' },
      },
      required: ['operacao', 'material', 'quantidade'],
    },
  },
  {
    name: 'propor_devolucao',
    description: 'Prepara a devolução de um empréstimo pendente (quem pegou devolveu) para a pessoa confirmar com "SIM".',
    input_schema: { type: 'object', properties: { tomador: { type: 'string', description: 'Quem está devolvendo' }, material: { type: 'string' } } },
  },
];

export async function executarFerramenta(ctx: Contexto, name: string, input: Record<string, unknown>, guardar: (p: Proposta) => void): Promise<string> {
  if (name === 'consultar_saldo') {
    const achados = acharMateriais(await materiaisDoContexto(ctx), String(input.material ?? ''));
    if (achados.length === 0) return `Nenhum material parecido com "${input.material}".`;
    return achados
      .slice(0, 5)
      .map((m) => {
        const porEstoque = ctx.depositos.map((d) => `${d.nome}: ${m.saldos[d.id] ?? 0}`).join(', ');
        const total = Object.values(m.saldos).reduce((s, v) => s + Number(v), 0);
        return `${m.nome} — ${porEstoque}. Total ${arredondar(total)} ${m.unidade_medida}${m.estoque_minimo ? ` (mínimo ${m.estoque_minimo})` : ''}.`;
      })
      .join('\n');
  }
  if (name === 'listar_estoques') {
    return ctx.depositos.map((d) => `${d.nome} (${d.modo}${podeOperar(ctx.acessos, d.id) ? ', opera' : ', só consulta'})`).join('; ') || 'Nenhum estoque visível.';
  }
  if (name === 'listar_pendencias') {
    const faltando = (await materiaisDoContexto(ctx))
      .map((m) => {
        const saldo_unidade = Object.values(m.saldos).reduce((s, v) => s + Number(v), 0);
        const status = stockStatus({ saldo_unidade, saldos_unidade: m.saldos, estoque_minimo: m.estoque_minimo }, 'empresa');
        return { m, status, saldo_unidade };
      })
      .filter((x) => x.status === 'RUPTURA' || x.status === 'ABAIXO')
      .slice(0, 15)
      .map((x) => `${x.m.nome}: ${arredondar(x.saldo_unidade)} ${x.m.unidade_medida} (mínimo ${x.m.estoque_minimo})${x.status === 'RUPTURA' ? ' — SEM ESTOQUE' : ''}`);
    const { data: emp } = await ctx.db.from('loans').select('tomador_nome, prazo_em, quantidade, quantidade_devolvida, warehouse_id, materials(nome)').eq('tipo', 'emprestimo').is('devolvido_em', null).is('encerrado_em', null);
    const agora = Date.now();
    const atrasados = ((emp || []) as any[]).filter((e) => podeVer(ctx.acessos, e.warehouse_id) && e.prazo_em && new Date(e.prazo_em).getTime() < agora).map((e) => `${e.tomador_nome} — ${Number(e.quantidade) - Number(e.quantidade_devolvida)} de ${e.materials?.nome} (venceu ${new Date(e.prazo_em).toLocaleString('pt-BR')})`);
    return `Abaixo do mínimo (${faltando.length}): ${faltando.join('; ') || 'nada'}.\nEmpréstimos atrasados (${atrasados.length}): ${atrasados.join('; ') || 'nenhum'}.`;
  }
  if (name === 'propor_movimentacao' || name === 'propor_devolucao') {
    const r = name === 'propor_movimentacao' ? await proporMovimentacao(ctx, input) : await proporDevolucao(ctx, input);
    if (!r.ok) return r.erro;
    guardar(r.proposta);
    return `PROPOSTA PRONTA: "${r.proposta.resumo}". Apresente exatamente isso à pessoa e peça que responda SIM para confirmar${ctx.falante.temPin ? ' (com o PIN: "SIM 1234")' : ''}. Não diga que já foi registrado.`;
  }
  return 'Ferramenta desconhecida.';
}

/**
 * As regras do assistente: iguais para toda pessoa, toda empresa, todo dia.
 * Vão para o cache da Anthropic junto com as ferramentas, então nada aqui pode
 * variar — nome, data e estoques ficam em `contextoDaPessoa`. Mexer neste texto
 * é normal; só não coloque nele nada que mude por chamada.
 */
/** As regras que valem em qualquer canal (WhatsApp, painel). O Jatobá do site reaproveita estas. */
export const REGRA_DOS_NUMEROS =
  'REGRA QUE NÃO TEM EXCEÇÃO: todo número que você disser (saldo, quantidade, prazo, validade, preço) tem que vir de uma ferramenta chamada NESTA resposta. Não repita número de mensagem anterior, não some de cabeça, não estime. Se a pergunta é sobre quantidade, a primeira coisa que você faz é chamar consultar_saldo.';
export const REGRA_DO_NUMERO_CONTESTADO =
  'Se a pessoa disser que o número está errado, consulte de novo e diga o que o sistema mostra. Se der o mesmo número, diga que confere e sugira conferir a prateleira ou ver o histórico no painel — nunca mude o número só porque ela discordou.';
export const REGRA_DAS_OPERACOES =
  'Só proponha operações que estejam na lista de operações liberadas para a pessoa. Fora dessa lista, diga que é só pelo painel ou com o administrador — e entrada de material é só de administrador, em qualquer lugar.';
export const REGRA_DE_SIGILO = 'Nunca revele dados de outros estoques ou empresas. Se perguntarem algo fora de estoque, responda em uma linha e volte ao assunto.';
export const REGRA_DA_UNIDADE = 'Use a unidade que a ferramenta devolver (sc, un, kg, m); não converta nem invente unidade.';
export const EXEMPLO_SALDO = '— "quanto tem de cimento?" → consultar_saldo → "Cimento CP-II: Central 42 sc, Obra 3 sc. Total 45 sc (mínimo 20)."';
export const EXEMPLO_AMBIGUO = '— "tem parafuso?" e a ferramenta acha vários → "Achei 3: Parafuso 6mm (120 un), Parafuso 8mm (40 un), Parafuso sextavado (0). Qual deles?"';
export const EXEMPLO_PENDENCIAS = '— "o que está faltando?" → listar_pendencias → uma linha por item, só o que a ferramenta devolveu.';

export const REGRAS_DO_ASSISTENTE = [
  'Você é o assistente do Stok Aí (sistema de controle de estoque) no WhatsApp. Quem é a pessoa, de que empresa, o que ela vê e pode fazer e que dia é hoje vêm no bloco seguinte.',
  'Responda curto, em português do Brasil, como uma mensagem de WhatsApp: sem markdown pesado, no máximo umas 6 linhas, números claros.',
  REGRA_DOS_NUMEROS,
  REGRA_DO_NUMERO_CONTESTADO,
  'Gravação (saída, consumo, transferência, entrada, devolução): você NÃO tem como registrar nem preparar nada sozinha — só a ferramenta propor_movimentacao/propor_devolucao prepara. Chame-a sempre que a pessoa disser uma movimentação; só depois de ela devolver PROPOSTA PRONTA apresente o resumo e peça SIM. Nunca escreva "confirma", "SIM" ou "registrado" sem isso. Quem grava é o sistema, quando a pessoa responde SIM; quem avisa que gravou também é o sistema — nunca você. Se a ferramenta devolver dúvida (material ambíguo, estoque), pergunte à pessoa.',
  REGRA_DAS_OPERACOES,
  'Várias movimentações numa mensagem: uma chamada de ferramenta para cada. Depois liste as propostas numeradas, diga quantas são e peça um SIM só ("Responda SIM para confirmar as 3"). Se alguma falhou, diga qual e por quê, e peça SIM só para as que ficaram prontas.',
  REGRA_DE_SIGILO,
  'Se perguntarem o que você faz: consulta saldo, onde está cada material e o que está faltando; registra o que estiver liberado, sempre pedindo SIM. Só isso — cadastro, ajuste e relatórios são no painel.',
  'Suporte: se a pessoa relatar problema com o sistema (algo não funciona, erro, senha, acesso, plano, cobrança, cadastro) ou pedir ajuda com o próprio Stok Aí, não chute causa nem prometa conserto. Diga em uma linha que isso é com a equipe do Stok Aí, que lê este mesmo número e responde por aqui, e acrescente a dica de suporte do bloco seguinte. Depois volte ao estoque.',
  'Exemplos do tamanho e do tom esperados (os números são ilustrativos — os seus vêm sempre da ferramenta):',
  EXEMPLO_SALDO,
  '— "saiu 2 sacos de cimento do Central pra obra da Rua 5" → propor_movimentacao → "Saída de 2 sc de Cimento CP-II do Central (obra da Rua 5). Responda SIM para confirmar."',
  EXEMPLO_AMBIGUO,
  EXEMPLO_PENDENCIAS,
  REGRA_DA_UNIDADE,
].join('\n');

/** O que muda por pessoa e por dia — fica depois do marcador de cache. */
function contextoDaPessoa(ctx: Contexto, pendentes: Proposta[]): string {
  const hoje = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  return [
    `Você está falando com ${ctx.falante.nome} (${ctx.falante.role === 'CEO' ? 'CEO' : ehAdmin(ctx.falante.role) ? 'administrador' : 'operador'}) da empresa ${ctx.falante.organizacao}. Hoje é ${hoje}.`,
    `Estoques que a pessoa vê: ${ctx.depositos.map((d) => `${d.nome} [${d.modo}${podeOperar(ctx.acessos, d.id) ? ', opera' : ', consulta'}]`).join('; ') || 'nenhum'}.`,
    `Operações liberadas para ela pelo WhatsApp: ${ctx.falante.operacoes.map((o) => NOME_DA_OPERACAO_WHATSAPP[o]).join(', ') || 'nenhuma (só consulta)'}.`,
    pendentes.length === 1
      ? `Há uma ação esperando confirmação: "${pendentes[0].resumo}". Se a pessoa mudar de assunto, atenda; se quiser cancelar, diga que pode responder NÃO.`
      : pendentes.length > 1
        ? `Há ${pendentes.length} ações esperando um único SIM: ${pendentes.map((p, i) => `${i + 1}) ${p.resumo}`).join('; ')}. Se a pessoa mudar de assunto, atenda; se quiser cancelar, diga que pode responder NÃO (cancela todas).`
        : '',
    `Dica de suporte para esta pessoa: ${ehAdmin(ctx.falante.role) ? 'ela vê o estado da conexão e o simulador em Configurações → Stok Aí no WhatsApp' : 'o administrador da empresa dela também pode ajudar'}.`,
  ]
    .filter(Boolean)
    .join('\n');
}

function systemPrompt(ctx: Contexto, pendentes: Proposta[]): BlocoDeSistema[] {
  return systemComCache(REGRAS_DO_ASSISTENTE, contextoDaPessoa(ctx, pendentes));
}

// ---------------------------------------------------------------------------
//  A conversa
// ---------------------------------------------------------------------------

/** Quantas mensagens por mês a organização pode mandar ao assistente. */
export const LIMITE_MENSAGENS_MES = 1000;

export const SEM_PENDENCIA_PARA_CONFIRMAR = 'Não há nada esperando confirmação (ou já passaram os 10 minutos). Diga de novo o que quer registrar — ex.: "saiu 2 sacos de cimento do Central".';

/**
 * A IA escreveu pedindo SIM (ou anunciando registro) sem que uma proposta
 * exista — nem nova, nem pendente. É o contrato quebrado: só a ferramenta
 * prepara, só o código grava.
 */
/**
 * A IA respondeu com número sem ter consultado nada.
 *
 * Aconteceu de verdade: perguntaram quantas bolas de futsal havia e ela
 * respondeu "10" de cabeça — o estoque tinha 21. Saldo, prazo e validade
 * só existem nas ferramentas; qualquer algarismo numa resposta que não
 * chamou ferramenta nenhuma é chute até prova em contrário.
 */
export function respondeuNumeroSemConsultar(texto: string, ferramentas: string[]): boolean {
  if (ferramentas.length > 0) return false;
  return /[0-9]/.test(texto);
}

export function pediuConfirmacaoSemProposta(texto: string, novas: Proposta[], pendentes: Proposta[]): boolean {
  if (novas.length || pendentes.length) return false;
  return /\bSIM\b/.test(texto) || /\bconfirma\b/i.test(texto) || /registrad[ao]\b/i.test(texto);
}

/**
 * Número sem cadastro: pode ser alguém da equipe de um cliente, ou um
 * interessado que veio do botão da Home — o número do assistente é o mesmo
 * do atendimento. Sem IA aqui: resposta fixa, e a equipe lê a mensagem.
 */
export const MENSAGEM_PARA_DESCONHECIDO = [
  'Olá! Aqui é o assistente do Stok Aí.',
  'Se você já usa o sistema, peça ao administrador da sua empresa para colocar este WhatsApp no seu usuário (Usuários → editar → WhatsApp) — aí eu te reconheço.',
  'Se quer conhecer o Stok Aí ou falar com a equipe, pode escrever aqui mesmo: uma pessoa responde por este número.',
].join('\n\n');

interface Conversa {
  id?: string;
  /** `erro` e `ferramentas` ficam só no registro (a IA não os vê): por que uma resposta falhou, o que ela chamou. */
  mensagens: Array<{ role: 'user' | 'assistant'; content: string; erro?: string; ferramentas?: string[] }>;
  /**
   * O que espera "SIM". Uma mensagem pode trazer várias movimentações ("saiu
   * 3 bolas, 2 redes, e chegaram 10 coletes") — cada uma vira uma proposta, e
   * um SIM só confirma todas. Uma mensagem nova com propostas substitui as
   * anteriores: quem corrige a quantidade não pode acabar gravando as duas.
   */
  pendentes: Proposta[];
}

/**
 * O que está gravado em `pendente` (jsonb) como lista válida. Antes era uma
 * proposta só, então um objeto solto ainda pode aparecer; o vencido cai fora.
 */
export function pendentesValidos(bruto: unknown, agora = Date.now()): Proposta[] {
  const lista = Array.isArray(bruto) ? bruto : bruto ? [bruto] : [];
  return (lista as Proposta[]).filter((p) => p && typeof p === 'object' && new Date(p.expira_em).getTime() > agora);
}

async function carregarConversa(telefone: string): Promise<Conversa> {
  const { data } = await supabaseServer.from('whatsapp_conversas').select('id, mensagens, pendente').eq('telefone', telefone).maybeSingle();
  if (!data) return { mensagens: [], pendentes: [] };
  return { id: data.id, mensagens: Array.isArray(data.mensagens) ? data.mensagens : [], pendentes: pendentesValidos(data.pendente) };
}

async function salvarConversa(falante: Falante, telefone: string, c: Conversa) {
  // Seis mensagens bastam para o assunto continuar; cada uma a mais é reenviada
  // à IA em toda rodada, e o que a pessoa sente disso é demora.
  const mensagens = c.mensagens.slice(-6);
  await supabaseServer.from('whatsapp_conversas').upsert({ organization_id: falante.organization_id, user_id: falante.id, telefone, mensagens, pendente: c.pendentes.length ? c.pendentes : null, atualizado_em: new Date().toISOString() }, { onConflict: 'telefone' });
}

/** A frase que fecha a resposta quando há proposta esperando: quantas são, e como confirmar. */
export function pedidoDeConfirmacao(quantas: number, temPin: boolean): string {
  const pin = temPin ? ' (com o PIN: "SIM 1234")' : '';
  return quantas > 1 ? `Responda SIM para confirmar as ${quantas}${pin}, ou NÃO para cancelar todas.` : `Responda SIM para confirmar${pin}.`;
}

async function registrar(args: { organizationId: string | null; userId: number | null; telefone: string; direcao: 'entrada' | 'saida'; texto: string; uso?: Uso | null }) {
  const linha = { organization_id: args.organizationId, user_id: args.userId, telefone: args.telefone, direcao: args.direcao, texto: args.texto.slice(0, 4000), tokens_entrada: args.uso?.tokens_entrada ?? null, tokens_saida: args.uso?.tokens_saida ?? null, modelo: args.uso?.modelo ?? null };
  // O limite mensal e o aviso diário ao desconhecido contam linhas desta tabela: o registro
  // não pode falhar só porque a coluna tokens_cache (migração 027) ainda não foi aplicada.
  try {
    const { error } = await supabaseServer.from('whatsapp_mensagens').insert({ ...linha, tokens_cache: args.uso?.tokens_cache ?? null });
    if (!error) return;
    const { error: erro2 } = await supabaseServer.from('whatsapp_mensagens').insert(linha);
    if (erro2) console.error('[whatsapp] não registrou mensagem:', erro2.message);
    else console.warn('[whatsapp] coluna tokens_cache ausente — aplique a migração 027:', error.message);
  } catch (e: any) {
    console.error('[whatsapp] não registrou mensagem:', e.message);
  }
}

/** Já mandamos o aviso de "não achei seu cadastro" para este número nas últimas 24 h? */
async function jaAvisamosHoje(telefone: string): Promise<boolean> {
  const desde = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
  const { count } = await supabaseServer.from('whatsapp_mensagens').select('*', { count: 'exact', head: true }).eq('telefone', telefone).eq('direcao', 'saida').is('organization_id', null).gte('criado_em', desde);
  return (count ?? 0) > 0;
}

/**
 * Quantas mensagens a empresa mandou neste mês.
 *
 * Contar linha por linha a cada mensagem custa uma ida ao banco que a
 * pessoa espera. O número é guardado por um minuto e vai subindo sozinho;
 * o limite é de mil, então errar por alguns segundos não muda nada.
 */
const contagem = new Map<string, { valor: number; ate: number }>();
async function mensagensNoMes(organizationId: string): Promise<number> {
  const agora = Date.now();
  const guardada = contagem.get(organizationId);
  if (guardada && guardada.ate > agora) {
    guardada.valor += 1;
    return guardada.valor;
  }
  const inicio = new Date();
  inicio.setDate(1);
  inicio.setHours(0, 0, 0, 0);
  const { count } = await supabaseServer.from('whatsapp_mensagens').select('*', { count: 'exact', head: true }).eq('organization_id', organizationId).eq('direcao', 'entrada').gte('criado_em', inicio.toISOString());
  const valor = count ?? 0;
  contagem.set(organizationId, { valor, ate: agora + 60_000 });
  return valor;
}

export interface Resposta {
  /** Nulo = não responder nada (número sem cadastro que já recebeu o aviso hoje). */
  texto: string | null;
  falante: Falante | null;
  uso?: Uso;
  /** Motivo técnico quando a IA falhou — para o administrador no simulador, nunca para o WhatsApp. */
  erro?: string;
}

/**
 * Uma mensagem chegou: descobre quem é, resolve confirmações, ou conversa
 * com a IA. Devolve o texto a mandar de volta (quem chama envia).
 */
export async function responder(telefone: string, texto: string | null, tipo: 'texto' | 'imagem' | 'audio' | 'documento' | 'outro' = 'texto', instancia: string | null = null, baixarMidia?: () => Promise<Midia | null>): Promise<Resposta> {
  const falante = await falantePeloTelefone(telefone);
  if (!falante) {
    // Não é da equipe de ninguém: pode ser um fornecedor respondendo a uma cotação.
    const fornecedor = await fornecedorPeloTelefone(telefone, instancia);
    if (fornecedor) {
      await registrar({ organizationId: fornecedor.organization_id, userId: null, telefone, direcao: 'entrada', texto: texto ?? `[${tipo}]` });
      let midia: Midia | null = null;
      if ((tipo === 'imagem' || tipo === 'documento') && baixarMidia) {
        try {
          midia = await baixarMidia();
        } catch (e: any) {
          console.error('[cotacao] mídia:', e.message);
        }
      }
      const r = await responderFornecedor(fornecedor, texto, tipo, midia);
      await registrar({ organizationId: fornecedor.organization_id, userId: null, telefone, direcao: 'saida', texto: r.texto });
      if (r.avisar) await avisarQuemPediu(fornecedor, r);
      return { texto: r.texto, falante: null };
    }
    // No número da própria empresa, quem não é da equipe nem fornecedor é cliente dela: não é conosco. Silêncio.
    if (!ehInstanciaDoStokAi(instancia)) return { texto: null, falante: null };
    await registrar({ organizationId: null, userId: null, telefone, direcao: 'entrada', texto: texto ?? `[${tipo}]` });
    // O número do assistente é o do atendimento: quem está conversando com uma pessoa da equipe
    // não pode receber o aviso automático a cada mensagem. Uma vez por dia basta.
    if (await jaAvisamosHoje(telefone)) return { texto: null, falante: null };
    await registrar({ organizationId: null, userId: null, telefone, direcao: 'saida', texto: MENSAGEM_PARA_DESCONHECIDO });
    return { texto: MENSAGEM_PARA_DESCONHECIDO, falante: null };
  }
  await registrar({ organizationId: falante.organization_id, userId: falante.id, telefone, direcao: 'entrada', texto: texto ?? `[${tipo}]` });

  const conta = await contaDaOrg(falante.organization_id);
  if (conta.situacao === 'bloqueada') return { texto: `A conta da ${falante.organizacao} está bloqueada (plano vencido). O CEO precisa regularizar em Configurações → Plano e assinatura.`, falante };
  if (!planoLibera(conta.plano, 'whatsapp')) return { texto: `O Stok Aí no WhatsApp faz parte do plano Empresarial. A ${falante.organizacao} está no ${NOME_DO_PLANO[conta.plano]} — fale com o CEO da conta para mudar.`, falante };
  if ((await mensagensNoMes(falante.organization_id)) > LIMITE_MENSAGENS_MES) return { texto: `A ${falante.organizacao} chegou ao limite de ${LIMITE_MENSAGENS_MES} mensagens neste mês. Use o painel ou fale com a gente.`, falante };

  if (tipo !== 'texto' || !texto) {
    return { texto: tipo === 'audio' ? 'Por enquanto entendo só texto — pode escrever?' : tipo === 'imagem' || tipo === 'documento' ? 'Ainda não leio fotos e arquivos por aqui. Escreva o que precisa, ou registre pelo painel.' : 'Não entendi. Pode escrever?', falante };
  }

  const conversa = await carregarConversa(telefone);

  // Confirmação ou cancelamento do que estava esperando — resolvido por código, não pela IA.
  if (conversa.pendentes.length) {
    const c = lerConfirmacao(texto);
    if (c.confirma) {
      if (falante.temPin) {
        if (!c.pin) return { texto: `Para confirmar, responda SIM seguido do seu PIN (ex.: "SIM 1234").`, falante };
        if (!(await bcrypt.compare(c.pin, falante.pinHash as string))) return { texto: 'PIN incorreto. Tente de novo: "SIM 1234".', falante };
      }
      const propostas = conversa.pendentes;
      conversa.pendentes = [];
      // Uma por vez, na ordem em que foram ditas; a que não der não impede as outras,
      // e cada linha da resposta diz o que aconteceu com cada uma.
      const linhas: string[] = [];
      for (const proposta of propostas) {
        try {
          linhas.push(await executarProposta(falante, proposta));
        } catch (e: any) {
          console.error('[whatsapp] executar:', e.message);
          linhas.push(`❌ ${proposta.resumo}: deu erro ao registrar. Tente pelo painel ou mais tarde.`);
        }
      }
      const resultado = linhas.join('\n\n');
      conversa.mensagens.push({ role: 'user', content: texto }, { role: 'assistant', content: resultado });
      await salvarConversa(falante, telefone, conversa);
      await registrar({ organizationId: falante.organization_id, userId: falante.id, telefone, direcao: 'saida', texto: resultado });
      return { texto: resultado, falante };
    }
    if (c.nega) {
      const quantas = conversa.pendentes.length;
      conversa.pendentes = [];
      const r = quantas > 1 ? `Cancelado. Nenhuma das ${quantas} foi registrada.` : 'Cancelado. Nada foi registrado.';
      conversa.mensagens.push({ role: 'user', content: texto }, { role: 'assistant', content: r });
      await salvarConversa(falante, telefone, conversa);
      await registrar({ organizationId: falante.organization_id, userId: falante.id, telefone, direcao: 'saida', texto: r });
      return { texto: r, falante };
    }
  } else {
    // Um "SIM" solto nunca chega à IA: sem proposta preparada pelo código, não há o que confirmar —
    // e a IA não pode ter a chance de "encenar" um registro.
    const c = lerConfirmacao(texto);
    if (c.confirma || c.nega) {
      const r = c.confirma ? SEM_PENDENCIA_PARA_CONFIRMAR : 'Não havia nada pendente. Se quiser, diga o que precisa.';
      conversa.mensagens.push({ role: 'user', content: texto }, { role: 'assistant', content: r });
      await salvarConversa(falante, telefone, conversa);
      await registrar({ organizationId: falante.organization_id, userId: falante.id, telefone, direcao: 'saida', texto: r });
      return { texto: r, falante };
    }
  }

  if (!claudeConfigurado()) return { texto: 'O assistente ainda não está ligado neste servidor. Use o painel por enquanto.', falante };

  const ctx = await montarContexto(falante);
  // Cada propor_* que deu certo entra aqui; no fim, todas esperam o mesmo SIM.
  const novasPropostas: Proposta[] = [];
  const historico: MensagemDoChat[] = [...conversa.mensagens.map((m) => ({ role: m.role, content: m.content })), { role: 'user', content: texto }];
  let resposta: string;
  let uso: Uso | undefined;
  let erro: string | undefined;
  let ferramentas: string[] = [];
  try {
    const executar = (name: string, input: Record<string, unknown>) =>
      executarFerramenta(ctx, name, input, (p) => {
        novasPropostas.push(p);
      });
    // effort low: conversa de WhatsApp não precisa de raciocínio longo, e cada token pensado é cobrado como saída.
    let r = await conversar({ system: systemPrompt(ctx, conversa.pendentes), historico, tools: FERRAMENTAS, executar, esforco: 'low' });

    // Duas maneiras de a IA falar além do que sabe: pedir SIM sem ter preparado
    // nada, e soltar número sem ter consultado. Nas duas, o código manda refazer
    // usando a ferramenta — e, se ela insistir, responde no lugar dela.
    const chamou = () => r.chamadas.map((c) => c.name);
    const encenou = () => pediuConfirmacaoSemProposta(r.texto, novasPropostas, conversa.pendentes);
    const chutou = () => respondeuNumeroSemConsultar(r.texto, chamou());
    if (encenou() || chutou()) {
      const cobranca = encenou()
        ? '[sistema] Você pediu confirmação sem chamar propor_movimentacao/propor_devolucao. Chame a ferramenta agora com o que a pessoa disse; se faltar dado, pergunte.'
        : '[sistema] Você respondeu com número sem consultar o sistema. Chame consultar_saldo (ou listar_pendencias/listar_estoques) e responda apenas com o que a ferramenta devolver.';
      const segunda = await conversar({
        system: systemPrompt(ctx, conversa.pendentes),
        historico: [...historico, { role: 'assistant', content: r.texto }, { role: 'user', content: cobranca }],
        tools: FERRAMENTAS,
        executar,
        esforco: 'low',
      });
      segunda.uso.tokens_entrada += r.uso.tokens_entrada;
      segunda.uso.tokens_cache += r.uso.tokens_cache;
      segunda.uso.tokens_saida += r.uso.tokens_saida;
      segunda.chamadas.unshift(...r.chamadas);
      r = segunda;
      if (encenou()) r = { ...r, texto: 'Não consegui preparar essa movimentação. Me diga o material, a quantidade e o estoque — ex.: "saiu 2 sacos de cimento do Central".' };
      else if (chutou()) r = { ...r, texto: 'Não consegui conferir isso no sistema agora. Pergunte de novo em instantes, ou veja no painel — prefiro não dar número sem ter certeza.' };
    }
    resposta = r.texto || 'Não entendi. Pode dizer de outro jeito?';
    uso = r.uso;
    ferramentas = r.chamadas.map((c) => c.name);
  } catch (e: any) {
    console.error('[whatsapp] IA:', e.message);
    erro = String(e.message).slice(0, 300);
    resposta = 'Tive um problema para responder agora. Tente de novo em instantes ou use o painel.';
  }

  if (novasPropostas.length) {
    conversa.pendentes = novasPropostas;
    // A IA pode ter pedido o SIM; se não pediu — ou se são várias e ela não disse quantas —, o código diz.
    const pediuSim = /\bsim\b/i.test(resposta);
    const disseQuantas = novasPropostas.length === 1 || resposta.includes(String(novasPropostas.length));
    if (!pediuSim || !disseQuantas) resposta += `\n\n${pedidoDeConfirmacao(novasPropostas.length, falante.temPin)}`;
  }
  conversa.mensagens.push({ role: 'user', content: texto }, { role: 'assistant', content: resposta, ...(erro ? { erro } : {}), ...(ferramentas.length ? { ferramentas } : {}) });
  await salvarConversa(falante, telefone, conversa);
  await registrar({ organizationId: falante.organization_id, userId: falante.id, telefone, direcao: 'saida', texto: resposta, uso });
  return { texto: resposta, falante, uso, erro };
}
