-- =============================================================================
--  048 — Atende Aí: pipeline de MCMV, documentos do cliente e proprietários
--
--  Três coisas pedidas depois de olhar o painel de uma imobiliária real:
--
--  1) MCMV é uma dimensão PARALELA ao funil de vendas (atende_leads.estado):
--     um lead pode estar "em negociação" no funil geral e, ao mesmo tempo,
--     "em análise" no financiamento MCMV — são perguntas diferentes. Por
--     isso mcmv_status é uma coluna própria em atende_leads, não um valor a
--     mais dentro de `estado`. NULL = nunca entrou no pipeline de MCMV.
--
--  2) atende_documentos_cliente: documentos (RG, CPF, comprovante de renda,
--     contrato…) anexados a um cliente — para quem faz a análise de crédito
--     ver e conferir, sem precisar abrir a conversa do WhatsApp dele.
--
--  3) atende_inventario_itens.proprietario_cliente_id: liga um imóvel do
--     Inventário a um cliente já cadastrado, quando ele é o dono.
--
--  atende_leads.origem: de onde veio o lead (whatsapp = o normal, criado
--  pela triagem; manual = cadastrado à mão, de outro canal). Serve para
--  diferenciar na tela, nada além disso.
--
--  Aditiva e idempotente.
-- =============================================================================

alter table atende_leads add column if not exists mcmv_status text check (mcmv_status is null or mcmv_status in ('em_analise', 'aprovado_condicionado', 'aprovado', 'reprovado'));
alter table atende_leads add column if not exists mcmv_iniciado_em timestamptz;
alter table atende_leads add column if not exists mcmv_atualizado_em timestamptz;
alter table atende_leads add column if not exists origem text not null default 'whatsapp' check (origem in ('whatsapp', 'manual'));

alter table atende_inventario_itens add column if not exists proprietario_cliente_id uuid references atende_clientes (id) on delete set null;
create index if not exists atende_inventario_itens_proprietario_idx on atende_inventario_itens (proprietario_cliente_id) where proprietario_cliente_id is not null;

create table if not exists atende_documentos_cliente (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references atende_empresas (id) on delete cascade,
  cliente_id    uuid not null references atende_clientes (id) on delete cascade,
  nome_arquivo  text not null,
  mimetype      text not null,
  caminho       text not null,
  tipo          text not null default 'outro' check (tipo in ('rg', 'cpf', 'comprovante_renda', 'contrato', 'outro')),
  tamanho       integer,
  anexado_por   bigint references atende_usuarios (id) on delete set null,
  criado_em     timestamptz not null default now()
);
create index if not exists atende_documentos_cliente_cliente_idx on atende_documentos_cliente (cliente_id, criado_em desc);

alter table atende_documentos_cliente enable row level security;
alter table atende_documentos_cliente force row level security;
drop policy if exists isolamento_por_empresa on atende_documentos_cliente;
create policy isolamento_por_empresa on atende_documentos_cliente using (empresa_id = atende_empresa_atual()) with check (empresa_id = atende_empresa_atual());

-- -----------------------------------------------------------------------------
--  Bucket privado de documentos — mesmo padrão do atende-midias (migração
--  031): só o servidor lê e escreve, o navegador recebe URL assinada.
-- -----------------------------------------------------------------------------
do $$
begin
  if to_regnamespace('storage') is null then
    raise notice 'Schema storage ausente — bucket atende-documentos não criado (não é Supabase).';
    return;
  end if;
  insert into storage.buckets (id, name, public, file_size_limit)
  values ('atende-documentos', 'atende-documentos', false, 20971520)
  on conflict (id) do update set public = false, file_size_limit = 20971520;
  raise notice 'Bucket "atende-documentos" pronto: privado, 20 MB por arquivo.';
end $$;

do $$
begin
  if not exists (select 1 from information_schema.columns where table_name = 'atende_leads' and column_name = 'mcmv_status') then
    raise exception 'FALHOU: atende_leads.mcmv_status não existe.';
  end if;
  if not exists (select 1 from pg_tables where tablename = 'atende_documentos_cliente') then
    raise exception 'FALHOU: atende_documentos_cliente não existe.';
  end if;
  raise notice 'OK: MCMV, documentos do cliente e proprietários.';
end $$;
