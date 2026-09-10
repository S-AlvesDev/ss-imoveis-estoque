-- =============================================================================
--  Desfaz a Fase 1a.
--
--  Remove a estrutura multiempresa e devolve o banco ao estado anterior.
--  Nenhum dado de estoque é perdido: apenas a marcação de organização sai.
-- =============================================================================

-- 1. Desliga as políticas antes de remover a coluna que elas usam.
do $$
declare t text;
begin
  foreach t in array array[
    'materials', 'material_movements', 'support_tickets',
    'support_ticket_materials', 'support_ticket_comments'
  ] loop
    if to_regclass(t) is null then continue; end if;
    execute format('drop policy if exists isolamento_por_organizacao on %I', t);
    execute format('alter table %I no force row level security', t);
    -- Suporte volta a ter RLS ligado sem policy, como a migração 001 deixou.
    if t like 'support%' then
      execute format('alter table %I enable row level security', t);
    else
      execute format('alter table %I disable row level security', t);
    end if;
  end loop;
end $$;

-- 2. Remove a coluna de cada tabela.
do $$
declare t text;
begin
  foreach t in array array[
    'materials', 'material_movements', 'support_tickets',
    'support_ticket_materials', 'support_ticket_comments'
  ] loop
    if to_regclass(t) is null then continue; end if;
    execute format('drop index if exists %I', t || '_org_idx');
    execute format('alter table %I drop column if exists organization_id', t);
  end loop;
end $$;

-- 3. Remove a estrutura de contas.
drop function if exists current_org_id();
drop table if exists estoque_user_orgs;
drop table if exists organizations;

do $$
begin
  raise notice 'Fase 1a revertida. Dados de estoque intactos.';
end $$;
