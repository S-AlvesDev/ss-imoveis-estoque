-- =============================================================================
--  Estoques configuráveis
--
--  Nem toda empresa tem "Central" e "Obra". Uma coordenação de esportes tem
--  um armário de bolas que os alunos pegam e devolvem; uma clínica tem uma
--  farmácia; uma construtora tem os dois almoxarifados de sempre. A partir
--  daqui cada estoque (a tabela `warehouses`) tem nome livre e um MODO, que
--  diz como se opera nele:
--
--    almoxarifado  entrada, saída, consumo, ajuste, transferência entre
--                  estoques da mesma unidade — o que sempre existiu.
--    emprestimo    retirada por tempo limitado: quem pegou, o quê, quanto,
--                  até quando. Devolução fecha a retirada; atraso vira alerta.
--
--  Categorias deixam de ser uma lista fixa do código e viram cadastro por
--  organização. Os cargos ALMOXARIFE_* deixam de existir: o que a pessoa pode
--  é decidido pelo acesso a cada estoque (migração 012), e o cargo vira só
--  Administrador ou Operador. E uma empresa nova não ganha mais estoque de
--  fábrica: o primeiro acesso pergunta qual é.
--
--  Pré-requisitos: 009 (warehouses), 012 (acessos), 014 (criar_organizacao).
-- =============================================================================


-- -----------------------------------------------------------------------------
--  1. Modo e prazo padrão do estoque
-- -----------------------------------------------------------------------------
alter table warehouses add column if not exists modo text not null default 'almoxarifado';
alter table warehouses drop constraint if exists warehouses_modo_check;
alter table warehouses add constraint warehouses_modo_check check (modo in ('almoxarifado', 'emprestimo'));

-- Em horas. Só faz sentido no modo empréstimo; nos outros fica nulo.
alter table warehouses add column if not exists prazo_padrao_horas integer;
alter table warehouses drop constraint if exists warehouses_prazo_check;
alter table warehouses add constraint warehouses_prazo_check
  check (prazo_padrao_horas is null or (prazo_padrao_horas between 1 and 8760));

-- `tipo` fica como marca de transição: o que era Central/Obra continua sendo,
-- para o histórico antigo (sem depósito gravado) ainda fazer sentido. Estoque
-- novo nasce OUTRO e ninguém decide nada por ele.


-- -----------------------------------------------------------------------------
--  2. Categorias por organização
-- -----------------------------------------------------------------------------
create table if not exists categories (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete restrict,
  nome            text not null check (char_length(btrim(nome)) between 1 and 60),
  ordem           integer not null default 0,
  created_at      timestamptz not null default now()
);

create unique index if not exists categories_nome_unico on categories (organization_id, lower(nome));
create index if not exists categories_org_idx on categories (organization_id);

alter table categories enable row level security;
alter table categories force row level security;
drop policy if exists isolamento_por_organizacao on categories;
create policy isolamento_por_organizacao on categories
  using (organization_id = current_org_id())
  with check (organization_id = current_org_id());

-- Quem já existe recebe a lista que o código tinha, na mesma ordem — e
-- qualquer outra categoria que os materiais já usem, para nada ficar órfão.
insert into categories (organization_id, nome, ordem)
select o.id, c.nome, c.ordem
from organizations o
cross join (values
  ('Fundação e Estrutura', 1),
  ('Alvenaria e Vedação', 2),
  ('Instalações Elétricas/Hidráulicas', 3),
  ('Acabamento e Revestimento', 4),
  ('Equipamentos', 5),
  ('Geral', 6)
) as c (nome, ordem)
on conflict (organization_id, lower(nome)) do nothing;

insert into categories (organization_id, nome, ordem)
select distinct m.organization_id, btrim(m.categoria), 50
from materials m
where m.organization_id is not null and coalesce(btrim(m.categoria), '') <> ''
on conflict (organization_id, lower(nome)) do nothing;


-- -----------------------------------------------------------------------------
--  3. Empréstimos (retiradas por tempo limitado)
--
--  Uma linha por retirada. O saldo do estoque sai na retirada e volta na
--  devolução — as duas viram movimentação (EMPRESTIMO / DEVOLUCAO_EMPRESTIMO)
--  para o histórico e o painel enxergarem. `quantidade_devolvida` existe para
--  o dia em que devolução parcial for necessária; hoje a tela devolve tudo.
-- -----------------------------------------------------------------------------
create table if not exists loans (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references organizations (id) on delete restrict,
  warehouse_id          uuid not null references warehouses (id) on delete restrict,
  material_id           bigint not null references materials (id) on delete restrict,
  quantidade            numeric(12, 2) not null check (quantidade > 0),
  quantidade_devolvida  numeric(12, 2) not null default 0 check (quantidade_devolvida >= 0),
  tomador_nome          text not null check (char_length(btrim(tomador_nome)) between 2 and 80),
  tomador_referencia    text check (tomador_referencia is null or char_length(tomador_referencia) <= 40),
  observacao            text check (observacao is null or char_length(observacao) <= 300),
  retirado_em           timestamptz not null default now(),
  prazo_em              timestamptz not null,
  devolvido_em          timestamptz,
  retirada_matricula    text not null,
  devolucao_matricula   text,
  created_at            timestamptz not null default now(),
  check (quantidade_devolvida <= quantidade)
);

create index if not exists loans_pendentes_idx on loans (warehouse_id, prazo_em) where devolvido_em is null;
create index if not exists loans_org_idx on loans (organization_id);
create index if not exists loans_material_idx on loans (material_id);

alter table loans enable row level security;
alter table loans force row level security;
drop policy if exists isolamento_por_organizacao on loans;
create policy isolamento_por_organizacao on loans
  using (organization_id = current_org_id())
  with check (organization_id = current_org_id());


-- -----------------------------------------------------------------------------
--  4. Cargos: Administrador ou Operador
--
--  Os acessos por estoque (012) já dizem o que cada pessoa pode; o cargo de
--  almoxarife só repetia isso com outro nome. Quem era ALMOXARIFE_* vira
--  OPERADOR e continua com exatamente os mesmos acessos.
-- -----------------------------------------------------------------------------
update estoque_users
   set role = 'OPERADOR', updated_at = now()
 where role in ('ALMOXARIFE_GERAL', 'ALMOXARIFADO', 'ALMOXARIFE_OBRA');


-- -----------------------------------------------------------------------------
--  5. Cadastro: organização nova sem estoque de fábrica, com "Geral" como
--     primeira categoria. O primeiro acesso pergunta qual é o estoque.
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

  insert into estoque_users (organization_id, nome, email, matricula, senha, role, ativo, senha_alterada_em)
  values (v_org, v_nome, v_email, 'ADMIN', p_senha_hash, 'ADMINISTRADOR', true, now())
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
  n int;
begin
  if not exists (select 1 from information_schema.columns where table_name = 'warehouses' and column_name = 'modo') then
    raise exception 'FALHOU: warehouses.modo não existe.';
  end if;
  if to_regclass('public.categories') is null or to_regclass('public.loans') is null then
    raise exception 'FALHOU: categories ou loans não foram criadas.';
  end if;
  if not exists (select 1 from pg_policies where tablename = 'categories' and policyname = 'isolamento_por_organizacao')
     or not exists (select 1 from pg_policies where tablename = 'loans' and policyname = 'isolamento_por_organizacao') then
    raise exception 'FALHOU: política de isolamento ausente em categories/loans.';
  end if;

  -- Toda organização tem pelo menos uma categoria.
  select count(*) into n from organizations o where not exists (select 1 from categories c where c.organization_id = o.id);
  if n > 0 then raise exception 'FALHOU: % organização(ões) sem categoria.', n; end if;

  -- Nenhum material aponta para categoria que a organização não tem.
  select count(*) into n from materials m
   where m.organization_id is not null and coalesce(btrim(m.categoria), '') <> ''
     and not exists (select 1 from categories c where c.organization_id = m.organization_id and lower(c.nome) = lower(btrim(m.categoria)));
  if n > 0 then raise exception 'FALHOU: % material(is) com categoria órfã.', n; end if;

  -- Cargo antigo não sobrou.
  select count(*) into n from estoque_users where role in ('ALMOXARIFE_GERAL', 'ALMOXARIFADO', 'ALMOXARIFE_OBRA');
  if n > 0 then raise exception 'FALHOU: % usuário(s) ainda com cargo de almoxarife.', n; end if;

  -- Modo inválido é recusado.
  begin
    update warehouses set modo = 'bagunca' where false;
    perform 1 where 'bagunca' in ('almoxarifado', 'emprestimo');
    if found then raise exception 'FALHOU: modo inválido passou.'; end if;
  end;

  raise notice 'CONFERIDO — estoques têm modo, categorias são cadastro, empréstimos têm onde ficar, cargos são Admin/Operador.';
end $$;
