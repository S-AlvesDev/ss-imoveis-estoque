import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

/**
 * Os gráficos do produto: um só desenho — grade quase invisível, eixos sem
 * linha, área roxa com gradiente suave, tooltip branco. Sem efeitos, sem
 * legenda gritando: o dado é o protagonista.
 */
const EIXO = '#8d8bab';
const GRADE = '#ecebf5';

function diaCurto(dia: string): string {
  const [, m, d] = dia.split('-');
  return `${d}/${m}`;
}

function diaLongo(dia: string): string {
  const d = new Date(`${dia}T12:00:00`);
  const texto = d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

interface PontoDaSerie {
  dia: string;
  conversas: number;
}

/** Conversas abertas por dia. Cabe de 1 a 90 pontos; o eixo X mostra só o que couber. */
export function GraficoDeConversas({ serie, altura = 240 }: { serie: PontoDaSerie[]; altura?: number }) {
  const n = serie.length;
  const intervalo = n <= 8 ? 0 : n <= 31 ? 4 : 14;
  const dados = serie.map((s) => ({ ...s, rotulo: diaCurto(s.dia) }));
  const maximo = Math.max(...serie.map((s) => s.conversas), 1);
  return (
    <div style={{ height: altura }} className="-ml-2 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={dados} margin={{ top: 10, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="atende-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#7c3aed" stopOpacity={0.28} />
              <stop offset="100%" stopColor="#7c3aed" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 4" vertical={false} stroke={GRADE} />
          <XAxis dataKey="rotulo" tick={{ fontSize: 11, fill: EIXO }} axisLine={false} tickLine={false} interval={intervalo} tickMargin={8} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: EIXO }} axisLine={false} tickLine={false} width={32} domain={[0, Math.max(4, Math.ceil(maximo * 1.2))]} />
          <Tooltip
            cursor={{ stroke: '#c4b5fd', strokeWidth: 1, strokeDasharray: '3 3' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as PontoDaSerie;
              return (
                <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 shadow-[var(--sombra-flutuante)]">
                  <p className="text-[11px] font-medium text-[var(--text-muted)]">{diaLongo(p.dia)}</p>
                  <p className="mt-0.5 text-sm font-semibold text-[var(--text)]">
                    {p.conversas} {p.conversas === 1 ? 'conversa' : 'conversas'}
                  </p>
                </div>
              );
            }}
          />
          <Area type="monotone" dataKey="conversas" stroke="#7c3aed" strokeWidth={2} fill="url(#atende-area)" dot={n <= 8 ? { r: 3, fill: '#7c3aed', strokeWidth: 2, stroke: '#fff' } : false} activeDot={{ r: 4, fill: '#7c3aed', strokeWidth: 2, stroke: '#fff' }} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

interface EtapaDoFunil {
  chave: string;
  nome: string;
  quantidade: number;
  cor: string;
}

/**
 * O funil de leads: cada etapa é uma barra centrada cuja largura é a
 * proporção dela no total — o desenho afunila sozinho. À direita, a
 * quantidade e o percentual.
 */
export function Funil({ etapas, total }: { etapas: EtapaDoFunil[]; total: number }) {
  const maior = Math.max(...etapas.map((e) => e.quantidade), 1);
  return (
    <ol className="space-y-1.5">
      {etapas.map((e, i) => {
        const pct = total ? Math.round((e.quantidade / total) * 100) : 0;
        const largura = e.quantidade ? Math.max(18, (e.quantidade / maior) * 100) : 10;
        return (
          <li key={e.chave} className="group grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] items-center gap-3 text-xs">
            <span className="flex min-w-0 items-center gap-2">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: e.cor }} />
              <span className="truncate font-medium text-[var(--text)]">{e.nome}</span>
            </span>
            <span className="flex h-6 items-center justify-center">
              <span className="relative h-full rounded-md transition-[width] duration-500" style={{ width: `${largura}%`, backgroundColor: e.quantidade ? e.cor : 'var(--bg-2)', opacity: e.quantidade ? 0.9 - i * 0.05 : 1 }} title={`${e.quantidade} · ${pct}%`} />
            </span>
            <span className="w-[4.5rem] text-right tabular-nums">
              <span className="font-semibold text-[var(--text)]">{e.quantidade}</span>
              <span className="text-[var(--text-muted)]"> · {pct}%</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** A distribuição das notas 0–10: barras por nota, coloridas pela faixa (detrator, neutro, promotor). */
export function DistribuicaoDeNotas({ distribuicao, altura = 72 }: { distribuicao: number[]; altura?: number }) {
  const max = Math.max(...distribuicao, 1);
  const total = distribuicao.reduce((a, b) => a + b, 0);
  return (
    <div className="flex items-end gap-1 sm:gap-1.5" role="img" aria-label="Distribuição das notas de 0 a 10">
      {distribuicao.map((n, nota) => {
        const cor = nota >= 9 ? '#16a34a' : nota >= 7 ? '#d97706' : '#e11d48';
        const pct = total ? Math.round((n / total) * 100) : 0;
        return (
          <div key={nota} className="group flex min-w-0 flex-1 flex-col items-center gap-1" data-dica={`${n} ${n === 1 ? 'nota' : 'notas'} ${nota} · ${pct}%`}>
            <span className="text-[10px] font-semibold tabular-nums text-[var(--text)] opacity-0 transition-opacity group-hover:opacity-100">{n || ''}</span>
            <div className="flex w-full items-end justify-center rounded-md bg-[var(--bg-2)]" style={{ height: altura }}>
              <div className="w-full rounded-md transition-[height] duration-500" style={{ height: `${Math.max(n ? 8 : 0, (n / max) * 100)}%`, backgroundColor: cor, opacity: n ? 0.85 : 0 }} />
            </div>
            <span className="text-[10px] tabular-nums text-[var(--text-muted)]">{nota}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Uma barra horizontal com rótulo, valor e percentual — para "o que os clientes queriam". */
export function BarraHorizontal({ rotulo, valor, total, cor = 'var(--brand)' }: { rotulo: string; valor: number; total: number; cor?: string }) {
  const pct = total ? Math.round((valor / total) * 100) : 0;
  return (
    <li className="flex items-center gap-3 text-xs">
      <span className="w-28 shrink-0 truncate font-medium text-[var(--text)]">{rotulo}</span>
      <span className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--bg-2)]">
        <span className="block h-full rounded-full transition-[width] duration-500" style={{ width: `${pct}%`, backgroundColor: cor }} />
      </span>
      <span className="w-14 shrink-0 text-right tabular-nums text-[var(--text-muted)]">
        <span className="font-semibold text-[var(--text)]">{valor}</span> · {pct}%
      </span>
    </li>
  );
}
