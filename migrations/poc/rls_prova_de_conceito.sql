-- =============================================================================
--  PROVA DE CONCEITO — Isolamento entre clientes com RLS
--
--  Objetivo: demonstrar que, com Row Level Security, a MESMA consulta sem
--  filtro devolve dados diferentes conforme quem pergunta — e que uma
--  tentativa deliberada de ler o cliente errado devolve zero linhas.
--
--  Segurança desta prova:
--    - Cria tudo no schema `poc`. NÃO toca materials, users nem nada real.
--    - É reversível: veja rls_prova_limpeza.sql para apagar.
--    - É auto-verificável: se o isolamento falhar, o script ABORTA com erro.
--
--  Como rodar: cole inteiro no SQL Editor do Supabase e execute.
--  Resultado esperado no final: seis avisos "OK" e a mensagem PROVA CONCLUÍDA.
-- =============================================================================

create schema if not exists poc;

-- -----------------------------------------------------------------------------
--  1. Estrutura mínima: duas empresas, cada uma com seus materiais
-- -----------------------------------------------------------------------------
drop table if exists poc.materials cascade;
drop table if exists poc.organizations cascade;

create table poc.organizations (
  id   uuid primary key,
  nome text not null
);

create table poc.materials (
  id              bigserial primary key,
  organization_id uuid not null references poc.organizations (id),
  nome            text not null,
  saldo           numeric not null default 0
);

insert into poc.organizations (id, nome) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Imobiliária São Severino'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'Construtora Alfa');

insert into poc.materials (organization_id, nome, saldo) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'CIMENTO CP-II 50KG',      120),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'ABRAÇADEIRA DE NILON',    208),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'VERGALHÃO CA-50 10MM',     40),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'TELA SOLDADA Q-196',       15),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'ESPAÇADOR PLÁSTICO',      500);

-- -----------------------------------------------------------------------------
--  2. De onde vem a identidade do cliente
--
--  O PostgREST expõe as claims do JWT em `request.jwt.claims`. A API assinaria
--  um token contendo organization_id, e é ISSO que o banco lê. O aplicativo não
--  precisa (e não consegue) mentir sobre qual cliente está pedindo.
-- -----------------------------------------------------------------------------
--  O nullif() de fora é obrigatório: quando não há token, current_setting()
--  devolve string vazia, e ''::json levanta "invalid input syntax for type
--  json" — a consulta explodiria em vez de simplesmente não retornar nada.
--  Uma falha aqui precisa FECHAR o acesso, não derrubar a requisição.
create or replace function poc.current_org() returns uuid
  language sql
  stable
as $$
  select nullif(
    nullif(current_setting('request.jwt.claims', true), '')::json ->> 'organization_id',
    ''
  )::uuid
$$;

-- -----------------------------------------------------------------------------
--  3. A política. Escrita UMA vez; vale para toda consulta à tabela.
-- -----------------------------------------------------------------------------
-- A tabela de contas também fica fechada: nenhuma prova precisa lê-la, e
-- deixá-la aberta é justamente o alerta que o Supabase levanta.
alter table poc.organizations enable row level security;

alter table poc.materials enable row level security;

-- FORCE faz a regra valer inclusive para o dono da tabela. Sem isso, o próprio
-- owner continuaria enxergando tudo e a prova seria falsa.
alter table poc.materials force row level security;

drop policy if exists isolamento_por_organizacao on poc.materials;
create policy isolamento_por_organizacao on poc.materials
  using      (organization_id = poc.current_org())   -- o que pode LER
  with check (organization_id = poc.current_org());  -- o que pode ESCREVER

-- O papel que o PostgREST usa para requisições autenticadas.
grant usage on schema poc to authenticated;
grant select, insert, update, delete on poc.materials to authenticated;
grant select on poc.organizations to authenticated;
grant usage, select on sequence poc.materials_id_seq to authenticated;


-- =============================================================================
--  4. AS PROVAS
--
--  Cada bloco assume a identidade de um cliente e verifica o comportamento.
--  Qualquer desvio levanta exceção e interrompe o script.
-- =============================================================================

-- ---------- PROVA 1: a mesma consulta sem filtro vê coisas diferentes --------
do $$
declare
  vistos_por_a int;
  vistos_por_b int;
begin
  set local role authenticated;

  perform set_config('request.jwt.claims',
    '{"organization_id":"aaaaaaaa-0000-0000-0000-000000000001"}', true);
  -- Repare: NÃO há WHERE nenhum. É a consulta "esquecida" do dia a dia.
  select count(*) into vistos_por_a from poc.materials;

  perform set_config('request.jwt.claims',
    '{"organization_id":"bbbbbbbb-0000-0000-0000-000000000002"}', true);
  select count(*) into vistos_por_b from poc.materials;

  if vistos_por_a <> 2 then
    raise exception 'FALHOU: São Severino deveria ver 2 materiais, viu %', vistos_por_a;
  end if;
  if vistos_por_b <> 3 then
    raise exception 'FALHOU: Construtora Alfa deveria ver 3 materiais, viu %', vistos_por_b;
  end if;

  raise notice 'OK 1 — "select * from materials" sem filtro: São Severino vê % linha(s), Alfa vê % linha(s). A tabela tem 5.',
    vistos_por_a, vistos_por_b;
end $$;

-- ---------- PROVA 2: tentar ler o outro cliente de propósito -----------------
do $$
declare
  vazou int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    '{"organization_id":"bbbbbbbb-0000-0000-0000-000000000002"}', true);

  -- A Alfa pede explicitamente os dados da São Severino.
  select count(*) into vazou
  from poc.materials
  where organization_id = 'aaaaaaaa-0000-0000-0000-000000000001';

  if vazou <> 0 then
    raise exception 'FALHOU: vazaram % linha(s) da outra empresa', vazou;
  end if;

  raise notice 'OK 2 — pedido explícito pelos dados da outra empresa devolveu 0 linha(s).';
end $$;

-- ---------- PROVA 3: nem por nome, nem por id direto -------------------------
do $$
declare
  achou int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    '{"organization_id":"bbbbbbbb-0000-0000-0000-000000000002"}', true);

  -- Sabendo o nome exato de um material da concorrente.
  select count(*) into achou from poc.materials where nome = 'CIMENTO CP-II 50KG';
  if achou <> 0 then
    raise exception 'FALHOU: busca por nome alcançou material de outra empresa';
  end if;

  raise notice 'OK 3 — busca pelo nome exato de um material da outra empresa: 0 resultado(s).';
end $$;

-- ---------- PROVA 4: não dá para gravar no cliente errado --------------------
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    '{"organization_id":"bbbbbbbb-0000-0000-0000-000000000002"}', true);

  begin
    insert into poc.materials (organization_id, nome, saldo)
    values ('aaaaaaaa-0000-0000-0000-000000000001', 'MATERIAL PLANTADO', 1);
    raise exception 'FALHOU: conseguiu inserir material na outra empresa';
  exception
    when insufficient_privilege then
      raise notice 'OK 4 — inserir material na outra empresa foi barrado pela política.';
  end;
end $$;

-- ---------- PROVA 5: não dá para alterar nem apagar o dado alheio ------------
do $$
declare
  alteradas int;
  apagadas int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    '{"organization_id":"bbbbbbbb-0000-0000-0000-000000000002"}', true);

  update poc.materials set saldo = 0 where nome = 'CIMENTO CP-II 50KG';
  get diagnostics alteradas = row_count;

  delete from poc.materials where organization_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  get diagnostics apagadas = row_count;

  if alteradas <> 0 or apagadas <> 0 then
    raise exception 'FALHOU: alterou % e apagou % linha(s) da outra empresa', alteradas, apagadas;
  end if;

  raise notice 'OK 5 — UPDATE e DELETE contra a outra empresa afetaram 0 linha(s) (sem erro, apenas invisíveis).';
end $$;

-- ---------- PROVA 6: sem identidade, não se vê nada --------------------------
do $$
declare
  sem_contexto int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', '', true);

  select count(*) into sem_contexto from poc.materials;

  if sem_contexto <> 0 then
    raise exception 'FALHOU: sem identidade ainda viu % linha(s)', sem_contexto;
  end if;

  raise notice 'OK 6 — requisição sem organization_id no token: 0 linha(s). Falha fecha, não abre.';
end $$;

-- ---------- Confirmação de que os dados continuam lá -------------------------
do $$
declare
  total int;
begin
  -- O script inteiro roda numa transação só, então o `set local role` da prova
  -- anterior ainda vale aqui. Sem voltar ao papel original, esta contagem sairia
  -- como 0 e pareceria que os dados sumiram.
  reset role;
  perform set_config('request.jwt.claims', '', true);

  select count(*) into total from poc.materials;

  raise notice '---';
  raise notice 'PROVA CONCLUÍDA. A tabela tem % linhas no total; nenhum cliente conseguiu ver todas.', total;
  raise notice 'Os dados continuam intactos — o que muda é quem enxerga o quê.';
  raise notice 'Para apagar tudo isto: migrations/poc/rls_prova_limpeza.sql';
end $$;
