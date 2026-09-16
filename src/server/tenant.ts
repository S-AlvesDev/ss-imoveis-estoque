import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';

/**
 * Acesso a dados com a organização amarrada.
 *
 * O PROBLEMA QUE ISTO RESOLVE
 * O servidor tem ~100 pontos de consulta. Depender de cada um lembrar de
 * escrever `.eq('organization_id', ...)` é o que vaza dado de um cliente para
 * outro: basta uma consulta nova esquecer, e ninguém percebe até alguém ligar.
 * Aqui o filtro é aplicado pela própria camada de acesso — não dá para esquecer
 * porque não dá para escrever a consulta sem passar por ela.
 *
 * DOIS MODOS
 * 1. Com SUPABASE_JWT_SECRET configurado: usa a chave anônima e assina um token
 *    com `organization_id`. O PostgREST publica isso em `request.jwt.claims` e
 *    as políticas de RLS passam a valer — o BANCO vira o fiscal.
 * 2. Sem o segredo: usa service_role, que ignora RLS. O isolamento fica só
 *    nesta camada. Funciona, mas a garantia é do código, não do banco.
 *
 * Trocar de modo é definir (ou não) a variável de ambiente — nenhuma linha
 * de código muda. Em produção o modo 1 está ligado.
 */

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET || '';

/** Quando verdadeiro, é o banco que fiscaliza o isolamento, não só o código. */
export const RLS_ATIVO = Boolean(SUPABASE_JWT_SECRET && ANON_KEY);

/** Tabelas que pertencem a uma organização. Só estas ganham filtro automático. */
const TABELAS_DA_ORGANIZACAO = new Set([
  'materials',
  'material_movements',
  'support_tickets',
  'support_ticket_materials',
  'support_ticket_comments',
  'estoque_users',
  // Fase 2: unidade, depósito e saldo por depósito.
  'units',
  'warehouses',
  'stock_balances',
  'estoque_user_warehouses',
  // Estoques configuráveis (migrações 018 e 019).
  'categories',
  'loans',
  'lots',
  'assets',
  'asset_events',
  // Assinaturas (migração 021).
  'assinaturas',
  'pagamentos',
  // WhatsApp (migração 024).
  'whatsapp_conversas',
  // Fornecedores e cotações (migração 025).
  'fornecedores',
  'cotacoes',
  'cotacao_fornecedores',
]);

/** Quanto vale o token que assinamos para o PostgREST, e com quanta folga o trocamos antes de vencer. */
export const TOKEN_VALIDADE_S = 60 * 60;
export const TOKEN_FOLGA_S = 5 * 60;
/** `iat` dois minutos no passado — ver clientePara. */
const TOKEN_ATRASO_IAT_S = 120;

const clientesPorOrg = new Map<string, { client: SupabaseClient; renovarEm: number }>();

/**
 * O cliente de uma organização, guardado entre requisições — mas não para
 * sempre. No modo RLS o cliente carrega um token com prazo, e uma instância
 * que vive mais que o prazo (a Vercel mantém a função quente enquanto há
 * tráfego, e a tela pede dados a cada 45 s) passaria a mandar token vencido
 * em toda consulta: "JWT expired" em tudo, até a instância ser reciclada.
 * Aconteceu. Agora cada entrada sabe quando deve ser refeita, com folga.
 */
function clientePara(organizationId: string, agora = Date.now()): SupabaseClient {
  const cache = clientesPorOrg.get(organizationId);
  if (cache && agora < cache.renovarEm) return cache.client;

  let client: SupabaseClient;
  let renovarEm = Number.POSITIVE_INFINITY;

  if (RLS_ATIVO) {
    // Token que o PostgREST valida e transforma em request.jwt.claims.
    // Curto de propósito: é usado só para esta janela de requisições.
    //
    // `iat` dois minutos no passado: o PostgREST recusa token "emitido no
    // futuro", e um relógio local meio minuto adiantado já bastava para
    // derrubar toda leitura ("JWT issued at future"). O prazo de validade
    // é contado a partir do iat, então vence antes de uma hora daqui — e a
    // renovação desconta isso também.
    const iat = Math.floor(agora / 1000) - TOKEN_ATRASO_IAT_S;
    const token = jwt.sign({ role: 'authenticated', organization_id: organizationId, iat }, SUPABASE_JWT_SECRET, { expiresIn: TOKEN_VALIDADE_S });
    client = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    renovarEm = (iat + TOKEN_VALIDADE_S - TOKEN_FOLGA_S) * 1000;
  } else {
    // Chave de serviço não vence: o cliente serve enquanto a instância viver.
    client = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }

  clientesPorOrg.set(organizationId, { client, renovarEm });
  return client;
}

/** Quando o cliente desta organização vai ser refeito (Infinity fora do modo RLS). Para os testes. */
export function renovacaoDoCliente(organizationId: string): number | null {
  return clientesPorOrg.get(organizationId)?.renovarEm ?? null;
}

function comOrganizacao<T>(payload: T, organizationId: string): T {
  const marcar = (row: any) => ({ ...row, organization_id: organizationId });
  return (Array.isArray(payload) ? payload.map(marcar) : marcar(payload)) as T;
}

/**
 * Devolve um acessor preso a uma organização. As consultas continuam sendo
 * encadeadas como antes — `.select().eq().order().single()` —, mas já nascem
 * filtradas, e as escritas já nascem marcadas.
 */
export function scopedDb(organizationId: string, agora = Date.now()) {
  if (!organizationId) {
    // Sem organização não existe consulta válida. Falhar aqui é melhor que
    // devolver dado de todo mundo.
    throw new Error('[tenant] organização ausente — consulta recusada.');
  }

  const client = clientePara(organizationId, agora);

  return {
    /** Escapatória explícita, para o que é global de verdade (ex.: organizations). */
    raw: client,

    from(table: string) {
      const base = client.from(table);
      const daOrg = TABELAS_DA_ORGANIZACAO.has(table);

      // O retorno é `any` de propósito. O cliente do Supabase aqui não tem
      // schema tipado, então as consultas originais já devolviam `any`; tipar
      // o wrapper estreitaria para uma união com GenericStringError e faria as
      // rotas pararem de compilar sem ganhar segurança real.
      return {
        select: (colunas = '*', opcoes?: any): any => {
          const q = base.select(colunas, opcoes);
          return daOrg ? q.eq('organization_id', organizationId) : q;
        },
        insert: (linhas: any): any => base.insert(daOrg ? comOrganizacao(linhas, organizationId) : linhas),
        // O saldo por depósito é gravado por upsert: a linha pode já existir
        // (material antigo) ou não (depósito recém-criado), e o caminho tem que
        // ser o mesmo nos dois casos.
        upsert: (linhas: any, opcoes?: any): any =>
          base.upsert(daOrg ? comOrganizacao(linhas, organizationId) : linhas, opcoes),
        update: (patch: any): any => {
          const q = base.update(patch);
          return daOrg ? q.eq('organization_id', organizationId) : q;
        },
        delete: (): any => {
          const q = base.delete();
          return daOrg ? q.eq('organization_id', organizationId) : q;
        },
      };
    },
  };
}

export type ScopedDb = ReturnType<typeof scopedDb>;
