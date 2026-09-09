-- =============================================================================
--  Corrige os vínculos criados pela migração 004
--
--  A 004 vinculou à organização todo usuário com `role <> 'CLIENTE'`. Esse
--  filtro é largo demais: a tabela `users` é compartilhada com o CRM, e papéis
--  como CORRETOR_ATENDIMENTO não são CLIENTE mas também não têm nada a ver com
--  o estoque. Três corretores acabaram listados como membros da organização.
--
--  Não houve consequência prática — o login já barra quem não tem papel de
--  estoque —, mas é dado errado, e na Fase 1b esta tabela passa a responder
--  "quem pertence a esta empresa".
--
--  Esta migração é segura: só remove vínculos de quem não tem acesso ao
--  estoque. Não apaga usuário nenhum, nem toca em dado de estoque.
-- =============================================================================

do $$
declare
  removidos int;
  restantes int;
begin
  -- A lista espelha ALL_INVENTORY_ROLES em src/shared/constants.ts.
  delete from estoque_user_orgs v
  using users u
  where u.matricula = v.matricula
    and u.role not in (
      'ADMINISTRADOR', 'ADMINISTRATIVO',
      'ALMOXARIFE_GERAL', 'ALMOXARIFADO', 'ALMOXARIFE_OBRA'
    );
  get diagnostics removidos = row_count;

  select count(*) into restantes from estoque_user_orgs;

  raise notice 'Vínculos removidos (papéis sem acesso ao estoque): %', removidos;
  raise notice 'Vínculos restantes: %', restantes;

  if restantes = 0 then
    raise exception 'FALHOU: removeu todos os vínculos — algo está errado';
  end if;
end $$;

-- -----------------------------------------------------------------------------
--  Conferência: nenhum vínculo pode sobrar para papel de fora do estoque.
-- -----------------------------------------------------------------------------
do $$
declare
  invasores int;
begin
  select count(*) into invasores
  from estoque_user_orgs v
  join users u on u.matricula = v.matricula
  where u.role not in (
    'ADMINISTRADOR', 'ADMINISTRATIVO',
    'ALMOXARIFE_GERAL', 'ALMOXARIFADO', 'ALMOXARIFE_OBRA'
  );

  if invasores > 0 then
    raise exception 'FALHOU: ainda há % vínculo(s) de papel sem acesso ao estoque', invasores;
  end if;

  raise notice 'CONFERIDO — todos os vínculos são de usuários com acesso ao estoque.';
end $$;
