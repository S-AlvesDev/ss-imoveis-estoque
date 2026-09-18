-- =============================================================================
--  029 — Atende Aí: a fundação
--
--  O Atende Aí é o segundo produto da casa: uma central de atendimento pelo
--  WhatsApp da própria empresa cliente. Vive no mesmo banco do Stok Aí, mas
--  em tabelas próprias, com prefixo `atende_`, e com isolamento por
--  `empresa_id` — nada aqui aponta para estoque_users, units, materials.
--
--  A única ligação com o Stok Aí é `atende_empresas.organization_id`,
--  opcional e nula por padrão: a ponte para o dia em que um cliente do
--  estoque quiser o atendimento também. No MVP não há integração.
--
--  Esta migração cria o que a Etapa 1 precisa: empresa, usuários (com
--  papéis), times (setores) e quem está em cada time, recuperação de senha,
--  e a função que cadastra uma empresa com o primeiro administrador. As
--  tabelas de conversa, cliente e mensagem vêm na 030 (Etapa 2).
--
--  RLS: mesmo desenho do Stok Aí. O servidor assina um JWT do PostgREST com
--  `empresa_id`; `atende_empresa_atual()` lê a claim; toda política compara
--  com ela. Sem token, a função devolve nulo e nada casa — falha fecha.
-- =============================================================================

create extension if not exists unaccent;

-- -----------------------------------------------------------------------------
--  A claim da empresa no token do PostgREST
-- -----------------------------------------------------------------------------
create or replace function atende_empresa_atual() returns uuid
  language sql
  stable
as $$
  select nullif(
    nullif(current_setting('request.jwt.claims', true), '')::json ->> 'empresa_id',
    ''
  )::uuid
$$;

-- -----------------------------------------------------------------------------
--  Empresas (os clientes do Atende Aí)
-- -----------------------------------------------------------------------------
create table if not exists atende_empresas (
  id                        uuid primary key default gen_random_uuid(),
  nome                      text not null check (char_length(nome) between 2 and 80),
  slug                      text not null unique,
  segmento                  text,
  -- O contexto que a IA usa na triagem. Só o que a empresa escreveu aqui;
  -- nada de fora.
  descricao                 text,
  produtos_servicos         text,
  informacoes_ia            text,
  -- [{ pergunta, resposta }]
  faq                       jsonb not null default '[]'::jsonb,
  -- { seg: { de: '08:00', ate: '18:00' } | null, ter: ..., dom: null }
  horario_atendimento       jsonb not null default '{}'::jsonb,
  regras_atendimento        text,
  mensagem_fora_do_horario  text,
  -- Ponte opcional para o Stok Aí. Nula no MVP.
  organization_id           uuid references organizations (id) on delete set null,
  ativo                     boolean not null default true,
  criado_em                 timestamptz not null default now(),
  atualizado_em             timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
--  Usuários (os funcionários da empresa cliente)
-- -----------------------------------------------------------------------------
create table if not exists atende_usuarios (
  id             bigint generated always as identity primary key,
  empresa_id     uuid not null references atende_empresas (id) on delete cascade,
  nome           text not null check (char_length(nome) between 2 and 80),
  email          text not null,
  senha          text not null check (senha ~ '^\$2[aby]\$'),
  papel          text not null check (papel in ('admin', 'supervisor', 'atendente')),
  ativo          boolean not null default true,
  -- Presença: gravada pelo heartbeat da central (Etapa 4). `offline` é
  -- calculado por idade do `presenca_em`, não gravado.
  presenca       text not null default 'offline' check (presenca in ('online', 'ausente', 'offline')),
  presenca_em    timestamptz,
  ultimo_acesso  timestamptz,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);

-- E-mail é único no produto inteiro: é por ele que se entra e se recupera a senha.
create unique index if not exists atende_usuarios_email_unico on atende_usuarios (lower(email));
create index if not exists atende_usuarios_empresa_idx on atende_usuarios (empresa_id);

-- -----------------------------------------------------------------------------
--  Times (os setores: Vendas, Aluguel, Financeiro...)
-- -----------------------------------------------------------------------------
create table if not exists atende_times (
  id                 uuid primary key default gen_random_uuid(),
  empresa_id         uuid not null references atende_empresas (id) on delete cascade,
  nome               text not null check (char_length(nome) between 2 and 60),
  -- O que este setor atende, escrito para a IA decidir o encaminhamento.
  descricao_para_ia  text,
  palavras_chave     text[] not null default '{}',
  ordem              int not null default 0,
  ativo              boolean not null default true,
  criado_em          timestamptz not null default now(),
  unique (empresa_id, nome)
);

create table if not exists atende_time_membros (
  time_id      uuid not null references atende_times (id) on delete cascade,
  usuario_id   bigint not null references atende_usuarios (id) on delete cascade,
  empresa_id   uuid not null references atende_empresas (id) on delete cascade,
  -- Supervisor deste time em particular (um supervisor pode cuidar de alguns setores, não de todos).
  supervisiona boolean not null default false,
  criado_em    timestamptz not null default now(),
  primary key (time_id, usuario_id)
);

create index if not exists atende_time_membros_usuario_idx on atende_time_membros (usuario_id);

-- -----------------------------------------------------------------------------
--  Recuperação de senha (mesmo desenho da 017, apontando para atende_usuarios)
-- -----------------------------------------------------------------------------
create table if not exists atende_recuperacoes_senha (
  id          uuid primary key default gen_random_uuid(),
  usuario_id  bigint not null references atende_usuarios (id) on delete cascade,
  token_hash  text not null unique check (char_length(token_hash) = 64),
  expira_em   timestamptz not null,
  usado_em    timestamptz,
  criado_em   timestamptz not null default now()
);

create index if not exists atende_recuperacoes_senha_usuario_idx on atende_recuperacoes_senha (usuario_id);

-- -----------------------------------------------------------------------------
--  RLS: o banco fiscaliza o isolamento por empresa
-- -----------------------------------------------------------------------------
alter table atende_empresas enable row level security;
alter table atende_empresas force row level security;
drop policy if exists isolamento_por_empresa on atende_empresas;
create policy isolamento_por_empresa on atende_empresas
  using (id = atende_empresa_atual())
  with check (id = atende_empresa_atual());

alter table atende_usuarios enable row level security;
alter table atende_usuarios force row level security;
drop policy if exists isolamento_por_empresa on atende_usuarios;
create policy isolamento_por_empresa on atende_usuarios
  using (empresa_id = atende_empresa_atual())
  with check (empresa_id = atende_empresa_atual());

alter table atende_times enable row level security;
alter table atende_times force row level security;
drop policy if exists isolamento_por_empresa on atende_times;
create policy isolamento_por_empresa on atende_times
  using (empresa_id = atende_empresa_atual())
  with check (empresa_id = atende_empresa_atual());

alter table atende_time_membros enable row level security;
alter table atende_time_membros force row level security;
drop policy if exists isolamento_por_empresa on atende_time_membros;
create policy isolamento_por_empresa on atende_time_membros
  using (empresa_id = atende_empresa_atual())
  with check (empresa_id = atende_empresa_atual());

-- Recuperação de senha e login acontecem ANTES de existir empresa no
-- contexto: só o servidor (chave de serviço) mexe aqui. Nenhuma política.
alter table atende_recuperacoes_senha enable row level security;

-- -----------------------------------------------------------------------------
--  Cadastro: empresa + primeiro administrador, ou tudo ou nada
-- -----------------------------------------------------------------------------
create or replace function atende_criar_empresa(
  p_empresa     text,
  p_segmento    text,
  p_nome        text,
  p_email       text,
  p_senha_hash  text
)
returns table (empresa_id uuid, usuario_id bigint, slug text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_empresa  text := btrim(p_empresa);
  v_segmento text := nullif(btrim(coalesce(p_segmento, '')), '');
  v_nome     text := btrim(p_nome);
  v_email    text := lower(btrim(p_email));
  v_slug     text;
  v_base     text;
  v_id       uuid;
  v_usuario  bigint;
  i          int := 1;
begin
  -- Validações de novo, por dentro: a função não confia em quem chama.
  if length(v_empresa) < 2 or length(v_empresa) > 80 then
    raise exception 'Nome da empresa deve ter de 2 a 80 caracteres.' using errcode = 'check_violation';
  end if;
  if length(v_nome) < 2 or length(v_nome) > 80 then
    raise exception 'Nome do responsável deve ter de 2 a 80 caracteres.' using errcode = 'check_violation';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_email) > 120 then
    raise exception 'E-mail inválido.' using errcode = 'check_violation';
  end if;
  if p_senha_hash !~ '^\$2[aby]\$' then
    raise exception 'A senha precisa chegar já protegida (bcrypt).' using errcode = 'check_violation';
  end if;
  if exists (select 1 from atende_usuarios u where lower(u.email) = v_email) then
    raise exception 'Já existe uma conta com este e-mail.' using errcode = 'unique_violation';
  end if;

  v_base := regexp_replace(lower(unaccent(v_empresa)), '[^a-z0-9]+', '-', 'g');
  v_base := btrim(v_base, '-');
  if v_base = '' then v_base := 'empresa'; end if;
  v_slug := v_base;
  while exists (select 1 from atende_empresas e where e.slug = v_slug) loop
    i := i + 1;
    v_slug := v_base || '-' || i;
  end loop;

  insert into atende_empresas (nome, slug, segmento) values (v_empresa, v_slug, v_segmento) returning id into v_id;

  insert into atende_usuarios (empresa_id, nome, email, senha, papel)
  values (v_id, v_nome, v_email, p_senha_hash, 'admin')
  returning id into v_usuario;

  return query select v_id, v_usuario, v_slug;
end;
$$;

-- -----------------------------------------------------------------------------
--  `atualizado_em` sozinho
-- -----------------------------------------------------------------------------
create or replace function atende_toca_atualizado_em() returns trigger
  language plpgsql
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

drop trigger if exists atende_empresas_atualizado_em on atende_empresas;
create trigger atende_empresas_atualizado_em before update on atende_empresas
  for each row execute function atende_toca_atualizado_em();

drop trigger if exists atende_usuarios_atualizado_em on atende_usuarios;
create trigger atende_usuarios_atualizado_em before update on atende_usuarios
  for each row execute function atende_toca_atualizado_em();

-- =============================================================================
--  CONFERÊNCIA
-- =============================================================================
do $$
declare
  t text;
begin
  foreach t in array array['atende_empresas', 'atende_usuarios', 'atende_times', 'atende_time_membros', 'atende_recuperacoes_senha'] loop
    if to_regclass('public.' || t) is null then
      raise exception 'FALHOU: % não existe.', t;
    end if;
  end loop;
  if not exists (select 1 from pg_policies where tablename = 'atende_usuarios' and policyname = 'isolamento_por_empresa') then
    raise exception 'FALHOU: política de isolamento ausente em atende_usuarios.';
  end if;
  if to_regprocedure('atende_criar_empresa(text, text, text, text, text)') is null then
    raise exception 'FALHOU: função atende_criar_empresa ausente.';
  end if;
  raise notice 'OK: 029 aplicada — fundação do Atende Aí pronta.';
end $$;
