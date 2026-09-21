-- =============================================================================
--  044 — Atende Aí: uma nota por atendimento, não por fio
--
--  ATD-01 da auditoria: com "um contato, um fio" (migração 043), a nota do
--  atendimento vivia em colunas de atende_conversas — uma por fio. Cada
--  reabertura + novo pedido de nota sobrescrevia a anterior, e a autoria
--  (atendente_id da conversa) mudava com a reabertura, então uma avaliação
--  respondida depois de reabrir aparecia "sem atendente".
--
--  atende_avaliacoes guarda uma linha por PEDIDO de nota (o atendimento),
--  com o atendente e o setor de quando foi pedida — não da conversa hoje.
--  As colunas avaliacao_* de atende_conversas continuam existindo (mostram
--  a última nota no cartão da conversa); esta tabela é a fonte para
--  Dashboard, Avaliações e Supervisão.
--
--  Aditiva e idempotente: cria a tabela, migra o que já existe em
--  atende_conversas (uma linha por conversa com pedido) e sai.
-- =============================================================================

create table if not exists atende_avaliacoes (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references atende_empresas (id) on delete cascade,
  conversa_id    uuid not null references atende_conversas (id) on delete cascade,
  cliente_id     uuid not null references atende_clientes (id) on delete cascade,
  -- Quem atendia e para qual setor, no momento em que a nota foi pedida — não muda com uma reabertura futura.
  atendente_id   bigint references atende_usuarios (id) on delete set null,
  time_id        uuid references atende_times (id) on delete set null,
  assunto        text,
  modelo         text,
  pedida_em      timestamptz not null default now(),
  respondida_em  timestamptz,
  nota           smallint check (nota is null or (nota between 0 and 10)),
  comentario     text,
  criado_em      timestamptz not null default now()
);

create index if not exists atende_avaliacoes_empresa_pedida_idx on atende_avaliacoes (empresa_id, pedida_em desc);
create index if not exists atende_avaliacoes_conversa_idx on atende_avaliacoes (conversa_id, pedida_em desc);
create index if not exists atende_avaliacoes_atendente_idx on atende_avaliacoes (atendente_id);
-- Uma linha "em aberto" (ainda sem resposta) por conversa: o webhook confere só uma.
create unique index if not exists atende_avaliacoes_pendente_por_conversa on atende_avaliacoes (conversa_id) where respondida_em is null;

alter table atende_avaliacoes enable row level security;
alter table atende_avaliacoes force row level security;
drop policy if exists isolamento_por_empresa on atende_avaliacoes;
create policy isolamento_por_empresa on atende_avaliacoes using (empresa_id = atende_empresa_atual()) with check (empresa_id = atende_empresa_atual());

-- -----------------------------------------------------------------------------
--  Migra o que já existe: uma linha por conversa com avaliacao_pedida_em,
--  usando o atendente e o setor gravados nela hoje (é a informação que
--  existe — pode já estar "sem atendente" para quem reabriu antes desta
--  migração; dali em diante fica certo).
-- -----------------------------------------------------------------------------
insert into atende_avaliacoes (empresa_id, conversa_id, cliente_id, atendente_id, time_id, assunto, pedida_em, respondida_em, nota, comentario)
select c.empresa_id, c.id, c.cliente_id, c.atendente_id, c.time_id, c.assunto, c.avaliacao_pedida_em, c.avaliacao_em, c.avaliacao_nota, c.avaliacao_comentario
from atende_conversas c
where c.avaliacao_pedida_em is not null
  and not exists (select 1 from atende_avaliacoes a where a.conversa_id = c.id and a.pedida_em = c.avaliacao_pedida_em);

do $$
begin
  if not exists (select 1 from pg_tables where tablename = 'atende_avaliacoes') then
    raise exception 'FALHOU: atende_avaliacoes não existe.';
  end if;
  raise notice 'OK: avaliação por atendimento, com autoria própria.';
end $$;
