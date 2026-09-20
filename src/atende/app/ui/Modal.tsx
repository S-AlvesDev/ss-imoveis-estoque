import { useEffect, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';

/**
 * A janela do Atende Aí: no desktop, centrada; no celular, uma folha que
 * sobe do rodapé e ocupa a largura toda. Esc fecha; o clique fora também.
 */
interface ModalProps {
  aberto: boolean;
  onFechar: () => void;
  titulo: ReactNode;
  descricao?: ReactNode;
  children: ReactNode;
  rodape?: ReactNode;
  largura?: 'sm' | 'md' | 'lg' | 'xl';
  /** Sem o preenchimento padrão no corpo (listas que encostam nas bordas). */
  semPreenchimento?: boolean;
}

const LARGURA = { sm: 'sm:max-w-md', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl', xl: 'sm:max-w-4xl' };

export function Modal({ aberto, onFechar, titulo, descricao, children, rodape, largura = 'md', semPreenchimento }: ModalProps) {
  useEffect(() => {
    if (!aberto) return;
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && onFechar();
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [aberto, onFechar]);

  return (
    <AnimatePresence>
      {aberto && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }} className="fixed inset-0 z-[100] flex items-end justify-center bg-[#17153a]/45 backdrop-blur-[2px] sm:items-center sm:p-4" onClick={onFechar} role="presentation">
          <motion.div
            role="dialog"
            aria-modal="true"
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 420, damping: 36 }}
            onClick={(e) => e.stopPropagation()}
            className={`flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--sombra-flutuante)] sm:rounded-2xl ${LARGURA[largura]}`}
          >
            <div className="flex items-start justify-between gap-4 px-5 pb-4 pt-5 sm:px-6">
              <div className="min-w-0">
                <h3 className="text-lg font-semibold leading-6 tracking-tight text-[var(--text)]">{titulo}</h3>
                {descricao && <p className="mt-1 text-sm leading-5 text-[var(--text-muted)]">{descricao}</p>}
              </div>
              <button type="button" onClick={onFechar} className="-mr-1.5 -mt-1 rounded-lg p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-2)] hover:text-[var(--text)]" aria-label="Fechar">
                <X size={18} />
              </button>
            </div>
            <div className={`min-h-0 flex-1 overflow-y-auto ${semPreenchimento ? '' : 'px-5 pb-5 sm:px-6'}`}>{children}</div>
            {rodape && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--border)] bg-[var(--bg)] px-5 py-3.5 pb-[calc(0.875rem+env(safe-area-inset-bottom))] sm:px-6 sm:pb-3.5">{rodape}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
