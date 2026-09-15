import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Building2, QrCode, Unplug, Wifi } from 'lucide-react';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { Modal } from '@/shared/ui/Modal';
import { api } from '@/lib/api';

interface Estado {
  instancia: string | null;
  estado: string | null;
  qr: { base64: string | null; codigo: string | null } | null;
}

/**
 * O WhatsApp da própria empresa: cotações, pedidos e avisos saem do
 * número dela, não do número do Stok Aí. Conecta como "aparelho
 * conectado", pelo QR — igual ao WhatsApp Web.
 */
export function NumeroDaEmpresa({ liberado }: { liberado: boolean }) {
  const [e, setE] = useState<Estado | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [qrAberto, setQrAberto] = useState(false);
  const [confirmando, setConfirmando] = useState(false);

  const carregar = useCallback(async () => {
    try {
      setE(await api.get<Estado>('/api/whatsapp/empresa'));
    } catch {
      setE(null);
    }
  }, []);
  useEffect(() => {
    carregar();
  }, [carregar]);

  // Com o QR na tela, confere a cada 3 s se o celular já leu; o QR também se renova.
  useEffect(() => {
    if (!qrAberto) return;
    const t = setInterval(carregar, 3000);
    return () => clearInterval(t);
  }, [qrAberto, carregar]);
  useEffect(() => {
    if (qrAberto && e?.estado === 'open') {
      setQrAberto(false);
      toast.success('Número da empresa conectado! As cotações e avisos passam a sair dele.');
    }
  }, [e?.estado, qrAberto]);

  async function conectar() {
    setOcupado(true);
    try {
      const r = await api.post<Estado>('/api/whatsapp/empresa/conectar', {});
      setE(r);
      if (r.estado === 'open') toast.success('Já está conectado.');
      else setQrAberto(true);
    } catch (err: any) {
      toast.error(err.message || 'Não foi possível conectar.');
    } finally {
      setOcupado(false);
    }
  }

  async function desconectar() {
    setOcupado(true);
    try {
      await api.delete('/api/whatsapp/empresa');
      setConfirmando(false);
      toast.success('Desconectado. Voltamos a usar o número do Stok Aí.');
      await carregar();
    } catch (err: any) {
      toast.error(err.message || 'Não foi possível desconectar.');
    } finally {
      setOcupado(false);
    }
  }

  const conectado = e?.estado === 'open';
  const temInstancia = Boolean(e?.instancia);

  return (
    <div className="rounded-xl border border-[var(--border)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--brand)]/12 text-[var(--brand)]">
            <Building2 size={16} />
          </span>
          <div>
            <p className="text-sm font-bold text-[var(--text)]">
              Número da sua empresa{' '}
              {temInstancia && <Badge variant={conectado ? 'success' : 'warning'}>{conectado ? 'conectado' : 'aguardando QR'}</Badge>}
            </p>
            <p className="text-[11px] text-[var(--text-muted)]">
              {conectado
                ? 'Cotações, pedidos e avisos saem do WhatsApp da empresa. Clientes que escrevem nele não recebem resposta automática.'
                : 'Opcional. Conecte o WhatsApp da empresa (como um aparelho conectado) e as cotações aos fornecedores saem dele, em vez do número do Stok Aí.'}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {temInstancia && !conectado && (
            <Button size="sm" variant="outline" icon={<QrCode size={13} />} onClick={() => setQrAberto(true)}>
              Ver QR
            </Button>
          )}
          {temInstancia ? (
            <Button size="sm" variant="ghost" icon={<Unplug size={13} />} onClick={() => setConfirmando(true)} disabled={ocupado}>
              Desconectar
            </Button>
          ) : (
            <Button size="sm" icon={<Wifi size={13} />} onClick={conectar} loading={ocupado} disabled={!liberado}>
              Conectar número da empresa
            </Button>
          )}
        </div>
      </div>

      <Modal open={qrAberto} onClose={() => setQrAberto(false)} title="Conectar o WhatsApp da empresa" subtitle="No celular da empresa: WhatsApp → ⋮ → Aparelhos conectados → Conectar aparelho → aponte para o código.">
        <div className="flex flex-col items-center gap-3">
          {e?.qr?.base64 ? (
            <img src={e.qr.base64} alt="QR code para conectar" className="h-64 w-64 rounded-lg bg-white p-2" />
          ) : (
            <p className="py-10 text-sm text-[var(--text-muted)]">Gerando o código…</p>
          )}
          {e?.qr?.codigo && <p className="font-mono text-xs text-[var(--text-muted)]">Código de pareamento: {e.qr.codigo}</p>}
          <p className="text-center text-[11px] text-[var(--text-muted)]">O código se renova sozinho. Assim que o celular ler, esta janela fecha.</p>
        </div>
      </Modal>

      <Modal
        open={confirmando}
        onClose={() => setConfirmando(false)}
        title="Desconectar o número da empresa?"
        subtitle="As cotações e avisos voltam a sair do número do Stok Aí. Cotações abertas continuam recebendo respostas."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmando(false)}>Cancelar</Button>
            <Button variant="danger" onClick={desconectar} loading={ocupado}>Desconectar</Button>
          </>
        }
      >
        <p className="text-sm text-[var(--text-muted)]">O WhatsApp da empresa continua funcionando normalmente no celular; só deixa de estar ligado ao Stok Aí.</p>
      </Modal>
    </div>
  );
}
