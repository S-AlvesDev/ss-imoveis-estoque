-- =============================================================================
--  032 — Atende Aí: a triagem da IA e o lead
--
--  A Etapa 3. Quando um cliente escreve, a IA lê a mensagem e decide: qual
--  é o assunto, a intenção, o setor (time) e a prioridade — e escreve um
--  resumo para o atendente chegar sabendo. Cada decisão fica em
--  atende_triagens, com o que custou; a correção do supervisor fica na
--  mesma linha, para o histórico dizer "a IA disse X, a pessoa corrigiu para
--  Y e por quê". Nenhum aprendizado automático nasce daqui: é registro.
--
--  O lead é o funil de cada conversa (novo → em atendimento → em negociação →
--  aguardando cliente → convertido | perdido). A IA pode sugerir; quem muda
--  é gente.
-- =============================================================================

-- A empresa liga e desliga a triagem, e escolhe se a IA responde fora do horário.
alter table atende_empresas add column if not exists triagem_ativa boolean not null default true;
alter table atende_empresas add column if not exists responde_fora_do_horario boolean not null default true;

-- -----------------------------------------------------------------------------
--  O que a IA decidiu
-- -----------------------------------------------------------------------------
create table if not exists atende_triagens (
  id                     uuid primary key default gen_random_uuid(),
  empresa_id             uuid not null references atende_empresas (id) on delete cascade,
  conversa_id            uuid not null references atende_conversas (id) on delete cascade,
  -- A mensagem que disparou esta rodada (a primeira do cliente, ou a resposta a uma pergunta da IA).
  mensagem_id            uuid references atende_mensagens (id) on delete set null,
  rodada                 int not null default 1,
  assunto                text,
  intencao               text,
  time_sugerido_id       uuid references atende_times (id) on delete set null,
  atendente_sugerido_id  bigint references atende_usuarios (id) on delete set null,
  prioridade             text not null default 'normal' check (prioridade in ('baixa', 'normal', 'alta', 'urgente')),
  confianca              numeric(3,2) check (confianca between 0 and 1),
  resumo                 text,
  -- A IA pediu um esclarecimento em vez de encaminhar ("Sobre o quê exatamente?").
  pediu_esclarecimento   boolean not null default false,
  -- O que foi dito ao cliente nesta rodada (nulo se nada).
  resposta_enviada       text,
  -- O que aconteceu com a conversa: 'atribuida' | 'na_fila' | 'esclarecendo' | 'sem_time' | 'simulacao'
  desfecho               text not null,
  modelo                 text,
  tokens_entrada         int,
  tokens_cache           int,
  tokens_saida           int,
  -- Correção humana: quem, para qual time, por quê.
  corrigido_por          bigint references atende_usuarios (id) on delete set null,
  time_corrigido_id      uuid references atende_times (id) on delete set null,
  corrigido_em           timestamptz,
  motivo_correcao        text,
  criado_em              timestamptz not null default now()
);

create index if not exists atende_triagens_conversa_idx on atende_triagens (conversa_id, criado_em desc);
create index if not exists atende_triagens_empresa_idx on atende_triagens (empresa_id, criado_em desc);

-- -----------------------------------------------------------------------------
--  O lead: uma linha por conversa
-- -----------------------------------------------------------------------------
create table if not exists atende_leads (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references atende_empresas (id) on delete cascade,
  cliente_id     uuid not null references atende_clientes (id) on delete cascade,
  conversa_id    uuid not null references atende_conversas (id) on delete cascade unique,
  estado         text not null default 'novo' check (estado in ('novo', 'em_atendimento', 'em_negociacao', 'aguardando_cliente', 'convertido', 'perdido')),
  -- O que a IA acha que este lead é (só sugestão; a decisão é da equipe).
  sugestao_ia    text,
  valor          numeric(12,2),
  atualizado_por bigint references atende_usuarios (id) on delete set null,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);

create index if not exists atende_leads_empresa_estado_idx on atende_leads (empresa_id, estado);
create index if not exists atende_leads_cliente_idx on atende_leads (cliente_id);

drop trigger if exists atende_leads_atualizado_em on atende_leads;
create trigger atende_leads_atualizado_em before update on atende_leads
  for each row execute function atende_toca_atualizado_em();

-- -----------------------------------------------------------------------------
--  RLS
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['atende_triagens', 'atende_leads'] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format('drop policy if exists isolamento_por_empresa on %I', t);
    execute format('create policy isolamento_por_empresa on %I using (empresa_id = atende_empresa_atual()) with check (empresa_id = atende_empresa_atual())', t);
  end loop;
end $$;

-- =============================================================================
--  CONFERÊNCIA
-- =============================================================================
do $$
begin
  if to_regclass('public.atende_triagens') is null or to_regclass('public.atende_leads') is null then
    raise exception 'FALHOU: atende_triagens ou atende_leads não existe.';
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'atende_empresas' and column_name = 'triagem_ativa') then
    raise exception 'FALHOU: atende_empresas.triagem_ativa não existe.';
  end if;
  raise notice 'OK: 032 aplicada — triagem e leads do Atende Aí prontos.';
end $$;
