-- =============================================================================
--  Desfaz a Fase 2a.
--
--  Remove a estrutura de unidades e depósitos. Nenhum saldo é perdido: as
--  colunas saldo_central e saldo_obra nunca foram tocadas e continuam sendo a
--  verdade operacional.
-- =============================================================================

do $$
declare n int;
begin
  if to_regclass('stock_balances') is not null then
    select count(*) into n from stock_balances;
    raise notice 'Removendo % linha(s) de saldo por depósito.', n;
    raise notice 'Os saldos originais seguem em materials.saldo_central/saldo_obra.';
  end if;
end $$;

alter table material_movements drop column if exists warehouse_origem_id;
alter table material_movements drop column if exists warehouse_destino_id;

drop table if exists stock_balances;
drop table if exists warehouses;
drop table if exists units;

do $$
begin
  raise notice 'Fase 2a revertida. Saldos intactos.';
end $$;
