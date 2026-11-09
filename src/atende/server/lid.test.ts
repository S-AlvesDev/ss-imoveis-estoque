import { describe, it, expect, vi } from 'vitest';

/**
 * Mensagens que apareciam no celular da empresa e não chegavam ao Atende.
 *
 * O WhatsApp passou a identificar parte dos contatos por LID — um número
 * interno em `123@lid`, que não é telefone. O leitor exigia que o
 * `remoteJid` terminasse em `@s.whatsapp.net`; qualquer outro formato fazia
 * a mensagem ser descartada ali mesmo, e o descarte não aparecia em log nem
 * em contador. Daí o sintoma: ALGUNS clientes (os que já migraram para LID)
 * simplesmente não entravam, sem erro em lugar nenhum.
 *
 * Quando o contato vem por LID, o telefone de verdade viaja num campo ao
 * lado — e o nome dele mudou conforme a versão do Baileys/Evolution, por
 * isso o leitor olha todos.
 */

vi.hoisted(() => {
  process.env.SUPABASE_URL = 'https://exemplo.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'chave-de-servico';
  process.env.JWT_SECRET = 'segredo-de-teste';
});
vi.mock('../../lib/supabaseServer', () => ({ supabaseServer: {} }));

import { lerMensagem, telefoneDaChave, telefoneDoJid, ehJidQueIgnoramos } from './eventos';

const TEL = '5584991234567';

function upsert(key: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return {
    event: 'messages.upsert',
    instance: 'atende-7e7e000000004000',
    data: { key: { id: 'ABC123', fromMe: false, ...key }, pushName: 'João', messageTimestamp: 1789000000, message: { conversation: 'Oi, tem apartamento?' }, ...extra },
  };
}

describe('achar o telefone de quem escreveu', () => {
  it('o formato de sempre continua valendo', () => {
    expect(telefoneDaChave({ remoteJid: `${TEL}@s.whatsapp.net` })).toBe(TEL);
  });

  it('contato por LID: o telefone vem no campo ao lado', () => {
    expect(telefoneDaChave({ remoteJid: '192837465@lid', remoteJidAlt: `${TEL}@s.whatsapp.net` })).toBe(TEL);
    expect(telefoneDaChave({ remoteJid: '192837465@lid', senderPn: `${TEL}@s.whatsapp.net` })).toBe(TEL);
    expect(telefoneDaChave({ remoteJid: '192837465@lid', participantPn: `${TEL}@s.whatsapp.net` })).toBe(TEL);
  });

  it('o telefone também pode vir fora da chave', () => {
    expect(telefoneDaChave({ remoteJid: '192837465@lid' }, { sender: `${TEL}@s.whatsapp.net` })).toBe(TEL);
  });

  it('campo que traz só os dígitos também serve', () => {
    expect(telefoneDaChave({ remoteJid: '192837465@lid' }, { senderPn: TEL })).toBe(TEL);
  });

  it('o LID sozinho não vira telefone — seria um número inventado', () => {
    expect(telefoneDaChave({ remoteJid: '192837465@lid' })).toBeNull();
    expect(telefoneDoJid('192837465@lid')).toBeNull();
  });

  it('dispositivo com sufixo continua sendo a mesma pessoa', () => {
    expect(telefoneDaChave({ remoteJid: `${TEL}:12@s.whatsapp.net` })).toBe(TEL);
  });
});

describe('o que é ignorado de propósito', () => {
  it('grupo, status, transmissão e canal', () => {
    for (const j of ['12036304@g.us', 'status@broadcast', '123@broadcast', '456@newsletter']) {
      expect(ehJidQueIgnoramos(j)).toBe(true);
    }
    expect(ehJidQueIgnoramos(`${TEL}@s.whatsapp.net`)).toBe(false);
    expect(ehJidQueIgnoramos('192837465@lid')).toBe(false);
  });
});

describe('a mensagem inteira, como chega do webhook', () => {
  it('contato por LID agora entra — antes era descartado em silêncio', () => {
    const m = lerMensagem(upsert({ remoteJid: '192837465@lid', remoteJidAlt: `${TEL}@s.whatsapp.net` }));
    expect(m).not.toBeNull();
    expect(m).toMatchObject({ telefone: TEL, tipo: 'texto', texto: 'Oi, tem apartamento?', nomeWhatsapp: 'João' });
  });

  it('o que já funcionava não mudou', () => {
    expect(lerMensagem(upsert({ remoteJid: `${TEL}@s.whatsapp.net` }))).toMatchObject({ telefone: TEL, tipo: 'texto' });
  });

  it('grupo continua fora, sem barulho no log', () => {
    const avisos: unknown[] = [];
    const antes = console.warn;
    console.warn = (...a: unknown[]) => void avisos.push(a);
    try {
      expect(lerMensagem(upsert({ remoteJid: '12036304@g.us' }))).toBeNull();
      expect(avisos).toHaveLength(0);
    } finally {
      console.warn = antes;
    }
  });

  it('telefone que não dá para achar: descarta, MAS deixa registro do formato', () => {
    const avisos: string[] = [];
    const antes = console.warn;
    console.warn = (...a: unknown[]) => void avisos.push(a.join(' '));
    try {
      expect(lerMensagem(upsert({ remoteJid: '192837465@lid' }))).toBeNull();
      expect(avisos).toHaveLength(1);
      expect(avisos[0]).toContain('192837465@lid');
      expect(avisos[0]).toMatch(/descartada/);
    } finally {
      console.warn = antes;
    }
  });
});
