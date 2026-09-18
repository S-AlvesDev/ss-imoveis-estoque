# Atende Aí — análise do repositório e proposta de arquitetura

> "A IA entende. O atendente resolve. O supervisor acompanha. O Atende Aí mostra os resultados."

Documento das fases 1 (análise) e 2 (arquitetura). Nada aqui altera o Stok Aí; é a base para a fase 3 (MVP), que só começa depois de aprovada.

---

## FASE 1 — Como o Stok Aí está montado

### Stack

| Camada | O que é | Onde |
|---|---|---|
| Frontend | React 19 + TypeScript, Vite, Tailwind v4, `motion` (animações), `zustand` (estado), `lucide-react` (ícones), `sonner` (toasts) | `src/` — uma SPA só, entrada `index.html` → `src/main.tsx` → `src/App.tsx` |
| Backend | Express em TypeScript, **uma função serverless na Vercel** (`api/index.js`, gerado por esbuild a partir de `src/server/vercel-entry.ts`); em dev, `tsx server.ts` com o Vite em middleware | `src/server/` (~11 mil linhas; `app.ts` com todas as rotas, ~3.900 linhas) |
| Banco | Supabase (Postgres + PostgREST + Storage). 28 migrações SQL aplicadas à mão no SQL Editor | `migrations/` |
| Deploy | Vercel: `vercel.json` reescreve `/api/*` para a função e o resto para `index.html`; um cron diário (`/api/cron/lembretes`) | raiz |
| Observabilidade | Sentry (console.error vira evento), Vercel Analytics (eventos nomeados em `src/lib/analytics.ts`) | `src/server/erros.ts` |

### Banco de dados

- **Multiempresa por coluna**: toda tabela de negócio tem `organization_id` → `organizations`. Identidade em `estoque_users` (matrícula única por org, e-mail único global, senha bcrypt, `role`, `whatsapp*`).
- **Isolamento em duas camadas**: (1) `src/server/tenant.ts` — `scopedDb(orgId)` injeta `.eq('organization_id', …)` em toda leitura e carimba toda escrita; a lista de tabelas protegidas é explícita (`TABELAS_DA_ORGANIZACAO`); (2) **RLS ligado em produção**: o servidor assina um JWT do PostgREST com `organization_id` e as políticas `isolamento_por_organizacao` fazem o banco fiscalizar. (O token agora é renovado antes de vencer — incidente de 16/09.)
- Tabelas globais (sem org): `organizations`, `password_resets`, `demo_requests`, `mp_eventos`, `whatsapp_mensagens` (org nula = desconhecido), `jatoba_mensagens`.
- Storage: bucket público `logos` (5 MB, só imagem), upload direto do navegador por URL assinada e conferência no servidor.

### Autenticação e permissões

- `POST /api/login` (matrícula ou e-mail + senha; bcrypt; limite por conta e por IP) → **JWT próprio** (`JWT_SECRET`, 12 h) com `{ id, nome, matricula, role, organization_id }`. Guardado no navegador (`zustand/persist`), enviado como `Authorization: Bearer`.
- Cadeia de middlewares: `authenticate` → `withTenant` (monta `req.db`, carrega plano/conta, bloqueia conta vencida) → `requireRole(…)` → `withAcessos` (nível por depósito).
- Cargos: `CEO` (dono da conta), `ADMINISTRADOR`, `ADMINISTRATIVO`, `OPERADOR`. Regras de negócio por cargo em `src/shared/constants.ts` (ex.: `podeRegistrarOperacao`).
- Recuperação de senha por e-mail (`src/server/senha.ts`: token aleatório, hash no banco, uso único, 1 h).

### WhatsApp (Evolution API)

- **Evolution API v2 self-hosted** (Baileys), num VPS do Samuel. Configuração por variáveis: `EVOLUTION_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE` (a instância do número do Stok Aí), `EVOLUTION_WEBHOOK_TOKEN`, `EVOLUTION_NUMERO`.
- **Já existe instância por empresa**: `POST /api/whatsapp/empresa/conectar` cria `org-<id>` com QR, webhook por instância (`/api/webhooks/whatsapp?token=…`), `qrDaInstancia`, `estadoDaInstancia`, `apagarInstancia`, `configurarWebhook`. É exatamente o modelo que o Atende Aí precisa.
- Cliente da Evolution em `src/server/evolution.ts`: `enviarTexto`, `mostrarDigitando`, `baixarMidia` (base64 via `getBase64FromMediaMessage`), `lerEvento` (só `MESSAGES_UPSERT`; **descarta `fromMe` e grupos**; classifica texto/imagem/áudio/documento).
- O webhook trabalha **antes de responder** ao HTTP (na Vercel a função congela ao responder).

### IA (Anthropic)

- `src/server/claude.ts`: cliente mínimo por `fetch` (sem SDK), laço de ferramentas, **system em blocos com cache**, `effort`, contagem de tokens (entrada/cache/saída). Modelo por env (`ASSISTENTE_MODELO`, padrão Sonnet 5).
- Dois assistentes em cima dele: o do WhatsApp (`assistente.ts`: propõe, a pessoa confirma com SIM, o código grava) e o Jatobá (`jatoba.ts`: Home e painel, propostas assinadas com JWT). Regras de segurança da IA compartilhadas como constantes.
- Tudo medido em tabelas de mensagens com tokens; tetos por IP/dia e por empresa/mês.

### Frontend

- Sem react-router: `src/app/router.ts` decide a tela **antes** do login pela URL (`/`, `/entrar`, `/criar-conta`, `/termos`…); depois do login, o sistema é um só em `/` e a barra lateral navega **por estado** (`AppView`).
- Dados: `useEstoqueData` chama `GET /api/data` (tudo de uma vez) e **atualiza por polling** (45 s, foco, volta da rede) — não há WebSocket nem Supabase Realtime.
- UI kit em `src/shared/ui/` (Button, Card, Modal, Field, Badge, StatCard, SegmentedControl, EmptyState, Sparkline…). Tema por CSS variables em `src/index.css` (`--brand`, `--bg`, `--surface`, `--text`…; a organização troca `--brand` e logo). A Home tem paleta própria (`.home`: navy + laranja).

### O que dá para reutilizar no Atende Aí

| Reaproveitar como está | Reaproveitar com pequena generalização | Não reaproveitar (é do estoque) |
|---|---|---|
| `claude.ts` (IA com cache/effort/tokens) | `tenant.ts` — hoje filtra por `organization_id`; precisa aceitar a coluna `empresa_id` e outra lista de tabelas (mudança aditiva, padrão igual ao atual) | `assistente.ts`, `estoque.ts`, `acessos.ts`, tudo de materiais/depósitos |
| `evolution.ts` (instância por empresa, QR, envio, mídia) — ganha funções novas (mídia, status, `fromMe`) | Login/recuperação de senha — a lógica de `senha.ts` é genérica; a rota de login é do Stok Aí, o Atende ganha a sua | `planos.ts`/`assinaturas.ts` — por enquanto o Atende **não cobra**; quando cobrar, generalizar por produto |
| `mail.ts`, `erros.ts` (Sentry), `email-layout.ts` | `src/shared/ui/*` — componentes neutros; o tema vem por CSS variables | `App.tsx`, `Sidebar`, `TopBar`, Home |
| Padrões: rate limit, webhook com token, trabalho-antes-de-responder, `lendo()` com erro assinado | `analytics.ts` — só acrescentar eventos | |

### O que deve permanecer isolado

- **Identidade**: usuários do Atende Aí **não** são `estoque_users` (matrícula, cargo de estoque, acesso por depósito não fazem sentido). Tabelas próprias.
- **Regras de negócio**: nenhum `import` de `src/server/{assistente,estoque,acessos,planos}.ts` dentro do Atende. Só o motor (`claude`, `evolution`, `tenant`, `mail`, `erros`).
- **Token de sessão**: um JWT do Stok Aí não pode entrar no Atende (nem o contrário) — claim `produto`.
- **Webhook**: rota própria; o `lerEvento` do Stok Aí continua descartando `fromMe`; o Atende precisa dele e tem o próprio leitor.

### Riscos e conflitos identificados

1. **Uma função serverless só** (`api/index.js`): tudo do Atende entra no mesmo bundle. Cold start cresce; um erro de carga de módulo derruba os dois produtos. Mitigação: o Atende é um `Router` montado por uma linha; testes de carga do bundle (`build:api`) no CI mental de cada commit.
2. **Rate limit geral `/api/` = 600 req / 15 min por IP.** Um escritório de atendimento com 5 pessoas atualizando a tela a cada 3 s dá 1.500 req/15 min de um IP só → bloqueio. O Atende precisa de **limitador próprio** (e de um jeito de atualizar que não seja martelar).
3. **Sem tempo real na infra atual.** Vercel serverless não segura WebSocket. Opções: polling curto por delta (MVP) ou **Supabase Realtime** (o navegador assina mudanças com um JWT do PostgREST assinado pelo servidor; RLS garante que só vê a própria empresa). Ver arquitetura.
4. **Vercel Hobby**: 10 s por função e uso comercial proibido (pendência já conhecida). Download de vídeo/PDF grande via Evolution + gravação no Storage pode passar de 10 s → mídia em duas etapas (registrar mensagem; baixar mídia em seguida) ou Vercel Pro.
5. **Evolution `fromMe`**: mensagens enviadas pelo celular da empresa precisam aparecer na central (senão o atendente não vê o que o dono respondeu pelo aparelho). O webhook do Atende recebe `MESSAGES_UPSERT` com `fromMe=true` e as registra como saída "pelo aparelho".
6. **Mídia**: hoje o Stok Aí só baixa base64 para mandar à IA. O Atende precisa **guardar** mídia (bucket privado, URL assinada por tempo) e **enviar** mídia (`sendMedia`, `sendWhatsAppAudio`, localização, contato) — funções novas em `evolution.ts`, aditivas.
7. **Um cron só** (`/api/cron/lembretes`): rotinas do Atende (SLA, "aguardando cliente" há X horas) entram no mesmo cron como funções separadas, ou ganham `crons` próprios no `vercel.json` (também aditivo).
8. **Migrações à mão**: cada tabela nova é um passo manual no Supabase. Agrupar as do Atende em poucas migrações (`029_atende_*`).

---

## FASE 2 — Arquitetura proposta

### Princípio

**Um repositório, dois produtos, um motor.** O Atende Aí vive em pastas próprias, importa do Stok Aí só o que é motor (IA, WhatsApp, tenant, e-mail, erros, UI kit), e não é importado por ele. Quando fizer sentido separar repositórios ou domínios, o corte já está desenhado.

```
src/
  server/                  ← motor + Stok Aí (como hoje)
    claude.ts evolution.ts tenant.ts mail.ts erros.ts …
  atende/                  ← Atende Aí
    server/
      index.ts             ← Router Express montado em /api/atende (1 linha em app.ts)
      auth.ts              ← login, JWT com produto:'atende', papéis, recuperação de senha
      tenant.ts            ← scopedDbAtende(empresaId) = scopedDb generalizado (coluna empresa_id)
      whatsapp.ts          ← conexão (QR), webhook, leitor de eventos (com fromMe), envio de mídia
      conversas.ts         ← estados, atribuição, transferência, encerramento, notas internas
      triagem.ts           ← IA: classifica, resume, sugere setor, escolhe atendente; correções
      midias.ts            ← bucket privado, URL assinada
      sync.ts              ← delta para o polling (e, depois, token do Realtime)
      metricas.ts          ← SQL do dashboard (views)
      *.test.ts
    shared/                ← tipos e regras usados por servidor e telas
      produto.ts           ← nome, slogan, paleta, logo
      papeis.ts            ← admin | supervisor | atendente e o que cada um pode
      estados.ts           ← estados de conversa e de lead
    app/                   ← a SPA do Atende (entrada própria)
      main.tsx App.tsx router.ts
      pages/ (Login, Central, Supervisao, Dashboard, Empresa, Times, Equipe, Clientes)
      features/ (conversa, triagem, presenca…)
      store/
  shared/ui/               ← UI kit comum (como hoje)
atende.html                ← segunda entrada do Vite
migrations/029_atende_*.sql
public/atende/             ← logo, favicon, og-image do Atende Aí
```

### Entrega e domínios

- **Vite com duas entradas** (`index.html` e `atende.html`, `build.rollupOptions.input`). Bundles separados: mexer no Atende não muda o bundle do Stok Aí.
- **Servidor**: `app.use('/api/atende', routerAtende)` em `createApp()` — o único ponto de contato em `app.ts`.
- **Endereço**: no MVP, `stokai.app/atende` (rewrite `/atende/*` → `/atende.html` no `vercel.json`). Quando existir domínio (`atendeai.app`), um rewrite por `host` manda a raiz do domínio para `atende.html` — o mesmo deploy serve os dois. O `siteUrl()` dos e-mails ganha versão do Atende.

### Identidade, sessão e permissões

- Tabelas próprias: `atende_empresas` (a empresa cliente) e `atende_usuarios` (funcionários). **Ponte com o Stok Aí** (pedida pelo Samuel na Etapa 1, migração 030): quem está logado no Stok Aí no mesmo navegador entra no Atende pela tela de login — a `atende_empresa` nasce ligada à `organization` (`organization_id`) e a pessoa ganha usuário ligado por `estoque_user_id`, com o cargo mapeado (CEO/Administrador → admin, Administrativo → supervisor, Operador → atendente). Só quem administra o estoque ativa. A sessão continua separada; atravessa a ponte só nome da empresa e nome/e-mail/cargo da pessoa — nenhuma regra de estoque (`src/atende/server/ponte.ts`).
- **JWT próprio** com o mesmo `JWT_SECRET`, claims `{ produto: 'atende', uid, empresa_id, papel }`. O middleware do Atende recusa token sem `produto: 'atende'`; o `authenticate` do Stok Aí continua ignorando esse claim mas o token não tem `organization_id` → `withTenant` recusa. Sem vazamento entre produtos.
- **Papéis** (escaláveis para mais níveis): `admin` (empresa, times, equipe, conexão), `supervisor` (todas as conversas da empresa ou dos times que supervisiona; intervir, orientar, assumir, transferir, encerrar, corrigir triagem, dashboard), `atendente` (as próprias conversas e a fila dos seus times). Regras em `atende/shared/papeis.ts`, conferidas no servidor a cada rota, e a **conversa** sempre checada: "este usuário pode ver/agir nesta conversa?" (`podeVerConversa`, `podeAgirNaConversa`).
- Login por **e-mail + senha** (sem matrícula), bcrypt, limite por conta e por IP, recuperação por e-mail reutilizando `senha.ts`.
- Sessão de 12 h; **revogação**: como o Atende gerencia presença (online/ausente), o middleware confere o usuário no banco com cache de 60 s — desativar alguém derruba o acesso em até um minuto (o Stok Aí ainda não faz isso; aqui nasce feito).

### Isolamento no banco

- Toda tabela do Atende tem `empresa_id` → `atende_empresas`, **não nula**.
- `scopedDb` generalizado: `scopedDb(id, { coluna: 'empresa_id', tabelas: TABELAS_DO_ATENDE })` — o padrão sem opções continua exatamente como hoje (`organization_id`, tabelas do estoque). Testes existentes cobrem o padrão; testes novos cobrem a variante.
- RLS em todas as tabelas `atende_*`, política `isolamento_por_empresa` com `request.jwt.claims.empresa_id`; o servidor assina o JWT do PostgREST com `empresa_id` (mesmo mecanismo do `tenant.ts`).
- Storage: bucket **privado** `atende-midias`, caminho `<empresa_id>/<conversa_id>/<mensagem_id>.<ext>`; leitura só por URL assinada (10 min) emitida pelo servidor após conferir a permissão.

### Modelo de dados (migração 029)

| Tabela | Para quê | Campos principais |
|---|---|---|
| `atende_empresas` | A empresa cliente e o contexto da IA | nome, slug, segmento, descricao, produtos_servicos, informacoes_ia, faq (jsonb), horario_atendimento (jsonb por dia), regras_atendimento, mensagem_fora_do_horario, organization_id (nulo), criado_em |
| `atende_usuarios` | Funcionários | empresa_id, nome, email (único global), senha, papel, ativo, presenca (`online`/`ausente`/`offline`), presenca_em, ultimo_acesso |
| `atende_times` | Setores | empresa_id, nome, descricao_para_ia (o que este setor atende), palavras_chave, ordem, ativo |
| `atende_time_membros` | Quem está em que setor | time_id, usuario_id, supervisiona (bool) |
| `atende_conexoes` | O WhatsApp da empresa | empresa_id, instancia (`atende-<id>`), numero, estado, conectado_em, ultimo_evento_em |
| `atende_clientes` | Quem escreve | empresa_id, telefone (único por empresa), nome, nome_whatsapp, foto_url, email, observacoes, campos (jsonb), primeiro_contato_em, ultimo_contato_em |
| `atende_conversas` | O atendimento | empresa_id, cliente_id, conexao_id, estado (`nova`/`em_triagem`/`na_fila`/`em_atendimento`/`aguardando_cliente`/`encerrada`), time_id, atendente_id, prioridade, assunto, intencao, resumo (da IA), aberta_em, primeira_resposta_em, ultima_mensagem_em, ultima_mensagem_do_cliente_em, nao_lidas, encerrada_em, encerrada_por, motivo_encerramento |
| `atende_mensagens` | A linha do tempo | empresa_id, conversa_id, direcao (`entrada`/`saida`/`interna`/`sistema`), autor_tipo (`cliente`/`atendente`/`supervisor`/`ia`/`aparelho`/`sistema`), autor_id, tipo (`texto`/`imagem`/`audio`/`video`/`documento`/`figurinha`/`localizacao`/`contato`), texto, midia (jsonb: caminho, mimetype, nome, tamanho, duracao, largura/altura), wa_id, status (`enviando`/`enviada`/`entregue`/`lida`/`falhou`), respondendo_a (id), criado_em. **Nota interna** = `direcao='interna'` (o cliente nunca vê; sai da linha do tempo pública) |
| `atende_triagens` | O que a IA decidiu, e a correção humana | empresa_id, conversa_id, mensagem_id, assunto, intencao, time_sugerido_id, atendente_sugerido_id, prioridade, confianca, resumo, resposta_enviada, modelo, tokens_entrada/cache/saida, corrigido_por, time_corrigido_id, corrigido_em, motivo_correcao |
| `atende_leads` | O funil | empresa_id, cliente_id, conversa_id, estado (`novo`/`em_atendimento`/`em_negociacao`/`aguardando_cliente`/`convertido`/`perdido`), sugestao_ia, valor (nulo), atualizado_por, atualizado_em |
| `atende_etiquetas` + `atende_conversa_etiquetas` | Tags | empresa_id, nome, cor |
| `atende_eventos` | Auditoria e histórico | empresa_id, conversa_id, usuario_id, tipo (`atribuida`/`assumida`/`transferida`/`encerrada`/`reaberta`/`lead_alterado`/`triagem_corrigida`/`orientacao`/`presenca`), dados (jsonb), criado_em |

Métricas do dashboard: **views SQL** sobre essas tabelas (`atende_v_conversas_por_dia`, `atende_v_desempenho_por_atendente`, `atende_v_funil`), não tabelas de analytics — sem duplicar dado no MVP.

### WhatsApp

- Uma instância Evolution por empresa: `atende-<id-curto>`, criada pelo admin em **Empresa → WhatsApp** (QR na tela, mesmo fluxo do `/api/whatsapp/empresa/conectar`).
- Webhook próprio: `POST /api/atende/webhooks/whatsapp?token=<EVOLUTION_WEBHOOK_TOKEN>` com eventos `MESSAGES_UPSERT` (entrada **e** `fromMe`), `MESSAGES_UPDATE` (entregue/lida), `CONNECTION_UPDATE` (estado da conexão). O leitor de eventos do Atende (`atende/server/whatsapp.ts`) entende texto, imagem, áudio, vídeo, documento, figurinha, localização, contato, citação. Grupos: ignorados no MVP.
- Entrada: identifica a empresa **pela instância** (`atende-<id>` → `atende_conexoes`), acha/cria o cliente pelo telefone (variantes do nono dígito), acha a conversa aberta ou abre uma nova, grava a mensagem, baixa a mídia para o bucket. Idempotente por `wa_id` (a Evolution reenvia).
- Saída: `enviarTexto` (já existe), `enviarMidia`, `enviarAudio`, `enviarLocalizacao`, `enviarContato`, `marcarLida`, `mostrarDigitando` — funções novas em `evolution.ts`, aditivas. A mensagem nasce `enviando`, vira `enviada` com o `wa_id` que a Evolution devolve, `entregue`/`lida` pelo `MESSAGES_UPDATE`.
- Se a conversa é nova e a IA está ligada para a empresa → **triagem** (abaixo). Se já está com um atendente → só grava e notifica. Se a empresa está fora do horário → mensagem automática configurável, conversa vai para a fila com `prioridade` normal.

### Triagem pela IA

- Motor: `claude.ts` com **uma ferramenta obrigatória** `classificar` (schema: assunto, intencao, time, prioridade, confianca, resumo, resposta_ao_cliente). Bloco fixo em cache: as regras da triagem; bloco variável: a empresa (descricao, produtos/serviços, informações, FAQ, horário, regras) e os times com a descrição de cada um. Só a **primeira mensagem** (ou as primeiras, se chegarem em rajada de 20 s) passa pela IA; depois é humano.
- A IA **não vende e não negocia**: responde uma linha ("Claro! Vou te encaminhar para a equipe de aluguel.") e, se a FAQ responder a pergunta objetiva (horário, endereço), pode dizer e ainda assim encaminhar. Nunca inventa dado da empresa — só o que está no cadastro.
- Encaminhamento: `time_sugerido` → atendente do time **online com menos conversas abertas**; ninguém online → fila do time (`na_fila`), supervisor avisado. Regras de desempate e "atendente preferencial do cliente" (quem atendeu por último) na fase seguinte.
- **Supervisão da triagem**: cada decisão fica em `atende_triagens`; o supervisor vê e corrige ("classificação incorreta → Financeiro"), gerando `atende_eventos.triagem_corrigida`. **Sem aprendizado automático**: as correções alimentam um relatório ("assuntos mais corrigidos") e o admin ajusta a descrição dos times à mão. Mais tarde, com histórico, dá para oferecer exemplos rotulados ao prompt — com revisão humana.
- Custo: uma chamada por conversa nova (~2–3k tokens, ~US$0,005). Teto por empresa/mês e registro de tokens em `atende_triagens`.

### Tempo real

- **MVP**: `GET /api/atende/sync?desde=<cursor>` devolve só o que mudou (conversas e mensagens da empresa que o usuário pode ver, presença dos colegas). A central pede a cada **4 s** com a aba visível, **15 s** oculta, e imediatamente ao focar — com **limitador próprio** do Atende (por usuário, folgado) e fora do `apiLimiter` geral. Otimista no envio: a mensagem aparece antes da confirmação.
- **Evolução natural (fase seguinte)**: Supabase Realtime — o servidor assina para o navegador um JWT do PostgREST com `empresa_id` (mesmo mecanismo de `tenant.ts`), o navegador assina `postgres_changes` em `atende_mensagens`/`atende_conversas`; a RLS garante o isolamento. O hook de dados é o único lugar que muda.
- Presença: `atende_usuarios.presenca` atualizada pelo próprio `sync` (heartbeat); `offline` após 2 min sem heartbeat (calculado, não gravado).

### A central e a supervisão (telas)

- **Central** (atendente): três colunas — conversas (filtros: minhas / do meu time / fila / aguardando cliente / encerradas; busca por nome, telefone, assunto; etiquetas), a conversa (linha do tempo com mídia, áudio com player, imagem com lightbox, documento com download por URL assinada; caixa com anexos, emoji, gravação de áudio no navegador), painel lateral do cliente (ficha, contexto da IA — setor, assunto, resumo —, lead, etiquetas, histórico de conversas anteriores). Notas internas na própria linha do tempo, com fundo diferente.
- **Supervisão**: equipe em tempo real (nome, time, presença, conversas abertas, tempo sem responder), triagens recentes com botão de corrigir, e qualquer conversa aberta em modo de acompanhamento: **orientar** (nota interna que só o atendente vê), **assumir**, **transferir** (time ou pessoa), **encerrar**.
- **Dashboard**: cartões (novos leads, atendimentos, recorrentes, em atendimento; convertidos, em negociação, aguardando, sem interação recente), indicadores (taxa de conversão, tempo médio de primeira resposta, tempo médio de atendimento, atendimentos por funcionário, leads e conversões por setor), desempenho por funcionário. Tudo de views SQL — a "IA no dashboard" (fase futura) consulta as mesmas views por ferramenta, nunca inventa número.
- **Empresa / Times / Equipe / Clientes**: cadastros. Empresa inclui o contexto da IA e o WhatsApp (QR).

### Design

- Tema do Atende por CSS variables num escopo próprio (`.atende` na raiz da SPA): `--brand` roxo/violeta (`#6d28d9` → `#7c3aed`), fundo navy profundo (`#0b1020`/`#111633`) no login e na supervisão, superfícies claras na central (leitura longa), gradientes azul→roxo em cabeçalhos e cartões de destaque, lilás para estados suaves. Mesmos componentes do UI kit — a identidade vem das variáveis, não de componentes novos.
- Logo e ícone em `public/atende/` (o Samuel fornece os arquivos: logo horizontal claro/escuro, símbolo, favicon, og-image).
- Jatobá: espaço reservado no cabeçalho da central para o assistente, fase futura.

---

## FASE 3 — MVP (proposta de recorte)

Objetivo: uma empresa conecta o WhatsApp, a IA triagem, o atendente atende com mídia, o supervisor acompanha, o dashboard mostra o básico. Sem cobrança (toda empresa em avaliação), sem Realtime (polling por delta), sem integração com o Stok Aí.

| Marco | Entrega | Horas (estimativa) |
|---|---|---|
| **M1 — Fundação** | Migração 029, `scopedDb` generalizado, Router `/api/atende`, login/JWT/papéis, cadastro de empresa, times, equipe; segunda entrada do Vite; tema; tela de login e "Empresa" | 40–60 h |
| **M2 — WhatsApp** | Conexão por QR, webhook próprio com `fromMe`, leitor de eventos com todos os tipos, mídia no bucket privado, envio de texto/mídia/áudio; `sync` por delta; a **Central** funcional (lista, conversa, ficha do cliente) | 70–90 h |
| **M3 — IA e fluxo** | Triagem com `classificar`, encaminhamento a time/atendente, resposta automática curta, fora do horário, estados da conversa e do lead, transferência, encerramento, notas internas, etiquetas, auditoria | 50–70 h |
| **M4 — Supervisão e dashboard** | Tela de supervisão (equipe, triagens, acompanhar/orientar/assumir/transferir), correção de triagem, views SQL e dashboard inicial, desempenho por funcionário | 40–60 h |
| | **Total** | **200–280 h** |

Cada marco termina com testes, `tsc`, build das duas entradas e o Stok Aí intacto (a suíte atual, 330 testes, tem que continuar verde em todo commit).

### Fora do MVP (fila para depois, nesta ordem)

Supabase Realtime · cobrança e planos do Atende (generalizar `assinaturas` por produto) · IA no dashboard (perguntas sobre dados reais) · atendente preferencial e regras de distribuição avançadas · grupos · templates/respostas prontas · SLA com alerta · exemplos rotulados na triagem (com revisão) · domínio `atendeai.app` · integração com o Stok Aí (a conversa de um cliente que também é da equipe de estoque) · app mobile para atendentes.

### Decisões que precisam do Samuel

1. ~~Identidade separada com ponte opcional~~ — decidido: identidade separada **com a ponte ativa** (entrar/ativar pela sessão do Stok Aí).
2. **Endereço no MVP**: `stokai.app/atende` até existir o domínio?
3. **Sem cobrança no MVP** (toda empresa em avaliação) — ok?
4. **Polling por delta no MVP**, Realtime logo depois — ok?
5. **Um toque no código compartilhado**: generalizar `scopedDb` (aditivo, coberto por testes) e acrescentar funções em `evolution.ts` (aditivo). Autorizado?
6. Arquivos da marca (logo horizontal claro/escuro, símbolo, favicon) em `public/atende/`.
