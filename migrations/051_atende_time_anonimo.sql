-- =============================================================================
--  051 — Atende Aí: time anônimo (a mensagem sai sem o nome de quem escreveu)
--
--  O que vai para o cliente no WhatsApp sai assinado por quem escreveu:
--
--      Samuel Alves:
--      Oi, bom dia!
--
--  Isso é bom no atendimento comum — o cliente sabe com quem fala. Mas há
--  setor em que a equipe atende em nome da empresa, não em nome próprio
--  (plantão, cobrança, um time que se reveza no mesmo assunto). Aí a
--  assinatura atrapalha: expõe quem está na escala e deixa a conversa com
--  cara de várias pessoas diferentes.
--
--  `anonimo` é por time. Ligado, a mensagem enviada numa conversa daquele
--  time sai limpa, só com o texto. Nasce desligado: nada muda para os times
--  que já existem. Não mexe no histórico: dentro do Atende Aí a equipe
--  continua vendo quem escreveu cada mensagem — o anonimato é só para fora.
-- =============================================================================

alter table atende_times
  add column if not exists anonimo boolean not null default false;

comment on column atende_times.anonimo is
  'true = as mensagens enviadas nas conversas deste time vão ao cliente sem a assinatura de quem escreveu.';
