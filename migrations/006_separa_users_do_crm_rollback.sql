-- =============================================================================
--  Desfaz a separação da identidade do estoque.
--
--  Remove `estoque_users`. A tabela `users` nunca foi alterada, então o login
--  volta a funcionar por ela assim que o código do servidor for revertido.
--
--  ATENÇÃO: só rode isto DEPOIS de reverter o código do servidor. Se o
--  servidor já estiver apontando para `estoque_users`, apagar a tabela
--  derruba o login de todo mundo.
-- =============================================================================

do $$
declare
  n int;
begin
  if to_regclass('estoque_users') is null then
    raise notice 'estoque_users não existe — nada a desfazer.';
    return;
  end if;

  select count(*) into n from estoque_users;
  raise notice 'Removendo estoque_users com % conta(s).', n;
  raise notice 'As mesmas contas seguem intactas em `users`.';
end $$;

drop table if exists estoque_users;

do $$
begin
  raise notice 'Separação revertida. `users` intacta, como sempre esteve.';
end $$;
