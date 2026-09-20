import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Bell, BellOff, Smartphone, Volume2, VolumeX } from 'lucide-react';
import { Botao } from '../ui/Botao';
import { Cartao, CabecalhoDoCartao } from '../ui/Cartao';
import { Etiqueta } from '../ui/Etiqueta';
import { api } from '../lib/api';
import { ativarNotificacoes, desativarNotificacoes, estadoDasNotificacoes, ehIphoneNoNavegador, somLigado, definirSom, tocarAviso, type EstadoDasNotificacoes } from '../notificacoes';

/**
 * O cartão de notificações da conta: o que este aparelho recebe, ligar e
 * desligar o push, o som na aba, e como instalar no celular.
 */
export function CartaoDeNotificacoes() {
  const [estado, setEstado] = useState<EstadoDasNotificacoes | null>(null);
  const [servidor, setServidor] = useState<{ configurado: boolean; inscricoes: number } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [som, setSom] = useState(somLigado());
  const iphone = ehIphoneNoNavegador();

  async function carregar() {
    setEstado(await estadoDasNotificacoes());
    try {
      setServidor(await api.get<{ configurado: boolean; inscricoes: number }>('/push'));
    } catch {
      setServidor(null);
    }
  }
  useEffect(() => {
    void carregar();
  }, []);

  async function alternar() {
    setOcupado(true);
    try {
      if (estado === 'ativas') {
        await desativarNotificacoes();
        toast.success('Notificações desativadas neste aparelho.');
      } else {
        await ativarNotificacoes();
        toast.success('Notificações ativadas neste aparelho.');
      }
    } catch (e: any) {
      toast.error(e.message || 'Não foi possível.');
    } finally {
      setOcupado(false);
      await carregar();
    }
  }

  function alternarSom() {
    const novo = !som;
    definirSom(novo);
    setSom(novo);
    if (novo) tocarAviso();
  }

  const ativas = estado === 'ativas';
  const rotuloDoEstado = estado === null ? '…' : ativas ? 'ativas' : estado === 'negadas' ? 'bloqueadas pelo navegador' : estado === 'sem_suporte' ? 'sem suporte' : 'desligadas';
  return (
    <Cartao className="space-y-4 p-4 sm:p-5">
      <CabecalhoDoCartao icone={<Bell size={14} />} titulo="Notificações" descricao="Aviso quando um cliente responde, chega conversa nova para você ou para a sua fila, ou alguém transfere uma conversa para você." acoes={estado !== null && <Etiqueta tom={ativas ? 'verde' : estado === 'negadas' ? 'vermelho' : 'cinza'} ponto={ativas}>{rotuloDoEstado}</Etiqueta>} />

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3.5">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${ativas ? 'bg-emerald-50 text-emerald-600' : 'bg-[var(--bg-2)] text-[var(--text-muted)]'}`}>{ativas ? <Bell size={18} /> : <BellOff size={18} />}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-[var(--text)]">Neste aparelho: {rotuloDoEstado}</span>
          <span className="block text-xs leading-5 text-[var(--text-muted)]">
            {ativas ? 'Chegam mesmo com o Atende fechado.' : estado === 'negadas' ? 'Libere as notificações do site nas configurações do navegador e tente de novo.' : estado === 'sem_suporte' ? (iphone ? 'No iPhone, instale o Atende (abaixo) e ative por lá.' : 'Este navegador não tem notificações por push.') : servidor && !servidor.configurado ? 'O push não está configurado neste servidor.' : 'Ligue para receber mesmo com o Atende fechado.'}
            {servidor && servidor.inscricoes > 0 ? ` · ${servidor.inscricoes} ${servidor.inscricoes === 1 ? 'aparelho ativo' : 'aparelhos ativos'} na sua conta` : ''}
          </span>
        </span>
        {estado !== 'sem_suporte' && estado !== 'negadas' && (
          <Botao tamanho="sm" variante={ativas ? 'secundaria' : 'primaria'} carregando={ocupado} onClick={alternar} disabled={Boolean(servidor && !servidor.configurado && !ativas)}>
            {ativas ? 'Desativar' : 'Ativar'}
          </Botao>
        )}
      </div>

      <button type="button" onClick={alternarSom} aria-pressed={som} className="flex w-full items-center gap-3 rounded-xl border border-[var(--border)] p-3.5 text-left transition-colors hover:bg-[var(--bg)]">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--brand-soft)] text-[var(--brand)]">{som ? <Volume2 size={18} /> : <VolumeX size={18} />}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-[var(--text)]">Som na aba aberta: {som ? 'ligado' : 'desligado'}</span>
          <span className="block text-xs leading-5 text-[var(--text-muted)]">Um toque curto quando chega novidade sua, com o Atende aberto.</span>
        </span>
        <span className="text-xs font-semibold text-[var(--brand)]">{som ? 'desligar' : 'ligar'}</span>
      </button>

      <div className="flex items-start gap-3 rounded-xl border border-dashed border-[var(--border-strong)] p-3.5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--bg-2)] text-[var(--text-muted)]">
          <Smartphone size={18} />
        </span>
        <span className="min-w-0 text-xs leading-5 text-[var(--text-muted)]">
          <span className="block text-sm font-semibold text-[var(--text)]">Instalar no celular</span>
          <span className="block">
            <strong>Android (Chrome):</strong> menu ⋮ → <em>Instalar aplicativo</em> (ou "Adicionar à tela inicial"). <strong>iPhone (Safari):</strong> compartilhar <span aria-hidden>⎋</span> → <em>Adicionar à Tela de Início</em>; as notificações só funcionam pelo app instalado.
          </span>
        </span>
      </div>
    </Cartao>
  );
}
