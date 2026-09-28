-- =============================================================================
--  056 — Stok Aí: preenche o carimbo de recontagem com o histórico que já existe
--
--  A 055 criou `recontado_em` e `recontado_por` em stock_balances, mas deixou
--  as colunas vazias, dizendo que o passado era irrecuperável. Não era.
--
--  Toda recontagem que achou divergência virou, desde sempre, um ajuste em
--  material_movements com a justificativa "Recontagem diária: ...". Isso é
--  histórico de verdade: diz qual material, em qual depósito, em que dia e
--  por quem. Sem aproveitá-lo, a aba "Falta recontar" nasceria acusando como
--  nunca conferido um monte de material que foi conferido semana passada.
--
--  Esta migração lê esse histórico e carimba a data da ÚLTIMA recontagem de
--  cada material em cada depósito. Só preenche o que está vazio: carimbo
--  posto pelo sistema novo nunca é sobrescrito. Rodar duas vezes não muda
--  nada na segunda.
--
--  O que continua fora do alcance: quem foi contado e BATEU com o sistema
--  antes da 055. Esse evento nunca foi gravado em lugar nenhum — não há de
--  onde tirar. Esses seguem como nunca recontados, e vão aparecer como
--  urgentes até passarem por uma contagem nova.
-- =============================================================================

with ultima_recontagem as (
  select distinct on (mv.material_id, mv.warehouse_destino_id)
         mv.material_id,
         mv.warehouse_destino_id  as warehouse_id,
         mv.created_at            as quando,
         mv.funcionario_matricula as quem
  from material_movements mv
  where mv.justificativa like 'Recontagem diária:%'
    and mv.warehouse_destino_id is not null
    and mv.material_id is not null
  order by mv.material_id, mv.warehouse_destino_id, mv.created_at desc
)
update stock_balances sb
set recontado_em  = u.quando,
    recontado_por = u.quem
from ultima_recontagem u
where sb.material_id  = u.material_id
  and sb.warehouse_id = u.warehouse_id
  and sb.recontado_em is null;


-- =============================================================================
--  CONFERÊNCIA
-- =============================================================================
do $$
declare
  com_carimbo   int;
  sem_carimbo   int;
  no_historico  int;
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'stock_balances' and column_name = 'recontado_em'
  ) then
    raise exception 'FALHOU: a migração 055 não foi aplicada — não existe stock_balances.recontado_em.';
  end if;

  select count(*) into com_carimbo from stock_balances where recontado_em is not null;
  select count(*) into sem_carimbo from stock_balances where recontado_em is null;

  select count(*) into no_historico
  from (
    select distinct mv.material_id, mv.warehouse_destino_id
    from material_movements mv
    where mv.justificativa like 'Recontagem diária:%'
      and mv.warehouse_destino_id is not null
      and mv.material_id is not null
  ) h;

  raise notice 'Recontagem no histórico: % pares material/depósito.', no_historico;
  raise notice 'Saldos com carimbo: %  |  ainda sem carimbo: %', com_carimbo, sem_carimbo;
  raise notice 'Os sem carimbo aparecem como Urgente na aba "Falta recontar" até a próxima contagem.';
end $$;
