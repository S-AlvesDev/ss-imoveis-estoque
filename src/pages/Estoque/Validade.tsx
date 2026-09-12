import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, CalendarClock, Check, Layers, Package, Search } from 'lucide-react';
import { Card, CardHeader } from '@/shared/ui/Card';
import { StatCard } from '@/shared/ui/StatCard';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { Input, Select, Textarea } from '@/shared/ui/Field';
import { EmptyState } from '@/shared/ui/EmptyState';
import { Reveal, RevealItem } from '@/shared/ui/Reveal';
import { MaterialPicker } from '@/shared/ui/MaterialPicker';
import { api } from '@/lib/api';
import type { Deposito, Lote, Material } from '@/shared/types';
import { formatNumber, saldoEm } from '@/features/estoque/utils';
import { MODO_LABELS, OPERACOES_ALMOXARIFADO } from '@/shared/constants';
import { buscaInicial } from '@/store/busca';
import { usePlano } from '@/features/planos/usePlano';
import { Cadeado } from '@/features/planos/Cadeado';

interface ValidadeProps {
  deposito: Deposito;
  materials: Material[];
  /** Os lotes com saldo deste estoque (vêm no /api/data). */
  lotes: Lote[];
  /** Os outros estoques da mesma unidade — destinos de transferência. */
  outrosEstoques: Deposito[];
  refetch: () => Promise<void>;
  podeOperar: boolean;
}

type Operacao = 'ENTRADA' | 'SAIDA' | 'CONSUMO' | 'TRANSFERENCIA' | 'AJUSTE';
type Situacao = 'vencido' | 'vencendo' | 'ok' | 'sem-validade';

const DIA_MS = 24 * 60 * 60 * 1000;
const fmtData = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' });

function inicioDoDia(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Dias até vencer (negativo = venceu há N dias). */
function diasParaVencer(validade: string, agora: Date): number {
  return Math.round((new Date(`${validade}T00:00:00`).getTime() - inicioDoDia(agora)) / DIA_MS);
}

function situacao(l: Lote, diasAviso: number, agora: Date): Situacao {
  if (!l.validade) return 'sem-validade';
  const dias = diasParaVencer(l.validade, agora);
  if (dias < 0) return 'vencido';
  if (dias <= diasAviso) return 'vencendo';
  return 'ok';
}

const BADGE: Record<Situacao, { variant: 'critical' | 'warning' | 'success' | 'neutral'; texto: string }> = {
  vencido: { variant: 'critical', texto: 'Vencido' },
  vencendo: { variant: 'warning', texto: 'Vencendo' },
  ok: { variant: 'success', texto: 'Ok' },
  'sem-validade': { variant: 'neutral', texto: 'Sem validade' },
};

const CORES: Record<Operacao, string> = {
  ENTRADA: 'bg-[var(--verde)] text-white',
  SAIDA: 'bg-[var(--amarelo)] text-white',
  CONSUMO: 'bg-[var(--vermelho)] text-white',
  TRANSFERENCIA: 'bg-[var(--brand)] text-white',
  AJUSTE: 'bg-[var(--roxo)] text-white',
};

function validadeLegivel(l: Lote, agora: Date): string {
  if (!l.validade) return 'sem validade';
  const dias = diasParaVencer(l.validade, agora);
  const data = fmtData.format(new Date(`${l.validade}T00:00:00`));
  if (dias < 0) return `venceu há ${-dias === 1 ? '1 dia' : `${-dias} dias`} (${data})`;
  if (dias === 0) return `vence hoje (${data})`;
  return `vence em ${dias === 1 ? '1 dia' : `${dias} dias`} (${data})`;
}

/**
 * A tela de um estoque no modo validade. Remédio, alimento, reagente,
 * cola: cada entrada é um lote com data; a saída tira do que vence
 * primeiro (FEFO) a menos que a pessoa aponte um lote; o que passou da
 * data fica vermelho antes de ir parar num paciente ou num prato.
 */
export function Validade({ deposito, materials, lotes, outrosEstoques, refetch, podeOperar }: ValidadeProps) {
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  const diasAviso = deposito.dias_aviso_validade ?? 30;
  const planoAtual = usePlano();
  const podeTransferir = planoAtual.libera('transferencia');

  // As operações ligadas neste estoque; "Transferir" só com outro estoque na unidade — e com o plano que a inclui.
  const operacoes = useMemo(
    () =>
      OPERACOES_ALMOXARIFADO.filter((o) => (!deposito.operacoes_permitidas || deposito.operacoes_permitidas.includes(o.value)) && (o.value !== 'TRANSFERENCIA' || (outrosEstoques.length > 0 && podeTransferir))).map((o) => ({ ...o, color: CORES[o.value] })),
    [deposito.operacoes_permitidas, outrosEstoques.length, podeTransferir],
  );
  const transferenciaTravada = !podeTransferir && outrosEstoques.length > 0;

  // formulário
  const [operacao, setOperacao] = useState<Operacao>(operacoes[0]?.value ?? 'ENTRADA');
  const [materialId, setMaterialId] = useState('');
  const [quantidade, setQuantidade] = useState('');
  const [lote, setLote] = useState('');
  const [validade, setValidade] = useState('');
  const [loteId, setLoteId] = useState('');
  const [destinoId, setDestinoId] = useState(outrosEstoques[0]?.id ?? '');
  const [justificativa, setJustificativa] = useState('');
  const [enviando, setEnviando] = useState(false);

  // lista
  const [busca, setBusca] = useState(buscaInicial);
  const [filtro, setFiltro] = useState<'todos' | 'vencidos' | 'vencendo'>('todos');

  useEffect(() => {
    if (!outrosEstoques.some((d) => d.id === destinoId)) setDestinoId(outrosEstoques[0]?.id ?? '');
  }, [outrosEstoques, destinoId]);

  const daqui = useMemo(() => lotes.filter((l) => l.warehouse_id === deposito.id), [lotes, deposito.id]);
  const lotesDoMaterial = useMemo(() => daqui.filter((l) => String(l.material_id) === materialId), [daqui, materialId]);
  useEffect(() => setLoteId(''), [materialId, operacao]);

  const totalVencidos = useMemo(() => daqui.filter((l) => situacao(l, diasAviso, agora) === 'vencido').length, [daqui, diasAviso, agora]);
  const totalVencendo = useMemo(() => daqui.filter((l) => situacao(l, diasAviso, agora) === 'vencendo').length, [daqui, diasAviso, agora]);
  const materiaisComSaldo = useMemo(() => new Set(daqui.map((l) => l.material_id)).size, [daqui]);

  const listados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return daqui
      .filter((l) => {
        const s = situacao(l, diasAviso, agora);
        if (filtro === 'vencidos' && s !== 'vencido') return false;
        if (filtro === 'vencendo' && s !== 'vencendo') return false;
        return !q || l.material_nome.toLowerCase().includes(q) || l.lote.toLowerCase().includes(q);
      })
      .sort((a, b) => (a.validade ?? '9999').localeCompare(b.validade ?? '9999') || a.material_nome.localeCompare(b.material_nome));
  }, [daqui, busca, filtro, diasAviso, agora]);

  const material = materials.find((m) => String(m.id) === materialId);
  const atual = operacoes.find((o) => o.value === operacao) ?? operacoes[0];
  const precisaLote = operacao === 'ENTRADA';
  const escolheLote = operacao === 'SAIDA' || operacao === 'CONSUMO' || operacao === 'TRANSFERENCIA';
  const ajustaLote = operacao === 'AJUSTE';

  async function registrar(e: React.FormEvent) {
    e.preventDefault();
    if (!materialId) return toast.error('Escolha o material.');
    const q = Number(quantidade);
    if (!quantidade || q === 0 || (!ajustaLote && q < 0)) return toast.error('Informe uma quantidade válida.');
    if (precisaLote && !lote.trim()) return toast.error('Informe o lote.');
    if (ajustaLote && !loteId) return toast.error('Aponte o lote que está sendo ajustado.');
    if (operacao === 'TRANSFERENCIA' && !destinoId) return toast.error('Escolha o estoque de destino.');
    if (!justificativa.trim()) return toast.error('Justificativa é obrigatória.');
    setEnviando(true);
    try {
      await api.post(`/api/estoques/${deposito.id}/movimentacoes`, {
        operacao,
        material_id: Number(materialId),
        quantidade: q,
        justificativa: justificativa.trim(),
        destino_id: operacao === 'TRANSFERENCIA' ? destinoId : undefined,
        lote: precisaLote ? lote.trim() : undefined,
        validade: precisaLote ? validade || null : undefined,
        lote_id: escolheLote || ajustaLote ? loteId || null : undefined,
      });
      toast.success('Movimentação registrada.');
      setQuantidade('');
      setJustificativa('');
      if (precisaLote) {
        setLote('');
        setValidade('');
      }
      await refetch();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao registrar movimentação.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold text-[var(--text)]">{deposito.nome}</h1>
          <p className="text-sm text-[var(--text-muted)]">
            {MODO_LABELS.validade.descricao} Aviso com <strong className="text-[var(--text)]">{diasAviso} dias</strong> de antecedência.
          </p>
        </div>
        {!podeOperar && <Badge variant="neutral">Só consulta</Badge>}
      </div>

      <Reveal className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <RevealItem>
          <StatCard label="Lotes com saldo" value={daqui.length} icon={<Layers size={20} />} accent="brand" sublabel={`${materiaisComSaldo} ${materiaisComSaldo === 1 ? 'material' : 'materiais'}`} />
        </RevealItem>
        <RevealItem>
          <StatCard label="Vencidos" value={totalVencidos} icon={<AlertTriangle size={20} />} accent="red" sublabel={totalVencidos > 0 ? 'ainda com saldo' : 'nenhum vencido'} />
        </RevealItem>
        <RevealItem>
          <StatCard label="Vencendo" value={totalVencendo} icon={<CalendarClock size={20} />} accent="amber" sublabel={`nos próximos ${diasAviso} dias`} />
        </RevealItem>
        <RevealItem>
          <StatCard label="Materiais" value={materials.length} icon={<Package size={20} />} accent="green" sublabel="cadastrados neste estoque" />
        </RevealItem>
      </Reveal>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <Card className="p-5 lg:col-span-2">
          <p className="mb-4 text-sm font-bold text-[var(--text)]">Movimentar</p>
          {podeOperar ? (
            <form onSubmit={registrar} className="space-y-4">
              <div>
                <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Operação</p>
                <div className="flex flex-wrap gap-2">
                  {operacoes.map((op) => (
                    <button
                      type="button"
                      key={op.value}
                      onClick={() => setOperacao(op.value)}
                      className={`rounded-full px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-wide transition-colors ${operacao === op.value ? op.color : 'bg-[var(--bg-2)] text-[var(--text-muted)] hover:text-[var(--text)]'}`}
                    >
                      {op.label}
                    </button>
                  ))}
                </div>
                {atual && <p className="mt-1.5 text-[11px] text-[var(--text-muted)]">{atual.dica}</p>}
                {transferenciaTravada && <Cadeado texto={planoAtual.porQueNao('transferencia')} className="mt-1" />}
              </div>

              {operacao === 'TRANSFERENCIA' && (
                <Select label="Para qual estoque" required value={destinoId} onChange={(e) => setDestinoId(e.target.value)}>
                  {outrosEstoques.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.nome}
                    </option>
                  ))}
                </Select>
              )}

              <MaterialPicker label="Material" required materials={materials} value={materialId} onChange={setMaterialId} depositoId={deposito.id} />
              {material && (
                <p className="text-xs text-[var(--text-muted)]">
                  Aqui: <strong className="text-[var(--text)]">{formatNumber(saldoEm(material, deposito.id))} {material.unidade_medida}</strong> em {lotesDoMaterial.length} {lotesDoMaterial.length === 1 ? 'lote' : 'lotes'}
                </p>
              )}

              {precisaLote && (
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Lote" required value={lote} onChange={(e) => setLote(e.target.value)} maxLength={60} placeholder="Ex.: L2026-09" list={`lotes-${deposito.id}`} autoComplete="off" />
                  <datalist id={`lotes-${deposito.id}`}>
                    {lotesDoMaterial.map((l) => (
                      <option key={l.id} value={l.lote} />
                    ))}
                  </datalist>
                  <Input label="Validade" type="date" value={validade} onChange={(e) => setValidade(e.target.value)} />
                </div>
              )}

              {(escolheLote || ajustaLote) && (
                <Select label={ajustaLote ? 'Lote ajustado' : 'De qual lote'} required={ajustaLote} value={loteId} onChange={(e) => setLoteId(e.target.value)}>
                  {!ajustaLote && <option value="">Automático — o que vence primeiro</option>}
                  {ajustaLote && <option value="">Escolha o lote…</option>}
                  {lotesDoMaterial.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.lote} · {formatNumber(Number(l.quantidade))} · {l.validade ? fmtData.format(new Date(`${l.validade}T00:00:00`)) : 'sem validade'}
                    </option>
                  ))}
                </Select>
              )}

              <Input label="Quantidade" required type="number" step="0.01" value={quantidade} onChange={(e) => setQuantidade(e.target.value)} placeholder={ajustaLote ? 'Com sinal (ex.: -5)' : '0.00'} />
              <Textarea label="Justificativa / NFe / Guia" required rows={2} value={justificativa} onChange={(e) => setJustificativa(e.target.value)} placeholder="Descreva o motivo desta movimentação..." />
              <Button type="submit" fullWidth loading={enviando}>
                Registrar em {deposito.nome}
              </Button>
            </form>
          ) : (
            <p className="text-sm text-[var(--text-muted)]">Você tem acesso de consulta a este estoque. Para movimentar, peça ao administrador o nível “Opera” em Configurações.</p>
          )}
        </Card>

        <Card className="p-5 lg:col-span-3">
          <CardHeader icon={<Layers size={15} />} title={`Lotes (${daqui.length})`} />
          <div className="my-3 flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por material ou lote..."
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] py-2 pl-9 pr-3 text-sm outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/20"
              />
            </div>
            <div className="flex gap-1">
              {(
                [
                  ['todos', 'Todos'],
                  ['vencidos', 'Vencidos'],
                  ['vencendo', 'Vencendo'],
                ] as const
              ).map(([v, l]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setFiltro(v)}
                  className={`rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide transition-colors ${filtro === v ? 'bg-[var(--brand)] text-white' : 'bg-[var(--bg-2)] text-[var(--text-muted)] hover:text-[var(--text)]'}`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>

          {listados.length === 0 ? (
            <EmptyState icon={<Layers size={20} />} title={daqui.length === 0 ? 'Nenhum lote com saldo' : 'Nenhum lote com esse filtro'} subtitle={daqui.length === 0 ? 'Registre uma entrada com o lote e a validade para começar.' : undefined} />
          ) : (
            <div className="max-h-[560px] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-[var(--surface)]">
                  <tr className="text-left text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
                    <th className="pb-2 pr-3 font-semibold">Material</th>
                    <th className="pb-2 pr-3 font-semibold">Lote</th>
                    <th className="pb-2 pr-3 font-semibold">Validade</th>
                    <th className="pb-2 pr-3 text-right font-semibold">Saldo</th>
                    <th className="pb-2 font-semibold"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {listados.map((l) => {
                    const s = situacao(l, diasAviso, agora);
                    return (
                      <tr key={l.id}>
                        <td className="py-2 pr-3 font-medium text-[var(--text)]">{l.material_nome}</td>
                        <td className="py-2 pr-3 font-mono text-xs text-[var(--text)]">{l.lote}</td>
                        <td className={`py-2 pr-3 text-xs ${s === 'vencido' ? 'font-semibold text-[var(--vermelho)]' : s === 'vencendo' ? 'font-semibold text-[var(--amarelo)]' : 'text-[var(--text-muted)]'}`}>{validadeLegivel(l, agora)}</td>
                        <td className="py-2 pr-3 text-right tabular-nums text-[var(--text)]">
                          {formatNumber(Number(l.quantidade))} {l.unidade_medida}
                        </td>
                        <td className="py-2 text-right">
                          <Badge variant={BADGE[s].variant}>{BADGE[s].texto}</Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {totalVencidos > 0 && podeOperar && (
            <p className="mt-3 flex items-start gap-2 rounded-lg bg-[var(--vermelho)]/10 px-3 py-2 text-xs text-[var(--text)]">
              <Check size={14} className="mt-0.5 shrink-0 text-[var(--vermelho)]" />
              Lote vencido não sai sozinho da lista: dê baixa com um <strong>Ajuste</strong> negativo apontando o lote (ou registre o descarte como Consumo).
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
