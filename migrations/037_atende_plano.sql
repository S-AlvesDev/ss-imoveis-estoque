-- =============================================================================
--  037 — O plano do Atende Aí (SEVLA INFINITY, Fase 3)
--
--  A empresa do Atende Aí ganha o mesmo shape de assinatura que a organização
--  do Stok Aí tem em `organizations` (migrações 020/021/022): `plano`,
--  `plano_desde`, `plano_ate`, `avaliacao_ate` e `cobranca`. A regra que lê
--  esses campos é a MESMA função pura (situacaoDaConta em src/shared/planos.ts):
--  7 dias de avaliação com tudo liberado, depois plano; carência de 2 dias.
--
--  A intenção de contratar fica em `atende_assinaturas`, tabela própria do
--  produto — não em `assinaturas` (que é do Stok Aí): as rotinas do Stok
--  (recibo, nota fiscal, webhook) varrem aquela tabela sem filtro de produto,
--  e um pedido do Atende lá dentro viraria recibo do Stok. Quando o gateway
--  for ligado para o Atende, o webhook procura o `mp_preapproval_id` aqui.
--
--  Aditiva e idempotente. Nenhuma linha apagada, nenhuma senha tocada.
-- =============================================================================

-- ---- O plano na empresa ------------------------------------------------------
alter table atende_empresas add column if not exists plano text;
alter table atende_empresas drop constraint if exists atende_empresas_plano_check;
alter table atende_empresas add constraint atende_empresas_plano_check
  check (plano is null or plano in ('essencial', 'profissional', 'empresarial'));

alter table atende_empresas add column if not exists plano_desde timestamptz;
alter table atende_empresas add column if not exists plano_ate timestamptz;
-- Fim da avaliação. Nasce preenchido para empresa nova (7 dias); quem já tem plano não usa.
alter table atende_empresas add column if not exists avaliacao_ate timestamptz default (now() + interval '7 days');
alter table atende_empresas add column if not exists cobranca text;
alter table atende_empresas drop constraint if exists atende_empresas_cobranca_check;
alter table atende_empresas add constraint atende_empresas_cobranca_check
  check (cobranca is null or cobranca in ('cartao', 'avulso'));

-- Empresas de antes da cobrança existir ganham 7 dias a partir de agora, como o Stok fez na 021.
update atende_empresas set avaliacao_ate = now() + interval '7 days' where avaliacao_ate is null and plano is null;

-- ---- A intenção de contratar -------------------------------------------------
create table if not exists atende_assinaturas (
  id                  uuid primary key default gen_random_uuid(),
  empresa_id          uuid not null references atende_empresas (id) on delete restrict,
  plano               text not null check (plano in ('essencial', 'profissional', 'empresarial')),
  ciclo               text not null check (ciclo in ('mensal', 'anual')),
  -- Por mês, no ciclo escolhido, em reais — o que a pessoa viu na tela ao pedir.
  valor               numeric(10, 2) not null check (valor >= 0),
  -- Id da assinatura (preapproval) no Mercado Pago. Nulo enquanto não há gateway para o Atende.
  mp_preapproval_id   text unique,
  mp_plan_id          text,
  status              text not null default 'pendente' check (status in ('pendente', 'autorizada', 'pausada', 'cancelada')),
  -- Quem pediu (o administrador) e o e-mail de cobrança.
  pedido_por          bigint references atende_usuarios (id) on delete set null,
  payer_email         text,
  proxima_cobranca    timestamptz,
  autorizada_em       timestamptz,
  cancelada_em        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists atende_assinaturas_empresa_idx on atende_assinaturas (empresa_id, created_at desc);

alter table atende_assinaturas enable row level security;
alter table atende_assinaturas force row level security;
drop policy if exists isolamento_por_empresa on atende_assinaturas;
create policy isolamento_por_empresa on atende_assinaturas
  using (empresa_id = atende_empresa_atual())
  with check (empresa_id = atende_empresa_atual());

-- =============================================================================
--  CONFERÊNCIA
-- =============================================================================
do $$
begin
  if not exists (select 1 from information_schema.columns where table_name = 'atende_empresas' and column_name = 'avaliacao_ate') then
    raise exception 'FALHOU: atende_empresas.avaliacao_ate não existe.';
  end if;
  if to_regclass('public.atende_assinaturas') is null then
    raise exception 'FALHOU: atende_assinaturas não foi criada.';
  end if;
  if not exists (select 1 from pg_policies where tablename = 'atende_assinaturas' and policyname = 'isolamento_por_empresa') then
    raise exception 'FALHOU: política de isolamento ausente em atende_assinaturas.';
  end if;
  if exists (select 1 from atende_empresas where plano is null and avaliacao_ate is null) then
    raise exception 'FALHOU: há empresa sem plano e sem avaliação.';
  end if;
  raise notice 'OK: plano na empresa do Atende Aí (avaliação de 7 dias) e atende_assinaturas prontos.';
end $$;
