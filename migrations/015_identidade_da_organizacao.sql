-- =============================================================================
--  Identidade da organização — cor e logo
--
--  A tela de login é de todo mundo, antes de saber quem entrou: mostra a marca
--  do produto. Por dentro, cada organização vê o próprio nome, a própria cor e
--  o próprio logo. Esta migração dá às organizações onde guardar isso.
--
--  LOGO
--  O arquivo vai para o Storage do Supabase, num bucket público de leitura
--  (o logo aparece para quem já entrou; não é segredo). Limite de 5 MB e só
--  imagem. O envio NÃO passa pelo servidor: a Vercel corta requisições em
--  4,5 MB. O servidor emite uma URL assinada e o navegador envia direto.
--
--  COR
--  Um hexadecimal (#rrggbb). Validado aqui e no servidor: cor inválida
--  quebraria o CSS de todas as telas da organização de uma vez.
-- =============================================================================

alter table organizations add column if not exists cor_primaria text;
alter table organizations add column if not exists logo_url     text;

alter table organizations drop constraint if exists organizations_cor_primaria_hex;
alter table organizations add constraint organizations_cor_primaria_hex
  check (cor_primaria is null or cor_primaria ~ '^#[0-9a-fA-F]{6}$');


-- -----------------------------------------------------------------------------
--  Bucket de logos. Só existe no Supabase (schema `storage`); em outro
--  Postgres esta parte é pulada — o resto da migração continua valendo.
-- -----------------------------------------------------------------------------
do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'Schema storage ausente — bucket de logos não criado (não é Supabase).';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('logos', 'logos', true, 5242880, array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'])
  on conflict (id) do update
    set public = excluded.public,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

  -- Leitura pública: o logo é servido por URL direta em toda tela.
  -- Escrita: só por URL assinada emitida pelo servidor (chave de serviço),
  -- então não há política de insert para anon nem authenticated.
  execute 'drop policy if exists "logos: leitura publica" on storage.objects';
  execute 'create policy "logos: leitura publica" on storage.objects for select using (bucket_id = ''logos'')';

  raise notice 'Bucket "logos" pronto: público para leitura, 5 MB, só imagens.';
end $$;


-- =============================================================================
--  CONFERÊNCIA
-- =============================================================================
do $$
declare
  tem_bucket int;
begin
  if not exists (select 1 from information_schema.columns where table_name = 'organizations' and column_name = 'cor_primaria')
     or not exists (select 1 from information_schema.columns where table_name = 'organizations' and column_name = 'logo_url') then
    raise exception 'FALHOU: colunas de identidade não foram criadas.';
  end if;

  -- A restrição de cor tem que reprovar lixo.
  perform 1 where 'laranja' ~ '^#[0-9a-fA-F]{6}$';
  if found then raise exception 'FALHOU: a regex de cor aceitou "laranja".'; end if;

  -- Em SQL dinâmico: fora do Supabase a tabela não existe, e o PL/pgSQL
  -- prepararia a consulta mesmo com a condição falsa.
  if to_regclass('storage.buckets') is not null then
    execute 'select count(*) from storage.buckets where id = ''logos''' into tem_bucket;
    if tem_bucket = 0 then
      raise exception 'FALHOU: bucket "logos" não existe.';
    end if;
  end if;

  raise notice 'CONFERIDO — organizações podem ter cor e logo.';
end $$;
