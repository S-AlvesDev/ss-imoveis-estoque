-- =============================================================================
--  033 — Stok Aí: a empresa liga e desliga o assistente do WhatsApp
--
--  Pedido do Samuel (2026-09-18): com o mesmo número ligado ao Atende Aí, o
--  assistente do estoque respondia junto. Desligado, o assistente fica em
--  silêncio para a equipe da empresa — nada é registrado nem cobrado do
--  limite mensal. O número da empresa continua servindo para cotações,
--  pedidos e avisos, que não passam por aqui.
-- =============================================================================

alter table organizations add column if not exists whatsapp_ia_ativa boolean not null default true;

do $$
begin
  if not exists (select 1 from information_schema.columns where table_name = 'organizations' and column_name = 'whatsapp_ia_ativa') then
    raise exception 'FALHOU: organizations.whatsapp_ia_ativa não existe.';
  end if;
  raise notice 'OK: 033 aplicada — organizations.whatsapp_ia_ativa pronta.';
end $$;
