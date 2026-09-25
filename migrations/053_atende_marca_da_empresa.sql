-- =============================================================================
--  053 — Atende Aí: a empresa veste o sistema com a cor e o logo dela
--
--  O mesmo que o Stok Aí já faz: a organização escolhe a cor da marca e sobe
--  o logo, e o produto inteiro se veste com isso (botões, links, o item
--  ativo do menu, as faixas). Aqui faltava — o Atende Aí era roxo para todo
--  mundo.
--
--  `cor_primaria` é um hex #rrggbb; nulo = a cor de fábrica (o roxo #7c3aed).
--  `logo_url` aponta para o arquivo no Storage; nulo = o logo do Atende Aí.
--
--  O tema claro/escuro NÃO mora aqui: ele é escolha de quem usa, não da
--  empresa, e fica no navegador de cada pessoa.
-- =============================================================================

alter table atende_empresas
  add column if not exists cor_primaria text,
  add column if not exists logo_url text;

alter table atende_empresas
  drop constraint if exists atende_empresas_cor_primaria_check;

alter table atende_empresas
  add constraint atende_empresas_cor_primaria_check
  check (cor_primaria is null or cor_primaria ~ '^#[0-9a-fA-F]{6}$');

comment on column atende_empresas.cor_primaria is
  'Hex #rrggbb da cor da marca; NULL = o roxo de fábrica do Atende Aí.';
comment on column atende_empresas.logo_url is
  'URL do logo da empresa; NULL = o logo do Atende Aí.';
