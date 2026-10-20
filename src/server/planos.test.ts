import { describe, it, expect, vi } from 'vitest';

// O módulo do servidor importa o cliente do Supabase, que exige URL no import. Aqui só as regras puras interessam.
vi.mock('../lib/supabaseServer', () => ({ supabaseServer: {} }));
import { DEFINICOES, PLANOS, planoEfetivo, definicaoDe, planoLibera, limiteDo, cabeMaisUm, planoMinimoPara, planoMinimoParaLimite, descreverLimite, mensagemDeRecurso, mensagemDeLimite, formatarPreco, situacaoDaConta } from '../shared/planos';
import { negarRecurso, negarLimite } from './planos';

describe('conta encerrada', () => {
  const base = { plano: 'empresarial', plano_ate: '2030-01-01T00:00:00Z', avaliacao_ate: null, cobranca: 'cartao' };
  it('encerrada manda em tudo: nem plano pago segura', () => {
    const c = situacaoDaConta({ ...base, encerrada_em: '2026-09-15T12:00:00Z' }, new Date('2026-09-20T12:00:00Z'));
    expect(c.situacao).toBe('encerrada');
    expect(c.plano).toBe('avaliacao');
    // 90 dias de prazo: encerrou em 15/09, apaga em 14/12; faltam 85.
    expect(c.ate?.slice(0, 10)).toBe('2026-12-14');
    expect(c.dias_restantes).toBe(85);
  });
  it('passado o prazo, zera os dias (o cron é quem apaga)', () => {
    expect(situacaoDaConta({ ...base, encerrada_em: '2026-01-01T12:00:00Z' }, new Date('2026-09-20T12:00:00Z')).dias_restantes).toBe(0);
  });
  it('sem encerramento, nada muda', () => {
    expect(situacaoDaConta({ ...base, encerrada_em: null }, new Date('2026-09-20T12:00:00Z')).situacao).toBe('assinada');
  });
});

describe('catálogo de planos', () => {
  it('tem os três planos do PDF, com os preços e limites combinados', () => {
    expect(PLANOS).toEqual(['essencial', 'profissional', 'empresarial']);
    expect(DEFINICOES.essencial).toMatchObject({ preco: 199.9, limites: { unidades: 1, depositosPorUnidade: 1, usuarios: 3 } });
    expect(DEFINICOES.profissional).toMatchObject({ preco: 399.9, limites: { unidades: 2, depositosPorUnidade: 3, usuarios: 10 } });
    expect(DEFINICOES.empresarial).toMatchObject({ preco: 699.9, limites: { unidades: 4, depositosPorUnidade: null, usuarios: null } });
  });

  it('cada plano inclui tudo que o anterior inclui', () => {
    for (const r of DEFINICOES.essencial.recursos) expect(DEFINICOES.profissional.recursos).toContain(r);
    for (const r of DEFINICOES.profissional.recursos) expect(DEFINICOES.empresarial.recursos).toContain(r);
  });

  it('sem plano (ou plano desconhecido) é avaliação, que vale como Empresarial', () => {
    expect(planoEfetivo(null)).toBe('avaliacao');
    expect(planoEfetivo(undefined)).toBe('avaliacao');
    expect(planoEfetivo('premium')).toBe('avaliacao');
    expect(planoEfetivo('profissional')).toBe('profissional');
    expect(definicaoDe('avaliacao')).toBe(DEFINICOES.empresarial);
  });

  it('transferência e identidade visual começam no Profissional; WhatsApp no Empresarial', () => {
    expect(planoLibera('essencial', 'transferencia')).toBe(false);
    expect(planoLibera('profissional', 'transferencia')).toBe(true);
    expect(planoLibera('essencial', 'identidade-visual')).toBe(false);
    expect(planoLibera('avaliacao', 'identidade-visual')).toBe(true);
    expect(planoMinimoPara('transferencia')).toBe('profissional');
    expect(planoMinimoPara('whatsapp')).toBe('empresarial');
    // O Jatobá no painel também é do Empresarial (decisão do Samuel); a avaliação tem tudo.
    expect(planoMinimoPara('jatoba')).toBe('empresarial');
    expect(planoLibera('profissional', 'jatoba')).toBe(false);
    expect(planoLibera('avaliacao', 'jatoba')).toBe(true);
  });

  it('limites: cabe mais um até bater; ilimitado sempre cabe', () => {
    expect(limiteDo('essencial', 'unidades')).toBe(1);
    expect(cabeMaisUm('essencial', 'unidades', 0)).toBe(true);
    expect(cabeMaisUm('essencial', 'unidades', 1)).toBe(false);
    expect(cabeMaisUm('profissional', 'usuarios', 9)).toBe(true);
    expect(cabeMaisUm('profissional', 'usuarios', 10)).toBe(false);
    expect(cabeMaisUm('empresarial', 'usuarios', 10_000)).toBe(true);
    expect(cabeMaisUm('avaliacao', 'depositosPorUnidade', 50)).toBe(true);
  });

  it('diz qual plano comporta uma quantidade', () => {
    expect(planoMinimoParaLimite('unidades', 1)).toBe('essencial');
    expect(planoMinimoParaLimite('unidades', 2)).toBe('profissional');
    expect(planoMinimoParaLimite('unidades', 4)).toBe('empresarial');
    expect(planoMinimoParaLimite('unidades', 5)).toBeNull();
    expect(planoMinimoParaLimite('depositosPorUnidade', 7)).toBe('empresarial');
  });

  it('frases prontas', () => {
    expect(descreverLimite('unidades', 1)).toBe('1 unidade');
    expect(descreverLimite('depositosPorUnidade', 3)).toBe('3 depósitos por unidade');
    expect(descreverLimite('usuarios', null)).toBe('usuários ilimitados');
    expect(formatarPreco(199.9)).toMatch(/R\$\s?199,90/);
    expect(mensagemDeRecurso('transferencia')).toBe('Transferência entre depósitos: disponível a partir do plano Profissional.');
    expect(mensagemDeLimite('essencial', 'unidades')).toBe('O plano Essencial inclui 1 unidade. Para mais, o plano Profissional.');
    expect(mensagemDeLimite('empresarial', 'unidades')).toBe('O plano Empresarial inclui 4 unidades. Para mais, fale com a gente (Enterprise).');
  });
});

describe('negativas do servidor', () => {
  it('libera com null e nega com 402 e a frase certa', () => {
    expect(negarRecurso('profissional', 'transferencia')).toBeNull();
    expect(negarRecurso('essencial', 'transferencia')).toEqual({ status: 402, body: { error: mensagemDeRecurso('transferencia'), plano: 'essencial', plano_minimo: 'profissional' } });
    expect(negarLimite('essencial', 'usuarios', 2)).toBeNull();
    expect(negarLimite('essencial', 'usuarios', 3)).toMatchObject({ status: 402, body: { error: expect.stringContaining('3 usuários'), plano: 'essencial' } });
    expect(negarLimite('avaliacao', 'usuarios', 999)).toBeNull();
  });
});
