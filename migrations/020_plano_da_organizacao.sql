-- =============================================================================
--  020 — O plano de cada organização
--
--  A organização passa a carregar o plano contratado (Essencial,
--  Profissional, Empresarial). Sem plano = avaliação: enquanto não existe
--  assinatura, a conta tem tudo do Empresarial. O catálogo do que cada plano
--  libera mora no código (src/shared/planos.ts); aqui só fica qual é.
--
--  Quando o pagamento (Mercado Pago) entrar, ele grava `plano` e
--  `plano_ate`; até lá, o plano é definido à mão.
-- =============================================================================

alter table organizations add column if not exists plano text;
alter table organizations drop constraint if exists organizations_plano_check;
alter table organizations add constraint organizations_plano_check
  check (plano is null or plano in ('essencial', 'profissional', 'empresarial'));

-- Desde quando está neste plano, e até quando vale (nulo = sem vencimento).
alter table organizations add column if not exists plano_desde timestamptz;
alter table organizations add column if not exists plano_ate timestamptz;

comment on column organizations.plano is 'essencial | profissional | empresarial; nulo = avaliação (tudo liberado até existir assinatura)';

-- A Imobiliária São Severino (cliente fundador, id fixo desde a migração 004)
-- fica no Empresarial, sem vencimento: `plano_ate` nulo = sem cobrança por
-- enquanto. Quando o pagamento entrar, é ele quem passa a preencher a data.
update organizations
   set plano = 'empresarial',
       plano_desde = coalesce(plano_desde, now()),
       plano_ate = null
 where id = '5e7e0000-0000-4000-8000-000000000001'
   and (plano is distinct from 'empresarial');

-- =============================================================================
--  CONFERÊNCIA
-- =============================================================================
do $$
begin
  if not exists (select 1 from information_schema.columns where table_name = 'organizations' and column_name = 'plano') then
    raise exception 'FALHOU: organizations.plano não existe.';
  end if;
  if not exists (select 1 from pg_constraint where conname = 'organizations_plano_check') then
    raise exception 'FALHOU: constraint organizations_plano_check não existe.';
  end if;
  if not exists (select 1 from organizations where id = '5e7e0000-0000-4000-8000-000000000001' and plano = 'empresarial') then
    raise exception 'FALHOU: a São Severino não ficou no Empresarial.';
  end if;
  raise notice 'OK: organizations.plano pronto; São Severino no Empresarial sem vencimento.';
end $$;
