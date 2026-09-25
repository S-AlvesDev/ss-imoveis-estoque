-- =============================================================================
--  054 — Atende Aí: garante o bucket onde o logo da empresa é guardado
--
--  O envio do logo do Atende Aí usa o mesmo bucket `logos` que o Stok Aí já
--  usa (criado na 015), com os arquivos sob o prefixo `atende/<empresa_id>/`
--  para não se misturarem com os das organizações do Stok Aí.
--
--  Esta migração não cria nada novo: só repete, de forma idempotente, o que
--  a 015 fez — para que instalar o Atende Aí num projeto onde a 015 não
--  rodou não deixe o envio de logo quebrado. Rodar com a 015 já aplicada é
--  inofensivo.
--
--  Leitura é pública (o logo aparece em toda tela, por URL direta). Escrita
--  não tem política nenhuma de propósito: o arquivo só entra por URL
--  assinada, emitida pelo servidor com a chave de serviço.
-- =============================================================================

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

  execute 'drop policy if exists "logos: leitura publica" on storage.objects';
  execute 'create policy "logos: leitura publica" on storage.objects for select using (bucket_id = ''logos'')';

  raise notice 'Bucket "logos" pronto para o Atende Aí (prefixo atende/).';
end $$;
