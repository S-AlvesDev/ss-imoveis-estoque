/**
 * Quem está falando, dentro da própria mensagem do WhatsApp.
 *
 * O cliente vê "Samuel Alves:" antes do que a pessoa escreveu, e
 * "Assistente Virtual:" antes do que a IA (ou o sistema, em nome dela)
 * mandou — nome e texto em linhas separadas. A assinatura existe só no
 * texto que sai pela Evolution: o banco guarda a mensagem como foi escrita,
 * e a tela mostra o autor pelo próprio campo `autor_tipo`/`autor_id`.
 */
export const ASSISTENTE_VIRTUAL = 'Assistente Virtual';

/**
 * "Nome:\ntexto". O nome vem de quem está logado (nunca fixo no código);
 * a IA assina sempre como Assistente Virtual. Idempotente: um texto que já
 * começa com essa mesma assinatura não a ganha de novo. Sem nome, ou sem
 * texto, devolve o texto como veio.
 */
export function assinarRemetente(nome: string | null | undefined, texto: string): string {
  const n = (nome ?? '').trim().replace(/\s+/g, ' ');
  if (!n || !texto.trim()) return texto;
  const assinatura = `${n}:\n`;
  return texto.startsWith(assinatura) ? texto : `${assinatura}${texto}`;
}
