-- =============================================================================
--  Separa a identidade do estoque da tabela compartilhada com o CRM
--
--  Hoje os 7 logins do estoque moram em `users`, junto com clientes e
--  corretores da imobiliária. É a dependência que impede o estoque de ser um
--  produto independente — e é eliminatória numa auditoria de comprador.
--
--  Esta migração cria `estoque_users` e copia os 7 para lá, EXATAMENTE como
--  estão, senha inclusive.
--
--  POR QUE AS SENHAS NÃO SÃO CONVERTIDAS AQUI
--  A primeira versão convertia para bcrypt via pgcrypto durante a cópia.
--  Funciona — verifiquei que pgcrypto e bcryptjs concordam em bancos UTF-8,
--  inclusive com acentos. Mas foi descartado por dois motivos:
--
--    1. A auto-verificação seria cega. Conferir um hash do pgcrypto usando o
--       próprio pgcrypto prova que o Postgres concorda consigo mesmo, não que
--       o bcryptjs do servidor vai aceitar. Num teste em banco WIN1252 as duas
--       implementações divergiram em senhas com acento e a conferência passou
--       assim mesmo.
--    2. A assimetria de risco. Se a suposição de encoding estiver errada em
--       algum detalhe, ninguém entra no sistema, e o sinal só aparece na manhã
--       seguinte.
--
--  Em vez disso, o servidor converte cada senha para bcrypt no próximo login
--  bem-sucedido: nesse momento ele tem a senha correta em mãos, e usa a mesma
--  biblioteca para gerar e para verificar. Sem risco de divergência, sem
--  ninguém trancado para fora. A tela de Usuários continua marcando quem
--  ainda está pendente, para a gestão forçar a troca de quem não acessa.
--
--  SEGURANÇA
--  - NÃO toca a tabela `users`. Nada é alterado nem apagado.
--  - O servidor só passa a usar `estoque_users` quando o código for trocado.
--  - Auto-verificável: aborta se algum usuário do estoque ficar para trás.
--  - Reversível por 006_separa_users_do_crm_rollback.sql.
--
--  Pré-requisito: a migração 004 (organizations) precisa ter rodado.
-- =============================================================================

-- -----------------------------------------------------------------------------
--  1. A tabela de identidades do estoque
-- -----------------------------------------------------------------------------
create table if not exists estoque_users (
  id                bigserial primary key,
  organization_id   uuid not null references organizations (id) on delete restrict,
  nome              text not null,
  email             text,
  matricula         text not null,
  senha             text not null,
  role              text not null,
  ativo             boolean not null default true,
  ultimo_acesso     timestamptz,
  senha_alterada_em timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- Matrícula é única dentro da empresa, não no mundo: duas empresas podem
  -- ter um "G01" cada uma.
  --
  -- ATENÇÃO PARA A FASE 2: com mais de uma organização, o login por matrícula
  -- deixa de identificar a pessoa sozinho — vai precisar de um seletor de
  -- empresa (subdomínio ou slug). Enquanto houver uma só, funciona.
  unique (organization_id, matricula)
);

create index if not exists estoque_users_matricula_idx on estoque_users (matricula);
create index if not exists estoque_users_email_idx     on estoque_users (email);
create index if not exists estoque_users_org_idx       on estoque_users (organization_id);

alter table estoque_users enable row level security;


-- -----------------------------------------------------------------------------
--  2. Copiar os usuários do estoque, sem alterar a senha
-- -----------------------------------------------------------------------------
insert into estoque_users (organization_id, nome, email, matricula, senha, role, created_at)
select
  '5e7e0000-0000-4000-8000-000000000001',
  coalesce(u.nome, u.matricula),
  u.email,
  u.matricula,
  u.senha,
  u.role,
  coalesce(u.created_at, now())
from users u
where u.matricula is not null
  and u.senha is not null
  and u.role in (
    'ADMINISTRADOR', 'ADMINISTRATIVO',
    'ALMOXARIFE_GERAL', 'ALMOXARIFADO', 'ALMOXARIFE_OBRA'
  )
on conflict (organization_id, matricula) do nothing;


-- -----------------------------------------------------------------------------
--  3. Conferência — ninguém pode ficar para trás
-- -----------------------------------------------------------------------------
do $$
declare
  copiados int;
  faltando int;
  em_texto_puro int;
  intrusos int;
begin
  select count(*) into copiados from estoque_users;

  select count(*) into faltando
  from users o
  where o.matricula is not null
    and o.senha is not null
    and o.role in (
      'ADMINISTRADOR', 'ADMINISTRATIVO',
      'ALMOXARIFE_GERAL', 'ALMOXARIFADO', 'ALMOXARIFE_OBRA')
    and not exists (
      select 1 from estoque_users e
      where e.matricula = o.matricula
        and e.organization_id = '5e7e0000-0000-4000-8000-000000000001');

  if faltando > 0 then
    raise exception 'FALHOU: % usuário(s) do estoque não foram copiados', faltando;
  end if;

  -- Nenhum papel de fora do estoque pode ter entrado.
  select count(*) into intrusos from estoque_users
  where role not in (
    'ADMINISTRADOR', 'ADMINISTRATIVO',
    'ALMOXARIFE_GERAL', 'ALMOXARIFADO', 'ALMOXARIFE_OBRA');

  if intrusos > 0 then
    raise exception 'FALHOU: % conta(s) de fora do estoque foram copiadas', intrusos;
  end if;

  select count(*) into em_texto_puro from estoque_users where senha !~ '^\$2[aby]\$';

  raise notice 'CONFERIDO — % conta(s) copiadas, nenhuma faltando, nenhuma intrusa.', copiados;
  raise notice 'Senhas ainda em texto puro: % — serão convertidas no próximo login de cada pessoa.', em_texto_puro;
  raise notice '---';
  raise notice 'A tabela `users` NÃO foi alterada. O login só passa a usar';
  raise notice '`estoque_users` quando o código do servidor for trocado.';
end $$;
