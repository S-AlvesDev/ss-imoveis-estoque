import { useId } from 'react';

interface SparklineProps {
  /** Uma série curta (7 a 30 pontos). Valores iguais viram uma linha reta no meio. */
  data: number[];
  color: string;
  width?: number;
  height?: number;
  className?: string;
}

/**
 * A linha miúda dos cartões de resumo: mostra a forma da semana, não os
 * números — para isso existe o gráfico grande. SVG puro, sem biblioteca.
 */
export function Sparkline({ data, color, width = 96, height = 28, className = '' }: SparklineProps) {
  const id = useId();
  if (data.length < 2) return null;

  const max = Math.max(...data);
  const min = Math.min(...data);
  const amplitude = max - min || 1;
  const passo = width / (data.length - 1);
  const pad = 2;
  const pontos = data.map((v, i) => {
    const x = i * passo;
    const y = pad + (height - pad * 2) * (1 - (v - min) / amplitude);
    return [x, y] as const;
  });

  // Curva suave: cada segmento vira uma bézier com as alças a um terço do caminho.
  const linha = pontos.reduce((d, [x, y], i) => {
    if (i === 0) return `M${x},${y}`;
    const [px, py] = pontos[i - 1];
    const cx = px + (x - px) / 3;
    const cx2 = x - (x - px) / 3;
    return `${d} C${cx},${py} ${cx2},${y} ${x},${y}`;
  }, '');
  const area = `${linha} L${width},${height} L0,${height} Z`;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={`shrink-0 overflow-visible ${className}`} aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <path d={linha} fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
