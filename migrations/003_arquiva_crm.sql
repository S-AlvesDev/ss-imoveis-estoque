-- =============================================================================
--  Migração 003 — ARQUIVA as tabelas do CRM abandonado
--
--  NÃO APAGA NADA. Move as tabelas do schema `public` para o schema `archive`.
--
--  Efeito prático:
--    - O PostgREST expõe apenas `public`, então elas somem da API na hora.
--    - O app de estoque para de enxergá-las.
--    - Os dados continuam lá, íntegros, consultáveis por SQL.
--    - Reversível: veja o bloco COMO DESFAZER no final.
--
--  NÃO INCLUI `users`: essa tabela é compartilhada e guarda os 7 logins do
--  estoque. Mover ou apagar `users` derruba o sistema inteiro.
-- =============================================================================

-- ---------- ANTES DE RODAR ----------
-- 1. Faça backup. No Supabase: Database > Backups, ou pelo terminal:
--       pg_dump "postgresql://postgres:<SENHA>@db.aorbsqgeyhzamokrglwd.supabase.co:5432/postgres" \
--         --schema=public --format=custom --file=backup-antes-de-arquivar.dump
-- 2. Confirme que o backup tem tamanho > 0 e que você consegue abri-lo.
-- 3. Só então rode o resto deste arquivo.

begin;

create schema if not exists archive;

-- ---------- Imobiliária ----------
alter table if exists public.properties                    set schema archive;
alter table if exists public.clients                       set schema archive;
alter table if exists public.contracts                     set schema archive;
alter table if exists public.comissoes                     set schema archive;
alter table if exists public.imoveis_interessados          set schema archive;
alter table if exists public.controle_processos_clientes   set schema archive;
alter table if exists public.logs_controle_clientes        set schema archive;

-- ---------- Atendimento / WhatsApp ----------
alter table if exists public.chat_agent_sessions set schema archive;
alter table if exists public.chat_contacts       set schema archive;
alter table if exists public.chat_conversations  set schema archive;
alter table if exists public.chat_messages       set schema archive;
alter table if exists public.wa_chats            set schema archive;
alter table if exists public.wa_connections      set schema archive;
alter table if exists public.wa_messages         set schema archive;

-- ---------- Site / conteúdo ----------
alter table if exists public.blog_posts      set schema archive;
alter table if exists public.blog_categories set schema archive;
alter table if exists public.update_logs     set schema archive;

commit;


-- ---------- CONFERÊNCIA ----------
-- `public` deve conter APENAS: materials, material_movements, users,
-- support_tickets, support_ticket_materials, support_ticket_comments.
select table_schema, table_name
from information_schema.tables
where table_schema in ('public', 'archive')
order by table_schema, table_name;


-- =============================================================================
--  COMO DESFAZER (se algo quebrar)
--  Troque <tabela> pelo nome e rode:
--
--      alter table archive.<tabela> set schema public;
--
--  Para trazer tudo de volta de uma vez:
--
--      do $$
--      declare t record;
--      begin
--        for t in select table_name from information_schema.tables
--                 where table_schema = 'archive'
--        loop
--          execute format('alter table archive.%I set schema public', t.table_name);
--        end loop;
--      end $$;
-- =============================================================================


-- =============================================================================
--  APAGAR DE VERDADE — NÃO RODE AGORA
--
--  Deixe as tabelas em `archive` por pelo menos 60 dias. Se nada quebrou e o
--  prazo de retenção fiscal (5 anos para documentos fiscais no Brasil) não se
--  aplica ao seu caso, aí sim, com backup guardado em outro lugar:
--
--      drop schema archive cascade;
--
--  Isso é IRREVERSÍVEL e destrói imóveis, clientes, contratos, comissões e
--  todo o histórico de atendimento. Confira o backup antes. Duas vezes.
-- =============================================================================
