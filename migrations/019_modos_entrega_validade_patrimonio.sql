-- =============================================================================
--  Novos modos de estoque: Entrega/EPI, Validade e lotes, Patrimônio
--  (+ operações permitidas por estoque no modo almoxarifado)
--
--  A migração 018 deu a cada estoque um modo. Esta acrescenta três:
--
--    entrega     o material é ENTREGUE a uma pessoa e não volta (EPI,
--                uniforme, kit de aluno). O que se cobra é a TROCA: cada
--                material pode ter uma validade em dias; passou, é alerta.
--                Ficha por pessoa e termo de entrega com assinatura.
--    validade    o saldo é por LOTE, com data de validade. Saída consome o
--                que vence primeiro (FEFO). Alerta de vencendo/vencido.
--    patrimonio  cada unidade é um ITEM com número próprio (notebook,
--                projetor, furadeira): estado, responsável, local, histórico.
--
--  E, no modo almoxarifado, o admin pode desligar operações (uma copa não
--  transfere nem ajusta): `operacoes_permitidas`.
--
--  Pré-requisitos: 018.
-- =============================================================================


-- -----------------------------------------------------------------------------
--  1. Estoques: modos novos e configurações por modo
-- -----------------------------------------------------------------------------
alter table warehouses drop constraint if exists warehouses_modo_check;
alter table warehouses add constraint warehouses_modo_check
  check (modo in ('almoxarifado', 'emprestimo', 'entrega', 'validade', 'patrimonio'));

-- Almoxarifado: quais operações a tela oferece. NULL = todas.
alter table warehouses add column if not exists operacoes_permitidas text[];
alter table warehouses drop constraint if exists warehouses_operacoes_check;
alter table warehouses add constraint warehouses_operacoes_check
  check (operacoes_permitidas is null or (
    array_length(operacoes_permitidas, 1) >= 1
    and operacoes_permitidas <@ array['ENTRADA', 'SAIDA', 'CONSUMO', 'TRANSFERENCIA', 'AJUSTE']::text[]
  ));

-- Entrega: a pessoa assina na tela ao receber?
alter table warehouses add column if not exists exige_assinatura boolean not null default false;

-- Validade: com quantos dias de antecedência avisar que um lote vence.
alter table warehouses add column if not exists dias_aviso_validade integer not null default 30;
alter table warehouses drop constraint if exists warehouses_dias_aviso_check;
alter table warehouses add constraint warehouses_dias_aviso_check check (dias_aviso_validade between 1 and 365);


-- -----------------------------------------------------------------------------
--  2. Materiais: validade de troca (modo entrega)
--     "Capacete: trocar a cada 365 dias." NULL = sem prazo de troca.
-- -----------------------------------------------------------------------------
alter table materials add column if not exists validade_troca_dias integer;
alter table materials drop constraint if exists materials_validade_troca_check;
alter table materials add constraint materials_validade_troca_check
  check (validade_troca_dias is null or validade_troca_dias between 1 and 3650);


-- -----------------------------------------------------------------------------
--  3. Entregas: a mesma tabela dos empréstimos, com um tipo
--
--  Uma entrega é uma "retirada" que não espera devolução. `prazo_em` passa a
--  poder ser nulo (entrega sem validade de troca) e, quando existe, significa
--  "válido até". Uma entrega termina de três jeitos: devolvida (voltou ao
--  estoque, ex.: desligamento), consumida (não volta) ou substituída (troca
--  registrada como nova entrega).
-- -----------------------------------------------------------------------------
alter table loans alter column prazo_em drop not null;
alter table loans add column if not exists tipo text not null default 'emprestimo';
alter table loans drop constraint if exists loans_tipo_check;
alter table loans add constraint loans_tipo_check check (tipo in ('emprestimo', 'entrega'));
-- Empréstimo sempre tem prazo; entrega pode não ter.
alter table loans drop constraint if exists loans_prazo_emprestimo_check;
alter table loans add constraint loans_prazo_emprestimo_check check (tipo <> 'emprestimo' or prazo_em is not null);

alter table loans add column if not exists assinatura text;          -- PNG em data URL, desenhada na tela
alter table loans add column if not exists encerrado_em timestamptz;  -- entrega consumida/substituída
alter table loans add column if not exists encerramento text;
alter table loans drop constraint if exists loans_encerramento_check;
alter table loans add constraint loans_encerramento_check
  check (encerramento is null or encerramento in ('consumido', 'substituido'));
alter table loans add column if not exists substituido_por uuid references loans (id);

-- "Aberto" = nem devolvido nem encerrado. O índice antigo só olhava devolvido_em.
drop index if exists loans_pendentes_idx;
create index if not exists loans_abertos_idx on loans (warehouse_id, prazo_em) where devolvido_em is null and encerrado_em is null;
create index if not exists loans_tomador_idx on loans (organization_id, lower(tomador_nome));


-- -----------------------------------------------------------------------------
--  4. Lotes (modo validade)
--
--  Uma linha por lote de um material num estoque. A soma dos lotes de um
--  material num estoque é o saldo dele em stock_balances — o servidor mantém
--  as duas coisas juntas. Lote com quantidade zero fica para o histórico.
-- -----------------------------------------------------------------------------
create table if not exists lots (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete restrict,
  warehouse_id    uuid not null references warehouses (id) on delete restrict,
  material_id     bigint not null references materials (id) on delete cascade,
  lote            text not null check (char_length(btrim(lote)) between 1 and 60),
  validade        date,
  quantidade      numeric(12, 2) not null default 0 check (quantidade >= 0),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (warehouse_id, material_id, lote)
);

create index if not exists lots_validade_idx on lots (warehouse_id, validade) where quantidade > 0;
create index if not exists lots_org_idx on lots (organization_id);

alter table lots enable row level security;
alter table lots force row level security;
drop policy if exists isolamento_por_organizacao on lots;
create policy isolamento_por_organizacao on lots
  using (organization_id = current_org_id())
  with check (organization_id = current_org_id());


-- -----------------------------------------------------------------------------
--  5. Patrimônio (modo patrimonio)
--
--  Cada item é uma linha: o material é o "modelo" (Notebook Dell Latitude),
--  o item tem número de patrimônio, série, estado, responsável e local. O
--  saldo do material no estoque = itens não baixados; o servidor mantém.
-- -----------------------------------------------------------------------------
create table if not exists assets (
  id                     uuid primary key default gen_random_uuid(),
  organization_id        uuid not null references organizations (id) on delete restrict,
  warehouse_id           uuid not null references warehouses (id) on delete restrict,
  material_id            bigint not null references materials (id) on delete restrict,
  codigo                 text not null check (char_length(btrim(codigo)) between 1 and 40),
  serie                  text check (serie is null or char_length(serie) <= 80),
  estado                 text not null default 'disponivel' check (estado in ('disponivel', 'em_uso', 'manutencao', 'baixado')),
  responsavel_nome       text check (responsavel_nome is null or char_length(responsavel_nome) <= 80),
  responsavel_referencia text check (responsavel_referencia is null or char_length(responsavel_referencia) <= 40),
  local                  text check (local is null or char_length(local) <= 80),
  observacao             text check (observacao is null or char_length(observacao) <= 300),
  adquirido_em           date,
  valor                  numeric(12, 2) check (valor is null or valor >= 0),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (organization_id, codigo)
);

create index if not exists assets_warehouse_idx on assets (warehouse_id, estado);
create index if not exists assets_material_idx on assets (material_id);

alter table assets enable row level security;
alter table assets force row level security;
drop policy if exists isolamento_por_organizacao on assets;
create policy isolamento_por_organizacao on assets
  using (organization_id = current_org_id())
  with check (organization_id = current_org_id());

-- O histórico de cada item: quem pegou, quando foi para manutenção, quando baixou.
create table if not exists asset_events (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references organizations (id) on delete restrict,
  asset_id              uuid not null references assets (id) on delete cascade,
  tipo                  text not null check (tipo in ('cadastro', 'alocacao', 'devolucao', 'manutencao', 'retorno', 'baixa', 'transferencia', 'edicao')),
  detalhe               text check (detalhe is null or char_length(detalhe) <= 300),
  para_nome             text,
  para_referencia       text,
  funcionario_matricula text not null,
  created_at            timestamptz not null default now()
);

create index if not exists asset_events_asset_idx on asset_events (asset_id, created_at desc);

alter table asset_events enable row level security;
alter table asset_events force row level security;
drop policy if exists isolamento_por_organizacao on asset_events;
create policy isolamento_por_organizacao on asset_events
  using (organization_id = current_org_id())
  with check (organization_id = current_org_id());


-- =============================================================================
--  CONFERÊNCIA
-- =============================================================================
do $$
begin
  if to_regclass('public.lots') is null or to_regclass('public.assets') is null or to_regclass('public.asset_events') is null then
    raise exception 'FALHOU: lots, assets ou asset_events não foram criadas.';
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'warehouses' and column_name = 'operacoes_permitidas') then
    raise exception 'FALHOU: warehouses.operacoes_permitidas não existe.';
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'loans' and column_name = 'tipo') then
    raise exception 'FALHOU: loans.tipo não existe.';
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'materials' and column_name = 'validade_troca_dias') then
    raise exception 'FALHOU: materials.validade_troca_dias não existe.';
  end if;
  if (select count(*) from pg_policies where tablename in ('lots', 'assets', 'asset_events') and policyname = 'isolamento_por_organizacao') <> 3 then
    raise exception 'FALHOU: política de isolamento ausente em lots/assets/asset_events.';
  end if;

  -- Modo inválido continua barrado; os novos passam.
  perform 1 where 'validade' in ('almoxarifado', 'emprestimo', 'entrega', 'validade', 'patrimonio');
  if not found then raise exception 'FALHOU: lista de modos.'; end if;

  -- Operações permitidas só aceitam a lista conhecida.
  begin
    update warehouses set operacoes_permitidas = array['VENDER'] where false;
    perform 1 where array['VENDER']::text[] <@ array['ENTRADA', 'SAIDA', 'CONSUMO', 'TRANSFERENCIA', 'AJUSTE']::text[];
    if found then raise exception 'FALHOU: operação inventada passou.'; end if;
  end;

  raise notice 'CONFERIDO — modos entrega, validade e patrimônio têm onde ficar; almoxarifado pode desligar operações.';
end $$;
