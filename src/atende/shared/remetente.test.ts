import { describe, it, expect } from 'vitest';
import { assinarRemetente, ASSISTENTE_VIRTUAL } from './remetente';

/**
 * A assinatura que vai no WhatsApp: nome de quem escreveu (ou Assistente
 * Virtual), dois-pontos, quebra de linha, o texto. Nunca duas vezes.
 */
describe('assinarRemetente', () => {
  it('põe o nome da pessoa na linha de cima', () => {
    expect(assinarRemetente('Samuel Alves', 'Bom dia! Como posso ajudar?')).toBe('Samuel Alves:\nBom dia! Como posso ajudar?');
  });

  it('a IA assina sempre como Assistente Virtual', () => {
    expect(ASSISTENTE_VIRTUAL).toBe('Assistente Virtual');
    expect(assinarRemetente(ASSISTENTE_VIRTUAL, 'Bom dia, Samuel! Recebemos sua mensagem.')).toBe('Assistente Virtual:\nBom dia, Samuel! Recebemos sua mensagem.');
  });

  it('não assina de novo o que já está assinado', () => {
    const uma = assinarRemetente('Samuel Alves', 'Oi');
    expect(assinarRemetente('Samuel Alves', uma)).toBe('Samuel Alves:\nOi');
  });

  it('mantém texto com várias linhas e a despedida com a pergunta da nota', () => {
    expect(assinarRemetente(ASSISTENTE_VIRTUAL, 'Até logo!\n\nDe 0 a 10, como você avalia este atendimento?')).toBe('Assistente Virtual:\nAté logo!\n\nDe 0 a 10, como você avalia este atendimento?');
  });

  it('limpa espaços do nome e não inventa assinatura sem nome ou sem texto', () => {
    expect(assinarRemetente('  Ana   Souza ', 'Oi')).toBe('Ana Souza:\nOi');
    expect(assinarRemetente('', 'Oi')).toBe('Oi');
    expect(assinarRemetente(null, 'Oi')).toBe('Oi');
    expect(assinarRemetente('Ana', '   ')).toBe('   ');
  });

  it('um nome parecido não engana a checagem de repetição', () => {
    expect(assinarRemetente('Ana', 'Ana Paula:\nOi')).toBe('Ana:\nAna Paula:\nOi');
  });
});
