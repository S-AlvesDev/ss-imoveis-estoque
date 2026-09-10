-- =============================================================================
--  Desfaz o gatilho de sincronia.
--
--  Nenhum saldo é perdido: saldo_central e saldo_obra nunca foram tocados pelo
--  gatilho — ele só escrevia no espelho. stock_balances continua existindo com
--  os valores da última sincronia; a partir daqui ele para de acompanhar.
-- =============================================================================

drop trigger if exists sincroniza_saldo_ao_criar   on materials;
drop trigger if exists sincroniza_saldo_ao_alterar on materials;

drop function if exists sincroniza_saldo_por_deposito();
drop function if exists deposito_do_tipo(uuid, text);

do $$
begin
  raise notice 'Gatilho removido. stock_balances congelou na última sincronia.';
  raise notice 'A verdade operacional segue em materials.saldo_central/saldo_obra.';
end $$;
