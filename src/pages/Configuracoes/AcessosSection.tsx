import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ShieldCheck, Users } from 'lucide-react';
import { Card } from '@/shared/ui/Card';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { EmptyState } from '@/shared/ui/EmptyState';
import { api } from '@/lib/api';
import { ADMIN_ROLES } from '@/shared/constants';
import { ROLE_LABELS } from '@/features/usuarios/constants';
import type { Deposito, ManagedUser, NivelAcesso, Unidade } from '@/shared/types';

interface AcessosSectionProps {
  unidades: Unidade[];
  depositos: Deposito[];
}

type Escolha = NivelAcesso | '';

const OPCOES: { value: Escolha; label: string }[] = [
  { value: '', label: '— sem acesso' },
  { value: 'CONSULTA', label: 'Só consulta' },
  { value: 'OPERA', label: 'Opera' },
];

/**
 * Quem pode o quê, depósito a depósito. Uma linha por pessoa, uma coluna por
 * depósito (agrupadas por unidade). Administradores não aparecem: veem e
 * operam tudo por definição, e uma linha cheia de "Opera" só confundiria.
 */
export function AcessosSection({ unidades, depositos }: AcessosSectionProps) {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  // Rascunho por pessoa: depósito -> escolha. Só existe enquanto houver mudança não salva.
  const [rascunhos, setRascunhos] = useState<Record<number, Record<string, Escolha>>>({});
  const [salvando, setSalvando] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const { users } = await api.get<{ users: ManagedUser[] }>('/api/users');
      setUsers(users);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao carregar usuários.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const operadores = useMemo(() => users.filter((u) => !ADMIN_ROLES.includes(u.role)), [users]);
  const admins = useMemo(() => users.filter((u) => ADMIN_ROLES.includes(u.role)), [users]);

  const unidadesAtivas = useMemo(() => unidades.filter((u) => u.ativo), [unidades]);
  const ordem: Record<string, number> = { CENTRAL: 0, OBRA: 1, OUTRO: 2 };
  const depositosDe = (unidadeId: string) =>
    depositos.filter((d) => d.unit_id === unidadeId && d.ativo).sort((a, b) => ordem[a.tipo] - ordem[b.tipo]);
  const colunas = unidadesAtivas.flatMap((u) => depositosDe(u.id).map((d) => ({ unidade: u, deposito: d })));

  const escolhaDe = (user: ManagedUser, depositoId: string): Escolha =>
    rascunhos[user.id]?.[depositoId] ?? (user.acessos.find((a) => a.warehouse_id === depositoId)?.nivel ?? '');

  const temMudanca = (user: ManagedUser) =>
    Object.entries(rascunhos[user.id] ?? {}).some(([depositoId, escolha]) => {
      const salvo = user.acessos.find((a) => a.warehouse_id === depositoId)?.nivel ?? '';
      return escolha !== salvo;
    });

  function alterar(user: ManagedUser, depositoId: string, escolha: Escolha) {
    setRascunhos((prev) => ({ ...prev, [user.id]: { ...(prev[user.id] ?? {}), [depositoId]: escolha } }));
  }

  function descartar(user: ManagedUser) {
    setRascunhos((prev) => {
      const n = { ...prev };
      delete n[user.id];
      return n;
    });
  }

  async function salvar(user: ManagedUser) {
    // Manda o conjunto inteiro: o que a pessoa tem hoje, com o rascunho por cima.
    const acessos = colunas
      .map(({ deposito }) => ({ warehouse_id: deposito.id, nivel: escolhaDe(user, deposito.id) }))
      .filter((a): a is { warehouse_id: string; nivel: NivelAcesso } => a.nivel !== '');

    setSalvando(user.id);
    try {
      await api.put(`/api/users/${user.id}/acessos`, { acessos });
      toast.success(`Acessos de ${user.nome} salvos.`);
      descartar(user);
      await load();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar acessos.');
    } finally {
      setSalvando(null);
    }
  }

  const semNenhumAcesso = (user: ManagedUser) => colunas.every(({ deposito }) => escolhaDe(user, deposito.id) === '');

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Usuários e acessos</h2>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          Quem pode o quê, depósito a depósito. <strong>Opera</strong> registra entrada, consumo, remessa e recontagem;{' '}
          <strong>Só consulta</strong> vê o estoque sem mexer. Uma pessoa só enxerga as unidades em que tem algum depósito.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-[var(--text-muted)]">Carregando…</p>
      ) : operadores.length === 0 ? (
        <EmptyState icon={<Users size={20} />} title="Nenhum operador" subtitle="Crie usuários em Sistema → Usuários. Administradores não precisam de atribuição." />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th rowSpan={2} className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
                  Pessoa
                </th>
                {unidadesAtivas.map((u) => (
                  <th
                    key={u.id}
                    colSpan={depositosDe(u.id).length}
                    className="border-l border-[var(--border)] px-3 pt-3 text-center text-[11px] font-bold text-[var(--text)]"
                  >
                    {u.nome}
                  </th>
                ))}
                <th rowSpan={2} className="px-4 py-3" />
              </tr>
              <tr className="border-b border-[var(--border)]">
                {colunas.map(({ deposito }, i) => (
                  <th
                    key={deposito.id}
                    className={`px-3 pb-2 text-center text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)] ${
                      i === 0 || colunas[i - 1].unidade.id !== deposito.unit_id ? 'border-l border-[var(--border)]' : ''
                    }`}
                  >
                    {deposito.nome}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {operadores.map((user) => {
                const mudou = temMudanca(user);
                return (
                  <tr key={user.id} className={mudou ? 'bg-[var(--brand)]/5' : ''}>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-[var(--text)]">{user.nome}</p>
                      <p className="font-mono text-[10px] text-[var(--text-muted)]">
                        {user.matricula} · {ROLE_LABELS[user.role] ?? user.role}
                      </p>
                      {semNenhumAcesso(user) && (
                        <p className="mt-1 text-[10px] font-semibold text-rose-500">Sem acesso a nenhum depósito — não vê nada.</p>
                      )}
                    </td>
                    {colunas.map(({ deposito }, i) => (
                      <td
                        key={deposito.id}
                        className={`px-3 py-2 text-center ${
                          i === 0 || colunas[i - 1].unidade.id !== deposito.unit_id ? 'border-l border-[var(--border)]' : ''
                        }`}
                      >
                        <select
                          value={escolhaDe(user, deposito.id)}
                          onChange={(e) => alterar(user, deposito.id, e.target.value as Escolha)}
                          className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-xs text-[var(--text)] outline-none focus:border-[var(--brand)]"
                        >
                          {OPCOES.map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      </td>
                    ))}
                    <td className="px-4 py-2 text-right">
                      {mudou && (
                        <div className="flex items-center justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => descartar(user)}>Desfazer</Button>
                          <Button size="sm" loading={salvando === user.id} onClick={() => salvar(user)}>Salvar</Button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      {admins.length > 0 && (
        <p className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
          <ShieldCheck size={14} className="text-emerald-500" />
          Administradores ({admins.map((a) => a.nome).join(', ')}) veem e operam tudo, em todas as unidades.
          <Badge variant="success">sem atribuição</Badge>
        </p>
      )}
    </section>
  );
}
