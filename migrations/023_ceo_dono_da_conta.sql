-- =============================================================================
--  023 — CEO: quem criou a conta é o dono dela
--
--  Um cargo novo, único por organização: `CEO`. É a pessoa que cadastrou o
--  e-mail na criação da conta. Só o CEO assina, troca ou cancela o plano,
--  recebe recibos, lembretes e notas fiscais, e pode passar a titularidade
--  a outro administrador. Administradores continuam administrando a
--  operação (usuários, estoques, identidade).
--
--  Contas que já existem ganham como CEO o primeiro administrador criado —
--  na Imobiliária São Severino, o usuário `admin`; nas criadas pelo site, a
--  pessoa do cadastro.
-- =============================================================================

-- Recibo (não fiscal) enviado por e-mail a cada pagamento aprovado: quando foi.
alter table pagamentos add column if not exists recibo_enviado_em timestamptz;

-- Um CEO por organização, nem mais nem menos (o "menos" é garantido abaixo).
create unique index if not exists estoque_users_um_ceo_por_org on estoque_users (organization_id) where role = 'CEO';

-- Quem já existe: o administrador mais antigo de cada organização vira CEO.
update estoque_users u
   set role = 'CEO', updated_at = now()
  from (
    select distinct on (organization_id) id
      from estoque_users
     where role in ('ADMINISTRADOR', 'ADMINISTRATIVO')
       and organization_id not in (select organization_id from estoque_users where role = 'CEO')
     order by organization_id, (role = 'ADMINISTRADOR') desc, created_at asc, id asc
  ) primeiro
 where u.id = primeiro.id;

-- Conta nova: a pessoa do cadastro nasce CEO.
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
    raise exception 'A senha precisa chegar já protegida (bcrypt).' using errcode = 'check_violation';
  end if;
  if exists (select 1 from estoque_users where lower(email) = v_email) then
    raise exception 'Já existe uma conta com este e-mail.' using errcode = 'unique_violation';
  end if;

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

  -- Sem estoque de fábrica: o primeiro acesso pergunta nome e modo.
  insert into categories (organization_id, nome, ordem) values (v_org, 'Geral', 1);

  -- A pessoa do cadastro é o CEO: dona da conta e da cobrança.
  insert into estoque_users (organization_id, nome, email, matricula, senha, role, ativo, senha_alterada_em)
  values (v_org, v_nome, v_email, 'ADMIN', p_senha_hash, 'CEO', true, now())
  returning id into v_user;

  return query select v_org, v_unit, v_user, v_slug;
end $$;

revoke all on function criar_organizacao(text, text, text, text, text) from public;
revoke all on function criar_organizacao(text, text, text, text, text) from anon;
revoke all on function criar_organizacao(text, text, text, text, text) from authenticated;
grant execute on function criar_organizacao(text, text, text, text, text) to service_role;

-- =============================================================================
--  CONFERÊNCIA
-- =============================================================================
do $$
declare
  sem_ceo int;
begin
  select count(*) into sem_ceo
    from organizations o
   where exists (select 1 from estoque_users u where u.organization_id = o.id and u.role in ('ADMINISTRADOR', 'ADMINISTRATIVO', 'CEO'))
     and not exists (select 1 from estoque_users u where u.organization_id = o.id and u.role = 'CEO');
  if sem_ceo > 0 then
    raise exception 'FALHOU: % organização(ões) com administrador mas sem CEO.', sem_ceo;
  end if;
  if (select role from estoque_users where organization_id = '5e7e0000-0000-4000-8000-000000000001' and matricula = 'admin') is distinct from 'CEO' then
    raise exception 'FALHOU: o usuário admin da São Severino não virou CEO.';
  end if;
  raise notice 'OK: CEO definido em toda organização; contas novas nascem com CEO.';
end $$;
