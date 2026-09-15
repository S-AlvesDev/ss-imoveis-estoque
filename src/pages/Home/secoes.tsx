import { useId, useState } from 'react';
import {
  ArrowRight,
  ArrowLeftRight,
  Boxes,
  Building2,
  ClipboardList,
  FileText,
  Layers,
  MapPin,
  MessageSquareWarning,
  Network,
  Search,
  ShieldCheck,
  Sparkles,
  Table2,
  Users,
  Warehouse,
  Bot,
  BellRing,
  Check,
  MessageCircle,
  ShoppingCart,
  Truck,
  Workflow,
} from 'lucide-react';
import { ROTAS } from '@/app/router';
import { track } from '@/lib/analytics';
import { Botao, BotaoLink, Cartao, Container, Eyebrow, Revelar, Secao } from './ui';
import { AVALIACAO_DIAS, DEFINICOES, ENTERPRISE, MESES_GRATIS_NO_ANUAL, PLANOS, USO_JUSTO, formatarPreco, precoDo } from '@/shared/planos';

/* ------------------------------------------------------------------------- */
/*  Prova rápida — quatro valores antes de qualquer lista de funcionalidades  */
/* ------------------------------------------------------------------------- */

const PROVAS = [
  { icone: <ShieldCheck size={20} />, titulo: 'Controle', texto: 'Saldo por depósito e mínimo por material. Alerta só quando falta de verdade.' },
  { icone: <Search size={20} />, titulo: 'Rastreabilidade', texto: 'Toda movimentação com origem, destino, quantidade e quem fez.' },
  { icone: <Network size={20} />, titulo: 'Multiunidade', texto: 'Cada filial com o próprio estoque. Uma empresa, um só controle.' },
  { icone: <MessageCircle size={20} />, titulo: 'WhatsApp', texto: 'A equipe registra pelo celular e os fornecedores respondem cotações — o sistema confirma antes de gravar.' },
];

export function Prova() {
  return (
    <section aria-label="O que o Stok Aí entrega" className="border-y border-[var(--linha)] bg-[var(--navy-2)]/60">
      <Container>
        <ul className="grid gap-px sm:grid-cols-2 lg:grid-cols-4">
          {PROVAS.map((p, i) => (
            <Revelar as="li" key={p.titulo} delay={i * 0.06} className="flex gap-4 px-2 py-8 sm:px-5">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--laranja)]/12 text-[var(--laranja)]">{p.icone}</span>
              <div>
                <p className="font-bold text-white">{p.titulo}</p>
                <p className="mt-1 text-sm leading-relaxed text-slate-400">{p.texto}</p>
              </div>
            </Revelar>
          ))}
        </ul>
      </Container>
    </section>
  );
}

/* ------------------------------------------------------------------------- */
/*  Dor — as perguntas que o gestor faz todo dia                              */
/* ------------------------------------------------------------------------- */

const PERGUNTAS = [
  { icone: <MapPin size={22} />, pergunta: 'Onde está esse material?', resposta: 'Veja onde está: saldo por unidade e por depósito, na hora.' },
  { icone: <Users size={22} />, pergunta: 'Quem retirou?', resposta: 'Saiba quem movimentou: cada saída tem nome, data e destino.' },
  { icone: <Boxes size={22} />, pergunta: 'Quanto ainda temos?', resposta: 'Total da empresa e de cada lugar, comparado com o mínimo.' },
  { icone: <Truck size={22} />, pergunta: 'Para qual unidade foi?', resposta: 'Remessas registradas de um depósito para o outro, sem planilha.' },
];

export function Dor() {
  return (
    <Secao
      id="problema"
      eyebrow="O problema"
      titulo="As perguntas que ninguém consegue responder sem procurar."
      descricao="O Stok Aí transforma essas perguntas em informação."
    >
      <ul className="mt-12 grid gap-4 sm:grid-cols-2">
        {PERGUNTAS.map((p, i) => (
          <Revelar as="li" key={p.pergunta} delay={i * 0.06}>
            <Cartao className="flex h-full gap-5">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-white/[0.06] bg-white/[0.03] text-slate-300 transition-colors group-hover:border-[var(--laranja)]/40 group-hover:text-[var(--laranja)]">
                {p.icone}
              </span>
              <div>
                <p className="text-lg font-bold text-white">“{p.pergunta}”</p>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{p.resposta}</p>
              </div>
            </Cartao>
          </Revelar>
        ))}
      </ul>
    </Secao>
  );
}

/* ------------------------------------------------------------------------- */
/*  Recursos — como resolve, com microcopy simples                            */
/* ------------------------------------------------------------------------- */

const RECURSOS = [
  { icone: <Boxes size={20} />, titulo: 'Estoque', texto: 'Catálogo único da empresa, com unidade de medida, categoria e mínimo por material.', micro: 'Veja o que você tem' },
  { icone: <Warehouse size={20} />, titulo: 'Depósitos no modo certo', texto: 'Almoxarifado, empréstimo de ferramentas, entrega de EPI com assinatura, validade e lotes, patrimônio: cada depósito funciona como a operação pede.', micro: 'Veja onde está' },
  { icone: <ArrowLeftRight size={20} />, titulo: 'Movimentações', texto: 'Entrada, saída, transferência, consumo, empréstimo com prazo, entrega, devolução — sempre com origem, destino e responsável.', micro: 'Registre a saída' },
  { icone: <MessageCircle size={20} />, titulo: 'Stok Aí no WhatsApp', texto: '"Quanto tem de cimento?" "Saiu 10 sacos pra obra." A equipe consulta e registra pelo celular; o sistema pede SIM antes de gravar.', micro: 'Opere pelo celular' },
  { icone: <ShoppingCart size={20} />, titulo: 'Compras e cotações', texto: 'Monte a lista, escolha os fornecedores e o sistema pergunta o preço a cada um pelo WhatsApp. Compare e feche o pedido com a nota fiscal pedida.', micro: 'Compre onde está mais barato' },
  { icone: <Building2 size={20} />, titulo: 'Unidades', texto: 'Cada filial com o próprio estoque e os próprios materiais. Trocar de unidade é um clique; a matriz vê tudo.', micro: 'Escolha a unidade' },
  { icone: <Users size={20} />, titulo: 'Usuários e acessos', texto: 'Cada pessoa vê e opera só o depósito que é dela — no painel e no WhatsApp. O administrador decide quem faz o quê.', micro: 'Saiba quem movimentou' },
  { icone: <BellRing size={20} />, titulo: 'Alertas e resumos', texto: 'Abaixo do mínimo, empréstimo atrasado, lote vencendo: por e-mail na hora, no WhatsApp de manhã, e um resumo da semana toda segunda.', micro: 'Saiba antes de faltar' },
  { icone: <FileText size={20} />, titulo: 'Relatórios e exportação', texto: 'Auditoria por período e lista de reposição em PDF; catálogo em Word; tudo em CSV quando quiser. Os dados são seus.', micro: 'Leve para a reunião' },
];

export function Recursos() {
  return (
    <Secao
      id="recursos"
      eyebrow="Como resolve"
      titulo="Tudo que a operação precisa, e nada que ela não usa."
      descricao="Nove partes que conversam entre si. Você começa pelo cadastro e o resto acompanha."
      className="bg-[var(--navy-2)]/40"
    >
      <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {RECURSOS.map((r, i) => (
          <Revelar as="li" key={r.titulo} delay={(i % 3) * 0.06}>
            <Cartao className="h-full">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--laranja)]/12 text-[var(--laranja)]">{r.icone}</span>
              <p className="mt-4 text-lg font-bold text-white">{r.titulo}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{r.texto}</p>
              <p className="mt-4 inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-slate-500 transition-colors group-hover:text-[var(--laranja)]">
                {r.micro} <ArrowRight size={12} />
              </p>
            </Cartao>
          </Revelar>
        ))}
      </ul>
    </Secao>
  );
}


/* ------------------------------------------------------------------------- */
/*  WhatsApp — a conversa de verdade, dos dois lados                          */
/* ------------------------------------------------------------------------- */

function Balao({ de, children, hora }: { de: 'pessoa' | 'stokai'; children: React.ReactNode; hora: string }) {
  const nosso = de === 'stokai';
  return (
    <div className={`flex ${nosso ? 'justify-start' : 'justify-end'}`}>
      <div className={`max-w-[88%] rounded-2xl px-3 py-2 text-[13px] leading-snug ${nosso ? 'rounded-tl-sm bg-[#1f2937] text-slate-200' : 'rounded-tr-sm bg-[#1f3b2a] text-slate-100'}`}>
        <div className="whitespace-pre-line">{children}</div>
        <p className={`mt-1 text-right text-[10px] ${nosso ? 'text-slate-500' : 'text-emerald-300/60'}`}>{hora}</p>
      </div>
    </div>
  );
}

function Conversa({ titulo, sub, children }: { titulo: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0b141a] shadow-2xl">
      <div className="flex items-center gap-3 border-b border-white/10 bg-[#111b21] px-4 py-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--laranja)] text-[#1a0c00]">
          <MessageCircle size={16} />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-white">{titulo}</p>
          <p className="truncate text-[11px] text-slate-400">{sub}</p>
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3 sm:p-4">{children}</div>
    </div>
  );
}

const PONTOS_WHATSAPP = [
  { icone: <ShieldCheck size={18} />, titulo: 'A IA propõe. A pessoa confirma. O sistema grava.', texto: 'Nenhuma movimentação entra sem um SIM. Fica no histórico com nome, hora e "via WhatsApp" — igual ao painel.' },
  { icone: <Users size={18} />, titulo: 'Cada um só faz o que o cargo permite', texto: 'Operador registra saída, consumo, transferência e devolução; entrada e ajuste são do administrador. Com PIN, se quiser.' },
  { icone: <ShoppingCart size={18} />, titulo: 'Cotação sem sair do sistema', texto: 'A mesma pergunta vai a cada fornecedor. A IA só lê a resposta — foto de tabela inclusive — e a tela mostra onde está mais barato.' },
];

export function NoWhatsapp() {
  return (
    <Secao id="whatsapp" eyebrow="Stok Aí no WhatsApp" titulo="O estoque responde no mesmo lugar onde a equipe já conversa." descricao="Quem está na obra não abre painel. Manda mensagem. O Stok Aí entende, confirma e registra — e faz a cotação com os fornecedores do mesmo jeito.">
      <div className="mt-12 grid gap-4 lg:grid-cols-2">
        <Revelar className="min-w-0">
          <Conversa titulo="Stok Aí" sub="Carlos, operador · Obra Bairro Norte">
            <Balao de="pessoa" hora="09:12">quanto tem de cimento?</Balao>
            <Balao de="stokai" hora="09:12">
              Cimento CP-II 50kg — Central: 148, Obra Bairro Norte: 12. Total 160 sc (mínimo 40).
            </Balao>
            <Balao de="pessoa" hora="09:13">saiu 10 sacos pra obra</Balao>
            <Balao de="stokai" hora="09:13">
              Transferir 10 sc de Cimento CP-II 50kg do Central para Obra Bairro Norte?{'\n'}Responda SIM para confirmar.
            </Balao>
            <Balao de="pessoa" hora="09:13">SIM</Balao>
            <Balao de="stokai" hora="09:13">
              ✅ Transferido. Saldo agora — Central: 138 sc; Obra Bairro Norte: 22 sc.
            </Balao>
          </Conversa>
        </Revelar>
        <Revelar delay={0.08} className="min-w-0">
          <Conversa titulo="Depósito Central Materiais" sub="fornecedor · cotação “Obra Norte”">
            <Balao de="stokai" hora="10:02">
              Olá, João! 👋 Aqui é o assistente de compras da Construtora Horizonte (pelo Stok Aí).{'\n'}Precisamos de cotação para "Obra Norte":{'\n'}1) 50 sc — Cimento CP-II 50kg{'\n'}2) 2 lata — Tinta acrílica branca 18L{'\n'}Entrega em: Obra Bairro Norte
            </Balao>
            <Balao de="pessoa" hora="10:41">cimento 31,90 o saco, tinta não tenho. entrego amanhã cedo</Balao>
            <Balao de="stokai" hora="10:41">
              Obrigado, João! Registrei: cimento R$ 31,90/sc, entrega amanhã; tinta sem estoque. A Construtora Horizonte vai avaliar e retorna por aqui.
            </Balao>
          </Conversa>
        </Revelar>
      </div>
      <ul className="mt-10 grid gap-6 md:grid-cols-3">
        {PONTOS_WHATSAPP.map((p, i) => (
          <Revelar as="li" key={p.titulo} delay={i * 0.06} className="flex gap-4">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--laranja)]/12 text-[var(--laranja)]">{p.icone}</span>
            <div>
              <p className="font-bold text-white">{p.titulo}</p>
              <p className="mt-1 text-sm leading-relaxed text-slate-400">{p.texto}</p>
            </div>
          </Revelar>
        ))}
      </ul>
      <Revelar className="mt-8 text-xs text-slate-500">Faz parte do plano Empresarial. As mensagens saem do número do Stok Aí ou, se preferir, do WhatsApp da sua empresa.</Revelar>
    </Secao>
  );
}

/* ------------------------------------------------------------------------- */
/*  Planos — o catálogo de src/shared/planos.ts, vendido                      */
/* ------------------------------------------------------------------------- */
export function Planos({ onDemo }: { onDemo: (origem: string) => void }) {
  return (
    <Secao id="planos" eyebrow="Planos" titulo="Do tamanho da sua operação." descricao={`Comece com ${AVALIACAO_DIAS} dias grátis, sem cartão, e escolha o plano quando quiser continuar. Todo plano tem materiais, categorias, estoque mínimo, histórico e chamados; a diferença é quanto e o quê a mais.`}>
      <ul className="mt-12 grid gap-4 lg:grid-cols-3">
        {PLANOS.map((id, i) => {
          const p = DEFINICOES[id];
          const destaque = id === 'profissional';
          return (
            <Revelar as="li" key={id} delay={i * 0.08} className="h-full">
              <div className={`relative flex h-full flex-col rounded-2xl border p-6 ${destaque ? 'border-[var(--laranja)]/60 bg-[var(--navy-2)] shadow-[0_30px_60px_-30px_rgba(255,138,36,0.45)]' : 'border-[var(--linha)] bg-[var(--navy-2)]/60'}`}>
                {destaque && (
                  <span className="absolute -top-3 left-6 rounded-full bg-[var(--laranja)] px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-[#1a0c00]">Mais escolhido</span>
                )}
                <p className="text-lg font-bold text-white">{p.nome}</p>
                <p className="text-sm text-slate-400">{p.publico}</p>
                <p className="mt-5 flex items-baseline gap-1 text-white">
                  <span className="text-4xl font-extrabold tracking-tight">{formatarPreco(p.preco)}</span>
                  <span className="text-sm text-slate-400">/mês</span>
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  ou {formatarPreco(precoDo(id, 'anual'))}/ano — {MESES_GRATIS_NO_ANUAL} meses grátis
                </p>
                <ul className="mt-6 space-y-2.5 text-sm text-slate-300">
                  {p.destaques.map((d) => (
                    <li key={d} className="flex items-start gap-2.5">
                      <Check size={16} className="mt-0.5 shrink-0 text-[var(--laranja)]" aria-hidden />
                      <span>{d}</span>
                    </li>
                  ))}
                </ul>
                {p.servicos.length > 0 && (
                  <p className="mt-5 border-t border-[var(--linha)] pt-4 text-xs leading-relaxed text-slate-400">
                    <span className="font-semibold text-slate-300">Inclui:</span> {p.servicos.join(' · ')}
                  </p>
                )}
                <div className="mt-auto pt-6">
                  <BotaoLink href={ROTAS.criarConta} variante={destaque ? 'primario' : 'secundario'} className="w-full" onClick={() => track('home_plano_click', { plano: id })}>
                    Começar {AVALIACAO_DIAS} dias grátis <ArrowRight size={16} />
                  </BotaoLink>
                </div>
              </div>
            </Revelar>
          );
        })}
      </ul>
      <Revelar className="mt-6 flex flex-col gap-2 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
        <p>{USO_JUSTO}</p>
        <p>
          <span className="font-semibold text-slate-300">{ENTERPRISE.nome}:</span> {ENTERPRISE.descricao}{' '}
          <button type="button" onClick={() => onDemo('planos-enterprise')} className="font-semibold text-[var(--laranja)] hover:underline">
            Falar com a gente
          </button>
        </p>
      </Revelar>
    </Secao>
  );
}

/* ------------------------------------------------------------------------- */
/*  Como funciona — três passos                                               */
/* ------------------------------------------------------------------------- */

const PASSOS = [
  { icone: <ClipboardList size={22} />, titulo: 'Cadastre a operação', texto: 'Empresa, unidades, depósitos e materiais. O primeiro acesso pergunta qual é o primeiro estoque e como ele funciona.' },
  { icone: <ArrowLeftRight size={22} />, titulo: 'Registre as movimentações', texto: 'No painel ou pelo WhatsApp: "saiu 10 sacos de cimento pra obra", o sistema confirma, e está registrado com nome e hora.' },
  { icone: <Table2 size={22} />, titulo: 'Acompanhe e decida', texto: 'Painel com saldo, alertas e histórico. Faltou? Cote com os fornecedores pelo próprio sistema e feche onde estiver mais barato.' },
];

export function ComoFunciona() {
  return (
    <Secao id="como-funciona" eyebrow="Como funciona" titulo="Três passos. O primeiro leva uma tarde." descricao="Sem implantação, sem consultoria: a empresa cria a conta e começa.">
      <ol className="mt-12 grid gap-6 md:grid-cols-3">
        {PASSOS.map((p, i) => (
          <Revelar as="li" key={p.titulo} delay={i * 0.08} className="relative">
            <div className="flex items-center gap-3">
              <span className="font-mono text-sm font-bold text-[var(--laranja)]">0{i + 1}</span>
              <span className="h-px flex-1 bg-[var(--linha)]" aria-hidden />
            </div>
            <span className="mt-5 flex h-11 w-11 items-center justify-center rounded-xl border border-white/[0.06] bg-[var(--navy-2)] text-white">{p.icone}</span>
            <p className="mt-4 text-lg font-bold text-white">{p.titulo}</p>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{p.texto}</p>
          </Revelar>
        ))}
      </ol>
      <Revelar className="mt-10">
        <BotaoLink href={ROTAS.criarConta} variante="secundario">
          Criar a conta da minha empresa <ArrowRight size={16} />
        </BotaoLink>
      </Revelar>
    </Secao>
  );
}

/* ------------------------------------------------------------------------- */
/*  Antes x Depois — o slider                                                 */
/* ------------------------------------------------------------------------- */

function PainelAntes() {
  return (
    <div className="flex h-full flex-col gap-3 bg-[#141418] p-4 sm:p-6" aria-label="Antes: planilhas e mensagens">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-rose-300">
        <MessageSquareWarning size={14} /> Antes
      </div>
      <div className="space-y-2">
        <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-[#2a2a30] px-3 py-2 text-xs text-slate-300">alguém pegou cimento ontem? tá faltando aqui</div>
        <div className="ml-auto max-w-[85%] rounded-2xl rounded-tr-sm bg-[#1f3b2a] px-3 py-2 text-xs text-slate-300">acho que o Carlos levou 20 pra obra 2</div>
        <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-[#2a2a30] px-3 py-2 text-xs text-slate-300">a planilha diz 148 mas tem uns 90</div>
        <div className="ml-auto max-w-[85%] rounded-2xl rounded-tr-sm bg-[#1f3b2a] px-3 py-2 text-xs text-slate-300">qual planilha? a de março?</div>
      </div>
      {/* No celular o painel é baixo: só as mensagens já contam a história. */}
      <div className="mt-auto hidden overflow-hidden rounded-lg border border-white/10 bg-[#1c1c22] sm:block">
        <div className="grid grid-cols-4 gap-px bg-white/5 text-[10px]">
          {['MATERIAL', 'QTD', 'OBS', ''].map((h, i) => (
            <div key={i} className="bg-[#26262c] px-2 py-1 font-semibold text-slate-400">
              {h}
            </div>
          ))}
          {['Cimento', '148?', 'ver c/ Carlos', '', 'Vergalhão', '', 'acabou??', '', 'Tijolo', '1200', 'obra 2 (?)', ''].map((c, i) => (
            <div key={i} className={`bg-[#1c1c22] px-2 py-1 ${c.includes('?') ? 'text-rose-300' : 'text-slate-400'}`}>
              {c}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PainelDepois() {
  return (
    <div className="flex h-full flex-col gap-3 bg-[var(--navy-2)] p-4 sm:p-6" aria-label="Depois: uma visão centralizada">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--verde)]">
        <ShieldCheck size={14} /> Depois
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[
          ['Cimento CP-II', '148', 'ok'],
          ['Vergalhão 10 mm', '52', 'ok'],
          ['Tijolo 9 furos', '1.2k', 'obra'],
        ].map(([n, q, s]) => (
          <div key={n} className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-2.5">
            <p className="truncate text-[10px] text-slate-500">{n}</p>
            <p className="text-lg font-bold text-white">{q}</p>
            <span className={`text-[10px] font-semibold ${s === 'ok' ? 'text-emerald-300' : 'text-sky-300'}`}>{s === 'ok' ? 'Acima do mínimo' : 'Tem na Obra'}</span>
          </div>
        ))}
      </div>
      <ul className="mt-auto space-y-1.5 text-xs">
        {[
          ['Remessa', 'Cimento CP-II', 'Central → Obra', 'Carlos M. · 09:12'],
          ['Consumo', 'Cimento CP-II', 'Obra → Bloco B', 'Renata S. · 08:40'],
        ].map(([t, m, r, q]) => (
          <li key={q} className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-2">
            <span className="rounded bg-[var(--laranja)]/15 px-1.5 py-0.5 text-[10px] font-semibold text-[var(--laranja)]">{t}</span>
            <span className="truncate font-medium text-white">{m}</span>
            <span className="ml-auto hidden text-slate-500 sm:inline">{r}</span>
            <span className="text-slate-500">{q}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Um controle deslizante de verdade — <input type="range"> — para funcionar
 * com teclado e leitor de tela. O valor define até onde o "antes" cobre o
 * "depois".
 */
export function AntesDepois() {
  const [pos, setPos] = useState(50);
  const id = useId();
  return (
    <Secao id="antes-depois" eyebrow="Antes × Depois" titulo="De perguntas no grupo a respostas na tela." descricao="Arraste para comparar. O lado esquerdo é como a maioria das empresas controla estoque hoje.">
      <Revelar className="mt-12">
        <div className="relative aspect-[4/3] w-full select-none overflow-hidden rounded-2xl border border-white/10 shadow-2xl sm:aspect-[16/8]">
          <div className="absolute inset-0">
            <PainelDepois />
          </div>
          <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
            <PainelAntes />
          </div>
          {/* a linha divisória e o punho */}
          <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-[var(--laranja)]" style={{ left: `calc(${pos}% - 1px)` }} aria-hidden>
            <span className="absolute left-1/2 top-1/2 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[var(--laranja)] text-[#1a0c00] shadow-lg">
              <ArrowLeftRight size={16} />
            </span>
          </div>
          <label htmlFor={id} className="sr-only">
            Comparar antes e depois
          </label>
          <input
            id={id}
            type="range"
            min={0}
            max={100}
            value={pos}
            onChange={(e) => setPos(Number(e.target.value))}
            aria-valuetext={`${pos}% antes, ${100 - pos}% depois`}
            className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
          />
        </div>
        <div className="mt-4 flex justify-between text-xs font-semibold uppercase tracking-wider">
          <span className="text-rose-300">Planilhas · WhatsApp · descontrole</span>
          <span className="text-[var(--verde)]">Centralização · rastreabilidade · visibilidade</span>
        </div>
      </Revelar>
    </Secao>
  );
}

/* ------------------------------------------------------------------------- */
/*  Multiunidade — empresa → unidades → depósitos → estoque                   */
/* ------------------------------------------------------------------------- */

function Caixa({ x, y, w, h, titulo, sub, destaque }: { x: number; y: number; w: number; h: number; titulo: string; sub?: string; destaque?: boolean }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={10} fill={destaque ? 'rgba(255,138,36,0.12)' : '#0b1426'} stroke={destaque ? '#ff8a24' : 'rgba(255,255,255,0.12)'} />
      <text x={x + w / 2} y={y + (sub ? h / 2 - 4 : h / 2 + 4)} textAnchor="middle" fill="#fff" fontSize={13} fontWeight={700} fontFamily="Inter, sans-serif">
        {titulo}
      </text>
      {sub && (
        <text x={x + w / 2} y={y + h / 2 + 13} textAnchor="middle" fill="#607089" fontSize={10} fontFamily="JetBrains Mono, monospace">
          {sub}
        </text>
      )}
    </g>
  );
}

function Linha({ de, para }: { de: [number, number]; para: [number, number] }) {
  const meio = (de[1] + para[1]) / 2;
  return <path d={`M${de[0]},${de[1]} C${de[0]},${meio} ${para[0]},${meio} ${para[0]},${para[1]}`} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth={1.5} />;
}

export function Multiunidade({ onDemo }: { onDemo: () => void }) {
  // Coordenadas do desenho: 3 unidades, 2 depósitos cada.
  const unidades = ['Natal — Matriz', 'Recife', 'João Pessoa'];
  const larguraU = 150;
  const passoU = 190;
  const xU = (i: number) => 30 + i * passoU;
  return (
    <Secao id="empresas" eyebrow="Para empresas" titulo="Uma empresa. Várias unidades. Um só controle." descricao="Cada unidade tem os próprios depósitos e o próprio saldo. A matriz vê tudo; cada operador vê o que é dele." className="bg-[var(--navy-2)]/40">
      <div className="mt-12 grid items-center gap-10 lg:grid-cols-[3fr_2fr]">
        {/* min-w-0: sem isso o SVG de 520px estica a coluna (e a página) no celular, em vez de rolar por dentro. */}
        <Revelar className="min-w-0">
          <div className="overflow-x-auto rounded-2xl border border-[var(--linha)] bg-[var(--navy)] p-4">
            <svg viewBox="0 0 630 300" className="h-auto w-full min-w-[520px]" role="img" aria-labelledby="diagrama-titulo">
              <title id="diagrama-titulo">Empresa com três unidades, cada uma com um almoxarifado e um armário de EPI, todos alimentando um estoque só.</title>
              <Caixa x={215} y={12} w={200} h={46} titulo="Construtora Horizonte" sub="EMPRESA" destaque />
              {unidades.map((u, i) => (
                <g key={u}>
                  <Linha de={[315, 58]} para={[xU(i) + larguraU / 2, 108]} />
                  <Caixa x={xU(i)} y={108} w={larguraU} h={46} titulo={u} sub="UNIDADE" />
                  <Linha de={[xU(i) + larguraU / 2, 154]} para={[xU(i) + 36, 204]} />
                  <Linha de={[xU(i) + larguraU / 2, 154]} para={[xU(i) + larguraU - 36, 204]} />
                  <Caixa x={xU(i)} y={204} w={70} h={40} titulo="Almox." />
                  <Caixa x={xU(i) + larguraU - 70} y={204} w={70} h={40} titulo="EPI" />
                  <Linha de={[xU(i) + 36, 244]} para={[xU(i) + larguraU / 2, 276]} />
                  <Linha de={[xU(i) + larguraU - 36, 244]} para={[xU(i) + larguraU / 2, 276]} />
                  <text x={xU(i) + larguraU / 2} y={292} textAnchor="middle" fill="#ff8a24" fontSize={10} fontFamily="JetBrains Mono, monospace" fontWeight={600}>
                    ESTOQUE
                  </text>
                </g>
              ))}
            </svg>
          </div>
        </Revelar>
        <Revelar delay={0.1} className="min-w-0">
          <ul className="space-y-5">
            {[
              { icone: <Layers size={18} />, titulo: 'Escala sem virar bagunça', texto: 'Abrir uma unidade nova é um formulário. Ela já nasce com os dois depósitos e o catálogo escolhido.' },
              { icone: <Users size={18} />, titulo: 'Acesso por depósito', texto: 'Quem opera a Obra de Recife não vê a Central de Natal. O administrador atribui, o sistema cumpre.' },
              { icone: <Network size={18} />, titulo: 'Mínimo da empresa inteira', texto: 'Faltar em um depósito e sobrar no outro não é compra — é remessa. O alerta sabe a diferença.' },
            ].map((b) => (
              <li key={b.titulo} className="flex gap-4">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--laranja)]/12 text-[var(--laranja)]">{b.icone}</span>
                <div>
                  <p className="font-bold text-white">{b.titulo}</p>
                  <p className="mt-1 text-sm leading-relaxed text-slate-400">{b.texto}</p>
                </div>
              </li>
            ))}
          </ul>
          <Botao variante="secundario" className="mt-8" onClick={onDemo}>
            Ver com a minha operação <ArrowRight size={16} />
          </Botao>
        </Revelar>
      </div>
    </Secao>
  );
}

/* ------------------------------------------------------------------------- */
/*  Evolução — começa pelo estoque                                            */
/* ------------------------------------------------------------------------- */

const ETAPAS = [
  { icone: <Boxes size={18} />, titulo: 'Estoque', texto: 'Unidades, depósitos em cinco modos, movimentações, alertas e relatórios.', estado: 'Disponível' },
  { icone: <MessageCircle size={18} />, titulo: 'WhatsApp', texto: 'A equipe opera pelo celular; avisos de manhã e resumo da semana.', estado: 'Disponível' },
  { icone: <ShoppingCart size={18} />, titulo: 'Compras', texto: 'Cotação a fornecedores, comparação e pedido com a nota fiscal pedida.', estado: 'Disponível' },
  { icone: <Workflow size={18} />, titulo: 'Automações', texto: 'Remessa sugerida quando um depósito baixa e o outro sobra; cotação automática do que faltou.', estado: 'Próximo' },
  { icone: <Bot size={18} />, titulo: 'Inteligência operacional', texto: 'Previsão de consumo por obra e por época do ano.', estado: 'Planejado' },
];

export function Evolucao() {
  return (
    <Secao id="evolucao" eyebrow="Evolução" titulo="Comece pelo estoque. Cresça com o Stok Aí." descricao="Três partes no ar; as próximas nascem dos mesmos dados. Quem assina o Empresarial recebe cada uma primeiro.">
      <ol className="mt-12 grid gap-4 md:grid-cols-5">
        {ETAPAS.map((e, i) => {
          const ativa = e.estado === 'Disponível';
          return (
            <Revelar as="li" key={e.titulo} delay={i * 0.06} className="relative">
              <div className={`h-full rounded-2xl border p-5 ${ativa ? 'border-[var(--laranja)]/60 bg-[var(--laranja)]/[0.07]' : 'border-[var(--linha)] bg-[var(--navy-2)]'}`}>
                <div className="flex items-center justify-between">
                  <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${ativa ? 'bg-[var(--laranja)] text-[#1a0c00]' : 'bg-white/[0.04] text-slate-400'}`}>{e.icone}</span>
                  <span className={`font-mono text-[10px] uppercase tracking-wider ${ativa ? 'text-[var(--laranja)]' : 'text-slate-500'}`}>{e.estado}</span>
                </div>
                <p className="mt-4 font-bold text-white">{e.titulo}</p>
                <p className="mt-1 text-sm leading-relaxed text-slate-400">{e.texto}</p>
              </div>
            </Revelar>
          );
        })}
      </ol>
    </Secao>
  );
}

/* ------------------------------------------------------------------------- */
/*  CTA final                                                                 */
/* ------------------------------------------------------------------------- */

export function CtaFinal({ onDemo }: { onDemo: () => void }) {
  return (
    <section aria-labelledby="cta-titulo" className="py-20 sm:py-28">
      <Container>
        <Revelar>
          <div className="relative overflow-hidden rounded-3xl border border-[var(--laranja)]/30 bg-gradient-to-br from-[var(--navy-2)] to-[#160f0a] px-6 py-14 text-center sm:px-12 sm:py-20">
            <div className="grade absolute inset-0 opacity-50 [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]" aria-hidden />
            <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-[var(--laranja)]/20 blur-3xl" aria-hidden />
            <div className="relative">
              <Eyebrow>
                <span className="inline-flex items-center gap-1.5">
                  <Sparkles size={12} /> Pronto para começar
                </span>
              </Eyebrow>
              <h2 id="cta-titulo" className="mx-auto mt-4 max-w-2xl text-3xl font-extrabold leading-[1.08] tracking-tight text-white sm:text-5xl">
                Pare de procurar.
                <br />
                Comece a controlar.
              </h2>
              <p className="mx-auto mt-5 max-w-lg text-slate-400">Crie a conta da sua empresa em minutos — ou peça uma demonstração e a gente mostra com a sua operação.</p>
              <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                <BotaoLink href={ROTAS.criarConta} tamanho="lg" onClick={() => track('home_hero_cta', { cta: 'comecar-final' })}>
                  Começar agora <ArrowRight size={18} />
                </BotaoLink>
                <Botao variante="secundario" tamanho="lg" onClick={onDemo}>
                  Solicitar demonstração
                </Botao>
              </div>
            </div>
          </div>
        </Revelar>
      </Container>
    </section>
  );
}
