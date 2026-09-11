-- =============================================================================
--  Criar organização — o que uma empresa nova precisa para começar
--
--  Uma conta nova é cinco inserções que só fazem sentido juntas: a
--  organização, a primeira unidade, os dois depósitos dela e o primeiro
--  administrador. Se a quarta falhar, as três anteriores não podem ficar.
--  O servidor fala com o banco pelo PostgREST, que não tem transação entre
--  chamadas — mas uma função no banco tem. Então a função faz tudo, ou nada.
--
--  E-MAIL ÚNICO NO SISTEMA
--  Matrícula é única por organização (a São Severino tem "001", outra
--  empresa pode ter também). E-mail não pode: é por ele que o responsável de
--  uma empresa nova entra, e é o desempate quando duas matrículas iguais
--  existem em organizações diferentes. O índice abaixo garante isso no banco,
--  não só no código — e ignora maiúsculas, porque quem digita não sabe como
--  cadastrou.
--
--  SEGURANÇA
--  A função é SECURITY DEFINER: roda com os direitos de quem a criou, então
--  passa por cima do RLS — necessário, porque quem a chama ainda não tem
--  organização. Por isso ela é chamada SÓ pelo servidor com a chave de
--  serviço, e faz todas as validações de novo por dentro: não confia no que
--  vem de fora.
-- =============================================================================

-- Tira acentos para montar o slug. No Supabase a extensão costuma viver no
-- schema `extensions`; criada aqui sem schema, vai para o atual. A função
-- procura nos dois.
create extension if not exists unaccent;

-- E-mail único entre organizações, sem distinguir maiúsculas. Antes de criar,
-- confere que não há duplicata hoje — se houver, é melhor saber agora.
do $$
declare
  dup record;
begin
  select lower(email) as email, count(*) as n into dup
  from estoque_users
  where email is not null and email <> ''
  group by lower(email)
  having count(*) > 1
  limit 1;

  if dup.email is not null then
    raise exception 'FALHOU: o e-mail % está em % contas. Resolva antes de criar o índice único.', dup.email, dup.n;
  end if;
end $$;

create unique index if not exists estoque_users_email_unico
  on estoque_users (lower(email))
  where email is not null and email <> '';


-- -----------------------------------------------------------------------------
--  A função
-- -----------------------------------------------------------------------------
create or replace function criar_organizacao(
  p_empresa      text,
  p_nome         text,
  p_email        text,
  p_senha_hash   text,
  p_unidade      text default 'Matriz'
)
returns table (organization_id uuid, unit_id uuid, user_id bigint, slug text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_empresa text := btrim(p_empresa);
  v_nome    text := btrim(p_nome);
  v_email   text := lower(btrim(p_email));
  v_slug    text;
  v_base    text;
  v_org     uuid;
  v_unit    uuid;
  v_user    bigint;
  i         int := 1;
begin
  -- Validações de novo, por dentro: a função não confia em quem chama.
  if length(v_empresa) < 2 or length(v_empresa) > 60 then
    raise exception 'Nome da empresa deve ter de 2 a 60 caracteres.' using errcode = 'check_violation';
  end if;
  if length(v_nome) < 2 or length(v_nome) > 80 then
    raise exception 'Nome do responsável deve ter de 2 a 80 caracteres.' using errcode = 'check_violation';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_email) > 120 then
    raise exception 'E-mail inválido.' using errcode = 'check_violation';
  end if;
  if p_senha_hash !~ '^\$2[aby]\$' then
    -- Só entra senha já protegida. Texto puro aqui seria um erro do servidor.
    raise exception 'A senha precisa chegar já protegida (bcrypt).' using errcode = 'check_violation';
  end if;
  if exists (select 1 from estoque_users where lower(email) = v_email) then
    raise exception 'Já existe uma conta com este e-mail.' using errcode = 'unique_violation';
  end if;

  -- Slug a partir do nome: sem acento, minúsculo, hífens. Se já existir,
  -- numera: "construtora-alfa", "construtora-alfa-2", ...
  v_base := regexp_replace(lower(unaccent(v_empresa)), '[^a-z0-9]+', '-', 'g');
  v_base := btrim(v_base, '-');
  if v_base = '' then v_base := 'empresa'; end if;
  v_slug := v_base;
  while exists (select 1 from organizations o where o.slug = v_slug) loop
    i := i + 1;
    v_slug := v_base || '-' || i;
  end loop;

  insert into organizations (nome, slug) values (v_empresa, v_slug) returning id into v_org;

  insert into units (organization_id, nome, slug)
  values (v_org, btrim(coalesce(nullif(p_unidade, ''), 'Matriz')), 'matriz')
  returning id into v_unit;

  insert into warehouses (organization_id, unit_id, nome, tipo) values
    (v_org, v_unit, 'Almoxarifado Central', 'CENTRAL'),
    (v_org, v_unit, 'Almoxarifado de Obra', 'OBRA');

  -- O responsável entra como administrador, com matrícula "ADMIN" — única
  -- dentro da organização, e ele vai entrar pelo e-mail de qualquer jeito.
  insert into estoque_users (organization_id, nome, email, matricula, senha, role, ativo, senha_alterada_em)
  values (v_org, v_nome, v_email, 'ADMIN', p_senha_hash, 'ADMINISTRADOR', true, now())
  returning id into v_user;

  return query select v_org, v_unit, v_user, v_slug;
end $$;

-- Só o servidor chama. Nem anon nem authenticated enxergam a função.
revoke all on function criar_organizacao(text, text, text, text, text) from public;
revoke all on function criar_organizacao(text, text, text, text, text) from anon;
revoke all on function criar_organizacao(text, text, text, text, text) from authenticated;
grant execute on function criar_organizacao(text, text, text, text, text) to service_role;


-- =============================================================================
--  CONFERÊNCIA — a função cria tudo e desfaz tudo
-- =============================================================================
do $$
declare
  r record;
  antes_org int; antes_unit int; antes_wh int; antes_user int;
  depois_org int;
begin
  select count(*) into antes_org from organizations;
  select count(*) into antes_unit from units;
  select count(*) into antes_wh from warehouses;
  select count(*) into antes_user from estoque_users;

  -- Cria uma organização de teste e confere as peças.
  select * into r from criar_organizacao('Teste da Migração 014', 'Pessoa de Teste', 'teste-014@exemplo.invalid', '$2a$10$abcdefghijklmnopqrstuvAbCdEfGhIjKlMnOpQrStUvWxYz01234');
  if r.slug <> 'teste-da-migracao-014' then
    raise exception 'FALHOU: slug inesperado: %', r.slug;
  end if;
  if (select count(*) from warehouses where unit_id = r.unit_id) <> 2 then
    raise exception 'FALHOU: a unidade de teste não ficou com 2 depósitos.';
  end if;
  if (select role from estoque_users where id = r.user_id) <> 'ADMINISTRADOR' then
    raise exception 'FALHOU: o responsável não ficou administrador.';
  end if;

  -- E-mail repetido tem que ser recusado.
  begin
    perform criar_organizacao('Outra', 'Outra Pessoa', 'TESTE-014@exemplo.invalid', '$2a$10$abcdefghijklmnopqrstuvAbCdEfGhIjKlMnOpQrStUvWxYz01234');
    raise exception 'FALHOU: aceitou e-mail repetido (só mudando maiúsculas).';
  exception when unique_violation then
    null; -- esperado
  end;

  -- Desfaz o teste, na ordem inversa das chaves.
  delete from estoque_users where id = r.user_id;
  delete from warehouses where unit_id = r.unit_id;
  delete from units where id = r.unit_id;
  delete from organizations where id = r.organization_id;

  select count(*) into depois_org from organizations;
  if depois_org <> antes_org
     or (select count(*) from units) <> antes_unit
     or (select count(*) from warehouses) <> antes_wh
     or (select count(*) from estoque_users) <> antes_user then
    raise exception 'FALHOU: o teste deixou resto no banco.';
  end if;

  raise notice 'CONFERIDO — criar_organizacao cria organização, unidade, 2 depósitos e administrador; recusa e-mail repetido; teste desfeito sem resto.';
  raise notice 'E-mail agora é único no sistema inteiro.';
end $$;
