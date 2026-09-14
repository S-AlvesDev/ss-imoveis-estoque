/**
 * Quem está pagando por Pix ou boleto: nome ou razão social, CPF ou CNPJ,
 * e-mail e, no boleto, o endereço — o Mercado Pago exige tudo isso, e a
 * nota fiscal também. Regras puras; a rota grava.
 */
import type { PagadorAvulso } from './mercadopago';

export type ValidacaoPagador = { ok: true; pagador: PagadorAvulso } | { ok: false; erro: string };

function texto(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function digitos(v: unknown): string {
  return texto(v).replace(/\D/g, '');
}

export function cpfValido(cpf: string): boolean {
  const d = cpf.replace(/\D/g, '');
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const dv = (n: number) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}

export function cnpjValido(cnpj: string): boolean {
  const d = cnpj.replace(/\D/g, '');
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const calc = (tam: number) => {
    const pesos = tam === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let s = 0;
    for (let i = 0; i < tam; i++) s += Number(d[i]) * pesos[i];
    const r = s % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}

const UFS = new Set(['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO']);

export function validarPagador(body: unknown, metodo: 'pix' | 'boleto'): ValidacaoPagador {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const nome = texto(b.nome);
  if (nome.length < 3 || nome.length > 120) return { ok: false, erro: 'Informe o nome ou a razão social (3 a 120 caracteres).' };
  const email = texto(b.email).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, erro: 'Informe um e-mail válido.' };
  const doc = digitos(b.doc);
  let tipoDoc: 'CPF' | 'CNPJ';
  if (doc.length === 11) {
    if (!cpfValido(doc)) return { ok: false, erro: 'CPF inválido.' };
    tipoDoc = 'CPF';
  } else if (doc.length === 14) {
    if (!cnpjValido(doc)) return { ok: false, erro: 'CNPJ inválido.' };
    tipoDoc = 'CNPJ';
  } else {
    return { ok: false, erro: 'Informe o CPF (11 dígitos) ou o CNPJ (14 dígitos).' };
  }

  let endereco: PagadorAvulso['endereco'] = null;
  if (metodo === 'boleto') {
    const e = (b.endereco && typeof b.endereco === 'object' ? b.endereco : {}) as Record<string, unknown>;
    const cep = digitos(e.cep);
    const rua = texto(e.rua);
    const numero = texto(e.numero);
    const bairro = texto(e.bairro);
    const cidade = texto(e.cidade);
    const uf = texto(e.uf).toUpperCase();
    if (cep.length !== 8) return { ok: false, erro: 'CEP inválido (8 dígitos).' };
    if (rua.length < 2 || rua.length > 120) return { ok: false, erro: 'Informe a rua.' };
    if (numero.length < 1 || numero.length > 20) return { ok: false, erro: 'Informe o número.' };
    if (bairro.length < 2 || bairro.length > 80) return { ok: false, erro: 'Informe o bairro.' };
    if (cidade.length < 2 || cidade.length > 80) return { ok: false, erro: 'Informe a cidade.' };
    if (!UFS.has(uf)) return { ok: false, erro: 'UF inválida.' };
    endereco = { cep, rua, numero, bairro, cidade, uf };
  }
  return { ok: true, pagador: { nome, email, tipoDoc, doc, endereco } };
}
