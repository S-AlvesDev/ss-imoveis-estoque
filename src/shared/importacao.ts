/**
 * Importar materiais de uma planilha: ler o CSV, entender as colunas e
 * dizer, linha a linha, o que vai entrar e o que está errado — antes de
 * gravar qualquer coisa.
 *
 * Puro de propósito: a tela usa para a prévia e o servidor usa para
 * validar de novo. Quem exporta do Excel manda ";" e vírgula decimal;
 * quem exporta de outro sistema manda "," e ponto. Os dois entram.
 */

export interface MaterialImportado {
  nome: string;
  unidade_medida: string;
  categoria: string;
  estoque_minimo: number;
  /** Saldo inicial no estoque escolhido. Zero quando a planilha não diz. */
  quantidade: number;
}

export interface LinhaLida {
  /** Número da linha no arquivo, contando o cabeçalho — é o que a pessoa vê no Excel. */
  linha: number;
  dados: MaterialImportado | null;
  erro: string | null;
}

export interface LeituraDaPlanilha {
  /** As colunas reconhecidas, na ordem do arquivo (para a tela mostrar o que entendeu). */
  colunas: string[];
  linhas: LinhaLida[];
  /** Nenhuma coluna de nome: o arquivo não é uma planilha de materiais. */
  erroGeral: string | null;
}

/** Quantas linhas um envio aceita — a tela quebra arquivos maiores em partes. */
export const MAX_LINHAS_POR_ENVIO = 200;
/** Teto de um arquivo inteiro, para não travar a tela nem o banco. */
export const MAX_LINHAS_POR_ARQUIVO = 2000;

/** Tira acento, caixa e pontuação: "Estoque Mínimo" e "estoque_minimo" viram a mesma coisa. */
function chave(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

const SINONIMOS: Record<keyof MaterialImportado, string[]> = {
  nome: ['nome', 'material', 'descricao', 'produto', 'item', 'nomedomaterial'],
  unidade_medida: ['unidade', 'unidademedida', 'un', 'und', 'medida', 'unidadedemedida'],
  categoria: ['categoria', 'grupo', 'tipo', 'familia'],
  estoque_minimo: ['estoqueminimo', 'minimo', 'min', 'qtdminima', 'quantidademinima', 'estoqueminimoun'],
  quantidade: ['quantidade', 'qtd', 'saldo', 'estoque', 'quantidadeatual', 'saldoatual', 'qtde'],
};

/** Qual campo esta coluna é, ou null se for coluna que não usamos. */
export function campoDaColuna(titulo: string): keyof MaterialImportado | null {
  const k = chave(titulo);
  if (!k) return null;
  for (const [campo, nomes] of Object.entries(SINONIMOS) as Array<[keyof MaterialImportado, string[]]>) {
    if (nomes.includes(k)) return campo;
  }
  // "saldo: Almoxarifado Central" (o nosso próprio CSV de exportação) conta como quantidade.
  if (k.startsWith('saldo')) return 'quantidade';
  return null;
}

/** O separador mais provável: o que mais aparece fora das aspas na primeira linha. */
export function separadorDe(primeiraLinha: string): string {
  const candidatos = [';', ',', '\t'];
  let melhor = ';';
  let max = -1;
  for (const c of candidatos) {
    let n = 0;
    let aspas = false;
    for (const ch of primeiraLinha) {
      if (ch === '"') aspas = !aspas;
      else if (ch === c && !aspas) n++;
    }
    if (n > max) {
      max = n;
      melhor = c;
    }
  }
  return max > 0 ? melhor : ';';
}

/** Divide uma linha respeitando aspas e "" escapado. */
export function dividirLinha(linha: string, sep: string): string[] {
  const campos: string[] = [];
  let atual = '';
  let aspas = false;
  for (let i = 0; i < linha.length; i++) {
    const ch = linha[i];
    if (ch === '"') {
      if (aspas && linha[i + 1] === '"') {
        atual += '"';
        i++;
      } else aspas = !aspas;
    } else if (ch === sep && !aspas) {
      campos.push(atual);
      atual = '';
    } else atual += ch;
  }
  campos.push(atual);
  return campos.map((c) => c.trim());
}

/** "1.234,50" e "1,234.50" viram 1234.5; vazio vira null; lixo vira NaN. */
export function lerNumero(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  const limpo = t.replace(/[^\d.,-]/g, '');
  if (!limpo) return NaN;
  const ultimaVirgula = limpo.lastIndexOf(',');
  const ultimoPonto = limpo.lastIndexOf('.');
  let normal: string;
  if (ultimaVirgula > ultimoPonto) normal = limpo.replace(/\./g, '').replace(',', '.');
  else if (ultimoPonto > ultimaVirgula) normal = limpo.replace(/,/g, '');
  else normal = limpo.replace(',', '.');
  const n = Number(normal);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Lê o texto do CSV inteiro. Nunca lança: erro de arquivo vira `erroGeral`,
 * erro de linha vira `erro` naquela linha, e o resto continua importável.
 */
export function lerPlanilha(texto: string): LeituraDaPlanilha {
  const limpo = texto.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const cruas = limpo.split('\n');
  const indices: number[] = [];
  cruas.forEach((l, i) => {
    if (l.trim()) indices.push(i);
  });
  if (indices.length === 0) return { colunas: [], linhas: [], erroGeral: 'O arquivo está vazio.' };

  const cabecalhoIdx = indices[0];
  const sep = separadorDe(cruas[cabecalhoIdx]);
  const titulos = dividirLinha(cruas[cabecalhoIdx], sep);
  const campos = titulos.map(campoDaColuna);
  if (!campos.includes('nome')) {
    return { colunas: titulos, linhas: [], erroGeral: 'Não achei a coluna do nome do material. A primeira linha do arquivo precisa ser o cabeçalho, com uma coluna chamada "nome" (ou "material", "descrição", "produto").' };
  }

  const linhas: LinhaLida[] = [];
  const vistos = new Set<string>();
  for (const i of indices.slice(1)) {
    if (linhas.length >= MAX_LINHAS_POR_ARQUIVO) break;
    const valores = dividirLinha(cruas[i], sep);
    const numeroNoArquivo = i + 1;
    const pegar = (campo: keyof MaterialImportado): string => {
      const pos = campos.indexOf(campo);
      return pos >= 0 ? (valores[pos] ?? '') : '';
    };

    const nome = pegar('nome').replace(/\s+/g, ' ').trim();
    if (!nome) {
      linhas.push({ linha: numeroNoArquivo, dados: null, erro: 'Sem nome do material.' });
      continue;
    }
    if (nome.length > 120) {
      linhas.push({ linha: numeroNoArquivo, dados: null, erro: 'Nome com mais de 120 caracteres.' });
      continue;
    }
    const repetido = vistos.has(nome.toLowerCase());
    vistos.add(nome.toLowerCase());
    if (repetido) {
      linhas.push({ linha: numeroNoArquivo, dados: null, erro: 'Repetido: este nome já apareceu antes no arquivo.' });
      continue;
    }

    const minimoBruto = lerNumero(pegar('estoque_minimo'));
    const qtdBruta = lerNumero(pegar('quantidade'));
    if (Number.isNaN(minimoBruto)) {
      linhas.push({ linha: numeroNoArquivo, dados: null, erro: 'Estoque mínimo não é um número.' });
      continue;
    }
    if (Number.isNaN(qtdBruta)) {
      linhas.push({ linha: numeroNoArquivo, dados: null, erro: 'Quantidade não é um número.' });
      continue;
    }
    const estoque_minimo = minimoBruto === null ? 0 : minimoBruto;
    const quantidade = qtdBruta === null ? 0 : qtdBruta;
    if (estoque_minimo < 0 || quantidade < 0) {
      linhas.push({ linha: numeroNoArquivo, dados: null, erro: 'Quantidade ou mínimo negativo.' });
      continue;
    }

    linhas.push({
      linha: numeroNoArquivo,
      dados: {
        nome,
        unidade_medida: (pegar('unidade_medida').trim() || 'UN').slice(0, 12),
        categoria: pegar('categoria').trim().slice(0, 60) || 'Outros',
        estoque_minimo,
        quantidade,
      },
      erro: null,
    });
  }

  if (linhas.length === 0) return { colunas: titulos, linhas, erroGeral: 'O arquivo só tem o cabeçalho — nenhuma linha de material.' };
  return { colunas: titulos, linhas, erroGeral: null };
}

/** Um modelo pronto para quem não tem planilha nenhuma. */
export const MODELO_CSV = ['nome;unidade;categoria;estoque_minimo;quantidade', 'Cimento CP-II 50kg;SC;Construção;40;148', 'Luva de raspa;PAR;EPI;10;25', 'Tinta acrílica branca 18L;LATA;Pintura;2;6'].join('\r\n');
