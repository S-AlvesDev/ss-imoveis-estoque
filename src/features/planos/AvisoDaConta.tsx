import { AlertTriangle, Sparkles } from 'lucide-react';
import { usePlano } from './usePlano';

/**
 * A faixa no topo do sistema enquanto a conta está em avaliação ou em
 * carência: quantos dias faltam e para onde ir. Some quando está assinada.
 */
export function AvisoDaConta({ onIrParaPlano, admin }: { onIrParaPlano: () => void; admin: boolean }) {
  const { conta } = usePlano();
  if (conta.situacao === 'assinada' || conta.situacao === 'bloqueada' || conta.dias_restantes === null) return null;

  const dias = conta.dias_restantes;
  const rotuloDias = dias === 0 ? 'hoje' : dias === 1 ? 'amanhã' : `em ${dias} dias`;
  const carencia = conta.situacao === 'carencia';

  return (
    <div className={`flex flex-wrap items-center justify-between gap-2 px-6 py-2 text-xs ${carencia ? 'bg-[var(--vermelho)]/10 text-[var(--text)]' : 'bg-[var(--brand)]/10 text-[var(--text)]'}`}>
      <span className="inline-flex items-center gap-2">
        {carencia ? <AlertTriangle size={14} className="text-[var(--vermelho)]" /> : <Sparkles size={14} className="text-[var(--brand)]" />}
        {carencia ? (
          <>
            O pagamento da assinatura não foi aprovado. A conta trava <strong>{rotuloDias}</strong> — atualize o cartão ou assine de novo.
          </>
        ) : (
          <>
            Avaliação gratuita: termina <strong>{rotuloDias}</strong>. Assine para continuar com tudo.
          </>
        )}
      </span>
      {admin && (
        <button type="button" onClick={onIrParaPlano} className="font-bold text-[var(--brand)] hover:underline">
          {carencia ? 'Resolver' : 'Ver planos'} →
        </button>
      )}
    </div>
  );
}
