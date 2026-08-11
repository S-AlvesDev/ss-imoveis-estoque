import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.warn('[Supabase] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY não configurados no .env — as rotas de dados vão falhar até isso ser corrigido.');
}

export const supabaseServer = createClient(supabaseUrl || '', serviceRoleKey || '', {
  auth: { autoRefreshToken: false, persistSession: false },
});
