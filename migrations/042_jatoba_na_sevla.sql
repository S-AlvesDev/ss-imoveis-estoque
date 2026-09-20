-- =============================================================================
--  042 — O Jatobá também na SEVLA INFINITY
--
--  O diário do assistente (jatoba_mensagens, migração 028) ganha os canais da
--  SEVLA: a página da casa (/cloud) tira dúvidas sobre o ecossistema, e a
--  Minha SEVLA responde sobre a conta, os produtos e as assinaturas da pessoa.
--
--  Aditiva e idempotente.
-- =============================================================================

alter table jatoba_mensagens drop constraint if exists jatoba_mensagens_canal_check;
alter table jatoba_mensagens add constraint jatoba_mensagens_canal_check
  check (canal in ('home', 'painel', 'atende-home', 'atende-painel', 'sevla-home', 'sevla-conta'));

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'jatoba_mensagens_canal_check') then
    raise exception 'FALHOU: a restrição de canal do jatoba_mensagens não existe.';
  end if;
  raise notice 'OK: o Jatobá pode registrar as conversas da SEVLA.';
end $$;
