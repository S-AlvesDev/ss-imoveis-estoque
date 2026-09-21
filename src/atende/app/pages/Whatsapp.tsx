import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { QrCode, RefreshCw, Smartphone, Unplug, Wifi } from 'lucide-react';
import { Botao } from '../ui/Botao';
import { Cartao, CabecalhoDoCartao } from '../ui/Cartao';
import { Etiqueta, type TomDaEtiqueta } from '../ui/Etiqueta';
import { Modal } from '../ui/Modal';
import { Pagina } from '../ui/Pagina';
import { Alerta, Esqueleto } from '../ui/Estados';
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

const NOME_DO_ESTADO_DA_CONEXAO: Record<Conexao['estado'], { texto: string; tom: TomDaEtiqueta }> = {
  conectada: { texto: 'Conectado', tom: 'verde' },
  conectando: { texto: 'Conectando…', tom: 'ambar' },
  aguardando_qr: { texto: 'Aguardando QR', tom: 'ambar' },
  desconectada: { texto: 'Desconectado', tom: 'vermelho' },
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
    <Pagina titulo="WhatsApp da empresa" descricao="O número que os clientes usam. Conecte pelo QR, como no WhatsApp Web — a central passa a receber e responder por ele." largura="md" acoes={situacao ? <Botao tamanho="sm" variante="secundaria" icone={<RefreshCw size={14} />} onClick={consultar}>Atualizar</Botao> : undefined}>
      <div className="space-y-4">
        {situacao && !situacao.evolution && (
          <Alerta tom="aviso" titulo="Infraestrutura do WhatsApp não configurada">
            A Evolution API não está configurada neste servidor. Fale com a equipe do Atende Aí.
          </Alerta>
        )}

        <Cartao className="p-4 sm:p-5">
          <CabecalhoDoCartao icone={<Smartphone size={14} />} titulo="Conexão" descricao="Uma instância própria da empresa, só sua." acoes={estado && <Etiqueta tom={estado.tom} ponto pulsa={c?.estado === 'conectando' || c?.estado === 'aguardando_qr'} tamanho="md">{estado.texto}</Etiqueta>} />
          {!situacao ? (
            <div className="mt-4 grid gap-5 sm:grid-cols-[220px_1fr]">
              <Esqueleto className="h-[220px] w-[220px] rounded-2xl" />
              <div className="space-y-2">
                <Esqueleto className="h-3 w-3/4" />
                <Esqueleto className="h-3 w-2/3" />
                <Esqueleto className="h-3 w-1/2" />
              </div>
            </div>
          ) : c?.estado === 'conectada' ? (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-emerald-600 shadow-sm">
                  <Wifi size={20} />
                </span>
                <div>
                  <p className="text-sm font-semibold text-[var(--text)]">{c.numero ? `+${c.numero}` : 'Número conectado'}</p>
                  <p className="text-xs text-[var(--text-muted)]">
                    {c.conectado_em ? `Conectado em ${new Date(c.conectado_em).toLocaleString('pt-BR')}` : 'Conectado'}
                  </p>
                </div>
              </div>
              <Botao tamanho="sm" variante="perigo" icone={<Unplug size={14} />} onClick={() => setConfirmarDesconexao(true)}>
                Desconectar
              </Botao>
            </div>
          ) : (
            <div className="mt-4 grid gap-5 sm:grid-cols-[220px_1fr]">
              <div className="mx-auto flex h-[220px] w-[220px] items-center justify-center rounded-2xl border border-[var(--border)] bg-white p-2 shadow-[var(--sombra-cartao)] sm:mx-0">
                {situacao.qr?.base64 ? (
                  <img src={situacao.qr.base64} alt="QR Code para conectar o WhatsApp" className="h-full w-full" />
                ) : (
                  <div className="flex flex-col items-center gap-2 text-center text-xs text-[var(--text-muted)]">
                    <QrCode size={40} className="text-[var(--text-disable)]" />
                    {c ? 'Gerando QR…' : 'Clique em Conectar para gerar o QR'}
                  </div>
                )}
              </div>
              <div className="text-sm text-[var(--text)]">
                <ol className="space-y-2">
                  {['No celular da empresa, abra o WhatsApp → Dispositivos conectados.', 'Toque em Conectar um dispositivo.', 'Aponte para o QR ao lado. Ele se renova sozinho enquanto espera.'].map((passo, i) => (
                    <li key={i} className="flex items-start gap-2.5">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--brand-soft)] text-[11px] font-semibold text-[var(--brand-ink)]">{i + 1}</span>
                      <span className="leading-5">{passo}</span>
                    </li>
                  ))}
                </ol>
                {situacao.qr?.codigo && (
                  <p className="mt-3 text-xs text-[var(--text-muted)]">
                    Ou use o código de pareamento: <code className="rounded-md bg-[var(--bg-2)] px-1.5 py-0.5 font-mono font-semibold text-[var(--text)]">{situacao.qr.codigo}</code>
                  </p>
                )}
                <div className="mt-4 flex flex-wrap gap-2">
                  <Botao icone={<QrCode size={15} />} carregando={agindo} onClick={conectar} disabled={!situacao.evolution}>
                    {c ? 'Gerar novo QR' : 'Conectar WhatsApp'}
                  </Botao>
                  {c && (
                    <Botao variante="secundaria" icone={<RefreshCw size={14} />} onClick={consultar}>
                      Já escaneei
                    </Botao>
                  )}
                </div>
                <p className="mt-3 text-xs leading-5 text-[var(--text-muted)]">Use um número dedicado ao atendimento. O WhatsApp do celular continua funcionando; o que for enviado por ele também aparece na central.</p>
              </div>
            </div>
          )}
        </Cartao>
      </div>

      <Modal
        aberto={confirmarDesconexao}
        onFechar={() => setConfirmarDesconexao(false)}
        titulo="Desconectar o WhatsApp?"
        descricao="A central deixa de receber e enviar por este número até conectar de novo. O histórico continua."
        largura="sm"
        rodape={
          <>
            <Botao variante="fantasma" onClick={() => setConfirmarDesconexao(false)}>
              Cancelar
            </Botao>
            <Botao variante="perigo" carregando={agindo} onClick={desconectar}>
              Desconectar
            </Botao>
          </>
        }
      >
        <span />
      </Modal>
    </Pagina>
  );
}
