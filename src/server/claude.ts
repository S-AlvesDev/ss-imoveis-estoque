/**
 * A API de mensagens da Anthropic, no mínimo que o assistente usa: uma
 * conversa com ferramentas, em laço até o modelo responder em texto.
 * Sem SDK: um fetch, para não trazer dependência por causa de um endpoint.
 */

export interface AmbienteClaude {
  ANTHROPIC_API_KEY?: string;
  /**
   * Padrão: claude-sonnet-5. Haiku 4.5 (claude-haiku-4-5-20251001) é mais
   * barato por token, mas não aceita `effort` e só guarda em cache prompts a
   * partir de 4.096 tokens — o nosso é menor, então nele o cache não pega.
   */
  ASSISTENTE_MODELO?: string;
}

export const MODELO_PADRAO = 'claude-sonnet-5';

/** A chave como vai no cabeçalho: sem espaço ou quebra de linha que veio junto no colar. */
function chave(env: AmbienteClaude): string {
  return String(env.ANTHROPIC_API_KEY ?? '').trim();
}

export function claudeConfigurado(env: AmbienteClaude = process.env as AmbienteClaude): boolean {
  return chave(env) !== '';
}

export interface Ferramenta {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

/** Um pedaço do system prompt; o marcado com cache_control (e tudo antes dele) fica guardado entre chamadas. */
export interface BlocoDeSistema {
  type: 'text';
  text: string;
  cache_control?: { type: 'ephemeral' };
}

/**
 * System prompt em duas partes para o cache da Anthropic aproveitar: o que é
 * igual em toda chamada (regras) vai primeiro e marcado; o que muda por pessoa
 * ou por dia (nome, estoques, data) vai depois, fora do cache.
 *
 * O cache é por prefixo: qualquer byte diferente antes do marcador invalida
 * tudo. Por isso nada de data ou nome no bloco fixo. As ferramentas entram no
 * prefixo antes do system, então também precisam ser sempre as mesmas.
 * Reaproveitado, o prefixo custa 10% do preço; dura 5 minutos renovados a cada uso.
 */
export function systemComCache(fixo: string, variavel: string): BlocoDeSistema[] {
  return [
    { type: 'text', text: fixo, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: variavel },
  ];
}

export type BlocoDeConteudo =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
  | { type: 'document'; source: { type: 'base64'; media_type: 'application/pdf'; data: string } }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean };

export interface MensagemDoChat {
  role: 'user' | 'assistant';
  content: string | BlocoDeConteudo[];
}

export interface Uso {
  /** Cobrados a preço cheio: o que não estava em cache, mais o que foi gravado nele. */
  tokens_entrada: number;
  /** Lidos do cache: custam 10% do preço de entrada. Zero em toda chamada = o cache não está pegando. */
  tokens_cache: number;
  tokens_saida: number;
  modelo: string;
}

/** Quanto o modelo pensa antes de responder. `low` basta para conversa curta e corta o custo de saída. */
export type Esforco = 'low' | 'medium' | 'high';

/** Haiku 4.5 e Sonnet 4.5 rejeitam o parâmetro `effort` (400); nos demais ele é aceito. */
export function aceitaEsforco(modelo: string): boolean {
  return !/haiku|sonnet-4-5/i.test(modelo);
}

interface RespostaDaApi {
  content: BlocoDeConteudo[];
  stop_reason: 'end_turn' | 'tool_use' | 'max_tokens' | string;
  usage?: { input_tokens?: number; output_tokens?: number; cache_creation_input_tokens?: number; cache_read_input_tokens?: number };
  model?: string;
}

async function chamar(args: { system: string | BlocoDeSistema[]; messages: MensagemDoChat[]; tools: Ferramenta[]; env: AmbienteClaude; maxTokens: number; esforco?: Esforco; forcarFerramenta?: string }): Promise<RespostaDaApi> {
  const modelo = args.env.ASSISTENTE_MODELO || MODELO_PADRAO;
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': chave(args.env), 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: modelo,
      max_tokens: args.maxTokens,
      system: args.system,
      messages: args.messages,
      tools: args.tools.length ? args.tools : undefined,
      // Obriga o modelo a responder chamando esta ferramenta: é como se obtém uma resposta estruturada.
      tool_choice: args.forcarFerramenta ? { type: 'tool', name: args.forcarFerramenta } : undefined,
      output_config: args.esforco && aceitaEsforco(modelo) ? { effort: args.esforco } : undefined,
    }),
  });
  const corpo: any = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`Anthropic ${r.status}: ${corpo?.error?.message ?? 'falha'}`);
  return corpo as RespostaDaApi;
}

export interface ResultadoDoChat {
  texto: string;
  uso: Uso;
  /** As ferramentas chamadas, na ordem, com o que devolveram. */
  chamadas: Array<{ name: string; input: Record<string, unknown>; resultado: string }>;
}

/**
 * Roda a conversa: manda, executa cada ferramenta pedida, devolve o
 * resultado ao modelo, repete até ele responder em texto (ou até o limite
 * de rodadas, para nunca ficar preso).
 */
export async function conversar(args: {
  system: string | BlocoDeSistema[];
  historico: MensagemDoChat[];
  tools: Ferramenta[];
  executar: (name: string, input: Record<string, unknown>) => Promise<string>;
  env?: AmbienteClaude;
  maxRodadas?: number;
  /** Teto da resposta. Menor = mais rápido: cada palavra gerada é tempo de espera. */
  maxTokens?: number;
  /** Sem informar, o modelo usa o padrão dele (alto). Os tokens de raciocínio são cobrados como saída. */
  esforco?: Esforco;
  /**
   * Obriga a primeira resposta a ser uma chamada desta ferramenta (classificação, extração).
   * O laço para aí: o resultado é o `input` da chamada, em `chamadas[0]`.
   */
  forcarFerramenta?: string;
}): Promise<ResultadoDoChat> {
  const env = args.env ?? (process.env as AmbienteClaude);
  if (!claudeConfigurado(env)) throw new Error('ANTHROPIC_API_KEY não configurada.');
  const messages: MensagemDoChat[] = [...args.historico];
  const uso: Uso = { tokens_entrada: 0, tokens_cache: 0, tokens_saida: 0, modelo: env.ASSISTENTE_MODELO || MODELO_PADRAO };
  const chamadas: ResultadoDoChat['chamadas'] = [];
  let texto = '';

  for (let rodada = 0; rodada < (args.maxRodadas ?? 6); rodada++) {
    const resposta = await chamar({ system: args.system, messages, tools: args.tools, env, maxTokens: args.maxTokens ?? 400, esforco: args.esforco, forcarFerramenta: rodada === 0 ? args.forcarFerramenta : undefined });
    const u = resposta.usage ?? {};
    uso.tokens_entrada += (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
    uso.tokens_cache += u.cache_read_input_tokens ?? 0;
    uso.tokens_saida += u.output_tokens ?? 0;
    if (resposta.model) uso.modelo = resposta.model;

    const textos = resposta.content.filter((b): b is Extract<BlocoDeConteudo, { type: 'text' }> => b.type === 'text').map((b) => b.text.trim()).filter(Boolean);
    const usos = resposta.content.filter((b): b is Extract<BlocoDeConteudo, { type: 'tool_use' }> => b.type === 'tool_use');
    if (textos.length) texto = textos.join('\n');

    if (resposta.stop_reason !== 'tool_use' || usos.length === 0) break;
    // Ferramenta forçada: o que interessa é o input da chamada; não há segunda rodada.
    if (args.forcarFerramenta && rodada === 0) {
      for (const u of usos) chamadas.push({ name: u.name, input: u.input ?? {}, resultado: '' });
      break;
    }

    messages.push({ role: 'assistant', content: resposta.content });
    const resultados: BlocoDeConteudo[] = [];
    for (const u of usos) {
      let saida: string;
      let erro = false;
      try {
        saida = await args.executar(u.name, u.input ?? {});
      } catch (e: any) {
        saida = `Erro: ${e.message}`;
        erro = true;
      }
      chamadas.push({ name: u.name, input: u.input ?? {}, resultado: saida });
      resultados.push({ type: 'tool_result', tool_use_id: u.id, content: saida, is_error: erro || undefined });
    }
    messages.push({ role: 'user', content: resultados });
  }
  return { texto, uso, chamadas };
}
