-- =============================================================================
--  030 — Atende Aí: a ponte com o Stok Aí
--
--  Uma empresa do Stok Aí pode ativar o Atende Aí: a `atende_empresa` nasce
--  ligada à `organization` (a coluna já existia, nula), e cada pessoa da
--  equipe do estoque que entrar pelo Stok Aí ganha o próprio usuário no
--  Atende, lembrado por `estoque_user_id`. É só isso que liga os dois — nada
--  de regra de negócio do estoque entra aqui, e a sessão continua separada.
--
--  Uma organização ativa o Atende uma vez só (índice único).
-- =============================================================================

alter table atende_usuarios
  add column if not exists estoque_user_id bigint references estoque_users (id) on delete set null;

create unique index if not exists atende_usuarios_estoque_user_unico
  on atende_usuarios (estoque_user_id) where estoque_user_id is not null;

create unique index if not exists atende_empresas_organization_unica
  on atende_empresas (organization_id) where organization_id is not null;

-- =============================================================================
--  CONFERÊNCIA
-- =============================================================================
do $$
begin
  if not exists (select 1 from information_schema.columns where table_name = 'atende_usuarios' and column_name = 'estoque_user_id') then
    raise exception 'FALHOU: atende_usuarios.estoque_user_id não existe.';
  end if;
  raise notice 'OK: 030 aplicada — ponte Stok Aí ↔ Atende Aí pronta.';
end $$;
