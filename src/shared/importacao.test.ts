import { describe, it, expect } from 'vitest';
import { lerPlanilha, separadorDe, dividirLinha, lerNumero, campoDaColuna, MODELO_CSV } from './importacao';

describe('ler a linha', () => {
  it('acha o separador que a planilha usou', () => {
    expect(separadorDe('nome;qtd;un')).toBe(';');
    expect(separadorDe('nome,qtd,un')).toBe(',');
    expect(separadorDe('nome\tqtd')).toBe('\t');
    expect(separadorDe('"Tinta, branca";2')).toBe(';');
    expect(separadorDe('umacolunaso')).toBe(';');
  });
  it('respeita aspas e aspas dentro de aspas', () => {
    expect(dividirLinha('Cimento;10;sc', ';')).toEqual(['Cimento', '10', 'sc']);
    expect(dividirLinha('"Tinta; branca";2', ';')).toEqual(['Tinta; branca', '2']);
    expect(dividirLinha('"diz ""ok""";1', ';')).toEqual(['diz "ok"', '1']);
  });
  it('entende número do Brasil e de fora', () => {
    expect(lerNumero('1.234,50')).toBe(1234.5);
    expect(lerNumero('1,234.50')).toBe(1234.5);
    expect(lerNumero('10')).toBe(10);
    expect(lerNumero('2,5')).toBe(2.5);
    expect(lerNumero('R$ 31,90')).toBe(31.9);
    expect(lerNumero('')).toBeNull();
    expect(lerNumero('   ')).toBeNull();
    expect(lerNumero('abc')).toBeNaN();
  });
  it('reconhece a coluna por sinônimo, sem acento nem caixa', () => {
    expect(campoDaColuna('Nome')).toBe('nome');
    expect(campoDaColuna('DESCRIÇÃO')).toBe('nome');
    expect(campoDaColuna('Estoque Mínimo')).toBe('estoque_minimo');
    expect(campoDaColuna('unidade_medida')).toBe('unidade_medida');
    expect(campoDaColuna('saldo: Almoxarifado Central')).toBe('quantidade');
    expect(campoDaColuna('fornecedor')).toBeNull();
  });
});

describe('ler a planilha inteira', () => {
  it('lê o nosso próprio CSV de exportação', () => {
    const csv = '﻿id;nome;categoria;unidade;estoque_minimo;saldo_total;saldo: Central\r\n7;Cimento CP-II;Construção;SC;40;148;148\r\n8;Luva de raspa;EPI;PAR;10;0;0\r\n';
    const r = lerPlanilha(csv);
    expect(r.erroGeral).toBeNull();
    expect(r.linhas).toHaveLength(2);
    expect(r.linhas[0].dados).toEqual({ nome: 'Cimento CP-II', unidade_medida: 'SC', categoria: 'Construção', estoque_minimo: 40, quantidade: 148 });
  });
  it('lê o modelo que a tela oferece', () => {
    const r = lerPlanilha(MODELO_CSV);
    expect(r.erroGeral).toBeNull();
    expect(r.linhas.filter((l) => l.dados)).toHaveLength(3);
  });
  it('só com a coluna de nome já dá para importar', () => {
    const r = lerPlanilha('material\nCimento\nAreia\n');
    expect(r.erroGeral).toBeNull();
    expect(r.linhas[0].dados).toEqual({ nome: 'Cimento', unidade_medida: 'UN', categoria: 'Outros', estoque_minimo: 0, quantidade: 0 });
  });
  it('recusa arquivo sem coluna de nome, vazio ou só com cabeçalho', () => {
    expect(lerPlanilha('quantidade;preço\n10;3\n').erroGeral).toMatch(/nome do material/);
    expect(lerPlanilha('').erroGeral).toMatch(/vazio/);
    expect(lerPlanilha('nome;unidade\n').erroGeral).toMatch(/só tem o cabeçalho/);
  });
  it('erra por linha, sem derrubar as boas, e conta a linha como no Excel', () => {
    const csv = ['nome;unidade;estoque_minimo;quantidade', 'Cimento;SC;40;148', ';SC;1;1', 'Areia;M3;dez;2', 'Cimento;SC;40;10', 'Brita;M3;5;-3', 'Cal;SC;2;8'].join('\n');
    const r = lerPlanilha(csv);
    const porLinha = Object.fromEntries(r.linhas.map((l) => [l.linha, l.erro]));
    expect(porLinha[2]).toBeNull();
    expect(porLinha[3]).toMatch(/Sem nome/);
    expect(porLinha[4]).toMatch(/não é um número/);
    expect(porLinha[5]).toMatch(/Repetido/);
    expect(porLinha[6]).toMatch(/negativo/);
    expect(porLinha[7]).toBeNull();
    expect(r.linhas.filter((l) => l.dados).map((l) => l.dados!.nome)).toEqual(['Cimento', 'Cal']);
  });
  it('aguenta CRLF, espaços sobrando e linhas em branco no meio', () => {
    const r = lerPlanilha('nome ; unidade\r\n  Cimento CP   II  ;sc\r\n\r\nAreia;m3\r\n');
    expect(r.linhas.filter((l) => l.dados).map((l) => l.dados!.nome)).toEqual(['Cimento CP II', 'Areia']);
  });
});
