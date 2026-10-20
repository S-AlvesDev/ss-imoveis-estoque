import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * A foto de perfil do cliente. O defeito era guardar a URL do CDN do
 * WhatsApp, que carrega data de validade (`oe=`) — vencida, a Meta responde
 * 403 e o avatar quebra para sempre, porque a foto só era buscada ao criar o
 * cliente. Agora a imagem é baixada e fica num endereço nosso.
 */

vi.hoisted(() => {
  process.env.SUPABASE_URL = 'https://exemplo.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'chave-de-servico';
  process.env.JWT_SECRET = 'segredo-de-teste';
});

const storage = vi.hoisted(() => ({ subidos: [] as Array<{ caminho: string; bytes: number; tipo: string }>, erroAoSubir: null as string | null }));

vi.mock('../../lib/supabaseServer', () => ({
  supabaseServer: {
    storage: {
      from: () => ({
        upload: async (caminho: string, bytes: Buffer, opcoes: any) => {
          if (storage.erroAoSubir) return { error: { message: storage.erroAoSubir } };
          storage.subidos.push({ caminho, bytes: bytes.length, tipo: opcoes.contentType });
          return { error: null };
        },
        getPublicUrl: (caminho: string) => ({ data: { publicUrl: `https://exemplo.supabase.co/storage/v1/object/public/logos/${caminho}` } }),
      }),
    },
    from: () => {
      const b: any = { select: () => b, like: () => b, eq: () => b, limit: () => b, update: () => b, maybeSingle: async () => ({ data: null, error: null }), then: (ok: any) => Promise.resolve({ data: [], error: null }).then(ok) };
      return b;
    },
  },
}));
vi.mock('../../server/evolution', () => ({ fotoDoContato: async () => null }));

import { guardarFotoDoCliente, caminhoDaFoto, ehUrlQueVence, FOTO_MAX_BYTES } from './fotos';

const EMPRESA = 'e1111111-1111-4111-8111-111111111111';
const CLIENTE = 'c2222222-2222-4222-8222-222222222222';
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');

function respondeCom(corpo: Buffer | null, { status = 200, tipo = 'image/jpeg' } = {}) {
  globalThis.fetch = (async () => ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => tipo },
    arrayBuffer: async () => (corpo ? corpo.buffer.slice(corpo.byteOffset, corpo.byteOffset + corpo.byteLength) : new ArrayBuffer(0)),
  })) as any;
}

beforeEach(() => {
  storage.subidos = [];
  storage.erroAoSubir = null;
});

describe('saber qual URL vai vencer', () => {
  it('reconhece a do CDN do WhatsApp, que é a que quebra', () => {
    expect(ehUrlQueVence('https://pps.whatsapp.net/v/t61.24694-24/4135_n.jpg?ccb=11-4&oe=6ABAD755')).toBe(true);
    expect(ehUrlQueVence('https://media.whatsapp.net/foo.jpg')).toBe(true);
  });

  it('a nossa, do bucket, não vence', () => {
    expect(ehUrlQueVence('https://exemplo.supabase.co/storage/v1/object/public/logos/atende/clientes/a/b.jpg')).toBe(false);
    expect(ehUrlQueVence(null)).toBe(false);
    expect(ehUrlQueVence('')).toBe(false);
  });
});

describe('o caminho da foto', () => {
  it('leva os dois ids e não se mistura com as logos das empresas', () => {
    expect(caminhoDaFoto(EMPRESA, CLIENTE)).toBe(`atende/clientes/${EMPRESA}/${CLIENTE}.jpg`);
    expect(caminhoDaFoto(EMPRESA, CLIENTE, 'image/png')).toMatch(/\.png$/);
  });
});

describe('guardar a foto', () => {
  it('baixa e devolve uma URL nossa, que não vence', async () => {
    respondeCom(PNG, { tipo: 'image/png' });
    const url = await guardarFotoDoCliente(EMPRESA, CLIENTE, 'https://pps.whatsapp.net/v/foto.jpg?oe=6ABAD755');
    expect(url).toContain(`/public/logos/atende/clientes/${EMPRESA}/${CLIENTE}.png`);
    expect(ehUrlQueVence(url)).toBe(false);
    expect(storage.subidos[0]).toMatchObject({ bytes: PNG.length, tipo: 'image/png' });
  });

  it('sem foto no WhatsApp, fica sem foto — e nada estoura', async () => {
    respondeCom(null, { status: 404 });
    expect(await guardarFotoDoCliente(EMPRESA, CLIENTE, 'https://pps.whatsapp.net/v/sumiu.jpg')).toBeNull();
    expect(await guardarFotoDoCliente(EMPRESA, CLIENTE, null)).toBeNull();
  });

  it('o que não é imagem não entra', async () => {
    respondeCom(PNG, { tipo: 'text/html' });
    expect(await guardarFotoDoCliente(EMPRESA, CLIENTE, 'https://pps.whatsapp.net/v/foto.jpg')).toBeNull();
    expect(storage.subidos).toHaveLength(0);
  });

  it('imagem grande demais não entra — avatar não tem tamanho de vídeo', async () => {
    respondeCom(Buffer.alloc(FOTO_MAX_BYTES + 1));
    expect(await guardarFotoDoCliente(EMPRESA, CLIENTE, 'https://pps.whatsapp.net/v/enorme.jpg')).toBeNull();
    expect(storage.subidos).toHaveLength(0);
  });

  it('rede caiu no meio: devolve nulo em vez de derrubar o registro da mensagem', async () => {
    globalThis.fetch = (async () => { throw new Error('ECONNRESET'); }) as any;
    expect(await guardarFotoDoCliente(EMPRESA, CLIENTE, 'https://pps.whatsapp.net/v/foto.jpg')).toBeNull();
  });

  it('storage recusou: também é nulo, sem exceção', async () => {
    respondeCom(PNG);
    storage.erroAoSubir = 'bucket não existe';
    expect(await guardarFotoDoCliente(EMPRESA, CLIENTE, 'https://pps.whatsapp.net/v/foto.jpg')).toBeNull();
  });
});
