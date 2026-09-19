import { useState } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, Sparkles } from 'lucide-react';
import { Button } from '@/shared/ui/Button';
import { Modal } from '@/shared/ui/Modal';
import { Input } from '@/shared/ui/Field';
import { api, ErroDaApi } from '../../lib/api';
import { useCentral } from '../../store/central';
import type { Conversa } from '../../../shared/tipos';
import { nomeDoCliente } from './util';

/**
 * Encerrar: com a despedida da IA e o pedido de nota (0 a 10), ou sem
 * mensagem nenhuma. A despedida é escrita na hora, no tom da conversa; o
 * cliente responde o número pelo WhatsApp e a nota entra sozinha.
 */
export function Encerrar({ conversa, aberto, onFechar }: { conversa: Conversa; aberto: boolean; onFechar: () => void }) {
  const aplicarConversa = useCentral((s) => s.aplicarConversa);
  const abrir = useCentral((s) => s.abrir);
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState<'avaliar' | 'sem' | null>(null);

  async function confirmar(avaliar: boolean) {
    setEnviando(avaliar ? 'avaliar' : 'sem');
    try {
      const r = await api.post<{ conversa: Conversa }>(`/conversas/${conversa.id}/encerrar`, { avaliar, motivo: motivo.trim() || undefined });
      aplicarConversa(r.conversa);
      void abrir(conversa.id);
      toast.success(avaliar ? 'Encerrada. Despedida e pedido de avaliação enviados.' : 'Conversa encerrada.');
      onFechar();
      setMotivo('');
    } catch (err) {
      toast.error(err instanceof ErroDaApi ? err.message : 'Não foi possível encerrar.');
    } finally {
      setEnviando(null);
    }
  }

  return (
    <Modal open={aberto} onClose={onFechar} title="Encerrar atendimento" subtitle={`${nomeDoCliente(conversa.cliente)} · ${conversa.assunto ?? 'sem assunto'}`} maxWidth="max-w-md">
      <div className="space-y-4">
        <button type="button" onClick={() => confirmar(true)} disabled={enviando !== null} className="w-full rounded-xl border border-[var(--brand)]/40 bg-[var(--brand)]/[0.06] p-4 text-left transition-colors hover:bg-[var(--brand)]/10 disabled:opacity-60">
          <p className="flex items-center gap-2 text-sm font-bold text-[var(--text)]">
            <Sparkles size={15} className="text-[var(--brand)]" /> Despedida da IA + pedir avaliação
          </p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">A IA escreve uma despedida no tom desta conversa e pergunta: “De 0 a 10, como você avalia este atendimento?”. A nota do cliente entra sozinha, sem reabrir a conversa.</p>
          {enviando === 'avaliar' && <p className="mt-2 text-xs font-semibold text-[var(--brand)]">Escrevendo e enviando…</p>}
        </button>
        <button type="button" onClick={() => confirmar(false)} disabled={enviando !== null} className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-2)] p-4 text-left transition-colors hover:bg-[var(--surface)] disabled:opacity-60">
          <p className="flex items-center gap-2 text-sm font-bold text-[var(--text)]">
            <CheckCircle2 size={15} className="text-[var(--text-muted)]" /> Encerrar sem mensagem
          </p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">Só marca a conversa como encerrada. Se o cliente escrever de novo, ela reabre.</p>
          {enviando === 'sem' && <p className="mt-2 text-xs font-semibold text-[var(--text-muted)]">Encerrando…</p>}
        </button>
        <Input label="Motivo (opcional, só a equipe vê)" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={300} placeholder="Ex.: resolvido, cliente desistiu…" />
        <div className="flex justify-end">
          <Button variant="ghost" onClick={onFechar} disabled={enviando !== null}>
            Cancelar
          </Button>
        </div>
      </div>
    </Modal>
  );
}
