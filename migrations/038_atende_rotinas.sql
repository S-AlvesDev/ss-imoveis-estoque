-- =============================================================================
--  038 — Atende Aí: o que o Stok Aí já tinha, SLA e follow-up de lead
--
--  1) Cobranças do Atende (atende_pagamentos), no mesmo shape de `pagamentos`
--     do Stok: recibo por e-mail e nota fiscal reaproveitam o mesmo código.
--     Dados de faturamento da empresa (nome/CPF-CNPJ/endereço) para a nota.
--  2) Lembretes de vencimento (lembrete_enviado_em), como em organizations.
--  3) SLA: quantos minutos sem resposta avisam os supervisores e quantos
--     escalonam a conversa para a fila geral; carimbos na conversa para não
--     repetir o aviso na mesma espera.
--  4) Follow-up do lead: a sugestão da IA guardada no lead, à espera de
--     aprovação — nunca é enviada sozinha.
--
--  Aditiva e idempotente.
-- =============================================================================

-- ---- 1) Cobranças ------------------------------------------------------------
create table if not exists atende_pagamentos (
  id                        uuid primary key default gen_random_uuid(),
  empresa_id                uuid not null references atende_empresas (id) on delete restrict,
  assinatura_id             uuid references atende_assinaturas (id) on delete set null,
  mp_authorized_payment_id  text unique,
  mp_payment_id             text,
  status                    text not null check (status in ('agendado', 'aprovado', 'recusado', 'cancelado', 'reembolsado', 'pendente')),
  valor                     numeric(10, 2) not null default 0,
  moeda                     text not null default 'BRL',
  detalhe                   text,
  data                      timestamptz not null default now(),
  metodo                    text not null default 'cartao' check (metodo in ('cartao', 'pix', 'boleto')),
  plano                     text,
  ciclo                     text,
  periodo_de                timestamptz,
  periodo_ate               timestamptz,
  vence_em                  timestamptz,
  dados                     jsonb,
  descricao                 text,
  -- Quem pagou, como o recibo e a nota mostram: { nome, email, tipoDoc, doc, endereco }.
  pagador                   jsonb,
  nf_status                 text check (nf_status is null or nf_status in ('pendente', 'emitida', 'erro', 'cancelada')),
  nf_ref                    text,
  nf_numero                 text,
  nf_url                    text,
  nf_erro                   text,
  recibo_enviado_em         timestamptz,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

create index if not exists atende_pagamentos_empresa_idx on atende_pagamentos (empresa_id, data desc);

alter table atende_pagamentos enable row level security;
alter table atende_pagamentos force row level security;
drop policy if exists isolamento_por_empresa on atende_pagamentos;
create policy isolamento_por_empresa on atende_pagamentos
  using (empresa_id = atende_empresa_atual())
  with check (empresa_id = atende_empresa_atual());

-- Dados de faturamento: para a nota fiscal sair com o CNPJ da empresa, não com o e-mail de quem clicou.
alter table atende_empresas add column if not exists faturamento jsonb;

-- ---- 2) Lembretes e vigilância -------------------------------------------------
alter table atende_empresas add column if not exists lembrete_enviado_em timestamptz;
-- O cron avisa os administradores quando o WhatsApp cai — uma vez por queda.
alter table atende_conexoes add column if not exists aviso_queda_em timestamptz;

-- ---- 3) SLA ------------------------------------------------------------------
-- Minutos sem resposta ao cliente: avisa os supervisores (e o atendente); depois escalona para a fila geral. Nulo = desligado.
alter table atende_empresas add column if not exists sla_aviso_min int check (sla_aviso_min is null or (sla_aviso_min between 1 and 1440));
alter table atende_empresas add column if not exists sla_escalonar_min int check (sla_escalonar_min is null or (sla_escalonar_min between 1 and 2880));
-- Padrão para quem já existe: 10 min avisa, 30 min escalona (quem não quiser, desliga na tela Empresa).
update atende_empresas set sla_aviso_min = 10 where sla_aviso_min is null;
update atende_empresas set sla_escalonar_min = 30 where sla_escalonar_min is null;
alter table atende_empresas alter column sla_aviso_min set default 10;
alter table atende_empresas alter column sla_escalonar_min set default 30;

-- Os carimbos do SLA, por rodada de espera (comparados com o início da espera: uma espera nova avisa de novo).
alter table atende_conversas add column if not exists sla_avisada_em timestamptz;
alter table atende_conversas add column if not exists sla_escalonada_em timestamptz;

create index if not exists atende_conversas_espera_idx on atende_conversas (empresa_id, estado, ultima_mensagem_de);

-- ---- 4) Follow-up do lead --------------------------------------------------------
alter table atende_leads add column if not exists followup_sugestao text;
alter table atende_leads add column if not exists followup_sugerido_em timestamptz;
alter table atende_leads add column if not exists followup_enviado_em timestamptz;
alter table atende_leads add column if not exists followup_descartado_em timestamptz;

-- =============================================================================
--  CONFERÊNCIA
-- =============================================================================
do $$
begin
  if to_regclass('public.atende_pagamentos') is null then
    raise exception 'FALHOU: atende_pagamentos não foi criada.';
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'atende_empresas' and column_name = 'sla_aviso_min') then
    raise exception 'FALHOU: atende_empresas.sla_aviso_min não existe.';
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'atende_conversas' and column_name = 'sla_avisada_em') then
    raise exception 'FALHOU: atende_conversas.sla_avisada_em não existe.';
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'atende_leads' and column_name = 'followup_sugestao') then
    raise exception 'FALHOU: atende_leads.followup_sugestao não existe.';
  end if;
  if not exists (select 1 from pg_policies where tablename = 'atende_pagamentos' and policyname = 'isolamento_por_empresa') then
    raise exception 'FALHOU: política de isolamento ausente em atende_pagamentos.';
  end if;
  raise notice 'OK: cobranças, faturamento, lembretes, SLA e follow-up prontos no Atende Aí.';
end $$;
