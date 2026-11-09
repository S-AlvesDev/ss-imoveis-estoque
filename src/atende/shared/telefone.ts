/**
 * O telefone de um contato, montado peça por peça.
 *
 * Digitar o número livre dava dois problemas silenciosos. O primeiro: sem
 * DDI, o lead era gravado como "84999999999", e quando a pessoa escrevia no
 * WhatsApp — que identifica por "5584999999999" — os dois não casavam e
 * nascia um segundo cliente, deixando o lead cadastrado órfão. O segundo: o
 * nono dígito, que quem cadastra esquece e só se descobre quando a mensagem
 * não chega.
 *
 * Por isso o DDI e o DDD são escolhidos, não digitados, e o que se grava é
 * sempre DDI + DDD + número, em dígitos — do jeito que o WhatsApp usa.
 */

export interface Pais {
  ddi: string;
  nome: string;
  bandeira: string;
}

/** Brasil primeiro, que é o caso de quase todo mundo; depois os vizinhos e onde há cliente fora. */
export const PAISES: readonly Pais[] = [
  { ddi: '55', nome: 'Brasil', bandeira: '🇧🇷' },
  { ddi: '351', nome: 'Portugal', bandeira: '🇵🇹' },
  { ddi: '1', nome: 'EUA / Canadá', bandeira: '🇺🇸' },
  { ddi: '54', nome: 'Argentina', bandeira: '🇦🇷' },
  { ddi: '595', nome: 'Paraguai', bandeira: '🇵🇾' },
  { ddi: '598', nome: 'Uruguai', bandeira: '🇺🇾' },
  { ddi: '591', nome: 'Bolívia', bandeira: '🇧🇴' },
  { ddi: '56', nome: 'Chile', bandeira: '🇨🇱' },
  { ddi: '57', nome: 'Colômbia', bandeira: '🇨🇴' },
  { ddi: '44', nome: 'Reino Unido', bandeira: '🇬🇧' },
  { ddi: '34', nome: 'Espanha', bandeira: '🇪🇸' },
  { ddi: '39', nome: 'Itália', bandeira: '🇮🇹' },
];

export const DDI_PADRAO = '55';
/** Rio Grande do Norte: onde a casa opera. */
export const DDD_PADRAO = '84';

/** Os DDDs que existem no Brasil. Um número com DDD fora desta lista não chega a lugar nenhum. */
export const DDDS_BR: readonly string[] = [
  '11', '12', '13', '14', '15', '16', '17', '18', '19',
  '21', '22', '24', '27', '28',
  '31', '32', '33', '34', '35', '37', '38',
  '41', '42', '43', '44', '45', '46', '47', '48', '49',
  '51', '53', '54', '55',
  '61', '62', '63', '64', '65', '66', '67', '68', '69',
  '71', '73', '74', '75', '77', '79',
  '81', '82', '83', '84', '85', '86', '87', '88', '89',
  '91', '92', '93', '94', '95', '96', '97', '98', '99',
];

export type TomDoAviso = 'ok' | 'aviso' | 'erro';

export interface AnaliseDoTelefone {
  /** Só dígitos, com DDI — exatamente como será gravado e como o WhatsApp identifica. */
  completo: string;
  /** Dá para gravar este contato? */
  valido: boolean;
  /** Este número recebe WhatsApp? (no Brasil, só celular) */
  whatsapp: boolean;
  /** O que dizer a quem está cadastrando; nulo enquanto não há o que dizer. */
  recado: string | null;
  tom: TomDoAviso;
}

const soDigitos = (v: string) => String(v ?? '').replace(/\D/g, '');

/**
 * Olha o que foi digitado e diz se serve — e, quando não serve, por quê.
 *
 * No Brasil dá para ser exato: celular tem 9 dígitos e começa com 9; fixo
 * tem 8 e começa entre 2 e 5. Fora do Brasil não dá para afirmar nada sobre
 * WhatsApp sem consultar o próprio WhatsApp, então o aviso diz isso em vez
 * de fingir certeza.
 */
export function analisarTelefone(ddi: string, ddd: string, numero: string): AnaliseDoTelefone {
  const n = soDigitos(numero);
  const d = soDigitos(ddd);
  const i = soDigitos(ddi);

  if (i !== '55') {
    const completo = `${i}${n}`;
    if (n.length < 6) return { completo, valido: false, whatsapp: false, recado: n ? 'Número curto demais.' : null, tom: n ? 'erro' : 'ok' };
    if (completo.length > 15) return { completo, valido: false, whatsapp: false, recado: 'Número longo demais.', tom: 'erro' };
    return { completo, valido: true, whatsapp: true, recado: 'Fora do Brasil não dá para conferir o formato — confira o número com o contato.', tom: 'aviso' };
  }

  const completo = `${i}${d}${n}`;
  if (!n) return { completo, valido: false, whatsapp: false, recado: null, tom: 'ok' };
  if (!DDDS_BR.includes(d)) return { completo, valido: false, whatsapp: false, recado: `DDD ${d || '—'} não existe no Brasil.`, tom: 'erro' };

  // O caso que mais acontece, e o motivo do aviso em vermelho.
  if (n.length === 8 && /^[6-9]/.test(n)) {
    return { completo, valido: false, whatsapp: false, recado: `Faltou o 9: celular tem 9 dígitos. Ficaria (${d}) 9${n.slice(0, 4)}-${n.slice(4)}.`, tom: 'erro' };
  }
  if (n.length === 8) {
    return { completo, valido: true, whatsapp: false, recado: 'Isto é um telefone fixo — não recebe WhatsApp.', tom: 'aviso' };
  }
  if (n.length === 9) {
    if (!n.startsWith('9')) return { completo, valido: false, whatsapp: false, recado: 'Celular com 9 dígitos começa com 9.', tom: 'erro' };
    return { completo, valido: true, whatsapp: true, recado: 'Número válido para WhatsApp.', tom: 'ok' };
  }
  return { completo, valido: false, whatsapp: false, recado: n.length < 8 ? 'Faltam dígitos.' : 'Dígitos demais.', tom: 'erro' };
}

/** "(84) 99999-9999" enquanto se digita. Só formata; quem julga é analisarTelefone. */
export function formatarNumeroBr(valor: string): string {
  const n = soDigitos(valor).slice(0, 9);
  if (n.length <= 4) return n;
  if (n.length <= 8) return `${n.slice(0, 4)}-${n.slice(4)}`;
  return `${n.slice(0, 5)}-${n.slice(5)}`;
}
