import { useState } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, Sparkles } from 'lucide-react';
import { Botao } from '../../ui/Botao';
import { Modal } from '../../ui/Modal';
import { Entrada } from '../../ui/Campo';
import { PensandoIa } from '../../ui/Ia';
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
    <Modal aberto={aberto} onFechar={onFechar} titulo="Encerrar atendimento" descricao={`${nomeDoCliente(conversa.cliente)} · ${conversa.assunto ?? 'sem assunto'}`} largura="sm" rodape={<Botao variante="fantasma" onClick={onFechar} disabled={enviando !== null}>Cancelar</Botao>}>
      <div className="space-y-3">
        <button type="button" onClick={() => confirmar(true)} disabled={enviando !== null} className="borda-ia w-full rounded-xl p-4 text-left transition-[box-shadow,transform] hover:shadow-[0_12px_32px_-20px_rgba(124,58,237,0.6)] disabled:opacity-60">
          <p className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--brand-soft)] text-[var(--brand)]">
              <Sparkles size={14} />
            </span>
            Despedida da IA + pedir avaliação
          </p>
          <p className="mt-1.5 text-xs leading-5 text-[var(--text-muted)]">A IA escreve uma despedida no tom desta conversa e pergunta: “De 0 a 10, como você avalia este atendimento?”. A nota do cliente entra sozinha, sem reabrir a conversa.</p>
          {enviando === 'avaliar' && <PensandoIa className="mt-2" texto="Escrevendo e enviando" />}
        </button>
        <button type="button" onClick={() => confirmar(false)} disabled={enviando !== null} className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4 text-left transition-colors hover:bg-[var(--surface)] disabled:opacity-60">
          <p className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--bg-2)] text-[var(--text-muted)]">
              <CheckCircle2 size={14} />
            </span>
            Encerrar sem mensagem
          </p>
          <p className="mt-1.5 text-xs leading-5 text-[var(--text-muted)]">Só marca a conversa como encerrada. Se o cliente escrever de novo, ela reabre.</p>
          {enviando === 'sem' && <p className="mt-2 text-xs font-semibold text-[var(--text-muted)]">Encerrando…</p>}
        </button>
        <Entrada rotulo="Motivo (opcional, só a equipe vê)" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={300} placeholder="Ex.: resolvido, cliente desistiu…" />
      </div>
    </Modal>
  );
}
