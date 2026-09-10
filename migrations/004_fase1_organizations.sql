-- =============================================================================
--  Fase 1a — Fundação multiempresa
--
--  Introduz o conceito de organização (a "conta") e marca cada linha de dado
--  como pertencente a uma. É a base da ideia de conta-e-perfis.
--
--  O QUE ESTA MIGRAÇÃO **NÃO** FAZ
--  Ela NÃO isola nada ainda. As políticas de RLS são criadas, mas o servidor
--  acessa o banco com a chave `service_role`, que ignora RLS por definição.
--  O isolamento passa a valer na Fase 1b, quando as rotas de dados deixarem
--  de usar essa chave. Até lá, isto é estrutura, não garantia.
--
--  SEGURANÇA DESTA MIGRAÇÃO
--  - É aditiva: cria tabelas e colunas, não apaga nem altera dado existente.
--  - É idempotente: pode rodar mais de uma vez.
--  - NÃO toca a tabela `users`, que é compartilhada com o CRM.
--  - Reversível por 004_fase1_organizations_rollback.sql.
--
--  Rode no SQL Editor do Supabase. Ao final, uma consulta de conferência
--  mostra a contagem por tabela — todas devem estar 100% preenchidas.
-- =============================================================================

-- -----------------------------------------------------------------------------
--  BLOCO 1 — A conta
-- -----------------------------------------------------------------------------
create table if not exists organizations (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null,
  slug       text not null unique,
  ativo      boolean not null default true,
  created_at timestamptz not null default now()
);

-- Organização inicial, com id fixo para o backfill ser determinístico.
insert into organizations (id, nome, slug)
values ('5e7e0000-0000-4000-8000-000000000001', 'Imobiliária São Severino', 'sao-severino')
on conflict (id) do nothing;


-- -----------------------------------------------------------------------------
--  BLOCO 2 — Quem pertence a qual conta
--
--  Deliberadamente NÃO adicionamos organization_id na tabela `users`: ela é
--  compartilhada com o CRM, e alterá-la afetaria um sistema que não é este.
--  O vínculo mora numa tabela própria do estoque, ligada pela matrícula.
--  Quando o estoque tiver a própria tabela de identidades, isto se funde a ela.
-- -----------------------------------------------------------------------------
create table if not exists estoque_user_orgs (
  matricula       text not null,
  organization_id uuid not null references organizations (id) on delete cascade,
  created_at      timestamptz not null default now(),
  primary key (matricula, organization_id)
);

create index if not exists estoque_user_orgs_matricula_idx on estoque_user_orgs (matricula);

-- Todo mundo que hoje acessa o estoque pertence à São Severino.
--
-- A lista é explícita, espelhando ALL_INVENTORY_ROLES em shared/constants.ts.
-- Filtrar por `role <> 'CLIENTE'` seria largo demais: a tabela `users` é
-- compartilhada com o CRM, e papéis como CORRETOR_ATENDIMENTO não são CLIENTE
-- mas também não têm acesso ao estoque.
insert into estoque_user_orgs (matricula, organization_id)
select u.matricula, '5e7e0000-0000-4000-8000-000000000001'
from users u
where u.matricula is not null
  and u.role in (
    'ADMINISTRADOR', 'ADMINISTRATIVO',
    'ALMOXARIFE_GERAL', 'ALMOXARIFADO', 'ALMOXARIFE_OBRA'
  )
on conflict do nothing;

-- Tabelas de controle: fechadas por padrão. O servidor as acessa por
-- service_role; chave anônima não deve enxergar a lista de clientes nem
-- quem pertence a quem. As policies de leitura entram na Fase 1b.
--
-- Ligado DEPOIS do backfill de propósito: assim a carga inicial não depende
-- de quem roda a migração ser dono ou superusuário da tabela.
alter table organizations      enable row level security;
alter table estoque_user_orgs  enable row level security;


-- -----------------------------------------------------------------------------
--  BLOCO 3 — Marcar os dados existentes
--
--  O DEFAULT é intencional e temporário: garante que a migração sozinha não
--  quebre nenhuma escrita do servidor atual, que ainda não conhece
--  organization_id. A Fase 1b remove o default assim que o servidor passar a
--  informá-lo explicitamente — um default de tenant é exatamente o tipo de
--  coisa que causa vazamento silencioso se ficar para sempre.
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
  org constant uuid := '5e7e0000-0000-4000-8000-000000000001';
begin
  foreach t in array array['materials', 'material_movements', 'support_tickets'] loop
    if to_regclass(t) is null then
      raise notice 'tabela % não existe, pulando', t;
      continue;
    end if;

    execute format(
      'alter table %I add column if not exists organization_id uuid references organizations (id)', t);
    execute format('update %I set organization_id = %L where organization_id is null', t, org);
    execute format('alter table %I alter column organization_id set default %L', t, org);
    execute format('alter table %I alter column organization_id set not null', t);
    execute format('create index if not exists %I on %I (organization_id)', t || '_org_idx', t);

    raise notice 'OK — % marcada e indexada', t;
  end loop;
end $$;

-- As tabelas filhas do suporte herdam a organização do chamado.
do $$
declare
  t text;
begin
  foreach t in array array['support_ticket_materials', 'support_ticket_comments'] loop
    if to_regclass(t) is null then
      raise notice 'tabela % não existe, pulando', t;
      continue;
    end if;

    execute format(
      'alter table %I add column if not exists organization_id uuid references organizations (id)', t);
    -- Denormalizado de propósito: uma política de RLS que precise fazer join
    -- com support_tickets paga esse custo em toda linha lida.
    execute format(
      'update %I f set organization_id = t.organization_id
         from support_tickets t
        where t.id = f.ticket_id and f.organization_id is null', t);
    execute format(
      'alter table %I alter column organization_id set default %L', t, '5e7e0000-0000-4000-8000-000000000001');
    execute format('alter table %I alter column organization_id set not null', t);
    execute format('create index if not exists %I on %I (organization_id)', t || '_org_idx', t);

    raise notice 'OK — % marcada e indexada', t;
  end loop;
end $$;


-- -----------------------------------------------------------------------------
--  BLOCO 4 — Políticas de isolamento
--
--  Escritas agora para que a Fase 1b seja só "trocar a chave de acesso".
--  Enquanto o servidor usar service_role, elas não têm efeito nenhum.
-- -----------------------------------------------------------------------------
create or replace function current_org_id() returns uuid
  language sql
  stable
as $$
  -- O nullif externo é obrigatório: sem token, current_setting devolve string
  -- vazia e ''::json levantaria erro em vez de negar acesso. Falha fecha.
  select nullif(
    nullif(current_setting('request.jwt.claims', true), '')::json ->> 'organization_id',
    ''
  )::uuid
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'materials', 'material_movements', 'support_tickets',
    'support_ticket_materials', 'support_ticket_comments'
  ] loop
    if to_regclass(t) is null then continue; end if;

    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format('drop policy if exists isolamento_por_organizacao on %I', t);
    execute format(
      'create policy isolamento_por_organizacao on %I
         using (organization_id = current_org_id())
         with check (organization_id = current_org_id())', t);
  end loop;
  raise notice 'OK — políticas criadas (inertes enquanto o servidor usar service_role)';
end $$;


-- -----------------------------------------------------------------------------
--  CONFERÊNCIA — toda linha precisa ter organização. Aborta se sobrar alguma.
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
  sem_org bigint;
  total bigint;
begin
  foreach t in array array[
    'materials', 'material_movements', 'support_tickets',
    'support_ticket_materials', 'support_ticket_comments'
  ] loop
    if to_regclass(t) is null then continue; end if;

    execute format('select count(*) from %I', t) into total;
    execute format('select count(*) from %I where organization_id is null', t) into sem_org;

    if sem_org > 0 then
      raise exception 'FALHOU: % linha(s) de % ficaram sem organização', sem_org, t;
    end if;

    raise notice 'CONFERIDO — %: % linha(s), todas com organização', t, total;
  end loop;

  raise notice '---';
  raise notice 'FASE 1a CONCLUÍDA. Estrutura pronta; o isolamento ainda NÃO está ativo.';
  raise notice 'Próximo passo (Fase 1b): tirar as rotas de dados do service_role.';
end $$;
