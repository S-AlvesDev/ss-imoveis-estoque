import { type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

/**
 * O botão do Atende Aí. Uma cor de ação (roxo), o resto em cinzas: primária
 * para a ação principal da tela, secundária (branca com borda) para as
 * demais, suave (lavanda) para ações da IA e filtros, fantasma para ícones
 * e cancelar, perigo para o irreversível.
 */
export type VarianteDoBotao = 'primaria' | 'secundaria' | 'suave' | 'fantasma' | 'perigo';
export type TamanhoDoBotao = 'xs' | 'sm' | 'md' | 'lg';

interface BotaoProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: VarianteDoBotao;
  tamanho?: TamanhoDoBotao;
  icone?: ReactNode;
  /** Ícone à direita (setas, "abrir"). */
  iconeDepois?: ReactNode;
  carregando?: boolean;
  largo?: boolean;
  /** Só o ícone, quadrado — o `aria-label` vira a dica. */
  quadrado?: boolean;
}

const VARIANTE: Record<VarianteDoBotao, string> = {
  primaria: 'bg-[var(--brand)] text-white shadow-[0_8px_20px_-10px_rgba(124,58,237,0.7)] hover:bg-[var(--brand-deep)] disabled:bg-[var(--brand)]/55 disabled:shadow-none',
  secundaria: 'border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] shadow-[0_1px_2px_rgba(23,21,58,0.04)] hover:border-[var(--border-strong)] hover:bg-[var(--bg)] disabled:text-[var(--text-disable)]',
  suave: 'bg-[var(--brand-soft)] text-[var(--brand-ink)] hover:bg-[#e4dcfd] disabled:opacity-60',
  fantasma: 'bg-transparent text-[var(--text-muted)] hover:bg-[var(--bg-2)] hover:text-[var(--text)] disabled:text-[var(--text-disable)] disabled:hover:bg-transparent',
  perigo: 'bg-[var(--vermelho)] text-white shadow-[0_8px_20px_-10px_rgba(225,29,72,0.6)] hover:brightness-95 disabled:opacity-60 disabled:shadow-none',
};

const TAMANHO: Record<TamanhoDoBotao, { texto: string; quadrado: string }> = {
  xs: { texto: 'h-7 px-2.5 text-[11px] gap-1 rounded-lg', quadrado: 'h-7 w-7 rounded-lg' },
  sm: { texto: 'h-8 px-3 text-xs gap-1.5 rounded-lg', quadrado: 'h-8 w-8 rounded-lg' },
  md: { texto: 'h-10 px-4 text-sm gap-2 rounded-xl', quadrado: 'h-10 w-10 rounded-xl' },
  lg: { texto: 'h-11 px-5 text-sm gap-2 rounded-xl', quadrado: 'h-11 w-11 rounded-xl' },
};

export function Botao({ variante = 'primaria', tamanho = 'md', icone, iconeDepois, carregando, largo, quadrado, className = '', children, disabled, type = 'button', ...rest }: BotaoProps) {
  const t = TAMANHO[tamanho];
  return (
    <button
      type={type}
      disabled={disabled || carregando}
      data-dica={quadrado && rest['aria-label'] ? rest['aria-label'] : undefined}
      className={`inline-flex shrink-0 items-center justify-center font-semibold transition-[background-color,border-color,color,box-shadow,transform] duration-150 active:scale-[0.98] disabled:cursor-not-allowed disabled:active:scale-100 ${VARIANTE[variante]} ${quadrado ? t.quadrado : t.texto} ${largo ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      {carregando ? <Loader2 className="animate-spin" size={tamanho === 'xs' ? 13 : 15} /> : icone}
      {children}
      {!carregando && iconeDepois}
    </button>
  );
}
