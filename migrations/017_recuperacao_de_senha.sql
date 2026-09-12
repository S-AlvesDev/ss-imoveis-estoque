-- =============================================================================
--  Recuperação de senha — "esqueci minha senha"
--
--  Quem tem e-mail na conta pede um link; o link vale uma hora e uma vez só.
--  O que fica aqui é o HASH do token (sha256), nunca o token: quem ler a
--  tabela não consegue montar o link. Quem entra por matrícula e não tem
--  e-mail continua dependendo do administrador (Usuários → trocar senha).
--
--  Só o servidor escreve, com a chave de serviço: RLS ligado, política
--  nenhuma. Apagar o usuário apaga os pedidos dele.
-- =============================================================================

create table if not exists password_resets (
  id          uuid primary key default gen_random_uuid(),
  user_id     bigint not null references estoque_users (id) on delete cascade,
  token_hash  text not null unique check (char_length(token_hash) = 64),
  expires_at  timestamptz not null,
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists password_resets_user_idx on password_resets (user_id);

alter table password_resets enable row level security;

revoke all on password_resets from public;
revoke all on password_resets from anon;
revoke all on password_resets from authenticated;


-- =============================================================================
--  CONFERÊNCIA
-- =============================================================================
do $$
begin
  if to_regclass('public.password_resets') is null then
    raise exception 'FALHOU: tabela password_resets não existe.';
  end if;

  if not exists (select 1 from pg_tables where tablename = 'password_resets' and rowsecurity) then
    raise exception 'FALHOU: RLS não está ligado em password_resets.';
  end if;

  if exists (select 1 from pg_policies where tablename = 'password_resets') then
    raise exception 'FALHOU: password_resets não deveria ter política nenhuma — só o servidor escreve.';
  end if;

  -- Um hash sha256 em hexadecimal tem exatamente 64 caracteres; nada menor entra.
  begin
    insert into password_resets (user_id, token_hash, expires_at)
    values ((select id from estoque_users order by id limit 1), 'curto', now() + interval '1 hour');
    raise exception 'FALHOU: aceitou um hash que não é sha256.';
  exception
    when check_violation then null;
    when not_null_violation then null; -- banco sem usuário nenhum: a restrição de tamanho nem chegou a rodar
  end;

  raise notice 'CONFERIDO — pedidos de recuperação de senha têm onde ficar.';
end $$;
