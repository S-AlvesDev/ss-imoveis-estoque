import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { QrCode, RefreshCw, Smartphone, Unplug, Wifi } from 'lucide-react';
import { Button } from '@/shared/ui/Button';
import { Card, CardHeader } from '@/shared/ui/Card';
import { Badge } from '@/shared/ui/Badge';
import { Modal } from '@/shared/ui/Modal';
import { api, ErroDaApi } from '../lib/api';
import type { Conexao } from '../../shared/tipos';

/**
 * O WhatsApp da empresa: conectar por QR Code (uma instância própria na
 * Evolution), ver o estado e desconectar. Enquanto não conecta, o QR se
 * renova sozinho — o do WhatsApp vence em ~40 s.
 */
interface Situacao {
  conexao: Conexao | null;
  qr: { base64: string | null; codigo: string | null } | null;
  evolution: boolean;
}

const NOME_DO_ESTADO_DA_CONEXAO: Record<Conexao['estado'], { texto: string; variant: 'success' | 'warning' | 'neutral' | 'critical' }> = {
  conectada: { texto: 'Conectado', variant: 'success' },
  conectando: { texto: 'Conectando…', variant: 'warning' },
  aguardando_qr: { texto: 'Aguardando QR', variant: 'warning' },
  desconectada: { texto: 'Desconectado', variant: 'critical' },
};

export function Whatsapp() {
  const [situacao, setSituacao] = useState<Situacao | null>(null);
  const [agindo, setAgindo] = useState(false);
  const [confirmarDesconexao, setConfirmarDesconexao] = useState(false);

  const consultar = useCallback(async () => {
    try {
      setSituacao(await api.get<Situacao>('/whatsapp'));
    } catch (err) {
      toast.error(err instanceof ErroDaApi ? err.message : 'Não foi possível consultar o WhatsApp.');
    }
  }, []);

  useEffect(() => {
    void consultar();
  }, [consultar]);

  // Com QR na tela, renova a cada 20 s até conectar.
  const aguardando = Boolean(situacao?.conexao && situacao.conexao.estado !== 'conectada' && situacao.conexao.estado !== 'desconectada');
  useEffect(() => {
    if (!aguardando) return;
    const t = setInterval(consultar, 20_000);
    return () => clearInterval(t);
  }, [aguardando, consultar]);

  async function conectar() {
    setAgindo(true);
    try {
      const r = await api.post<{ conexao: Conexao; qr: Situacao['qr'] }>('/whatsapp/conectar');
      setSituacao((s) => ({ conexao: r.conexao, qr: r.qr, evolution: s?.evolution ?? true }));
      if (r.conexao.estado === 'conectada') toast.success('WhatsApp conectado.');
    } catch (err) {
      toast.error(err instanceof ErroDaApi ? err.message : 'Não foi possível iniciar a conexão.');
    } finally {
      setAgindo(false);
    }
  }

  async function desconectar() {
    setAgindo(true);
    try {
      await api.delete('/whatsapp');
      setConfirmarDesconexao(false);
      toast.success('WhatsApp desconectado.');
      await consultar();
    } catch (err) {
      toast.error(err instanceof ErroDaApi ? err.message : 'Não foi possível desconectar.');
    } finally {
      setAgindo(false);
    }
  }

  const c = situacao?.conexao ?? null;
  const estado = c ? NOME_DO_ESTADO_DA_CONEXAO[c.estado] : null;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-[var(--text)]">WhatsApp da empresa</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">O número que os clientes usam. Conecte pelo QR, como no WhatsApp Web — a central passa a receber e responder por ele.</p>
      </div>

      {situacao && !situacao.evolution && (
        <Card className="border-amber-400/40 bg-amber-100/60 p-4 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">A infraestrutura de WhatsApp (Evolution API) não está configurada neste servidor. Fale com a equipe do Atende Aí.</Card>
      )}

      <Card className="p-5">
        <CardHeader icon={<Smartphone size={18} />} title="Conexão" actions={estado && <Badge variant={estado.variant} dot>{estado.texto}</Badge>} />
        {!situacao ? (
          <p className="mt-3 text-sm text-[var(--text-muted)]">Consultando…</p>
        ) : c?.estado === 'conectada' ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600">
                <Wifi size={20} />
              </span>
              <div>
                <p className="text-sm font-bold text-[var(--text)]">{c.numero ? `+${c.numero}` : 'Número conectado'}</p>
                <p className="text-xs text-[var(--text-muted)]">{c.conectado_em ? `Conectado em ${new Date(c.conectado_em).toLocaleString('pt-BR')}` : 'Conectado'} · instância {c.instancia}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" icon={<RefreshCw size={14} />} onClick={consultar}>
                Atualizar
              </Button>
              <Button size="sm" variant="danger" icon={<Unplug size={14} />} onClick={() => setConfirmarDesconexao(true)}>
                Desconectar
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-3 grid gap-5 sm:grid-cols-[220px_1fr]">
            <div className="flex h-[220px] w-[220px] items-center justify-center rounded-2xl border border-[var(--border)] bg-white p-2">
              {situacao.qr?.base64 ? (
                <img src={situacao.qr.base64} alt="QR Code para conectar o WhatsApp" className="h-full w-full" />
              ) : (
                <div className="flex flex-col items-center gap-2 text-center text-xs text-slate-400">
                  <QrCode size={40} />
                  {c ? 'Gerando QR…' : 'Clique em Conectar para gerar o QR'}
                </div>
              )}
            </div>
            <div className="text-sm text-[var(--text)]">
              <ol className="list-decimal space-y-1.5 pl-5">
                <li>No celular da empresa, abra o WhatsApp → <strong>Dispositivos conectados</strong>.</li>
                <li>Toque em <strong>Conectar um dispositivo</strong>.</li>
                <li>Aponte para o QR ao lado. Ele se renova sozinho enquanto espera.</li>
              </ol>
              {situacao.qr?.codigo && (
                <p className="mt-3 text-xs text-[var(--text-muted)]">
                  Ou use o código de pareamento: <code className="rounded bg-[var(--bg-2)] px-1.5 py-0.5 font-mono font-bold text-[var(--text)]">{situacao.qr.codigo}</code>
                </p>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                <Button icon={<QrCode size={15} />} loading={agindo} onClick={conectar} disabled={!situacao.evolution}>
                  {c ? 'Gerar novo QR' : 'Conectar WhatsApp'}
                </Button>
                {c && (
                  <Button variant="ghost" icon={<RefreshCw size={14} />} onClick={consultar}>
                    Já escaneei
                  </Button>
                )}
              </div>
              <p className="mt-3 text-xs text-[var(--text-muted)]">Use um número dedicado ao atendimento. O WhatsApp do celular continua funcionando; o que for enviado por ele também aparece na central.</p>
            </div>
          </div>
        )}
      </Card>

      <Modal
        open={confirmarDesconexao}
        onClose={() => setConfirmarDesconexao(false)}
        title="Desconectar o WhatsApp?"
        subtitle="A central deixa de receber e enviar por este número até conectar de novo. O histórico continua."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmarDesconexao(false)}>
              Cancelar
            </Button>
            <Button variant="danger" loading={agindo} onClick={desconectar}>
              Desconectar
            </Button>
          </>
        }
      >
        <span />
      </Modal>
    </div>
  );
}
