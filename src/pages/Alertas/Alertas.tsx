import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeftRight, FileDown, PackageX, TrendingDown, Timer } from 'lucide-react';
import { Card } from '@/shared/ui/Card';
import { Button } from '@/shared/ui/Button';
import { EmptyState } from '@/shared/ui/EmptyState';
import { StockBar } from '@/shared/ui/StockBar';
import { Reveal, RevealItem } from '@/shared/ui/Reveal';
import type { Material, Deposito, Emprestimo } from '@/shared/types';
import { formatNumber, percentOfMinimum, stockStatus, stockTotal, saldoEm, ondeTem, formatDateTime } from '@/features/estoque/utils';
import { exportReposicaoToWord } from './exportReposicao';

type Group = 'RUPTURA' | 'ABAIXO' | 'TRANSFERIR';

const GROUPS: { key: Group; title: string; hint: string; icon: React.ReactNode; tone: string }[] = [
  {
    key: 'RUPTURA',
    title: 'Sem estoque',
    hint: 'Não existe em nenhum almoxarifado — precisa de compra.',
    icon: <PackageX size={16} />,
    tone: 'text-rose-500',
  },
  {
    key: 'ABAIXO',
    title: 'Abaixo do mínimo',
    hint: 'O saldo da empresa caiu abaixo do ponto de recompra.',
    icon: <TrendingDown size={16} />,
    tone: 'text-[var(--brand)]',
  },
  {
    key: 'TRANSFERIR',
    title: 'Requer transferência',
    hint: 'Zerado em um estoque, mas existe em outro da mesma unidade — resolve-se transferindo.',
    icon: <ArrowLeftRight size={16} />,
    tone: 'text-sky-500',
  },
];

function AlertCard({ material, group, depositos }: { material: Material; group: Group; depositos: Deposito[] }) {
  const total = stockTotal(material);
  const pct = percentOfMinimum(material);
  // Para transferência: onde está zerado e onde tem.
  const zerados = depositos.filter((d) => saldoEm(material, d.id) <= 0).map((d) => d.nome);
  const temEm = ondeTem(material, depositos);

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-[var(--text)]">{material.nome}</p>
          <p className="text-[11px] text-[var(--text-muted)]">{material.categoria}</p>
        </div>
      </div>

      {group === 'TRANSFERIR' ? (
        <p className="mt-3 text-xs text-[var(--text-muted)]">
          Zerado em <strong className="text-[var(--text)]">{zerados.join(', ')}</strong>; tem em <strong className="text-[var(--text)]">{temEm}</strong> ({formatNumber(total)} {material.unidade_medida} na unidade).
        </p>
      ) : (
        <div className="mt-3 flex items-baseline justify-between text-xs">
          <span className="text-[var(--text-muted)]">
            Total: <strong className="text-[var(--text)]">{formatNumber(total)} {material.unidade_medida}</strong>
          </span>
          <span className="text-[var(--text-muted)]">
            Mín: <strong className="text-[var(--text)]">{formatNumber(material.estoque_minimo)} {material.unidade_medida}</strong>
          </span>
        </div>
      )}

      <StockBar saldo={total} minimo={material.estoque_minimo} className="mt-2" />

      <p className="mt-1.5 text-right text-[11px] text-[var(--text-muted)]">
        {pct === null ? 'Sem mínimo definido' : <><strong className="text-[var(--text)]">{formatNumber(pct)}%</strong> do mínimo</>}
      </p>
    </Card>
  );
}

interface AlertasProps {
  materials: Material[];
  /** Estoques ativos da unidade em uso. */
  depositos: Deposito[];
  /** Retiradas pendentes — as atrasadas viram alerta aqui. */
  emprestimos: Emprestimo[];
  categorias: string[];
}

export function Alertas({ materials, depositos, emprestimos, categorias }: AlertasProps) {
  const atrasados = useMemo(() => {
    const agora = Date.now();
    return emprestimos.filter((e) => new Date(e.prazo_em).getTime() < agora).map((e) => ({ ...e, estoque: depositos.find((d) => d.id === e.warehouse_id)?.nome ?? '' }));
  }, [emprestimos, depositos]);
  const [openGroup, setOpenGroup] = useState<Group | 'TODOS'>('TODOS');

  const grouped = useMemo(() => {
    const ruptura: Material[] = [];
    const abaixo: Material[] = [];
    const transferir: Material[] = [];
    for (const m of materials) {
      const empresa = stockStatus(m, 'empresa');
      if (empresa === 'RUPTURA') ruptura.push(m);
      else if (empresa === 'ABAIXO') abaixo.push(m);
      // Transferência é ortogonal à compra: um item pode faltar num estoque e
      // ainda assim estar abaixo do mínimo da unidade, então avaliamos separado.
      if (depositos.some((d) => stockStatus(m, d.id) === 'TRANSFERIR')) transferir.push(m);
    }
    return { RUPTURA: ruptura, ABAIXO: abaixo, TRANSFERIR: transferir };
  }, [materials, depositos]);

  const totalCompra = grouped.RUPTURA.length + grouped.ABAIXO.length;
  const visibleGroups = GROUPS.filter((g) => openGroup === 'TODOS' || openGroup === g.key);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-[var(--text)]">Alertas</h1>
          <p className="text-sm text-[var(--text-muted)]">O que precisa de compra, o que só precisa de transferência e o que está atrasado na rua.</p>
        </div>
        <Button
          variant="outline"
          icon={<FileDown size={15} />}
          disabled={totalCompra === 0}
          onClick={() => exportReposicaoToWord([...grouped.RUPTURA, ...grouped.ABAIXO], categorias, depositos)}
        >
          Lista de Compras ({totalCompra})
        </Button>
      </div>

      {atrasados.length > 0 && (
        <Card className="border-[var(--vermelho)]/40 p-4">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--vermelho)]/15 text-[var(--vermelho)]">
              <Timer size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-[var(--text)]">
                {atrasados.length} retirada{atrasados.length > 1 ? 's' : ''} passou{atrasados.length > 1 ? 'aram' : ''} do prazo de devolução
              </p>
              <ul className="mt-2 divide-y divide-[var(--border)]">
                {atrasados.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs">
                    <span className="min-w-0 truncate">
                      <strong className="text-[var(--text)]">{e.tomador_nome}</strong>
                      {e.tomador_referencia && <span className="text-[var(--text-muted)]"> · {e.tomador_referencia}</span>}
                      <span className="text-[var(--text-muted)]"> — {formatNumber(Number(e.quantidade) - Number(e.quantidade_devolvida))} {e.unidade_medida} de {e.material_nome}</span>
                    </span>
                    <span className="shrink-0 text-[var(--text-muted)]">
                      {e.estoque} · vencia {formatDateTime(e.prazo_em)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Card>
      )}

      {totalCompra === 0 && grouped.TRANSFERIR.length === 0 ? (
        <Card>
          <EmptyState
            icon={<AlertTriangle size={20} />}
            title="Nenhum alerta"
            subtitle="Todos os materiais estão acima do estoque mínimo."
          />
        </Card>
      ) : (
        <>
          <div
            className={`flex items-start gap-3 rounded-xl border p-4 ${
              totalCompra > 0
                ? 'border-[var(--brand)]/30 bg-[var(--brand)]/10'
                : 'border-sky-500/30 bg-sky-500/10'
            }`}
          >
            <AlertTriangle size={18} className={totalCompra > 0 ? 'mt-0.5 text-[var(--brand)]' : 'mt-0.5 text-sky-500'} />
            <div>
              <p className="text-sm font-bold text-[var(--text)]">
                {totalCompra > 0
                  ? `${totalCompra} material(is) precisam de compra`
                  : 'Nenhuma compra necessária'}
              </p>
              <p className="text-xs text-[var(--text-muted)]">
                {grouped.RUPTURA.length} sem estoque · {grouped.ABAIXO.length} abaixo do mínimo ·{' '}
                {grouped.TRANSFERIR.length} resolvem-se com transferência
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {(['TODOS', ...GROUPS.map((g) => g.key)] as const).map((key) => {
              const active = openGroup === key;
              const count = key === 'TODOS' ? materials.length : grouped[key as Group].length;
              const label = key === 'TODOS' ? 'Todos os grupos' : GROUPS.find((g) => g.key === key)!.title;
              return (
                <button
                  key={key}
                  onClick={() => setOpenGroup(key as Group | 'TODOS')}
                  className={`rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${
                    active
                      ? 'border-[var(--brand)] bg-[var(--brand)] text-white'
                      : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:border-[var(--brand)]/50'
                  }`}
                >
                  {label}
                  <span className={active ? 'ml-1.5 opacity-80' : 'ml-1.5 text-[var(--text-muted)]'}>{count}</span>
                </button>
              );
            })}
          </div>

          {visibleGroups.map((g) => {
            const items = grouped[g.key];
            if (items.length === 0) return null;
            return (
              <div key={g.key}>
                <div className="mb-2 flex items-center gap-2">
                  <span className={g.tone}>{g.icon}</span>
                  <p className="text-sm font-bold text-[var(--text)]">
                    {g.title} <span className="text-[var(--text-muted)]">({items.length})</span>
                  </p>
                </div>
                <p className="mb-3 text-xs text-[var(--text-muted)]">{g.hint}</p>
                <Reveal className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {items.slice(0, 60).map((m) => (
                    <RevealItem key={m.id}>
                      <AlertCard material={m} group={g.key} depositos={depositos} />
                    </RevealItem>
                  ))}
                </Reveal>
                {items.length > 60 && (
                  <p className="mt-2 text-center text-[11px] text-[var(--text-muted)]">
                    Mostrando 60 de {items.length}. Use a lista de compras para o relatório completo.
                  </p>
                )}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
