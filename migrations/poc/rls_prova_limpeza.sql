-- =============================================================================
--  Remove a prova de conceito de RLS.
--
--  Apaga somente o schema `poc`, criado exclusivamente para a demonstração.
--  Nenhuma tabela real do sistema é tocada.
-- =============================================================================

drop schema if exists poc cascade;

do $$
begin
  raise notice 'Schema poc removido. Nada mais foi alterado.';
end $$;
