-- =============================================================================
--  Desfaz a Fase 2d: recria saldo_central e saldo_obra a partir dos depósitos
--  da unidade original.
--
--  Serve para dois cenários: a 013 rodou antes do deploy (o servidor antigo
--  precisa das colunas), ou é preciso voltar o servidor para uma versão que
--  ainda as usa. Nos dois, os valores vêm de stock_balances — que é a verdade
--  desde a 011 — então nada se perde.
-- =============================================================================

do $$
declare
  original uuid;
  n int;
begin
  select id into original from units order by created_at asc limit 1;
  if original is null then
    raise exception 'Nenhuma unidade cadastrada.';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'materials' and column_name = 'saldo_central'
  ) then
    execute 'alter table materials add column saldo_central numeric(14,2) not null default 0';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'materials' and column_name = 'saldo_obra'
  ) then
    execute 'alter table materials add column saldo_obra numeric(14,2) not null default 0';
  end if;

  execute format($q$
    update materials m set
      saldo_central = coalesce((
        select b.saldo from stock_balances b join warehouses w on w.id = b.warehouse_id
        where b.material_id = m.id and w.unit_id = %L and w.tipo = 'CENTRAL' limit 1), 0),
      saldo_obra = coalesce((
        select b.saldo from stock_balances b join warehouses w on w.id = b.warehouse_id
        where b.material_id = m.id and w.unit_id = %L and w.tipo = 'OBRA' limit 1), 0)
  $q$, original, original);
  get diagnostics n = row_count;

  raise notice 'Colunas recriadas e preenchidas em % material(is) a partir da unidade original.', n;
end $$;
