-- =============================================================================
--  Fase 1b — políticas que faltavam
--
--  As migrações 004 e 006 ligaram RLS em `organizations`, `estoque_user_orgs` e
--  `estoque_users` sem criar política nenhuma. Com service_role isso não fazia
--  diferença — a chave ignora RLS. Mas no momento em que o acesso passa a usar
--  a chave anônima, "RLS ligado e sem política" significa ZERO linhas visíveis.
--
--  Medido antes desta migração, lendo com a chave anônima + token válido:
--
--      materials            314  OK
--      material_movements  1678  OK
--      support_tickets        8  OK
--      estoque_users          0  <- lista de funcionários sumiria
--      organizations          0
--      estoque_user_orgs      0
--
--  Sem isto, ligar o SUPABASE_JWT_SECRET faria o histórico mostrar matrículas
--  no lugar dos nomes.
--
--  O login NÃO depende destas políticas: ele roda com service_role, porque
--  precisa achar a pessoa antes de existir uma organização no contexto.
--  Rotas de autenticação usam acesso privilegiado; rotas de dados usam acesso
--  com escopo. Essa divisão é proposital.
-- =============================================================================

-- -----------------------------------------------------------------------------
--  Pessoas: cada organização enxerga a própria equipe
-- -----------------------------------------------------------------------------
do $$
begin
  if to_regclass('estoque_users') is null then
    raise exception 'estoque_users não existe — rode a migração 006 antes.';
  end if;

  execute 'alter table estoque_users force row level security';
  execute 'drop policy if exists isolamento_por_organizacao on estoque_users';
  execute 'create policy isolamento_por_organizacao on estoque_users
             using (organization_id = current_org_id())
             with check (organization_id = current_org_id())';
  raise notice 'OK — política criada em estoque_users';
end $$;


-- -----------------------------------------------------------------------------
--  A própria conta: cada organização enxerga só a si mesma
--
--  Repare que a coluna aqui é `id`, não `organization_id`: esta É a tabela de
--  organizações. Uma conta nunca deve conseguir listar as outras — isso é
--  metadado do produto, não dado do cliente.
-- -----------------------------------------------------------------------------
do $$
begin
  execute 'alter table organizations force row level security';
  execute 'drop policy if exists ve_a_propria_organizacao on organizations';
  execute 'create policy ve_a_propria_organizacao on organizations
             using (id = current_org_id())';
  raise notice 'OK — política criada em organizations';
end $$;


-- -----------------------------------------------------------------------------
--  Vínculos: mantidos fechados de propósito
--
--  `estoque_user_orgs` nasceu na 004 para mapear matrícula -> organização. A
--  migração 006 trouxe `organization_id` para dentro de `estoque_users`, então
--  este mapa ficou redundante. Nenhuma rota o consulta.
--
--  Fica sem política (invisível pela chave anônima) até ser removido de vez.
--  Se alguma rota futura precisar dele, é sinal de que a modelagem regrediu.
-- -----------------------------------------------------------------------------


-- -----------------------------------------------------------------------------
--  Conferência
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
  sem_politica text[] := '{}';
begin
  foreach t in array array[
    'materials', 'material_movements', 'support_tickets',
    'support_ticket_materials', 'support_ticket_comments',
    'estoque_users', 'organizations'
  ] loop
    if to_regclass(t) is null then continue; end if;
    if not exists (select 1 from pg_policies where tablename = t) then
      sem_politica := sem_politica || t;
    end if;
  end loop;

  if array_length(sem_politica, 1) > 0 then
    raise exception 'FALHOU: sem política em %', array_to_string(sem_politica, ', ');
  end if;

  raise notice 'CONFERIDO — todas as tabelas de dados têm política de isolamento.';
  raise notice 'Agora o SUPABASE_JWT_SECRET pode ser configurado com segurança.';
end $$;
