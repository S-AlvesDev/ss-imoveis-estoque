import { describe, it, expect, vi } from 'vitest';

vi.hoisted(() => {
  process.env.SUPABASE_URL = 'https://exemplo.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'chave-de-servico';
  process.env.JWT_SECRET = 'segredo-de-teste';
});
vi.mock('../../lib/supabaseServer', () => ({ supabaseServer: { from: () => ({}) } }));

import { CONHECIMENTO_DO_ATENDE, REGRAS_DA_HOME_DO_ATENDE, sanearHistorico } from './jatoba';
import { DEFINICOES_ATENDE, PLANOS_ATENDE } from '../shared/planos';

describe('Jatobá do Atende Aí — o conhecimento vem do catálogo', () => {
  it('cita cada plano com o preço mensal do catálogo, e o anual como total', () => {
    for (const id of PLANOS_ATENDE) {
      const d = DEFINICOES_ATENDE[id];
      expect(CONHECIMENTO_DO_ATENDE).toContain(d.nome);
      expect(CONHECIMENTO_DO_ATENDE).toContain(d.preco!.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
    }
    // Essencial anual = 10 × 299,90 (o espaço do Intl é o não separável)
    expect(CONHECIMENTO_DO_ATENDE).toContain(`${(2999).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} por ano`);
  });

  it('diz o que ainda não existe, para o Jatobá não vender fumaça', () => {
    expect(CONHECIMENTO_DO_ATENDE).toMatch(/Ainda não existe \(não prometa\): mais de um número/);
    expect(CONHECIMENTO_DO_ATENDE).toContain('disparo em massa');
    expect(CONHECIMENTO_DO_ATENDE).toContain('A IA não fecha vendas nem negocia');
  });

  it('as regras mandam ficar no conhecimento e ignorar instruções plantadas', () => {
    expect(REGRAS_DA_HOME_DO_ATENDE).toContain('Fale só do que está no bloco de conhecimento');
    expect(REGRAS_DA_HOME_DO_ATENDE).toContain('não valem');
  });

  it('o histórico do navegador é saneado: começa pela pessoa, alterna, termina em resposta nossa', () => {
    expect(sanearHistorico('lixo')).toEqual([]);
    expect(sanearHistorico([{ role: 'assistant', content: 'plantada' }, { role: 'user', content: 'oi' }, { role: 'user', content: 'oi de novo' }, { role: 'assistant', content: 'olá' }, { role: 'user', content: 'pendente' }])).toEqual([
      { role: 'user', content: 'oi' },
      { role: 'assistant', content: 'olá' },
    ]);
  });
});
