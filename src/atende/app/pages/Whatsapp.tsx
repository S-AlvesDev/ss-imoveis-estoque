import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Check, QrCode, RefreshCw, RotateCw, Smartphone, Stethoscope, Unplug, Wifi, Wrench, X } from 'lucide-react';
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

/** O que o servidor responde sobre a conexão — sem segredo nenhum: do token só se confere. */
interface Diagnostico {
  instancia: string;
  evolution_configurada: boolean;
  estado_na_evolution?: string | null;
  estado_que_guardamos?: string | null;
  ultimo_evento_em?: string | null;
  /** Há quanto tempo nada chega, e se isso já é demais para o movimento desta empresa. */
  silencio?: { horas_uteis: number; limite: number | null; calado: boolean } | null;
  webhook?: {
    registrado: boolean;
    ligado: boolean | null;
    url: string | null;
    aponta_para_nos: boolean;
    token_confere: boolean;
    eventos: string[] | null;
    recebe_mensagens: boolean | null;
  };
}

export function Whatsapp() {
  const [situacao, setSituacao] = useState<Situacao | null>(null);
  const [agindo, setAgindo] = useState(false);
  const [confirmarDesconexao, setConfirmarDesconexao] = useState(false);
  const [diag, setDiag] = useState<Diagnostico | null>(null);
  const [diagnosticando, setDiagnosticando] = useState(false);

  /** Por que as mensagens não estão chegando: o que a Evolution tem registrado. */
  async function diagnosticar() {
    setDiagnosticando(true);
    try {
      setDiag(await api.get<Diagnostico>('/whatsapp/diagnostico'));
    } catch (e) {
      toast.error(e instanceof ErroDaApi ? e.message : 'Não foi possível diagnosticar.');
    } finally {
      setDiagnosticando(false);
    }
  }

  /**
   * Sacode a sessão. Para o caso em que o diagnóstico dá tudo verde e mesmo
   * assim nada chega: a conexão existe no papel, mas parou de entregar.
   */
  async function reiniciar() {
    setDiagnosticando(true);
    try {
      setDiag(await api.post<Diagnostico>('/whatsapp/reiniciar'));
      toast.success('Sessão reiniciada. Mande uma mensagem de teste: deve chegar em segundos.');
    } catch (e) {
      toast.error(e instanceof ErroDaApi ? e.message : 'Não foi possível reiniciar a sessão.');
    } finally {
      setDiagnosticando(false);
    }
  }

  /** Regrava o webhook com o endereço e o token de agora. Não desconecta o WhatsApp. */
  async function reconfigurar() {
    setDiagnosticando(true);
    try {
      setDiag(await api.post<Diagnostico>('/whatsapp/reconfigurar'));
      toast.success('Webhook reconfigurado. As mensagens devem voltar a chegar na hora.');
    } catch (e) {
      toast.error(e instanceof ErroDaApi ? e.message : 'Não foi possível reconfigurar.');
    } finally {
      setDiagnosticando(false);
    }
  }

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
              <span className="flex gap-2">
                <Botao tamanho="sm" variante="secundaria" carregando={diagnosticando} icone={<Stethoscope size={14} />} onClick={diagnosticar}>
                  Diagnosticar
                </Botao>
                <Botao tamanho="sm" variante="perigo" icone={<Unplug size={14} />} onClick={() => setConfirmarDesconexao(true)}>
                  Desconectar
                </Botao>
              </span>
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

        {/* O resultado do diagnóstico: por que mensagem pode não estar chegando. */}
        {diag && (
          <Cartao className="p-4 sm:p-5">
            <CabecalhoDoCartao
              icone={<Stethoscope size={14} />}
              titulo="Diagnóstico da entrega"
              descricao="Conexão aberta não garante que a mensagem chega até aqui — quem traz é o webhook."
              acoes={<Etiqueta tom={tudoCerto(diag) ? 'verde' : 'vermelho'} ponto tamanho="md">{tudoCerto(diag) ? 'Tudo certo' : 'Há problema'}</Etiqueta>}
            />
            <ul className="mt-3 divide-y divide-[var(--border)] text-sm">
              <Conferencia ok={diag.estado_na_evolution === 'conectada'} titulo="Sessão do WhatsApp aberta" detalhe={`${diag.estado_na_evolution ?? '—'}${diag.estado_que_guardamos && diag.estado_que_guardamos !== diag.estado_na_evolution ? ` (o painel mostrava "${diag.estado_que_guardamos}")` : ''}`} />
              <Conferencia ok={Boolean(diag.webhook?.registrado && diag.webhook?.ligado)} titulo="Webhook registrado e ligado" detalhe={diag.webhook?.url ?? 'nenhum endereço registrado'} />
              <Conferencia ok={Boolean(diag.webhook?.aponta_para_nos)} titulo="Aponta para o Atende Aí" detalhe={diag.webhook?.aponta_para_nos ? 'endereço correto' : 'está apontando para outro lugar'} />
              <Conferencia ok={Boolean(diag.webhook?.token_confere)} titulo="Senha do webhook confere" detalhe={diag.webhook?.token_confere ? 'igual à do servidor' : 'DIFERENTE da do servidor — as entregas estão sendo recusadas'} />
              <Conferencia ok={Boolean(diag.webhook?.recebe_mensagens)} titulo="Recebe o evento de mensagem" detalhe={(diag.webhook?.eventos ?? []).join(', ') || 'nenhum evento'} />
              {diag.silencio && <Conferencia ok={!diag.silencio.calado} titulo="Está chegando mensagem" detalhe={diag.silencio.calado ? `nada desde as ${horaCurta(diag.ultimo_evento_em)} · ${duracaoCurta(diag.silencio.horas_uteis)} de expediente, demais para o movimento de vocês` : `última às ${horaCurta(diag.ultimo_evento_em)} · ${duracaoCurta(diag.silencio.horas_uteis)} de expediente desde então`} />}
            </ul>
            {/* O remédio tem que combinar com o defeito: webhook torto se
                reconfigura, sessão caída se reinicia. Oferecer o botão errado
                faz a pessoa apertar e nada mudar. */}
            {!webhookOk(diag) && (
              <Alerta tom="aviso" className="mt-4" titulo="O webhook está torto" acao={<Botao tamanho="sm" carregando={diagnosticando} icone={<Wrench size={14} />} onClick={reconfigurar}>Reconfigurar</Botao>}>
                Regrava o endereço e a senha do webhook com os de agora. Não desconecta o WhatsApp, não pede QR e não perde mensagem.
              </Alerta>
            )}
            {webhookOk(diag) && diag.estado_na_evolution !== 'conectada' && (
              <Alerta tom="aviso" className="mt-4" titulo={`A sessão está "${diag.estado_na_evolution ?? 'indefinida'}"`} acao={<Botao tamanho="sm" carregando={diagnosticando} icone={<RotateCw size={14} />} onClick={reiniciar}>Reiniciar sessão</Botao>}>
                O webhook está certo — o que não está de pé é a ligação com o WhatsApp. Acabou de reiniciar? Espere um minuto e consulte de novo: reconectar leva alguns segundos. Se não voltar, reinicie de novo.
              </Alerta>
            )}
            {/* O zumbi: sessão e webhook impecáveis, e mesmo assim nada entra.
                Era o caso que a tela não enxergava — dava tudo verde. */}
            {webhookOk(diag) && diag.estado_na_evolution === 'conectada' && diag.silencio?.calado && (
              <Alerta tom="erro" className="mt-4" titulo="A conexão diz estar de pé, mas parou de entregar" acao={<Botao tamanho="sm" carregando={diagnosticando} icone={<RotateCw size={14} />} onClick={reiniciar}>Reiniciar sessão</Botao>}>
                Está tudo certo no papel e nada chega há {duracaoCurta(diag.silencio.horas_uteis)} de expediente — mais do que o normal para o movimento de vocês. É a ligação com o aparelho que caiu sem avisar. Reiniciar religa sem QR e sem perder mensagem; se depois de duas tentativas não voltar, reconecte pelo QR.
              </Alerta>
            )}
            {tudoCerto(diag) && (
              <Alerta tom="ia" className="mt-4" titulo="Está tudo certo e mesmo assim não chega mensagem?" acao={<Botao tamanho="sm" variante="secundaria" carregando={diagnosticando} icone={<RotateCw size={14} />} onClick={reiniciar}>Reiniciar sessão</Botao>}>
                A conexão pode estar viva no papel e ter parado de entregar. Reiniciar refaz a ligação com o WhatsApp e traz o que ficou para trás — sem desconectar o aparelho, sem QR e sem perder mensagem.
              </Alerta>
            )}
            {diag.ultimo_evento_em && (
              <p className="mt-3 text-[11px] leading-4 text-[var(--text-muted)]">
                Última vez que algo chegou por aqui: {new Date(diag.ultimo_evento_em).toLocaleString('pt-BR')}.
                {' '}O tempo de silêncio conta só o expediente (segunda a sábado, 8h às 20h) — fora dele o contador não anda, porque ninguém escrever de madrugada é normal.
              </p>
            )}
          </Cartao>
        )}
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

/**
 * "2,5 h", "40 min", "0 min" — horas de EXPEDIENTE, do jeito que se fala.
 *
 * O zero é dito como zero. Havia aqui um piso de 1 minuto que, às dez da
 * noite, transformava "nenhum minuto útil se passou" em "chegou há 1 min" —
 * exatamente a informação contrária, e justo na hora em que se olha a tela
 * para saber se algo chegou.
 */
function duracaoCurta(h: number): string {
  if (h < 1) return `${Math.round(h * 60)} min`;
  if (h < 24) return `${h.toFixed(1).replace('.', ',')} h`;
  return 'mais de um dia';
}

/** "21:39" — o relógio, para quem está olhando a tela agora. */
function horaCurta(iso: string | null | undefined): string {
  return iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—';
}

/** O webhook está em ordem? (separado da sessão: cada defeito tem o seu remédio) */
function webhookOk(d: Diagnostico): boolean {
  return Boolean(d.webhook?.registrado && d.webhook?.ligado && d.webhook?.aponta_para_nos && d.webhook?.token_confere && d.webhook?.recebe_mensagens);
}

/**
 * Verde só quando nada falta — e "nada falta" inclui estar chegando
 * mensagem. Sem isso a tela dava tudo certo para uma instância que havia
 * parado de entregar horas antes, que foi exatamente o que aconteceu.
 */
function tudoCerto(d: Diagnostico): boolean {
  return d.estado_na_evolution === 'conectada' && !d.silencio?.calado && webhookOk(d);
}

function Conferencia({ ok, titulo, detalhe }: { ok: boolean; titulo: string; detalhe: string }) {
  return (
    <li className="flex items-start gap-2.5 py-2.5">
      {ok ? <Check size={15} className="mt-0.5 shrink-0 text-emerald-600" /> : <X size={15} className="mt-0.5 shrink-0 text-rose-600" />}
      <span className="min-w-0">
        <span className={`block font-medium ${ok ? 'text-[var(--text)]' : 'text-rose-700'}`}>{titulo}</span>
        <span className="block wrap-anywhere text-xs text-[var(--text-muted)]">{detalhe}</span>
      </span>
    </li>
  );
}
