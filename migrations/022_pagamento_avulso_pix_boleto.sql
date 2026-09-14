-- =============================================================================
--  022 — Pagamento avulso (Pix / boleto) e o gancho da nota fiscal
--
--  Quem não quer cartão paga o período inteiro (mês ou ano) por Pix ou
--  boleto, dentro do site. Não é recorrente: perto de vencer, o sistema
--  avisa e a pessoa paga de novo. `pagamentos` passa a guardar também esses
--  pedidos (com o QR Code / boleto) e, mais adiante, a nota fiscal de cada
--  pagamento aprovado.
-- =============================================================================

-- Como a organização paga hoje: cartão (assinatura automática) ou avulso
-- (renovação manual). Decide o aviso de vencimento.
alter table organizations add column if not exists cobranca text;
alter table organizations drop constraint if exists organizations_cobranca_check;
alter table organizations add constraint organizations_cobranca_check check (cobranca is null or cobranca in ('cartao', 'avulso'));
-- Para não mandar o mesmo lembrete de vencimento duas vezes no dia.
alter table organizations add column if not exists lembrete_enviado_em timestamptz;

-- -----------------------------------------------------------------------------
alter table pagamentos add column if not exists metodo text not null default 'cartao';
alter table pagamentos drop constraint if exists pagamentos_metodo_check;
alter table pagamentos add constraint pagamentos_metodo_check check (metodo in ('cartao', 'pix', 'boleto'));

alter table pagamentos add column if not exists plano text;
alter table pagamentos drop constraint if exists pagamentos_plano_check;
alter table pagamentos add constraint pagamentos_plano_check check (plano is null or plano in ('essencial', 'profissional', 'empresarial'));

alter table pagamentos add column if not exists ciclo text;
alter table pagamentos drop constraint if exists pagamentos_ciclo_check;
alter table pagamentos add constraint pagamentos_ciclo_check check (ciclo is null or ciclo in ('mensal', 'anual'));

-- O período que este pagamento cobre (preenchido quando aprova).
alter table pagamentos add column if not exists periodo_de timestamptz;
alter table pagamentos add column if not exists periodo_ate timestamptz;
-- Até quando dá para pagar (validade do Pix / vencimento do boleto).
alter table pagamentos add column if not exists vence_em timestamptz;
-- QR Code, copia-e-cola, link do boleto, linha digitável — o que a tela mostra.
alter table pagamentos add column if not exists dados jsonb;
alter table pagamentos add column if not exists descricao text;
-- Quem pagou (para a nota fiscal): nome/razão social, CPF/CNPJ, e-mail, endereço.
alter table pagamentos add column if not exists pagador jsonb;

-- Nota fiscal do pagamento aprovado (emitida por um provedor de NFS-e).
alter table pagamentos add column if not exists nf_status text;
alter table pagamentos drop constraint if exists pagamentos_nf_status_check;
alter table pagamentos add constraint pagamentos_nf_status_check check (nf_status is null or nf_status in ('pendente', 'emitida', 'erro', 'cancelada'));
-- A referência enviada ao provedor de NFS-e (nula = ainda não enviada).
alter table pagamentos add column if not exists nf_ref text;
alter table pagamentos add column if not exists nf_numero text;
alter table pagamentos add column if not exists nf_url text;
alter table pagamentos add column if not exists nf_erro text;

create unique index if not exists pagamentos_mp_payment_idx on pagamentos (mp_payment_id) where mp_payment_id is not null;
create index if not exists pagamentos_pendentes_idx on pagamentos (organization_id, status) where status = 'pendente';

-- =============================================================================
--  CONFERÊNCIA
-- =============================================================================
do $$
begin
  if not exists (select 1 from information_schema.columns where table_name = 'pagamentos' and column_name = 'metodo') then
    raise exception 'FALHOU: pagamentos.metodo não existe.';
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'organizations' and column_name = 'cobranca') then
    raise exception 'FALHOU: organizations.cobranca não existe.';
  end if;
  raise notice 'OK: pagamento avulso (Pix/boleto), cobranca e campos de nota fiscal prontos.';
end $$;
