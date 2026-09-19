-- =============================================================================
--  039 — Atende Aí: avaliação do atendimento (0 a 10)
--
--  Ao encerrar, quem atende pode mandar a despedida (escrita pela IA) com o
--  pedido de nota. O cliente responde com o número pelo WhatsApp; o webhook
--  reconhece a resposta, grava na conversa (sem reabri-la) e agradece.
--  O dashboard e a supervisão mostram média, distribuição e os atendimentos
--  mais bem avaliados, por pessoa.
--
--  Aditiva e idempotente.
-- =============================================================================

alter table atende_conversas add column if not exists avaliacao_pedida_em timestamptz;
alter table atende_conversas add column if not exists avaliacao_nota smallint;
alter table atende_conversas drop constraint if exists atende_conversas_avaliacao_nota_check;
alter table atende_conversas add constraint atende_conversas_avaliacao_nota_check check (avaliacao_nota is null or (avaliacao_nota between 0 and 10));
alter table atende_conversas add column if not exists avaliacao_em timestamptz;
-- Se o cliente mandou a nota com um comentário ("10, muito atenciosa"), o comentário fica aqui.
alter table atende_conversas add column if not exists avaliacao_comentario text;

create index if not exists atende_conversas_avaliacao_idx on atende_conversas (empresa_id, avaliacao_em desc) where avaliacao_nota is not null;

do $$
begin
  if not exists (select 1 from information_schema.columns where table_name = 'atende_conversas' and column_name = 'avaliacao_nota') then
    raise exception 'FALHOU: atende_conversas.avaliacao_nota não existe.';
  end if;
  raise notice 'OK: avaliação do atendimento pronta no Atende Aí.';
end $$;
