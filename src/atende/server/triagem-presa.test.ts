import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Conversa esquecida em `em_triagem` — o estado sem dono.
 *
 * Achado no ambiente de teste: uma conversa parada há 21 dias, com a pergunta
 * de esclarecimento da IA sem resposta. Não está na fila (ninguém a vê), não
 * tem atendente, e o SLA não a pega porque só olha quando a última mensagem é
 * do cliente — ali a última é da IA. O cliente some e nunca mais é atendido.
 */

vi.hoisted(() => {
  process.env.SUPABASE_URL = 'https://exemplo.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'chave-de-servico';
  process.env.JWT_SECRET = 'segredo-de-teste';
});

const banco = vi.hoisted(() => ({ conversas: [] as any[], eventos: [] as any[] }));

vi.mock('../../lib/supabaseServer', () => {
  function construtor(tabela: string) {
    const filtros: Array<(l: any) => boolean> = [];
    let acao: 'select' | 'update' | 'insert' = 'select';
    let valores: any = null;
    const linhas = () => (tabela === 'atende_conversas' ? banco.conversas : banco.eventos);
    const executar = () => {
      const casa = (l: any) => filtros.every((f) => f(l));
      if (acao === 'insert') {
        linhas().push({ ...valores });
        return { data: [valores], error: null };
      }
      if (acao === 'update') {
        const alvo = linhas().filter(casa);
        for (const l of alvo) Object.assign(l, valores);
        return { data: alvo, error: null };
      }
      return { data: linhas().filter(casa), error: null };
    };
    const b: any = {
      select: () => b,
      eq: (c: string, v: any) => (filtros.push((l) => l[c] === v), b),
      lt: (c: string, v: any) => (filtros.push((l) => l[c] < v), b),
      in: (c: string, v: any[]) => (filtros.push((l) => v.includes(l[c])), b),
      update: (v: any) => ((acao = 'update'), (valores = v), b),
      insert: (v: any) => ((acao = 'insert'), (valores = v), b),
      then: (ok: (r: any) => any, falha?: (e: any) => any) => Promise.resolve(executar()).then(ok, falha),
    };
    return b;
  }
  return { supabaseServer: { from: construtor } };
});

vi.mock('./claude', () => ({ claudeConfigurado: () => false, conversarComFerramentas: async () => ({}), forcarFerramenta: async () => ({}) }));
vi.mock('./whatsapp', () => ({ enviarTextoComId: async () => ({ waId: 'x' }) }));
vi.mock('./push', () => ({ avisarSobreConversa: async () => {} }));

import { destravarTriagensParadas, HORAS_PARA_DESTRAVAR_TRIAGEM } from './triagem';

const AGORA = new Date('2026-10-20T12:00:00Z');
const hAtras = (h: number) => new Date(AGORA.getTime() - h * 3600_000).toISOString();

beforeEach(() => {
  banco.conversas = [];
  banco.eventos = [];
});

describe('conversa presa na triagem volta para a fila', () => {
  it('a que a IA perguntou e o cliente nunca respondeu é devolvida depois do prazo', async () => {
    banco.conversas = [{ id: 'c1', empresa_id: 'e1', estado: 'em_triagem', ultima_mensagem_em: hAtras(21 * 24), ultima_mensagem_de: 'ia' }];
    const r = await destravarTriagensParadas(AGORA);
    expect(r.destravadas).toBe(1);
    expect(banco.conversas[0].estado).toBe('na_fila');
    // Fica registrado o porquê, para a equipe entender de onde a conversa veio.
    expect(banco.eventos[0]).toMatchObject({ conversa_id: 'c1', tipo: 'triagem' });
    expect(banco.eventos[0].dados.erro).toMatch(/sem resposta do cliente/);
  });

  it('a que acabou de entrar em triagem é deixada em paz — a IA ainda está no caminho', async () => {
    banco.conversas = [{ id: 'c1', empresa_id: 'e1', estado: 'em_triagem', ultima_mensagem_em: hAtras(1), ultima_mensagem_de: 'ia' }];
    expect((await destravarTriagensParadas(AGORA)).destravadas).toBe(0);
    expect(banco.conversas[0].estado).toBe('em_triagem');
  });

  it('exatamente no limite ainda espera; passou dele, vai', async () => {
    banco.conversas = [
      { id: 'cedo', empresa_id: 'e1', estado: 'em_triagem', ultima_mensagem_em: hAtras(HORAS_PARA_DESTRAVAR_TRIAGEM - 0.5), ultima_mensagem_de: 'ia' },
      { id: 'tarde', empresa_id: 'e1', estado: 'em_triagem', ultima_mensagem_em: hAtras(HORAS_PARA_DESTRAVAR_TRIAGEM + 0.5), ultima_mensagem_de: 'ia' },
    ];
    await destravarTriagensParadas(AGORA);
    expect(banco.conversas.find((c) => c.id === 'cedo').estado).toBe('em_triagem');
    expect(banco.conversas.find((c) => c.id === 'tarde').estado).toBe('na_fila');
  });

  it('não mexe em conversa de outro estado: quem está em atendimento tem dono', async () => {
    banco.conversas = [
      { id: 'atend', empresa_id: 'e1', estado: 'em_atendimento', ultima_mensagem_em: hAtras(500), ultima_mensagem_de: 'atendente' },
      { id: 'fila', empresa_id: 'e1', estado: 'na_fila', ultima_mensagem_em: hAtras(500), ultima_mensagem_de: 'cliente' },
      { id: 'fim', empresa_id: 'e1', estado: 'encerrada', ultima_mensagem_em: hAtras(500), ultima_mensagem_de: 'atendente' },
    ];
    expect((await destravarTriagensParadas(AGORA)).destravadas).toBe(0);
    expect(banco.conversas.map((c) => c.estado)).toEqual(['em_atendimento', 'na_fila', 'encerrada']);
  });
});
