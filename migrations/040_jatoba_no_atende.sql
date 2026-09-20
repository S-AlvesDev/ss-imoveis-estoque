-- =============================================================================
--  040 — O Jatobá também no Atende Aí
--
--  O diário do assistente (jatoba_mensagens, migração 028) ganha os canais do
--  Atende: a landing (/atende) tira dúvidas de quem ainda não é cliente, com
--  o conhecimento do Atende — e o teto diário é contado por produto.
--
--  Aditiva e idempotente.
-- =============================================================================

alter table jatoba_mensagens drop constraint if exists jatoba_mensagens_canal_check;
alter table jatoba_mensagens add constraint jatoba_mensagens_canal_check
  check (canal in ('home', 'painel', 'atende-home', 'atende-painel'));

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'jatoba_mensagens_canal_check') then
    raise exception 'FALHOU: a restrição de canal do jatoba_mensagens não existe.';
  end if;
  raise notice 'OK: o Jatobá pode registrar as conversas do Atende Aí.';
end $$;
