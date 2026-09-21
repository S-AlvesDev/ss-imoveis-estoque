-- =============================================================================
--  047 — Atende Aí: modelos de mensagem (respostas prontas)
--
--  Modelos que a empresa cadastra (título curto + texto, com o placeholder
--  {nome}) para quem atende inserir de um clique ao responder — em vez de
--  digitar a mesma explicação de novo em cada conversa parecida.
--
--  Aditiva e idempotente: cria a tabela e sai.
-- =============================================================================

create table if not exists atende_modelos_mensagem (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references atende_empresas (id) on delete cascade,
  titulo        text not null check (char_length(titulo) between 1 and 60),
  texto         text not null check (char_length(texto) between 1 and 4000),
  criado_por    bigint references atende_usuarios (id) on delete set null,
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists atende_modelos_mensagem_empresa_idx on atende_modelos_mensagem (empresa_id, ativo, titulo);

alter table atende_modelos_mensagem enable row level security;
alter table atende_modelos_mensagem force row level security;
drop policy if exists isolamento_por_empresa on atende_modelos_mensagem;
create policy isolamento_por_empresa on atende_modelos_mensagem using (empresa_id = atende_empresa_atual()) with check (empresa_id = atende_empresa_atual());

do $$
begin
  if not exists (select 1 from pg_tables where tablename = 'atende_modelos_mensagem') then
    raise exception 'FALHOU: atende_modelos_mensagem não existe.';
  end if;
  raise notice 'OK: modelos de mensagem do Atende Aí.';
end $$;
