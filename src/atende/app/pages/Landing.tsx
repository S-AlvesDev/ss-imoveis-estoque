import { useState, type ReactNode } from 'react';
import { ArrowRight, BarChart3, Bell, Bot, Building2, CheckCircle2, ChevronDown, Eye, GraduationCap, HeartPulse, Home as Casa, MessageSquare, Scale, ShieldCheck, Smartphone, Sparkles, Star, Store, Timer, Users, Wrench } from 'lucide-react';
import { MockupDoAtende } from '@/sevla/MockupDoAtende';
import { Jatoba } from '@/features/jatoba/Jatoba';
import { caminhoDe, TELAS } from '../router';
import { ATENDE } from '../../shared/produto';
import { AVALIACAO_DIAS_ATENDE } from '../../shared/planos';
import { Botao, Container, Eyebrow, FooterDaVitrine, HeaderDaVitrine, Revelar } from './vitrine/Vitrine';
import { SecaoPlanos } from './vitrine/SecaoPlanos';

/**
 * A landing pública do Atende Aí (/atende): problema → solução → prova →
 * produto → ação, no mesmo desenho da Home do Stok Aí. Tudo que está
 * escrito aqui existe no produto; nada de números inventados nem
 * depoimentos. O Jatobá tira dúvidas no canto, sem balão de WhatsApp.
 */

/* ------------------------------------------------------------------------- */
/*  Primitivos desta página (a Secao e o Cartao da Home do Stok, em roxo)     */
/* ------------------------------------------------------------------------- */

function Secao({ id, eyebrow, titulo, descricao, className = '', children }: { id: string; eyebrow: string; titulo: ReactNode; descricao?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-titulo`} className={`py-20 sm:py-28 ${className}`}>
      <Container>
        <Revelar className="max-w-2xl">
          <Eyebrow>{eyebrow}</Eyebrow>
          <h2 id={`${id}-titulo`} className="mt-3 text-3xl font-extrabold leading-[1.1] tracking-tight text-white sm:text-4xl">
            {titulo}
          </h2>
          {descricao && <p className="mt-4 text-base leading-relaxed text-[#a5abcf] sm:text-lg">{descricao}</p>}
        </Revelar>
        {children}
      </Container>
    </section>
  );
}

function Cartao({ className = '', children }: { className?: string; children: ReactNode }) {
  return <div className={`group rounded-2xl border border-white/10 bg-white/[0.03] p-6 transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-[var(--brand)]/50 hover:shadow-[0_18px_40px_-20px_rgba(124,58,237,0.45)] ${className}`}>{children}</div>;
}

function Icone({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--brand)]/20 text-[var(--lilas)] ${className}`}>{children}</span>;
}

/* ------------------------------------------------------------------------- */
/*  Prova rápida — quatro valores antes de qualquer lista                     */
/* ------------------------------------------------------------------------- */

const PROVAS = [
  { icone: <Smartphone size={20} />, titulo: 'Um número, toda a equipe', texto: 'O WhatsApp da empresa, conectado por QR. Quantas pessoas precisar atendendo no mesmo número, cada uma na sua fila.' },
  { icone: <Bot size={20} />, titulo: 'A IA tria, gente atende', texto: 'Lê a mensagem, encaminha para o setor certo com prioridade e resumo. Nunca vende nem negocia.' },
  { icone: <Timer size={20} />, titulo: 'Ninguém fica sem resposta', texto: 'Cliente esperando demais? Aviso para quem atende e supervisiona; passou do limite, vai para a fila geral.' },
  { icone: <Star size={20} />, titulo: 'Resultado em números', texto: 'Tempo de resposta, conversão de leads e a nota de 0 a 10 que o próprio cliente dá ao atendimento.' },
];

function Prova() {
  return (
    <section aria-label="O que o Atende Aí entrega" className="border-y border-white/10 bg-white/[0.02]">
      <Container>
        <ul className="grid gap-px sm:grid-cols-2 lg:grid-cols-4">
          {PROVAS.map((p, i) => (
            <Revelar key={p.titulo} delay={i * 0.06} className="flex gap-4 px-2 py-8 sm:px-5">
              <Icone className="mt-0.5 h-9 w-9">{p.icone}</Icone>
              <div>
                <p className="font-bold text-white">{p.titulo}</p>
                <p className="mt-1 text-sm leading-relaxed text-[#a5abcf]">{p.texto}</p>
              </div>
            </Revelar>
          ))}
        </ul>
      </Container>
    </section>
  );
}

/* ------------------------------------------------------------------------- */
/*  Sintomas — a dor, e como o Atende Aí resolve cada uma                     */
/* ------------------------------------------------------------------------- */

const SINTOMAS = [
  {
    icone: <MessageSquare size={22} />,
    dor: 'Nosso WhatsApp recebe muitas mensagens por dia e está difícil organizar e atender bem.',
    solucao: 'Cada mensagem vira uma conversa na central, com setor, prioridade e dono. Abas de abertas, minhas, fila, aguardando e encerradas; etiquetas e busca por nome ou telefone. Mesmo com centenas de conversas, tudo tem lugar.',
  },
  {
    icone: <Users size={22} />,
    dor: 'Quando alguém sai de férias, adoece ou está fora do horário, o cliente fica sem resposta.',
    solucao: 'A conversa é do setor, não da pessoa: qualquer membro do time pega da fila, e o supervisor transfere com um clique. Fora do horário, a IA responde com a mensagem da empresa. E o SLA avisa antes de virar problema.',
  },
  {
    icone: <ShieldCheck size={22} />,
    dor: 'Vários funcionários têm acesso ao WhatsApp e veem todas as conversas, até as que não são da alçada deles.',
    solucao: 'Três papéis: administrador, supervisor e atendente. O atendente vê as conversas dele e a fila dos seus setores; o supervisor acompanha os times dele; o administrador vê tudo. Notas internas ficam só entre a equipe.',
  },
  {
    icone: <BarChart3 size={22} />,
    dor: 'Tenho poucas informações sobre a qualidade do atendimento da minha equipe.',
    solucao: 'Quantas conversas cada pessoa atende, quanto tempo o cliente espera pela primeira resposta, quantos leads viram venda, por setor e por pessoa. E a nota de 0 a 10 que o cliente dá ao encerrar — com os atendimentos mais bem avaliados.',
  },
  {
    icone: <Building2 size={22} />,
    dor: 'Quando um vendedor é desligado, ele leva os clientes junto — as conversas ficam no WhatsApp dele.',
    solucao: 'As conversas ficam no número da empresa, com o histórico completo de cada cliente. Sai um vendedor, você transfere as conversas dele para outro em minutos; o cliente nem percebe.',
  },
  {
    icone: <Sparkles size={22} />,
    dor: 'Perco venda porque o lead esfria: a equipe respondeu, o cliente sumiu e ninguém lembrou de voltar.',
    solucao: 'Cada conversa é um lead no funil. Quando o cliente fica um dia em silêncio, a IA sugere a mensagem de retomada com o contexto da conversa — uma pessoa aprova antes de enviar. Nada sai sozinho.',
  },
];

function Sintomas() {
  return (
    <Secao id="sintomas" eyebrow="Reconhece algum destes?" titulo="Sinais de que o atendimento da sua empresa poderia estar melhor." descricao="Cada um tem uma resposta concreta no Atende Aí — não uma promessa.">
      <ul className="mt-12 grid gap-4 lg:grid-cols-2">
        {SINTOMAS.map((s, i) => (
          <Revelar key={s.dor} delay={(i % 2) * 0.06}>
            <Cartao className="flex h-full gap-5">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-white/[0.06] bg-white/[0.03] text-slate-300 transition-colors group-hover:border-[var(--brand)]/40 group-hover:text-[var(--lilas)]">{s.icone}</span>
              <div className="min-w-0">
                <p className="text-lg font-bold leading-snug text-white">“{s.dor}”</p>
                <p className="mt-3 flex gap-2 text-sm leading-relaxed text-[#a5abcf]">
                  <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-[var(--lilas)]" />
                  <span>{s.solucao}</span>
                </p>
              </div>
            </Cartao>
          </Revelar>
        ))}
      </ul>
    </Secao>
  );
}

/* ------------------------------------------------------------------------- */
/*  O que faz — só o que existe                                               */
/* ------------------------------------------------------------------------- */

const RECURSOS = [
  { icone: <Smartphone size={20} />, titulo: 'O WhatsApp da sua empresa', texto: 'Conecte o número lendo um QR, como no WhatsApp Web. Não precisa trocar de número nem pedir API. O que a equipe manda pelo celular também aparece na central.', micro: 'Conecte em minutos' },
  { icone: <Bot size={20} />, titulo: 'Triagem por IA', texto: 'Lê a primeira mensagem, identifica assunto, intenção e setor, define prioridade e resume para quem vai atender. Dá a primeira resposta com as informações da empresa — e pede esclarecimento quando não entende.', micro: 'Encaminha certo' },
  { icone: <MessageSquare size={20} />, titulo: 'Central completa', texto: 'Texto, imagem, vídeo, áudio gravado, documento, localização e contato. Citação, notas internas que o cliente não vê, etiquetas, ficha e histórico de cada cliente. Um contato, um fio de conversa.', micro: 'Atenda com contexto' },
  { icone: <Users size={20} />, titulo: 'Times e papéis', texto: 'Setores com fila própria e palavras-chave para a triagem. Administrador, supervisor e atendente — cada um vê e faz o que o papel permite.', micro: 'Cada um no seu lugar' },
  { icone: <Eye size={20} />, titulo: 'Supervisão em tempo real', texto: 'Quem está online, quem espera resposta há quanto tempo, a fila de cada setor. O supervisor orienta por nota interna, assume, transfere e corrige a triagem da IA.', micro: 'Veja a operação inteira' },
  { icone: <Timer size={20} />, titulo: 'SLA com escalonamento', texto: 'Você define os minutos. Cliente esperando: aviso para quem atende e supervisiona. Passou do limite: a conversa vai para a fila geral com prioridade alta, para quem estiver livre.', micro: 'Ninguém esquecido' },
  { icone: <Sparkles size={20} />, titulo: 'Leads e follow-up', texto: 'Funil com novo, em atendimento, em negociação, aguardando cliente, convertido e perdido, com valor. Cliente sumiu por 24 h? A IA sugere a retomada; uma pessoa aprova e envia.', micro: 'Não deixe esfriar' },
  { icone: <Star size={20} />, titulo: 'Avaliação de 0 a 10', texto: 'Ao encerrar, a IA escreve a despedida e pergunta a nota. O cliente responde pelo WhatsApp e a nota entra sozinha: média, NPS, por pessoa e os atendimentos mais bem avaliados.', micro: 'Saiba como foi' },
  { icone: <BarChart3 size={20} />, titulo: 'Dashboard e resumo semanal', texto: 'Conversas, tempo de primeira resposta e de resolução, mensagens do cliente, da equipe e da IA, leads e conversão — por pessoa e por setor, contado no banco. Toda segunda, um resumo por e-mail.', micro: 'Leve para a reunião' },
];

function Recursos() {
  return (
    <Secao id="o-que-faz" eyebrow="O que faz" titulo="A IA entende. O atendente resolve. O supervisor acompanha." descricao="Nove partes que conversam entre si. Você começa conectando o WhatsApp e o resto acompanha." className="bg-white/[0.02]">
      <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {RECURSOS.map((r, i) => (
          <Revelar key={r.titulo} delay={(i % 3) * 0.06}>
            <Cartao className="h-full">
              <Icone>{r.icone}</Icone>
              <p className="mt-4 text-lg font-bold text-white">{r.titulo}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-[#a5abcf]">{r.texto}</p>
              <p className="mt-4 inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-slate-500 transition-colors group-hover:text-[var(--lilas)]">
                {r.micro} <ArrowRight size={12} />
              </p>
            </Cartao>
          </Revelar>
        ))}
      </ul>
      <Revelar delay={0.1} className="mt-6 flex flex-col items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-6 sm:flex-row sm:items-center">
        <Icone className="h-11 w-11">
          <Bell size={20} />
        </Icone>
        <p className="text-sm leading-relaxed text-[#a5abcf]">
          <span className="font-bold text-white">No celular também.</span> Instale como app e receba aviso quando um cliente responder, chegar conversa nova na sua fila ou um cliente ficar esperando — mesmo com o Atende fechado.
        </p>
      </Revelar>
    </Secao>
  );
}

/* ------------------------------------------------------------------------- */
/*  A conversa de verdade — do "oi" à nota                                    */
/* ------------------------------------------------------------------------- */

function Balao({ de, children, hora }: { de: 'cliente' | 'empresa' | 'ia'; children: ReactNode; hora: string }) {
  const nosso = de !== 'cliente';
  return (
    <div className={`flex ${nosso ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[88%] rounded-2xl px-3 py-2 text-[13px] leading-snug ${nosso ? 'rounded-tr-sm bg-[#1f3b2a] text-slate-100' : 'rounded-tl-sm bg-[#1f2937] text-slate-200'}`}>
        {de === 'ia' && <p className="mb-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-300/70">IA · triagem</p>}
        <div className="whitespace-pre-line">{children}</div>
        <p className={`mt-1 text-right text-[10px] ${nosso ? 'text-emerald-300/60' : 'text-slate-500'}`}>{hora}</p>
      </div>
    </div>
  );
}

function Conversa({ titulo, sub, children }: { titulo: string; sub: string; children: ReactNode }) {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0b141a] shadow-2xl">
      <div className="flex items-center gap-3 border-b border-white/10 bg-[#111b21] px-4 py-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--brand)] text-white">
          <MessageSquare size={16} />
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

const PONTOS = [
  { icone: <Bot size={18} />, titulo: 'A IA encaminha; não vende', texto: 'Ela identifica o assunto, responde com o que a empresa cadastrou e passa para o setor certo. Preço, prazo e negociação são da equipe.' },
  { icone: <Eye size={18} />, titulo: 'O supervisor vê e corrige', texto: 'Setor errado? Corrige com um clique, e a correção fica no histórico. Cliente esperando? O SLA avisa e escalona.' },
  { icone: <Star size={18} />, titulo: 'A nota vem do cliente', texto: 'Ao encerrar, a despedida sai com a pergunta de 0 a 10. A resposta entra sozinha, sem reabrir a conversa.' },
];

function ConversaDeVerdade() {
  return (
    <Secao id="conversa" eyebrow="Do “oi” à nota" titulo="Assim é uma conversa no Atende Aí." descricao="O cliente escreve para o número da empresa. A IA lê e encaminha; a pessoa certa responde com contexto; ao encerrar, o cliente avalia.">
      <div className="mt-12 grid gap-4 lg:grid-cols-2">
        <Revelar className="min-w-0">
          <Conversa titulo="Imobiliária Horizonte" sub="Mariana · setor Locação">
            <Balao de="cliente" hora="09:12">Bom dia! Vi o apto da Rua das Flores no site, ainda tá disponível pra alugar?</Balao>
            <Balao de="ia" hora="09:12">Bom dia! Sim, o apartamento da Rua das Flores está disponível para locação. Vou te passar para a equipe de Locação, que responde em instantes com valores e visita. 😊</Balao>
            <Balao de="empresa" hora="09:14">Oi! Aqui é a Mariana, da Locação. O aluguel é R$ 1.900 + condomínio de R$ 320. Consigo agendar uma visita amanhã às 10h ou às 15h — qual fica melhor?</Balao>
            <Balao de="cliente" hora="09:15">Às 15h fica ótimo!</Balao>
          </Conversa>
        </Revelar>
        <Revelar delay={0.08} className="min-w-0">
          <Conversa titulo="Imobiliária Horizonte" sub="encerrando · avaliação">
            <Balao de="empresa" hora="16:40">Visita confirmada amanhã às 15h. Te mando o endereço completo e o nome de quem vai te receber. 👍</Balao>
            <Balao de="ia" hora="16:41">Obrigado pelo contato, Ana! Visita marcada para amanhã às 15h; qualquer coisa, é só chamar por aqui.{'\n\n'}De 0 a 10, como você avalia este atendimento? Responda só com o número.</Balao>
            <Balao de="cliente" hora="16:52">10, super rápido!</Balao>
            <Balao de="ia" hora="16:52">Obrigado pela avaliação! 🙏</Balao>
          </Conversa>
        </Revelar>
      </div>
      <ul className="mt-10 grid gap-6 md:grid-cols-3">
        {PONTOS.map((p, i) => (
          <Revelar key={p.titulo} delay={i * 0.06} className="flex gap-4">
            <Icone className="mt-0.5 h-9 w-9">{p.icone}</Icone>
            <div>
              <p className="font-bold text-white">{p.titulo}</p>
              <p className="mt-1 text-sm leading-relaxed text-[#a5abcf]">{p.texto}</p>
            </div>
          </Revelar>
        ))}
      </ul>
      <Revelar className="mt-8 text-xs text-slate-500">Conversa ilustrativa. Nomes, valores e horários são exemplos; o que a IA diz vem só do que a empresa cadastrou.</Revelar>
    </Secao>
  );
}

/* ------------------------------------------------------------------------- */
/*  Como funciona                                                             */
/* ------------------------------------------------------------------------- */

const PASSOS = [
  ['1', 'Conecte o WhatsApp', 'Crie a conta da empresa, cadastre os setores e leia o QR com o celular da empresa. Sem implantação, sem trocar de número.'],
  ['2', 'A IA recebe e encaminha', 'Cada mensagem nova é lida, classificada e vai para a fila do setor certo — com prioridade, resumo e a primeira resposta já dada.'],
  ['3', 'A equipe atende, você acompanha', 'Atendentes respondem com contexto; supervisores acompanham em tempo real; o dashboard e as notas dos clientes mostram o resultado.'],
] as const;

function ComoFunciona() {
  return (
    <Secao id="como-funciona" eyebrow="Como funciona" titulo="Três passos para atender pelo sistema." className="bg-white/[0.02]">
      <ol className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-3">
        {PASSOS.map(([n, t, d], i) => (
          <Revelar key={n} delay={i * 0.08}>
            <li className="h-full rounded-2xl border border-white/10 bg-white/[0.03] p-6">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--brand)] font-mono text-sm font-bold text-white">{n}</span>
              <h3 className="mt-5 text-lg font-bold text-white">{t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[#a5abcf]">{d}</p>
            </li>
          </Revelar>
        ))}
      </ol>
    </Secao>
  );
}

/* ------------------------------------------------------------------------- */
/*  Para quem é — segmentos, com o que muda em cada um                        */
/* ------------------------------------------------------------------------- */

const SEGMENTOS = [
  { icone: <Casa size={20} />, nome: 'Imobiliárias', texto: 'Setores de Locação, Vendas e Administração; a IA manda cada interessado para o corretor certo e o funil mostra quem visitou, quem propôs, quem fechou.' },
  { icone: <HeartPulse size={20} />, nome: 'Clínicas e consultórios', texto: 'Recepção, agendamento e financeiro em filas separadas. Fora do horário, a IA responde com a mensagem da clínica; de manhã, a fila está organizada.' },
  { icone: <Store size={20} />, nome: 'Lojas e e-commerce', texto: 'Dúvida de produto, pedido e troca cada um no seu setor. O histórico do cliente fica no número da loja, não no celular do vendedor.' },
  { icone: <GraduationCap size={20} />, nome: 'Escolas e cursos', texto: 'Matrícula, secretaria e financeiro. Em época de matrícula, a triagem segura o volume e ninguém fica sem resposta — o SLA garante.' },
  { icone: <Scale size={20} />, nome: 'Contabilidade e advocacia', texto: 'Cada cliente no setor certo (fiscal, pessoal, societário), com notas internas entre a equipe e o histórico completo de cada conversa.' },
  { icone: <Wrench size={20} />, nome: 'Prestadores de serviço', texto: 'Orçamento, execução e pós-venda. O lead que esfriou recebe a retomada sugerida pela IA — depois que alguém da equipe aprovou.' },
];

function ParaQuem() {
  return (
    <Secao id="para-quem" eyebrow="Para quem é" titulo="Onde o atendimento acontece no WhatsApp, o Atende Aí cabe." descricao="Os setores, a triagem e o funil se adaptam ao que a sua empresa faz. Alguns exemplos:">
      <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SEGMENTOS.map((s, i) => (
          <Revelar key={s.nome} delay={(i % 3) * 0.06}>
            <Cartao className="h-full">
              <div className="flex items-center gap-3">
                <Icone>{s.icone}</Icone>
                <p className="text-lg font-bold text-white">{s.nome}</p>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-[#a5abcf]">{s.texto}</p>
            </Cartao>
          </Revelar>
        ))}
      </ul>
    </Secao>
  );
}

/* ------------------------------------------------------------------------- */
/*  Dúvidas frequentes — respostas reais                                      */
/* ------------------------------------------------------------------------- */

const DUVIDAS = [
  ['Preciso trocar o número de WhatsApp da empresa?', 'Não. Você conecta o número que já usa lendo um QR, como no WhatsApp Web. As conversas passam a chegar na central; o celular continua funcionando, e o que for enviado por ele aparece no sistema.'],
  ['Qual é a diferença para o WhatsApp Business?', 'No WhatsApp Business um número é um celular. No Atende Aí, o mesmo número é atendido por toda a equipe, cada um na sua fila, com triagem por IA, supervisão em tempo real, SLA, histórico por cliente, leads e métricas — coisas que o aplicativo sozinho não faz.'],
  ['A IA fala com o meu cliente? Ela vende?', 'Ela lê a primeira mensagem, responde com o que a empresa cadastrou (descrição, produtos, perguntas frequentes, horário) e encaminha para o setor certo. Não negocia, não promete preço nem prazo. A retomada de lead e a despedida com pedido de nota também passam por uma pessoa antes de sair.'],
  ['Preciso de uma equipe técnica ou de implantação?', `Não. A empresa cria a conta sozinha, cadastra os setores e a equipe, lê o QR e começa. Toda conta nova tem ${AVALIACAO_DIAS_ATENDE} dias grátis com tudo liberado; depois você escolhe o plano e paga com cartão, cancelando quando quiser.`],
  ['E se o cliente escrever de novo depois que a conversa foi encerrada?', 'A mesma conversa reabre, com todo o histórico — um contato, um fio. Se a mensagem for só a nota do atendimento (“10”), ela é registrada e a conversa continua encerrada.'],
  ['Já uso o Stok Aí. Preciso de outra conta?', 'Não. O Stok Aí e o Atende Aí são da mesma casa, a SEVLA INFINITY: você entra com o mesmo e-mail e senha e ativa o Atende para a sua empresa com um clique.'],
] as const;

function Duvidas() {
  const [aberta, setAberta] = useState<number | null>(0);
  return (
    <Secao id="duvidas" eyebrow="Dúvidas frequentes" titulo="O que perguntam antes de começar." className="bg-white/[0.02]">
      <ul className="mt-10 divide-y divide-white/10 rounded-2xl border border-white/10 bg-white/[0.02]">
        {DUVIDAS.map(([pergunta, resposta], i) => {
          const esta = aberta === i;
          return (
            <li key={pergunta}>
              <button type="button" onClick={() => setAberta(esta ? null : i)} aria-expanded={esta} className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left sm:px-6">
                <span className="text-base font-bold text-white">{pergunta}</span>
                <ChevronDown size={18} className={`shrink-0 text-[var(--lilas)] transition-transform ${esta ? 'rotate-180' : ''}`} />
              </button>
              {esta && <p className="px-5 pb-5 text-sm leading-relaxed text-[#a5abcf] sm:px-6">{resposta}</p>}
            </li>
          );
        })}
      </ul>
    </Secao>
  );
}

/* ------------------------------------------------------------------------- */
/*  A página                                                                   */
/* ------------------------------------------------------------------------- */

export function Landing() {
  return (
    <div className="fundo-navy min-h-dvh text-slate-200">
      <HeaderDaVitrine />
      <main>
        <section className="relative overflow-hidden pt-[calc(68px+4rem)] pb-16 sm:pt-[calc(68px+5.5rem)] sm:pb-24" aria-labelledby="hero-titulo">
          <div className="pointer-events-none absolute inset-0 opacity-[0.07]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.5) 1px, transparent 1px)', backgroundSize: '48px 48px' }} aria-hidden />
          <div className="pointer-events-none absolute inset-0" aria-hidden style={{ backgroundImage: 'radial-gradient(ellipse at 15% 20%, rgba(124,58,237,0.28), transparent 45%), radial-gradient(ellipse at 90% 70%, rgba(196,181,253,0.08), transparent 40%)' }} />
          <Container className="relative">
            <div className="mx-auto max-w-3xl text-center">
              <Revelar>
                <Eyebrow>Atende Aí · Atendimento pelo WhatsApp da sua empresa</Eyebrow>
              </Revelar>
              <Revelar delay={0.08}>
                <h1 id="hero-titulo" className="mt-5 text-[clamp(2.25rem,6vw,4.5rem)] font-extrabold leading-[1.02] tracking-tight text-white">
                  Nenhum cliente sem resposta
                  <br />
                  <span className="bg-gradient-to-r from-[#c4b5fd] to-[#7c3aed] bg-clip-text text-transparent">no WhatsApp da sua empresa.</span>
                </h1>
              </Revelar>
              <Revelar delay={0.16}>
                <p className="mx-auto mt-6 max-w-2xl text-[clamp(1.05rem,1.6vw,1.25rem)] leading-relaxed text-[#a5abcf]">Toda a equipe no mesmo número. A IA lê e encaminha cada mensagem, o supervisor acompanha em tempo real, o cliente dá a nota — e você vê o resultado em números, não em achismo.</p>
              </Revelar>
              <Revelar delay={0.24} className="mt-9 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
                <Botao href={caminhoDe(TELAS.criarConta)} alvo="hero-criar">
                  Começar grátis por {AVALIACAO_DIAS_ATENDE} dias <ArrowRight size={16} />
                </Botao>
                <Botao href={caminhoDe(TELAS.planos)} variante="contorno" alvo="hero-planos">
                  Ver planos
                </Botao>
              </Revelar>
              <Revelar delay={0.3}>
                <p className="mt-5 text-xs text-[#6f76a0]">Sem implantação · Sem trocar de número · Cancele quando quiser</p>
              </Revelar>
            </div>
            <Revelar delay={0.3} className="relative mx-auto mt-14 max-w-5xl sm:mt-20">
              <div className="absolute -inset-6 rounded-[2rem] bg-[var(--brand)]/15 blur-3xl" aria-hidden />
              <MockupDoAtende />
            </Revelar>
          </Container>
        </section>

        <Prova />
        <Sintomas />
        <Recursos />
        <ConversaDeVerdade />
        <ComoFunciona />
        <ParaQuem />
        <SecaoPlanos compacta />
        <Duvidas />

        <section className="py-16 sm:py-24">
          <Container>
            <Revelar>
              <div className="relative overflow-hidden rounded-[2rem] border border-[var(--brand)]/40 bg-[var(--brand)]/[0.1] px-6 py-14 text-center sm:px-12 sm:py-20">
                <h2 className="text-[clamp(1.75rem,4.2vw,3rem)] font-extrabold leading-[1.08] tracking-tight text-white">Comece a atender pelo sistema hoje.</h2>
                <p className="mx-auto mt-4 max-w-xl text-base text-[#a5abcf]">Crie a conta da empresa, conecte o WhatsApp e deixe a IA encaminhar. {AVALIACAO_DIAS_ATENDE} dias grátis com tudo liberado. Já tem conta? Entre.</p>
                <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
                  <Botao href={caminhoDe(TELAS.criarConta)} alvo="final-criar">
                    Criar a conta da empresa <ArrowRight size={16} />
                  </Botao>
                  <Botao href={caminhoDe(TELAS.entrar)} variante="contorno" alvo="final-entrar">
                    Entrar
                  </Botao>
                </div>
                <p className="mt-6 text-xs text-[#6f76a0]">
                  Já usa o Stok Aí? Entre com a mesma conta.{' '}
                  <a href="/cloud" className="text-[#a5abcf] underline-offset-4 hover:text-white hover:underline">
                    Conhecer a SEVLA INFINITY
                  </a>
                </p>
              </div>
            </Revelar>
          </Container>
        </section>
      </main>
      <FooterDaVitrine />
      {/* O Jatobá: tira dúvidas de quem está conhecendo o Atende Aí, sem sair da página. */}
      <Jatoba modo="home" produto="atende" />
    </div>
  );
}
