-- =============================================================================
--  Fase 2b (passo 4) — o servidor assume o saldo; o gatilho sai
--
--  Com o servidor novo no ar, toda gravação de saldo passa por uma função só
--  (gravarSaldos), que atualiza stock_balances E as colunas antigas. O gatilho
--  da 010 ficou redundante: ele reescreve stock_balances a partir das colunas
--  com o mesmo valor que o servidor acabou de gravar.
--
--  Redundante não seria motivo para tirar. O motivo é outro: o gatilho PARA DE
--  PROPÓSITO assim que existir um segundo depósito CENTRAL — foi desenhado
--  para não escolher no chute. Isso significa que criar a unidade de Natal,
--  que é o objetivo de tudo isto, travaria toda entrada e consumo do sistema.
--  Ele precisa sair antes da primeira unidade nova existir.
--
--  QUANDO RODAR
--  Depois que o deploy do servidor novo estiver confirmado no ar. Se rodar
--  antes, o código antigo em produção continua gravando só as colunas e
--  stock_balances para de acompanhar. Esta migração confere isso: se as
--  movimentações mais recentes não tiverem depósito, ela se recusa a rodar.
--
--  Pré-requisito: migração 010 e deploy do servidor da Fase 2b.
-- =============================================================================

-- -----------------------------------------------------------------------------
--  0. O servidor novo está mesmo no ar?
--
--  O servidor novo grava origem/destino em cada movimentação; o antigo não.
--  Se a movimentação mais recente (fora as administrativas) veio sem depósito,
--  quem gravou foi o código antigo — e tirar o gatilho agora deixaria o saldo
--  por depósito envelhecer em silêncio.
-- -----------------------------------------------------------------------------
do $$
declare
  ultima record;
begin
  if not exists (select 1 from pg_trigger where tgname = 'sincroniza_saldo_ao_alterar') then
    raise notice 'Gatilho já não existe — esta migração já rodou. Seguindo só com o preenchimento.';
    return;
  end if;

  select id, tipo_operacao, created_at, warehouse_origem_id, warehouse_destino_id into ultima
  from material_movements
  where tipo_operacao not in ('EXCLUSÃO', 'UNIFICACAO')
  order by created_at desc, id desc
  limit 1;

  if ultima.id is not null
     and ultima.warehouse_origem_id is null
     and ultima.warehouse_destino_id is null then
    raise exception 'A movimentação mais recente (% #%, em %) veio SEM depósito — o servidor novo ainda não está no ar. Confirme o deploy, faça uma movimentação qualquer e rode de novo.',
      ultima.tipo_operacao, ultima.id, ultima.created_at;
  end if;

  raise notice 'OK — a movimentação mais recente (% #%) tem depósito: servidor novo confirmado.',
    ultima.tipo_operacao, ultima.id;
end $$;


-- -----------------------------------------------------------------------------
--  1. Preenche origem/destino no que o código antigo gravou entre a 009 e o
--     deploy. Mesma regra do backfill da 009; só toca no que está nulo.
-- -----------------------------------------------------------------------------
do $$
declare
  central constant uuid := 'd0000000-0000-4000-8000-00000000000c';
  obra    constant uuid := 'd0000000-0000-4000-8000-00000000000b';
  n int := 0;
  parcial int;
begin
  update material_movements set warehouse_destino_id = central
   where tipo_operacao in ('ENTRADA_CENTRAL', 'ENTRADA') and warehouse_destino_id is null;
  get diagnostics parcial = row_count; n := n + parcial;

  update material_movements set warehouse_origem_id = central
   where tipo_operacao = 'SAIDA' and warehouse_origem_id is null;
  get diagnostics parcial = row_count; n := n + parcial;

  update material_movements set warehouse_origem_id = obra
   where tipo_operacao = 'CONSUMO_OBRA' and warehouse_origem_id is null;
  get diagnostics parcial = row_count; n := n + parcial;

  update material_movements set warehouse_origem_id = central, warehouse_destino_id = obra
   where tipo_operacao = 'REMESSA_OBRA' and warehouse_origem_id is null;
  get diagnostics parcial = row_count; n := n + parcial;

  update material_movements set warehouse_origem_id = obra, warehouse_destino_id = central
   where tipo_operacao in ('DEVOLUCAO_CENTRAL', 'DEVOLUCAO') and warehouse_origem_id is null;
  get diagnostics parcial = row_count; n := n + parcial;

  update material_movements set warehouse_destino_id = central
   where tipo_operacao in ('AJUSTE_CENTRAL', 'AJUSTE MANUAL') and warehouse_destino_id is null;
  get diagnostics parcial = row_count; n := n + parcial;

  update material_movements set warehouse_destino_id = obra
   where tipo_operacao = 'AJUSTE_OBRA' and warehouse_destino_id is null;
  get diagnostics parcial = row_count; n := n + parcial;

  raise notice 'Preenchidas % movimentação(ões) que vieram do código antigo.', n;
end $$;


-- -----------------------------------------------------------------------------
--  2. O gatilho sai. O servidor é o único que grava saldo a partir daqui.
-- -----------------------------------------------------------------------------
drop trigger if exists sincroniza_saldo_ao_criar   on materials;
drop trigger if exists sincroniza_saldo_ao_alterar on materials;
drop function if exists sincroniza_saldo_por_deposito();
drop function if exists deposito_do_tipo(uuid, text);


-- =============================================================================
--  CONFERÊNCIA
-- =============================================================================
do $$
declare
  sem_deposito int;
  divergentes  int;
begin
  select count(*) into sem_deposito
  from material_movements
  where warehouse_origem_id is null and warehouse_destino_id is null
    and tipo_operacao not in ('EXCLUSÃO', 'UNIFICACAO');

  if sem_deposito > 0 then
    raise exception 'FALHOU: % movimentação(ões) continuam sem depósito.', sem_deposito;
  end if;

  select count(*) into divergentes
  from materials m
  left join (select material_id, sum(saldo) s from stock_balances group by material_id) b
    on b.material_id = m.id
  where coalesce(b.s, -1) <> coalesce(m.saldo_central, 0) + coalesce(m.saldo_obra, 0);

  if divergentes > 0 then
    raise exception 'FALHOU: % material(is) com saldo divergente — não é hora de tirar o gatilho.', divergentes;
  end if;

  if exists (select 1 from pg_trigger where tgname in ('sincroniza_saldo_ao_criar', 'sincroniza_saldo_ao_alterar')) then
    raise exception 'FALHOU: gatilho ainda existe.';
  end if;

  raise notice 'CONFERIDO — 0 movimentações sem depósito, 0 materiais divergentes, gatilho removido.';
  raise notice '---';
  raise notice 'O servidor é o único que grava saldo. Já dá para criar uma segunda unidade.';
end $$;
