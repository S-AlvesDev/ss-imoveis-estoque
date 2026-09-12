import { useEffect, useRef, useState } from 'react';
import { Eraser, PenLine } from 'lucide-react';

interface SignaturePadProps {
  label?: string;
  required?: boolean;
  /** Recebe o PNG (data URL) a cada traço, ou null quando limpa. */
  onChange: (png: string | null) => void;
  /** Limpa o quadro quando muda (ex.: depois de registrar). */
  resetKey?: unknown;
}

const LARGURA = 600;
const ALTURA = 200;

/**
 * Um quadro para a pessoa assinar com o dedo, a caneta ou o mouse. Exporta
 * um PNG pequeno: o servidor guarda a imagem junto da entrega, e o termo em
 * PDF a mostra. Funciona em tela de toque (o evento é pointer, não mouse).
 */
export function SignaturePad({ label = 'Assinatura de quem recebe', required, onChange, resetKey }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const desenhando = useRef(false);
  const [temTraco, setTemTraco] = useState(false);

  function limpar(avisar = true) {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    setTemTraco(false);
    if (avisar) onChange(null);
  }

  // Reseta ao trocar a chave (depois de registrar uma entrega) sem disparar onChange.
  useEffect(() => {
    limpar(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  function ponto(e: React.PointerEvent<HTMLCanvasElement>) {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * LARGURA, y: ((e.clientY - r.top) / r.height) * ALTURA };
  }

  function comecar(e: React.PointerEvent<HTMLCanvasElement>) {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    desenhando.current = true;
    const p = ponto(e);
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#111827';
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  }

  function mover(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!desenhando.current) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const p = ponto(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    if (!temTraco) setTemTraco(true);
  }

  function terminar() {
    if (!desenhando.current) return;
    desenhando.current = false;
    const c = canvasRef.current;
    if (!c) return;
    setTemTraco(true);
    onChange(c.toDataURL('image/png'));
  }

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
          {label}
          {required && <span className="text-[var(--vermelho)]"> *</span>}
        </span>
        <button type="button" onClick={() => limpar()} className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--text-muted)] hover:text-[var(--text)]">
          <Eraser size={12} /> Limpar
        </button>
      </div>
      <div className="relative overflow-hidden rounded-lg border border-dashed border-[var(--border)] bg-white">
        <canvas
          ref={canvasRef}
          width={LARGURA}
          height={ALTURA}
          className="block w-full touch-none select-none"
          style={{ aspectRatio: `${LARGURA} / ${ALTURA}` }}
          onPointerDown={comecar}
          onPointerMove={mover}
          onPointerUp={terminar}
          onPointerCancel={terminar}
          onPointerLeave={terminar}
        />
        {!temTraco && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 text-xs text-slate-400">
            <PenLine size={14} /> Assine aqui
          </span>
        )}
      </div>
    </div>
  );
}
