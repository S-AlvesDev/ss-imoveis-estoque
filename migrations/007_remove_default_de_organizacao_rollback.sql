-- =============================================================================
--  Devolve o DEFAULT de organization_id.
--
--  Use se for preciso reverter o código da Fase 1b: sem o default, o servidor
--  anterior — que não informa a organização — falharia em toda gravação.
-- =============================================================================

do $$
declare t text;
begin
  foreach t in array array[
    'materials', 'material_movements', 'support_tickets',
    'support_ticket_materials', 'support_ticket_comments'
  ] loop
    if to_regclass(t) is null then continue; end if;
    execute format(
      'alter table %I alter column organization_id set default %L',
      t, '5e7e0000-0000-4000-8000-000000000001');
    raise notice 'default devolvido a %', t;
  end loop;
end $$;
