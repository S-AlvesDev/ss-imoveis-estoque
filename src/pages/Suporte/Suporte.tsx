import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { LifeBuoy, Package, Plus, ShieldAlert } from 'lucide-react';
import { Card } from '@/shared/ui/Card';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { EmptyState } from '@/shared/ui/EmptyState';
import { Reveal, RevealItem } from '@/shared/ui/Reveal';
import { api } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { ADMIN_ROLES } from '@/shared/constants';
import type { Material, SupportTicket, TicketStatus } from '@/shared/types';
import { formatDateTime } from '@/features/estoque/utils';
import { PRIORIDADE_META, STATUS_META, tipoLabel } from '@/features/suporte/constants';
import { NewTicketModal } from './NewTicketModal';
import { TicketDetail } from './TicketDetail';

type Filter = 'PENDENTES' | TicketStatus | 'TODOS';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'PENDENTES', label: 'Pendentes' },
  { value: 'ABERTO', label: 'Abertos' },
  { value: 'EM_ANALISE', label: 'Em análise' },
  { value: 'RESOLVIDO', label: 'Resolvidos' },
  { value: 'TODOS', label: 'Todos' },
];

export function Suporte({ materials }: { materials: Material[] }) {
  const user = useAuth((s) => s.user);
  const isAdmin = !!user && ADMIN_ROLES.includes(user.role);

  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('PENDENTES');
  const [newOpen, setNewOpen] = useState(false);
  const [detail, setDetail] = useState<SupportTicket | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { tickets } = await api.get<{ tickets: SupportTicket[] }>('/api/support');
      setTickets(tickets);
      setSetupError(null);
      // Mantém o modal aberto em sincronia com os dados recarregados.
      setDetail((d) => (d ? tickets.find((t) => t.id === d.id) ?? null : null));
    } catch (err: any) {
      // A migração pode ainda não ter rodado — isso merece instrução, não um toast.
      if (/migração|migration/i.test(err.message || '')) setSetupError(err.message);
      else toast.error(err.message || 'Erro ao carregar chamados.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const counts = useMemo(() => {
    const pendentes = tickets.filter((t) => t.status === 'ABERTO' || t.status === 'EM_ANALISE').length;
    return {
      PENDENTES: pendentes,
      ABERTO: tickets.filter((t) => t.status === 'ABERTO').length,
      EM_ANALISE: tickets.filter((t) => t.status === 'EM_ANALISE').length,
      RESOLVIDO: tickets.filter((t) => t.status === 'RESOLVIDO').length,
      RECUSADO: tickets.filter((t) => t.status === 'RECUSADO').length,
      TODOS: tickets.length,
    } as Record<Filter, number>;
  }, [tickets]);

  const visible = useMemo(() => {
    if (filter === 'TODOS') return tickets;
    if (filter === 'PENDENTES') return tickets.filter((t) => t.status === 'ABERTO' || t.status === 'EM_ANALISE');
    return tickets.filter((t) => t.status === filter);
  }, [tickets, filter]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-[var(--text)]">Suporte</h1>
          <p className="text-sm text-[var(--text-muted)]">
            {isAdmin
              ? 'Chamados abertos pela equipe sobre cadastro de materiais.'
              : 'Relate materiais duplicados ou com informação incorreta.'}
          </p>
        </div>
        <Button icon={<Plus size={15} />} disabled={!!setupError} onClick={() => setNewOpen(true)}>
          Abrir chamado
        </Button>
      </div>

      {setupError && (
        <div className="flex items-start gap-3 rounded-xl border border-[var(--brand)]/30 bg-[var(--brand)]/10 p-4">
          <ShieldAlert size={18} className="mt-0.5 shrink-0 text-[var(--brand)]" />
          <div>
            <p className="text-sm font-bold text-[var(--text)]">Módulo de suporte ainda não instalado</p>
            <p className="text-xs text-[var(--text-muted)]">
              As tabelas do suporte não existem no banco. Rode{' '}
              <code className="rounded bg-[var(--bg-2)] px-1 py-0.5 font-mono text-[11px]">
                migrations/001_suporte_e_seguranca.sql
              </code>{' '}
              no SQL Editor do Supabase e recarregue esta página.
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const active = filter === f.value;
          return (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${
                active
                  ? 'border-[var(--brand)] bg-[var(--brand)] text-white'
                  : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:border-[var(--brand)]/50'
              }`}
            >
              {f.label}
              <span className={active ? 'ml-1.5 opacity-80' : 'ml-1.5 text-[var(--text-muted)]'}>{counts[f.value]}</span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <Card className="p-10 text-center text-sm text-[var(--text-muted)]">Carregando chamados...</Card>
      ) : visible.length === 0 ? (
        <Card>
          <EmptyState
            icon={<LifeBuoy size={20} />}
            title="Nenhum chamado por aqui"
            subtitle={
              filter === 'PENDENTES'
                ? 'Nada pendente. Use "Abrir chamado" para relatar um problema de cadastro.'
                : 'Nenhum chamado com este filtro.'
            }
          />
        </Card>
      ) : (
        <Reveal className="space-y-2">
          {visible.map((t) => {
            const status = STATUS_META[t.status];
            const prioridade = PRIORIDADE_META[t.prioridade];
            return (
              <RevealItem key={t.id}>
                <Card
                  onClick={() => setDetail(t)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setDetail(t))}
                  className="cursor-pointer p-4 transition-transform hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/40"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-[11px] text-[var(--text-muted)]">#{t.id}</span>
                        <Badge variant={status.variant}>{status.label}</Badge>
                        <span className={`text-[11px] font-bold ${prioridade.className}`}>{prioridade.label}</span>
                      </div>
                      <p className="mt-1.5 truncate text-sm font-bold text-[var(--text)]">{t.assunto}</p>
                      <p className="text-[11px] text-[var(--text-muted)]">
                        {tipoLabel(t.tipo)} · {t.autor_nome} · {formatDateTime(t.created_at)}
                      </p>
                    </div>
                    {t.materiais.length > 0 && (
                      <span className="flex shrink-0 items-center gap-1 rounded-full bg-[var(--bg-2)] px-2.5 py-1 text-[11px] font-semibold text-[var(--text-muted)]">
                        <Package size={12} /> {t.materiais.length}
                      </span>
                    )}
                  </div>
                </Card>
              </RevealItem>
            );
          })}
        </Reveal>
      )}

      <NewTicketModal open={newOpen} materials={materials} onClose={() => setNewOpen(false)} onCreated={load} />
      <TicketDetail
        ticket={detail}
        isAdmin={isAdmin}
        currentMatricula={user?.matricula || ''}
        onClose={() => setDetail(null)}
        onChanged={load}
      />
    </div>
  );
}
