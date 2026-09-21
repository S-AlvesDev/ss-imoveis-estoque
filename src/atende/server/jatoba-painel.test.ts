import { describe, it, expect, vi } from 'vitest';

vi.hoisted(() => {
  process.env.SUPABASE_URL = 'https://exemplo.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'chave-de-servico';
  process.env.JWT_SECRET = 'segredo-de-teste';
});
vi.mock('../../lib/supabaseServer', () => ({ supabaseServer: { from: () => ({}) } }));

// Um Claude de mentira: chama as ferramentas que o teste pedir e devolve o que elas disseram.
const roteiro = vi.hoisted(() => ({ chamadas: [] as Array<{ name: string; input: Record<string, unknown> }> }));
vi.mock('../../server/claude', () => ({
  claudeConfigurado: () => true,
  systemComCache: (fixo: string, variavel: string) => [{ type: 'text', text: fixo }, { type: 'text', text: variavel }],
  conversar: async (args: any) => {
    const respostas: string[] = [];
    for (const c of roteiro.chamadas) respostas.push(await args.executar(c.name, c.input));
    return { texto: respostas.join(' | '), uso: { tokens_entrada: 1, tokens_cache: 0, tokens_saida: 1, modelo: 'fake' }, chamadas: roteiro.chamadas.map((c) => ({ ...c, resultado: '' })) };
  },
}));

import { responderNoPainelDoAtende, TELAS_DO_ATENDE, GUIA_DO_ATENDE } from './jatoba';

const op = (papel: 'admin' | 'atendente') => ({
  papel,
  usuarioId: 7,
  pode: (p: string) => (papel === 'admin' ? true : p === 'conversas.atender' || p === 'equipe.ver'),
  resumo: async () => ({ na_fila: 3, esperando_resposta: [{ cliente: 'Ana', espera_min: 12 }] }),
  procurar: async (busca: string) => [{ conversa_id: '11111111-1111-4111-8111-111111111111', cliente: `Cliente ${busca}` }],
  avaliacoes: async () => ({ media: 9.5 }),
  inventario: async (busca: string) => [{ nome: `Casa ${busca}`, categoria: 'aluguel', quantidade: 3, preco: 1200 }],
});

describe('Jatobá no painel do Atende Aí', () => {
  it('a operação de agora vem da ferramenta, nunca inventada', async () => {
    roteiro.chamadas = [{ name: 'resumo_da_operacao', input: {} }];
    const r = await responderNoPainelDoAtende(op('atendente'), [], 'quem espera?');
    expect(r.texto).toContain('"na_fila":3');
    expect(r.texto).toContain('Ana');
    expect(r.ferramentas).toEqual(['resumo_da_operacao']);
    expect(r.abrir).toBeNull();
  });

  it('abrir_tela respeita o papel: atendente não abre a supervisão; admin abre a central numa conversa', async () => {
    roteiro.chamadas = [{ name: 'abrir_tela', input: { tela: 'supervisao' } }];
    const negado = await responderNoPainelDoAtende(op('atendente'), [], 'abre a supervisão');
    expect(negado.abrir).toBeNull();
    expect(negado.texto).toMatch(/supervisor\/administrador/);

    roteiro.chamadas = [{ name: 'procurar_conversas', input: { busca: 'Ana' } }, { name: 'abrir_tela', input: { tela: 'central', conversa_id: '11111111-1111-4111-8111-111111111111' } }];
    const aberto = await responderNoPainelDoAtende(op('admin'), [], 'abre a conversa da Ana');
    expect(aberto.abrir).toEqual({ tela: 'central', resto: '11111111-1111-4111-8111-111111111111' });
    expect(aberto.ferramentas).toEqual(['procurar_conversas', 'abrir_tela']);
  });

  it('avaliações só para quem supervisiona; id de conversa inválido não vai para a URL', async () => {
    roteiro.chamadas = [{ name: 'avaliacoes', input: { periodo: '30d' } }];
    expect((await responderNoPainelDoAtende(op('atendente'), [], 'como estão as notas?')).texto).toMatch(/Só supervisores/);
    expect((await responderNoPainelDoAtende(op('admin'), [], 'como estão as notas?')).texto).toContain('9.5');
    roteiro.chamadas = [{ name: 'abrir_tela', input: { tela: 'central', conversa_id: '../../etc' } }];
    expect((await responderNoPainelDoAtende(op('admin'), [], 'abre')).abrir).toEqual({ tela: 'central', resto: '' });
  });

  it('o guia fala das telas pelo nome que a IA pode abrir', () => {
    for (const tela of Object.keys(TELAS_DO_ATENDE)) expect(GUIA_DO_ATENDE).toContain(`"${tela}"`);
  });

  it('consulta o inventário pela ferramenta, disponível para qualquer papel', async () => {
    roteiro.chamadas = [{ name: 'consultar_inventario', input: { busca: 'aluguel' } }];
    const r = await responderNoPainelDoAtende(op('atendente'), [], 'quantas casas de aluguel tem disponível?');
    expect(r.texto).toContain('"quantidade":3');
    expect(r.ferramentas).toEqual(['consultar_inventario']);
  });
});
