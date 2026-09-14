import { describe, it, expect, vi } from 'vitest';

vi.mock('../lib/supabaseServer', () => ({ supabaseServer: {} }));

import { normalizarTelefone, lerEvento, evolutionConfigurada } from './evolution';
import { operacoesPadrao, operacoesDoUsuario, lerConfirmacao, acharMateriais, acharDepositoPorNome, MENSAGEM_PARA_DESCONHECIDO } from './assistente';
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
  it('mostra bonito na tela', () => {
    expect(formatarWhatsapp('5584991434190')).toBe('(84) 99143-4190');
    expect(formatarWhatsapp('84991434190')).toBe('(84) 99143-4190');
    expect(formatarWhatsapp('8499')).toBe('(84) 99');
  });
});

describe('evento da Evolution', () => {
  const base = { event: 'messages.upsert', instance: 'stokai', data: { key: { remoteJid: '5584991434190@s.whatsapp.net', fromMe: false, id: 'ABC' }, pushName: 'Marlon', message: { conversation: 'quanto tem de cimento?' } } };
  it('lê texto simples e texto estendido', () => {
    expect(lerEvento(base)).toEqual({ instancia: 'stokai', telefone: '5584991434190', nome: 'Marlon', texto: 'quanto tem de cimento?', tipo: 'texto', idMensagem: 'ABC' });
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
    expect(lerEvento({ ...base, data: { ...base.data, message: { imageMessage: { caption: 'nota' } } } })).toMatchObject({ tipo: 'imagem', texto: 'nota' });
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
