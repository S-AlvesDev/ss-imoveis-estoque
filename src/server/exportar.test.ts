import { describe, it, expect, vi } from 'vitest';

vi.mock('../lib/supabaseServer', () => ({ supabaseServer: {} }));

import { paraCsv, ehTabelaExportavel } from './exportar';

describe('CSV', () => {
  it('BOM, ponto e vírgula, vírgula decimal e aspas só quando precisa', () => {
    const csv = paraCsv(['nome', 'qtd', 'obs'], [['Cimento', 2.5, null], ['Tinta; branca', 3, 'diz "ok"']]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('nome;qtd;obs\r\n');
    expect(csv).toContain('Cimento;2,5;\r\n');
    expect(csv).toContain('"Tinta; branca";3;"diz ""ok"""\r\n');
  });
  it('só exporta o que existe', () => {
    expect(ehTabelaExportavel('materiais')).toBe(true);
    expect(ehTabelaExportavel('senhas')).toBe(false);
  });
});
