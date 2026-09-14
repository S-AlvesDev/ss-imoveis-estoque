import { describe, it, expect, vi } from 'vitest';
import { createHmac } from 'node:crypto';

// Os módulos do servidor importam o cliente do Supabase, que exige URL no import. Aqui só as regras puras.
vi.mock('../lib/supabaseServer', () => ({ supabaseServer: {} }));

import { situacaoDaConta, precoDo, planoDoMpPlanId, MP_PLANO_ID, AVALIACAO_DIAS, CARENCIA_DIAS } from '../shared/planos';

const MP_PLANO_DE_TESTE = 'd498ce9708594fec89331933d452b488';
import { assinaturaDoWebhookValida, corpoDaAssinatura, corpoDaAssinaturaComCartao, mpPublicKey, mensagemParaOPagador, ErroDoMercadoPago, urlDoCheckoutDoPlano, idDoEvento, tipoDoEvento, mpPlanId, motivo } from './mercadopago';
import { traduzirStatus, traduzirPagamento, planoAteDe } from './assinaturas';

const DIA = 24 * 60 * 60 * 1000;
const agora = new Date('2026-09-12T12:00:00Z');
const em = (dias: number) => new Date(agora.getTime() + dias * DIA).toISOString();

describe('situacaoDaConta', () => {
  it('plano sem vencimento é cortesia: assinada, sem prazo', () => {
    expect(situacaoDaConta({ plano: 'empresarial', plano_ate: null, avaliacao_ate: null }, agora)).toEqual({ situacao: 'assinada', plano: 'empresarial', ate: null, dias_restantes: null });
  });

  it('plano com vencimento no futuro é assinada; vencido há pouco é carência; vencido além da carência bloqueia', () => {
    expect(situacaoDaConta({ plano: 'profissional', plano_ate: em(10), avaliacao_ate: null }, agora)).toMatchObject({ situacao: 'assinada', plano: 'profissional', dias_restantes: 10 });
    expect(situacaoDaConta({ plano: 'profissional', plano_ate: em(-1), avaliacao_ate: null }, agora)).toMatchObject({ situacao: 'carencia', plano: 'profissional', dias_restantes: CARENCIA_DIAS - 1 });
    expect(situacaoDaConta({ plano: 'profissional', plano_ate: em(-(CARENCIA_DIAS + 1)), avaliacao_ate: null }, agora)).toMatchObject({ situacao: 'bloqueada', plano: 'avaliacao', dias_restantes: 0 });
  });

  it('sem plano: avaliação no prazo libera tudo; terminada, bloqueia', () => {
    expect(situacaoDaConta({ plano: null, plano_ate: null, avaliacao_ate: em(AVALIACAO_DIAS) }, agora)).toMatchObject({ situacao: 'avaliacao', plano: 'avaliacao', dias_restantes: AVALIACAO_DIAS });
    expect(situacaoDaConta({ plano: null, plano_ate: null, avaliacao_ate: em(-1) }, agora)).toMatchObject({ situacao: 'bloqueada', dias_restantes: 0 });
  });

  it('conta de antes da cobrança (sem plano e sem avaliação) não trava', () => {
    expect(situacaoDaConta({ plano: null, plano_ate: null, avaliacao_ate: null }, agora)).toEqual({ situacao: 'avaliacao', plano: 'avaliacao', ate: null, dias_restantes: null });
  });

  it('a avaliação só conta sem plano: com plano vencido, o que vale é a carência', () => {
    expect(situacaoDaConta({ plano: 'essencial', plano_ate: em(-5), avaliacao_ate: em(30) }, agora).situacao).toBe('bloqueada');
  });
});

describe('preços e planos do painel', () => {
  it('anual é 10 meses', () => {
    expect(precoDo('essencial', 'mensal')).toBe(199.9);
    expect(precoDo('essencial', 'anual')).toBe(1999);
    expect(precoDo('profissional', 'anual')).toBe(3999);
  });

  it('traduz o id do plano do MP; o de teste só em modo teste', () => {
    expect(planoDoMpPlanId(MP_PLANO_ID.profissional.mensal)).toEqual({ plano: 'profissional', ciclo: 'mensal' });
    expect(planoDoMpPlanId(MP_PLANO_DE_TESTE)).toBeNull();
    expect(planoDoMpPlanId(MP_PLANO_DE_TESTE, MP_PLANO_DE_TESTE)).toEqual({ plano: 'essencial', ciclo: 'mensal' });
    expect(planoDoMpPlanId('nada')).toBeNull();
  });

  it('mpPlanId troca o Essencial mensal pelo de teste só com MP_PLANO_DE_TESTE configurado (e válido)', () => {
    expect(mpPlanId('essencial', 'mensal', {})).toBe(MP_PLANO_ID.essencial.mensal);
    expect(mpPlanId('essencial', 'mensal', { MP_PLANO_DE_TESTE })).toBe(MP_PLANO_DE_TESTE);
    expect(mpPlanId('essencial', 'mensal', { MP_PLANO_DE_TESTE: '1' })).toBe(MP_PLANO_ID.essencial.mensal);
    expect(mpPlanId('profissional', 'mensal', { MP_PLANO_DE_TESTE })).toBe(MP_PLANO_ID.profissional.mensal);
    expect(mpPlanId('essencial', 'anual', { MP_PLANO_DE_TESTE })).toBeNull();
  });
});

describe('Mercado Pago — corpo, URL e webhook', () => {
  it('monta a URL do checkout do plano com a nossa referência', () => {
    expect(urlDoCheckoutDoPlano('abc', 'org-1')).toBe('https://www.mercadopago.com.br/subscriptions/checkout?preapproval_plan_id=abc&external_reference=org-1');
  });

  it('monta o corpo da assinatura sem plano: valor do catálogo, ciclo em meses, volta para o site', () => {
    const c = corpoDaAssinatura({ plano: 'profissional', ciclo: 'anual', organizationId: 'org-1', payerEmail: 'a@b.com', env: { SITE_URL: 'http://localhost:3001/' } });
    expect(c).toEqual({
      reason: 'Stok Aí — Profissional (anual)',
      external_reference: 'org-1',
      payer_email: 'a@b.com',
      auto_recurring: { frequency: 12, frequency_type: 'months', transaction_amount: 3999, currency_id: 'BRL' },
      back_url: 'http://localhost:3001/assinatura/retorno',
      status: 'pending',
    });
    expect(motivo('essencial', 'mensal')).toBe('Stok Aí — Essencial (mensal)');
  });

  it('corpo com cartão: com plano do painel copia a recorrência do plano; sem plano usa o catálogo; nasce autorizada', () => {
    const comum = { plano: 'essencial' as const, ciclo: 'mensal' as const, organizationId: 'org-1', payerEmail: 'a@b.com', cardTokenId: 'tok_1', env: { SITE_URL: 'https://stokai.app' } };
    const rec = { frequency: 1, frequency_type: 'weeks', transaction_amount: 0.5, currency_id: 'BRL' };
    expect(corpoDaAssinaturaComCartao({ ...comum, planId: 'plano-x', recorrenciaDoPlano: rec })).toEqual({
      reason: 'Stok Aí — Essencial (mensal)',
      external_reference: 'org-1',
      payer_email: 'a@b.com',
      card_token_id: 'tok_1',
      back_url: 'https://stokai.app/assinatura/retorno',
      status: 'authorized',
      preapproval_plan_id: 'plano-x',
      auto_recurring: rec,
    });
    const semPlano = corpoDaAssinaturaComCartao({ ...comum, ciclo: 'anual', planId: null });
    expect(semPlano).not.toHaveProperty('preapproval_plan_id');
    expect(semPlano.auto_recurring).toEqual({ frequency: 12, frequency_type: 'months', transaction_amount: 1999, currency_id: 'BRL' });
  });

  it('chave pública só vale junto com o access token', () => {
    expect(mpPublicKey({ MP_PUBLIC_KEY: 'APP_USR-pk' })).toBeNull();
    expect(mpPublicKey({ MP_ACCESS_TOKEN: 'APP_USR-at', MP_PUBLIC_KEY: 'APP_USR-pk' })).toBe('APP_USR-pk');
  });

  it('a frase para o pagador vem do que o MP respondeu', () => {
    expect(mensagemParaOPagador(new ErroDoMercadoPago(400, 'x', { message: 'CC_VAL_433 Credit card validation has failed' }))).toContain('não autorizou a validação');
    expect(mensagemParaOPagador(new ErroDoMercadoPago(400, 'x', { message: 'Invalid card_token_id' }))).toContain('cartão não foi aceito');
    expect(mensagemParaOPagador(new ErroDoMercadoPago(400, 'x', { message: 'Payer and collector cannot be the same user' }))).toContain('conta que recebe');
    expect(mensagemParaOPagador(new ErroDoMercadoPago(400, 'x', { message: 'cc_rejected_insufficient_amount' }))).toContain('recusou');
    expect(mensagemParaOPagador(new Error('rede'))).toContain('Tente de novo');
  });

  it('valida a assinatura do webhook com o manifesto do MP', () => {
    const secret = 's3gr3d0';
    const ts = '1700000000';
    const manifesto = `id:abc123;request-id:req-1;ts:${ts};`;
    const v1 = createHmac('sha256', secret).update(manifesto).digest('hex');
    expect(assinaturaDoWebhookValida({ xSignature: `ts=${ts},v1=${v1}`, xRequestId: 'req-1', dataId: 'ABC123', secret })).toBe(true);
    expect(assinaturaDoWebhookValida({ xSignature: `ts=${ts},v1=${v1}`, xRequestId: 'req-2', dataId: 'ABC123', secret })).toBe(false);
    expect(assinaturaDoWebhookValida({ xSignature: undefined, xRequestId: 'req-1', dataId: 'abc123', secret })).toBe(false);
    expect(assinaturaDoWebhookValida({ xSignature: `ts=${ts},v1=${v1}`, xRequestId: 'req-1', dataId: 'abc123', secret: undefined })).toBeNull();
  });

  it('acha id e tipo no corpo ou na URL', () => {
    expect(idDoEvento({ data: { id: 123 } }, {})).toBe('123');
    expect(idDoEvento(undefined, { 'data.id': 'x1' })).toBe('x1');
    expect(idDoEvento({}, {})).toBeNull();
    expect(tipoDoEvento({ type: 'subscription_preapproval' }, {})).toBe('subscription_preapproval');
    expect(tipoDoEvento(undefined, { topic: 'payment' })).toBe('payment');
  });
});

describe('tradução do que o MP diz', () => {
  it('status da assinatura', () => {
    expect(traduzirStatus('authorized')).toBe('autorizada');
    expect(traduzirStatus('paused')).toBe('pausada');
    expect(traduzirStatus('cancelled')).toBe('cancelada');
    expect(traduzirStatus('pending')).toBe('pendente');
    expect(traduzirStatus(undefined)).toBe('pendente');
  });

  it('status da cobrança olha a cobrança e o pagamento', () => {
    expect(traduzirPagamento({ status: 'scheduled', payment: null })).toEqual({ status: 'agendado', detalhe: null });
    expect(traduzirPagamento({ status: 'processed', payment: { status: 'approved', status_detail: 'accredited' } })).toEqual({ status: 'aprovado', detalhe: 'accredited' });
    expect(traduzirPagamento({ status: 'processed', payment: { status: 'rejected', status_detail: 'cc_rejected_insufficient_amount' } })).toEqual({ status: 'recusado', detalhe: 'cc_rejected_insufficient_amount' });
    expect(traduzirPagamento({ status: 'recycling', payment: { status: 'rejected' } })).toEqual({ status: 'pendente', detalhe: 'nova tentativa agendada' });
    expect(traduzirPagamento({ status: 'cancelled', payment: null })).toEqual({ status: 'cancelado', detalhe: null });
  });

  it('plano vale até a próxima cobrança do MP; sem ela, um ciclo', () => {
    expect(planoAteDe({ next_payment_date: '2026-10-12T12:00:00.000Z' }, 'mensal', agora)).toBe('2026-10-12T12:00:00.000Z');
    expect(planoAteDe({ next_payment_date: null }, 'mensal', agora)).toBe('2026-10-12T12:00:00.000Z');
    expect(planoAteDe({ next_payment_date: null }, 'anual', agora)).toBe('2027-09-12T12:00:00.000Z');
  });
});
