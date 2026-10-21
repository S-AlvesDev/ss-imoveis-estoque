import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Cliente volta a escrever numa conversa encerrada.
 *
 * Antes, a reabertura jogava tudo fora: sem atendente, sem setor, de volta
 * para a triagem/fila. Mas quem volta costuma voltar pelo mesmo assunto, e
 * quem já conhece o caso atende melhor que a fila — então a conversa volta
 * para quem atendia. Só cai na fila quando essa pessoa não pode mais
 * atender (desativada, ou apagada — aí o banco já zerou o atendente).
 */

vi.hoisted(() => {
  process.env.SUPABASE_URL = 'https://exemplo.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'chave-de-servico';
  process.env.JWT_SECRET = 'segredo-de-teste';
});

const banco = vi.hoisted(() => ({ usuarios: [] as any[] }));

vi.mock('../../lib/supabaseServer', () => {
  function construtor(tabela: string) {
    const filtros: Array<(l: any) => boolean> = [];
    const b: any = {
      select: () => b,
      eq: (c: string, v: any) => (filtros.push((l) => l[c] === v), b),
      maybeSingle: async () => {
        const linhas = tabela === 'atende_usuarios' ? banco.usuarios : [];
        return { data: linhas.find((l) => filtros.every((f) => f(l))) ?? null, error: null };
      },
    };
    return b;
  }
  return { supabaseServer: { from: construtor } };
});

import { atendenteAtivo } from './whatsapp';

const EMPRESA = 'e1111111-1111-4111-8111-111111111111';

beforeEach(() => {
  banco.usuarios = [
    { id: 7, empresa_id: EMPRESA, ativo: true },
    { id: 8, empresa_id: EMPRESA, ativo: false },
    { id: 9, empresa_id: 'outra-empresa', ativo: true },
  ];
});

describe('quem ainda pode receber a conversa de volta', () => {
  it('a pessoa ativa continua dona: a conversa volta para ela', async () => {
    expect(await atendenteAtivo(EMPRESA, 7)).toBe(true);
  });

  it('desativada não recebe — a conversa vai para a fila', async () => {
    expect(await atendenteAtivo(EMPRESA, 8)).toBe(false);
  });

  it('pessoa de outra empresa não vale, mesmo ativa', async () => {
    expect(await atendenteAtivo(EMPRESA, 9)).toBe(false);
  });

  it('id que não existe mais (usuário apagado) não vale', async () => {
    expect(await atendenteAtivo(EMPRESA, 404)).toBe(false);
  });
});

/**
 * A decisão em si, isolada do banco: com quem a conversa reabre. É a regra
 * que o webhook aplica ao ver uma conversa encerrada receber mensagem.
 */
function paraOndeReabre(donoDeAntes: number | null, aindaAtivo: boolean, estadoSemDono: string) {
  const continua = donoDeAntes !== null && aindaAtivo;
  return continua ? { estado: 'em_atendimento', atendente_id: donoDeAntes, time_id: 'T1' } : { estado: estadoSemDono, atendente_id: null, time_id: null };
}

describe('para onde a conversa reabre', () => {
  it('volta para quem atendia, já em atendimento — sem passar pela triagem', () => {
    expect(paraOndeReabre(7, true, 'nova')).toEqual({ estado: 'em_atendimento', atendente_id: 7, time_id: 'T1' });
  });

  it('mantém o setor junto com a pessoa', () => {
    expect(paraOndeReabre(7, true, 'nova').time_id).toBe('T1');
  });

  it('dono desativado: cai na fila/triagem, sem setor', () => {
    expect(paraOndeReabre(8, false, 'nova')).toEqual({ estado: 'nova', atendente_id: null, time_id: null });
  });

  it('conversa que nunca teve dono segue o caminho de sempre', () => {
    expect(paraOndeReabre(null, false, 'na_fila')).toEqual({ estado: 'na_fila', atendente_id: null, time_id: null });
  });
});
