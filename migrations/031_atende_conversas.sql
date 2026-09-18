-- =============================================================================
--  031 — Atende Aí: WhatsApp, clientes, conversas e mensagens
--
--  A Etapa 2: a empresa conecta o próprio WhatsApp (uma instância da Evolution
--  por empresa), cada número que escreve vira um cliente, cada atendimento
--  uma conversa, e tudo que passa — recebido, enviado pela central, enviado
--  pelo celular da empresa (fromMe), nota interna — fica em atende_mensagens.
--  A mídia vai para um bucket privado; a linha guarda o caminho.
--
--  Isolamento: tudo com empresa_id e RLS por atende_empresa_atual(), como na
--  029. Idempotência com a Evolution: wa_id único por conexão (ela reenvia).
-- =============================================================================

-- -----------------------------------------------------------------------------
--  O WhatsApp da empresa (uma instância por empresa, no MVP)
-- -----------------------------------------------------------------------------
create table if not exists atende_conexoes (
  id                uuid primary key default gen_random_uuid(),
  empresa_id        uuid not null references atende_empresas (id) on delete cascade,
  -- Nome da instância na Evolution: 'atende-<12 primeiros hex do id da empresa>'.
  instancia         text not null unique,
  -- O número conectado, só dígitos com DDI, quando a Evolution informa.
  numero            text,
  -- 'aguardando_qr' | 'conectando' | 'conectada' | 'desconectada'
  estado            text not null default 'aguardando_qr' check (estado in ('aguardando_qr', 'conectando', 'conectada', 'desconectada')),
  conectado_em      timestamptz,
  ultimo_evento_em  timestamptz,
  criado_em         timestamptz not null default now(),
  unique (empresa_id)
);

-- -----------------------------------------------------------------------------
--  Quem escreve
-- -----------------------------------------------------------------------------
create table if not exists atende_clientes (
  id                   uuid primary key default gen_random_uuid(),
  empresa_id           uuid not null references atende_empresas (id) on delete cascade,
  -- Só dígitos com DDI. Único por empresa (o mesmo número pode ser cliente de duas empresas).
  telefone             text not null,
  -- O nome que a equipe deu; `nome_whatsapp` é o pushName que veio do aparelho.
  nome                 text,
  nome_whatsapp        text,
  foto_url             text,
  email                text,
  observacoes          text,
  campos               jsonb not null default '{}'::jsonb,
  primeiro_contato_em  timestamptz not null default now(),
  ultimo_contato_em    timestamptz not null default now(),
  unique (empresa_id, telefone)
);

-- -----------------------------------------------------------------------------
--  O atendimento
-- -----------------------------------------------------------------------------
create table if not exists atende_conversas (
  id                              uuid primary key default gen_random_uuid(),
  empresa_id                      uuid not null references atende_empresas (id) on delete cascade,
  cliente_id                      uuid not null references atende_clientes (id) on delete cascade,
  conexao_id                      uuid references atende_conexoes (id) on delete set null,
  -- nova → (em_triagem, na Etapa 3) → na_fila → em_atendimento ⇄ aguardando_cliente → encerrada
  estado                          text not null default 'na_fila' check (estado in ('nova', 'em_triagem', 'na_fila', 'em_atendimento', 'aguardando_cliente', 'encerrada')),
  time_id                         uuid references atende_times (id) on delete set null,
  atendente_id                    bigint references atende_usuarios (id) on delete set null,
  prioridade                      text not null default 'normal' check (prioridade in ('baixa', 'normal', 'alta', 'urgente')),
  -- Preenchidos pela triagem (Etapa 3); a equipe pode editar.
  assunto                         text,
  intencao                        text,
  resumo                          text,
  aberta_em                       timestamptz not null default now(),
  primeira_resposta_em            timestamptz,
  ultima_mensagem_em              timestamptz not null default now(),
  ultima_mensagem_do_cliente_em   timestamptz,
  -- Prévia para a lista: o último texto (ou "[foto]"), de quem.
  ultima_mensagem_texto           text,
  ultima_mensagem_de              text,
  nao_lidas                       int not null default 0,
  encerrada_em                    timestamptz,
  encerrada_por                   bigint references atende_usuarios (id) on delete set null,
  motivo_encerramento             text,
  atualizado_em                   timestamptz not null default now()
);

create index if not exists atende_conversas_empresa_atualizado_idx on atende_conversas (empresa_id, atualizado_em desc);
create index if not exists atende_conversas_cliente_idx on atende_conversas (cliente_id, aberta_em desc);
create index if not exists atende_conversas_atendente_idx on atende_conversas (empresa_id, atendente_id) where estado <> 'encerrada';
-- Uma conversa aberta por cliente de cada vez.
create unique index if not exists atende_conversas_uma_aberta_por_cliente on atende_conversas (cliente_id) where estado <> 'encerrada';

-- -----------------------------------------------------------------------------
--  A linha do tempo
-- -----------------------------------------------------------------------------
create table if not exists atende_mensagens (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references atende_empresas (id) on delete cascade,
  conversa_id    uuid not null references atende_conversas (id) on delete cascade,
  -- entrada = do cliente; saida = para o cliente; interna = só a equipe vê; sistema = aviso automático na linha do tempo.
  direcao        text not null check (direcao in ('entrada', 'saida', 'interna', 'sistema')),
  -- cliente | atendente | supervisor | ia | aparelho (mandado pelo celular da empresa) | sistema
  autor_tipo     text not null check (autor_tipo in ('cliente', 'atendente', 'supervisor', 'ia', 'aparelho', 'sistema')),
  autor_id       bigint references atende_usuarios (id) on delete set null,
  tipo           text not null default 'texto' check (tipo in ('texto', 'imagem', 'audio', 'video', 'documento', 'figurinha', 'localizacao', 'contato', 'outro')),
  texto          text,
  -- { caminho (no bucket), mimetype, nome, tamanho, duracao, largura, altura, latitude, longitude, contato: {nome, telefone} }
  midia          jsonb,
  -- O id da mensagem no WhatsApp; único por conexão. Nulo para notas internas e avisos.
  wa_id          text,
  conexao_id     uuid references atende_conexoes (id) on delete set null,
  -- enviando → enviada → entregue → lida | falhou. Entradas nascem 'entregue'.
  status         text not null default 'entregue' check (status in ('enviando', 'enviada', 'entregue', 'lida', 'falhou')),
  erro           text,
  -- A mensagem citada (resposta a outra), quando houver.
  respondendo_a  uuid references atende_mensagens (id) on delete set null,
  criado_em      timestamptz not null default now(),
  -- Muda quando o status muda (entregue, lida) ou a mídia chega: é o que o sync incremental lê.
  atualizado_em  timestamptz not null default now()
);

create index if not exists atende_mensagens_conversa_idx on atende_mensagens (conversa_id, criado_em);
create index if not exists atende_mensagens_empresa_atualizado_idx on atende_mensagens (empresa_id, atualizado_em desc);
create index if not exists atende_mensagens_empresa_criado_idx on atende_mensagens (empresa_id, criado_em desc);
create unique index if not exists atende_mensagens_wa_id_unico on atende_mensagens (conexao_id, wa_id) where wa_id is not null;

-- -----------------------------------------------------------------------------
--  Etiquetas
-- -----------------------------------------------------------------------------
create table if not exists atende_etiquetas (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references atende_empresas (id) on delete cascade,
  nome        text not null check (char_length(nome) between 1 and 40),
  cor         text not null default '#7c3aed' check (cor ~ '^#[0-9a-fA-F]{6}$'),
  unique (empresa_id, nome)
);

create table if not exists atende_conversa_etiquetas (
  conversa_id  uuid not null references atende_conversas (id) on delete cascade,
  etiqueta_id  uuid not null references atende_etiquetas (id) on delete cascade,
  empresa_id   uuid not null references atende_empresas (id) on delete cascade,
  primary key (conversa_id, etiqueta_id)
);

-- -----------------------------------------------------------------------------
--  Auditoria: quem fez o quê numa conversa
-- -----------------------------------------------------------------------------
create table if not exists atende_eventos (
  id           uuid primary key default gen_random_uuid(),
  empresa_id   uuid not null references atende_empresas (id) on delete cascade,
  conversa_id  uuid references atende_conversas (id) on delete cascade,
  usuario_id   bigint references atende_usuarios (id) on delete set null,
  -- aberta | atribuida | assumida | transferida | encerrada | reaberta | lead_alterado | triagem | triagem_corrigida | orientacao | conexao
  tipo         text not null,
  dados        jsonb,
  criado_em    timestamptz not null default now()
);

create index if not exists atende_eventos_conversa_idx on atende_eventos (conversa_id, criado_em);
create index if not exists atende_eventos_empresa_idx on atende_eventos (empresa_id, criado_em desc);

-- -----------------------------------------------------------------------------
--  RLS
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['atende_conexoes', 'atende_clientes', 'atende_conversas', 'atende_mensagens', 'atende_etiquetas', 'atende_conversa_etiquetas', 'atende_eventos'] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format('drop policy if exists isolamento_por_empresa on %I', t);
    execute format('create policy isolamento_por_empresa on %I using (empresa_id = atende_empresa_atual()) with check (empresa_id = atende_empresa_atual())', t);
  end loop;
end $$;

-- `atualizado_em` da conversa e da mensagem sozinhos.
drop trigger if exists atende_conversas_atualizado_em on atende_conversas;
create trigger atende_conversas_atualizado_em before update on atende_conversas
  for each row execute function atende_toca_atualizado_em();
drop trigger if exists atende_mensagens_atualizado_em on atende_mensagens;
create trigger atende_mensagens_atualizado_em before update on atende_mensagens
  for each row execute function atende_toca_atualizado_em();

-- -----------------------------------------------------------------------------
--  Bucket privado de mídia. Só o servidor lê e escreve (chave de serviço);
--  o navegador recebe URLs assinadas de curta duração.
-- -----------------------------------------------------------------------------
do $$
begin
  if to_regnamespace('storage') is null then
    raise notice 'Schema storage ausente — bucket atende-midias não criado (não é Supabase).';
    return;
  end if;
  insert into storage.buckets (id, name, public, file_size_limit)
  values ('atende-midias', 'atende-midias', false, 26214400)
  on conflict (id) do update set public = false, file_size_limit = 26214400;
  raise notice 'Bucket "atende-midias" pronto: privado, 25 MB por arquivo.';
end $$;

-- =============================================================================
--  CONFERÊNCIA
-- =============================================================================
do $$
declare
  t text;
begin
  foreach t in array array['atende_conexoes', 'atende_clientes', 'atende_conversas', 'atende_mensagens', 'atende_etiquetas', 'atende_conversa_etiquetas', 'atende_eventos'] loop
    if to_regclass('public.' || t) is null then
      raise exception 'FALHOU: % não existe.', t;
    end if;
    if not exists (select 1 from pg_policies where tablename = t and policyname = 'isolamento_por_empresa') then
      raise exception 'FALHOU: política de isolamento ausente em %.', t;
    end if;
  end loop;
  raise notice 'OK: 031 aplicada — conversas do Atende Aí prontas.';
end $$;
