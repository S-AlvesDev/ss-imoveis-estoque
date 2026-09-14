import { describe, it, expect, vi } from 'vitest';

vi.mock('../lib/supabaseServer', () => ({ supabaseServer: {} }));

import { situacaoDaConta, fimDoPeriodo, LEMBRETE_DIAS } from '../shared/planos';
import { validarPagador, cpfValido, cnpjValido } from './pagador';
import { corpoDoPagamentoAvulso, dadosParaPagar } from './mercadopago';
import { traduzirStatusDePagamento, descricaoDoAvulso } from './assinaturas';
import { precisaLembrar, emailDeLembrete } from './lembretes';
import { configuracaoNfse, corpoDaNfse, traduzirFocus, discriminacao } from './notafiscal';
import { numeroDoRecibo, dadosDoRecibo, descricaoDoRecibo } from '../shared/recibo';
import { emailDeRecibo, emitente } from './recibo';

const agora = new Date('2026-09-14T12:00:00Z');
const DIA = 24 * 60 * 60 * 1000;
const em = (d: number) => new Date(agora.getTime() + d * DIA).toISOString();

describe('pagador (Pix/boleto)', () => {
  it('valida CPF e CNPJ de verdade', () => {
    expect(cpfValido('529.982.247-25')).toBe(true);
    expect(cpfValido('111.111.111-11')).toBe(false);
    expect(cnpjValido('11.222.333/0001-81')).toBe(true);
    expect(cnpjValido('11.222.333/0001-82')).toBe(false);
  });

  it('Pix: nome, documento e e-mail bastam; boleto exige endereço', () => {
    const base = { nome: ' Instituto Teste ', doc: '11.222.333/0001-81', email: 'Fin@Teste.com' };
    const pix = validarPagador(base, 'pix');
    expect(pix).toEqual({ ok: true, pagador: { nome: 'Instituto Teste', email: 'fin@teste.com', tipoDoc: 'CNPJ', doc: '11222333000181', endereco: null } });
    const semEnd = validarPagador(base, 'boleto');
    expect(semEnd.ok).toBe(false);
    const comEnd = validarPagador({ ...base, endereco: { cep: '59000-000', rua: 'Rua A', numero: '10', bairro: 'Centro', cidade: 'Natal', uf: 'rn' } }, 'boleto');
    expect(comEnd.ok && comEnd.pagador.endereco).toEqual({ cep: '59000000', rua: 'Rua A', numero: '10', bairro: 'Centro', cidade: 'Natal', uf: 'RN' });
    expect(validarPagador({ ...base, doc: '123' }, 'pix').ok).toBe(false);
    expect(validarPagador({ ...base, email: 'x' }, 'pix').ok).toBe(false);
  });
});

describe('pagamento avulso no MP', () => {
  const pagador = { nome: 'Ana Souza', email: 'ana@x.com', tipoDoc: 'CPF' as const, doc: '52998224725', endereco: null };
  it('monta o Pix com valor, referência, vencimento e pagador', () => {
    const c = corpoDoPagamentoAvulso({ metodo: 'pix', valor: 199.9, descricao: 'Stok Aí — Essencial (mensal)', referencia: 'avulso:abc', pagador, venceEm: new Date('2026-09-15T12:00:00Z'), env: { SITE_URL: 'https://stokai.app' } });
    expect(c).toMatchObject({ transaction_amount: 199.9, payment_method_id: 'pix', statement_descriptor: 'STOK AI', external_reference: 'avulso:abc', notification_url: 'https://stokai.app/api/webhooks/mercadopago', date_of_expiration: '2026-09-15T12:00:00.000Z' });
    expect(c.payer).toEqual({ email: 'ana@x.com', first_name: 'Ana', last_name: 'Souza', identification: { type: 'CPF', number: '52998224725' } });
  });
  it('boleto leva o endereço', () => {
    const c = corpoDoPagamentoAvulso({ metodo: 'boleto', valor: 1999, descricao: 'x', referencia: 'avulso:1', pagador: { ...pagador, endereco: { cep: '59000000', rua: 'Rua A', numero: '10', bairro: 'Centro', cidade: 'Natal', uf: 'RN' } }, venceEm: agora });
    expect(c.payment_method_id).toBe('bolbradesco');
    expect((c.payer as any).address).toEqual({ zip_code: '59000000', street_name: 'Rua A', street_number: '10', neighborhood: 'Centro', city: 'Natal', federal_unit: 'RN' });
  });
  it('extrai o que a tela mostra e traduz status', () => {
    expect(dadosParaPagar({ id: 1, status: 'pending', point_of_interaction: { transaction_data: { qr_code: 'Q', qr_code_base64: 'B64', ticket_url: 'http://t' } } })).toEqual({ qr_code: 'Q', qr_code_base64: 'B64', ticket_url: 'http://t', linha_digitavel: null });
    expect(dadosParaPagar({ id: 2, status: 'pending', transaction_details: { external_resource_url: 'http://b' }, barcode: { content: '123' } })).toMatchObject({ ticket_url: 'http://b', linha_digitavel: '123' });
    expect(traduzirStatusDePagamento('approved')).toBe('aprovado');
    expect(traduzirStatusDePagamento('in_process')).toBe('pendente');
    expect(traduzirStatusDePagamento('rejected')).toBe('recusado');
    expect(traduzirStatusDePagamento('refunded')).toBe('reembolsado');
    expect(descricaoDoAvulso('profissional', 'anual')).toBe('Stok Aí — Profissional (anual)');
  });
});

describe('período e renovação', () => {
  it('um mês ou um ano a partir do início', () => {
    expect(fimDoPeriodo(new Date('2026-01-31T12:00:00Z'), 'mensal').toISOString().slice(0, 10)).toBe('2026-03-03');
    expect(fimDoPeriodo(new Date('2026-09-14T12:00:00Z'), 'anual').toISOString().slice(0, 10)).toBe('2027-09-14');
  });
  it('a conta sabe se renova sozinha ou à mão', () => {
    expect(situacaoDaConta({ plano: 'essencial', plano_ate: em(20), avaliacao_ate: null, cobranca: 'avulso' }, agora)).toMatchObject({ situacao: 'assinada', renovacao: 'manual' });
    expect(situacaoDaConta({ plano: 'essencial', plano_ate: em(20), avaliacao_ate: null, cobranca: 'cartao' }, agora).renovacao).toBe('automatica');
    expect(situacaoDaConta({ plano: null, plano_ate: null, avaliacao_ate: em(3) }, agora).renovacao).toBeNull();
  });
});

describe('lembretes', () => {
  it('manual vencendo em até LEMBRETE_DIAS, carência, avaliação nos últimos 2 dias — e não repete no mesmo dia', () => {
    const manual = situacaoDaConta({ plano: 'essencial', plano_ate: em(LEMBRETE_DIAS), avaliacao_ate: null, cobranca: 'avulso' }, agora);
    expect(precisaLembrar(manual, null, agora)).toBe(true);
    expect(precisaLembrar(manual, em(-0.5), agora)).toBe(false);
    expect(precisaLembrar(manual, em(-1.5), agora)).toBe(true);
    const longe = situacaoDaConta({ plano: 'essencial', plano_ate: em(LEMBRETE_DIAS + 1), avaliacao_ate: null, cobranca: 'avulso' }, agora);
    expect(precisaLembrar(longe, null, agora)).toBe(false);
    const cartao = situacaoDaConta({ plano: 'essencial', plano_ate: em(1), avaliacao_ate: null, cobranca: 'cartao' }, agora);
    expect(precisaLembrar(cartao, null, agora)).toBe(false);
    const carencia = situacaoDaConta({ plano: 'essencial', plano_ate: em(-1), avaliacao_ate: null, cobranca: 'cartao' }, agora);
    expect(precisaLembrar(carencia, null, agora)).toBe(true);
    const trial = situacaoDaConta({ plano: null, plano_ate: null, avaliacao_ate: em(2) }, agora);
    expect(precisaLembrar(trial, null, agora)).toBe(true);
    const trialLonge = situacaoDaConta({ plano: null, plano_ate: null, avaliacao_ate: em(5) }, agora);
    expect(precisaLembrar(trialLonge, null, agora)).toBe(false);
    const cortesia = situacaoDaConta({ plano: 'empresarial', plano_ate: null, avaliacao_ate: null }, agora);
    expect(precisaLembrar(cortesia, null, agora)).toBe(false);
  });
  it('o e-mail muda com a situação', () => {
    const manual = situacaoDaConta({ plano: 'profissional', plano_ate: em(3), avaliacao_ate: null, cobranca: 'avulso' }, agora);
    const e = emailDeLembrete({ organizationId: 'o', nome: 'ACME', conta: manual, emails: ['a@b.com'] }, { SITE_URL: 'https://stokai.app' });
    expect(e.subject).toBe('Stok Aí: o plano da ACME vence em 3 dias');
    expect(e.html).toContain('Renovar o plano');
    const trial = situacaoDaConta({ plano: null, plano_ate: null, avaliacao_ate: em(1) }, agora);
    expect(emailDeLembrete({ organizationId: 'o', nome: 'ACME', conta: trial, emails: [] }).subject).toContain('terminam amanhã');
  });
});

describe('nota fiscal (Focus NFe)', () => {
  const env = { FOCUS_NFE_TOKEN: 't', NFSE_PRESTADOR_CNPJ: '11.222.333/0001-81', NFSE_PRESTADOR_IM: '123', NFSE_CODIGO_MUNICIPIO: '2408102', NFSE_ITEM_LISTA_SERVICO: '01.05', NFSE_ALIQUOTA: '2' };
  const pg: any = { id: 'pg-1', status: 'aprovado', metodo: 'pix', plano: 'essencial', ciclo: 'mensal', valor: 199.9, mp_payment_id: '777', periodo_de: '2026-09-14T12:00:00Z', periodo_ate: '2026-10-14T12:00:00Z', pagador: { nome: 'Instituto Teste', email: 'f@t.com', tipoDoc: 'CNPJ', doc: '11222333000181', endereco: null }, nf_ref: null, nf_status: 'pendente', nf_numero: null, nf_url: null };

  it('só emite com tudo configurado; homologação por padrão', () => {
    expect(configuracaoNfse({})).toBeNull();
    expect(configuracaoNfse({ ...env, NFSE_PRESTADOR_CNPJ: '123' })).toBeNull();
    const c = configuracaoNfse(env)!;
    expect(c.base).toBe('https://homologacao.focusnfe.com.br');
    expect(c.prestador).toEqual({ cnpj: '11222333000181', inscricao_municipal: '123', codigo_municipio: '2408102' });
    expect(configuracaoNfse({ ...env, FOCUS_NFE_AMBIENTE: 'producao' })!.base).toBe('https://api.focusnfe.com.br');
  });

  it('monta a nota com tomador, serviço e discriminação legível', () => {
    const c = corpoDaNfse(pg, configuracaoNfse(env)!, agora)!;
    expect(c.tomador).toEqual({ razao_social: 'Instituto Teste', email: 'f@t.com', cnpj: '11222333000181' });
    expect(c.servico).toMatchObject({ aliquota: 2, item_lista_servico: '01.05', valor_servicos: 199.9, iss_retido: 'false' });
    expect(discriminacao(pg)).toContain('plano Essencial (mensal), período de 14/09/2026 a 14/10/2026');
    expect(corpoDaNfse({ ...pg, pagador: { nome: '', doc: '' } }, configuracaoNfse(env)!)).toBeNull();
  });

  it('traduz a resposta do Focus', () => {
    expect(traduzirFocus(202, { status: 'processando_autorizacao' })).toEqual({ situacao: 'processando' });
    expect(traduzirFocus(200, { status: 'autorizado', numero: '42', url: 'http://nf' })).toEqual({ situacao: 'emitida', numero: '42', url: 'http://nf' });
    expect(traduzirFocus(200, { status: 'erro_autorizacao', erros: [{ codigo: 'E1', mensagem: 'IM inválida' }] })).toEqual({ situacao: 'erro', erro: 'IM inválida' });
    expect(traduzirFocus(400, { codigo: 'requisicao_invalida', mensagem: 'faltou cnpj' })).toEqual({ situacao: 'erro', erro: 'faltou cnpj' });
  });
});

describe('recibo (não fiscal)', () => {
  const pg: any = { id: '6e8e378b-32f5-48bc-bdef-2de191f82f57', data: '2026-09-14T15:30:00Z', valor: '199.9', metodo: 'pix', plano: 'essencial', ciclo: 'mensal', periodo_de: '2026-09-14T15:30:00Z', periodo_ate: '2026-10-14T15:30:00Z', mp_payment_id: '123456', pagador: { nome: 'Instituto Teste', doc: '11222333000181', email: 'fin@teste.com' }, status: 'aprovado' };

  it('número curto e estável, descrição legível', () => {
    expect(numeroDoRecibo(pg)).toBe('R-2026-0914-2F57');
    expect(descricaoDoRecibo(pg)).toBe('Plano Essencial (mensal) do Stok Aí — período de 14/09/2026 a 14/10/2026');
  });

  it('monta os dados com o documento formatado; sem pagador, usa a empresa', () => {
    const r = dadosDoRecibo(pg, 'IFRN', 'LEMUSA');
    expect(r).toMatchObject({ emitente: 'LEMUSA', pagador: { nome: 'Instituto Teste', doc: '11.222.333/0001-81', email: 'fin@teste.com' }, valor: 199.9, metodo: 'Pix', transacao: '123456' });
    expect(dadosDoRecibo({ ...pg, pagador: null }, 'IFRN', 'Stok Aí').pagador).toEqual({ nome: 'IFRN', doc: null, email: null });
    expect(emitente({})).toBe('Stok Aí');
    expect(emitente({ RECIBO_EMITENTE: ' LEMUSA ' })).toBe('LEMUSA');
  });

  it('o e-mail vai para o pagador; sem e-mail, não há e-mail', () => {
    const e = emailDeRecibo(pg, 'IFRN', {});
    expect(e?.to).toBe('fin@teste.com');
    expect(e?.subject).toBe('Recibo R-2026-0914-2F57 — Stok Aí');
    expect(e?.html).toContain('não substitui nota fiscal');
    expect(emailDeRecibo({ ...pg, pagador: { nome: 'X' } }, 'IFRN', {})).toBeNull();
  });
});

