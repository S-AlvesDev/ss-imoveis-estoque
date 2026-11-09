import { describe, it, expect } from 'vitest';
import { analisarTelefone, formatarNumeroBr, DDDS_BR, DDI_PADRAO, DDD_PADRAO } from './telefone';

/**
 * O telefone de um lead. Duas coisas se decidem aqui: se o número serve, e
 * o que dizer a quem está cadastrando quando não serve.
 */

const br = (ddd: string, numero: string) => analisarTelefone('55', ddd, numero);

describe('celular do Brasil', () => {
  it('nove dígitos começando com 9 é WhatsApp, e grava com DDI', () => {
    const r = br('84', '991234567');
    expect(r).toMatchObject({ completo: '5584991234567', valido: true, whatsapp: true, tom: 'ok' });
    expect(r.recado).toMatch(/válido para WhatsApp/i);
  });

  it('a máscara não atrapalha — só os dígitos contam', () => {
    expect(br('84', '99123-4567').completo).toBe('5584991234567');
  });

  it('colar o número já com o DDD no campo errado é recusado, não aceito torto', () => {
    // "(84) 99123-4567" no campo do número daria 11 dígitos: o DDD tem campo próprio.
    expect(br('84', '(84) 99123-4567')).toMatchObject({ valido: false, tom: 'erro' });
    expect(br('84', '(84) 99123-4567').recado).toContain('Dígitos demais');
  });

  it('o DDI entra sempre — é o que faz o lead casar com quem escreve no WhatsApp', () => {
    expect(br('11', '987654321').completo.startsWith('55')).toBe(true);
  });
});

describe('o nono dígito — o aviso em vermelho', () => {
  it('oito dígitos de celular: recusa e mostra como ficaria', () => {
    const r = br('84', '91234567');
    expect(r).toMatchObject({ valido: false, whatsapp: false, tom: 'erro' });
    expect(r.recado).toContain('Faltou o 9');
    expect(r.recado).toContain('(84) 99123-4567');
  });

  it('vale para os celulares antigos começando em 6, 7 e 8 também', () => {
    for (const n of ['81234567', '71234567', '61234567']) {
      expect(br('84', n).tom).toBe('erro');
      expect(br('84', n).recado).toContain('Faltou o 9');
    }
  });

  it('nove dígitos que não começam com 9 não é celular', () => {
    expect(br('84', '312345678')).toMatchObject({ valido: false, tom: 'erro' });
  });
});

describe('fixo', () => {
  it('é válido para cadastrar, mas avisa que não recebe WhatsApp', () => {
    const r = br('84', '32211234');
    expect(r).toMatchObject({ valido: true, whatsapp: false, tom: 'aviso' });
    expect(r.recado).toMatch(/fixo/i);
  });
});

describe('DDD', () => {
  it('o padrão da casa é 84, e o país é o Brasil', () => {
    expect(DDI_PADRAO).toBe('55');
    expect(DDD_PADRAO).toBe('84');
    expect(DDDS_BR).toContain('84');
  });

  it('DDD que não existe é recusado antes de qualquer outra coisa', () => {
    const r = br('20', '991234567');
    expect(r).toMatchObject({ valido: false, tom: 'erro' });
    expect(r.recado).toContain('não existe');
  });

  it('a lista não tem DDD inventado', () => {
    for (const d of ['00', '01', '10', '20', '23', '25', '26', '29', '30', '36', '39', '40', '50', '52', '56', '60', '70', '72', '76', '78', '80', '90']) {
      expect(DDDS_BR).not.toContain(d);
    }
  });
});

describe('fora do Brasil', () => {
  it('não finge certeza sobre WhatsApp', () => {
    const r = analisarTelefone('351', '', '912345678');
    expect(r).toMatchObject({ completo: '351912345678', valido: true, tom: 'aviso' });
    expect(r.recado).toMatch(/Fora do Brasil/i);
  });

  it('curto demais é recusado', () => {
    expect(analisarTelefone('351', '', '123')).toMatchObject({ valido: false, tom: 'erro' });
  });

  it('o DDD é ignorado quando o país não é o Brasil', () => {
    expect(analisarTelefone('1', '84', '2025550123').completo).toBe('12025550123');
  });
});

describe('enquanto se digita', () => {
  it('nada é dito com o campo vazio', () => {
    expect(br('84', '')).toMatchObject({ recado: null, tom: 'ok', valido: false });
  });

  it('o número vai se formatando', () => {
    expect(formatarNumeroBr('9912')).toBe('9912');
    expect(formatarNumeroBr('99123456')).toBe('9912-3456');
    expect(formatarNumeroBr('991234567')).toBe('99123-4567');
    expect(formatarNumeroBr('(84) 99123-4567890')).toBe('84991-2345');
  });
});
