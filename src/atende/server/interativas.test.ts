import { describe, it, expect, vi } from 'vitest';

/**
 * Mensagens interativas — botão, lista, template, enquete.
 *
 * Achado na conta de teste: duas conversas em que TODA mensagem de entrada
 * vinha `tipo: 'outro'` com texto vazio, e a triagem rotulava "Mensagem sem
 * conteúdo identificável". Uma delas é um atendimento automático da Claro: o
 * bot manda menus, e o menu chega em chaves que o leitor não abria.
 *
 * O WhatsApp tem dois lados aqui: a RESPOSTA de quem clicou e o ENVIO de quem
 * ofereceu as opções. Antes, só três formatos de resposta eram lidos.
 */

vi.hoisted(() => {
  process.env.SUPABASE_URL = 'https://exemplo.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'chave-de-servico';
  process.env.JWT_SECRET = 'segredo-de-teste';
});
vi.mock('../../lib/supabaseServer', () => ({ supabaseServer: {} }));

import { lerMensagem, textoDeInterativa, previaDe } from './eventos';

function upsert(message: Record<string, unknown>) {
  return {
    event: 'messages.upsert',
    instance: 'atende-7e7e000000004000',
    data: { key: { remoteJid: '5584991234567@s.whatsapp.net', fromMe: false, id: 'ABC123' }, pushName: 'João', messageTimestamp: 1789000000, message },
  };
}

describe('o que alguém escolheu num menu', () => {
  it('resposta de botão', () => {
    expect(textoDeInterativa({ buttonsResponseMessage: { selectedDisplayText: 'Falar com atendente' } })).toBe('Falar com atendente');
  });

  it('resposta de lista, pelo título ou pela linha escolhida', () => {
    expect(textoDeInterativa({ listResponseMessage: { title: '2 - Segunda via' } })).toBe('2 - Segunda via');
    expect(textoDeInterativa({ listResponseMessage: { singleSelectReply: { selectedRowId: 'opcao_boleto' } } })).toBe('opcao_boleto');
  });

  it('resposta de template', () => {
    expect(textoDeInterativa({ templateButtonReplyMessage: { selectedDisplayText: 'Sim' } })).toBe('Sim');
  });

  it('o formato novo, com os dados num JSON de texto', () => {
    const paramsJson = JSON.stringify({ id: 'row_2', description: 'Quero falar sobre aluguel' });
    expect(textoDeInterativa({ interactiveResponseMessage: { nativeFlowResponseMessage: { paramsJson } } })).toBe('Quero falar sobre aluguel');
  });

  it('JSON quebrado não derruba a leitura: cai nas outras chaves', () => {
    const real = { interactiveResponseMessage: { nativeFlowResponseMessage: { paramsJson: '{isso não é json' }, body: { text: 'Opção 3' } } };
    expect(textoDeInterativa(real)).toBe('Opção 3');
  });
});

describe('o menu que o bot ofereceu — o caso da Claro', () => {
  it('botões com o texto da pergunta', () => {
    expect(textoDeInterativa({ buttonsMessage: { contentText: 'Selecione uma das opções:' } })).toBe('Selecione uma das opções:');
  });

  it('lista, pela descrição ou pelo título', () => {
    expect(textoDeInterativa({ listMessage: { description: 'Escolha o assunto', title: 'Menu' } })).toBe('Escolha o assunto');
    expect(textoDeInterativa({ listMessage: { title: 'Menu principal' } })).toBe('Menu principal');
  });

  it('template já montado', () => {
    expect(textoDeInterativa({ templateMessage: { hydratedTemplate: { hydratedContentText: 'Seu pedido foi enviado' } } })).toBe('Seu pedido foi enviado');
  });

  it('interativa nova, pelo corpo ou pelo cabeçalho', () => {
    expect(textoDeInterativa({ interactiveMessage: { body: { text: 'Como posso ajudar?' } } })).toBe('Como posso ajudar?');
    expect(textoDeInterativa({ interactiveMessage: { header: { title: 'Atendimento' } } })).toBe('Atendimento');
  });

  it('enquete pelo nome', () => {
    expect(textoDeInterativa({ pollCreationMessage: { name: 'Qual horário prefere?' } })).toBe('Qual horário prefere?');
  });

  it('o que não tem texto nenhum continua sendo nulo', () => {
    expect(textoDeInterativa({})).toBeNull();
    expect(textoDeInterativa({ algoNovoDoWhatsapp: { x: 1 } })).toBeNull();
  });
});

describe('a mensagem inteira, como chega do webhook', () => {
  it('o clique no menu vira uma mensagem com texto — antes vinha em branco', () => {
    const m = lerMensagem(upsert({ buttonsResponseMessage: { selectedDisplayText: 'Falar com atendente' } }))!;
    expect(m).toMatchObject({ tipo: 'outro', texto: 'Falar com atendente' });
    expect(m.midia).toBeNull();
    // E a lista de conversas mostra o que a pessoa escolheu.
    expect(previaDe(m.tipo, m.texto)).toBe('Mensagem · Falar com atendente');
  });

  it('o menu do bot também, mesmo embrulhado em mensagem efêmera', () => {
    const m = lerMensagem(upsert({ ephemeralMessage: { message: { listMessage: { description: 'Escolha o assunto' } } } }))!;
    expect(m).toMatchObject({ tipo: 'outro', texto: 'Escolha o assunto' });
  });

  it('formato ainda desconhecido: guarda QUAL chegou, em vez de sumir em branco', () => {
    const m = lerMensagem(upsert({ algumFormatoNovo: { seja: 'o que for' } }))!;
    expect(m).toMatchObject({ tipo: 'outro', texto: null });
    expect(m.midia).toEqual({ desconhecido: 'algumFormatoNovo' });
  });

  it('o messageContextInfo não conta como o formato da mensagem', () => {
    const m = lerMensagem(upsert({ messageContextInfo: { x: 1 }, outroFormato: { y: 2 } }))!;
    expect(m.midia).toEqual({ desconhecido: 'outroFormato' });
  });

  it('o que já funcionava não mudou', () => {
    expect(lerMensagem(upsert({ conversation: 'Oi, tem apartamento?' }))).toMatchObject({ tipo: 'texto', texto: 'Oi, tem apartamento?' });
    expect(lerMensagem(upsert({ reactionMessage: { text: '👍' } }))).toBeNull();
  });
});
