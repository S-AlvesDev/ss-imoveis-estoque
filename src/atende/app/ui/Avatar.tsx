import { useState } from 'react';
import type { Presenca } from '../../shared/tipos';

/**
 * O avatar: a foto quando há, senão as iniciais sobre um tom pastel
 * escolhido pelo nome (a mesma pessoa tem sempre a mesma cor). O ponto de
 * presença entra no canto quando pedido.
 */
const TONS = [
  ['#ede9fe', '#5b21b6'],
  ['#dbeafe', '#1d4ed8'],
  ['#dcfce7', '#15803d'],
  ['#fef3c7', '#b45309'],
  ['#fce7f3', '#be185d'],
  ['#e0f2fe', '#0369a1'],
  ['#fee2e2', '#b91c1c'],
  ['#ecfccb', '#4d7c0f'],
] as const;

export function iniciaisDe(nome: string): string {
  const p = nome.replace(/[^\p{L}\p{N} ]/gu, '').trim().split(/\s+/).filter(Boolean);
  const s = ((p[0]?.[0] ?? '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
  return s || '#';
}

function tomDe(nome: string): readonly [string, string] {
  let h = 0;
  for (const ch of nome) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TONS[h % TONS.length];
}

const PRESENCA: Record<Presenca, string> = { online: 'bg-emerald-500', ausente: 'bg-amber-400', offline: 'bg-slate-300' };

interface AvatarProps {
  nome: string;
  foto?: string | null;
  /** Em pixels. */
  tamanho?: number;
  presenca?: Presenca | null;
  /** Quadrado com cantos arredondados (empresas, setores) em vez de círculo. */
  quadrado?: boolean;
  /** Força o tom da marca (o cliente na Central). */
  marca?: boolean;
  className?: string;
}

export function Avatar({ nome, foto, tamanho = 36, presenca, quadrado, marca, className = '' }: AvatarProps) {
  const [falhou, setFalhou] = useState(false);
  const [fundo, texto] = marca ? (['#ede9fe', '#5b21b6'] as const) : tomDe(nome);
  const raio = quadrado ? 'rounded-xl' : 'rounded-full';
  const fonte = Math.max(10, Math.round(tamanho * 0.38));
  return (
    <span className={`relative inline-flex shrink-0 ${className}`} style={{ width: tamanho, height: tamanho }}>
      {foto && !falhou ? (
        <img src={foto} alt="" onError={() => setFalhou(true)} className={`h-full w-full object-cover ${raio}`} draggable={false} />
      ) : (
        <span className={`flex h-full w-full items-center justify-center font-bold ${raio}`} style={{ backgroundColor: fundo, color: texto, fontSize: fonte }} aria-hidden>
          {iniciaisDe(nome)}
        </span>
      )}
      {presenca && <span className={`absolute -bottom-0.5 -right-0.5 rounded-full border-2 border-[var(--surface)] ${PRESENCA[presenca]}`} style={{ width: Math.max(10, tamanho * 0.3), height: Math.max(10, tamanho * 0.3) }} title={presenca === 'online' ? 'Online' : presenca === 'ausente' ? 'Ausente' : 'Offline'} />}
    </span>
  );
}

/** Vários avatares sobrepostos (a equipe de um setor). */
export function Avatares({ nomes, tamanho = 24, maximo = 4 }: { nomes: string[]; tamanho?: number; maximo?: number }) {
  const mostrar = nomes.slice(0, maximo);
  const resto = nomes.length - mostrar.length;
  return (
    <span className="inline-flex items-center">
      {mostrar.map((n, i) => (
        <span key={`${n}-${i}`} className="rounded-full ring-2 ring-[var(--surface)]" style={{ marginLeft: i === 0 ? 0 : -tamanho * 0.3 }}>
          <Avatar nome={n} tamanho={tamanho} />
        </span>
      ))}
      {resto > 0 && (
        <span className="ml-1 text-[11px] font-semibold text-[var(--text-muted)]">+{resto}</span>
      )}
    </span>
  );
}
