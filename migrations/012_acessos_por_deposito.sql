-- =============================================================================
--  Acessos por depósito
--
--  Hoje o CARGO decide tudo: ALMOXARIFE_OBRA vê a Obra, ALMOXARIFE_GERAL vê a
--  Central, e todo mundo vê todas as unidades. Com mais de uma unidade isso
--  não serve — quem trabalha em Natal não tem por que mexer em Nova Cruz.
--
--  A partir daqui a pessoa é ATRIBUÍDA a depósitos, com um nível em cada:
--    OPERA     registra entrada, consumo, remessa, ajuste
--    CONSULTA  só vê
--  Tudo deriva disso: acesso à unidade = ter algum depósito dela; a tela do
--  Central aparece para quem tem o Central daquela unidade; e o servidor
--  passa a perguntar "essa pessoa opera esse depósito?" em vez de "qual o
--  cargo?". Administrador continua vendo e fazendo tudo.
--
--  Os cargos atuais viram atribuições na unidade ORIGINAL de cada
--  organização (a mais antiga). Ninguém perde acesso ao que tem hoje.
--
--  Pré-requisito: migração 009.
-- =============================================================================

create table if not exists estoque_user_warehouses (
  id              bigserial primary key,
  organization_id uuid not null references organizations (id) on delete restrict,
  user_id         bigint not null references estoque_users (id) on delete cascade,
  warehouse_id    uuid not null references warehouses (id) on delete cascade,
  nivel           text not null check (nivel in ('OPERA', 'CONSULTA')),
  created_at      timestamptz not null default now(),
  unique (user_id, warehouse_id)
);

create index if not exists euw_user_idx on estoque_user_warehouses (user_id);
create index if not exists euw_warehouse_idx on estoque_user_warehouses (warehouse_id);
create index if not exists euw_org_idx on estoque_user_warehouses (organization_id);

alter table estoque_user_warehouses enable row level security;
alter table estoque_user_warehouses force row level security;
drop policy if exists isolamento_por_organizacao on estoque_user_warehouses;
create policy isolamento_por_organizacao on estoque_user_warehouses
  using (organization_id = current_org_id())
  with check (organization_id = current_org_id());


-- -----------------------------------------------------------------------------
--  Cargos viram atribuições, na unidade mais antiga de cada organização.
--  Só toca em quem ainda não tem NENHUMA atribuição — rodar de novo não
--  sobrescreve o que o admin já ajustou na tela.
-- -----------------------------------------------------------------------------
do $$
declare
  n int := 0;
  parcial int;
begin
  -- Central para quem cuida da Central.
  insert into estoque_user_warehouses (organization_id, user_id, warehouse_id, nivel)
  select u.organization_id, u.id, w.id, 'OPERA'
  from estoque_users u
  join lateral (
    select un.id from units un
    where un.organization_id = u.organization_id
    order by un.created_at asc limit 1
  ) primeira on true
  join warehouses w on w.unit_id = primeira.id and w.tipo = 'CENTRAL' and w.ativo
  where u.role in ('ALMOXARIFE_GERAL', 'ALMOXARIFADO')
    and not exists (select 1 from estoque_user_warehouses x where x.user_id = u.id)
  on conflict (user_id, warehouse_id) do nothing;
  get diagnostics parcial = row_count; n := n + parcial;

  -- Obra para quem cuida da Obra.
  insert into estoque_user_warehouses (organization_id, user_id, warehouse_id, nivel)
  select u.organization_id, u.id, w.id, 'OPERA'
  from estoque_users u
  join lateral (
    select un.id from units un
    where un.organization_id = u.organization_id
    order by un.created_at asc limit 1
  ) primeira on true
  join warehouses w on w.unit_id = primeira.id and w.tipo = 'OBRA' and w.ativo
  where u.role = 'ALMOXARIFE_OBRA'
    and not exists (select 1 from estoque_user_warehouses x where x.user_id = u.id)
  on conflict (user_id, warehouse_id) do nothing;
  get diagnostics parcial = row_count; n := n + parcial;

  raise notice 'Cargos convertidos em % atribuição(ões).', n;
end $$;


-- =============================================================================
--  CONFERÊNCIA — ninguém que operava ficou sem acesso
-- =============================================================================
do $$
declare
  sem_acesso int;
  exemplo text;
  total int;
begin
  select count(*), min(u.nome) into sem_acesso, exemplo
  from estoque_users u
  where u.ativo
    and u.role not in ('ADMINISTRADOR', 'ADMINISTRATIVO')
    and not exists (select 1 from estoque_user_warehouses x where x.user_id = u.id);

  if sem_acesso > 0 then
    raise exception 'FALHOU: % operador(es) ativo(s) sem nenhum depósito (ex.: %). Cargo desconhecido? Confira estoque_users.role.', sem_acesso, exemplo;
  end if;

  if not exists (select 1 from pg_policies where tablename = 'estoque_user_warehouses') then
    raise exception 'FALHOU: estoque_user_warehouses sem política de isolamento.';
  end if;

  select count(*) into total from estoque_user_warehouses;
  raise notice 'CONFERIDO — todo operador ativo tem ao menos um depósito. % atribuição(ões) no total.', total;
  raise notice 'A partir do próximo deploy, a atribuição manda; o cargo só rotula.';
end $$;
