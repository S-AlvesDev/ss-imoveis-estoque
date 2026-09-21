import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, ArrowLeftRight, CalendarClock, FileDown, PackageX, RefreshCw, ShoppingCart, TrendingDown, Timer } from 'lucide-react';
import { Card } from '@/shared/ui/Card';
import { Button } from '@/shared/ui/Button';
import { EmptyState } from '@/shared/ui/EmptyState';
import { StockBar } from '@/shared/ui/StockBar';
import { Reveal, RevealItem } from '@/shared/ui/Reveal';
import type { Material, Deposito, Emprestimo, Lote } from '@/shared/types';
import { formatNumber, percentOfMinimum, stockStatus, stockTotal, saldoEm, ondeTem, formatDateTime } from '@/features/estoque/utils';
import { exportReposicaoToWord } from './exportReposicao';
import { api } from '@/lib/api';
import { usePlano } from '@/features/planos/usePlano';
import { NovaCotacao } from '@/pages/Compras/NovaCotacao';
import type { Cotacao, Fornecedor } from '@/shared/cotacoes';
import type { Unidade } from '@/shared/types';

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
  // Para transferência: onde está zerado (e é esperado) e onde tem.
  const zerados = depositos.filter((d) => d.id in material.saldos_unidade && saldoEm(material, d.id) <= 0).map((d) => d.nome);
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

const DIA_MS = 24 * 60 * 60 * 1000;
const fmtData = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' });

/** Um aviso de prazo (retirada atrasada, troca vencida, lote vencido...) com a lista do que está assim. */
function AvisoCard({ icone, tom, titulo, linhas }: { icone: React.ReactNode; tom: 'vermelho' | 'amarelo'; titulo: string; linhas: Array<{ id: string; quem: React.ReactNode; onde: React.ReactNode }> }) {
  const cor = tom === 'vermelho' ? 'var(--vermelho)' : 'var(--amarelo)';
  return (
    <Card className="p-4" style={{ borderColor: `color-mix(in srgb, ${cor} 40%, transparent)` }}>
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ background: `color-mix(in srgb, ${cor} 15%, transparent)`, color: cor }}>
          {icone}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-[var(--text)]">{titulo}</p>
          <ul className="mt-2 divide-y divide-[var(--border)]">
            {linhas.slice(0, 40).map((l) => (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs">
                <span className="min-w-0 truncate">{l.quem}</span>
                <span className="min-w-0 text-[var(--text-muted)]">{l.onde}</span>
              </li>
            ))}
          </ul>
          {linhas.length > 40 && <p className="mt-1 text-[11px] text-[var(--text-muted)]">Mostrando 40 de {linhas.length}.</p>}
        </div>
      </div>
    </Card>
  );
}

interface AlertasProps {
  materials: Material[];
  /** Estoques ativos da unidade em uso. */
  depositos: Deposito[];
  /** Retiradas pendentes e entregas abertas — as atrasadas e as com troca vencida viram alerta aqui. */
  emprestimos: Emprestimo[];
  /** Lotes com saldo — os vencidos e os vencendo viram alerta aqui. */
  lotes: Lote[];
  categorias: string[];
  /** A unidade em uso — vira o "entregar em" da cotação. */
  unidade: Unidade | null;
}

export function Alertas({ materials, depositos, emprestimos, lotes, categorias, unidade }: AlertasProps) {
  const nomeDo = (id: string) => depositos.find((d) => d.id === id)?.nome ?? '';
  const planoAtual = usePlano();
  const [cotando, setCotando] = useState(false);
  const [carregandoFornecedores, setCarregandoFornecedores] = useState(false);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  // Empréstimos vencidos e entregas com troca vencida — as duas moram na mesma tabela, com tipo.
  const atrasados = useMemo(() => {
    const agora = Date.now();
    return emprestimos
      .filter((e) => e.tipo === 'emprestimo' && e.prazo_em && new Date(e.prazo_em).getTime() < agora)
      .map((e) => ({ ...e, prazo_em: e.prazo_em as string, estoque: depositos.find((d) => d.id === e.warehouse_id)?.nome ?? '' }));
  }, [emprestimos, depositos]);
  const trocasVencidas = useMemo(() => {
    const agora = Date.now();
    return emprestimos
      .filter((e) => e.tipo === 'entrega' && e.prazo_em && new Date(e.prazo_em).getTime() < agora)
      .map((e) => ({ ...e, prazo_em: e.prazo_em as string, estoque: depositos.find((d) => d.id === e.warehouse_id)?.nome ?? '' }));
  }, [emprestimos, depositos]);
  // Lotes desta unidade: vencidos, e vencendo dentro do aviso do estoque deles.
  const lotesVencidos = useMemo(() => {
    const hoje = new Date();
    const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()).getTime();
    return lotes.filter((l) => l.validade && new Date(`${l.validade}T00:00:00`).getTime() < inicio && depositos.some((d) => d.id === l.warehouse_id));
  }, [lotes, depositos]);
  const lotesVencendo = useMemo(() => {
    const hoje = new Date();
    const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()).getTime();
    return lotes.filter((l) => {
      if (!l.validade) return false;
      const dep = depositos.find((d) => d.id === l.warehouse_id);
      if (!dep) return false;
      const fim = new Date(`${l.validade}T00:00:00`).getTime();
      return fim >= inicio && fim <= inicio + (dep.dias_aviso_validade ?? 30) * DIA_MS;
    });
  }, [lotes, depositos]);
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
  /** O que falta vira lista de cotação: compra o que recompõe o mínimo (no mínimo 1). */
  const itensParaCotar = useMemo(
    () =>
      [...grouped.RUPTURA, ...grouped.ABAIXO].map((m) => ({
        material_id: m.id,
        descricao: m.nome,
        quantidade: Math.max(1, Math.ceil(Number(m.estoque_minimo || 0) - stockTotal(m))),
        unidade: m.unidade_medida,
      })),
    [grouped],
  );

  async function abrirCotacao() {
    setCarregandoFornecedores(true);
    try {
      const r = await api.get<{ fornecedores: Fornecedor[] }>('/api/fornecedores');
      setFornecedores(r.fornecedores);
      if (r.fornecedores.filter((f) => f.ativo).length === 0) {
        toast.error('Cadastre um fornecedor em Compras antes de cotar.');
        return;
      }
      setCotando(true);
    } catch (err: any) {
      toast.error(err.message || 'Não foi possível carregar os fornecedores.');
    } finally {
      setCarregandoFornecedores(false);
    }
  }
  const visibleGroups = GROUPS.filter((g) => openGroup === 'TODOS' || openGroup === g.key);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-[var(--text)]">Alertas</h1>
          <p className="text-sm text-[var(--text-muted)]">O que precisa de compra, o que só precisa de transferência, o que está atrasado na rua e o que está vencendo.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            icon={<FileDown size={15} />}
            disabled={totalCompra === 0}
            onClick={() => exportReposicaoToWord([...grouped.RUPTURA, ...grouped.ABAIXO], categorias, depositos)}
          >
            Lista de Compras ({totalCompra})
          </Button>
          <Button
            icon={<ShoppingCart size={15} />}
            disabled={totalCompra === 0 || !planoAtual.libera('cotacoes')}
            loading={carregandoFornecedores}
            title={planoAtual.libera('cotacoes') ? 'Pergunta o preço destes materiais aos fornecedores, pelo WhatsApp' : planoAtual.porQueNao('cotacoes')}
            onClick={abrirCotacao}
          >
            Cotar o que falta
          </Button>
        </div>
      </div>

      {atrasados.length > 0 && (
        <AvisoCard
          icone={<Timer size={18} />}
          tom="vermelho"
          titulo={`${atrasados.length} retirada${atrasados.length > 1 ? 's' : ''} ${atrasados.length > 1 ? 'passaram' : 'passou'} do prazo de devolução`}
          linhas={atrasados.map((e) => ({
            id: e.id,
            quem: (
              <>
                <strong className="text-[var(--text)]">{e.tomador_nome}</strong>
                {e.tomador_referencia && <span className="text-[var(--text-muted)]"> · {e.tomador_referencia}</span>}
                <span className="text-[var(--text-muted)]"> — {formatNumber(Number(e.quantidade) - Number(e.quantidade_devolvida))} {e.unidade_medida} de {e.material_nome}</span>
              </>
            ),
            onde: `${e.estoque} · vencia ${formatDateTime(e.prazo_em)}`,
          }))}
        />
      )}

      {trocasVencidas.length > 0 && (
        <AvisoCard
          icone={<RefreshCw size={18} />}
          tom="vermelho"
          titulo={`${trocasVencidas.length} ${trocasVencidas.length > 1 ? 'itens entregues passaram' : 'item entregue passou'} da validade de troca`}
          linhas={trocasVencidas.map((e) => ({
            id: e.id,
            quem: (
              <>
                <strong className="text-[var(--text)]">{e.tomador_nome}</strong>
                {e.tomador_referencia && <span className="text-[var(--text-muted)]"> · {e.tomador_referencia}</span>}
                <span className="text-[var(--text-muted)]"> — {formatNumber(Number(e.quantidade))} {e.unidade_medida} de {e.material_nome}</span>
              </>
            ),
            onde: `${e.estoque} · trocar desde ${fmtData.format(new Date(e.prazo_em))}`,
          }))}
        />
      )}

      {lotesVencidos.length > 0 && (
        <AvisoCard
          icone={<CalendarClock size={18} />}
          tom="vermelho"
          titulo={`${lotesVencidos.length} lote${lotesVencidos.length > 1 ? 's' : ''} vencido${lotesVencidos.length > 1 ? 's' : ''} ainda com saldo`}
          linhas={lotesVencidos.map((l) => ({
            id: l.id,
            quem: (
              <>
                <strong className="text-[var(--text)]">{l.material_nome}</strong>
                <span className="text-[var(--text-muted)]"> — lote {l.lote}, {formatNumber(Number(l.quantidade))} {l.unidade_medida}</span>
              </>
            ),
            onde: `${nomeDo(l.warehouse_id)} · venceu ${fmtData.format(new Date(`${l.validade}T00:00:00`))}`,
          }))}
        />
      )}

      {lotesVencendo.length > 0 && (
        <AvisoCard
          icone={<CalendarClock size={18} />}
          tom="amarelo"
          titulo={`${lotesVencendo.length} lote${lotesVencendo.length > 1 ? 's' : ''} vencendo`}
          linhas={lotesVencendo.map((l) => ({
            id: l.id,
            quem: (
              <>
                <strong className="text-[var(--text)]">{l.material_nome}</strong>
                <span className="text-[var(--text-muted)]"> — lote {l.lote}, {formatNumber(Number(l.quantidade))} {l.unidade_medida}</span>
              </>
            ),
            onde: `${nomeDo(l.warehouse_id)} · vence ${fmtData.format(new Date(`${l.validade}T00:00:00`))}`,
          }))}
        />
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

      <NovaCotacao
        open={cotando}
        onClose={() => setCotando(false)}
        onCriada={() => toast.success('Cotação enviada. Acompanhe as respostas em Compras.')}
        catalogo={materials}
        fornecedores={fornecedores}
        unidade={unidade}
        itensIniciais={itensParaCotar}
        tituloInicial={`Reposição ${new Date().toLocaleDateString('pt-BR')}`}
      />
    </div>
  );
}
