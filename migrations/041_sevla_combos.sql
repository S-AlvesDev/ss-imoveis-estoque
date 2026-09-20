-- =============================================================================
--  041 — Combos da SEVLA (Stok Aí + Atende Aí com 5% de desconto)
--
--  Um combo é as duas assinaturas (cartão) ou os dois pedidos (um Pix/boleto
--  só, para os dois produtos) que nasceram juntos pela Minha SEVLA, cada um
--  com o valor já com desconto. A coluna `combo` guarda qual combo
--  (essencial / profissional / empresarial); nula = contratação avulsa, como
--  sempre foi. Cada produto continua cobrando no próprio caixa; o carimbo só
--  diz que os dois andam juntos — e é ele que deixa o servidor devolver o
--  preço cheio a um quando o outro é cancelado.
--
--  Aditiva e idempotente. Não muda nada do que já existe.
-- =============================================================================

alter table assinaturas         add column if not exists combo text;
alter table pagamentos          add column if not exists combo text;
alter table atende_assinaturas  add column if not exists combo text;
alter table atende_pagamentos   add column if not exists combo text;

comment on column assinaturas.combo        is 'Combo da SEVLA de onde esta assinatura veio (essencial/profissional/empresarial); nulo = avulsa.';
comment on column pagamentos.combo         is 'Combo da SEVLA: este Pix/boleto é a parte do Stok Aí de um pagamento único dos dois produtos.';
comment on column atende_assinaturas.combo is 'Combo da SEVLA de onde esta assinatura veio; nulo = avulsa.';
comment on column atende_pagamentos.combo  is 'Combo da SEVLA: este Pix/boleto é a parte do Atende Aí de um pagamento único dos dois produtos.';

do $$
begin
  if not exists (select 1 from information_schema.columns where table_name = 'assinaturas' and column_name = 'combo')
     or not exists (select 1 from information_schema.columns where table_name = 'pagamentos' and column_name = 'combo')
     or not exists (select 1 from information_schema.columns where table_name = 'atende_assinaturas' and column_name = 'combo')
     or not exists (select 1 from information_schema.columns where table_name = 'atende_pagamentos' and column_name = 'combo') then
    raise exception 'FALHOU: alguma tabela ficou sem a coluna combo.';
  end if;
  raise notice 'OK: combos da SEVLA prontos (assinaturas, pagamentos, atende_assinaturas, atende_pagamentos).';
end $$;
