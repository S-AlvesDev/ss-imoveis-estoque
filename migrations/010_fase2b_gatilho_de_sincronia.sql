-- =============================================================================
--  Fase 2b (passo 1) — o gatilho que mantém os dois modelos em sincronia
--
--  A 009 copiou o saldo para stock_balances, mas foi uma foto: no instante
--  seguinte, qualquer entrada ou consumo mexe em saldo_central/saldo_obra e a
--  cópia envelhece. Enquanto os dois modelos coexistirem, eles precisam andar
--  juntos — senão a virada da Fase 2b vira adivinhação.
--
--  POR QUE UM GATILHO, E NÃO ESCRITA DUPLA NO SERVIDOR
--  O saldo é escrito em 4 rotas hoje. Duplicar a escrita nas 4 significa que a
--  5ª rota que alguém escrever amanhã vai esquecer — e o erro só aparece meses
--  depois, num número errado que ninguém sabe explicar. No gatilho, a sincronia
--  é atômica com a própria alteração: ou as duas acontecem, ou nenhuma.
--
--  Esta migração NÃO muda comportamento nenhum. saldo_central e saldo_obra
--  continuam sendo a verdade operacional; stock_balances passa a ser um espelho
--  fiel, pronto para assumir quando o servidor virar.
--
--  FALHA FECHA
--  Se o gatilho não souber para qual depósito escrever, ele levanta erro em vez
--  de ignorar em silêncio. Um saldo que deixa de sincronizar sem avisar é o pior
--  resultado possível: os números divergem devagar e ninguém percebe.
--
--  COMO FOI TESTADO
--  Contra PostgreSQL real, com as colunas de saldo na MESMA escala da produção
--  (2 casas) — a primeira versão deste teste usava numeric sem escala, aprovou
--  a migração, e o banco real a reprovou por arredondamento. Réplica infiel
--  testa outro sistema.
--
--  Exercitando as operações que o sistema faz hoje —
--  entrada na Central, consumo na Obra, remessa, ajuste por contagem, saldo
--  indo a zero, saldo ficando negativo, unificação, criação e exclusão de
--  material. Em todas, o espelho acompanhou. Também foi conferido que:
--    - excluir material não deixa saldo órfão;
--    - renomear material NÃO reescreve o espelho à toa;
--    - o rollback tira o gatilho e não encosta no saldo real.
--    - pedindo 987654.321, a coluna guarda 987654.32 e o espelho guarda o
--      mesmo — o espelho copia o que a coluna aceitou, não o que foi pedido.
--
--  E que o gatilho SABE RECUSAR: material de organização sem depósito é
--  rejeitado e a inserção é desfeita; com dois depósitos CENTRAL na mesma
--  organização ele para em vez de escolher um no chute.
--
--  Pré-requisito: migração 009.
-- =============================================================================

do $$
begin
  if to_regclass('stock_balances') is null then
    raise exception 'stock_balances não existe — rode a migração 009 antes.';
  end if;
end $$;


-- -----------------------------------------------------------------------------
--  1. Onde o saldo de cada coluna vai parar
--
--  Enquanto o servidor pensa em "central" e "obra", o gatilho precisa traduzir
--  isso para um depósito. Ele resolve pela organização do material, não por um
--  id fixo — assim uma segunda conta funciona sem alterar nada aqui.
--
--  Se houver mais de um depósito do mesmo tipo (o que acontece assim que a
--  segunda unidade existir), a função para. Nesse ponto, adivinhar o depósito
--  seria escrever saldo no lugar errado; o certo é o servidor já ter virado
--  para warehouse_id e este gatilho ter sido removido.
-- -----------------------------------------------------------------------------
create or replace function deposito_do_tipo(org uuid, o_tipo text)
  returns uuid
  language plpgsql
  stable
as $$
declare
  achados uuid[];
begin
  select array_agg(id) into achados
  from warehouses
  where organization_id = org and tipo = o_tipo and ativo;

  if achados is null then
    raise exception 'Sem depósito % para a organização %. Crie a unidade e o depósito antes de mexer no saldo.', o_tipo, org;
  end if;

  if array_length(achados, 1) > 1 then
    raise exception 'Há % depósitos % nesta organização. O gatilho de sincronia não sabe qual usar — o servidor já deveria estar usando warehouse_id (Fase 2b) e este gatilho, removido.', array_length(achados, 1), o_tipo;
  end if;

  return achados[1];
end $$;


-- -----------------------------------------------------------------------------
--  2. O gatilho
--
--  Roda depois da alteração, para o próprio saldo já estar valendo. Grava os
--  dois depósitos sempre, inclusive com zero: assim o saldo é uma consulta, e
--  nunca uma ausência a interpretar.
-- -----------------------------------------------------------------------------
create or replace function sincroniza_saldo_por_deposito()
  returns trigger
  language plpgsql
as $$
begin
  insert into stock_balances (organization_id, warehouse_id, material_id, saldo, updated_at)
  values (new.organization_id, deposito_do_tipo(new.organization_id, 'CENTRAL'),
          new.id, coalesce(new.saldo_central, 0), now())
  on conflict (warehouse_id, material_id)
    do update set saldo = excluded.saldo, updated_at = now();

  insert into stock_balances (organization_id, warehouse_id, material_id, saldo, updated_at)
  values (new.organization_id, deposito_do_tipo(new.organization_id, 'OBRA'),
          new.id, coalesce(new.saldo_obra, 0), now())
  on conflict (warehouse_id, material_id)
    do update set saldo = excluded.saldo, updated_at = now();

  return new;
end $$;

drop trigger if exists sincroniza_saldo_ao_criar on materials;
create trigger sincroniza_saldo_ao_criar
  after insert on materials
  for each row
  execute function sincroniza_saldo_por_deposito();

-- Só quando o saldo realmente muda. Renomear um material não precisa tocar
-- em stock_balances.
drop trigger if exists sincroniza_saldo_ao_alterar on materials;
create trigger sincroniza_saldo_ao_alterar
  after update on materials
  for each row
  when (old.saldo_central is distinct from new.saldo_central
     or old.saldo_obra    is distinct from new.saldo_obra)
  execute function sincroniza_saldo_por_deposito();


-- -----------------------------------------------------------------------------
--  3. O espelho precisa arredondar igual à coluna
--
--  saldo_central e saldo_obra têm escala definida (2 casas). stock_balances
--  nasceu como numeric sem escala, então aceita 3 casas onde a coluna aceita 2.
--  Hoje isso não aparece — o gatilho só copia valores que já couberam lá. Mas
--  depois da virada, quando o servidor escrever direto no espelho, o mesmo
--  lançamento passaria a guardar um valor que antes teria sido arredondado.
--  Mudança silenciosa de comportamento em cima de saldo é justamente o que não
--  pode acontecer.
--
--  O tipo é lido da própria coluna, não escrito à mão: se um dia ela mudar, o
--  espelho acompanha sozinho.
-- -----------------------------------------------------------------------------
do $$
declare
  tipo_da_coluna text;
  tipo_do_espelho text;
begin
  select case
           when numeric_precision is not null and numeric_scale is not null
             then format('numeric(%s,%s)', numeric_precision, numeric_scale)
             else 'numeric'
         end
    into tipo_da_coluna
  from information_schema.columns
  where table_schema = 'public' and table_name = 'materials' and column_name = 'saldo_central';

  select case
           when numeric_precision is not null and numeric_scale is not null
             then format('numeric(%s,%s)', numeric_precision, numeric_scale)
             else 'numeric'
         end
    into tipo_do_espelho
  from information_schema.columns
  where table_schema = 'public' and table_name = 'stock_balances' and column_name = 'saldo';

  if tipo_da_coluna is null then
    raise exception 'materials.saldo_central não encontrada.';
  end if;

  if tipo_da_coluna is distinct from tipo_do_espelho then
    execute format('alter table stock_balances alter column saldo type %s', tipo_da_coluna);
    raise notice 'Espelho ajustado de % para % — mesma escala da coluna.', tipo_do_espelho, tipo_da_coluna;
  else
    raise notice 'Espelho já usa %, igual à coluna.', tipo_do_espelho;
  end if;
end $$;


-- -----------------------------------------------------------------------------
--  4. Ressincroniza o que mudou entre a 009 e agora
--
--  Entre rodar a 009 e rodar esta migração, o estoque continuou funcionando.
--  Tudo que se mexeu nesse intervalo está desatualizado no espelho.
-- -----------------------------------------------------------------------------
insert into stock_balances (organization_id, warehouse_id, material_id, saldo, updated_at)
select m.organization_id, deposito_do_tipo(m.organization_id, 'CENTRAL'), m.id,
       coalesce(m.saldo_central, 0), now()
from materials m
on conflict (warehouse_id, material_id)
  do update set saldo = excluded.saldo, updated_at = now();

insert into stock_balances (organization_id, warehouse_id, material_id, saldo, updated_at)
select m.organization_id, deposito_do_tipo(m.organization_id, 'OBRA'), m.id,
       coalesce(m.saldo_obra, 0), now()
from materials m
on conflict (warehouse_id, material_id)
  do update set saldo = excluded.saldo, updated_at = now();


-- =============================================================================
--  CONFERÊNCIA — o gatilho funciona mesmo?
--
--  Conferir que o gatilho existe não prova nada: gatilho quebrado também
--  existe. Aqui ele é exercitado de verdade, num material real, e o valor é
--  devolvido ao original no mesmo bloco. Se algo não bater, o bloco inteiro é
--  desfeito e nada muda.
-- =============================================================================
do $$
declare
  alvo          record;
  deposito      uuid;
  gravado       numeric;
  visto         numeric;
  marca         numeric := 987654.32;
  divergentes   int;
begin
  select id, organization_id, saldo_central, saldo_obra into alvo
  from materials order by id limit 1;

  if alvo.id is null then
    raise notice 'Sem materiais para testar — nada a conferir.';
    return;
  end if;

  deposito := deposito_do_tipo(alvo.organization_id, 'CENTRAL');

  -- Mexe no saldo e confere que o espelho acompanhou.
  --
  -- A comparação é sempre contra o que a COLUNA guardou, nunca contra o valor
  -- que eu pedi para gravar. A coluna tem escala própria e arredonda; o dever do
  -- gatilho é espelhar o que ficou lá. Comparar com o valor pedido reprovava um
  -- gatilho correto — foi exatamente o que aconteceu na primeira versão disto.
  update materials set saldo_central = marca where id = alvo.id;

  select saldo_central into gravado from materials where id = alvo.id;
  select saldo into visto from stock_balances
   where material_id = alvo.id and warehouse_id = deposito;

  if visto is distinct from gravado then
    raise exception 'FALHOU: o gatilho não sincronizou. A coluna guardou %, o depósito Central tem %.', gravado, visto;
  end if;

  -- Devolve o valor original e confere que voltou também.
  update materials set saldo_central = alvo.saldo_central where id = alvo.id;

  select coalesce(saldo_central, 0) into gravado from materials where id = alvo.id;
  select saldo into visto from stock_balances
   where material_id = alvo.id and warehouse_id = deposito;

  if visto is distinct from gravado then
    raise exception 'FALHOU: o saldo não voltou ao original. A coluna tem %, o depósito tem %.', gravado, visto;
  end if;

  -- E o conjunto todo continua batendo material a material.
  select count(*) into divergentes
  from materials m
  left join (select material_id, sum(saldo) s from stock_balances group by material_id) b
    on b.material_id = m.id
  where coalesce(b.s, -1) <> coalesce(m.saldo_central, 0) + coalesce(m.saldo_obra, 0);

  if divergentes > 0 then
    raise exception 'FALHOU: % material(is) com saldo divergente depois da ressincronia.', divergentes;
  end if;

  raise notice 'CONFERIDO — o gatilho sincroniza de verdade (testado no material %).', alvo.id;
  raise notice 'Espelho em dia: 0 material divergente.';
  raise notice '---';
  raise notice 'A partir de agora stock_balances acompanha sozinho.';
  raise notice 'saldo_central/saldo_obra seguem sendo a verdade até o servidor virar.';
end $$;
