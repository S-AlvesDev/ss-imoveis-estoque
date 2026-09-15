import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Bot, MessageCircle, Send, Wifi, WifiOff } from 'lucide-react';
import { Card } from '@/shared/ui/Card';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { Select } from '@/shared/ui/Field';
import { api } from '@/lib/api';
import { usePlano } from '@/features/planos/usePlano';
import { Cadeado } from '@/features/planos/Cadeado';
import { formatarWhatsapp } from '@/shared/whatsapp';
import type { ManagedUser } from '@/shared/types';
import { NumeroDaEmpresa } from './NumeroDaEmpresa';

interface Status {
  evolution: boolean;
  instancia: string | null;
  ia: boolean;
  liberado: boolean;
  mensagens_no_mes: number;
  limite_mes: number;
  numero: string | null;
}

interface Fala {
  de: 'eu' | 'bot';
  texto: string;
  /** Só no simulador: o motivo técnico quando a IA falhou. */
  erro?: string | null;
}

/**
 * O Stok Aí no WhatsApp, visto pelo administrador: o número para a equipe
 * salvar, o que está ligado, quanto a empresa usou no mês — e um simulador
 * para experimentar como qualquer usuário sem precisar do celular.
 */
export function WhatsappSection() {
  const planoAtual = usePlano();
  const [status, setStatus] = useState<Status | null>(null);
  const [usuarios, setUsuarios] = useState<ManagedUser[]>([]);
  const [userId, setUserId] = useState('');
  const [texto, setTexto] = useState('');
  const [falas, setFalas] = useState<Fala[]>([]);
  const [enviando, setEnviando] = useState(false);
  const fim = useRef<HTMLDivElement>(null);

  const carregar = useCallback(async () => {
    try {
      setStatus(await api.get<Status>('/api/whatsapp/status'));
    } catch {
      setStatus(null);
    }
  }, []);
  useEffect(() => {
    api
      .get<{ users: ManagedUser[] }>('/api/users')
      .then((r) => setUsuarios(r.users))
      .catch(() => setUsuarios([]));
  }, []);
  useEffect(() => {
    carregar();
  }, [carregar]);

  const comWhatsapp = usuarios.filter((u) => u.whatsapp);
  const primeiroId = comWhatsapp[0]?.id;
  useEffect(() => {
    if (!userId && primeiroId) setUserId(String(primeiroId));
  }, [primeiroId, userId]);
  useEffect(() => {
    fim.current?.scrollIntoView({ block: 'end' });
  }, [falas]);

  async function simular(e: React.FormEvent) {
    e.preventDefault();
    const t = texto.trim();
    if (!t || !userId) return;
    setFalas((f) => [...f, { de: 'eu', texto: t }]);
    setTexto('');
    setEnviando(true);
    try {
      const r = await api.post<{ resposta: string; erro: string | null }>('/api/whatsapp/simular', { user_id: Number(userId), texto: t });
      setFalas((f) => [...f, { de: 'bot', texto: r.resposta, erro: r.erro }]);
      carregar();
    } catch (err: any) {
      toast.error(err.message || 'Não foi possível simular.');
    } finally {
      setEnviando(false);
    }
  }

  const conectado = status?.instancia === 'open';
  const liberado = planoAtual.libera('whatsapp');

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Stok Aí no WhatsApp</h2>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          Quem tem o WhatsApp cadastrado em Usuários conversa com o sistema: consulta saldo, pendências e registra saída, transferência e devolução — sempre com confirmação, e só no que o cargo permite.
        </p>
      </div>

      <Card className="p-5">
        {!liberado && <Cadeado texto={planoAtual.porQueNao('whatsapp')} className="mb-4" />}
        <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--verde)]/12 text-[var(--verde)]">
                <MessageCircle size={18} />
              </span>
              <div>
                <p className="text-sm font-bold text-[var(--text)]">{status?.numero ? formatarWhatsapp(status.numero) : 'Número do Stok Aí'}</p>
                <p className="text-[11px] text-[var(--text-muted)]">É para este número que a equipe manda mensagem.</p>
              </div>
            </div>
            <ul className="space-y-1.5 text-xs">
              <li className="flex items-center gap-2">
                {conectado ? <Wifi size={14} className="text-[var(--verde)]" /> : <WifiOff size={14} className="text-[var(--text-muted)]" />}
                <span className="text-[var(--text)]">WhatsApp</span>
                <Badge variant={conectado ? 'success' : status?.evolution ? 'warning' : 'neutral'}>{conectado ? 'conectado' : status?.evolution ? (status.instancia ?? 'desconectado') : 'não configurado'}</Badge>
              </li>
              <li className="flex items-center gap-2">
                <Bot size={14} className={status?.ia ? 'text-[var(--verde)]' : 'text-[var(--text-muted)]'} />
                <span className="text-[var(--text)]">Assistente (IA)</span>
                <Badge variant={status?.ia ? 'success' : 'neutral'}>{status?.ia ? 'ligado' : 'desligado'}</Badge>
              </li>
              <li className="text-[var(--text-muted)]">
                Mensagens neste mês: <strong className="text-[var(--text)]">{status?.mensagens_no_mes ?? 0}</strong> de {status?.limite_mes ?? '—'}.
              </li>
              <li className="text-[var(--text-muted)]">
                Pessoas com WhatsApp cadastrado: <strong className="text-[var(--text)]">{comWhatsapp.length}</strong> de {usuarios.length}.
              </li>
            </ul>
          </div>

          <div className="flex min-h-[260px] flex-col rounded-xl border border-[var(--border)] bg-[var(--bg-2)]">
            <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2">
              <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Simulador</p>
              <Select value={userId} onChange={(e) => setUserId(e.target.value)} className="ml-auto max-w-[220px] py-1 text-xs">
                {comWhatsapp.length === 0 && <option value="">Ninguém com WhatsApp cadastrado</option>}
                {comWhatsapp.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nome} · {formatarWhatsapp(u.whatsapp as string)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto p-3">
              {falas.length === 0 && <p className="text-xs text-[var(--text-muted)]">Escolha quem está falando e mande uma mensagem como se fosse pelo WhatsApp: "quanto tem de cimento?", "saiu 10 sacos de cimento pra obra", "o que está faltando?".</p>}
              {falas.map((f, i) => (
                <div key={i} className={`flex flex-col ${f.de === 'eu' ? 'items-end' : 'items-start'}`}>
                  <p className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${f.de === 'eu' ? 'rounded-br-sm bg-[var(--brand)] text-white' : 'rounded-bl-sm bg-[var(--surface)] text-[var(--text)]'}`}>{f.texto}</p>
                  {f.erro && <p className="mt-1 max-w-[85%] text-[11px] text-rose-500">Motivo (só o administrador vê): {f.erro}</p>}
                </div>
              ))}
              <div ref={fim} />
            </div>
            <form onSubmit={simular} className="flex gap-2 border-t border-[var(--border)] p-2">
              <input
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                disabled={!userId || !liberado}
                placeholder={userId ? 'Mensagem…' : 'Cadastre um WhatsApp em Usuários'}
                className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--brand)] disabled:opacity-50"
              />
              <Button type="submit" size="sm" loading={enviando} disabled={!userId || !texto.trim() || !liberado} icon={enviando ? undefined : <Send size={14} />}>
                Enviar
              </Button>
            </form>
          </div>
        </div>
        <div className="mt-5">
          <NumeroDaEmpresa liberado={liberado} />
        </div>
      </Card>
    </section>
  );
}
