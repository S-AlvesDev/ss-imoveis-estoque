-- =============================================================================
--  026 — Encerrar a conta
--
--  Os termos prometem: a empresa encerra quando quiser, os dados ficam
--  disponíveis para exportação por 90 dias e depois somem. Faltava o
--  código atrás da promessa.
--
--  Encerrada, a conta continua entrando (para exportar), mas não opera —
--  o servidor trata como bloqueada. Passados os 90 dias, `apagar_organizacao`
--  derruba tudo na ordem certa: as tabelas apontam para organizations com
--  `on delete restrict` em vários lugares, então um delete direto falharia.
-- =============================================================================

alter table organizations add column if not exists encerrada_em  timestamptz;
-- Quem pediu (o CEO) e o que disse, para quando alguém perguntar depois.
alter table organizations add column if not exists encerrada_por bigint;
alter table organizations add column if not exists encerrada_motivo text;

comment on column organizations.encerrada_em is 'Quando o CEO encerrou. A conta só exporta; 90 dias depois, apagar_organizacao.';

-- -----------------------------------------------------------------------------
--  Apaga uma organização inteira, filhos primeiro. Idempotente.
-- -----------------------------------------------------------------------------
create or replace function apagar_organizacao(p_org uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_org is null then
    raise exception 'apagar_organizacao: organização não informada';
  end if;

  -- Filhos de filhos primeiro (dependem de linhas das tabelas abaixo).
  delete from asset_events            where asset_id in (select id from assets where organization_id = p_org);
  delete from support_ticket_materials where ticket_id in (select id from support_tickets where organization_id = p_org);
  delete from support_ticket_comments  where ticket_id in (select id from support_tickets where organization_id = p_org);
  delete from cotacao_fornecedores    where organization_id = p_org;

  -- Movimento e saldo antes de material e depósito.
  delete from material_movements      where organization_id = p_org;
  delete from stock_balances          where organization_id = p_org;
  delete from lots                    where organization_id = p_org;
  delete from loans                   where organization_id = p_org;
  delete from assets                  where organization_id = p_org;
  delete from support_tickets         where organization_id = p_org;
  delete from cotacoes                where organization_id = p_org;
  delete from fornecedores            where organization_id = p_org;
  delete from whatsapp_conversas      where organization_id = p_org;
  delete from whatsapp_mensagens      where organization_id = p_org;
  delete from materials               where organization_id = p_org;
  delete from categories              where organization_id = p_org;

  -- Acessos antes dos usuários e dos depósitos.
  delete from estoque_user_warehouses where organization_id = p_org;
  delete from estoque_user_orgs       where organization_id = p_org;
  delete from estoque_users           where organization_id = p_org;
  delete from warehouses              where organization_id = p_org;
  delete from units                   where organization_id = p_org;

  -- Cobrança fica por último: é o que se guarda por mais tempo em papel,
  -- mas dentro do sistema vai junto.
  delete from assinaturas             where organization_id = p_org;
  delete from pagamentos              where organization_id = p_org;

  delete from organizations           where id = p_org;
end;
$$;

revoke all on function apagar_organizacao(uuid) from public;
revoke all on function apagar_organizacao(uuid) from anon;
