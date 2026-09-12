-- =============================================================================
--  021 — Assinaturas pelo Mercado Pago
--
--  Conta nova ganha 7 dias de avaliação com tudo liberado; depois precisa de
--  uma assinatura. A assinatura é criada no checkout do Mercado Pago (planos
--  do painel ou pela API) e chega aqui pelo webhook: `assinaturas` guarda
--  uma por organização, `pagamentos` cada cobrança, e `organizations.plano`/
--  `plano_ate` continuam sendo o que o servidor lê para liberar ou travar.
--  `mp_eventos` é o diário do webhook: o que chegou, se casou com uma conta.
-- =============================================================================

-- Fim da avaliação. Nasce preenchido para conta nova (7 dias); quem já tem
-- plano não usa. Contas antigas sem plano ganham 7 dias a partir de agora.
alter table organizations add column if not exists avaliacao_ate timestamptz default (now() + interval '7 days');
update organizations set avaliacao_ate = now() + interval '7 days' where avaliacao_ate is null and plano is null;

-- -----------------------------------------------------------------------------
create table if not exists assinaturas (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references organizations (id) on delete restrict,
  plano               text not null check (plano in ('essencial', 'profissional', 'empresarial')),
  ciclo               text not null check (ciclo in ('mensal', 'anual')),
  valor               numeric(10, 2) not null check (valor >= 0),
  -- Id da assinatura (preapproval) no Mercado Pago. Nulo enquanto a pessoa
  -- ainda não concluiu o checkout (intenção).
  mp_preapproval_id   text unique,
  mp_plan_id          text,
  status              text not null default 'pendente' check (status in ('pendente', 'autorizada', 'pausada', 'cancelada')),
  payer_email         text,
  proxima_cobranca    timestamptz,
  autorizada_em       timestamptz,
  cancelada_em        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists assinaturas_org_idx on assinaturas (organization_id, created_at desc);

alter table assinaturas enable row level security;
alter table assinaturas force row level security;
drop policy if exists isolamento_por_organizacao on assinaturas;
create policy isolamento_por_organizacao on assinaturas
  using (organization_id = current_org_id())
  with check (organization_id = current_org_id());

-- -----------------------------------------------------------------------------
create table if not exists pagamentos (
  id                        uuid primary key default gen_random_uuid(),
  organization_id           uuid not null references organizations (id) on delete restrict,
  assinatura_id             uuid references assinaturas (id) on delete set null,
  -- A cobrança agendada da assinatura (authorized_payment) e o pagamento em si.
  mp_authorized_payment_id  text unique,
  mp_payment_id             text,
  status                    text not null check (status in ('agendado', 'aprovado', 'recusado', 'cancelado', 'reembolsado', 'pendente')),
  valor                     numeric(10, 2) not null default 0,
  moeda                     text not null default 'BRL',
  detalhe                   text,
  data                      timestamptz not null default now(),
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

create index if not exists pagamentos_org_idx on pagamentos (organization_id, data desc);

alter table pagamentos enable row level security;
alter table pagamentos force row level security;
drop policy if exists isolamento_por_organizacao on pagamentos;
create policy isolamento_por_organizacao on pagamentos
  using (organization_id = current_org_id())
  with check (organization_id = current_org_id());

-- -----------------------------------------------------------------------------
-- O diário do webhook. Sem organização quando o evento não casou com conta
-- nenhuma (para resolver à mão). Só o servidor escreve e lê.
create table if not exists mp_eventos (
  id              bigserial primary key,
  tipo            text not null,
  mp_id           text not null,
  organization_id uuid references organizations (id) on delete set null,
  tratado         boolean not null default false,
  erro            text,
  payload         jsonb,
  created_at      timestamptz not null default now()
);

create index if not exists mp_eventos_created_idx on mp_eventos (created_at desc);

alter table mp_eventos enable row level security;
-- Nenhuma política: só a chave de serviço (que ignora RLS) acessa.

-- =============================================================================
--  CONFERÊNCIA
-- =============================================================================
do $$
begin
  if to_regclass('public.assinaturas') is null or to_regclass('public.pagamentos') is null or to_regclass('public.mp_eventos') is null then
    raise exception 'FALHOU: assinaturas, pagamentos ou mp_eventos não foram criadas.';
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'organizations' and column_name = 'avaliacao_ate') then
    raise exception 'FALHOU: organizations.avaliacao_ate não existe.';
  end if;
  if (select count(*) from pg_policies where tablename in ('assinaturas', 'pagamentos') and policyname = 'isolamento_por_organizacao') <> 2 then
    raise exception 'FALHOU: política de isolamento ausente em assinaturas/pagamentos.';
  end if;
  raise notice 'OK: avaliação de 7 dias, assinaturas, pagamentos e mp_eventos prontos.';
end $$;
