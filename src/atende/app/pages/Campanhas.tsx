import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Megaphone, Send, Users } from 'lucide-react';
import { Botao } from '../ui/Botao';
import { Cartao } from '../ui/Cartao';
import { Etiqueta, EtiquetaColorida } from '../ui/Etiqueta';
import { Modal } from '../ui/Modal';
import { Entrada, AreaDeTexto, Selecao } from '../ui/Campo';
import { Pagina } from '../ui/Pagina';
import { Vazio, Esqueleto } from '../ui/Estados';
import { api, ErroDaApi } from '../lib/api';
import { useCentral } from '../store/central';

interface Destinatario {
  id: string;
  nome: string;
  telefone: string;
}

interface Lote {
  id: string;
  etiqueta_id: string | null;
  titulo: string | null;
  mensagem: string;
  status: 'enviando' | 'concluido' | 'cancelado';
  total: number;
  enviados: number;
  erros: number;
  min_segundos: number;
  max_segundos: number;
  criado_em: string;
}

const PROCESSAR_A_CADA_MS = 5000;

/**
 * Disparo em massa por etiqueta: a mesma mensagem para quem tem uma
 * etiqueta (com a lista revisável — dá para tirar gente), com um intervalo
 * aleatório entre cada envio para não arriscar o número. O ritmo entre
 * mensagens é garantido pelo servidor (a fila tem o horário de cada uma);
 * esta tela só chama "processar" de tempos em tempos enquanto está aberta.
 */
export function Campanhas() {
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [criando, setCriando] = useState(false);
  const [emAndamento, setEmAndamento] = useState<string | null>(null);
  const temporizador = useRef<number | null>(null);

  async function carregar() {
    try {
      const r = await api.get<{ lotes: Lote[] }>('/disparos');
      setLotes(r.lotes);
      const ativo = r.lotes.find((l) => l.status === 'enviando');
      if (ativo) setEmAndamento(ativo.id);
    } catch (err) {
      toast.error(err instanceof ErroDaApi ? err.message : 'Erro ao carregar as campanhas.');
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    void carregar();
  }, []);

  // Enquanto houver um lote "enviando", processa um pedaço a cada poucos segundos.
  useEffect(() => {
    if (!emAndamento) return;
    // Uma chamada por vez: cada processamento envia algumas mensagens e pode
    // demorar mais que o intervalo. Sem esta trava, o relógio empilha chamadas
    // em cima da anterior e o mesmo contato recebe a mensagem repetida.
    let processando = false;
    async function processar() {
      if (processando) return;
      processando = true;
      try {
        const r = await api.post<{ lote: Lote }>(`/disparos/${emAndamento}/processar`);
        setLotes((atual) => atual.map((l) => (l.id === r.lote.id ? r.lote : l)));
        if (r.lote.status !== 'enviando') setEmAndamento(null);
      } catch {
        // Um soluço de rede não pára a campanha — a próxima chamada tenta de novo.
      } finally {
        processando = false;
      }
    }
    void processar();
    temporizador.current = window.setInterval(processar, PROCESSAR_A_CADA_MS);
    return () => {
      if (temporizador.current) window.clearInterval(temporizador.current);
    };
  }, [emAndamento]);

  async function cancelar(loteId: string) {
    try {
      const r = await api.post<{ lote: Lote }>(`/disparos/${loteId}/cancelar`);
      setLotes((atual) => atual.map((l) => (l.id === r.lote.id ? r.lote : l)));
      if (emAndamento === loteId) setEmAndamento(null);
      toast.success('Disparo cancelado — o que já foi enviado continua valendo.');
    } catch (err) {
      toast.error(err instanceof ErroDaApi ? err.message : 'Não foi possível cancelar.');
    }
  }

  return (
    <Pagina
      titulo="Campanhas"
      descricao="Uma mensagem para todo mundo de uma etiqueta, com intervalo seguro entre os envios."
      largura="md"
      acoes={
        <Botao icone={<Megaphone size={15} />} onClick={() => setCriando(true)}>
          Nova campanha
        </Botao>
      }
    >
      {carregando ? (
        <div className="space-y-3">
          <Esqueleto className="h-24" />
          <Esqueleto className="h-24" />
        </div>
      ) : lotes.length === 0 ? (
        <Cartao>
          <Vazio icone={<Megaphone size={22} />} titulo="Nenhuma campanha ainda" texto="Marque clientes com uma etiqueta e mande a mesma mensagem para todo mundo dela de uma vez." />
        </Cartao>
      ) : (
        <div className="space-y-3">
          {lotes.map((l) => (
            <CartaoDoLote key={l.id} lote={l} onCancelar={() => cancelar(l.id)} />
          ))}
        </div>
      )}

      {criando && (
        <NovaCampanha
          onCriada={(lote) => {
            setLotes((atual) => [lote, ...atual]);
            setEmAndamento(lote.id);
            setCriando(false);
          }}
          onClose={() => setCriando(false)}
        />
      )}
    </Pagina>
  );
}

function CartaoDoLote({ lote, onCancelar }: { lote: Lote; onCancelar: () => void }) {
  const pct = lote.total > 0 ? Math.round(((lote.enviados + lote.erros) / lote.total) * 100) : 0;
  const tom = lote.status === 'concluido' ? 'verde' : lote.status === 'cancelado' ? 'cinza' : 'azul';
  const rotulo = lote.status === 'concluido' ? 'Concluído' : lote.status === 'cancelado' ? 'Cancelado' : 'Enviando…';
  return (
    <Cartao className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[var(--text)]">{lote.titulo || 'Campanha sem título'}</p>
          <p className="mt-0.5 line-clamp-2 text-xs text-[var(--text-muted)]">{lote.mensagem}</p>
        </div>
        <Etiqueta tom={tom} ponto pulsa={lote.status === 'enviando'}>
          {rotulo}
        </Etiqueta>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--bg-2)]">
        <div className="h-full rounded-full bg-[var(--brand)] transition-[width] duration-500" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-[var(--text-muted)]">
        <span>
          {lote.enviados} de {lote.total} enviados{lote.erros > 0 ? ` · ${lote.erros} com erro` : ''}
        </span>
        {lote.status === 'enviando' && (
          <button type="button" onClick={onCancelar} className="font-semibold text-rose-600 hover:underline">
            Cancelar o restante
          </button>
        )}
      </div>
    </Cartao>
  );
}

function NovaCampanha({ onCriada, onClose }: { onCriada: (lote: Lote) => void; onClose: () => void }) {
  const etiquetas = useCentral((s) => s.etiquetas);
  const carregarEtiquetas = useCentral((s) => s.carregarEtiquetas);
  const [etiquetaId, setEtiquetaId] = useState('');
  const [carregandoClientes, setCarregandoClientes] = useState(false);
  const [destinatarios, setDestinatarios] = useState<Destinatario[]>([]);
  const [escolhidos, setEscolhidos] = useState<Set<string>>(new Set());
  const [titulo, setTitulo] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (etiquetas.length === 0) void carregarEtiquetas();
  }, [etiquetas.length, carregarEtiquetas]);

  useEffect(() => {
    if (!etiquetaId) {
      setDestinatarios([]);
      setEscolhidos(new Set());
      return;
    }
    setCarregandoClientes(true);
    api
      .get<{ clientes: Destinatario[] }>(`/etiquetas/${etiquetaId}/clientes`)
      .then((r) => {
        setDestinatarios(r.clientes);
        setEscolhidos(new Set(r.clientes.map((c) => c.id)));
      })
      .catch((err) => toast.error(err instanceof ErroDaApi ? err.message : 'Erro ao carregar os clientes da etiqueta.'))
      .finally(() => setCarregandoClientes(false));
  }, [etiquetaId]);

  function alternar(id: string) {
    setEscolhidos((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  const nomeDaEtiqueta = etiquetas.find((e) => e.id === etiquetaId)?.nome ?? '';
  const estimativaSegundos = escolhidos.size > 1 ? (escolhidos.size - 1) * 14 : 0; // média do intervalo padrão (8–20s)
  const estimativaTexto = estimativaSegundos < 60 ? `${estimativaSegundos}s` : `${Math.round(estimativaSegundos / 60)} min`;

  async function iniciar() {
    if (!mensagem.trim()) return toast.error('Escreva a mensagem.');
    if (escolhidos.size === 0) return toast.error('Escolha pelo menos um destinatário.');
    setEnviando(true);
    try {
      const r = await api.post<{ lote: Lote }>('/disparos', {
        etiquetaId: etiquetaId || null,
        titulo: titulo || (nomeDaEtiqueta ? `Etiqueta: ${nomeDaEtiqueta}` : null),
        clienteIds: [...escolhidos],
        mensagem,
      });
      toast.success(`Disparo iniciado para ${r.lote.total} pessoas.`);
      onCriada(r.lote);
    } catch (err) {
      toast.error(err instanceof ErroDaApi ? err.message : 'Não foi possível iniciar o disparo.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal
      aberto
      onFechar={onClose}
      titulo="Nova campanha"
      descricao="Escolha a etiqueta, revise quem recebe e escreva a mensagem. O envio respeita um intervalo seguro entre cada pessoa."
      largura="lg"
      rodape={
        <>
          <Botao variante="fantasma" onClick={onClose}>
            Cancelar
          </Botao>
          <Botao icone={<Send size={15} />} onClick={iniciar} carregando={enviando} disabled={!etiquetaId || escolhidos.size === 0 || !mensagem.trim()}>
            Iniciar disparo ({escolhidos.size})
          </Botao>
        </>
      }
    >
      <div className="space-y-4">
        <Selecao rotulo="Etiqueta" required value={etiquetaId} onChange={(e) => setEtiquetaId(e.target.value)}>
          <option value="">Escolha uma etiqueta…</option>
          {etiquetas.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nome}
            </option>
          ))}
        </Selecao>

        {etiquetaId && (
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <p className="text-xs font-semibold text-[var(--text)]">
                Destinatários <span className="font-normal text-[var(--text-muted)]">({escolhidos.size} de {destinatarios.length})</span>
              </p>
              {nomeDaEtiqueta && <EtiquetaColorida cor={etiquetas.find((e) => e.id === etiquetaId)?.cor ?? '#7c3aed'}>{nomeDaEtiqueta}</EtiquetaColorida>}
            </div>
            {carregandoClientes ? (
              <Esqueleto className="h-32" />
            ) : destinatarios.length === 0 ? (
              <Cartao className="p-4">
                <Vazio compacto icone={<Users size={18} />} titulo="Ninguém com essa etiqueta ainda" />
              </Cartao>
            ) : (
              <div className="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-[var(--border)] p-2">
                {destinatarios.map((d) => (
                  <label key={d.id} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm hover:bg-[var(--bg-2)]">
                    <input type="checkbox" checked={escolhidos.has(d.id)} onChange={() => alternar(d.id)} className="h-4 w-4 rounded border-[var(--border-strong)] accent-[var(--brand)]" />
                    <span className="min-w-0 flex-1 truncate text-[var(--text)]">{d.nome}</span>
                    <span className="shrink-0 font-mono text-xs text-[var(--text-muted)]">+{d.telefone}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        <Entrada rotulo="Título da campanha" ajuda="Só para você identificar depois — não vai na mensagem." value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder={nomeDaEtiqueta ? `Etiqueta: ${nomeDaEtiqueta}` : 'Ex.: Imóvel novo — Aluguel'} maxLength={80} />
        <AreaDeTexto rotulo="Mensagem" ajuda="Use {nome} para o primeiro nome de cada pessoa." required rows={4} value={mensagem} onChange={(e) => setMensagem(e.target.value)} placeholder="Oi {nome}! Chegou um imóvel novo que combina com o que você procura…" maxLength={1000} />

        {escolhidos.size > 1 && (
          <p className="rounded-xl bg-[var(--bg)] px-3 py-2 text-xs text-[var(--text-muted)]">
            Tempo estimado do disparo: <strong className="text-[var(--text)]">{estimativaTexto}</strong> — 8 a 20 segundos entre cada envio, para não arriscar o número.
          </p>
        )}
      </div>
    </Modal>
  );
}
