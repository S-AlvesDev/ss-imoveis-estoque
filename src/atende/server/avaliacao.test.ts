import { describe, it, expect, vi } from 'vitest';

vi.hoisted(() => {
  process.env.SUPABASE_URL = 'https://exemplo.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'chave-de-servico';
  process.env.JWT_SECRET = 'segredo-de-teste';
});
vi.mock('../../lib/supabaseServer', () => ({ supabaseServer: { from: () => ({}) } }));

import { extrairNota, agregarAvaliacoes, despedidaPadrao, mensagemDeEncerramento, PERGUNTA_DA_NOTA } from './avaliacao';

describe('Avaliação — ler a nota da resposta', () => {
  it('aceita o número puro, com pontuação, "nota 8", "8/10"', () => {
    expect(extrairNota('9')).toEqual({ nota: 9, comentario: null });
    expect(extrairNota(' 10 ')).toEqual({ nota: 10, comentario: null });
    expect(extrairNota('10!')).toEqual({ nota: 10, comentario: null });
    expect(extrairNota('Nota: 8')).toEqual({ nota: 8, comentario: null });
    expect(extrairNota('8/10')).toEqual({ nota: 8, comentario: null });
    expect(extrairNota('0')).toEqual({ nota: 0, comentario: null });
  });

  it('guarda o comentário que veio junto', () => {
    expect(extrairNota('10, muito atenciosa!')).toEqual({ nota: 10, comentario: 'muito atenciosa!' });
    expect(extrairNota('7 - demorou um pouco')).toEqual({ nota: 7, comentario: 'demorou um pouco' });
  });

  it('não confunde outros números com nota', () => {
    expect(extrairNota('11')).toBeNull();
    expect(extrairNota('2026')).toBeNull();
    expect(extrairNota('quero 2 unidades')).toBeNull();
    expect(extrairNota('R$ 100')).toBeNull();
    expect(extrairNota('')).toBeNull();
    expect(extrairNota(null)).toBeNull();
  });
});

describe('Avaliação — a mensagem e o resumo', () => {
  it('a despedida padrão e a pergunta', () => {
    expect(despedidaPadrao('Ana')).toBe('Obrigado pelo contato, Ana! Qualquer coisa, é só chamar por aqui.');
    expect(mensagemDeEncerramento('Tchau!')).toBe(`Tchau!\n\n${PERGUNTA_DA_NOTA}`);
  });

  it('média, NPS, distribuição, por pessoa e os melhores', () => {
    const c = (id: string, nota: number | null, atendente: number | null, extra: any = {}) => ({ id, atendente_id: atendente, time_id: null, avaliacao_nota: nota, avaliacao_pedida_em: '2026-09-19T10:00:00Z', avaliacao_em: nota === null ? null : `2026-09-19T1${id}:00:00Z`, avaliacao_comentario: null, assunto: 'Orçamento', cliente: { nome: `Cliente ${id}`, nome_whatsapp: null, telefone: '55' }, ...extra });
    const r = agregarAvaliacoes([c('1', 10, 1), c('2', 9, 1), c('3', 6, 2, { avaliacao_comentario: 'demorou' }), c('4', null, 2), c('5', 8, null)]);
    expect(r.pedidas).toBe(5);
    expect(r.respondidas).toBe(4);
    expect(r.taxa_de_resposta).toBe(80);
    expect(r.media).toBe(8.3);
    // 2 promotores (10, 9), 1 detrator (6), 1 neutro (8) → (2-1)/4 = 25
    expect(r.nps).toBe(25);
    expect(r.distribuicao[10]).toBe(1);
    expect(r.distribuicao[6]).toBe(1);
    expect(r.distribuicao.reduce((s, n) => s + n, 0)).toBe(4);
    expect(r.por_pessoa).toEqual([
      { usuario_id: 1, avaliacoes: 2, media: 9.5 },
      { usuario_id: 2, avaliacoes: 1, media: 6 },
    ]);
    expect(r.melhores.map((m) => m.nota)).toEqual([10, 9, 8, 6]);
    expect(r.melhores[3]).toMatchObject({ cliente: 'Cliente 3', comentario: 'demorou', atendente_id: 2 });
  });

  it('sem pedido, tudo zerado e nulo', () => {
    expect(agregarAvaliacoes([])).toMatchObject({ pedidas: 0, respondidas: 0, media: null, nps: null, taxa_de_resposta: null, melhores: [] });
  });
});
