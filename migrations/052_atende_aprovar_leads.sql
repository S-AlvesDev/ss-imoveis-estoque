-- =============================================================================
--  052 — Atende Aí: aprovar o lead antes de ele entrar no funil
--
--  Toda conversa nova virava lead e caía direto na coluna "Novo" da Gestão
--  de Leads. Só que nem toda conversa é negócio: tem fornecedor, engano,
--  curioso, o contador. O funil enchia de coisa que ninguém ia trabalhar, e
--  os números do painel iam junto.
--
--  Agora o lead nasce PENDENTE e fica numa aba à parte ("Aprovar Leads").
--  Só entra no funil quando alguém aprova; reprovar tira da frente sem
--  apagar nada — o histórico da conversa continua inteiro na Central.
--
--      aprovado IS NULL   → pendente, esperando decisão
--      aprovado = true    → no funil (as colunas de sempre)
--      aprovado = false   → reprovado, fora do funil
--
--  Um lead por conversa e uma conversa por contato (conversa_id é unique
--  aqui, e a 043 fez o fio único por contato): a fila de aprovação não
--  repete a mesma pessoa.
--
--  Quem já existe entra como aprovado — ninguém perde o funil que tem hoje.
-- =============================================================================

alter table atende_leads
  add column if not exists aprovado boolean;

-- Os leads de antes desta migração seguem no funil, como sempre estiveram.
update atende_leads set aprovado = true where aprovado is null;

-- A fila de aprovação é lida a toda hora; o índice cobre só ela.
create index if not exists atende_leads_pendentes_idx
  on atende_leads (empresa_id, criado_em desc)
  where aprovado is null;

comment on column atende_leads.aprovado is
  'NULL = pendente de aprovação (fora do funil); true = no funil; false = reprovado.';
