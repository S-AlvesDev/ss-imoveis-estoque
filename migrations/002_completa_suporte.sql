-- =============================================================================
--  Migração 002 — completa o que faltou da 001
--
--  A 001 parou depois de support_ticket_materials. Este arquivo cria só o que
--  falta. Não apaga nada. Rode inteiro no SQL Editor do Supabase.
--
--  Se der erro em alguma linha, rode BLOCO A BLOCO — os blocos são
--  independentes e a mensagem de erro fica óbvia.
-- =============================================================================

-- ---------- BLOCO 1: conversa dos chamados ----------
create table if not exists support_ticket_comments (
  id              bigserial primary key,
  ticket_id       bigint not null references support_tickets (id) on delete cascade,
  autor_matricula text   not null,
  autor_nome      text   not null,
  mensagem        text   not null,
  created_at      timestamptz not null default now()
);

create index if not exists support_ticket_comments_ticket_idx
  on support_ticket_comments (ticket_id, created_at);

alter table support_ticket_comments enable row level security;


-- ---------- BLOCO 2: updated_at automático ----------
create or replace function set_updated_at() returns trigger
language plpgsql
as $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

drop trigger if exists support_tickets_set_updated_at on support_tickets;
create trigger support_tickets_set_updated_at
  before update on support_tickets
  for each row execute function set_updated_at();


-- ---------- BLOCO 3: colunas de segurança em users ----------
-- Aditivas e com default: não afetam o CRM, que simplesmente as ignora.
alter table users add column if not exists ativo             boolean not null default true;
alter table users add column if not exists ultimo_acesso     timestamptz;
alter table users add column if not exists senha_alterada_em timestamptz;


-- ---------- BLOCO 4: RLS nas tabelas que a 001 criou ----------
-- O app acessa via service_role, que ignora RLS. Isto só impede que a chave
-- anônima (pública, exposta no navegador) leia os chamados.
alter table support_tickets          enable row level security;
alter table support_ticket_materials enable row level security;


-- ---------- CONFERÊNCIA ----------
-- Deve retornar 3 linhas.
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name like 'support%'
order by table_name;
