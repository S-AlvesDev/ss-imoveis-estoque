import { describe, it, expect, beforeAll } from 'vitest';

// O cliente do Supabase é construído na carga do módulo, então o ambiente
// precisa existir antes do import.
process.env.SUPABASE_URL = 'https://exemplo.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'chave-de-teste';

const ORG_A = '5e7e0000-0000-4000-8000-000000000001';
const ORG_B = 'bbbbbbbb-0000-4000-8000-000000000002';

let scopedDb: typeof import('./tenant').scopedDb;

beforeAll(async () => {
  ({ scopedDb } = await import('./tenant'));
});

/** O filtro que a consulta vai enviar ao PostgREST, sem precisar de rede. */
function filtroDe(builder: any): string {
  return (builder as any).url.searchParams.get('organization_id') ?? '';
}

describe('scopedDb — leitura', () => {
  it('prende a consulta à organização mesmo sem ninguém pedir', () => {
    const q = scopedDb(ORG_A).from('materials').select('*');
    expect(filtroDe(q)).toBe(`eq.${ORG_A}`);
  });

  it('duas organizações produzem filtros diferentes', () => {
    const a = scopedDb(ORG_A).from('materials').select('*');
    const b = scopedDb(ORG_B).from('materials').select('*');
    expect(filtroDe(a)).not.toBe(filtroDe(b));
  });

  it('mantém o encadeamento normal depois do filtro', () => {
    // Se o wrapper quebrasse o encadeamento, cada rota precisaria ser reescrita.
    const q = scopedDb(ORG_A)
      .from('materials')
      .select('*')
      .order('nome', { ascending: true })
      .eq('categoria', 'Geral');
    expect(filtroDe(q)).toBe(`eq.${ORG_A}`);
    expect((q as any).url.searchParams.get('categoria')).toBe('eq.Geral');
  });

  it('aplica em todas as tabelas que pertencem a uma organização', () => {
    for (const t of [
      'materials',
      'material_movements',
      'support_tickets',
      'support_ticket_materials',
      'support_ticket_comments',
      'estoque_users',
    ]) {
      expect(filtroDe(scopedDb(ORG_A).from(t).select('*'))).toBe(`eq.${ORG_A}`);
    }
  });

  it('não filtra tabelas que são globais', () => {
    // `organizations` é a lista de contas: não pertence a nenhuma delas.
    expect(filtroDe(scopedDb(ORG_A).from('organizations').select('*'))).toBe('');
  });
});

describe('scopedDb — escrita', () => {
  it('marca a linha inserida com a organização', () => {
    const q = scopedDb(ORG_A).from('materials').insert({ nome: 'CIMENTO' });
    expect((q as any).body).toMatchObject({ nome: 'CIMENTO', organization_id: ORG_A });
  });

  it('marca todas as linhas de uma inserção em lote', () => {
    const q = scopedDb(ORG_A).from('material_movements').insert([{ quantidade: 1 }, { quantidade: 2 }]);
    const body = (q as any).body as any[];
    expect(body).toHaveLength(2);
    expect(body.every((r) => r.organization_id === ORG_A)).toBe(true);
  });

  it('sobrescreve uma organização informada por engano', () => {
    // Uma rota que passasse organization_id à mão não pode gravar em outra conta.
    const q = scopedDb(ORG_A).from('materials').insert({ nome: 'X', organization_id: ORG_B });
    expect((q as any).body.organization_id).toBe(ORG_A);
  });

  it('limita update e delete à própria organização', () => {
    expect(filtroDe(scopedDb(ORG_A).from('materials').update({ nome: 'Y' }))).toBe(`eq.${ORG_A}`);
    expect(filtroDe(scopedDb(ORG_A).from('materials').delete())).toBe(`eq.${ORG_A}`);
  });

  it('não deixa um delete alcançar a outra organização nem pelo id', () => {
    // Mesmo sabendo o id exato de uma linha alheia, o filtro da organização
    // continua na consulta e ela não é atingida.
    const q = scopedDb(ORG_A).from('materials').delete().eq('id', 999);
    expect(filtroDe(q)).toBe(`eq.${ORG_A}`);
    expect((q as any).url.searchParams.get('id')).toBe('eq.999');
  });
});

describe('scopedDb — falha fecha', () => {
  it('recusa consulta sem organização em vez de devolver tudo', () => {
    expect(() => scopedDb('')).toThrow(/organização ausente/);
    // @ts-expect-error verificando o comportamento com valor inválido
    expect(() => scopedDb(undefined)).toThrow(/organização ausente/);
  });
});
