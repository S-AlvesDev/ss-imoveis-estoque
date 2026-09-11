-- =============================================================================
--  Fase 2d — as colunas antigas de saldo saem
--
--  saldo_central e saldo_obra em `materials` foram a verdade operacional
--  desde o começo do sistema. A Fase 2 copiou o que elas tinham para
--  stock_balances (009), manteve as duas em sincronia (010, 011), virou o
--  servidor e o front para ler e gravar por depósito, e por fim tirou do
--  servidor a última linha que ainda as escrevia.
--
--  Elas já não são lidas nem gravadas por ninguém. Ficar seria pior que
--  sair: duas unidades convivendo com um espelho que só enxerga uma delas foi
--  o que produziu o último bug latente (o espelho escolhendo "o primeiro
--  Central por ordem de nome").
--
--  QUANDO RODAR
--  DEPOIS do deploy do servidor sem as colunas. O servidor anterior ainda
--  escrevia nelas a cada movimentação; sem as colunas, cada movimentação
--  falharia até o deploy. Se rodar cedo, o rollback recria as colunas com
--  os valores certos e o sistema volta a funcionar.
--
--  CONFERÊNCIA ANTES DE DERRUBAR
--  Última chance de pegar qualquer deriva: as colunas têm que bater com os
--  depósitos da unidade original, material a material. Se um só divergir,
--  ABORTA e não derruba nada.
--
--  Pré-requisito: migração 011 e deploy da Fase 2d.
-- =============================================================================

do $$
declare
  divergentes int;
  exemplo record;
  sem_linha int;
  original uuid;
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'materials' and column_name = 'saldo_central'
  ) then
    raise notice 'Colunas já removidas — nada a fazer.';
    return;
  end if;

  -- A unidade original é a mais antiga: foi para os depósitos dela que a 009
  -- copiou as colunas. Por data, nunca por nome.
  select id into original from units order by created_at asc limit 1;
  if original is null then
    raise exception 'Nenhuma unidade cadastrada — rode a migração 009 antes.';
  end if;

  -- Material a material: Central + Obra da unidade original = colunas.
  select count(*) into divergentes
  from materials m
  left join (
    select b.material_id, sum(b.saldo) s
    from stock_balances b
    join warehouses w on w.id = b.warehouse_id
    where w.unit_id = original
    group by b.material_id
  ) b on b.material_id = m.id
  where coalesce(b.s, -1) <> coalesce(m.saldo_central, 0) + coalesce(m.saldo_obra, 0);

  if divergentes > 0 then
    select m.id, m.nome, m.saldo_central, m.saldo_obra into exemplo
    from materials m
    left join (
      select b.material_id, sum(b.saldo) s
      from stock_balances b join warehouses w on w.id = b.warehouse_id
      where w.unit_id = original group by b.material_id
    ) b on b.material_id = m.id
    where coalesce(b.s, -1) <> coalesce(m.saldo_central, 0) + coalesce(m.saldo_obra, 0)
    limit 1;
    raise exception 'FALHOU: % material(is) com colunas divergentes dos depósitos da unidade original. Ex.: % (%) central=% obra=%. Não é seguro derrubar.',
      divergentes, exemplo.nome, exemplo.id, exemplo.saldo_central, exemplo.saldo_obra;
  end if;

  -- Todo material tem linha na unidade original? Sem isso, o rollback não
  -- teria de onde reconstruir a coluna.
  select count(*) into sem_linha
  from materials m
  where not exists (
    select 1 from stock_balances b join warehouses w on w.id = b.warehouse_id
    where b.material_id = m.id and w.unit_id = original
  );
  if sem_linha > 0 then
    raise exception 'FALHOU: % material(is) sem linha de saldo na unidade original.', sem_linha;
  end if;

  raise notice 'CONFERIDO — colunas batem com os depósitos da unidade original em todos os materiais. Derrubando.';
end $$;

alter table materials drop column if exists saldo_central;
alter table materials drop column if exists saldo_obra;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'materials' and column_name in ('saldo_central', 'saldo_obra')
  ) then
    raise exception 'FALHOU: colunas ainda existem.';
  end if;
  raise notice 'FASE 2 CONCLUÍDA. O saldo vive em stock_balances, por depósito, e em mais lugar nenhum.';
end $$;
