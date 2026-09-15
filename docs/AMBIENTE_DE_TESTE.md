# Ambiente de teste (staging)

Hoje tudo é testado em produção, com organizações reais. Um ambiente de
teste é uma segunda cópia do sistema — mesmo código, outro banco, outra
URL — onde dá para quebrar coisas sem medo. São uns 40 minutos, uma vez.

## 1. Um segundo projeto no Supabase

1. supabase.com → **New project** → nome `stokai-teste`, mesma região do
   projeto de produção. Guarde a senha do banco.
2. **SQL Editor** → rode as migrações em ordem, `migrations/001_…` até a
   última (cada arquivo inteiro, um por vez). Pule os `*_rollback.sql`.
3. **Project Settings → API**: copie `Project URL`, `anon key` e
   `service_role key` (a service role nunca vai para o navegador; só para
   as variáveis do servidor).
4. **Storage**: crie o bucket `logos` público, igual ao de produção (é
   onde vai o logo das organizações).

## 2. Uma branch e um projeto de preview na Vercel

O jeito mais simples é um **segundo projeto** na Vercel apontando para o
mesmo repositório, mas para a branch `teste`:

1. `git checkout -b teste && git push -u origin teste`.
2. vercel.com → **Add New → Project** → o mesmo repositório → nome
   `stokai-teste` → em *Git*, **Production Branch = `teste`**.
3. **Environment Variables**: as mesmas de produção (copie da lista em
   `.env.example`), trocando:
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_URL` e
     `VITE_SUPABASE_ANON_KEY` → os do projeto `stokai-teste`;
   - `VITE_SITE_URL` → a URL do projeto de teste (ex.:
     `https://stokai-teste.vercel.app`);
   - `MP_PLANO_DE_TESTE` → o plano de R$ 0,50, e as credenciais do MP
     podem ser as **de teste** do painel do Mercado Pago (sem cobrar);
   - `EVOLUTION_INSTANCE` → uma instância separada (`stokai-teste`),
     conectada a outro chip, ou deixe as `EVOLUTION_*` vazias e use o
     simulador em Configurações;
   - `SENTRY_DSN` → de preferência um projeto Sentry separado
     (`stokai-teste`), para os erros de teste não se misturarem;
   - `CRON_SECRET` → outro valor (o cron da Vercel roda em cada projeto).
4. Deploy. A URL de teste fica em `stokai-teste.vercel.app`.

## 3. Como usar no dia a dia

- Trabalho novo entra na branch `teste` primeiro; a Vercel publica
  sozinha. Testou, gostou → `git checkout master && git merge teste &&
  git push` → vai para produção.
- Migração nova: roda **primeiro no Supabase de teste**, sobe o código
  na branch `teste`, confere; só depois roda no Supabase de produção e
  faz o merge.
- Para testar cobrança de verdade sem pagar, use as credenciais de teste
  do Mercado Pago (Suas integrações → a aplicação → *Credenciais de
  teste*) e os cartões de teste da documentação deles.
- Crie uma organização de teste pela própria tela "Criar conta"; a
  avaliação de 7 dias vale lá como aqui. Para virar Empresarial sem
  pagar: `update organizations set plano = 'empresarial' where nome = '…'`.

## 4. O que não precisa duplicar

- O domínio: o projeto de teste vive em `*.vercel.app`.
- O SMTP: pode ser o mesmo; os e-mails de teste saem do mesmo remetente
  (se preferir, deixe `SMTP_*` vazio no teste e leia os e-mails no log).
- A chave da Anthropic: pode ser a mesma (o custo é por uso).
