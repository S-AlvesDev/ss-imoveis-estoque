-- =============================================================================
--  045 — Atende Aí: etiqueta do cliente (não só da conversa) e disparo em massa
--
--  A etiqueta (migração 031) vive em atende_conversa_etiquetas — presa à
--  CONVERSA. Com "um fio por contato" (migração 043) ela já sobrevive ao
--  encerramento na prática, mas a semântica continua errada: uma campanha
--  por etiqueta precisa de "quem tem essa etiqueta", não "qual conversa tem
--  essa etiqueta". atende_cliente_etiquetas passa a ser essa fonte —
--  espelhada pelo servidor sempre que a etiqueta de uma conversa muda.
--
--  atende_disparos_lote/item: a fila de um disparo em massa. Cada item leva
--  o horário em que PODE ser enviado (enviar_apos), calculado na criação do
--  lote com um intervalo aleatório entre cada um — o servidor roda em
--  função serverless (sem processo de vida longa), então o ritmo entre
--  envios não é um `sleep()`: é o relógio da própria fila. Um processo curto
--  (chamado pela tela aberta, ou pelo cron diário como rede de segurança)
--  só manda o que já venceu.
--
--  Aditiva e idempotente: cria as tabelas, migra o que já existe em
--  atende_conversa_etiquetas e sai.
-- =============================================================================

create table if not exists atende_cliente_etiquetas (
  cliente_id   uuid not null references atende_clientes (id) on delete cascade,
  etiqueta_id  uuid not null references atende_etiquetas (id) on delete cascade,
  empresa_id   uuid not null references atende_empresas (id) on delete cascade,
  criado_em    timestamptz not null default now(),
  primary key (cliente_id, etiqueta_id)
);
create index if not exists atende_cliente_etiquetas_etiqueta_idx on atende_cliente_etiquetas (etiqueta_id);

alter table atende_cliente_etiquetas enable row level security;
alter table atende_cliente_etiquetas force row level security;
drop policy if exists isolamento_por_empresa on atende_cliente_etiquetas;
create policy isolamento_por_empresa on atende_cliente_etiquetas using (empresa_id = atende_empresa_atual()) with check (empresa_id = atende_empresa_atual());

insert into atende_cliente_etiquetas (cliente_id, etiqueta_id, empresa_id)
select distinct c.cliente_id, ce.etiqueta_id, ce.empresa_id
from atende_conversa_etiquetas ce
join atende_conversas c on c.id = ce.conversa_id
on conflict (cliente_id, etiqueta_id) do nothing;

-- -----------------------------------------------------------------------------
--  Disparo em massa
-- -----------------------------------------------------------------------------
create table if not exists atende_disparos_lote (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references atende_empresas (id) on delete cascade,
  etiqueta_id   uuid references atende_etiquetas (id) on delete set null,
  titulo        text,
  mensagem      text not null,
  criado_por    bigint references atende_usuarios (id) on delete set null,
  criado_em     timestamptz not null default now(),
  status        text not null default 'enviando' check (status in ('enviando', 'concluido', 'cancelado')),
  total         integer not null default 0,
  enviados      integer not null default 0,
  erros         integer not null default 0,
  min_segundos  integer not null default 8,
  max_segundos  integer not null default 20
);
create index if not exists atende_disparos_lote_empresa_idx on atende_disparos_lote (empresa_id, criado_em desc);

create table if not exists atende_disparos_item (
  id              uuid primary key default gen_random_uuid(),
  lote_id         uuid not null references atende_disparos_lote (id) on delete cascade,
  cliente_id      uuid not null references atende_clientes (id) on delete cascade,
  telefone        text not null,
  mensagem_final  text not null,
  status          text not null default 'pendente' check (status in ('pendente', 'enviado', 'erro', 'cancelado')),
  enviar_apos     timestamptz not null,
  enviado_em      timestamptz,
  erro            text
);
create index if not exists atende_disparos_item_fila_idx on atende_disparos_item (lote_id, status, enviar_apos);

alter table atende_disparos_lote enable row level security;
alter table atende_disparos_lote force row level security;
drop policy if exists isolamento_por_empresa on atende_disparos_lote;
create policy isolamento_por_empresa on atende_disparos_lote using (empresa_id = atende_empresa_atual()) with check (empresa_id = atende_empresa_atual());

-- atende_disparos_item não tem empresa_id (não é 1:1 com um recurso do tenant
-- por si só): o isolamento vem de sempre acessar por join com o lote, que já
-- é isolado. RLS aqui é só para fechar acesso direto por engano.
alter table atende_disparos_item enable row level security;
alter table atende_disparos_item force row level security;
drop policy if exists isolamento_por_lote on atende_disparos_item;
create policy isolamento_por_lote on atende_disparos_item using (lote_id in (select id from atende_disparos_lote)) with check (lote_id in (select id from atende_disparos_lote));

do $$
begin
  if not exists (select 1 from pg_tables where tablename = 'atende_cliente_etiquetas') then
    raise exception 'FALHOU: atende_cliente_etiquetas não existe.';
  end if;
  if not exists (select 1 from pg_tables where tablename = 'atende_disparos_lote') then
    raise exception 'FALHOU: atende_disparos_lote não existe.';
  end if;
  raise notice 'OK: etiqueta do cliente e fila de disparo em massa.';
end $$;
