-- =============================================================================
--  050 — Atende Aí: desligar a IA para um contato específico
--
--  Até aqui a triagem da IA era tudo ou nada: `atende_empresas.triagem_ativa`
--  ligava e desligava para a empresa inteira. Mas o número da imobiliária
--  também conversa com gente que não é cliente — o gerente, o contador, um
--  parceiro, o próprio dono. Para essas pessoas a IA não deve responder nem
--  classificar: a conversa tem que cair direto na fila, como se a triagem
--  estivesse desligada.
--
--  `ia_ativa` é por contato e nasce `true`: quem já existe continua
--  exatamente como estava. Desligar não apaga histórico nem fecha a
--  conversa — só tira a IA do caminho daquele contato.
--
--  Grupos não precisam de nada disso: o webhook já os descarta antes,
--  porque `telefoneDoJid` só aceita JID de conversa individual
--  (@s.whatsapp.net), e grupo é @g.us.
-- =============================================================================

alter table atende_clientes
  add column if not exists ia_ativa boolean not null default true;

comment on column atende_clientes.ia_ativa is
  'false = a triagem da IA não roda para este contato; a conversa vai direto para a fila.';
