import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowRight, Boxes, Building2, ArrowLeftRight, Warehouse, HardHat, Bell } from 'lucide-react';
import { MarcaProduto } from '@/shared/ui/Logo';
import { track } from '@/lib/analytics';

/**
 * O produto de verdade, em miniatura: as mesmas telas, os mesmos números que
 * alguém veria por dentro. Não é ilustração — é para a pessoa reconhecer o
 * painel quando entrar. As abas trocam o conteúdo sem sair da Home.
 */

type Aba = 'estoque' | 'movimentacoes' | 'unidades';

const ABAS: { id: Aba; rotulo: string; icone: React.ReactNode }[] = [
  { id: 'estoque', rotulo: 'Estoque', icone: <Boxes size={14} /> },
  { id: 'movimentacoes', rotulo: 'Movimentações', icone: <ArrowLeftRight size={14} /> },
  { id: 'unidades', rotulo: 'Unidades', icone: <Building2 size={14} /> },
];

const MATERIAIS = [
  { nome: 'Cimento CP-II 50 kg', un: 'sc', central: 148, obra: 36, min: 60, status: 'ok' },
  { nome: 'Vergalhão CA-50 10 mm', un: 'br', central: 12, obra: 40, min: 50, status: 'ok' },
  { nome: 'Tijolo cerâmico 9 furos', un: 'un', central: 0, obra: 1.2e3, min: 500, status: 'remessa' },
  { nome: 'Areia média', un: 'm³', central: 4, obra: 0, min: 6, status: 'baixo' },
  { nome: 'Fio flexível 2,5 mm²', un: 'rolo', central: 0, obra: 0, min: 4, status: 'ruptura' },
];

const STATUS: Record<string, { rotulo: string; cls: string }> = {
  ok: { rotulo: 'OK', cls: 'bg-emerald-500/15 text-emerald-300' },
  remessa: { rotulo: 'Tem na Obra', cls: 'bg-sky-500/15 text-sky-300' },
  baixo: { rotulo: 'Abaixo do mínimo', cls: 'bg-amber-500/15 text-amber-300' },
  ruptura: { rotulo: 'Sem estoque', cls: 'bg-rose-500/15 text-rose-300' },
};

const MOVIMENTOS = [
  { tipo: 'Remessa', material: 'Tijolo cerâmico 9 furos', qtd: '+400 un', de: 'Central', para: 'Obra', quem: 'Carlos M.', quando: 'hoje, 09:12' },
  { tipo: 'Consumo', material: 'Cimento CP-II 50 kg', qtd: '−18 sc', de: 'Obra', para: 'Bloco B, 3º pav.', quem: 'Renata S.', quando: 'hoje, 08:40' },
  { tipo: 'Entrada', material: 'Vergalhão CA-50 10 mm', qtd: '+120 br', de: 'Fornecedor', para: 'Central', quem: 'Carlos M.', quando: 'ontem, 16:05' },
  { tipo: 'Devolução', material: 'Fio flexível 2,5 mm²', qtd: '+2 rolo', de: 'Obra', para: 'Central', quem: 'Renata S.', quando: 'ontem, 11:22' },
];

const UNIDADES = [
  { nome: 'Natal — Matriz', itens: 317, alertas: 2, central: '1.8k', obra: '640' },
  { nome: 'Recife', itens: 212, alertas: 0, central: '960', obra: '410' },
  { nome: 'João Pessoa', itens: 140, alertas: 1, central: '520', obra: '95' },
];

function Kpi({ rotulo, valor, detalhe, alerta }: { rotulo: string; valor: string; detalhe: string; alerta?: boolean }) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-wider text-slate-500">{rotulo}</p>
      <p className={`mt-0.5 text-lg font-bold leading-none ${alerta ? 'text-amber-300' : 'text-white'}`}>{valor}</p>
      <p className="mt-1 text-[10px] text-slate-500">{detalhe}</p>
    </div>
  );
}

function AbaEstoque() {
  return (
    <div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Kpi rotulo="Materiais" valor="317" detalhe="no catálogo" />
        <Kpi rotulo="Saldo total" valor="2.4k" detalhe="itens nos 2 depósitos" />
        <Kpi rotulo="Abaixo do mínimo" valor="2" detalhe="precisam de compra" alerta />
        <Kpi rotulo="Movimentações" valor="48" detalhe="nos últimos 7 dias" />
      </div>
      <div className="mt-3 overflow-hidden rounded-lg border border-white/[0.06]">
        <table className="w-full text-left text-[11px]">
          <thead className="bg-white/[0.03] text-[10px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">Material</th>
              <th className="px-2 py-2 text-right font-medium">Central</th>
              <th className="px-2 py-2 text-right font-medium">Obra</th>
              <th className="hidden px-2 py-2 text-right font-medium sm:table-cell">Mín.</th>
              <th className="px-3 py-2 text-right font-medium">Situação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.05]">
            {MATERIAIS.map((m) => (
              <tr key={m.nome} className="text-slate-300">
                <td className="px-3 py-2 font-medium text-white">
                  {m.nome} <span className="text-slate-500">· {m.un}</span>
                </td>
                <td className="px-2 py-2 text-right tabular-nums">{m.central.toLocaleString('pt-BR')}</td>
                <td className="px-2 py-2 text-right tabular-nums">{m.obra.toLocaleString('pt-BR')}</td>
                <td className="hidden px-2 py-2 text-right tabular-nums text-slate-500 sm:table-cell">{m.min}</td>
                <td className="px-3 py-2 text-right">
                  <span className={`inline-block rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${STATUS[m.status].cls}`}>{STATUS[m.status].rotulo}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AbaMovimentacoes() {
  return (
    <ul className="space-y-2">
      {MOVIMENTOS.map((mv) => (
        <li key={mv.material + mv.quando} className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 text-[11px]">
          <span className="w-16 shrink-0 rounded-md bg-[var(--laranja)]/15 px-1.5 py-0.5 text-center text-[10px] font-semibold text-[var(--laranja)]">{mv.tipo}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-white">{mv.material}</p>
            <p className="flex items-center gap-1 truncate text-slate-500">
              {mv.de} <ArrowRight size={10} /> {mv.para} <span className="text-slate-600">·</span> {mv.quem}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="font-semibold tabular-nums text-white">{mv.qtd}</p>
            <p className="text-[10px] text-slate-500">{mv.quando}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

function AbaUnidades() {
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {UNIDADES.map((u) => (
        <div key={u.nome} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 text-[11px]">
          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold text-white">{u.nome}</p>
            {u.alertas > 0 && (
              <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300">
                <Bell size={10} /> {u.alertas}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-slate-500">{u.itens} materiais</p>
          <div className="mt-3 space-y-1.5">
            <div className="flex items-center justify-between rounded-md bg-white/[0.03] px-2 py-1.5">
              <span className="flex items-center gap-1.5 text-slate-300">
                <Warehouse size={12} className="text-slate-500" /> Central
              </span>
              <span className="font-semibold tabular-nums text-white">{u.central}</span>
            </div>
            <div className="flex items-center justify-between rounded-md bg-white/[0.03] px-2 py-1.5">
              <span className="flex items-center gap-1.5 text-slate-300">
                <HardHat size={12} className="text-slate-500" /> Obra
              </span>
              <span className="font-semibold tabular-nums text-white">{u.obra}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

const CONTEUDO: Record<Aba, () => React.ReactElement> = {
  estoque: AbaEstoque,
  movimentacoes: AbaMovimentacoes,
  unidades: AbaUnidades,
};

export function DashboardMockup({ className = '' }: { className?: string }) {
  const [aba, setAba] = useState<Aba>('estoque');
  const reduzido = useReducedMotion();
  const Conteudo = CONTEUDO[aba];

  function trocar(nova: Aba) {
    if (nova === aba) return;
    setAba(nova);
    track('home_mockup_tab', { aba: nova });
  }

  return (
    <div
      className={`overflow-hidden rounded-2xl border border-white/10 bg-[#0d1628] shadow-[0_40px_80px_-30px_rgba(0,0,0,0.8),0_0_0_1px_rgba(255,138,36,0.08)] ${className}`}
      aria-label="Prévia do painel do Stok Aí"
    >
      {/* barra superior da "janela" */}
      <div className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-2.5">
        <div className="flex items-center gap-2">
          <MarcaProduto size={18} />
          <span className="text-[11px] font-semibold text-white">
            Construtora Horizonte <span className="font-normal text-slate-500">· Natal — Matriz</span>
          </span>
        </div>
        <div className="ml-auto flex gap-1.5">
          <span className="h-2 w-2 rounded-full bg-white/10" />
          <span className="h-2 w-2 rounded-full bg-white/10" />
          <span className="h-2 w-2 rounded-full bg-white/10" />
        </div>
      </div>

      {/* abas */}
      <div role="tablist" aria-label="Telas do painel" className="flex gap-1 border-b border-white/[0.06] px-3 pt-2">
        {ABAS.map((a) => {
          const ativa = a.id === aba;
          return (
            <button
              key={a.id}
              role="tab"
              id={`mockup-aba-${a.id}`}
              aria-selected={ativa}
              aria-controls="mockup-painel"
              onClick={() => trocar(a.id)}
              className={`relative flex items-center gap-1.5 rounded-t-md px-3 py-2 text-[11px] font-medium transition-colors ${
                ativa ? 'text-white' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {a.icone}
              {a.rotulo}
              {ativa && (
                <motion.span
                  layoutId={reduzido ? undefined : 'mockup-aba-ativa'}
                  className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-[var(--laranja)]"
                />
              )}
            </button>
          );
        })}
      </div>

      <div id="mockup-painel" role="tabpanel" aria-labelledby={`mockup-aba-${aba}`} className="p-3 sm:p-4">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={aba}
            initial={reduzido ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduzido ? undefined : { opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
          >
            <Conteudo />
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
