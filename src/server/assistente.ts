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
import { conversar, claudeConfigurado, type Ferramenta, type MensagemDoChat, type Uso } from './claude';
import { variantesDoTelefone } from './evolution';
import { contaDaOrg } from './planos';
import { planoLibera, NOME_DO_PLANO } from '../shared/planos';
import { stockStatus } from '../features/estoque/utils';

// ---------------------------------------------------------------------------
//  Quem pode o quê pelo WhatsApp
// ---------------------------------------------------------------------------

/** As operações que existem pelo WhatsApp (ajuste, recontagem e cadastro ficam no painel). */
export type OperacaoWhatsapp = 'SAIDA' | 'CONSUMO' | 'TRANSFERENCIA' | 'ENTRADA' | 'DEVOLUCAO';
export const OPERACOES_WHATSAPP: readonly OperacaoWhatsapp[] = ['SAIDA', 'CONSUMO', 'TRANSFERENCIA', 'ENTRADA', 'DEVOLUCAO'];
export const NOME_DA_OPERACAO_WHATSAPP: Record<OperacaoWhatsapp, string> = { SAIDA: 'saída', CONSUMO: 'consumo', TRANSFERENCIA: 'transferência', ENTRADA: 'entrada', DEVOLUCAO: 'devolução de empréstimo' };

/** O padrão do cargo, quando o usuário não tem lista própria. */
export function operacoesPadrao(role: string): OperacaoWhatsapp[] {
  return ehAdmin(role) ? ['SAIDA', 'CONSUMO', 'TRANSFERENCIA', 'ENTRADA', 'DEVOLUCAO'] : ['SAIDA', 'CONSUMO', 'TRANSFERENCIA', 'DEVOLUCAO'];
}

export function ehOperacaoWhatsapp(s: unknown): s is OperacaoWhatsapp {
  return typeof s === 'string' && (OPERACOES_WHATSAPP as readonly string[]).includes(s);
}

/** A lista válida a partir do que o administrador marcou (nulo = padrão do cargo). */
export function operacoesDoUsuario(role: string, lista: unknown): OperacaoWhatsapp[] {
  if (!Array.isArray(lista)) return operacoesPadrao(role);
  return lista.filter(ehOperacaoWhatsapp);
}

/** "SIM", "sim 1234", "confirmo" → a confirmação e o PIN, se veio. */
export function lerConfirmacao(texto: string): { confirma: boolean; nega: boolean; pin: string | null } {
  const t = texto.trim().toLowerCase();
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

interface Contexto {
  db: ScopedDb;
  falante: Falante;
  acessos: Acessos;
  depositos: Deposito[];
  unidades: Array<{ id: string; nome: string }>;
  materiais: Array<{ id: number; nome: string; unidade_medida: string; estoque_minimo: number; saldos: Record<string, number> }>;
}

async function montarContexto(falante: Falante): Promise<Contexto> {
  const db = scopedDb(falante.organization_id);
  const [acessos, todos, unidades, saldos, materiaisRes] = await Promise.all([
    acessosDoUsuario(db, falante.id, falante.role),
    depositosDaOrg(db),
    unidadesDaOrg(db),
    saldosDaOrg(db),
    db.from('materials').select('id, nome, unidade_medida, estoque_minimo').order('nome'),
  ]);
  const depositos = todos.filter((d) => d.ativo && podeVer(acessos, d.id));
  const visiveis = new Set(depositos.map((d) => d.id));
  const materiais = ((materiaisRes.data || []) as any[]).map((m) => {
    const s = saldos.get(m.id) || {};
    return { id: m.id, nome: m.nome, unidade_medida: m.unidade_medida, estoque_minimo: Number(m.estoque_minimo), saldos: Object.fromEntries(Object.entries(s).filter(([id]) => visiveis.has(id))) };
  });
  return { db, falante, acessos, depositos, unidades: unidades.map((u) => ({ id: u.id, nome: u.nome })), materiais };
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
  if (!ctx.falante.operacoes.includes(operacao)) return { ok: false, erro: `${ctx.falante.nome} não pode registrar ${NOME_DA_OPERACAO_WHATSAPP[operacao]} pelo WhatsApp. Peça ao administrador ou use o painel.` };

  const quantidade = arredondar(Number(input.quantidade));
  if (!Number.isFinite(quantidade) || quantidade <= 0) return { ok: false, erro: 'Informe uma quantidade maior que zero.' };

  const achados = acharMateriais(ctx.materiais, String(input.material ?? ''));
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
    if (!calculo.ok) return `Não deu: ${calculo.erro}`;
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
    if (!emp || emp.devolvido_em) return 'Essa retirada já foi devolvida.';
    const falta = arredondar(Number(emp.quantidade) - Number(emp.quantidade_devolvida));
    const atuais = await saldosDoMaterial(db, emp.material_id);
    const calculo = calcularMovimento(atuais, { destino_id: emp.warehouse_id, quantidade: falta, rotulo: 'esta devolução', nomeDe: (id) => id });
    if (!calculo.ok) return `Não deu: ${calculo.erro}`;
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

const FERRAMENTAS: Ferramenta[] = [
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
    description: 'Prepara uma movimentação (SAIDA, CONSUMO, TRANSFERENCIA ou ENTRADA) para a pessoa confirmar. NUNCA executa: devolve o resumo que deve ser apresentado pedindo "SIM". Se faltar dado (material ambíguo, estoque), devolve o que perguntar.',
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

async function executarFerramenta(ctx: Contexto, name: string, input: Record<string, unknown>, guardar: (p: Proposta) => void): Promise<string> {
  if (name === 'consultar_saldo') {
    const achados = acharMateriais(ctx.materiais, String(input.material ?? ''));
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
    const faltando = ctx.materiais
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

function systemPrompt(ctx: Contexto, pendente: Proposta | null): string {
  const hoje = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  return [
    `Você é o assistente do Stok Aí (sistema de controle de estoque) no WhatsApp, falando com ${ctx.falante.nome} (${ctx.falante.role === 'CEO' ? 'CEO' : ehAdmin(ctx.falante.role) ? 'administrador' : 'operador'}) da empresa ${ctx.falante.organizacao}. Hoje é ${hoje}.`,
    'Responda curto, em português do Brasil, como uma mensagem de WhatsApp: sem markdown pesado, no máximo umas 6 linhas, números claros. Use as ferramentas para tudo que é dado — nunca invente saldo, nome de material ou estoque.',
    `Estoques que a pessoa vê: ${ctx.depositos.map((d) => `${d.nome} [${d.modo}${podeOperar(ctx.acessos, d.id) ? ', opera' : ', consulta'}]`).join('; ') || 'nenhum'}.`,
    `Operações que ela pode registrar pelo WhatsApp: ${ctx.falante.operacoes.map((o) => NOME_DA_OPERACAO_WHATSAPP[o]).join(', ') || 'nenhuma (só consulta)'}. Fora disso, diga que é só pelo painel ou com o administrador.`,
    'Gravação (saída, consumo, transferência, entrada, devolução): você NÃO tem como registrar nem preparar nada sozinha — só a ferramenta propor_movimentacao/propor_devolucao prepara. Chame-a sempre que a pessoa disser uma movimentação; só depois de ela devolver PROPOSTA PRONTA apresente o resumo e peça SIM. Nunca escreva "confirma", "SIM" ou "registrado" sem isso. Quem grava é o sistema, quando a pessoa responde SIM; quem avisa que gravou também é o sistema — nunca você. Se a ferramenta devolver dúvida (material ambíguo, estoque), pergunte à pessoa.',
    pendente ? `Há uma ação esperando confirmação: "${pendente.resumo}". Se a pessoa mudar de assunto, atenda; se quiser cancelar, diga que pode responder NÃO.` : '',
    'Nunca revele dados de outros estoques ou empresas. Se perguntarem algo fora de estoque, responda em uma linha e volte ao assunto.',
    'Se perguntarem o que você faz: consulta saldo, onde está cada material e o que está faltando; registra o que estiver liberado acima, sempre pedindo SIM. Só isso — cadastro, ajuste e relatórios são no painel.',
    `Suporte: se a pessoa relatar problema com o sistema (algo não funciona, erro, senha, acesso, plano, cobrança, cadastro) ou pedir ajuda com o próprio Stok Aí, não chute causa nem prometa conserto. Diga em uma linha que isso é com a equipe do Stok Aí, que lê este mesmo número e responde por aqui${ehAdmin(ctx.falante.role) ? '; você vê o estado da conexão e o simulador em Configurações → Stok Aí no WhatsApp' : '; o administrador da sua empresa também pode ajudar'}. Depois volte ao estoque.`,
  ]
    .filter(Boolean)
    .join('\n');
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
export function pediuConfirmacaoSemProposta(texto: string, nova: Proposta | null, pendente: Proposta | null): boolean {
  if (nova || pendente) return false;
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
  pendente: Proposta | null;
}

async function carregarConversa(telefone: string): Promise<Conversa> {
  const { data } = await supabaseServer.from('whatsapp_conversas').select('id, mensagens, pendente').eq('telefone', telefone).maybeSingle();
  if (!data) return { mensagens: [], pendente: null };
  const pendente = data.pendente as Proposta | null;
  return { id: data.id, mensagens: Array.isArray(data.mensagens) ? data.mensagens : [], pendente: pendente && new Date(pendente.expira_em).getTime() > Date.now() ? pendente : null };
}

async function salvarConversa(falante: Falante, telefone: string, c: Conversa) {
  const mensagens = c.mensagens.slice(-12);
  await supabaseServer.from('whatsapp_conversas').upsert({ organization_id: falante.organization_id, user_id: falante.id, telefone, mensagens, pendente: c.pendente, atualizado_em: new Date().toISOString() }, { onConflict: 'telefone' });
}

async function registrar(args: { organizationId: string | null; userId: number | null; telefone: string; direcao: 'entrada' | 'saida'; texto: string; uso?: Uso | null }) {
  try {
    await supabaseServer.from('whatsapp_mensagens').insert({ organization_id: args.organizationId, user_id: args.userId, telefone: args.telefone, direcao: args.direcao, texto: args.texto.slice(0, 4000), tokens_entrada: args.uso?.tokens_entrada ?? null, tokens_saida: args.uso?.tokens_saida ?? null, modelo: args.uso?.modelo ?? null });
  } catch (e: any) {
    console.error('[whatsapp] não registrou mensagem:', e.message);
  }
}

async function mensagensNoMes(organizationId: string): Promise<number> {
  const inicio = new Date();
  inicio.setDate(1);
  inicio.setHours(0, 0, 0, 0);
  const { count } = await supabaseServer.from('whatsapp_mensagens').select('*', { count: 'exact', head: true }).eq('organization_id', organizationId).eq('direcao', 'entrada').gte('criado_em', inicio.toISOString());
  return count ?? 0;
}

export interface Resposta {
  texto: string;
  falante: Falante | null;
  uso?: Uso;
  /** Motivo técnico quando a IA falhou — para o administrador no simulador, nunca para o WhatsApp. */
  erro?: string;
}

/**
 * Uma mensagem chegou: descobre quem é, resolve confirmações, ou conversa
 * com a IA. Devolve o texto a mandar de volta (quem chama envia).
 */
export async function responder(telefone: string, texto: string | null, tipo: 'texto' | 'imagem' | 'audio' | 'documento' | 'outro' = 'texto'): Promise<Resposta> {
  const falante = await falantePeloTelefone(telefone);
  if (!falante) {
    await registrar({ organizationId: null, userId: null, telefone, direcao: 'entrada', texto: texto ?? `[${tipo}]` });
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
  if (conversa.pendente) {
    const c = lerConfirmacao(texto);
    if (c.confirma) {
      if (falante.temPin) {
        if (!c.pin) return { texto: `Para confirmar, responda SIM seguido do seu PIN (ex.: "SIM 1234").`, falante };
        if (!(await bcrypt.compare(c.pin, falante.pinHash as string))) return { texto: 'PIN incorreto. Tente de novo: "SIM 1234".', falante };
      }
      const proposta = conversa.pendente;
      conversa.pendente = null;
      let resultado: string;
      try {
        resultado = await executarProposta(falante, proposta);
      } catch (e: any) {
        console.error('[whatsapp] executar:', e.message);
        resultado = 'Deu erro ao registrar. Tente pelo painel ou mais tarde.';
      }
      conversa.mensagens.push({ role: 'user', content: texto }, { role: 'assistant', content: resultado });
      await salvarConversa(falante, telefone, conversa);
      await registrar({ organizationId: falante.organization_id, userId: falante.id, telefone, direcao: 'saida', texto: resultado });
      return { texto: resultado, falante };
    }
    if (c.nega) {
      conversa.pendente = null;
      const r = 'Cancelado. Nada foi registrado.';
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
  let novaProposta: Proposta | null = null;
  const historico: MensagemDoChat[] = [...conversa.mensagens.map((m) => ({ role: m.role, content: m.content })), { role: 'user', content: texto }];
  let resposta: string;
  let uso: Uso | undefined;
  let erro: string | undefined;
  let ferramentas: string[] = [];
  try {
    const executar = (name: string, input: Record<string, unknown>) =>
      executarFerramenta(ctx, name, input, (p) => {
        novaProposta = p;
      });
    let r = await conversar({ system: systemPrompt(ctx, conversa.pendente), historico, tools: FERRAMENTAS, executar });
    if (pediuConfirmacaoSemProposta(r.texto, novaProposta, conversa.pendente)) {
      // Pediu SIM sem chamar propor_*: repete a rodada mandando usar a ferramenta. Se insistir, o código responde.
      const segunda = await conversar({
        system: systemPrompt(ctx, conversa.pendente),
        historico: [...historico, { role: 'assistant', content: r.texto }, { role: 'user', content: '[sistema] Você pediu confirmação sem chamar propor_movimentacao/propor_devolucao. Chame a ferramenta agora com o que a pessoa disse; se faltar dado, pergunte.' }],
        tools: FERRAMENTAS,
        executar,
      });
      segunda.uso.tokens_entrada += r.uso.tokens_entrada;
      segunda.uso.tokens_saida += r.uso.tokens_saida;
      segunda.chamadas.unshift(...r.chamadas);
      r = segunda;
      if (pediuConfirmacaoSemProposta(r.texto, novaProposta, conversa.pendente)) r = { ...r, texto: 'Não consegui preparar essa movimentação. Me diga o material, a quantidade e o estoque — ex.: "saiu 2 sacos de cimento do Central".' };
    }
    resposta = r.texto || 'Não entendi. Pode dizer de outro jeito?';
    uso = r.uso;
    ferramentas = r.chamadas.map((c) => c.name);
  } catch (e: any) {
    console.error('[whatsapp] IA:', e.message);
    erro = String(e.message).slice(0, 300);
    resposta = 'Tive um problema para responder agora. Tente de novo em instantes ou use o painel.';
  }

  if (novaProposta) {
    conversa.pendente = novaProposta;
    if (!/\bsim\b/i.test(resposta)) resposta += `\n\nResponda SIM para confirmar${falante.temPin ? ' (com o PIN: "SIM 1234")' : ''}.`;
  }
  conversa.mensagens.push({ role: 'user', content: texto }, { role: 'assistant', content: resposta, ...(erro ? { erro } : {}), ...(ferramentas.length ? { ferramentas } : {}) });
  await salvarConversa(falante, telefone, conversa);
  await registrar({ organizationId: falante.organization_id, userId: falante.id, telefone, direcao: 'saida', texto: resposta, uso });
  return { texto: resposta, falante, uso, erro };
}
