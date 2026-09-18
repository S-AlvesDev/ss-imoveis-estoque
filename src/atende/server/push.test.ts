import { describe, it, expect, vi } from 'vitest';

vi.mock('../../lib/supabaseServer', () => ({ supabaseServer: {} }));
vi.hoisted(() => {
  process.env.SUPABASE_URL = 'https://exemplo.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'chave-de-servico';
  process.env.JWT_SECRET = 'segredo-de-teste';
});

import { lerInscricao, pushConfigurado, chavePublica, ErroDePush } from './push';

describe('push — a inscrição que o navegador manda', () => {
  it('aceita o formato de PushSubscription.toJSON()', () => {
    const s = lerInscricao({ endpoint: 'https://fcm.googleapis.com/fcm/send/abc123def456', keys: { p256dh: 'BPx…chave', auth: 'auth…' }, expirationTime: null });
    expect(s).toEqual({ endpoint: 'https://fcm.googleapis.com/fcm/send/abc123def456', p256dh: 'BPx…chave', auth: 'auth…' });
  });

  it('recusa endpoint sem https, sem chaves, ou grande demais', () => {
    expect(() => lerInscricao({ endpoint: 'http://x.com/1234567890', keys: { p256dh: 'a', auth: 'b' } })).toThrow(ErroDePush);
    expect(() => lerInscricao({ endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: '', auth: 'b' } })).toThrow(ErroDePush);
    expect(() => lerInscricao({ endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: 'a'.repeat(201), auth: 'b' } })).toThrow(ErroDePush);
    expect(() => lerInscricao(null)).toThrow(ErroDePush);
  });

  it('sem VAPID, o push não existe — e nada quebra', () => {
    expect(pushConfigurado({})).toBe(false);
    expect(pushConfigurado({ VAPID_PUBLIC_KEY: 'pub' })).toBe(false);
    expect(pushConfigurado({ VAPID_PUBLIC_KEY: ' pub ', VAPID_PRIVATE_KEY: 'priv' })).toBe(true);
    expect(chavePublica({ VAPID_PUBLIC_KEY: ' pub ' })).toBe('pub');
    expect(chavePublica({})).toBeNull();
  });
});
