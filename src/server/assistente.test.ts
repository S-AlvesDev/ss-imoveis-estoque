import { describe, it, expect, vi } from 'vitest';

vi.mock('../lib/supabaseServer', () => ({ supabaseServer: {} }));

import { normalizarTelefone, lerEvento, evolutionConfigurada, variantesDoTelefone } from './evolution';
import { operacoesPadrao, operacoesDoUsuario, lerConfirmacao, acharMateriais, acharDepositoPorNome, MENSAGEM_PARA_DESCONHECIDO, pediuConfirmacaoSemProposta, respondeuNumeroSemConsultar } from './assistente';
import { formatarWhatsapp } from '../shared/whatsapp';
import { claudeConfigurado } from './claude';

describe('telefone', () => {
  it('normaliza para dígitos com DDI, assumindo Brasil', () => {
    expect(normalizarTelefone('(84) 99143-4190')).toBe('5584991434190');
    expect(normalizarTelefone('+55 84 99143-4190')).toBe('5584991434190');
    expect(normalizarTelefone('5584991434190')).toBe('5584991434190');
    expect(normalizarTelefone('123')).toBeNull();
    expect(normalizarTelefone('')).toBeNull();
  });
  it('reconhece o número com e sem o nono dígito (contas antigas do WhatsApp)', () => {
    expect(variantesDoTelefone('558491284470')).toEqual(['558491284470', '5584991284470']);
    expect(variantesDoTelefone('5584991284470')).toEqual(['5584991284470', '558491284470']);
    expect(variantesDoTelefone('558433334444')).toEqual(['558433334444', '5584933334444']);
    expect(variantesDoTelefone('5584833334444')).toEqual(['5584833334444']);
    expect(variantesDoTelefone('351912345678')).toEqual(['351912345678']);
  });
  it('mostra bonito na tela', () => {
    expect(formatarWhatsapp('5584991434190')).toBe('(84) 99143-4190');
    expect(formatarWhatsapp('84991434190')).toBe('(84) 99143-4190');
    expect(formatarWhatsapp('8499')).toBe('(84) 99');
  });
});

describe('evento da Evolution', () => {
  const base = { event: 'messages.upsert', instance: 'stokai', data: { key: { remoteJid: '5584991434190@s.whatsapp.net', fromMe: false, id: 'ABC' }, pushName: 'Marlon', message: { conversation: 'quanto tem de cimento?' } } };
  it('lê texto simples e texto estendido', () => {
    expect(lerEvento(base)).toEqual({ instancia: 'stokai', telefone: '5584991434190', nome: 'Marlon', texto: 'quanto tem de cimento?', tipo: 'texto', idMensagem: 'ABC', chave: { id: 'ABC', remoteJid: '5584991434190@s.whatsapp.net', fromMe: false }, mimetype: null });
    const ext = { ...base, data: { ...base.data, message: { extendedTextMessage: { text: 'oi' } } } };
    expect(lerEvento(ext)?.texto).toBe('oi');
  });
  it('ignora o que mandamos, grupos e outros eventos', () => {
    expect(lerEvento({ ...base, data: { ...base.data, key: { ...base.data.key, fromMe: true } } })).toBeNull();
    expect(lerEvento({ ...base, data: { ...base.data, key: { ...base.data.key, remoteJid: '1203@g.us' } } })).toBeNull();
    expect(lerEvento({ ...base, event: 'connection.update' })).toBeNull();
    expect(lerEvento({ ...base, event: 'MESSAGES_UPSERT' })?.tipo).toBe('texto');
  });
  it('classifica áudio, imagem e documento', () => {
    expect(lerEvento({ ...base, data: { ...base.data, message: { audioMessage: {} } } })).toMatchObject({ tipo: 'audio', texto: null });
    expect(lerEvento({ ...base, data: { ...base.data, message: { imageMessage: { caption: 'nota', mimetype: 'image/jpeg' } } } })).toMatchObject({ tipo: 'imagem', texto: 'nota', mimetype: 'image/jpeg' });
    expect(lerEvento({ ...base, data: { ...base.data, message: { documentMessage: {} } } })).toMatchObject({ tipo: 'documento' });
  });
  it('só fica configurada com URL, chave e instância; a IA só com a chave', () => {
    expect(evolutionConfigurada({})).toBe(false);
    expect(evolutionConfigurada({ EVOLUTION_URL: 'https://x', EVOLUTION_API_KEY: 'k', EVOLUTION_INSTANCE: 'i' })).toBe(true);
    expect(claudeConfigurado({})).toBe(false);
    expect(claudeConfigurado({ ANTHROPIC_API_KEY: 'sk' })).toBe(true);
  });
});

describe('permissões pelo WhatsApp', () => {
  it('operador não dá entrada por padrão; administrador dá', () => {
    expect(operacoesPadrao('OPERADOR')).toEqual(['SAIDA', 'CONSUMO', 'TRANSFERENCIA', 'DEVOLUCAO']);
    expect(operacoesPadrao('CEO')).toContain('ENTRADA');
    expect(operacoesPadrao('ADMINISTRADOR')).toContain('ENTRADA');
  });
  it('lista própria manda; lista vazia = só consulta; lixo é ignorado', () => {
    expect(operacoesDoUsuario('OPERADOR', null)).toEqual(operacoesPadrao('OPERADOR'));
    expect(operacoesDoUsuario('OPERADOR', [])).toEqual([]);
    expect(operacoesDoUsuario('OPERADOR', ['SAIDA', 'AJUSTE', 'x'])).toEqual(['SAIDA']);
  });
});

describe('número sem cadastro', () => {
  it('acolhe tanto funcionário sem cadastro quanto interessado vindo da Home', () => {
    expect(MENSAGEM_PARA_DESCONHECIDO).toMatch(/administrador/);
    expect(MENSAGEM_PARA_DESCONHECIDO).toMatch(/equipe/);
    expect(MENSAGEM_PARA_DESCONHECIDO.length).toBeLessThan(400);
  });
});

describe('confirmação', () => {
  it('entende sim/não com e sem PIN', () => {
    expect(lerConfirmacao('SIM')).toEqual({ confirma: true, nega: false, pin: null });
    expect(lerConfirmacao('sim 1234')).toEqual({ confirma: true, nega: false, pin: '1234' });
    expect(lerConfirmacao('Confirmo!')).toEqual({ confirma: true, nega: false, pin: null });
    expect(lerConfirmacao('não')).toEqual({ confirma: false, nega: true, pin: null });
    expect(lerConfirmacao('cancela')).toEqual({ confirma: false, nega: true, pin: null });
    expect(lerConfirmacao('quanto tem de cimento?')).toEqual({ confirma: false, nega: false, pin: null });
    expect(lerConfirmacao('simples assim')).toEqual({ confirma: false, nega: false, pin: null });
  });
});

describe('contrato da IA: só a ferramenta prepara, só o código grava', () => {
  const proposta = { tipo: 'movimentacao', resumo: 'x', dados: {}, expira_em: new Date(Date.now() + 60_000).toISOString() } as any;
  it('pega a IA pedindo SIM ou anunciando registro sem proposta', () => {
    expect(pediuConfirmacaoSemProposta('Certo, confirma aí: Transferência de 1. SIM pra registrar?', null, null)).toBe(true);
    expect(pediuConfirmacaoSemProposta('✅ Transferência registrada!', null, null)).toBe(true);
    expect(pediuConfirmacaoSemProposta('Tem 6 UN de Teste. Precisa registrar alguma movimentação?', null, null)).toBe(false);
  });
  it('deixa passar quando há proposta nova ou pendente', () => {
    expect(pediuConfirmacaoSemProposta('Transferir 1 Teste do Central para Obra? Responda SIM', proposta, null)).toBe(false);
    expect(pediuConfirmacaoSemProposta('Ainda espero o SIM da transferência.', null, proposta)).toBe(false);
  });
});

describe('número só sai de ferramenta', () => {
  it('pega a resposta com saldo que não consultou nada', () => {
    // O caso real: "Tem 10 no Almoxarifado e 7 na Coordenação" — sem chamar consultar_saldo.
    expect(respondeuNumeroSemConsultar('Tem 10 no Almoxarifado de Materiais e 7 na Coordenação. Total: 17 UN.', [])).toBe(true);
    expect(respondeuNumeroSemConsultar('São 3 dias de prazo.', [])).toBe(true);
  });
  it('deixa passar quando a ferramenta foi chamada', () => {
    expect(respondeuNumeroSemConsultar('Tem 21 no Almoxarifado e 7 na Coordenação. Total: 28 UN.', ['consultar_saldo'])).toBe(false);
    expect(respondeuNumeroSemConsultar('Nada abaixo do mínimo hoje.', ['listar_pendencias'])).toBe(false);
  });
  it('conversa sem número segue livre', () => {
    expect(respondeuNumeroSemConsultar('Oi! Precisa de algo? Consulto saldo e registro movimentações.', [])).toBe(false);
    expect(respondeuNumeroSemConsultar('Não entendi. Pode dizer de outro jeito?', [])).toBe(false);
  });
});

describe('achar material e estoque', () => {
  const materiais = [{ nome: 'Cimento CP-II 50kg' }, { nome: 'Cimento branco' }, { nome: 'Cabo flexível 2,5mm' }, { nome: 'Bola de futsal' }];
  it('todas as palavras, sem acento e sem caixa; exato ganha', () => {
    expect(acharMateriais(materiais, 'cimento').map((m) => m.nome)).toEqual(['Cimento CP-II 50kg', 'Cimento branco']);
    expect(acharMateriais(materiais, 'cimento cp').map((m) => m.nome)).toEqual(['Cimento CP-II 50kg']);
    expect(acharMateriais(materiais, 'CABO FLEXIVEL').map((m) => m.nome)).toEqual(['Cabo flexível 2,5mm']);
    expect(acharMateriais(materiais, 'cimento branco').map((m) => m.nome)).toEqual(['Cimento branco']);
    expect(acharMateriais(materiais, 'areia')).toEqual([]);
    expect(acharMateriais(materiais, '')).toEqual([]);
  });
  it('estoque por nome ou pedaço', () => {
    const deps = [{ nome: 'Almoxarifado Central' }, { nome: 'Obra Bairro Norte' }, { nome: 'EPI' }];
    expect(acharDepositoPorNome(deps, 'central').map((d) => d.nome)).toEqual(['Almoxarifado Central']);
    expect(acharDepositoPorNome(deps, 'obra').map((d) => d.nome)).toEqual(['Obra Bairro Norte']);
    expect(acharDepositoPorNome(deps, 'epi').map((d) => d.nome)).toEqual(['EPI']);
    expect(acharDepositoPorNome(deps, null)).toEqual([]);
  });
});
