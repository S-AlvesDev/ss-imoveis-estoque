import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Um Supabase de mentira, encadeável: registra as tabelas tocadas e devolve
 * o que o teste mandou para `maybeSingle`/`single`/await.
 */
const chamadas: string[] = [];
let respostaDoUsuario: any = null;

function consulta(tabela: string) {
  chamadas.push(tabela);
  const resultado = { data: tabela === 'estoque_users' ? respostaDoUsuario : null, error: null, count: 0 };
  const q: any = new Proxy(
    {},
    {
      get(_alvo, prop) {
        if (prop === 'then') return (ok: (v: any) => unknown) => Promise.resolve(resultado).then(ok);
        if (prop === 'maybeSingle' || prop === 'single') return () => Promise.resolve(resultado);
        return () => q;
      },
    },
  );
  return q;
}

vi.mock('../lib/supabaseServer', () => ({ supabaseServer: { from: (t: string) => consulta(t) } }));
vi.hoisted(() => {
  process.env.SUPABASE_URL = 'https://exemplo.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'chave-de-servico';
  process.env.JWT_SECRET = 'segredo-de-teste';
});

import { responder, falantePeloTelefone } from './assistente';

const SAMUEL = { id: 7, nome: 'Samuel', matricula: '001', role: 'CEO', organization_id: 'org-1', whatsapp_operacoes: null, whatsapp_pin: null, ativo: true };

describe('o assistente do WhatsApp desligado pela empresa', () => {
  beforeEach(() => {
    chamadas.length = 0;
  });

  it('o falante sabe se a empresa deixou o assistente ligado (padrão: sim)', async () => {
    respostaDoUsuario = { ...SAMUEL, organizations: { nome: 'Stok Aí', whatsapp_ia_ativa: false } };
    expect((await falantePeloTelefone('5584991284470'))?.iaAtiva).toBe(false);
    respostaDoUsuario = { ...SAMUEL, organizations: { nome: 'Stok Aí', whatsapp_ia_ativa: true } };
    expect((await falantePeloTelefone('5584991284470'))?.iaAtiva).toBe(true);
    // Coluna ausente (migração 033 ainda não rodou): ligado, como sempre foi.
    respostaDoUsuario = { ...SAMUEL, organizations: { nome: 'Stok Aí' } };
    expect((await falantePeloTelefone('5584991284470'))?.iaAtiva).toBe(true);
  });

  it('desligado: silêncio — nada registrado, nada contado, nem "digitando…"', async () => {
    respostaDoUsuario = { ...SAMUEL, organizations: { nome: 'Stok Aí', whatsapp_ia_ativa: false } };
    const digitou = vi.fn();
    const r = await responder('5584991284470', 'Oi', 'texto', 'org-abc', undefined, digitou);
    expect(r.texto).toBeNull();
    expect(r.falante?.id).toBe(7);
    expect(digitou).not.toHaveBeenCalled();
    // Só a busca do falante tocou o banco: nenhuma linha em whatsapp_mensagens.
    expect(chamadas).toEqual(['estoque_users']);
  });
});
