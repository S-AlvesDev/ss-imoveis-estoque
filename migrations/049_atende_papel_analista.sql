-- =============================================================================
--  049 — Atende Aí: o papel `analista` passa a ser aceito pelo banco
--
--  A 048 trouxe o pipeline de MCMV e, com ele, o papel `analista` — quem
--  cuida da análise de crédito (documentos e etapa de quem está no
--  pipeline) sem abrir conversa de WhatsApp. O papel foi criado no código
--  (src/atende/shared/papeis.ts: permissões `mcmv.gerir` e
--  `documentos.clientes`), mas a trava de `atende_usuarios.papel` ficou
--  como a 029 a escreveu:
--
--      check (papel in ('admin', 'supervisor', 'atendente'))
--
--  Resultado: cadastrar ou promover alguém como Analista batia na trava do
--  Postgres (23514, check_violation). A tela mostrava só "Erro ao cadastrar
--  a pessoa." — o papel aparecia na lista, mas nunca podia ser salvo.
--
--  Esta migração refaz a trava incluindo `analista`. Nada é reescrito: os
--  papéis que já existem continuam válidos.
-- =============================================================================

alter table atende_usuarios
  drop constraint if exists atende_usuarios_papel_check;

alter table atende_usuarios
  add constraint atende_usuarios_papel_check
  check (papel in ('admin', 'supervisor', 'atendente', 'analista'));
