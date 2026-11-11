-- =============================================================================
--  058 — Atende Aí: o limite de silêncio guardado na conexão
--
--  O vigia calcula, a partir do movimento de cada empresa, quantas horas de
--  expediente caladas já são anormais para ela. Esse número também serve na
--  tela: quem está atendendo precisa saber que parou de chegar mensagem, e
--  precisa saber AGORA, não no e-mail de daqui a pouco.
--
--  Guardado aqui porque calcular custa uma contagem em atende_mensagens, e
--  a tela não pode pagar isso a cada sincronização. O cron recalcula uma vez
--  por dia; a tela só compara com `ultimo_evento_em`, que já recebe.
-- =============================================================================

alter table atende_conexoes add column if not exists limite_silencio_h numeric;
