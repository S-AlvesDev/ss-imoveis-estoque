-- =============================================================================
--  036 — Toda empresa do Atende Aí tem uma organização SEVLA
--
--  `organizations` passa a ser a ORGANIZAÇÃO do ecossistema (a empresa
--  cliente), não só a conta do Stok Aí. Empresa que nasceu direto no Atende
--  ganha uma organização própria (nome e slug dela; sem plano do Stok — o
--  Stok não vê nada nela porque não há estoque_users). Daqui para a frente,
--  um gatilho cria a organização junto com a empresa.
--
--  Isto permite que assinatura, "Minha SEVLA" e o SSO falem de UMA empresa,
--  qualquer que seja o produto por onde ela chegou.
-- =============================================================================

-- Slug livre em organizations: o da empresa, ou 'atende-<slug>', ou com sufixo numérico.
create or replace function sevla_slug_de_organizacao(p_base text)
returns text
language plpgsql
as $$
declare
  v_base text := coalesce(nullif(regexp_replace(lower(p_base), '[^a-z0-9]+', '-', 'g'), ''), 'empresa');
  v_slug text;
  i int := 0;
begin
  v_base := trim(both '-' from v_base);
  if v_base = '' then v_base := 'empresa'; end if;
  loop
    v_slug := case when i = 0 then v_base when i = 1 then 'atende-' || v_base else 'atende-' || v_base || '-' || i end;
    exit when not exists (select 1 from organizations where slug = v_slug);
    i := i + 1;
    exit when i > 200;
  end loop;
  return v_slug;
end;
$$;

-- Gatilho: empresa nova sem organização → cria uma.
create or replace function atende_empresa_garante_organizacao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
begin
  if new.organization_id is null then
    insert into organizations (nome, slug) values (new.nome, sevla_slug_de_organizacao(new.slug)) returning id into v_org;
    new.organization_id := v_org;
  end if;
  return new;
end;
$$;

drop trigger if exists atende_empresa_garante_organizacao on atende_empresas;
create trigger atende_empresa_garante_organizacao before insert on atende_empresas
  for each row execute function atende_empresa_garante_organizacao();

-- Backfill das empresas que já existem sem organização.
do $$
declare
  r record;
  v_org uuid;
begin
  for r in select id, nome, slug from atende_empresas where organization_id is null loop
    insert into organizations (nome, slug) values (r.nome, sevla_slug_de_organizacao(r.slug)) returning id into v_org;
    update atende_empresas set organization_id = v_org where id = r.id;
  end loop;
end $$;

-- =============================================================================
--  CONFERÊNCIA
-- =============================================================================
do $$
declare
  v_sem int;
begin
  select count(*) into v_sem from atende_empresas where organization_id is null;
  if v_sem > 0 then
    raise exception 'FALHOU: % empresas do Atende Aí sem organização.', v_sem;
  end if;
  raise notice 'OK: 036 aplicada — toda empresa do Atende Aí tem organização.';
end $$;
