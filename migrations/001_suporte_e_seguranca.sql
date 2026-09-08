-- =============================================================================
--  Estoque SS Imóveis — Migração 001
--  Suporte (revisão de materiais) + preparação de segurança dos usuários
--
--  Rode no SQL Editor do Supabase. É idempotente: pode rodar mais de uma vez.
-- =============================================================================

-- -----------------------------------------------------------------------------
--  1. CHAMADOS DE SUPORTE
--     Almoxarifes abrem chamados sobre materiais (duplicados, nome errado,
--     informação incorreta). A gestão revisa e resolve.
-- -----------------------------------------------------------------------------
create table if not exists support_tickets (
  id            bigserial primary key,
  tipo          text        not null check (tipo in ('DUPLICADO', 'NOME_INCORRETO', 'INFO_INCORRETA', 'FALTA_CADASTRO', 'OUTRO')),
  assunto       text        not null check (length(trim(assunto)) between 3 and 160),
  descricao     text        not null check (length(trim(descricao)) between 5 and 4000),
  status        text        not null default 'ABERTO' check (status in ('ABERTO', 'EM_ANALISE', 'RESOLVIDO', 'RECUSADO')),
  prioridade    text        not null default 'NORMAL' check (prioridade in ('BAIXA', 'NORMAL', 'ALTA')),

  autor_matricula text not null,
  autor_nome      text not null,
  autor_role      text not null,

  resolvido_por text,
  resolucao     text,
  resolved_at   timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists support_tickets_status_idx on support_tickets (status, created_at desc);
create index if not exists support_tickets_autor_idx  on support_tickets (autor_matricula, created_at desc);

-- -----------------------------------------------------------------------------
--  2. MATERIAIS CITADOS NO CHAMADO
--     Guardamos o nome como snapshot: se o material for excluído ou unificado,
--     o chamado continua legível.
-- -----------------------------------------------------------------------------
create table if not exists support_ticket_materials (
  id            bigserial primary key,
  ticket_id     bigint not null references support_tickets (id) on delete cascade,
  material_id   bigint references materials (id) on delete set null,
  material_nome text   not null
);

create index if not exists support_ticket_materials_ticket_idx on support_ticket_materials (ticket_id);

-- Um material não deve aparecer duas vezes no mesmo chamado.
create unique index if not exists support_ticket_materials_unique_idx
  on support_ticket_materials (ticket_id, material_id)
  where material_id is not null;

-- -----------------------------------------------------------------------------
--  3. CONVERSA DO CHAMADO
-- -----------------------------------------------------------------------------
create table if not exists support_ticket_comments (
  id              bigserial primary key,
  ticket_id       bigint not null references support_tickets (id) on delete cascade,
  autor_matricula text   not null,
  autor_nome      text   not null,
  mensagem        text   not null check (length(trim(mensagem)) between 1 and 4000),
  created_at      timestamptz not null default now()
);

create index if not exists support_ticket_comments_ticket_idx on support_ticket_comments (ticket_id, created_at);

-- -----------------------------------------------------------------------------
--  4. updated_at automático
-- -----------------------------------------------------------------------------
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists support_tickets_set_updated_at on support_tickets;
create trigger support_tickets_set_updated_at
  before update on support_tickets
  for each row execute function set_updated_at();

-- -----------------------------------------------------------------------------
--  5. RLS — o app acessa via service_role (que ignora RLS). Ligamos o RLS sem
--     policies para que a chave anônima não consiga ler nada destas tabelas.
-- -----------------------------------------------------------------------------
alter table support_tickets           enable row level security;
alter table support_ticket_materials  enable row level security;
alter table support_ticket_comments   enable row level security;

-- -----------------------------------------------------------------------------
--  6. SEGURANÇA DOS USUÁRIOS
--     ATENÇÃO: hoje as 15 senhas da tabela `users` estão em TEXTO PURO.
--     O login aceita bcrypt e texto puro, então a migração pode ser gradual.
--
--     Estas colunas dão suporte a desativar usuário e auditar acesso sem
--     precisar excluir a linha (que é compartilhada com o CRM).
-- -----------------------------------------------------------------------------
alter table users add column if not exists ativo         boolean     not null default true;
alter table users add column if not exists ultimo_acesso timestamptz;
alter table users add column if not exists senha_alterada_em timestamptz;

-- Índice para o filtro de login.
create index if not exists users_matricula_idx on users (matricula);
