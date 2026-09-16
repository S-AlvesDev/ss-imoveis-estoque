-- =============================================================================
--  028 — Jatobá, o assistente do site
--
--  O Jatobá responde na Home (quem ainda não é cliente, sem login) e no
--  painel (quem está logado: consulta, propõe movimentações, ensina a usar
--  o sistema). Cada pergunta e resposta fica aqui, com o que custou — é o
--  medidor de uso: o limite diário da Home e o mensal por empresa contam
--  linhas desta tabela.
--
--  Na Home não há empresa nem usuário: `organization_id` e `user_id` ficam
--  nulos e `ip` guarda de onde veio, só para o teto por IP e para
--  investigar abuso.
-- =============================================================================

create table if not exists jatoba_mensagens (
  id              uuid primary key default gen_random_uuid(),
  canal           text not null check (canal in ('home', 'painel')),
  organization_id uuid references organizations (id) on delete cascade,
  user_id         bigint references estoque_users (id) on delete set null,
  ip              text,
  pergunta        text not null,
  resposta        text not null,
  -- As ferramentas que a IA chamou (consultar_saldo, propor_movimentacao, abrir_tela...).
  ferramentas     text[],
  -- O que custou: preço cheio, lido do cache (10%), saída.
  tokens_entrada  integer,
  tokens_cache    integer,
  tokens_saida    integer,
  modelo          text,
  criado_em       timestamptz not null default now()
);

create index if not exists jatoba_mensagens_org_mes_idx on jatoba_mensagens (organization_id, criado_em desc);
create index if not exists jatoba_mensagens_canal_dia_idx on jatoba_mensagens (canal, criado_em desc);

alter table jatoba_mensagens enable row level security;
-- Nenhuma política: só o servidor (chave de serviço) escreve e lê.

-- =============================================================================
--  CONFERÊNCIA
-- =============================================================================
do $$
begin
  if to_regclass('public.jatoba_mensagens') is null then
    raise exception 'FALHOU: jatoba_mensagens não existe.';
  end if;
  raise notice 'OK: 028 aplicada — jatoba_mensagens pronta.';
end $$;
