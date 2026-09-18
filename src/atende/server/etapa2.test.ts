import { describe, it, expect, vi } from 'vitest';

vi.mock('../../lib/supabaseServer', () => ({ supabaseServer: {} }));
vi.hoisted(() => {
  process.env.SUPABASE_URL = 'https://exemplo.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'chave-de-servico';
  process.env.JWT_SECRET = 'segredo-de-teste';
});

import { lerEventoDoAtende, lerMensagem, telefoneDoJid, traduzirStatus, previaDe } from './eventos';
import { podeVerConversa, filtroDaVisao, limparBusca, type Visao } from './conversas';
import { nomeDaInstancia, traduzirEstado } from './whatsapp';
import { extensaoDe, caminhoDaMidia, tipoPeloMimetype } from './midias';

/** Um evento messages.upsert como a Evolution v2 manda. */
function upsert(message: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return {
    event: 'messages.upsert',
    instance: 'atende-7e7e000000004000',
    data: { key: { remoteJid: '5584991234567@s.whatsapp.net', fromMe: false, id: 'ABC123' }, pushName: 'João Silva', messageTimestamp: 1789000000, message, ...extra },
  };
}

describe('Atende Aí — o leitor de eventos da Evolution', () => {
  it('texto simples e texto estendido (com citação)', () => {
    const m = lerMensagem(upsert({ conversation: 'Oi, tem apartamento em Nova Cruz?' }))!;
    expect(m).toMatchObject({ tipoDeEvento: 'mensagem', telefone: '5584991234567', fromMe: false, nomeWhatsapp: 'João Silva', tipo: 'texto', texto: 'Oi, tem apartamento em Nova Cruz?', temArquivo: false, respondendoA: null, instancia: 'atende-7e7e000000004000' });
    expect(m.em.toISOString()).toBe(new Date(1789000000 * 1000).toISOString());
    const e = lerMensagem(upsert({ extendedTextMessage: { text: 'Esse mesmo', contextInfo: { stanzaId: 'XYZ' } } }))!;
    expect(e).toMatchObject({ tipo: 'texto', texto: 'Esse mesmo', respondendoA: 'XYZ' });
  });

  it('fromMe entra (é o celular da empresa), sem pushName do cliente', () => {
    const m = lerMensagem(upsert({ conversation: 'Boa tarde! Temos sim.' }, { key: { remoteJid: '5584991234567@s.whatsapp.net', fromMe: true, id: 'DEF' } }))!;
    expect(m).toMatchObject({ fromMe: true, nomeWhatsapp: null, telefone: '5584991234567', texto: 'Boa tarde! Temos sim.' });
    expect(m.chave).toEqual({ id: 'DEF', remoteJid: '5584991234567@s.whatsapp.net', fromMe: true });
  });

  it('todas as mídias: imagem, vídeo, áudio, documento, figurinha, localização, contato', () => {
    expect(lerMensagem(upsert({ imageMessage: { caption: 'a planta', mimetype: 'image/jpeg', fileLength: '12345', width: 800, height: 600 } }))).toMatchObject({ tipo: 'imagem', texto: 'a planta', temArquivo: true, midia: { mimetype: 'image/jpeg', tamanho: 12345, largura: 800, altura: 600, pendente: true } });
    expect(lerMensagem(upsert({ videoMessage: { mimetype: 'video/mp4', seconds: 12 } }))).toMatchObject({ tipo: 'video', midia: { duracao: 12 }, temArquivo: true });
    expect(lerMensagem(upsert({ audioMessage: { mimetype: 'audio/ogg; codecs=opus', seconds: 7, ptt: true } }))).toMatchObject({ tipo: 'audio', midia: { mimetype: 'audio/ogg; codecs=opus', duracao: 7 } });
    expect(lerMensagem(upsert({ documentMessage: { mimetype: 'application/pdf', fileName: 'contrato.pdf', caption: 'segue', fileLength: '99' } }))).toMatchObject({ tipo: 'documento', texto: 'segue', midia: { nome: 'contrato.pdf', mimetype: 'application/pdf', tamanho: 99 } });
    expect(lerMensagem(upsert({ stickerMessage: { mimetype: 'image/webp' } }))).toMatchObject({ tipo: 'figurinha', temArquivo: true });
    expect(lerMensagem(upsert({ locationMessage: { degreesLatitude: -6.47, degreesLongitude: -35.43, name: 'Nova Cruz' } }))).toMatchObject({ tipo: 'localizacao', texto: 'Nova Cruz', midia: { latitude: -6.47, longitude: -35.43 }, temArquivo: false });
    expect(lerMensagem(upsert({ contactMessage: { displayName: 'Maria', vcard: 'BEGIN:VCARD\nFN:Maria\nTEL;type=CELL:+55 84 9999-0000\nEND:VCARD' } }))).toMatchObject({ tipo: 'contato', texto: 'Maria', midia: { contato: { nome: 'Maria', telefone: '558499990000' } } });
  });

  it('desembrulha efêmera/view-once, ignora grupos, status e protocolo', () => {
    expect(lerMensagem(upsert({ ephemeralMessage: { message: { conversation: 'some depois' } } }))).toMatchObject({ tipo: 'texto', texto: 'some depois' });
    expect(lerMensagem(upsert({ conversation: 'x' }, { key: { remoteJid: '1203630@g.us', fromMe: false, id: 'G' } }))).toBeNull();
    expect(lerMensagem(upsert({ conversation: 'x' }, { key: { remoteJid: 'status@broadcast', fromMe: false, id: 'S' } }))).toBeNull();
    expect(lerMensagem(upsert({ protocolMessage: { type: 0 } }))).toBeNull();
    expect(lerMensagem(upsert({ reactionMessage: { text: '👍' } }))).toBeNull();
  });

  it('status e conexão', () => {
    expect(lerEventoDoAtende({ event: 'messages.update', instance: 'atende-x', data: [{ key: { id: 'ABC' }, update: { status: 3 } }, { key: { id: 'DEF' }, update: { status: 'READ' } }] })).toEqual([
      { tipoDeEvento: 'status', instancia: 'atende-x', waId: 'ABC', status: 'entregue' },
      { tipoDeEvento: 'status', instancia: 'atende-x', waId: 'DEF', status: 'lida' },
    ]);
    expect(lerEventoDoAtende({ event: 'CONNECTION_UPDATE', instance: 'atende-x', data: { state: 'open', wuid: '5584988887777@s.whatsapp.net' } })).toEqual([{ tipoDeEvento: 'conexao', instancia: 'atende-x', estado: 'open', numero: '5584988887777' }]);
    expect(lerEventoDoAtende({ event: 'qrcode.updated', data: {} })).toEqual([]);
    expect(lerEventoDoAtende(null)).toEqual([]);
  });

  it('miudezas: JID → telefone, status, prévia', () => {
    expect(telefoneDoJid('5584991234567@s.whatsapp.net')).toBe('5584991234567');
    expect(telefoneDoJid('5584991234567:12@s.whatsapp.net')).toBe('5584991234567');
    expect(telefoneDoJid('120363@g.us')).toBeNull();
    expect(traduzirStatus(2)).toBe('enviada');
    expect(traduzirStatus('DELIVERY_ACK')).toBe('entregue');
    expect(traduzirStatus('PLAYED')).toBe('lida');
    expect(traduzirStatus('qualquer')).toBeNull();
    expect(previaDe('texto', 'oi')).toBe('oi');
    expect(previaDe('imagem', null)).toBe('📷 Foto');
    expect(previaDe('documento', 'contrato')).toBe('📄 Documento · contrato');
  });
});

describe('Atende Aí — quem vê qual conversa', () => {
  const T_VENDAS = '11111111-1111-4111-8111-111111111111';
  const T_ALUGUEL = '22222222-2222-4222-8222-222222222222';
  const admin: Visao = { tudo: true, eu: 1, meusTimes: [], supervisiona: [] };
  const supervisor: Visao = { tudo: false, eu: 2, meusTimes: [T_VENDAS], supervisiona: [T_VENDAS] };
  const atendente: Visao = { tudo: false, eu: 3, meusTimes: [T_ALUGUEL], supervisiona: [] };

  it('admin vê tudo; atendente vê as suas e a fila dos seus times (ou sem time)', () => {
    const minha = { atendente_id: 3, time_id: T_ALUGUEL, estado: 'em_atendimento' };
    const deOutro = { atendente_id: 2, time_id: T_ALUGUEL, estado: 'em_atendimento' };
    const filaAluguel = { atendente_id: null, time_id: T_ALUGUEL, estado: 'na_fila' };
    const filaVendas = { atendente_id: null, time_id: T_VENDAS, estado: 'na_fila' };
    const filaSemTime = { atendente_id: null, time_id: null, estado: 'na_fila' };
    for (const c of [minha, deOutro, filaAluguel, filaVendas, filaSemTime]) expect(podeVerConversa(admin, c)).toBe(true);
    expect(podeVerConversa(atendente, minha)).toBe(true);
    expect(podeVerConversa(atendente, deOutro)).toBe(false);
    expect(podeVerConversa(atendente, filaAluguel)).toBe(true);
    expect(podeVerConversa(atendente, filaVendas)).toBe(false);
    expect(podeVerConversa(atendente, filaSemTime)).toBe(true);
  });

  it('supervisor vê as dos times que supervisiona, mesmo com outro atendente', () => {
    expect(podeVerConversa(supervisor, { atendente_id: 3, time_id: T_VENDAS, estado: 'em_atendimento' })).toBe(true);
    expect(podeVerConversa(supervisor, { atendente_id: 3, time_id: T_ALUGUEL, estado: 'em_atendimento' })).toBe(false);
    expect(podeVerConversa(supervisor, { atendente_id: null, time_id: null, estado: 'na_fila' })).toBe(true);
  });

  it('o filtro do PostgREST diz a mesma coisa que a regra', () => {
    expect(filtroDaVisao(admin)).toBeNull();
    expect(filtroDaVisao(atendente)).toBe(`atendente_id.eq.3,and(estado.in.(na_fila,nova,em_triagem),time_id.is.null),and(estado.in.(na_fila,nova,em_triagem),time_id.in.(${T_ALUGUEL}))`);
    expect(filtroDaVisao(supervisor)).toContain(`time_id.in.(${T_VENDAS})`);
  });

  it('a busca não carrega estrutura de filtro', () => {
    expect(limparBusca('João, (84) 99123-4567')).toBe('João 84 99123-4567');
    expect(limparBusca('x.ilike.%,id.eq.1')).toBe('x.ilike.id.eq.1');
    expect(limparBusca('  maria@x.com  ')).toBe('maria@x.com');
  });
});

describe('Atende Aí — instância e mídia', () => {
  it('nome da instância e estados', () => {
    expect(nomeDaInstancia('7e7e0000-0000-4000-8000-000000000001')).toBe('atende-7e7e00000000');
    expect(traduzirEstado('open')).toBe('conectada');
    expect(traduzirEstado('CLOSE')).toBe('desconectada');
    expect(traduzirEstado('connecting')).toBe('conectando');
    expect(traduzirEstado('?')).toBe('aguardando_qr');
  });
  it('extensão pelo mimetype (ou pelo nome), caminho por empresa/conversa, tipo pelo mimetype', () => {
    expect(extensaoDe('image/jpeg')).toBe('jpg');
    expect(extensaoDe('audio/ogg; codecs=opus')).toBe('ogg');
    expect(extensaoDe('application/octet-stream', 'planilha.XLSX')).toBe('xlsx');
    expect(extensaoDe('application/x-desconhecido')).toBe('bin');
    expect(caminhoDaMidia('emp', 'conv', 'msg', 'application/pdf', 'contrato.pdf')).toBe('emp/conv/msg.pdf');
    expect(tipoPeloMimetype('image/png')).toBe('imagem');
    expect(tipoPeloMimetype('video/mp4')).toBe('video');
    expect(tipoPeloMimetype('audio/webm')).toBe('audio');
    expect(tipoPeloMimetype('application/pdf')).toBe('documento');
  });
});
