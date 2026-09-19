import { describe, it, expect, vi } from 'vitest';

/**
 * As regras puras das rotinas do Atende Aí: quando o SLA avisa e escalona,
 * quando um lead merece follow-up, e o que vale como dado de faturamento.
 */

vi.hoisted(() => {
  process.env.SUPABASE_URL = 'https://exemplo.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'chave-de-servico';
  process.env.JWT_SECRET = 'segredo-de-teste';
});
vi.mock('../../lib/supabaseServer', () => ({ supabaseServer: { from: () => ({}) } }));

import { decidirSla } from './sla';
import { precisaDeFollowup, sugestaoPadrao, SILENCIO_H } from './followup';
import { validarFaturamento } from './cobrancas';

const MIN = 60_000;
const H = 3600_000;
const agora = new Date('2026-09-19T15:00:00.000Z');
const ha = (min: number) => new Date(agora.getTime() - min * MIN);
const cfg = { sla_aviso_min: 10, sla_escalonar_min: 30 };

describe('SLA — decidir', () => {
  it('antes do limite não faz nada; no aviso avisa; no escalonamento escalona', () => {
    const c = { sla_avisada_em: null, sla_escalonada_em: null };
    expect(decidirSla(c, ha(5), agora, cfg)).toBeNull();
    expect(decidirSla(c, ha(10), agora, cfg)).toBe('avisar');
    expect(decidirSla(c, ha(29), agora, cfg)).toBe('avisar');
    expect(decidirSla(c, ha(30), agora, cfg)).toBe('escalonar');
  });

  it('não repete o aviso na mesma espera; uma espera nova avisa de novo', () => {
    const avisada = { sla_avisada_em: ha(8).toISOString(), sla_escalonada_em: null };
    expect(decidirSla(avisada, ha(15), agora, cfg)).toBeNull();
    // Espera nova (começou depois do carimbo): avisa outra vez.
    expect(decidirSla({ sla_avisada_em: ha(60).toISOString(), sla_escalonada_em: ha(40).toISOString() }, ha(12), agora, cfg)).toBe('avisar');
  });

  it('escalona uma vez por espera; já escalonada, fica quieta', () => {
    expect(decidirSla({ sla_avisada_em: ha(20).toISOString(), sla_escalonada_em: ha(1).toISOString() }, ha(45), agora, cfg)).toBeNull();
  });

  it('desligado (nulo) não age; só aviso, só avisa', () => {
    const c = { sla_avisada_em: null, sla_escalonada_em: null };
    expect(decidirSla(c, ha(500), agora, { sla_aviso_min: null, sla_escalonar_min: null })).toBeNull();
    expect(decidirSla(c, ha(500), agora, { sla_aviso_min: 10, sla_escalonar_min: null })).toBe('avisar');
  });
});

describe('Follow-up — precisa?', () => {
  const lead = (extra: any = {}, conversa: any = {}) => ({
    id: 'l1',
    conversa_id: 'c1',
    estado: 'em_negociacao' as const,
    followup_sugestao: null,
    followup_sugerido_em: null,
    followup_enviado_em: null,
    followup_descartado_em: null,
    conversa: { id: 'c1', estado: 'aguardando_cliente', atendente_id: 1, time_id: null, assunto: 'Orçamento', resumo: null, ultima_mensagem_em: new Date(agora.getTime() - 30 * H).toISOString(), ultima_mensagem_de: 'atendente', cliente: { nome: 'Ana', nome_whatsapp: null }, ...conversa },
    ...extra,
  });

  it('a equipe falou por último há mais de 24 h: sim', () => {
    expect(precisaDeFollowup(lead(), agora)).toBe(true);
  });

  it('cliente falou por último (caso do SLA), silêncio curto, lead decidido ou conversa encerrada: não', () => {
    expect(precisaDeFollowup(lead({}, { ultima_mensagem_de: 'cliente' }), agora)).toBe(false);
    expect(precisaDeFollowup(lead({}, { ultima_mensagem_em: new Date(agora.getTime() - 3 * H).toISOString() }), agora)).toBe(false);
    expect(precisaDeFollowup(lead({ estado: 'convertido' }), agora)).toBe(false);
    expect(precisaDeFollowup(lead({ estado: 'perdido' }), agora)).toBe(false);
    expect(precisaDeFollowup(lead({}, { estado: 'encerrada' }), agora)).toBe(false);
  });

  it('já sugerido, enviado ou descartado depois da última mensagem: não insiste', () => {
    const depois = new Date(agora.getTime() - 2 * H).toISOString();
    expect(precisaDeFollowup(lead({ followup_sugestao: 'Oi', followup_sugerido_em: depois }), agora)).toBe(false);
    expect(precisaDeFollowup(lead({ followup_enviado_em: depois }), agora)).toBe(false);
    expect(precisaDeFollowup(lead({ followup_descartado_em: depois }), agora)).toBe(false);
    // Decisão ANTES da última mensagem nossa: a conversa andou, pode sugerir de novo.
    const antes = new Date(agora.getTime() - 50 * H).toISOString();
    expect(precisaDeFollowup(lead({ followup_descartado_em: antes }), agora)).toBe(true);
  });

  it('a sugestão padrão (sem IA) é curta e no assunto', () => {
    expect(sugestaoPadrao('Ana', 'Orçamento')).toBe('Oi, Ana! Passando para saber se posso ajudar com orçamento. Ficou alguma dúvida?');
    expect(sugestaoPadrao(null, null)).toBe('Oi! Passando para saber se ficou alguma dúvida. Posso ajudar em algo?');
    expect(SILENCIO_H).toBe(24);
  });
});

describe('Faturamento — validar', () => {
  it('nulo apaga; CPF/CNPJ com pontuação vira só dígitos; tipo pelo tamanho', () => {
    expect(validarFaturamento(null)).toEqual({ ok: true, valor: null });
    const r = validarFaturamento({ nome: ' Loja X ', doc: '12.345.678/0001-90', email: 'FIN@loja.com' });
    expect(r).toEqual({ ok: true, valor: { nome: 'Loja X', tipoDoc: 'CNPJ', doc: '12345678000190', email: 'fin@loja.com', endereco: null } });
    expect((validarFaturamento({ nome: 'Ana', doc: '123.456.789-09' }) as any).valor.tipoDoc).toBe('CPF');
  });

  it('recusa documento fora do tamanho e endereço pela metade', () => {
    expect(validarFaturamento({ nome: 'Ana', doc: '123' })).toMatchObject({ ok: false });
    expect(validarFaturamento({ nome: 'Ana', doc: '12345678909', endereco: { rua: 'Rua A' } })).toMatchObject({ ok: false });
    expect(validarFaturamento({ nome: 'Ana', doc: '12345678909', endereco: { cep: '59000-000', rua: 'Rua A', numero: '10', bairro: 'Centro', cidade: 'Natal', uf: 'rn' } })).toMatchObject({ ok: true, valor: { endereco: { cep: '59000000', uf: 'RN' } } });
  });
});
