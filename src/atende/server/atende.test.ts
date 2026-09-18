import { describe, it, expect, beforeAll, vi } from 'vitest';
import jwt from 'jsonwebtoken';

vi.mock('../../lib/supabaseServer', () => ({ supabaseServer: {} }));

// O tenant lê o ambiente na carga do módulo — e os imports são içados,
// então o ambiente tem que ser içado junto.
vi.hoisted(() => {
  process.env.SUPABASE_URL = 'https://exemplo.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'chave-de-servico';
  process.env.JWT_SECRET = 'segredo-de-teste';
});

import { pode, ehPapel, PAPEIS } from '../shared/papeis';
import { validarCadastro, validarEmpresa, validarHorario, validarTime, validarNovoFuncionario, validarEdicaoDeFuncionario } from '../shared/validacao';
import { assinarSessao, lerSessao } from './auth';
import { lerSessaoDoStokAi, papelPara, podeAtivar } from './ponte';
import type { SessaoAtende } from '../shared/tipos';

let dbDaEmpresa: typeof import('./tenant').dbDaEmpresa;
let scopedDb: typeof import('../../server/tenant').scopedDb;
beforeAll(async () => {
  ({ dbDaEmpresa } = await import('./tenant'));
  ({ scopedDb } = await import('../../server/tenant'));
});

const EMPRESA = '7e7e0000-0000-4000-8000-000000000001';
const ORG = '5e7e0000-0000-4000-8000-000000000001';
const filtroDe = (builder: any, coluna: string): string => builder.url.searchParams.get(coluna) ?? '';

describe('Atende Aí — papéis', () => {
  it('admin faz tudo; supervisor acompanha; atendente atende', () => {
    expect(pode('admin', 'equipe.gerir')).toBe(true);
    expect(pode('admin', 'whatsapp.gerir')).toBe(true);
    expect(pode('supervisor', 'conversas.supervisionar')).toBe(true);
    expect(pode('supervisor', 'equipe.gerir')).toBe(false);
    expect(pode('supervisor', 'empresa.gerir')).toBe(false);
    expect(pode('atendente', 'conversas.atender')).toBe(true);
    expect(pode('atendente', 'conversas.supervisionar')).toBe(false);
    expect(pode('atendente', 'dashboard.ver')).toBe(false);
    expect(pode('CEO', 'conversas.atender')).toBe(false); // papel do Stok Aí não existe aqui
    expect(PAPEIS.every(ehPapel)).toBe(true);
    expect(ehPapel('OPERADOR')).toBe(false);
  });
});

describe('Atende Aí — sessão', () => {
  const sessao: SessaoAtende = { id: 7, nome: 'Ana', email: 'ana@x.com', papel: 'supervisor', empresa_id: EMPRESA };

  it('o token leva o carimbo do produto e volta igual', () => {
    const token = assinarSessao(sessao);
    expect(jwt.decode(token)).toMatchObject({ produto: 'atende', id: 7, empresa_id: EMPRESA, papel: 'supervisor' });
    expect(lerSessao(token)).toEqual(sessao);
  });

  it('um token do Stok Aí (sem produto, com organization_id) não entra', () => {
    const doEstoque = jwt.sign({ id: 7, nome: 'Ana', matricula: '001', role: 'ADMINISTRADOR', organization_id: ORG }, 'segredo-de-teste', { expiresIn: '1h' });
    expect(lerSessao(doEstoque)).toBeNull();
    // Nem um forjado com outro produto, nem com segredo errado, nem vencido.
    expect(lerSessao(jwt.sign({ ...sessao, produto: 'outro' }, 'segredo-de-teste'))).toBeNull();
    expect(lerSessao(jwt.sign({ ...sessao, produto: 'atende' }, 'outro-segredo'))).toBeNull();
    expect(lerSessao(jwt.sign({ ...sessao, produto: 'atende' }, 'segredo-de-teste', { expiresIn: -10 }))).toBeNull();
  });
});

describe('Atende Aí — a ponte com o Stok Aí', () => {
  it('aceita o token do Stok Aí e recusa o do próprio Atende (mão única)', () => {
    const doEstoque = jwt.sign({ id: 7, nome: 'Samuel', matricula: 'ADMIN', role: 'CEO', organization_id: ORG }, 'segredo-de-teste', { expiresIn: '1h' });
    expect(lerSessaoDoStokAi(doEstoque)).toEqual({ id: 7, nome: 'Samuel', role: 'CEO', organization_id: ORG });
    const doAtende = assinarSessao({ id: 1, nome: 'Ana', email: 'a@b.co', papel: 'admin', empresa_id: EMPRESA });
    expect(lerSessaoDoStokAi(doAtende)).toBeNull();
    expect(lerSessaoDoStokAi(jwt.sign({ id: 7, role: 'CEO', organization_id: ORG }, 'outro-segredo'))).toBeNull();
    expect(lerSessaoDoStokAi('lixo')).toBeNull();
  });
  it('cargo do estoque vira papel do atendimento; só quem administra ativa', () => {
    expect(papelPara('CEO')).toBe('admin');
    expect(papelPara('ADMINISTRADOR')).toBe('admin');
    expect(papelPara('ADMINISTRATIVO')).toBe('supervisor');
    expect(papelPara('OPERADOR')).toBe('atendente');
    expect(papelPara('ALMOXARIFE_OBRA')).toBe('atendente');
    expect(podeAtivar('CEO')).toBe(true);
    expect(podeAtivar('ADMINISTRATIVO')).toBe(true);
    expect(podeAtivar('OPERADOR')).toBe(false);
  });
});

describe('Atende Aí — isolamento por empresa (scopedDb com escopo)', () => {
  it('prende as tabelas atende_* por empresa_id e carimba as escritas', () => {
    const db = dbDaEmpresa(EMPRESA);
    expect(filtroDe(db.from('atende_usuarios').select('*'), 'empresa_id')).toBe(`eq.${EMPRESA}`);
    expect(filtroDe(db.from('atende_times').update({ nome: 'x' }), 'empresa_id')).toBe(`eq.${EMPRESA}`);
    expect(filtroDe(db.from('atende_time_membros').delete(), 'empresa_id')).toBe(`eq.${EMPRESA}`);
    const ins: any = db.from('atende_times').insert({ nome: 'Vendas' });
    expect(ins.body).toEqual({ nome: 'Vendas', empresa_id: EMPRESA });
    const lote: any = db.from('atende_time_membros').insert([{ time_id: 't1', usuario_id: 1 }, { time_id: 't2', usuario_id: 1 }]);
    expect((lote.body as any[]).every((l) => l.empresa_id === EMPRESA)).toBe(true);
  });

  it('não confunde com organization_id, nem toca tabelas do estoque', () => {
    const db = dbDaEmpresa(EMPRESA);
    expect(filtroDe(db.from('atende_usuarios').select('*'), 'organization_id')).toBe('');
    // Tabela do Stok Aí consultada pelo escopo do Atende: sem filtro automático (não é dele).
    expect(filtroDe(db.from('materials').select('*'), 'empresa_id')).toBe('');
    // A empresa em si é o dono: sem filtro automático, a rota filtra por id.
    expect(filtroDe(db.from('atende_empresas').select('*'), 'empresa_id')).toBe('');
  });

  it('o escopo padrão continua exatamente o do Stok Aí', () => {
    const db = scopedDb(ORG);
    expect(filtroDe(db.from('materials').select('*'), 'organization_id')).toBe(`eq.${ORG}`);
    expect(filtroDe(db.from('atende_usuarios').select('*'), 'organization_id')).toBe('');
    expect(filtroDe(db.from('atende_usuarios').select('*'), 'empresa_id')).toBe('');
  });
});

describe('Atende Aí — validação', () => {
  it('cadastro: empresa, nome, e-mail e senha', () => {
    expect(validarCadastro({ empresa: 'Imobiliária X', nome: 'Ana Souza', email: 'ANA@X.COM', senha: '12345678', segmento: ' Imobiliária ' })).toEqual({
      ok: true,
      valor: { empresa: 'Imobiliária X', segmento: 'Imobiliária', nome: 'Ana Souza', email: 'ana@x.com', senha: '12345678' },
    });
    expect(validarCadastro({ empresa: 'X', nome: 'Ana', email: 'a@b.c', senha: '12345678' }).ok).toBe(false);
    expect(validarCadastro({ empresa: 'Imob', nome: 'Ana', email: 'nao-e-email', senha: '12345678' }).ok).toBe(false);
    expect(validarCadastro({ empresa: 'Imob', nome: 'Ana', email: 'a@b.co', senha: '1234567' }).ok).toBe(false);
  });

  it('empresa: só o que veio, com limites; horário HH:MM e início antes do fim', () => {
    expect(validarEmpresa({})).toMatchObject({ ok: false });
    const r = validarEmpresa({ descricao: '  Imobiliária em Natal  ', faq: [{ pergunta: 'Horário?', resposta: '8h às 18h' }], horario_atendimento: { seg: { de: '08:00', ate: '18:00' }, dom: null } });
    expect(r).toEqual({ ok: true, valor: { descricao: 'Imobiliária em Natal', faq: [{ pergunta: 'Horário?', resposta: '8h às 18h' }], horario_atendimento: { seg: { de: '08:00', ate: '18:00' }, dom: null } } });
    expect(validarEmpresa({ faq: [{ pergunta: 'x' }] }).ok).toBe(false);
    expect(validarHorario({ seg: { de: '18:00', ate: '08:00' } }).ok).toBe(false);
    expect(validarHorario({ seg: { de: '8h', ate: '18:00' } }).ok).toBe(false);
    expect(validarHorario({ qua: { de: '09:30', ate: '12:00' }, invalido: { de: '00:00', ate: '01:00' } })).toEqual({ ok: true, valor: { qua: { de: '09:30', ate: '12:00' } } });
  });

  it('time: nome, palavras-chave sem repetição, ordem; edição preserva o que não veio', () => {
    expect(validarTime({ nome: 'Vendas', palavras_chave: ['Comprar', 'comprar ', 'visita'] })).toEqual({ ok: true, valor: { nome: 'Vendas', descricao_para_ia: null, palavras_chave: ['comprar', 'visita'], ordem: 0, ativo: true } });
    expect(validarTime({ nome: 'V' }).ok).toBe(false);
    expect(validarTime({ ativo: false }, { nome: 'Vendas', descricao_para_ia: 'Compra de imóveis', palavras_chave: ['comprar'], ordem: 2, ativo: true })).toEqual({
      ok: true,
      valor: { nome: 'Vendas', descricao_para_ia: 'Compra de imóveis', palavras_chave: ['comprar'], ordem: 2, ativo: false },
    });
  });

  it('funcionário: papel do Atende, times por uuid', () => {
    const t = '11111111-1111-4111-8111-111111111111';
    expect(validarNovoFuncionario({ nome: 'João', email: 'joao@x.com', senha: '12345678', papel: 'atendente', times: [t, t] })).toEqual({ ok: true, valor: { nome: 'João', email: 'joao@x.com', senha: '12345678', papel: 'atendente', times: [t] } });
    expect(validarNovoFuncionario({ nome: 'João', email: 'joao@x.com', senha: '12345678', papel: 'OPERADOR' }).ok).toBe(false);
    expect(validarNovoFuncionario({ nome: 'João', email: 'joao@x.com', senha: '12345678', papel: 'atendente', times: ['nao-uuid'] }).ok).toBe(false);
    expect(validarEdicaoDeFuncionario({ senha: '' })).toMatchObject({ ok: false }); // senha vazia não é alteração
    expect(validarEdicaoDeFuncionario({ papel: 'supervisor', ativo: 'sim' })).toEqual({ ok: true, valor: { papel: 'supervisor', ativo: true } });
  });
});
