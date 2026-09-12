import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpFromLine,
  Boxes,
  ChevronRight,
  Flame,
  HardHat,
  PieChart as PieIcon,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  TrendingDown,
  TrendingUp,
  Trophy,
  Warehouse,
} from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, CardHeader } from '@/shared/ui/Card';
import { StatCard } from '@/shared/ui/StatCard';
import { Reveal, RevealItem } from '@/shared/ui/Reveal';
import { SegmentedControl } from '@/shared/ui/SegmentedControl';
import { MarcaProduto } from '@/shared/ui/Logo';
import type { Deposito, Material, MaterialMovement, Unidade } from '@/shared/types';
import { formatNumber, needsPurchase, stockStatus } from '@/features/estoque/utils';
import { CATEGORIES, OPERATION_LABELS } from '@/shared/constants';
import { useTheme } from '@/store/theme';
import { useAuth } from '@/store/auth';
import type { AppView } from '@/app/Sidebar';
import {
  atividadesRecentes,
  catalogoComHistorico,
  filtrarPorUnidade,
  porCategoria,
  saldoComHistorico,
  serieDiaria,
  topMateriais,
  type Periodo,
} from './resumo';

const CORES_CATEGORIA = ['var(--azul)', 'var(--brand)', 'var(--amarelo)', 'var(--verde)', 'var(--roxo)', '#64748b'];

/** Ícone e cor de cada tipo de operação na lista de atividades. */
const ESTILO_OPERACAO: Record<string, { icone: React.ReactNode; cls: string }> = {
  ENTRADA_CENTRAL: { icone: <ArrowDownToLine size={15} />, cls: 'bg-[var(--verde)]/15 text-[var(--verde)]' },
  ENTRADA: { icone: <ArrowDownToLine size={15} />, cls: 'bg-[var(--verde)]/15 text-[var(--verde)]' },
  SAIDA: { icone: <ArrowUpFromLine size={15} />, cls: 'bg-[var(--vermelho)]/15 text-[var(--vermelho)]' },
  CONSUMO_OBRA: { icone: <HardHat size={15} />, cls: 'bg-[var(--vermelho)]/15 text-[var(--vermelho)]' },
  REMESSA_OBRA: { icone: <ArrowLeftRight size={15} />, cls: 'bg-[var(--brand)]/15 text-[var(--brand)]' },
  DEVOLUCAO_CENTRAL: { icone: <RotateCcw size={15} />, cls: 'bg-[var(--azul)]/15 text-[var(--azul)]' },
  DEVOLUCAO: { icone: <RotateCcw size={15} />, cls: 'bg-[var(--azul)]/15 text-[var(--azul)]' },
  AJUSTE_CENTRAL: { icone: <SlidersHorizontal size={15} />, cls: 'bg-[var(--amarelo)]/15 text-[var(--amarelo)]' },
  AJUSTE_OBRA: { icone: <SlidersHorizontal size={15} />, cls: 'bg-[var(--amarelo)]/15 text-[var(--amarelo)]' },
};
const ESTILO_PADRAO = { icone: <Activity size={15} />, cls: 'bg-[var(--bg-2)] text-[var(--text-muted)]' };

const fmtData = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const fmtHora = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
const fmtDiaSemana = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' });
const fmtDiaMes = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' });

function primeiroNome(nome?: string): string {
  return nome?.trim().split(/\s+/)[0] ?? '';
}

function capitalizar(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "hoje, 09:12" / "ontem, 16:05" / "05/09, 11:22" — o suficiente para uma lista de atividades. */
function quandoFoi(d: Date, agora: Date): string {
  const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  const dia = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = Math.round((hoje.getTime() - dia.getTime()) / 86400000);
  const hora = fmtHora.format(d);
  if (diff === 0) return `hoje, ${hora}`;
  if (diff === 1) return `ontem, ${hora}`;
  return `${fmtDiaMes.format(d)}, ${hora}`;
}

/** Relógio da saudação: anda a cada minuto, não a cada segundo — é ambiente, não cronômetro. */
function useAgora(): Date {
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  return agora;
}

/** "Sistema online" de verdade: pergunta ao servidor de tempos em tempos. */
function useOnline(): boolean | null {
  const [online, setOnline] = useState<boolean | null>(null);
  useEffect(() => {
    let vivo = true;
    async function checar() {
      try {
        const r = await fetch('/api/health', { cache: 'no-store' });
        if (vivo) setOnline(r.ok);
      } catch {
        if (vivo) setOnline(false);
      }
    }
    checar();
    const t = setInterval(checar, 60_000);
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, []);
  return online;
}

interface DashboardProps {
  materials: Material[];
  materialMovements: MaterialMovement[];
  unidade: Unidade | null;
  /** Só os depósitos da unidade em uso — para filtrar as movimentações. */
  depositos: Deposito[];
  /** Com uma unidade só, as movimentações antigas (sem depósito gravado) contam. */
  unidadeUnica: boolean;
  atualizadoEm: Date | null;
  onNavigate: (view: AppView) => void;
}

export function Dashboard({ materials, materialMovements, unidade, depositos, unidadeUnica, atualizadoEm, onNavigate }: DashboardProps) {
  const user = useAuth((s) => s.user);
  const dark = useTheme((s) => s.theme === 'dark');
  const agora = useAgora();
  const online = useOnline();
  const [periodo, setPeriodo] = useState<Periodo>(7);

  const movs = useMemo(() => filtrarPorUnidade(materialMovements, depositos, unidadeUnica), [materialMovements, depositos, unidadeUnica]);

  const catalogo = useMemo(() => catalogoComHistorico(materials), [materials]);
  const central = useMemo(() => saldoComHistorico(materials.reduce((s, m) => s + Number(m.saldo_central), 0), movs, 'central'), [materials, movs]);
  const obra = useMemo(() => saldoComHistorico(materials.reduce((s, m) => s + Number(m.saldo_obra), 0), movs, 'obra'), [materials, movs]);
  const alertas = useMemo(() => {
    const comprar = materials.filter(needsPurchase).length;
    const remessa = materials.filter((m) => stockStatus(m, 'obra') === 'TRANSFERIR').length;
    return { comprar, remessa };
  }, [materials]);

  const serie = useMemo(() => serieDiaria(movs, periodo), [movs, periodo]);
  const categorias = useMemo(() => porCategoria(materials, CATEGORIES), [materials]);
  const top = useMemo(() => topMateriais(materials, movs), [materials, movs]);
  const atividades = useMemo(() => atividadesRecentes(movs, materials), [movs, materials]);

  const tooltipStyle = {
    borderRadius: 12,
    fontSize: 12,
    background: dark ? '#111729' : '#ffffff',
    border: `1px solid ${dark ? '#1e2539' : '#e4e7ee'}`,
    color: dark ? '#f3f4f7' : '#0b1020',
    boxShadow: '0 12px 32px -12px rgba(0,0,0,0.4)',
  };
  const eixo = dark ? '#8b93a7' : '#667085';
  const grade = dark ? '#1e2539' : '#e4e7ee';

  const dadosBarras = serie.map((p) => ({
    ...p,
    rotulo: periodo === 7 ? capitalizar(fmtDiaSemana.format(p.data).replace('.', '')) : fmtDiaMes.format(p.data),
    sub: periodo === 7 ? fmtDiaMes.format(p.data) : '',
  }));

  return (
    <div className="space-y-5">
      {/* ---------- Saudação ---------- */}
      <Card className="relative overflow-hidden border-[var(--brand)]/20 bg-gradient-to-r from-[var(--surface)] via-[var(--surface)] to-[var(--brand)]/10 p-5 sm:p-6">
        <div className="pointer-events-none absolute -right-10 -top-16 h-72 w-72 rounded-full bg-[var(--brand)]/20 blur-3xl" aria-hidden />
        <MarcaProduto size={160} className="pointer-events-none absolute right-[30%] top-1/2 hidden -translate-y-1/2 opacity-90 drop-shadow-[0_20px_40px_rgba(255,138,36,0.45)] lg:block" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-[var(--text)] sm:text-3xl">Olá, {primeiroNome(user?.nome) || 'você'}! 👋</h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">Aqui está o resumo do seu estoque e das movimentações de hoje.</p>
            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold ${
                  online === false ? 'bg-[var(--vermelho)]/12 text-[var(--vermelho)]' : 'bg-[var(--verde)]/12 text-[var(--verde)]'
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${online === false ? 'bg-[var(--vermelho)]' : 'bg-[var(--verde)] shadow-[0_0_8px_var(--verde)]'}`} />
                {online === false ? 'Sem conexão com o servidor' : 'Sistema online'}
              </span>
              {atualizadoEm && <span className="text-[var(--text-muted)]">Última atualização: {fmtHora.format(atualizadoEm)}</span>}
            </div>
          </div>

          <div className="flex items-center gap-5 rounded-2xl border border-[var(--border)] bg-[var(--bg)]/70 px-5 py-4 backdrop-blur lg:min-w-[15rem]">
            <div>
              <p className="text-xs text-[var(--text-muted)]">{capitalizar(fmtData.format(agora))}</p>
              <p className="mt-0.5 text-3xl font-extrabold tabular-nums tracking-tight text-[var(--text)]">{fmtHora.format(agora)}</p>
            </div>
            {unidade && (
              <div className="border-l border-[var(--border)] pl-5 text-right">
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">Unidade</p>
                <p className="mt-0.5 max-w-[9rem] truncate text-sm font-semibold text-[var(--text)]">{unidade.nome}</p>
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* ---------- Resumo ---------- */}
      <Reveal className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <RevealItem>
          <StatCard
            label="Materiais"
            value={catalogo.total}
            icon={<Boxes size={20} />}
            accent="brand"
            trend={{ value: catalogo.tendencia, label: 'em 30 dias' }}
            sublabel="no catálogo desta unidade"
            serie={catalogo.serie}
            onClick={() => onNavigate('materiais')}
          />
        </RevealItem>
        <RevealItem>
          <StatCard
            label="Saldo Central"
            value={central.atual}
            icon={<Warehouse size={20} />}
            accent="blue"
            trend={{ value: central.tendencia, label: 'em 30 dias' }}
            sublabel="sem movimentação recente"
            serie={central.serie}
            onClick={() => onNavigate('central')}
          />
        </RevealItem>
        <RevealItem>
          <StatCard
            label="Saldo Obra"
            value={obra.atual}
            icon={<HardHat size={20} />}
            accent="green"
            trend={{ value: obra.tendencia, label: 'em 30 dias' }}
            sublabel="sem movimentação recente"
            serie={obra.serie}
            onClick={() => onNavigate('obra')}
          />
        </RevealItem>
        <RevealItem>
          <StatCard
            label="Precisa comprar"
            value={alertas.comprar}
            icon={<AlertTriangle size={20} />}
            accent="red"
            sublabel={alertas.remessa > 0 ? `+${alertas.remessa} só precisam de remessa` : 'nenhum material zerado na empresa'}
            onClick={() => onNavigate('alertas')}
          />
        </RevealItem>
      </Reveal>

      {/* ---------- Gráficos ---------- */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="p-5 xl:col-span-2">
          <CardHeader
            icon={<Activity size={15} />}
            title="Entradas vs. Saídas / Consumo"
            actions={
              <SegmentedControl
                layoutId="dashboard-periodo"
                value={String(periodo)}
                onChange={(v) => setPeriodo(Number(v) as Periodo)}
                options={[
                  { value: '7', label: '7 dias' },
                  { value: '30', label: '30 dias' },
                  { value: '90', label: '90 dias' },
                ]}
              />
            }
          />
          <div className="mt-5 h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dadosBarras} barCategoryGap={periodo === 7 ? '35%' : '20%'} barGap={periodo === 7 ? 6 : 2}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={grade} />
                <XAxis
                  dataKey="rotulo"
                  tick={{ fontSize: 11, fill: eixo }}
                  axisLine={false}
                  tickLine={false}
                  interval={periodo === 30 ? 4 : 0}
                  tickFormatter={(v: string, i: number) => (periodo === 7 ? `${v} ${dadosBarras[i]?.sub ?? ''}` : v)}
                />
                <YAxis tick={{ fontSize: 11, fill: eixo }} axisLine={false} tickLine={false} width={44} tickFormatter={(v) => formatNumber(Number(v))} />
                <Tooltip
                  formatter={(v, nome) => [formatNumber(Number(v)), nome === 'entradas' ? 'Entradas' : 'Saídas / Consumo']}
                  labelFormatter={(_, payload) => {
                    const p = payload?.[0]?.payload;
                    return p ? (periodo === 90 ? `Semana de ${fmtDiaMes.format(p.data)}` : capitalizar(fmtData.format(p.data))) : '';
                  }}
                  contentStyle={tooltipStyle}
                  cursor={{ fill: dark ? 'rgba(255,255,255,0.04)' : 'rgba(11,16,32,0.04)' }}
                />
                <Bar dataKey="entradas" fill="var(--verde)" radius={[6, 6, 0, 0]} maxBarSize={28} />
                <Bar dataKey="saidas" fill="var(--brand)" radius={[6, 6, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 flex items-center gap-5 text-xs text-[var(--text-muted)]">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-[var(--verde)]" /> Entradas
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-[var(--brand)]" /> Saídas / Consumo
            </span>
            {serie.every((p) => p.entradas === 0 && p.saidas === 0) && <span className="ml-auto">Nada movimentado no período.</span>}
          </div>
        </Card>

        <Card className="p-5">
          <CardHeader icon={<PieIcon size={15} />} title="Materiais por categoria" />
          <div className="relative mx-auto mt-4 h-[190px] w-[190px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={categorias} dataKey="valor" nameKey="nome" innerRadius={62} outerRadius={90} paddingAngle={3} stroke="none" cornerRadius={4}>
                  {categorias.map((_, i) => (
                    <Cell key={i} fill={CORES_CATEGORIA[i % CORES_CATEGORIA.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v, nome) => [`${formatNumber(Number(v))} itens`, nome]} contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-extrabold tabular-nums text-[var(--text)]">{formatNumber(materials.length)}</span>
              <span className="text-[11px] text-[var(--text-muted)]">itens</span>
            </div>
          </div>
          <ul className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
            {categorias.map((c, i) => (
              <li key={c.nome} className="flex min-w-0 items-center gap-2">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: CORES_CATEGORIA[i % CORES_CATEGORIA.length] }} />
                <span className="min-w-0 flex-1 truncate text-[var(--text-muted)]" title={c.nome}>
                  {c.nome}
                </span>
                <span className="font-semibold tabular-nums text-[var(--text)]">{c.pct}%</span>
              </li>
            ))}
            {categorias.length === 0 && <li className="col-span-2 py-4 text-center text-[var(--text-muted)]">Nenhum material cadastrado.</li>}
          </ul>
        </Card>
      </div>

      {/* ---------- Top 5 + atividades ---------- */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="p-5 xl:col-span-2">
          <CardHeader icon={<Trophy size={15} />} title="Top 5 materiais mais movimentados" />
          {top.length === 0 ? (
            <p className="py-10 text-center text-sm text-[var(--text-muted)]">Sem movimentações registradas ainda.</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
                    <th className="pb-2 pr-2 font-semibold">#</th>
                    <th className="pb-2 pr-2 font-semibold">Material</th>
                    <th className="hidden pb-2 pr-2 font-semibold md:table-cell">Categoria</th>
                    <th className="pb-2 pr-2 text-right font-semibold">Qtd. movimentada</th>
                    <th className="pb-2 text-right font-semibold">30 dias</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {top.map((t, i) => {
                    const up = (t.tendencia ?? 0) >= 0;
                    return (
                      <tr
                        key={t.material.id}
                        className="group cursor-pointer transition-colors hover:bg-[var(--bg-2)]"
                        onClick={() => onNavigate('materiais')}
                        title="Abrir em Materiais"
                      >
                        <td className="py-2.5 pr-2 font-mono text-xs text-[var(--text-muted)]">{i + 1}</td>
                        <td className="py-2.5 pr-2">
                          <span className="flex items-center gap-2.5">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--brand)]/12 text-[var(--brand)]">
                              <Boxes size={14} />
                            </span>
                            <span className="truncate font-medium text-[var(--text)]">{t.material.nome}</span>
                          </span>
                        </td>
                        <td className="hidden py-2.5 pr-2 text-[var(--text-muted)] md:table-cell">{t.material.categoria}</td>
                        <td className="py-2.5 pr-2 text-right font-semibold tabular-nums text-[var(--text)]">
                          {formatNumber(t.total)} <span className="text-xs font-normal text-[var(--text-muted)]">{t.material.unidade_medida}</span>
                        </td>
                        <td className="py-2.5 text-right">
                          {t.tendencia === null ? (
                            <span className="text-xs text-[var(--text-muted)]">—</span>
                          ) : (
                            <span className={`inline-flex items-center gap-1 text-xs font-semibold ${up ? 'text-[var(--verde)]' : 'text-[var(--vermelho)]'}`}>
                              {up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                              {Math.abs(Math.round(t.tendencia))}%
                            </span>
                          )}
                          <ChevronRight size={14} className="ml-2 inline text-[var(--text-muted)] opacity-0 transition-opacity group-hover:opacity-100" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div className="flex flex-col gap-4">
          <Card className="flex-1 p-5">
            <CardHeader
              icon={<Flame size={15} />}
              title="Atividades recentes"
              actions={
                <button type="button" onClick={() => onNavigate('central')} className="text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--brand)]">
                  Ver todas
                </button>
              }
            />
            <ul className="mt-3 divide-y divide-[var(--border)]">
              {atividades.length === 0 && <li className="py-8 text-center text-sm text-[var(--text-muted)]">Nenhuma movimentação ainda.</li>}
              {atividades.map((a) => {
                const estilo = ESTILO_OPERACAO[a.tipo] ?? ESTILO_PADRAO;
                return (
                  <li key={a.id} className="flex items-center gap-3 py-2.5">
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${estilo.cls}`}>{estilo.icone}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-[var(--text)]">{OPERATION_LABELS[a.tipo] ?? a.tipo}</span>
                      <span className="block truncate text-xs text-[var(--text-muted)]">
                        {a.material} · {formatNumber(Math.abs(a.quantidade))} · {a.quem}
                      </span>
                    </span>
                    <span className="shrink-0 text-[11px] tabular-nums text-[var(--text-muted)]">{quandoFoi(a.quando, agora)}</span>
                  </li>
                );
              })}
            </ul>
          </Card>

          <Card className="relative overflow-hidden border-[var(--brand)]/30 bg-gradient-to-br from-[var(--brand)]/15 to-[var(--surface)] p-5">
            <div className="flex items-center gap-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--brand)] text-white shadow-lg shadow-[var(--brand)]/40">
                <ArrowLeftRight size={20} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-[var(--text)]">Precisa de algo?</p>
                <p className="text-xs text-[var(--text-muted)]">Registre uma entrada, uma remessa ou um consumo.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('central')}
              className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-[var(--brand)] px-3 py-2.5 text-xs font-bold text-white shadow-md shadow-[var(--brand)]/30 transition hover:brightness-110"
            >
              <Plus size={14} /> Nova movimentação
            </button>
          </Card>
        </div>
      </div>
    </div>
  );
}
