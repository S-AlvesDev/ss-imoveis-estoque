import { describe, it, expect, vi } from 'vitest';

vi.mock('../../lib/supabaseServer', () => ({ supabaseServer: {} }));
vi.hoisted(() => {
  process.env.SUPABASE_URL = 'https://exemplo.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'chave-de-servico';
  process.env.JWT_SECRET = 'segredo-de-teste';
  delete process.env.ANTHROPIC_API_KEY;
});

import { dentroDoHorario, agoraNoFuso, historicoDe, lerClassificacao, classificarPorPalavrasChave, escolherAtendente, ferramentaClassificar, contextoDaEmpresa, REGRAS_DA_TRIAGEM, PRESENCA_VALIDA_MS, type TimeParaTriagem } from './triagem';
import { validarEmpresa } from '../shared/validacao';

const TIMES: TimeParaTriagem[] = [
  { id: 'aaaaaaaa-0000-4000-8000-000000000001', nome: 'Vendas', descricao_para_ia: 'Quem quer comprar ou alugar', palavras_chave: ['comprar', 'alugar', 'preço'] },
  { id: 'aaaaaaaa-0000-4000-8000-000000000002', nome: 'Financeiro', descricao_para_ia: 'Boletos, cobranças e atrasos', palavras_chave: ['boleto', 'cobrança', 'atraso'] },
];

describe('Etapa 3 — horário de atendimento', () => {
  // Uma quarta-feira, 14:30 em Brasília (17:30 UTC).
  const quartaTarde = new Date('2026-09-16T17:30:00Z');
  // Sábado, 09:00 em Brasília.
  const sabadoManha = new Date('2026-09-19T12:00:00Z');

  it('lê dia e hora no fuso da empresa (a Vercel roda em UTC)', () => {
    expect(agoraNoFuso(quartaTarde)).toEqual({ dia: 'qua', hora: '14:30' });
    expect(agoraNoFuso(sabadoManha)).toEqual({ dia: 'sab', hora: '09:00' });
    // 23:30 em Brasília é 02:30 UTC do dia seguinte: o dia da semana tem que ser o de Brasília.
    expect(agoraNoFuso(new Date('2026-09-17T02:30:00Z'))).toEqual({ dia: 'qua', hora: '23:30' });
  });

  it('sem horário cadastrado atende sempre', () => {
    expect(dentroDoHorario({}, quartaTarde)).toBe(true);
    expect(dentroDoHorario(null, sabadoManha)).toBe(true);
  });

  it('dentro da faixa é aberto; fora, dia ausente ou nulo é fechado', () => {
    const horario = { seg: { de: '08:00', ate: '18:00' }, qua: { de: '08:00', ate: '18:00' }, sab: null };
    expect(dentroDoHorario(horario, quartaTarde)).toBe(true);
    expect(dentroDoHorario(horario, new Date('2026-09-16T21:00:00Z'))).toBe(false); // 18:00 em ponto: já fechou
    expect(dentroDoHorario(horario, new Date('2026-09-16T11:00:00Z'))).toBe(true); // 08:00 em ponto: abriu
    expect(dentroDoHorario(horario, sabadoManha)).toBe(false);
    expect(dentroDoHorario(horario, new Date('2026-09-15T17:30:00Z'))).toBe(false); // terça não está no horário
  });
});

describe('Etapa 3 — o histórico que a IA lê', () => {
  it('cliente vira user, IA/equipe vira assistant; notas e sistema ficam de fora; papéis alternam', () => {
    const h = historicoDe([
      { direcao: 'sistema', autor_tipo: 'sistema', tipo: 'texto', texto: 'Conversa aberta' },
      { direcao: 'entrada', autor_tipo: 'cliente', tipo: 'texto', texto: 'Oi' },
      { direcao: 'entrada', autor_tipo: 'cliente', tipo: 'texto', texto: 'Quero alugar um apartamento' },
      { direcao: 'interna', autor_tipo: 'atendente', tipo: 'texto', texto: 'nota secreta' },
      { direcao: 'saida', autor_tipo: 'ia', tipo: 'texto', texto: 'Em qual cidade?' },
      { direcao: 'entrada', autor_tipo: 'cliente', tipo: 'imagem', texto: null },
      { direcao: 'entrada', autor_tipo: 'cliente', tipo: 'texto', texto: 'Nova Cruz' },
    ]);
    expect(h).toEqual([
      { role: 'user', content: 'Oi\nQuero alugar um apartamento' },
      { role: 'assistant', content: 'Em qual cidade?' },
      { role: 'user', content: '[📷 Foto]\nNova Cruz' },
    ]);
    expect(JSON.stringify(h)).not.toContain('nota secreta');
  });

  it('começa e termina com o cliente', () => {
    expect(historicoDe([{ direcao: 'saida', autor_tipo: 'aparelho', tipo: 'texto', texto: 'Boa tarde' }])).toEqual([]);
    expect(
      historicoDe([
        { direcao: 'saida', autor_tipo: 'aparelho', tipo: 'texto', texto: 'Boa tarde' },
        { direcao: 'entrada', autor_tipo: 'cliente', tipo: 'texto', texto: 'Oi' },
        { direcao: 'saida', autor_tipo: 'ia', tipo: 'texto', texto: 'Como posso ajudar?' },
      ]),
    ).toEqual([{ role: 'user', content: 'Oi' }]);
  });
});

describe('Etapa 3 — o que volta do modelo', () => {
  it('a ferramenta só aceita os ids dos times da empresa, ou "nenhum"', () => {
    const f = ferramentaClassificar(TIMES);
    expect(f.name).toBe('classificar');
    expect((f.input_schema as any).properties.time_id.enum).toEqual([TIMES[0].id, TIMES[1].id, 'nenhum']);
  });

  it('saneia: enum fora da lista vira padrão, time desconhecido vira null, confiança fica em [0,1]', () => {
    const c = lerClassificacao({ assunto: '  Alugar apê  ', intencao: 'vender-a-alma', time_id: 'time-de-outra-empresa', prioridade: 'máxima', confianca: 7, resumo: 'x', lead: 'fervendo', precisa_esclarecer: false, resposta_ao_cliente: '' }, TIMES, true);
    expect(c).toMatchObject({ assunto: 'Alugar apê', intencao: 'outro', time_id: null, prioridade: 'normal', confianca: 1, lead: 'morno', precisa_esclarecer: false, pergunta: null, resposta_ao_cliente: null });
  });

  it('aceita o que está certo e guarda a pergunta quando pede esclarecimento', () => {
    const c = lerClassificacao({ assunto: 'Boleto atrasado', intencao: 'financeiro', time_id: TIMES[1].id, prioridade: 'alta', confianca: 0.874, resumo: 'Cliente com boleto vencido.', lead: 'nao_e_lead', precisa_esclarecer: true, resposta_ao_cliente: 'Qual o número do contrato?' }, TIMES, true);
    expect(c).toMatchObject({ intencao: 'financeiro', time_id: TIMES[1].id, prioridade: 'alta', confianca: 0.87, lead: 'nao_e_lead', precisa_esclarecer: true, pergunta: 'Qual o número do contrato?' });
  });

  it('quando já perguntou o máximo, o pedido de esclarecimento é ignorado', () => {
    const c = lerClassificacao({ assunto: 'Oi', intencao: 'outro', time_id: 'nenhum', prioridade: 'normal', confianca: 0.2, resumo: '', lead: 'frio', precisa_esclarecer: true, resposta_ao_cliente: 'Sobre o quê?' }, TIMES, false);
    expect(c.precisa_esclarecer).toBe(false);
    expect(c.pergunta).toBeNull();
    // A resposta ainda vale como saudação.
    expect(c.resposta_ao_cliente).toBe('Sobre o quê?');
  });

  it('sem IA, casa palavras-chave e não inventa resposta ao cliente', () => {
    const c = classificarPorPalavrasChave('Quero saber o preço para alugar em Nova Cruz', TIMES);
    expect(c.time_id).toBe(TIMES[0].id);
    expect(c.resposta_ao_cliente).toBeNull();
    expect(c.precisa_esclarecer).toBe(false);
    const nada = classificarPorPalavrasChave('Bom dia', TIMES);
    expect(nada.time_id).toBeNull();
    expect(nada.confianca).toBe(0);
  });
});

describe('Etapa 3 — o contexto vem só do cadastro', () => {
  it('monta o contexto com o que a empresa cadastrou, e as regras proíbem vender', () => {
    const ctx = contextoDaEmpresa({ nome: 'Imobiliária Sol', segmento: 'Imobiliária', descricao: 'Imóveis em Natal', produtos_servicos: null, informacoes_ia: null, faq: [{ pergunta: 'Horário?', resposta: '8h às 18h' }], regras_atendimento: 'Nunca informar valores' }, TIMES);
    expect(ctx).toContain('Imobiliária Sol');
    expect(ctx).toContain('P: Horário?\nR: 8h às 18h');
    expect(ctx).toContain('Nunca informar valores');
    expect(ctx).toContain(`id "${TIMES[0].id}": Vendas — Quem quer comprar ou alugar (palavras-chave: comprar, alugar, preço)`);
    expect(ctx).not.toContain('Produtos e serviços');
    expect(REGRAS_DA_TRIAGEM).toMatch(/Não vende, não negocia/);
    expect(REGRAS_DA_TRIAGEM).toMatch(/Não inventa nada sobre a empresa/);
  });

  it('sem times, manda escolher "nenhum"', () => {
    expect(contextoDaEmpresa({ nome: 'X', segmento: null, descricao: null, produtos_servicos: null, informacoes_ia: null, faq: [], regras_atendimento: null }, [])).toContain('não cadastrou setores');
  });
});

describe('Etapa 3 — quem recebe a conversa', () => {
  const agora = Date.parse('2026-09-16T17:30:00Z');
  const ha = (ms: number) => new Date(agora - ms).toISOString();

  it('entre os online (visto há menos de 2 min), quem tem menos conversas abertas', () => {
    const escolhido = escolherAtendente(
      [
        { id: 1, presenca: 'online', presenca_em: ha(10_000), abertas: 3 },
        { id: 2, presenca: 'online', presenca_em: ha(30_000), abertas: 1 },
        { id: 3, presenca: 'online', presenca_em: ha(PRESENCA_VALIDA_MS + 1), abertas: 0 }, // sumiu há mais de 2 min
        { id: 4, presenca: 'offline', presenca_em: ha(1000), abertas: 0 },
        { id: 5, presenca: 'online', presenca_em: null, abertas: 0 },
      ],
      agora,
    );
    expect(escolhido).toBe(2);
  });

  it('empate vai para o menor id; ninguém online vai para a fila', () => {
    expect(escolherAtendente([{ id: 9, presenca: 'online', presenca_em: ha(1), abertas: 2 }, { id: 4, presenca: 'online', presenca_em: ha(1), abertas: 2 }], agora)).toBe(4);
    expect(escolherAtendente([{ id: 1, presenca: 'ausente', presenca_em: ha(1), abertas: 0 }], agora)).toBeNull();
    expect(escolherAtendente([], agora)).toBeNull();
  });
});

describe('Etapa 3 — as chaves da empresa', () => {
  it('o PATCH da empresa aceita ligar e desligar a triagem e a resposta fora do horário', () => {
    expect(validarEmpresa({ triagem_ativa: false })).toEqual({ ok: true, valor: { triagem_ativa: false } });
    expect(validarEmpresa({ responde_fora_do_horario: 'sim' })).toEqual({ ok: true, valor: { responde_fora_do_horario: false } });
    expect(validarEmpresa({ triagem_ativa: true, responde_fora_do_horario: true })).toEqual({ ok: true, valor: { triagem_ativa: true, responde_fora_do_horario: true } });
  });
});
