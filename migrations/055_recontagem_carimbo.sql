-- =============================================================================
--  055 — Stok Aí: registrar QUE um material foi recontado, não só a divergência
--
--  A recontagem só deixava rastro quando a contagem física discordava do
--  sistema: virava um AJUSTE em material_movements. Quem foi contado e
--  bateu não gravava nada — a tela marcava "conferido" só no localStorage
--  do aparelho de quem contou.
--
--  Resultado: não havia como responder "o que ainda não foi recontado?".
--  Material esquecido e material conferido ficavam idênticos no banco.
--
--  O carimbo mora no saldo (stock_balances), porque recontagem é por
--  material EM UM depósito: o mesmo material pode estar conferido na
--  Central e esquecido na Obra.
--
--      recontado_em   = quando a contagem física passou por ele (bata ou não)
--      recontado_por  = a matrícula de quem contou
--
--  Nulo = nunca recontado desde que isto existe. Na primeira vez tudo vai
--  aparecer como não recontado, e é verdade: o sistema não tem como saber
--  o que foi conferido antes desta migração.
-- =============================================================================

alter table stock_balances
  add column if not exists recontado_em  timestamptz,
  add column if not exists recontado_por text;

-- A tela lista, por depósito, o que está sem carimbo ou com carimbo antigo.
create index if not exists stock_balances_recontagem_idx
  on stock_balances (warehouse_id, recontado_em);

comment on column stock_balances.recontado_em is
  'Quando a contagem física passou por este material neste depósito, tendo havido divergência ou não. NULL = nunca.';
comment on column stock_balances.recontado_por is
  'Matrícula de quem fez a última recontagem deste material neste depósito.';
