import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Bell, BellOff, Smartphone, Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/shared/ui/Button';
import { Card, CardHeader } from '@/shared/ui/Card';
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
  return (
    <Card className="space-y-4 p-5">
      <CardHeader icon={<Bell size={14} />} title="Notificações" />
      <p className="text-sm text-[var(--text-muted)]">Aviso quando um cliente responde, chega conversa nova para você ou para a sua fila, ou alguém transfere uma conversa para você.</p>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-2)] p-3">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${ativas ? 'bg-[var(--verde)]/12 text-[var(--verde)]' : 'bg-[var(--text-muted)]/10 text-[var(--text-muted)]'}`}>{ativas ? <Bell size={17} /> : <BellOff size={17} />}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-[var(--text)]">Neste aparelho: {estado === null ? '…' : ativas ? 'ativas' : estado === 'negadas' ? 'bloqueadas pelo navegador' : estado === 'sem_suporte' ? 'sem suporte' : 'desligadas'}</span>
          <span className="block text-xs text-[var(--text-muted)]">
            {ativas ? 'Chegam mesmo com o Atende fechado.' : estado === 'negadas' ? 'Libere as notificações do site nas configurações do navegador e tente de novo.' : estado === 'sem_suporte' ? (iphone ? 'No iPhone, instale o Atende (abaixo) e ative por lá.' : 'Este navegador não tem notificações por push.') : servidor && !servidor.configurado ? 'O push não está configurado neste servidor.' : 'Ligue para receber mesmo com o Atende fechado.'}
            {servidor && servidor.inscricoes > 0 ? ` · ${servidor.inscricoes} ${servidor.inscricoes === 1 ? 'aparelho ativo' : 'aparelhos ativos'} na sua conta` : ''}
          </span>
        </span>
        {estado !== 'sem_suporte' && estado !== 'negadas' && (
          <Button size="sm" variant={ativas ? 'outline' : 'primary'} loading={ocupado} onClick={alternar} disabled={Boolean(servidor && !servidor.configurado && !ativas)}>
            {ativas ? 'Desativar' : 'Ativar'}
          </Button>
        )}
      </div>

      <button type="button" onClick={alternarSom} className="flex w-full items-center gap-3 rounded-xl border border-[var(--border)] p-3 text-left hover:bg-[var(--bg-2)]">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--brand)]/12 text-[var(--brand)]">{som ? <Volume2 size={17} /> : <VolumeX size={17} />}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-[var(--text)]">Som na aba aberta: {som ? 'ligado' : 'desligado'}</span>
          <span className="block text-xs text-[var(--text-muted)]">Um toque curto quando chega novidade sua, com o Atende aberto.</span>
        </span>
        <span className="text-xs font-semibold text-[var(--brand)]">{som ? 'desligar' : 'ligar'}</span>
      </button>

      <div className="flex items-start gap-3 rounded-xl border border-dashed border-[var(--border)] p-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-2)] text-[var(--text-muted)]">
          <Smartphone size={17} />
        </span>
        <span className="text-xs text-[var(--text-muted)]">
          <span className="block text-sm font-semibold text-[var(--text)]">Instalar no celular</span>
          <span className="block">
            <strong>Android (Chrome):</strong> menu ⋮ → <em>Instalar aplicativo</em> (ou "Adicionar à tela inicial"). <strong>iPhone (Safari):</strong> compartilhar <span aria-hidden>⎋</span> → <em>Adicionar à Tela de Início</em>; as notificações só funcionam pelo app instalado.
          </span>
        </span>
      </div>
    </Card>
  );
}
