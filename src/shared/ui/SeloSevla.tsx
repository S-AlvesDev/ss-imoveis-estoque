import { ArrowUpRight } from 'lucide-react';
import { track } from '@/lib/analytics';

/**
 * A SEVLA INFINITY dentro dos produtos: um selo discreto no rodapé da barra
 * lateral (e nos menus) com o caminho de volta — a conta central e os
 * outros produtos. É o único lugar em que a empresa-mãe aparece dentro do
 * Stok Aí e do Atende Aí; o resto da tela é do produto.
 */
export const SEVLA_LINKS = {
  home: '/cloud',
  conta: '/cloud/conta',
  simbolo: '/sevla/simbolo.webp',
} as const;

const clique = (origem: string, alvo: string) => track('sevla_cta', { alvo: `${origem}-${alvo}` });

/** Para barras laterais escuras (as dos dois produtos). */
export function SeloSevla({ origem }: { origem: 'stok' | 'atende' }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-3">
      <a href={SEVLA_LINKS.home} onClick={() => clique(origem, 'home')} className="flex items-center gap-2.5 rounded-lg" title="A empresa por trás do produto">
        <img src={SEVLA_LINKS.simbolo} alt="" width={22} height={22} className="h-[22px] w-[22px] rounded-md object-contain" decoding="async" aria-hidden />
        <span className="min-w-0 leading-tight">
          <span className="block text-[10px] font-semibold uppercase tracking-[0.2em] text-white/50">Um produto da</span>
          <span className="block text-xs font-extrabold tracking-tight text-white">SEVLA INFINITY</span>
        </span>
      </a>
      <div className="mt-2.5 flex gap-1.5">
        <a href={SEVLA_LINKS.conta} onClick={() => clique(origem, 'conta')} className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-white/[0.06] px-2 py-1.5 text-[11px] font-semibold text-white/90 transition-colors hover:bg-white/[0.12]">
          Minha SEVLA <ArrowUpRight size={11} />
        </a>
        <a href={SEVLA_LINKS.home} onClick={() => clique(origem, 'produtos')} className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-white/60 transition-colors hover:bg-white/[0.06] hover:text-white">
          Outros produtos
        </a>
      </div>
    </div>
  );
}

/** Uma linha de rodapé para telas claras (login, páginas públicas). */
export function LinhaSevla({ origem, className = '' }: { origem: string; className?: string }) {
  return (
    <p className={`text-[11px] text-[var(--text-muted)] ${className}`}>
      Um produto da{' '}
      <a href={SEVLA_LINKS.home} onClick={() => clique(origem, 'home')} className="font-semibold text-[var(--text)] underline-offset-4 hover:underline">
        SEVLA INFINITY
      </a>
      {' · '}
      <a href={SEVLA_LINKS.conta} onClick={() => clique(origem, 'conta')} className="underline-offset-4 hover:underline">
        Minha SEVLA
      </a>
    </p>
  );
}
