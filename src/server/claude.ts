/**
 * A API de mensagens da Anthropic, no mínimo que o assistente usa: uma
 * conversa com ferramentas, em laço até o modelo responder em texto.
 * Sem SDK: um fetch, para não trazer dependência por causa de um endpoint.
 */

export interface AmbienteClaude {
  ANTHROPIC_API_KEY?: string;
  /** Padrão: claude-sonnet-5. Haiku 4.5 (claude-haiku-4-5-20251001) é mais barato para conversa simples. */
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
  tokens_entrada: number;
  tokens_saida: number;
  modelo: string;
}

interface RespostaDaApi {
  content: BlocoDeConteudo[];
  stop_reason: 'end_turn' | 'tool_use' | 'max_tokens' | string;
  usage?: { input_tokens?: number; output_tokens?: number };
  model?: string;
}

async function chamar(args: { system: string; messages: MensagemDoChat[]; tools: Ferramenta[]; env: AmbienteClaude; maxTokens: number }): Promise<RespostaDaApi> {
  const modelo = args.env.ASSISTENTE_MODELO || MODELO_PADRAO;
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': chave(args.env), 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: modelo, max_tokens: args.maxTokens, system: args.system, messages: args.messages, tools: args.tools.length ? args.tools : undefined }),
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
  system: string;
  historico: MensagemDoChat[];
  tools: Ferramenta[];
  executar: (name: string, input: Record<string, unknown>) => Promise<string>;
  env?: AmbienteClaude;
  maxRodadas?: number;
  maxTokens?: number;
}): Promise<ResultadoDoChat> {
  const env = args.env ?? (process.env as AmbienteClaude);
  if (!claudeConfigurado(env)) throw new Error('ANTHROPIC_API_KEY não configurada.');
  const messages: MensagemDoChat[] = [...args.historico];
  const uso: Uso = { tokens_entrada: 0, tokens_saida: 0, modelo: env.ASSISTENTE_MODELO || MODELO_PADRAO };
  const chamadas: ResultadoDoChat['chamadas'] = [];
  let texto = '';

  for (let rodada = 0; rodada < (args.maxRodadas ?? 6); rodada++) {
    const resposta = await chamar({ system: args.system, messages, tools: args.tools, env, maxTokens: args.maxTokens ?? 700 });
    uso.tokens_entrada += resposta.usage?.input_tokens ?? 0;
    uso.tokens_saida += resposta.usage?.output_tokens ?? 0;
    if (resposta.model) uso.modelo = resposta.model;

    const textos = resposta.content.filter((b): b is Extract<BlocoDeConteudo, { type: 'text' }> => b.type === 'text').map((b) => b.text.trim()).filter(Boolean);
    const usos = resposta.content.filter((b): b is Extract<BlocoDeConteudo, { type: 'tool_use' }> => b.type === 'tool_use');
    if (textos.length) texto = textos.join('\n');

    if (resposta.stop_reason !== 'tool_use' || usos.length === 0) break;

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
