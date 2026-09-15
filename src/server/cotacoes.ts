/**
 * Cotações pelo WhatsApp: mandar a mesma pergunta a cada fornecedor, ler
 * o que ele responde, comparar. Divisão de trabalho igual à do assistente:
 * o código escreve a mensagem, manda, calcula total e fecha pedido; a IA
 * só faz o que código não faz — transformar "cimento tá 32 e a tinta 180,
 * entrego quinta" em preço por item. Nunca negocia, nunca compra.
 */

import { supabaseServer } from '../lib/supabaseServer';
import { scopedDb } from './tenant';
import { enviarTexto, variantesDoTelefone } from './evolution';
import { depositosDaOrg, saldosDoMaterial, calcularMovimento, gravarSaldos } from './estoque';
import { conversar, claudeConfigurado, type Ferramenta, type BlocoDeConteudo, type MensagemDoChat } from './claude';
import type { Midia } from './evolution';
import { mensagemDeCotacao, mensagemDePedido, totalDaResposta, formatarMoeda, listarItens, type ItemDeCotacao, type PrecoRespondido, type FalaComFornecedor } from '../shared/cotacoes';

// ---------------------------------------------------------------------------
//  Quem está falando: um fornecedor com cotação aberta
// ---------------------------------------------------------------------------

export interface FornecedorFalando {
  fornecedor: { id: string; nome: string; contato: string | null; whatsapp: string };
  organization_id: string;
  organizacao: string;
  cotacao: { id: string; titulo: string; itens: ItemDeCotacao[]; entrega: string | null; criado_por: number | null };
  resposta: { status: string; precos: PrecoRespondido[]; conversa: FalaComFornecedor[] };
  /** A instância da organização, se ela tem número próprio; senão a do Stok Aí. */
  instancia: string | null;
}

/**
 * Um número que não é usuário pode ser um fornecedor esperando cotação:
 * o mais recente que recebeu pergunta e cuja cotação ainda está aberta.
 * Se a mensagem veio pela instância de uma empresa, só as dela contam.
 */
export async function fornecedorPeloTelefone(telefone: string, instancia: string | null): Promise<FornecedorFalando | null> {
  const { data: fornecedores } = await supabaseServer.from('fornecedores').select('id, nome, contato, whatsapp, organization_id, organizations(nome, whatsapp_instancia)').in('whatsapp', variantesDoTelefone(telefone)).eq('ativo', true);
  if (!fornecedores?.length) return null;
  const candidatos = fornecedores.filter((f: any) => !instancia || !f.organizations?.whatsapp_instancia || f.organizations.whatsapp_instancia === instancia);
  if (!candidatos.length) return null;

  const { data: respostas } = await supabaseServer
    .from('cotacao_fornecedores')
    .select('cotacao_id, fornecedor_id, status, precos, conversa, enviada_em, cotacoes!inner(id, titulo, itens, entrega, criado_por, status)')
    .in('fornecedor_id', candidatos.map((f: any) => f.id))
    .in('status', ['enviada', 'respondida', 'sem_estoque', 'pedido'])
    .in('cotacoes.status', ['aberta', 'encerrada'])
    .order('enviada_em', { ascending: false })
    .limit(5);
  // Uma cotação aberta ganha de um pedido já fechado (ele ainda pode falar da entrega).
  const lista: any[] = respostas ?? [];
  const r: any = lista.find((x) => x.cotacoes.status === 'aberta') ?? lista[0];
  if (!r) return null;
  const f: any = candidatos.find((x: any) => x.id === r.fornecedor_id);
  return {
    fornecedor: { id: f.id, nome: f.nome, contato: f.contato, whatsapp: f.whatsapp },
    organization_id: f.organization_id,
    organizacao: f.organizations?.nome ?? 'a empresa',
    cotacao: { id: r.cotacoes.id, titulo: r.cotacoes.titulo, itens: r.cotacoes.itens ?? [], entrega: r.cotacoes.entrega, criado_por: r.cotacoes.criado_por },
    resposta: { status: r.status, precos: Array.isArray(r.precos) ? r.precos : [], conversa: Array.isArray(r.conversa) ? r.conversa : [] },
    instancia: f.organizations?.whatsapp_instancia ?? null,
  };
}

// ---------------------------------------------------------------------------
//  Mandar a cotação
// ---------------------------------------------------------------------------

interface CotacaoParaEnviar {
  id: string;
  titulo: string;
  itens: ItemDeCotacao[];
  entrega: string | null;
  observacoes: string | null;
}

/**
 * Manda a pergunta a cada fornecedor ainda pendente (ou com erro) e marca
 * o que aconteceu com cada um. Um fornecedor que falha não impede os outros.
 */
export async function enviarCotacao(organizationId: string, empresa: string, cotacao: CotacaoParaEnviar, instancia: string | null, apenas?: string[]): Promise<{ enviados: number; falhas: number }> {
  const db = scopedDb(organizationId);
  let q = db.from('cotacao_fornecedores').select('fornecedor_id, status, conversa, fornecedores(nome, contato, whatsapp)').eq('cotacao_id', cotacao.id).in('status', ['pendente', 'erro', 'enviada']);
  if (apenas?.length) q = q.in('fornecedor_id', apenas);
  const { data: linhas } = await q;
  let enviados = 0;
  let falhas = 0;
  for (const linha of (linhas ?? []) as any[]) {
    const f = linha.fornecedores;
    const texto = mensagemDeCotacao({ empresa, contato: f.contato, titulo: cotacao.titulo, itens: cotacao.itens, entrega: cotacao.entrega, observacoes: cotacao.observacoes });
    const conversa: FalaComFornecedor[] = Array.isArray(linha.conversa) ? linha.conversa : [];
    try {
      await enviarTexto(f.whatsapp, texto, instancia);
      conversa.push({ de: 'nos', texto, em: new Date().toISOString() });
      await db.from('cotacao_fornecedores').update({ status: 'enviada', enviada_em: new Date().toISOString(), erro: null, conversa }).eq('cotacao_id', cotacao.id).eq('fornecedor_id', linha.fornecedor_id);
      enviados += 1;
    } catch (e: any) {
      await db.from('cotacao_fornecedores').update({ status: 'erro', erro: String(e.message).slice(0, 300) }).eq('cotacao_id', cotacao.id).eq('fornecedor_id', linha.fornecedor_id);
      falhas += 1;
    }
  }
  return { enviados, falhas };
}

// ---------------------------------------------------------------------------
//  Ler a resposta do fornecedor
// ---------------------------------------------------------------------------

const FERRAMENTAS: Ferramenta[] = [
  {
    name: 'registrar_precos',
    description: 'Registra o que o fornecedor informou, item por item (pelo número do item). Chame sempre que a mensagem trouxer preço, prazo ou "não tenho" de algum item. Pode chamar com só os itens mencionados; os outros ficam como estavam.',
    input_schema: {
      type: 'object',
      properties: {
        itens: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              n: { type: 'integer', description: 'Número do item na lista' },
              preco_unitario: { type: 'number', description: 'Preço por unidade, em reais. Se o fornecedor deu o total do item, divida pela quantidade.' },
              disponivel: { type: 'boolean', description: 'false se ele disse que não tem / não trabalha com o item' },
              prazo: { type: 'string', description: 'Prazo de entrega como ele disse ("2 dias", "sexta")' },
              observacao: { type: 'string', description: 'Condição relevante: marca, mínimo, pagamento, frete' },
            },
            required: ['n'],
          },
        },
      },
      required: ['itens'],
    },
  },
];

function precosAtuais(itens: ItemDeCotacao[], precos: PrecoRespondido[]): string {
  return itens
    .map((i) => {
      const p = precos.find((x) => x.n === i.n);
      if (!p) return `${i.n}) ${i.descricao}: sem resposta`;
      if (!p.disponivel) return `${i.n}) ${i.descricao}: não tem`;
      return `${i.n}) ${i.descricao}: ${p.preco_unitario === null ? 'sem preço' : formatarMoeda(p.preco_unitario) + '/' + i.unidade}${p.prazo ? `, prazo ${p.prazo}` : ''}`;
    })
    .join('\n');
}

function systemPromptDoFornecedor(ctx: FornecedorFalando): string {
  return [
    `Você é o assistente de compras da ${ctx.organizacao}, falando pelo WhatsApp com o fornecedor ${ctx.fornecedor.nome}${ctx.fornecedor.contato ? ` (${ctx.fornecedor.contato})` : ''} sobre a cotação "${ctx.cotacao.titulo}".`,
    `Itens pedidos:\n${listarItens(ctx.cotacao.itens)}`,
    `O que já está registrado:\n${precosAtuais(ctx.cotacao.itens, ctx.resposta.precos)}`,
    'Sua única tarefa: quando ele informar preço, prazo ou "não tenho", registrar com registrar_precos (pelo número do item). Depois responda curto e educado, em português do Brasil, como uma mensagem de WhatsApp de 1 a 3 linhas.',
    'Se ainda faltar preço de algum item, agradeça e pergunte só o que falta, citando o número. Se estiver tudo respondido, agradeça e diga que a empresa vai avaliar e retorna por aqui.',
    'Você NÃO negocia, NÃO aceita nem recusa preço, NÃO confirma compra, NÃO inventa dado. Se ele perguntar algo que você não sabe (pagamento, CNPJ, endereço exato, quantidade diferente), diga que a empresa retorna com isso.',
    'Se a mensagem não for sobre a cotação, responda em uma linha e volte ao assunto.',
  ].join('\n');
}

export interface RespostaAoFornecedor {
  texto: string;
  precos: PrecoRespondido[];
  total: number | null;
  status: 'respondida' | 'sem_estoque' | 'enviada' | 'pedido';
  /** Quem pediu a cotação recebe um aviso no WhatsApp quando a resposta muda algo. */
  avisar: boolean;
  /** Com pedido fechado, o que o fornecedor disse vai inteiro para quem comprou. */
  recado?: string;
}

const IMAGENS = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

/** O que dá para mandar à IA: fotos e PDF. Áudio e outros arquivos, não. */
export function midiaLegivel(m: Midia | null | undefined): m is Midia {
  return Boolean(m && (IMAGENS.has(m.mimetype) || m.mimetype === 'application/pdf'));
}

/** Entrou uma mensagem do fornecedor: extrai o que ele disse e responde. Grava na linha da cotação. */
export async function responderFornecedor(ctx: FornecedorFalando, texto: string | null, tipo: string, midia?: Midia | null): Promise<RespostaAoFornecedor> {
  const db = scopedDb(ctx.organization_id);
  const conversa = [...ctx.resposta.conversa];
  let precos = [...ctx.resposta.precos];
  let resposta: string;
  let avisar = false;

  const comMidia = midiaLegivel(midia);
  if ((tipo !== 'texto' || !texto) && !comMidia) {
    conversa.push({ de: 'fornecedor', texto: `[${tipo}]`, em: new Date().toISOString() });
    resposta = tipo === 'imagem' || tipo === 'documento' ? 'Obrigado! Não consegui abrir esse arquivo — pode me passar os preços em texto, pelo número de cada item?' : 'Pode escrever os preços em texto, pelo número de cada item? Obrigado!';
  } else if (ctx.resposta.status === 'pedido') {
    // Pedido já fechado: nada a extrair. Agradece e repassa o recado a quem comprou.
    conversa.push({ de: 'fornecedor', texto: texto ?? `[${tipo}]`, em: new Date().toISOString() });
    resposta = `Obrigado! Já repassei para a ${ctx.organizacao}.`;
    avisar = true;
  } else {
    // A foto (ou PDF) vai para a IA junto com a legenda; no histórico fica só a marca.
    const textoDaVez = comMidia ? `${texto ? `${texto} ` : ''}[${tipo === 'documento' ? 'arquivo' : 'foto'} enviado]` : (texto as string);
    conversa.push({ de: 'fornecedor', texto: textoDaVez, em: new Date().toISOString() });
    if (!claudeConfigurado()) {
      resposta = 'Obrigado! A empresa vai avaliar e retorna por aqui.';
    } else {
      const historico: MensagemDoChat[] = conversa.slice(-10, -1).map((f) => ({ role: (f.de === 'nos' ? 'assistant' : 'user') as 'assistant' | 'user', content: f.texto }));
      const blocos: BlocoDeConteudo[] = [];
      if (comMidia) blocos.push(midia.mimetype === 'application/pdf' ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: midia.base64 } } : { type: 'image', source: { type: 'base64', media_type: midia.mimetype, data: midia.base64 } });
      blocos.push({ type: 'text', text: comMidia ? `${texto ? `${texto}\n\n` : ''}(O fornecedor mandou ${tipo === 'documento' ? 'este arquivo' : 'esta foto'}. Procure nele os preços dos itens da cotação e registre só o que corresponde a eles.)` : (texto as string) });
      historico.push({ role: 'user', content: blocos });
      // A conversa tem que começar pela pessoa (o fornecedor) para a API; a nossa pergunta inicial já está no system.
      while (historico.length && historico[0].role === 'assistant') historico.shift();
      try {
        const r = await conversar({
          system: systemPromptDoFornecedor(ctx),
          historico,
          tools: FERRAMENTAS,
          maxTokens: 400,
          executar: async (name, input) => {
            if (name !== 'registrar_precos') return 'Ferramenta desconhecida.';
            const lidos = Array.isArray((input as any).itens) ? ((input as any).itens as any[]) : [];
            for (const it of lidos) {
              const n = Number(it.n);
              if (!ctx.cotacao.itens.some((i) => i.n === n)) continue;
              const preco = it.preco_unitario === undefined || it.preco_unitario === null ? null : Number(it.preco_unitario);
              const novo: PrecoRespondido = {
                n,
                preco_unitario: preco !== null && Number.isFinite(preco) && preco >= 0 ? Math.round(preco * 100) / 100 : null,
                disponivel: it.disponivel === undefined ? true : Boolean(it.disponivel),
                prazo: it.prazo ? String(it.prazo).slice(0, 80) : null,
                observacao: it.observacao ? String(it.observacao).slice(0, 200) : null,
              };
              precos = [...precos.filter((p) => p.n !== n), novo].sort((a, b) => a.n - b.n);
              avisar = true;
            }
            return `Registrado. Situação agora:\n${precosAtuais(ctx.cotacao.itens, precos)}`;
          },
        });
        resposta = r.texto || 'Obrigado! A empresa vai avaliar e retorna por aqui.';
      } catch (e: any) {
        console.error('[cotacao] IA:', e.message);
        resposta = 'Obrigado! Recebi sua mensagem; a empresa vai avaliar e retorna por aqui.';
      }
    }
  }

  conversa.push({ de: 'nos', texto: resposta, em: new Date().toISOString() });
  const { total, itensCotados } = totalDaResposta(ctx.cotacao.itens, precos);
  if (ctx.resposta.status === 'pedido') {
    await db.from('cotacao_fornecedores').update({ conversa: conversa.slice(-30) }).eq('cotacao_id', ctx.cotacao.id).eq('fornecedor_id', ctx.fornecedor.id);
    return { texto: resposta, precos, total: itensCotados > 0 ? total : null, status: 'pedido', avisar, recado: texto ?? `[${tipo}]` };
  }
  const semNada = precos.length > 0 && precos.every((p) => !p.disponivel);
  const status: RespostaAoFornecedor['status'] = semNada ? 'sem_estoque' : precos.length > 0 ? 'respondida' : 'enviada';
  await db
    .from('cotacao_fornecedores')
    .update({ precos, total: itensCotados > 0 ? total : null, status, respondida_em: precos.length > 0 ? new Date().toISOString() : null, conversa: conversa.slice(-30) })
    .eq('cotacao_id', ctx.cotacao.id)
    .eq('fornecedor_id', ctx.fornecedor.id);
  return { texto: resposta, precos, total: itensCotados > 0 ? total : null, status, avisar };
}

/** Avisa quem pediu a cotação, no WhatsApp dele, que um fornecedor respondeu. Silencioso se não der. */
export async function avisarQuemPediu(ctx: FornecedorFalando, r: RespostaAoFornecedor): Promise<void> {
  if (!ctx.cotacao.criado_por) return;
  const { data: u } = await supabaseServer.from('estoque_users').select('whatsapp').eq('id', ctx.cotacao.criado_por).maybeSingle();
  if (!u?.whatsapp) return;
  const { itensCotados } = totalDaResposta(ctx.cotacao.itens, r.precos);
  const texto =
    r.status === 'pedido'
      ? `💬 ${ctx.fornecedor.nome}, sobre o pedido "${ctx.cotacao.titulo}": "${(r.recado ?? '').slice(0, 500)}"`
      : r.status === 'sem_estoque'
      ? `📩 ${ctx.fornecedor.nome} respondeu a cotação "${ctx.cotacao.titulo}": não tem os itens.`
      : `📩 ${ctx.fornecedor.nome} respondeu a cotação "${ctx.cotacao.titulo}": ${itensCotados} de ${ctx.cotacao.itens.length} item(ns), total ${formatarMoeda(r.total)}. Compare em Compras → Cotações.`;
  try {
    await enviarTexto(u.whatsapp, texto, ctx.instancia);
  } catch (e: any) {
    console.error('[cotacao] aviso:', e.message);
  }
}

// ---------------------------------------------------------------------------
//  Fechar o pedido
// ---------------------------------------------------------------------------

/** Manda o pedido ao fornecedor escolhido e encerra a cotação. Devolve o texto enviado. */
export async function fecharPedido(organizationId: string, empresa: string, cotacaoId: string, fornecedorId: string, observacoes: string | null, instancia: string | null): Promise<{ texto: string; total: number }> {
  const db = scopedDb(organizationId);
  const { data: c } = await db.from('cotacoes').select('id, titulo, itens, entrega, status').eq('id', cotacaoId).maybeSingle();
  if (!c) throw new Error('Cotação não encontrada.');
  if (c.status !== 'aberta') throw new Error('Esta cotação já foi encerrada.');
  const { data: linha } = await db.from('cotacao_fornecedores').select('status, precos, conversa, fornecedores(nome, contato, whatsapp)').eq('cotacao_id', cotacaoId).eq('fornecedor_id', fornecedorId).maybeSingle();
  if (!linha) throw new Error('Este fornecedor não está nesta cotação.');
  const precos: PrecoRespondido[] = Array.isArray(linha.precos) ? linha.precos : [];
  const { total, itensCotados } = totalDaResposta(c.itens ?? [], precos);
  if (itensCotados === 0) throw new Error('Este fornecedor ainda não passou preço.');
  const f: any = linha.fornecedores;
  const texto = mensagemDePedido({ empresa, contato: f.contato, titulo: c.titulo, itens: c.itens ?? [], precos, entrega: c.entrega, observacoes });
  await enviarTexto(f.whatsapp, texto, instancia);
  const conversa: FalaComFornecedor[] = Array.isArray(linha.conversa) ? linha.conversa : [];
  conversa.push({ de: 'nos', texto, em: new Date().toISOString() });
  const agora = new Date().toISOString();
  await db.from('cotacao_fornecedores').update({ status: 'pedido', conversa: conversa.slice(-30) }).eq('cotacao_id', cotacaoId).eq('fornecedor_id', fornecedorId);
  await db.from('cotacoes').update({ status: 'encerrada', encerrada_em: agora, pedido: { fornecedor_id: fornecedorId, total, enviado_em: agora } }).eq('id', cotacaoId);
  return { texto, total };
}

// ---------------------------------------------------------------------------
//  O material chegou: entrada a partir do pedido
// ---------------------------------------------------------------------------

/**
 * Dá entrada, no estoque escolhido, de cada item do pedido fechado que
 * está ligado a um material do catálogo (itens escritos à mão ficam de
 * fora — o sistema não sabe o que são). Só uma vez por pedido.
 */
export async function darEntradaDoPedido(organizationId: string, cotacaoId: string, depositoId: string, matricula: string): Promise<{ lancados: string[]; ignorados: string[] }> {
  const db = scopedDb(organizationId);
  const { data: c } = await db.from('cotacoes').select('id, titulo, itens, status, pedido').eq('id', cotacaoId).maybeSingle();
  if (!c) throw new Error('Cotação não encontrada.');
  if (c.status !== 'encerrada' || !c.pedido?.fornecedor_id) throw new Error('Só dá entrada em cotação com pedido fechado.');
  if (c.pedido.entrada_em) throw new Error('A entrada deste pedido já foi lançada.');
  const depositos = await depositosDaOrg(db);
  const deposito = depositos.find((d) => d.id === depositoId && d.ativo);
  if (!deposito) throw new Error('Estoque não encontrado.');
  if (deposito.modo !== 'almoxarifado') throw new Error('Por enquanto a entrada automática é só em estoque do modo almoxarifado; nos outros, lance pelo painel do estoque.');
  const { data: linha } = await db.from('cotacao_fornecedores').select('precos, fornecedores(nome)').eq('cotacao_id', cotacaoId).eq('fornecedor_id', c.pedido.fornecedor_id).maybeSingle();
  const precos: PrecoRespondido[] = Array.isArray(linha?.precos) ? linha!.precos : [];
  const fornecedor = (linha as any)?.fornecedores?.nome ?? 'fornecedor';

  const lancados: string[] = [];
  const ignorados: string[] = [];
  for (const item of (c.itens ?? []) as ItemDeCotacao[]) {
    const p = precos.find((x) => x.n === item.n);
    if (!p || !p.disponivel || p.preco_unitario === null) continue; // não fez parte do pedido
    if (!item.material_id) {
      ignorados.push(item.descricao);
      continue;
    }
    const atuais = await saldosDoMaterial(db, item.material_id);
    const calculo = calcularMovimento(atuais, { destino_id: deposito.id, quantidade: item.quantidade, rotulo: 'Entrada', nomeDe: () => deposito.nome });
    if (!calculo.ok) {
      ignorados.push(`${item.descricao} (${calculo.erro})`);
      continue;
    }
    await gravarSaldos(db, item.material_id, calculo.novos);
    await db.from('material_movements').insert({
      material_id: item.material_id,
      tipo_operacao: 'ENTRADA',
      quantidade: item.quantidade,
      warehouse_origem_id: null,
      warehouse_destino_id: deposito.id,
      funcionario_matricula: matricula,
      justificativa: `Pedido "${c.titulo}" — ${fornecedor} (${formatarMoeda(p.preco_unitario)}/${item.unidade})`,
    });
    lancados.push(item.descricao);
  }
  await db.from('cotacoes').update({ pedido: { ...c.pedido, entrada_em: new Date().toISOString(), deposito_id: deposito.id } }).eq('id', cotacaoId);
  return { lancados, ignorados };
}
