-- =============================================================================
--  046 — Atende Aí: inventário (catálogo de itens) para o Jatobá consultar
--
--  Uma imobiliária, farmácia ou qualquer empresa que use o Atende Aí pode
--  cadastrar o que vende ou aluga — nome, categoria livre ("aluguel",
--  "venda", "genérico"…), quantidade disponível e preço opcional — para o
--  Jatobá responder "quantas casas têm disponíveis para aluguel?" com dado
--  real, e para quem atende consultar na hora sem perguntar à IA.
--
--  Tabela própria do Atende Aí, independente do Stok Aí: a ponte entre os
--  dois produtos (src/atende/server/ponte.ts) foi desenhada para não expor
--  dado de estoque, e nem toda empresa do Atende usa o Stok Aí.
--
--  Aditiva e idempotente: cria a tabela e sai.
-- =============================================================================

create table if not exists atende_inventario_itens (
  id           uuid primary key default gen_random_uuid(),
  empresa_id   uuid not null references atende_empresas (id) on delete cascade,
  nome         text not null check (char_length(nome) between 1 and 120),
  categoria    text,
  quantidade   integer not null default 0 check (quantidade >= 0),
  preco        numeric,
  descricao    text,
  ativo        boolean not null default true,
  criado_em    timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists atende_inventario_itens_empresa_idx on atende_inventario_itens (empresa_id, ativo, nome);

alter table atende_inventario_itens enable row level security;
alter table atende_inventario_itens force row level security;
drop policy if exists isolamento_por_empresa on atende_inventario_itens;
create policy isolamento_por_empresa on atende_inventario_itens using (empresa_id = atende_empresa_atual()) with check (empresa_id = atende_empresa_atual());

do $$
begin
  if not exists (select 1 from pg_tables where tablename = 'atende_inventario_itens') then
    raise exception 'FALHOU: atende_inventario_itens não existe.';
  end if;
  raise notice 'OK: inventário do Atende Aí.';
end $$;
