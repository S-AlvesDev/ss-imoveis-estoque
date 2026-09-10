-- =============================================================================
--  Fase 1b — remove o DEFAULT de organization_id
--
--  A migração 004 pôs um DEFAULT na coluna para que o servidor de então, que
--  não conhecia organization_id, continuasse gravando sem quebrar. Isso já
--  cumpriu o papel: o servidor agora informa a organização em toda escrita.
--
--  Manter o default a partir daqui é perigoso. Ele transforma "esqueci de
--  informar a organização" em "gravou silenciosamente na São Severino" — que é
--  exatamente o vazamento que estamos tentando impedir, só que na direção da
--  escrita. Sem o default, esse esquecimento vira erro na hora.
--
--  PRÉ-REQUISITO: o código da Fase 1b precisa estar NO AR antes desta migração.
--  Se rodar antes, o servidor antigo passa a falhar em toda gravação.
--
--  Reversível por 007_remove_default_de_organizacao_rollback.sql.
-- =============================================================================

do $$
declare
  t text;
  removidos int := 0;
begin
  foreach t in array array[
    'materials', 'material_movements', 'support_tickets',
    'support_ticket_materials', 'support_ticket_comments'
  ] loop
    if to_regclass(t) is null then continue; end if;

    execute format('alter table %I alter column organization_id drop default', t);
    removidos := removidos + 1;
    raise notice 'OK — default removido de %', t;
  end loop;

  raise notice 'Defaults removidos: %', removidos;
end $$;


-- -----------------------------------------------------------------------------
--  Conferência: a coluna segue obrigatória, mas sem valor automático.
-- -----------------------------------------------------------------------------
do $$
declare
  com_default int;
  anulavel int;
begin
  select count(*) into com_default
  from information_schema.columns
  where table_schema = 'public'
    and column_name = 'organization_id'
    and column_default is not null
    and table_name in ('materials', 'material_movements', 'support_tickets',
                       'support_ticket_materials', 'support_ticket_comments');

  select count(*) into anulavel
  from information_schema.columns
  where table_schema = 'public'
    and column_name = 'organization_id'
    and is_nullable = 'YES'
    and table_name in ('materials', 'material_movements', 'support_tickets',
                       'support_ticket_materials', 'support_ticket_comments');

  if com_default > 0 then
    raise exception 'FALHOU: % tabela(s) ainda têm default', com_default;
  end if;
  if anulavel > 0 then
    raise exception 'FALHOU: % tabela(s) aceitam organização nula', anulavel;
  end if;

  raise notice 'CONFERIDO — nenhuma tabela grava organização por conta própria.';
  raise notice 'A partir daqui, escrita sem organização é erro, não é silêncio.';
end $$;
