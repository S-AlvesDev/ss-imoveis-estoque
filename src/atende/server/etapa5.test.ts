import { describe, it, expect, vi } from 'vitest';

vi.mock('../../lib/supabaseServer', () => ({ supabaseServer: {} }));
vi.hoisted(() => {
  process.env.SUPABASE_URL = 'https://exemplo.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'chave-de-servico';
  process.env.JWT_SECRET = 'segredo-de-teste';
});

import { agregarDashboard, intervaloDoPeriodo, inicioDoDia, diaDe, type DadosDoDashboard } from './dashboard';

const VENDAS = 'aaaaaaaa-0000-4000-8000-000000000001';
const FIN = 'aaaaaaaa-0000-4000-8000-000000000002';

// Período: 15 a 17 de setembro de 2026 (Brasília).
const DE = new Date('2026-09-15T03:00:00Z');
const ATE = new Date('2026-09-17T20:00:00Z');

const DADOS: DadosDoDashboard = {
  conversas: [
    // Cliente abriu, Ana respondeu em 2 min, encerrada em 1 h.
    { id: 'c1', estado: 'encerrada', time_id: VENDAS, atendente_id: 1, aberta_em: '2026-09-15T12:00:00Z', primeira_resposta_em: '2026-09-15T12:02:00Z', encerrada_em: '2026-09-15T13:00:00Z', aberta_por: 'cliente' },
    // Cliente abriu, Ana respondeu em 10 min, ainda aberta.
    { id: 'c2', estado: 'em_atendimento', time_id: VENDAS, atendente_id: 1, aberta_em: '2026-09-16T12:00:00Z', primeira_resposta_em: '2026-09-16T12:10:00Z', encerrada_em: null, aberta_por: 'cliente' },
    // Cliente abriu, Bruno respondeu em 30 min, encerrada em 3 h.
    { id: 'c3', estado: 'encerrada', time_id: FIN, atendente_id: 2, aberta_em: '2026-09-16T15:00:00Z', primeira_resposta_em: '2026-09-16T15:30:00Z', encerrada_em: '2026-09-16T18:00:00Z', aberta_por: 'cliente' },
    // Empresa abriu pelo celular: não conta como primeira resposta.
    { id: 'c4', estado: 'em_atendimento', time_id: null, atendente_id: null, aberta_em: '2026-09-17T12:00:00Z', primeira_resposta_em: '2026-09-17T12:00:00Z', encerrada_em: null, aberta_por: 'aparelho' },
    // Cliente abriu, ninguém respondeu ainda, na fila.
    { id: 'c5', estado: 'na_fila', time_id: VENDAS, atendente_id: null, aberta_em: '2026-09-17T14:00:00Z', primeira_resposta_em: null, encerrada_em: null, aberta_por: 'cliente' },
  ],
  leads: [
    { conversa_id: 'c1', estado: 'convertido', sugestao_ia: 'quente', valor: 1500, criado_em: '2026-09-15T12:00:30Z' },
    { conversa_id: 'c2', estado: 'em_negociacao', sugestao_ia: 'morno', valor: null, criado_em: '2026-09-16T12:00:30Z' },
    { conversa_id: 'c3', estado: 'perdido', sugestao_ia: 'nao_e_lead', valor: null, criado_em: '2026-09-16T15:00:30Z' },
    { conversa_id: 'c5', estado: 'novo', sugestao_ia: 'quente', valor: null, criado_em: '2026-09-17T14:00:30Z' },
  ],
  triagens: [
    { conversa_id: 'c1', intencao: 'comprar', confianca: 0.9, pediu_esclarecimento: false, desfecho: 'atribuida', corrigido_em: null, tokens_entrada: 1000, tokens_cache: 2000, tokens_saida: 150, modelo: 'claude-sonnet-5' },
    { conversa_id: 'c2', intencao: 'orcamento', confianca: 0.7, pediu_esclarecimento: false, desfecho: 'na_fila', corrigido_em: '2026-09-16T12:05:00Z', tokens_entrada: 1000, tokens_cache: 2000, tokens_saida: 150, modelo: 'claude-sonnet-5' },
    { conversa_id: 'c3', intencao: null, confianca: null, pediu_esclarecimento: true, desfecho: 'esclarecendo', corrigido_em: null, tokens_entrada: 900, tokens_cache: 2000, tokens_saida: 80, modelo: 'claude-sonnet-5' },
    { conversa_id: 'c3', intencao: 'financeiro', confianca: 0.8, pediu_esclarecimento: false, desfecho: 'atribuida', corrigido_em: null, tokens_entrada: 1100, tokens_cache: 2000, tokens_saida: 160, modelo: 'claude-sonnet-5' },
    { conversa_id: 'c5', intencao: 'comprar', confianca: 0.6, pediu_esclarecimento: false, desfecho: 'na_fila', corrigido_em: null, tokens_entrada: null, tokens_cache: null, tokens_saida: null, modelo: 'palavras-chave' },
  ],
  mensagens: [
    { autor_id: null, autor_tipo: 'cliente', direcao: 'entrada' },
    { autor_id: null, autor_tipo: 'cliente', direcao: 'entrada' },
    { autor_id: null, autor_tipo: 'cliente', direcao: 'entrada' },
    { autor_id: 1, autor_tipo: 'atendente', direcao: 'saida' },
    { autor_id: 1, autor_tipo: 'atendente', direcao: 'saida' },
    { autor_id: 2, autor_tipo: 'atendente', direcao: 'saida' },
    { autor_id: null, autor_tipo: 'ia', direcao: 'saida' },
    { autor_id: null, autor_tipo: 'aparelho', direcao: 'saida' },
  ],
  abertasAgora: [{ estado: 'em_atendimento' }, { estado: 'em_atendimento' }, { estado: 'na_fila' }],
};

describe('Etapa 5 — o período no fuso da empresa', () => {
  it('a meia-noite de Brasília em UTC', () => {
    // 17/09 23:30 em Brasília = 18/09 02:30 UTC → o dia começou em 17/09 03:00 UTC.
    expect(inicioDoDia(new Date('2026-09-18T02:30:00Z')).toISOString()).toBe('2026-09-17T03:00:00.000Z');
    expect(inicioDoDia(new Date('2026-09-17T15:00:00Z')).toISOString()).toBe('2026-09-17T03:00:00.000Z');
  });

  it('hoje, 7, 30 e 90 dias contam o dia de hoje', () => {
    const agora = new Date('2026-09-17T15:00:00Z');
    expect(intervaloDoPeriodo('hoje', agora).de.toISOString()).toBe('2026-09-17T03:00:00.000Z');
    expect(intervaloDoPeriodo('7d', agora).de.toISOString()).toBe('2026-09-11T03:00:00.000Z');
    expect(intervaloDoPeriodo('30d', agora).de.toISOString()).toBe('2026-08-19T03:00:00.000Z');
    expect(intervaloDoPeriodo('90d', agora).ate).toBe(agora);
  });

  it('o dia da série é o de Brasília', () => {
    expect(diaDe('2026-09-18T02:30:00Z')).toBe('2026-09-17');
    expect(diaDe('2026-09-18T03:00:00Z')).toBe('2026-09-18');
  });
});

describe('Etapa 5 — a agregação conta, não estima', () => {
  const d = agregarDashboard(DADOS, { de: DE, ate: ATE });

  it('atendimentos e tempos (mediana e média em segundos)', () => {
    expect(d.atendimentos).toMatchObject({ abertas_no_periodo: 5, encerradas_no_periodo: 2, abertas_agora: 3, na_fila_agora: 1, sem_resposta_humana: 1, mensagens_do_cliente: 3, mensagens_da_equipe: 4, mensagens_da_ia: 1 });
    // Primeiras respostas: 120 s, 600 s, 1800 s (o celular da empresa não conta).
    expect(d.atendimentos.primeira_resposta_mediana_s).toBe(600);
    expect(d.atendimentos.primeira_resposta_media_s).toBe(840);
    // Resoluções: 3600 s e 10800 s.
    expect(d.atendimentos.resolucao_mediana_s).toBe(7200);
    expect(d.atendimentos.resolucao_media_s).toBe(7200);
  });

  it('a série tem todos os dias do período, com zero onde não houve nada', () => {
    expect(d.serie).toEqual([
      { dia: '2026-09-15', conversas: 1 },
      { dia: '2026-09-16', conversas: 2 },
      { dia: '2026-09-17', conversas: 2 },
    ]);
  });

  it('o funil e a conversão sobre os decididos', () => {
    expect(d.leads.total).toBe(4);
    expect(d.leads.funil).toEqual({ novo: 1, em_atendimento: 0, em_negociacao: 1, aguardando_cliente: 0, convertido: 1, perdido: 1 });
    expect(d.leads.taxa_de_conversao).toBe(50);
    expect(d.leads.valor_convertido).toBe(1500);
    expect(d.leads.sugestoes_da_ia).toEqual({ quente: 2, morno: 1, nao_e_lead: 1 });
  });

  it('a IA: decisões, correções, confiança, intenções e tokens', () => {
    expect(d.ia).toMatchObject({ triagens: 5, decisoes: 4, conversas_triadas: 4, esclarecimentos: 1, corrigidas: 1, taxa_de_correcao: 25, confianca_media: 0.75 });
    expect(d.ia.intencoes).toEqual({ comprar: 2, orcamento: 1, financeiro: 1 });
    expect(d.ia.tokens).toEqual({ entrada: 4000, cache: 8000, saida: 540 });
    expect(d.ia.modelos).toEqual(['claude-sonnet-5', 'palavras-chave']);
  });

  it('por pessoa: quem mais atendeu primeiro; mensagens da IA e do celular não são de ninguém', () => {
    expect(d.por_pessoa).toEqual([
      { usuario_id: 1, conversas: 2, encerradas: 1, primeira_resposta_mediana_s: 360, primeira_resposta_media_s: 360, mensagens_enviadas: 2, leads_convertidos: 1, valor_convertido: 1500 },
      { usuario_id: 2, conversas: 1, encerradas: 1, primeira_resposta_mediana_s: 1800, primeira_resposta_media_s: 1800, mensagens_enviadas: 1, leads_convertidos: 0, valor_convertido: 0 },
    ]);
  });

  it('por setor, com "sem setor" como linha própria', () => {
    expect(d.por_setor).toEqual([
      { time_id: VENDAS, conversas: 3, encerradas: 1, na_fila_agora: 1, primeira_resposta_mediana_s: 360, leads_convertidos: 1 },
      { time_id: FIN, conversas: 1, encerradas: 1, na_fila_agora: 0, primeira_resposta_mediana_s: 1800, leads_convertidos: 0 },
      { time_id: null, conversas: 1, encerradas: 0, na_fila_agora: 0, primeira_resposta_mediana_s: null, leads_convertidos: 0 },
    ]);
  });

  it('sem dado nenhum, tudo zero e nulo — nada inventado', () => {
    const vazio = agregarDashboard({ conversas: [], leads: [], triagens: [], mensagens: [], abertasAgora: [] }, { de: DE, ate: ATE });
    expect(vazio.atendimentos.abertas_no_periodo).toBe(0);
    expect(vazio.atendimentos.primeira_resposta_mediana_s).toBeNull();
    expect(vazio.leads.taxa_de_conversao).toBeNull();
    expect(vazio.ia.taxa_de_correcao).toBeNull();
    expect(vazio.ia.confianca_media).toBeNull();
    expect(vazio.serie.map((s) => s.conversas)).toEqual([0, 0, 0]);
    expect(vazio.por_pessoa).toEqual([]);
  });
});
