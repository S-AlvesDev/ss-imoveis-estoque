-- =============================================================================
--  Fase 2a — Unidades e depósitos
--
--  Hoje o estoque vive em duas colunas fixas: saldo_central e saldo_obra.
--  Foi isso que o blueprint apontou como o bloqueio estrutural, e é o que
--  impede uma unidade em Natal de existir sem alterar o código.
--
--  Esta migração cria a estrutura e COPIA os saldos para ela. Não muda nada
--  de comportamento: as colunas antigas continuam sendo a verdade operacional
--  até a Fase 2b trocar o servidor. Isso é proposital — inventário errado é
--  pior que inventário rígido.
--
--  SEGURANÇA
--  - Aditiva: nenhuma coluna existente é alterada ou removida.
--  - Idempotente.
--  - Auto-verificável: confere material a material que a soma dos depósitos
--    bate com saldo_central + saldo_obra. Se um só divergir, ABORTA.
--  - Reversível por 009_fase2_unidades_e_depositos_rollback.sql.
--
--  COMO FOI TESTADO
--  Contra PostgreSQL 18 real, sobre uma réplica com dados no formato dos
--  reais: 310 materiais com decimais, 2 saldos negativos, 120 movimentações
--  cobrindo os 10 tipos de operação existentes. Foi conferido que:
--    - as 620 linhas de saldo somam exatamente o mesmo total de antes;
--    - o saldo bate material a material, não só no total;
--    - os 2 saldos negativos foram copiados como estão, sem "corrigir";
--    - só EXCLUSÃO e UNIFICACAO ficaram sem depósito;
--    - o rollback devolve o banco ao estado anterior sem perder saldo.
--
--  E, o que mais importa, que a conferência SABE REPROVAR: rodando esta
--  migração com o backfill adulterado (Obra recebendo o saldo da Central),
--  ela abortou nos 310 materiais e a transação desfez tudo — não sobrou
--  estrutura pela metade. Uma prova que não sabe falhar não prova nada.
--
--  Pré-requisito: migração 004 (organizations).
-- =============================================================================

-- -----------------------------------------------------------------------------
--  1. Unidade — a filial. "Nova Cruz", "Natal".
-- -----------------------------------------------------------------------------
create table if not exists units (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete restrict,
  nome            text not null,
  slug            text not null,
  ativo           boolean not null default true,
  created_at      timestamptz not null default now(),
  unique (organization_id, slug)
);

create index if not exists units_org_idx on units (organization_id);
alter table units enable row level security;

insert into units (id, organization_id, nome, slug)
values ('c0000000-0000-4000-8000-000000000001',
        '5e7e0000-0000-4000-8000-000000000001', 'Nova Cruz', 'nova-cruz')
on conflict (organization_id, slug) do nothing;


-- -----------------------------------------------------------------------------
--  2. Depósito — o lugar onde o material fica.
--
--  "Central" e "Obra" deixam de ser conceito do código e viram linha desta
--  tabela. Uma unidade pode ter quantos depósitos quiser, com nome livre.
-- -----------------------------------------------------------------------------
create table if not exists warehouses (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete restrict,
  unit_id         uuid not null references units (id) on delete restrict,
  nome            text not null,
  -- Campo de TRANSIÇÃO. Enquanto o servidor pensar em central/obra, ele
  -- precisa reconhecer qual depósito é qual. Sai na Fase 2b, quando as
  -- operações passarem a referenciar warehouse_id diretamente.
  tipo            text not null check (tipo in ('CENTRAL', 'OBRA', 'OUTRO')),
  ativo           boolean not null default true,
  created_at      timestamptz not null default now(),
  unique (unit_id, nome)
);

create index if not exists warehouses_org_idx  on warehouses (organization_id);
create index if not exists warehouses_unit_idx on warehouses (unit_id);
alter table warehouses enable row level security;

insert into warehouses (id, organization_id, unit_id, nome, tipo) values
  ('d0000000-0000-4000-8000-00000000000c',
   '5e7e0000-0000-4000-8000-000000000001',
   'c0000000-0000-4000-8000-000000000001', 'Almoxarifado Central', 'CENTRAL'),
  ('d0000000-0000-4000-8000-00000000000b',
   '5e7e0000-0000-4000-8000-000000000001',
   'c0000000-0000-4000-8000-000000000001', 'Almoxarifado de Obra', 'OBRA')
on conflict (unit_id, nome) do nothing;


-- -----------------------------------------------------------------------------
--  3. Saldo por depósito
--
--  Uma linha por material em cada depósito, inclusive com saldo zero: assim o
--  saldo é sempre uma consulta, nunca uma ausência a interpretar.
-- -----------------------------------------------------------------------------
create table if not exists stock_balances (
  id              bigserial primary key,
  organization_id uuid not null references organizations (id) on delete restrict,
  warehouse_id    uuid not null references warehouses (id) on delete restrict,
  material_id     bigint not null references materials (id) on delete cascade,
  saldo           numeric not null default 0,
  updated_at      timestamptz not null default now(),
  unique (warehouse_id, material_id)
);

create index if not exists stock_balances_material_idx on stock_balances (material_id);
create index if not exists stock_balances_org_idx      on stock_balances (organization_id);
alter table stock_balances enable row level security;

-- Copia o saldo atual. As colunas antigas seguem sendo a verdade até a 2b.
insert into stock_balances (organization_id, warehouse_id, material_id, saldo)
select m.organization_id, 'd0000000-0000-4000-8000-00000000000c', m.id, coalesce(m.saldo_central, 0)
from materials m
on conflict (warehouse_id, material_id) do update set saldo = excluded.saldo, updated_at = now();

insert into stock_balances (organization_id, warehouse_id, material_id, saldo)
select m.organization_id, 'd0000000-0000-4000-8000-00000000000b', m.id, coalesce(m.saldo_obra, 0)
from materials m
on conflict (warehouse_id, material_id) do update set saldo = excluded.saldo, updated_at = now();


-- -----------------------------------------------------------------------------
--  4. Movimentação com origem e destino
--
--  Uma remessa não é "saída" nem "entrada": é a mesma quantidade saindo de um
--  depósito e entrando em outro. Modelar assim é o que permite transferência
--  entre unidades depois.
-- -----------------------------------------------------------------------------
alter table material_movements add column if not exists warehouse_origem_id  uuid references warehouses (id);
alter table material_movements add column if not exists warehouse_destino_id uuid references warehouses (id);

create index if not exists mm_origem_idx  on material_movements (warehouse_origem_id);
create index if not exists mm_destino_idx on material_movements (warehouse_destino_id);

do $$
declare
  central constant uuid := 'd0000000-0000-4000-8000-00000000000c';
  obra    constant uuid := 'd0000000-0000-4000-8000-00000000000b';
begin
  -- Entradas: material chega na Central.
  update material_movements set warehouse_destino_id = central
   where tipo_operacao in ('ENTRADA_CENTRAL', 'ENTRADA') and warehouse_destino_id is null;

  -- Saídas da Central para fora da empresa.
  update material_movements set warehouse_origem_id = central
   where tipo_operacao = 'SAIDA' and warehouse_origem_id is null;

  -- Consumo na obra.
  update material_movements set warehouse_origem_id = obra
   where tipo_operacao = 'CONSUMO_OBRA' and warehouse_origem_id is null;

  -- Transferências internas: têm os dois lados.
  update material_movements set warehouse_origem_id = central, warehouse_destino_id = obra
   where tipo_operacao = 'REMESSA_OBRA' and warehouse_origem_id is null;

  update material_movements set warehouse_origem_id = obra, warehouse_destino_id = central
   where tipo_operacao in ('DEVOLUCAO_CENTRAL', 'DEVOLUCAO') and warehouse_origem_id is null;

  -- Ajustes: correção de contagem no próprio depósito, podendo somar ou subtrair.
  update material_movements set warehouse_destino_id = central
   where tipo_operacao in ('AJUSTE_CENTRAL', 'AJUSTE MANUAL') and warehouse_destino_id is null;

  update material_movements set warehouse_destino_id = obra
   where tipo_operacao = 'AJUSTE_OBRA' and warehouse_destino_id is null;

  -- EXCLUSÃO e UNIFICACAO ficam SEM depósito, de propósito: são registros
  -- administrativos sobre o cadastro do material, não movimentação física.
  -- Atribuir um depósito a elas seria inventar dado.
end $$;


-- =============================================================================
--  CONFERÊNCIA — a parte que importa
-- =============================================================================
do $$
declare
  divergentes int;
  exemplo record;
  total_antigo numeric;
  total_novo numeric;
  sem_deposito int;
  negativos int;
begin
  -- Material a material: a soma dos depósitos tem que bater com as colunas.
  select count(*) into divergentes
  from materials m
  left join (
    select material_id, sum(saldo) s from stock_balances group by material_id
  ) b on b.material_id = m.id
  where coalesce(b.s, -1) <> coalesce(m.saldo_central, 0) + coalesce(m.saldo_obra, 0);

  if divergentes > 0 then
    select m.id, m.nome, m.saldo_central, m.saldo_obra into exemplo
    from materials m
    left join (select material_id, sum(saldo) s from stock_balances group by material_id) b
      on b.material_id = m.id
    where coalesce(b.s, -1) <> coalesce(m.saldo_central, 0) + coalesce(m.saldo_obra, 0)
    limit 1;
    raise exception 'FALHOU: % material(is) com saldo divergente. Ex.: % (%) central=% obra=%',
      divergentes, exemplo.nome, exemplo.id, exemplo.saldo_central, exemplo.saldo_obra;
  end if;

  select coalesce(sum(saldo_central), 0) + coalesce(sum(saldo_obra), 0) into total_antigo from materials;
  select coalesce(sum(saldo), 0) into total_novo from stock_balances;

  if total_antigo <> total_novo then
    raise exception 'FALHOU: total antigo % <> total novo %', total_antigo, total_novo;
  end if;

  select count(*) into sem_deposito
  from material_movements
  where warehouse_origem_id is null and warehouse_destino_id is null
    and tipo_operacao not in ('EXCLUSÃO', 'UNIFICACAO');

  select count(*) into negativos from stock_balances where saldo < 0;

  raise notice 'CONFERIDO — saldo idêntico material a material. Total: %', total_novo;
  raise notice 'Movimentações sem depósito (fora as administrativas): %', sem_deposito;
  if negativos > 0 then
    raise notice 'ATENÇÃO: % saldo(s) negativo(s) copiados como estão — já existiam antes.', negativos;
  end if;
  raise notice '---';
  raise notice 'FASE 2a CONCLUÍDA. As colunas antigas continuam sendo a verdade.';
  raise notice 'Nada muda de comportamento até a Fase 2b trocar o servidor.';
end $$;
