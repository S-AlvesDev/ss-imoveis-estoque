-- =============================================================================
--  025 — Fornecedores, cotações e pedidos pelo WhatsApp
--
--  A empresa cadastra os fornecedores (nome + WhatsApp). Uma cotação lista
--  itens e escolhe fornecedores; o sistema manda a mesma mensagem para cada
--  um pelo número do Stok Aí (ou pelo da empresa, quando tiver instância
--  própria). A resposta do fornecedor volta pelo webhook: a IA só lê e
--  extrai preço/prazo por item — não negocia, não compra. A comparação é
--  feita por código; o pedido é fechado por uma pessoa, na tela.
-- =============================================================================

create table if not exists fornecedores (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  nome            text not null,
  -- Só dígitos, com DDI (5584999999999). É por ele que a resposta é reconhecida.
  whatsapp        text not null,
  -- A pessoa de contato, para a mensagem começar com o nome dela.
  contato         text,
  observacoes     text,
  ativo           boolean not null default true,
  created_at      timestamptz not null default now()
);
create unique index if not exists fornecedores_org_whatsapp_idx on fornecedores (organization_id, whatsapp);
create index if not exists fornecedores_whatsapp_idx on fornecedores (whatsapp);

alter table fornecedores enable row level security;
alter table fornecedores force row level security;
drop policy if exists isolamento_por_organizacao on fornecedores;
create policy isolamento_por_organizacao on fornecedores
  using (organization_id = current_org_id())
  with check (organization_id = current_org_id());

-- -----------------------------------------------------------------------------
create table if not exists cotacoes (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  criado_por      bigint references estoque_users (id) on delete set null,
  titulo          text not null,
  -- [{ n, material_id, descricao, quantidade, unidade }] — n é o número do item na mensagem.
  itens           jsonb not null default '[]'::jsonb,
  -- Onde entregar, em texto (a unidade, o endereço).
  entrega         text,
  observacoes     text,
  status          text not null default 'aberta' check (status in ('aberta', 'encerrada', 'cancelada')),
  -- O pedido fechado: { fornecedor_id, total, enviado_em }.
  pedido          jsonb,
  created_at      timestamptz not null default now(),
  encerrada_em    timestamptz
);
create index if not exists cotacoes_org_idx on cotacoes (organization_id, created_at desc);

alter table cotacoes enable row level security;
alter table cotacoes force row level security;
drop policy if exists isolamento_por_organizacao on cotacoes;
create policy isolamento_por_organizacao on cotacoes
  using (organization_id = current_org_id())
  with check (organization_id = current_org_id());

-- -----------------------------------------------------------------------------
-- Cada fornecedor dentro de uma cotação: o que foi mandado, o que ele respondeu.
create table if not exists cotacao_fornecedores (
  cotacao_id      uuid not null references cotacoes (id) on delete cascade,
  fornecedor_id   uuid not null references fornecedores (id) on delete cascade,
  organization_id uuid not null references organizations (id) on delete cascade,
  -- pendente → enviada → respondida | sem_estoque; erro = não conseguiu mandar; pedido = fechamos com ele.
  status          text not null default 'pendente' check (status in ('pendente', 'enviada', 'respondida', 'sem_estoque', 'erro', 'pedido')),
  enviada_em      timestamptz,
  respondida_em   timestamptz,
  erro            text,
  -- [{ n, preco_unitario, disponivel, prazo, observacao }], um por item respondido.
  precos          jsonb not null default '[]'::jsonb,
  -- Soma de quantidade × preço dos itens disponíveis.
  total           numeric,
  -- A troca com o fornecedor: [{ de: 'nos' | 'fornecedor', texto, em }].
  conversa        jsonb not null default '[]'::jsonb,
  primary key (cotacao_id, fornecedor_id)
);
create index if not exists cotacao_fornecedores_fornecedor_idx on cotacao_fornecedores (fornecedor_id, status);

alter table cotacao_fornecedores enable row level security;
alter table cotacao_fornecedores force row level security;
drop policy if exists isolamento_por_organizacao on cotacao_fornecedores;
create policy isolamento_por_organizacao on cotacao_fornecedores
  using (organization_id = current_org_id())
  with check (organization_id = current_org_id());
