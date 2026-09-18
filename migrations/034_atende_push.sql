-- =============================================================================
--  034 — Atende Aí: notificações por push
--
--  Cada aparelho em que a pessoa ativou as notificações vira uma inscrição
--  (Web Push): o endpoint do navegador e as chaves para cifrar a mensagem.
--  O servidor avisa "cliente respondeu" e "nova conversa na fila" mesmo com
--  o Atende fechado. Inscrição que o navegador descartou (404/410) é apagada
--  na hora de enviar.
-- =============================================================================

create table if not exists atende_push_inscricoes (
  id           uuid primary key default gen_random_uuid(),
  empresa_id   uuid not null references atende_empresas (id) on delete cascade,
  usuario_id   bigint not null references atende_usuarios (id) on delete cascade,
  endpoint     text not null unique,
  p256dh       text not null,
  auth         text not null,
  aparelho     text,
  criado_em    timestamptz not null default now(),
  usado_em     timestamptz
);

create index if not exists atende_push_inscricoes_usuario_idx on atende_push_inscricoes (usuario_id);

alter table atende_push_inscricoes enable row level security;
alter table atende_push_inscricoes force row level security;
drop policy if exists isolamento_por_empresa on atende_push_inscricoes;
create policy isolamento_por_empresa on atende_push_inscricoes using (empresa_id = atende_empresa_atual()) with check (empresa_id = atende_empresa_atual());

do $$
begin
  if to_regclass('public.atende_push_inscricoes') is null then
    raise exception 'FALHOU: atende_push_inscricoes não existe.';
  end if;
  raise notice 'OK: 034 aplicada — inscrições de push do Atende Aí prontas.';
end $$;
