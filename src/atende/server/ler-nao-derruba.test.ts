import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Ler o estado da conexão não pode derrubar a conexão.
 *
 * Esta é a regressão mais cara da história do Atende. `qrDaInstancia` chama
 * `GET /instance/connect`, que não é leitura: é o endereço que MANDA PAREAR
 * DE NOVO. E `situacaoDaConexao` — uma função chamada "situação da conexão",
 * usada pela tela, pelo cron diário e pelo vigia — pedia o QR sempre que o
 * estado não fosse 'conectada'.
 *
 * 'conectando' é o estado normal e passageiro por onde a sessão passa toda
 * vez que reconecta sozinha. Bastava um soluço de segundos coincidir com
 * alguém abrindo a tela, e as credenciais que funcionavam eram jogadas fora:
 * o soluço virava morte permanente, que só um QR novo desfazia — e que
 * voltava dias depois, pelo mesmo caminho.
 *
 * Dias de investigação atrás do servidor do WhatsApp, e a chamada que matava
 * saía daqui.
 */

vi.hoisted(() => {
  process.env.SUPABASE_URL = 'https://exemplo.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'chave-de-servico';
  process.env.JWT_SECRET = 'segredo-de-teste';
  process.env.SITE_URL = 'https://stokai.app';
});

const banco = vi.hoisted(() => ({ conexoes: [] as any[] }));
const evo = vi.hoisted(() => ({ estado: 'open', parearPedido: 0 }));

vi.mock('../../lib/supabaseServer', () => {
  function construtor() {
    const filtros: Array<(l: any) => boolean> = [];
    let acao: 'select' | 'update' = 'select';
    let valores: any = null;
    const executar = () => {
      const casa = (l: any) => filtros.every((f) => f(l));
      if (acao === 'update') {
        const alvo = banco.conexoes.filter(casa);
        for (const l of alvo) Object.assign(l, valores);
        return { data: alvo[0] ?? null, error: null };
      }
      return { data: banco.conexoes.filter(casa)[0] ?? null, error: null };
    };
    const b: any = {
      select: () => b,
      eq: (c: string, v: any) => (filtros.push((l) => l[c] === v), b),
      update: (v: any) => ((acao = 'update'), (valores = v), b),
      single: () => b,
      maybeSingle: () => b,
      then: (ok: (r: any) => any, falha?: (e: any) => any) => Promise.resolve(executar()).then(ok, falha),
    };
    return b;
  }
  return { supabaseServer: { from: construtor } };
});

vi.mock('../../server/evolution', () => ({
  evolutionConfigurada: () => true,
  estadoDaInstancia: async () => evo.estado,
  // O endereço que pareia. Toda chamada aqui é uma sessão posta em risco.
  qrDaInstancia: async () => {
    evo.parearPedido++;
    return { base64: 'data:image/png;base64,xxx', code: 'abc' };
  },
  criarInstancia: async () => undefined,
  apagarInstancia: async () => undefined,
  baixarMidia: async () => null,
  fotoDoContato: async () => null,
  variantesDoTelefone: (t: string) => [t],
  webhookDaInstancia: async () => null,
  configurarWebhook: async () => undefined,
  reiniciarInstancia: async () => undefined,
}));

import { situacaoDaConexao } from './whatsapp';

const EMPRESA = '7e7e0000-0000-4000-8000-000000000001';

beforeEach(() => {
  evo.parearPedido = 0;
  evo.estado = 'open';
  banco.conexoes = [{ id: 'con-1', empresa_id: EMPRESA, instancia: 'atende-7e7e00000000', numero: '5584999999999', estado: 'conectada', conectado_em: '2026-11-01T12:00:00Z', ultimo_evento_em: '2026-11-11T12:00:00Z' }];
});

describe('consultar o estado', () => {
  for (const estado of ['open', 'connecting', 'close', 'qualquer-coisa']) {
    it(`com a Evolution em "${estado}", consultar NÃO manda parear`, async () => {
      evo.estado = estado;
      await situacaoDaConexao(EMPRESA);
      expect(evo.parearPedido).toBe(0);
    });
  }

  it('"conectando" é o caso que matava: reconexão normal não pode virar pareamento', async () => {
    evo.estado = 'connecting';
    const r = await situacaoDaConexao(EMPRESA);
    expect(evo.parearPedido).toBe(0);
    expect(r.qr).toBeNull();
    expect(r.conexao?.estado).toBe('conectando');
  });

  it('consultar continua gravando o estado de volta — ler é útil, só não pode destruir', async () => {
    evo.estado = 'close';
    await situacaoDaConexao(EMPRESA);
    expect(banco.conexoes[0].estado).toBe('desconectada');
    expect(evo.parearPedido).toBe(0);
  });
});

describe('a tela do QR', () => {
  it('pedindo QR de propósito, aí sim pareia — é o que a pessoa quer', async () => {
    evo.estado = 'close';
    const r = await situacaoDaConexao(EMPRESA, { comQr: true });
    expect(evo.parearPedido).toBe(1);
    expect(r.qr).not.toBeNull();
  });

  it('mas nem pedindo se já está conectada: não se pareia o que já funciona', async () => {
    evo.estado = 'open';
    const r = await situacaoDaConexao(EMPRESA, { comQr: true });
    expect(evo.parearPedido).toBe(0);
    expect(r.qr).toBeNull();
  });
});
