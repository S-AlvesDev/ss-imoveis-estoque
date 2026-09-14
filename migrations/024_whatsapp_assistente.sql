-- =============================================================================
--  024 — Stok Aí no WhatsApp
--
--  Cada usuário pode cadastrar o próprio WhatsApp; é por esse número que o
--  assistente sabe quem está falando, de qual empresa, e o que a pessoa
--  pode. Nunca tem poder próprio: age como o usuário, com o acesso dele no
--  painel — e, pelo WhatsApp, só com as operações liberadas para ele.
--  `whatsapp_conversas` guarda o contexto curto e a ação esperando "SIM";
--  `whatsapp_mensagens` é o diário e o medidor de uso (tokens, custo).
-- =============================================================================

-- O número (só dígitos, com DDI: 5584999999999). Único no sistema inteiro:
-- é ele que identifica a pessoa, então não pode apontar para duas contas.
alter table estoque_users add column if not exists whatsapp text;
create unique index if not exists estoque_users_whatsapp_idx on estoque_users (whatsapp) where whatsapp is not null;

-- Quais operações a pessoa pode registrar pelo WhatsApp. Nulo = o padrão do
-- cargo (operador: saída, consumo, transferência, devolução; administrador:
-- essas mais entrada). Lista vazia = só consulta.
alter table estoque_users add column if not exists whatsapp_operacoes text[];
-- PIN opcional (bcrypt) para confirmar gravações: "SIM 1234".
alter table estoque_users add column if not exists whatsapp_pin text;

-- Instância própria da organização na Evolution (o número da empresa). Nulo = a instância do Stok Aí.
alter table organizations add column if not exists whatsapp_instancia text;

-- -----------------------------------------------------------------------------
create table if not exists whatsapp_conversas (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  user_id         bigint not null references estoque_users (id) on delete cascade,
  telefone        text not null unique,
  -- As últimas mensagens (papel + texto), para a IA ter contexto curto.
  mensagens       jsonb not null default '[]'::jsonb,
  -- A ação esperando confirmação: { tipo, resumo, dados, expira_em }.
  pendente        jsonb,
  atualizado_em   timestamptz not null default now()
);

alter table whatsapp_conversas enable row level security;
alter table whatsapp_conversas force row level security;
drop policy if exists isolamento_por_organizacao on whatsapp_conversas;
create policy isolamento_por_organizacao on whatsapp_conversas
  using (organization_id = current_org_id())
  with check (organization_id = current_org_id());

-- -----------------------------------------------------------------------------
create table if not exists whatsapp_mensagens (
  id              bigserial primary key,
  organization_id uuid references organizations (id) on delete set null,
  user_id         bigint references estoque_users (id) on delete set null,
  telefone        text not null,
  direcao         text not null check (direcao in ('entrada', 'saida')),
  texto           text not null,
  -- Só nas respostas da IA: o que custou.
  tokens_entrada  integer,
  tokens_saida    integer,
  modelo          text,
  criado_em       timestamptz not null default now()
);

create index if not exists whatsapp_mensagens_org_mes_idx on whatsapp_mensagens (organization_id, criado_em desc);

alter table whatsapp_mensagens enable row level security;
-- Nenhuma política: só o servidor (chave de serviço) escreve e lê.

-- =============================================================================
--  CONFERÊNCIA
-- =============================================================================
do $$
begin
  if not exists (select 1 from information_schema.columns where table_name = 'estoque_users' and column_name = 'whatsapp') then
    raise exception 'FALHOU: estoque_users.whatsapp não existe.';
  end if;
  if to_regclass('public.whatsapp_conversas') is null or to_regclass('public.whatsapp_mensagens') is null then
    raise exception 'FALHOU: tabelas do WhatsApp não foram criadas.';
  end if;
  raise notice 'OK: WhatsApp por usuário, conversas e diário prontos.';
end $$;
