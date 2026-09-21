import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

/**
 * Os campos de formulário: rótulo miúdo em cima, campo alto o bastante para
 * o toque, foco roxo suave, ajuda e erro embaixo. Um só desenho para
 * entrada, seleção e área de texto.
 */
export const ESTILO_DO_CAMPO = 'w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-sm text-[var(--text)] shadow-[0_1px_2px_rgba(23,21,58,0.03)] outline-none transition-[border-color,box-shadow] placeholder:text-[var(--text-disable)] hover:border-[var(--border-strong)] focus:border-[var(--brand)] focus:ring-4 focus:ring-[var(--brand)]/10 disabled:cursor-not-allowed disabled:bg-[var(--bg)] disabled:text-[var(--text-muted)]';

export function RotuloDoCampo({ children, obrigatorio, htmlFor }: { children: ReactNode; obrigatorio?: boolean; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-semibold text-[var(--text)]">
      {children}
      {obrigatorio && <span className="ml-0.5 text-[var(--vermelho)]">*</span>}
    </label>
  );
}

function Rodape({ ajuda, erro }: { ajuda?: ReactNode; erro?: ReactNode }) {
  if (!ajuda && !erro) return null;
  return <p className={`mt-1.5 text-xs ${erro ? 'text-[var(--vermelho)]' : 'text-[var(--text-muted)]'}`}>{erro ?? ajuda}</p>;
}

interface Comum {
  rotulo?: ReactNode;
  ajuda?: ReactNode;
  erro?: ReactNode;
  /** Um ícone à esquerda, dentro do campo. */
  icone?: ReactNode;
}

type EntradaProps = InputHTMLAttributes<HTMLInputElement> & Comum;
export const Entrada = forwardRef<HTMLInputElement, EntradaProps>(function Entrada({ rotulo, ajuda, erro, icone, required, className = '', id, ...rest }, ref) {
  return (
    <div className={className}>
      {rotulo && (
        <RotuloDoCampo obrigatorio={required} htmlFor={id}>
          {rotulo}
        </RotuloDoCampo>
      )}
      <div className="relative">
        {icone && <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[var(--text-muted)]">{icone}</span>}
        <input ref={ref} id={id} required={required} aria-invalid={erro ? true : undefined} className={`${ESTILO_DO_CAMPO} ${icone ? 'pl-9' : ''} ${erro ? 'border-[var(--vermelho)]/60' : ''}`} {...rest} />
      </div>
      <Rodape ajuda={ajuda} erro={erro} />
    </div>
  );
});

type SelecaoProps = SelectHTMLAttributes<HTMLSelectElement> & Comum & { children: ReactNode };
export function Selecao({ rotulo, ajuda, erro, required, className = '', id, children, ...rest }: SelecaoProps) {
  return (
    <div className={className}>
      {rotulo && (
        <RotuloDoCampo obrigatorio={required} htmlFor={id}>
          {rotulo}
        </RotuloDoCampo>
      )}
      <div className="relative">
        <select id={id} required={required} className={`${ESTILO_DO_CAMPO} appearance-none pr-9`} {...rest}>
          {children}
        </select>
        <svg className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </div>
      <Rodape ajuda={ajuda} erro={erro} />
    </div>
  );
}

type AreaDeTextoProps = TextareaHTMLAttributes<HTMLTextAreaElement> & Comum;
export function AreaDeTexto({ rotulo, ajuda, erro, required, className = '', id, ...rest }: AreaDeTextoProps) {
  return (
    <div className={className}>
      {rotulo && (
        <RotuloDoCampo obrigatorio={required} htmlFor={id}>
          {rotulo}
        </RotuloDoCampo>
      )}
      <textarea id={id} required={required} className={`${ESTILO_DO_CAMPO} resize-none leading-relaxed`} {...rest} />
      <Rodape ajuda={ajuda} erro={erro} />
    </div>
  );
}

/** Uma caixa de marcar com rótulo, no mesmo desenho dos campos. */
export function Marcar({ marcado, onChange, children, className = '' }: { marcado: boolean; onChange: (v: boolean) => void; children: ReactNode; className?: string }) {
  return (
    <label className={`inline-flex cursor-pointer items-center gap-2.5 text-sm text-[var(--text)] ${className}`}>
      <input type="checkbox" checked={marcado} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 rounded border-[var(--border-strong)] accent-[var(--brand)]" />
      {children}
    </label>
  );
}

/** O interruptor liga/desliga, com título e explicação. */
export function Interruptor({ ligado, onChange, titulo, descricao, desabilitado, className = '' }: { ligado: boolean; onChange: (v: boolean) => void; titulo: ReactNode; descricao?: ReactNode; desabilitado?: boolean; className?: string }) {
  return (
    <div className={`flex items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3.5 ${className}`}>
      <button type="button" role="switch" aria-checked={ligado} disabled={desabilitado} onClick={() => onChange(!ligado)} className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${ligado ? 'bg-[var(--brand)]' : 'bg-[var(--border-strong)]'}`}>
        <span className={`absolute left-0 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${ligado ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
      </button>
      <button type="button" onClick={() => !desabilitado && onChange(!ligado)} className="min-w-0 flex-1 text-left">
        <span className="block text-sm font-semibold text-[var(--text)]">{titulo}</span>
        {descricao && <span className="mt-0.5 block text-xs leading-5 text-[var(--text-muted)]">{descricao}</span>}
      </button>
    </div>
  );
}
