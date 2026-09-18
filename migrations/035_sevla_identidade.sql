-- =============================================================================
--  035 — SEVLA Identity: uma conta por pessoa, ligada ao que já existe
--
--  A SEVLA INFINITY é a empresa-mãe do Stok Aí e do Atende Aí. Cada produto
--  tem a própria tabela de usuários (estoque_users, atende_usuarios) — e
--  isso continua: elas são a "participação" da pessoa em cada produto
--  (empresa + papel). O que nasce aqui é a pessoa em si: sevla_contas, uma
--  linha por e-mail, apontada pelas duas tabelas via sevla_conta_id.
--
--  Nada é apagado, nenhuma senha muda. O hash bcrypt da conta SEVLA é
--  copiado do produto (os dois já usam bcrypt); quando a pessoa tinha senhas
--  diferentes nos dois produtos, o login pela SEVLA aceita qualquer uma e
--  converge na primeira entrada. Quem não tem e-mail (matrícula antiga do
--  Stok) não ganha conta — continua entrando por matrícula, como sempre.
--
--  Um gatilho mantém a ligação viva: usuário novo (ou e-mail trocado) em
--  qualquer produto encontra ou cria a conta SEVLA sozinho.
-- =============================================================================

create table if not exists sevla_contas (
  id             uuid primary key default gen_random_uuid(),
  email          text not null,
  nome           text not null,
  -- bcrypt; nulo até algum produto emprestar o hash (o login cai no hash do produto)
  senha_hash     text,
  criado_em      timestamptz not null default now(),
  ultimo_acesso  timestamptz
);

create unique index if not exists sevla_contas_email_unico on sevla_contas (lower(email));

-- Só o servidor (chave de serviço) lê e escreve identidades.
alter table sevla_contas enable row level security;
alter table sevla_contas force row level security;
revoke all on sevla_contas from anon, authenticated;

alter table estoque_users   add column if not exists sevla_conta_id uuid references sevla_contas (id) on delete set null;
alter table atende_usuarios add column if not exists sevla_conta_id uuid references sevla_contas (id) on delete set null;
create index if not exists estoque_users_sevla_idx   on estoque_users (sevla_conta_id);
create index if not exists atende_usuarios_sevla_idx on atende_usuarios (sevla_conta_id);

-- -----------------------------------------------------------------------------
--  Encontra ou cria a conta de um e-mail; empresta o hash se a conta não tem.
-- -----------------------------------------------------------------------------
create or replace function sevla_conta_para(p_email text, p_nome text, p_senha_hash text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(p_email));
  v_id    uuid;
begin
  if v_email is null or v_email = '' then
    return null;
  end if;
  select id into v_id from sevla_contas where lower(email) = v_email;
  if v_id is null then
    insert into sevla_contas (email, nome, senha_hash)
    values (v_email, coalesce(nullif(trim(p_nome), ''), v_email), case when p_senha_hash ~ '^\$2[aby]\$' then p_senha_hash else null end)
    on conflict (lower(email)) do update set nome = sevla_contas.nome
    returning id into v_id;
  elsif p_senha_hash ~ '^\$2[aby]\$' then
    update sevla_contas set senha_hash = p_senha_hash where id = v_id and senha_hash is null;
  end if;
  return v_id;
end;
$$;

revoke all on function sevla_conta_para(text, text, text) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
--  Gatilhos: usuário novo ou e-mail trocado → liga à conta SEVLA
-- -----------------------------------------------------------------------------
create or replace function sevla_vincular_estoque_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is null or trim(new.email) = '' then
    return new;
  end if;
  if tg_op = 'INSERT' or new.sevla_conta_id is null or new.email is distinct from old.email then
    new.sevla_conta_id := sevla_conta_para(new.email, new.nome, new.senha);
  end if;
  return new;
end;
$$;

drop trigger if exists sevla_vincular on estoque_users;
create trigger sevla_vincular before insert or update of email, sevla_conta_id on estoque_users
  for each row execute function sevla_vincular_estoque_user();

create or replace function sevla_vincular_atende_usuario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is null or trim(new.email) = '' then
    return new;
  end if;
  if tg_op = 'INSERT' or new.sevla_conta_id is null or new.email is distinct from old.email then
    new.sevla_conta_id := sevla_conta_para(new.email, new.nome, new.senha);
  end if;
  return new;
end;
$$;

drop trigger if exists sevla_vincular on atende_usuarios;
create trigger sevla_vincular before insert or update of email, sevla_conta_id on atende_usuarios
  for each row execute function sevla_vincular_atende_usuario();

-- -----------------------------------------------------------------------------
--  Backfill: todo mundo que tem e-mail ganha (ou encontra) a conta
--  O Stok Aí vai primeiro: o hash dele tem preferência.
-- -----------------------------------------------------------------------------
update estoque_users u
   set sevla_conta_id = sevla_conta_para(u.email, u.nome, u.senha)
 where u.sevla_conta_id is null and u.email is not null and trim(u.email) <> '';

update atende_usuarios a
   set sevla_conta_id = sevla_conta_para(a.email, a.nome, a.senha)
 where a.sevla_conta_id is null and a.email is not null and trim(a.email) <> '';

-- -----------------------------------------------------------------------------
--  Os acessos de uma conta: produto × organização × papel (a "participação")
-- -----------------------------------------------------------------------------
create or replace view sevla_acessos
with (security_invoker = true)
as
  select u.sevla_conta_id           as conta_id,
         'stok'::text               as produto,
         u.organization_id          as organization_id,
         o.nome                     as organizacao,
         u.id                       as usuario_id,
         u.role                     as papel,
         u.ativo                    as ativo,
         u.nome                     as nome,
         u.matricula                as matricula,
         null::uuid                 as empresa_id
    from estoque_users u
    join organizations o on o.id = u.organization_id
   where u.sevla_conta_id is not null
  union all
  select a.sevla_conta_id,
         'atende'::text,
         e.organization_id,
         e.nome,
         a.id,
         a.papel,
         a.ativo,
         a.nome,
         null::text,
         e.id
    from atende_usuarios a
    join atende_empresas e on e.id = a.empresa_id
   where a.sevla_conta_id is not null;

revoke all on sevla_acessos from anon, authenticated;

-- =============================================================================
--  CONFERÊNCIA
-- =============================================================================
do $$
declare
  v_sem_conta int;
begin
  if to_regclass('public.sevla_contas') is null then
    raise exception 'FALHOU: sevla_contas não existe.';
  end if;
  select count(*) into v_sem_conta from estoque_users where email is not null and trim(email) <> '' and sevla_conta_id is null;
  if v_sem_conta > 0 then
    raise exception 'FALHOU: % usuários do Stok Aí com e-mail ficaram sem conta SEVLA.', v_sem_conta;
  end if;
  select count(*) into v_sem_conta from atende_usuarios where sevla_conta_id is null;
  if v_sem_conta > 0 then
    raise exception 'FALHOU: % usuários do Atende Aí ficaram sem conta SEVLA.', v_sem_conta;
  end if;
  raise notice 'OK: 035 aplicada — % contas SEVLA.', (select count(*) from sevla_contas);
end $$;
