import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Check, Clock, History, PackageOpen, Search, Timer, User } from 'lucide-react';
import { Card, CardHeader } from '@/shared/ui/Card';
import { StatCard } from '@/shared/ui/StatCard';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { Input, Textarea } from '@/shared/ui/Field';
import { Modal } from '@/shared/ui/Modal';
import { EmptyState } from '@/shared/ui/EmptyState';
import { Reveal, RevealItem } from '@/shared/ui/Reveal';
import { MaterialPicker } from '@/shared/ui/MaterialPicker';
import { api } from '@/lib/api';
import type { Deposito, Emprestimo as EmprestimoT, Material, StaffUser } from '@/shared/types';
import { formatDateTime, formatNumber, saldoEm, staffName } from '@/features/estoque/utils';
import { MODO_LABELS } from '@/shared/constants';
import { buscaInicial } from '@/store/busca';

interface EmprestimoProps {
  deposito: Deposito;
  materials: Material[];
  /** As retiradas pendentes deste estoque (vêm no /api/data). */
  emprestimos: EmprestimoT[];
  staff: StaffUser[];
  refetch: () => Promise<void>;
  podeOperar: boolean;
}

const fmtHora = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });

/** "vence em 1 h 20 min", "venceu há 35 min", "vence hoje 16:00". */
function prazoLegivel(prazoEm: string, agora: Date): { texto: string; atrasado: boolean } {
  const fim = new Date(prazoEm).getTime();
  const diff = fim - agora.getTime();
  const atrasado = diff < 0;
  const abs = Math.abs(diff);
  const h = Math.floor(abs / 3600000);
  const min = Math.floor((abs % 3600000) / 60000);
  const dur = h >= 48 ? `${Math.floor(h / 24)} dias` : h > 0 ? `${h} h${min ? ` ${min} min` : ''}` : `${min} min`;
  return { texto: atrasado ? `venceu há ${dur}` : `vence em ${dur} (${fmtHora.format(new Date(prazoEm))})`, atrasado };
}

/**
 * A tela de um estoque no modo empréstimo. Uma coordenação de esportes, um
 * laboratório, uma biblioteca de ferramentas: alguém pega, tem um prazo,
 * devolve. O que está na rua aparece na lista de pendentes; o que passou do
 * prazo fica vermelho.
 */
export function Emprestimo({ deposito, materials, emprestimos, staff, refetch, podeOperar }: EmprestimoProps) {
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  // formulário
  const [tomadorNome, setTomadorNome] = useState('');
  const [tomadorRef, setTomadorRef] = useState('');
  const [materialId, setMaterialId] = useState('');
  const [quantidade, setQuantidade] = useState('');
  const [prazoHoras, setPrazoHoras] = useState(String(deposito.prazo_padrao_horas ?? 2));
  const [observacao, setObservacao] = useState('');
  const [enviando, setEnviando] = useState(false);

  // pendentes
  const [busca, setBusca] = useState(buscaInicial);
  const [devolvendo, setDevolvendo] = useState<string | null>(null);

  // histórico
  const [historicoAberto, setHistoricoAberto] = useState(false);
  const [historico, setHistorico] = useState<EmprestimoT[] | null>(null);

  useEffect(() => setPrazoHoras(String(deposito.prazo_padrao_horas ?? 2)), [deposito.id, deposito.prazo_padrao_horas]);

  const pendentes = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return emprestimos
      .filter((e) => e.warehouse_id === deposito.id)
      .filter((e) => !q || e.tomador_nome.toLowerCase().includes(q) || (e.tomador_referencia ?? '').toLowerCase().includes(q) || e.material_nome.toLowerCase().includes(q))
      .sort((a, b) => new Date(a.prazo_em).getTime() - new Date(b.prazo_em).getTime());
  }, [emprestimos, deposito.id, busca]);

  const atrasados = useMemo(() => emprestimos.filter((e) => e.warehouse_id === deposito.id && new Date(e.prazo_em).getTime() < agora.getTime()).length, [emprestimos, deposito.id, agora]);
  const totalPendentes = emprestimos.filter((e) => e.warehouse_id === deposito.id).length;
  const disponiveis = useMemo(() => materials.filter((m) => saldoEm(m, deposito.id) > 0), [materials, deposito.id]);
  const material = materials.find((m) => String(m.id) === materialId);

  // Quem já retirou antes vira sugestão: "João" de novo é o mesmo João.
  const sugestoes = useMemo(() => {
    const vistos = new Map<string, string>();
    for (const e of [...emprestimos, ...(historico ?? [])]) {
      const chave = e.tomador_nome.trim().toLowerCase();
      if (!vistos.has(chave)) vistos.set(chave, e.tomador_referencia ? `${e.tomador_nome} — ${e.tomador_referencia}` : e.tomador_nome);
    }
    return [...vistos.values()].slice(0, 50);
  }, [emprestimos, historico]);

  async function retirar(e: React.FormEvent) {
    e.preventDefault();
    if (!materialId) return toast.error('Escolha o material.');
    setEnviando(true);
    try {
      await api.post(`/api/estoques/${deposito.id}/emprestimos`, {
        material_id: Number(materialId),
        quantidade: Number(quantidade),
        tomador_nome: tomadorNome,
        tomador_referencia: tomadorRef || null,
        prazo_horas: prazoHoras === '' ? null : Number(prazoHoras),
        observacao: observacao || null,
      });
      toast.success(`Retirada registrada para ${tomadorNome.trim()}.`);
      setQuantidade('');
      setObservacao('');
      setMaterialId('');
      await refetch();
    } catch (err: any) {
      toast.error(err.message || 'Não foi possível registrar a retirada.');
    } finally {
      setEnviando(false);
    }
  }

  async function devolver(emp: EmprestimoT) {
    setDevolvendo(emp.id);
    try {
      await api.post(`/api/emprestimos/${emp.id}/devolver`, {});
      toast.success(`Devolução de ${emp.tomador_nome} registrada.`);
      await refetch();
      if (historico) setHistorico(null);
    } catch (err: any) {
      toast.error(err.message || 'Não foi possível registrar a devolução.');
    } finally {
      setDevolvendo(null);
    }
  }

  async function abrirHistorico() {
    setHistoricoAberto(true);
    if (historico) return;
    try {
      const r = await api.get<{ emprestimos: EmprestimoT[] }>(`/api/estoques/${deposito.id}/emprestimos`);
      setHistorico(r.emprestimos);
    } catch (err: any) {
      toast.error(err.message || 'Não foi possível carregar o histórico.');
    }
  }

  function preencherTomador(valor: string) {
    // Sugestão escolhida no formato "Nome — referência".
    const [nome, ref] = valor.split(' — ');
    setTomadorNome(nome);
    if (ref !== undefined) setTomadorRef(ref);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold text-[var(--text)]">{deposito.nome}</h1>
          <p className="text-sm text-[var(--text-muted)]">
            {MODO_LABELS.emprestimo.descricao} Prazo padrão: <strong className="text-[var(--text)]">{deposito.prazo_padrao_horas ?? 2} h</strong>.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" icon={<History size={16} />} onClick={abrirHistorico}>
            Histórico
          </Button>
          {!podeOperar && <Badge variant="neutral">Só consulta</Badge>}
        </div>
      </div>

      <Reveal className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <RevealItem>
          <StatCard label="Na rua" value={totalPendentes} icon={<PackageOpen size={20} />} accent="brand" sublabel="retiradas pendentes de devolução" />
        </RevealItem>
        <RevealItem>
          <StatCard label="Atrasadas" value={atrasados} icon={<AlertTriangle size={20} />} accent="red" sublabel={atrasados > 0 ? 'passaram do prazo' : 'nenhuma fora do prazo'} />
        </RevealItem>
        <RevealItem>
          <StatCard label="Disponíveis" value={disponiveis.length} icon={<Check size={20} />} accent="green" sublabel={`de ${materials.length} materiais neste estoque`} />
        </RevealItem>
      </Reveal>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <Card className="p-5 lg:col-span-2">
          <p className="mb-4 text-sm font-bold text-[var(--text)]">Nova retirada</p>
          {podeOperar ? (
            <form onSubmit={retirar} className="space-y-4">
              <div className="relative">
                <User size={16} className="pointer-events-none absolute left-3 top-[38px] text-[var(--text-muted)]" />
                <Input label="Quem está retirando" required value={tomadorNome} onChange={(e) => preencherTomador(e.target.value)} className="pl-9" list={`tomadores-${deposito.id}`} maxLength={80} placeholder="Nome" autoComplete="off" />
                <datalist id={`tomadores-${deposito.id}`}>
                  {sugestoes.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              </div>
              <Input label="Referência (matrícula, turma, setor)" value={tomadorRef} onChange={(e) => setTomadorRef(e.target.value)} maxLength={40} placeholder="Opcional" />
              <MaterialPicker label="Material" required materials={disponiveis.length > 0 ? disponiveis : materials} value={materialId} onChange={setMaterialId} depositoId={deposito.id} />
              {material && (
                <p className="text-xs text-[var(--text-muted)]">
                  Disponível aqui: <strong className="text-[var(--text)]">{formatNumber(saldoEm(material, deposito.id))} {material.unidade_medida}</strong>
                </p>
              )}
              <div className="grid grid-cols-2 gap-3">
                <Input label="Quantidade" required type="number" step="0.01" min="0.01" value={quantidade} onChange={(e) => setQuantidade(e.target.value)} />
                <Input label="Prazo (horas)" required type="number" step="0.5" min="0.5" max="8760" value={prazoHoras} onChange={(e) => setPrazoHoras(e.target.value)} />
              </div>
              <Textarea label="Observação" rows={2} value={observacao} onChange={(e) => setObservacao(e.target.value)} maxLength={300} placeholder="Opcional: para que vai usar, estado do material..." />
              <Button type="submit" fullWidth loading={enviando} icon={!enviando ? <Timer size={16} /> : undefined}>
                Registrar retirada
              </Button>
            </form>
          ) : (
            <p className="text-sm text-[var(--text-muted)]">Você tem acesso de consulta a este estoque. Para registrar retiradas e devoluções, peça ao administrador o nível “Opera” em Configurações.</p>
          )}
        </Card>

        <Card className="p-5 lg:col-span-3">
          <CardHeader icon={<Clock size={15} />} title={`Pendentes de devolução (${totalPendentes})`} />
          <div className="relative my-3">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome, referência ou material..."
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] py-2 pl-9 pr-3 text-sm outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/20"
            />
          </div>
          <ul className="max-h-[480px] divide-y divide-[var(--border)] overflow-y-auto">
            {pendentes.length === 0 && <EmptyState icon={<PackageOpen size={20} />} title="Nada na rua" subtitle="Toda retirada registrada aqui aparece nesta lista até ser devolvida." />}
            {pendentes.map((e) => {
              const prazo = prazoLegivel(e.prazo_em, agora);
              const falta = Number(e.quantidade) - Number(e.quantidade_devolvida);
              return (
                <li key={e.id} className="flex items-center gap-3 py-3">
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${prazo.atrasado ? 'bg-[var(--vermelho)]/15 text-[var(--vermelho)]' : 'bg-[var(--brand)]/12 text-[var(--brand)]'}`}>
                    {prazo.atrasado ? <AlertTriangle size={16} /> : <Timer size={16} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-[var(--text)]">
                      {e.tomador_nome}
                      {e.tomador_referencia && <span className="font-normal text-[var(--text-muted)]"> · {e.tomador_referencia}</span>}
                    </p>
                    <p className="truncate text-xs text-[var(--text-muted)]">
                      {formatNumber(falta)} {e.unidade_medida} de {e.material_nome} · retirou {formatDateTime(e.retirado_em)}
                    </p>
                    <p className={`text-[11px] font-semibold ${prazo.atrasado ? 'text-[var(--vermelho)]' : 'text-[var(--text-muted)]'}`}>{prazo.texto}</p>
                  </div>
                  {podeOperar && (
                    <Button size="sm" variant={prazo.atrasado ? 'danger' : 'outline'} loading={devolvendo === e.id} onClick={() => devolver(e)} icon={devolvendo === e.id ? undefined : <Check size={14} />}>
                      Devolver
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      </div>

      <Modal open={historicoAberto} onClose={() => setHistoricoAberto(false)} title={`Histórico — ${deposito.nome}`} subtitle="Últimas 300 retiradas, mais novas primeiro" maxWidth="max-w-3xl">
        {historico === null ? (
          <p className="py-8 text-center text-sm text-[var(--text-muted)]">Carregando…</p>
        ) : historico.length === 0 ? (
          <EmptyState icon={<History size={20} />} title="Nenhuma retirada registrada ainda" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
                  <th className="pb-2 pr-3 font-semibold">Quem</th>
                  <th className="pb-2 pr-3 font-semibold">Material</th>
                  <th className="pb-2 pr-3 text-right font-semibold">Qtd.</th>
                  <th className="pb-2 pr-3 font-semibold">Retirada</th>
                  <th className="pb-2 pr-3 font-semibold">Devolução</th>
                  <th className="pb-2 font-semibold">Registrou</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {historico.map((e) => {
                  const devolvido = Boolean(e.devolvido_em);
                  const atrasou = devolvido ? new Date(e.devolvido_em as string).getTime() > new Date(e.prazo_em).getTime() : new Date(e.prazo_em).getTime() < agora.getTime();
                  return (
                    <tr key={e.id}>
                      <td className="py-2 pr-3">
                        <span className="font-medium text-[var(--text)]">{e.tomador_nome}</span>
                        {e.tomador_referencia && <span className="text-[var(--text-muted)]"> · {e.tomador_referencia}</span>}
                      </td>
                      <td className="py-2 pr-3 text-[var(--text)]">{e.material_nome}</td>
                      <td className="py-2 pr-3 text-right tabular-nums text-[var(--text)]">
                        {formatNumber(Number(e.quantidade))} {e.unidade_medida}
                      </td>
                      <td className="py-2 pr-3 text-xs text-[var(--text-muted)]">{formatDateTime(e.retirado_em)}</td>
                      <td className="py-2 pr-3 text-xs">
                        {devolvido ? (
                          <span className={atrasou ? 'text-[var(--amarelo)]' : 'text-[var(--verde)]'}>
                            {formatDateTime(e.devolvido_em as string)}
                            {atrasou ? ' (com atraso)' : ''}
                          </span>
                        ) : (
                          <span className={atrasou ? 'font-semibold text-[var(--vermelho)]' : 'text-[var(--text-muted)]'}>{atrasou ? 'atrasada' : 'pendente'}</span>
                        )}
                      </td>
                      <td className="py-2 text-xs text-[var(--text-muted)]">{staffName(e.retirada_matricula, staff)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Modal>
    </div>
  );
}
