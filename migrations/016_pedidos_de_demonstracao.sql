-- =============================================================================
--  Pedidos de demonstração — o formulário da Home
--
--  A Home pública tem um formulário curto (nome, empresa, e-mail, telefone,
--  tamanho da operação). Cada envio vira uma linha aqui E um e-mail para
--  DEMO_EMAIL. A linha existe para o pedido não se perder se o SMTP falhar,
--  e para dar um lugar onde marcar quem já foi atendido.
--
--  Quem escreve é só o servidor, com a chave de serviço: a tabela tem RLS
--  ligado e nenhuma política, então anon e authenticated não leem nem
--  escrevem nada por aqui. Não há organization_id — quem pede demonstração
--  ainda não é cliente.
-- =============================================================================

create table if not exists demo_requests (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null check (char_length(nome) between 2 and 80),
  empresa     text not null check (char_length(empresa) between 2 and 80),
  email       text not null check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 120),
  telefone    text check (telefone is null or char_length(telefone) <= 30),
  -- Quantas unidades a empresa opera: o que decide se o multiunidade importa.
  tamanho     text not null check (tamanho in ('1', '2-5', '6-20', '20+')),
  -- De onde na Home veio o clique (hero, header, cta-final...). Só para saber
  -- qual botão converte.
  origem      text check (origem is null or char_length(origem) <= 40),
  atendido    boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists demo_requests_pendentes on demo_requests (created_at desc) where not atendido;

alter table demo_requests enable row level security;

revoke all on demo_requests from public;
revoke all on demo_requests from anon;
revoke all on demo_requests from authenticated;


-- =============================================================================
--  CONFERÊNCIA
-- =============================================================================
do $$
begin
  if to_regclass('public.demo_requests') is null then
    raise exception 'FALHOU: tabela demo_requests não existe.';
  end if;

  if not exists (select 1 from pg_tables where tablename = 'demo_requests' and rowsecurity) then
    raise exception 'FALHOU: RLS não está ligado em demo_requests.';
  end if;

  if exists (select 1 from pg_policies where tablename = 'demo_requests') then
    raise exception 'FALHOU: demo_requests não deveria ter política nenhuma — só o servidor escreve.';
  end if;

  -- As restrições têm que reprovar lixo.
  begin
    insert into demo_requests (nome, empresa, email, tamanho) values ('A', 'Empresa', 'x@y.z', '1');
    raise exception 'FALHOU: aceitou nome de 1 caractere.';
  exception when check_violation then null;
  end;

  begin
    insert into demo_requests (nome, empresa, email, tamanho) values ('Ana', 'Empresa', 'sem-arroba', '1');
    raise exception 'FALHOU: aceitou e-mail sem @.';
  exception when check_violation then null;
  end;

  begin
    insert into demo_requests (nome, empresa, email, tamanho) values ('Ana', 'Empresa', 'a@b.co', 'muitas');
    raise exception 'FALHOU: aceitou tamanho fora da lista.';
  exception when check_violation then null;
  end;

  raise notice 'CONFERIDO — pedidos de demonstração têm onde ficar.';
end $$;
