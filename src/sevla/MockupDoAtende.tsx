import { Check, CheckCheck, Sparkles } from 'lucide-react';
import { ATENDE } from '@/atende/shared/produto';

/**
 * A Central do Atende Aí desenhada em código — a mesma linguagem do
 * DashboardMockup do Stok Aí. Não é um print: é a interface real
 * (lista, conversa, triagem da IA) reduzida ao essencial e sem dados de
 * gente de verdade. Empilha no celular; três colunas a partir de `md`.
 */
const ROXO = ATENDE.cor;

const CONVERSAS = [
  { nome: 'Cliente novo', previa: 'Quero saber se tem apartamento de 2 quartos…', estado: 'Em atendimento', cor: 'bg-emerald-500/15 text-emerald-300', ativa: true },
  { nome: 'Loja Centro', previa: 'O boleto veio com o valor errado', estado: 'Na fila', cor: 'bg-amber-500/15 text-amber-300', ativa: false },
  { nome: 'Fornecedor', previa: 'Segue a proposta em PDF', estado: 'Aguardando', cor: 'bg-slate-500/20 text-slate-300', ativa: false },
];

export function MockupDoAtende() {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0b1020] text-slate-200 shadow-[0_30px_80px_-30px_rgba(124,58,237,0.6)]" role="img" aria-label="A Central do Atende Aí: conversas à esquerda, a conversa aberta no meio e a triagem da IA à direita.">
      {/* Barra superior */}
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2.5">
        <img src={ATENDE.simbolo} alt="" className="h-5 w-5 rounded object-contain" aria-hidden />
        <span className="text-xs font-bold tracking-tight text-white">{ATENDE.nome}</span>
        <span className="ml-auto inline-flex items-center gap-1.5 text-[10px] text-slate-400">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> WhatsApp conectado
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,5fr)_minmax(0,8fr)_minmax(0,5fr)]">
        {/* Coluna 1: conversas */}
        <div className="hidden border-r border-white/10 md:block">
          <div className="flex gap-1 px-3 pt-3">
            {['Abertas', 'Minhas', 'Fila'].map((a, i) => (
              <span key={a} className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${i === 0 ? 'text-white' : 'bg-white/[0.06] text-slate-400'}`} style={i === 0 ? { background: ROXO } : undefined}>
                {a}
              </span>
            ))}
          </div>
          <ul className="mt-2">
            {CONVERSAS.map((c) => (
              <li key={c.nome} className={`border-b border-white/5 px-3 py-2.5 ${c.ativa ? 'bg-white/[0.04]' : ''}`}>
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ background: `${ROXO}55` }}>
                    {c.nome[0]}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[11px] font-bold text-white">{c.nome}</span>
                    <span className="block truncate text-[10px] text-slate-400">{c.previa}</span>
                  </span>
                </div>
                <span className={`mt-1.5 inline-block rounded-full px-2 py-0.5 text-[9px] font-bold ${c.cor}`}>{c.estado}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Coluna 2: a conversa */}
        <div className="flex min-w-0 flex-col">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-2">
            <span>
              <span className="block text-xs font-bold text-white">Cliente novo</span>
              <span className="block text-[10px] text-slate-400">Em atendimento · com você</span>
            </span>
            <span className="rounded-full border border-white/15 px-2.5 py-1 text-[10px] font-semibold text-slate-300">Transferir</span>
          </div>
          <div className="space-y-2 px-4 py-4 text-[11px] leading-snug">
            <Balao lado="cliente">Oi! Vocês têm apartamento de 2 quartos para alugar em Nova Cruz?</Balao>
            <p className="px-2 text-center text-[9px] text-slate-500">Triagem da IA: Aluguel de apartamento → Vendas · prioridade alta</p>
            <Balao lado="ia">Olá! Recebemos sua mensagem — alguém do time de Vendas já vai te atender.</Balao>
            <Balao lado="equipe">Temos sim! Prefere no centro ou perto da BR?</Balao>
            <Balao lado="cliente">Centro, se possível ainda esta semana.</Balao>
          </div>
          <div className="mt-auto flex items-center gap-2 border-t border-white/10 px-3 py-2">
            <span className="h-8 flex-1 rounded-lg border border-white/10 bg-white/[0.03] px-3 text-[10px] leading-8 text-slate-500">Escreva a resposta…</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg text-white" style={{ background: ROXO }}>
              <Check size={14} />
            </span>
          </div>
        </div>

        {/* Coluna 3: a triagem */}
        <div className="border-t border-white/10 p-3 md:border-l md:border-t-0">
          <div className="rounded-xl border p-3" style={{ borderColor: `${ROXO}55`, background: `${ROXO}12` }}>
            <p className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider" style={{ color: '#c4b5fd' }}>
              <Sparkles size={10} /> Triagem da IA
            </p>
            <dl className="mt-2 space-y-1 text-[10px]">
              {[
                ['Intenção', 'Quer alugar'],
                ['Setor', 'Vendas (92%)'],
                ['Prioridade', 'alta'],
                ['Lead', 'quente'],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-2">
                  <dt className="text-slate-400">{k}</dt>
                  <dd className="font-semibold text-white">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-2 rounded-lg bg-black/25 p-2 text-[10px] text-slate-200">Cliente quer alugar apartamento de 2 quartos em Nova Cruz, centro, esta semana.</p>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-center">
            {[
              ['3', 'na fila'],
              ['2 min', '1ª resposta'],
            ].map(([n, r]) => (
              <div key={r} className="rounded-xl border border-white/10 bg-white/[0.03] p-2.5">
                <span className="block text-base font-extrabold text-white">{n}</span>
                <span className="block text-[9px] text-slate-400">{r}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Balao({ lado, children }: { lado: 'cliente' | 'equipe' | 'ia'; children: string }) {
  const nossa = lado !== 'cliente';
  return (
    <div className={`flex ${nossa ? 'justify-end' : 'justify-start'}`}>
      <div className={`w-fit max-w-[85%] rounded-2xl px-3 py-2 shadow-sm ${nossa ? 'rounded-br-md text-white' : 'rounded-bl-md bg-white/[0.06] text-slate-100'}`} style={nossa ? { background: lado === 'ia' ? `${ROXO}aa` : ROXO } : undefined}>
        {lado === 'ia' && <span className="mb-0.5 block text-[9px] font-bold text-white/80">IA</span>}
        <p className="wrap-anywhere">{children}</p>
        <span className="mt-1 flex items-center justify-end gap-1 text-[9px] text-white/70">
          09:4{lado === 'cliente' ? '1' : '2'} {nossa && <CheckCheck size={10} />}
        </span>
      </div>
    </div>
  );
}
