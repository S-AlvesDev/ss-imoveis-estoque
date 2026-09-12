import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Check, FileText, HandCoins, History, PenLine, RefreshCw, Search, ShieldCheck, User, Users } from 'lucide-react';
import { Card, CardHeader } from '@/shared/ui/Card';
import { StatCard } from '@/shared/ui/StatCard';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { Input, Textarea } from '@/shared/ui/Field';
import { Modal } from '@/shared/ui/Modal';
import { EmptyState } from '@/shared/ui/EmptyState';
import { Reveal, RevealItem } from '@/shared/ui/Reveal';
import { MaterialPicker } from '@/shared/ui/MaterialPicker';
import { SignaturePad } from '@/shared/ui/SignaturePad';
import { api } from '@/lib/api';
import type { Deposito, Emprestimo as EntregaT, Material, StaffUser } from '@/shared/types';
import { formatDateTime, formatNumber, saldoEm, staffName } from '@/features/estoque/utils';
import { MODO_LABELS } from '@/shared/constants';
import { buscaInicial } from '@/store/busca';
import { nomeDaOrganizacao } from '@/store/marca';

interface EntregaProps {
  deposito: Deposito;
  materials: Material[];
  /** As entregas abertas deste estoque (vêm no /api/data junto com os empréstimos). */
  emprestimos: EntregaT[];
  staff: StaffUser[];
  refetch: () => Promise<void>;
  podeOperar: boolean;
}

const DIA_MS = 24 * 60 * 60 * 1000;
/** Uma troca "vencendo" é a que vence dentro deste prazo. */
const AVISO_DIAS = 30;

type Situacao = 'vencida' | 'vencendo' | 'ok' | 'sem-prazo';

function situacao(e: EntregaT, agora: Date): Situacao {
  if (!e.prazo_em) return 'sem-prazo';
  const fim = new Date(e.prazo_em).getTime();
  if (fim < agora.getTime()) return 'vencida';
  if (fim <= agora.getTime() + AVISO_DIAS * DIA_MS) return 'vencendo';
  return 'ok';
}

const fmtData = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' });

/** "troca vencida há 3 dias", "trocar em 12 dias (15/10/2026)", "sem troca programada". */
function prazoLegivel(e: EntregaT, agora: Date): string {
  if (!e.prazo_em) return 'sem troca programada';
  const dias = Math.round((new Date(e.prazo_em).getTime() - agora.getTime()) / DIA_MS);
  if (dias < 0) return `troca vencida há ${-dias === 1 ? '1 dia' : `${-dias} dias`}`;
  if (dias === 0) return `trocar hoje (${fmtData.format(new Date(e.prazo_em))})`;
  return `trocar em ${dias === 1 ? '1 dia' : `${dias} dias`} (${fmtData.format(new Date(e.prazo_em))})`;
}

const COR: Record<Situacao, string> = {
  vencida: 'bg-[var(--vermelho)]/15 text-[var(--vermelho)]',
  vencendo: 'bg-[var(--amarelo)]/15 text-[var(--amarelo)]',
  ok: 'bg-[var(--verde)]/15 text-[var(--verde)]',
  'sem-prazo': 'bg-[var(--brand)]/12 text-[var(--brand)]',
};

interface Pessoa {
  chave: string;
  nome: string;
  referencia: string | null;
  entregas: EntregaT[];
  vencidas: number;
  vencendo: number;
}

/** Como uma entrega deixa de estar com a pessoa. */
type Encerramento = 'devolvido' | 'consumido' | 'substituido';

const ENCERRAMENTOS: Array<{ value: Encerramento; titulo: string; descricao: string; icone: React.ReactNode }> = [
  { value: 'substituido', titulo: 'Trocar por um novo', descricao: 'Fecha esta entrega e registra outra igual, para a mesma pessoa. É a troca de EPI vencido ou gasto.', icone: <RefreshCw size={16} /> },
  { value: 'devolvido', titulo: 'Devolveu ao estoque', descricao: 'A pessoa saiu ou não usa mais; o item volta ao saldo em bom estado.', icone: <Check size={16} /> },
  { value: 'consumido', titulo: 'Consumido / perdido', descricao: 'Não volta: foi gasto, quebrou ou se perdeu. Só sai da ficha.', icone: <HandCoins size={16} /> },
];

/**
 * A tela de um estoque no modo entrega. Capacete, luva, uniforme, crachá:
 * o que sai não volta — o que se cobra é a troca quando vence. Cada pessoa
 * tem uma ficha com o que recebeu; a assinatura fica guardada e sai no
 * termo em PDF.
 */
export function Entrega({ deposito, materials, emprestimos, staff, refetch, podeOperar }: EntregaProps) {
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  // formulário
  const [tomadorNome, setTomadorNome] = useState('');
  const [tomadorRef, setTomadorRef] = useState('');
  const [materialId, setMaterialId] = useState('');
  const [quantidade, setQuantidade] = useState('');
  const [observacao, setObservacao] = useState('');
  const [assinatura, setAssinatura] = useState<string | null>(null);
  const [assinaturaKey, setAssinaturaKey] = useState(0);
  const [enviando, setEnviando] = useState(false);

  // fichas
  const [busca, setBusca] = useState(buscaInicial);
  const [filtro, setFiltro] = useState<'todas' | 'vencidas' | 'vencendo'>('todas');
  const [pessoaAberta, setPessoaAberta] = useState<string | null>(null);

  // encerramento
  const [encerrando, setEncerrando] = useState<EntregaT | null>(null);
  const [modoEncerrar, setModoEncerrar] = useState<Encerramento>('substituido');
  const [detalhe, setDetalhe] = useState('');
  const [assinaturaTroca, setAssinaturaTroca] = useState<string | null>(null);
  const [salvandoEncerramento, setSalvandoEncerramento] = useState(false);

  // histórico
  const [historicoAberto, setHistoricoAberto] = useState(false);
  const [historico, setHistorico] = useState<EntregaT[] | null>(null);

  const daqui = useMemo(() => emprestimos.filter((e) => e.warehouse_id === deposito.id && e.tipo === 'entrega'), [emprestimos, deposito.id]);

  const pessoas = useMemo<Pessoa[]>(() => {
    const mapa = new Map<string, Pessoa>();
    for (const e of daqui) {
      const chave = `${e.tomador_nome.trim().toLowerCase()}|${(e.tomador_referencia ?? '').trim().toLowerCase()}`;
      let p = mapa.get(chave);
      if (!p) {
        p = { chave, nome: e.tomador_nome, referencia: e.tomador_referencia, entregas: [], vencidas: 0, vencendo: 0 };
        mapa.set(chave, p);
      }
      p.entregas.push(e);
      const s = situacao(e, agora);
      if (s === 'vencida') p.vencidas++;
      if (s === 'vencendo') p.vencendo++;
    }
    for (const p of mapa.values()) {
      p.entregas.sort((a, b) => (a.prazo_em ?? '9999').localeCompare(b.prazo_em ?? '9999'));
    }
    // Quem tem troca vencida primeiro; depois quem tem vencendo; depois por nome.
    return [...mapa.values()].sort((a, b) => b.vencidas - a.vencidas || b.vencendo - a.vencendo || a.nome.localeCompare(b.nome));
  }, [daqui, agora]);

  const pessoasFiltradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return pessoas.filter((p) => {
      if (filtro === 'vencidas' && p.vencidas === 0) return false;
      if (filtro === 'vencendo' && p.vencendo === 0) return false;
      if (!q) return true;
      return p.nome.toLowerCase().includes(q) || (p.referencia ?? '').toLowerCase().includes(q) || p.entregas.some((e) => e.material_nome.toLowerCase().includes(q));
    });
  }, [pessoas, busca, filtro]);

  const totalVencidas = useMemo(() => daqui.filter((e) => situacao(e, agora) === 'vencida').length, [daqui, agora]);
  const totalVencendo = useMemo(() => daqui.filter((e) => situacao(e, agora) === 'vencendo').length, [daqui, agora]);
  const disponiveis = useMemo(() => materials.filter((m) => saldoEm(m, deposito.id) > 0), [materials, deposito.id]);
  const material = materials.find((m) => String(m.id) === materialId);

  const sugestoes = useMemo(() => {
    const vistos = new Map<string, string>();
    for (const e of [...emprestimos, ...(historico ?? [])]) {
      const chave = e.tomador_nome.trim().toLowerCase();
      if (!vistos.has(chave)) vistos.set(chave, e.tomador_referencia ? `${e.tomador_nome} — ${e.tomador_referencia}` : e.tomador_nome);
    }
    return [...vistos.values()].slice(0, 50);
  }, [emprestimos, historico]);

  function preencherTomador(valor: string) {
    const [nome, ref] = valor.split(' — ');
    setTomadorNome(nome);
    if (ref !== undefined) setTomadorRef(ref);
  }

  async function entregar(e: React.FormEvent) {
    e.preventDefault();
    if (!materialId) return toast.error('Escolha o material.');
    if (deposito.exige_assinatura && !assinatura) return toast.error('Este estoque exige a assinatura de quem recebe.');
    setEnviando(true);
    try {
      await api.post(`/api/estoques/${deposito.id}/entregas`, {
        material_id: Number(materialId),
        quantidade: Number(quantidade),
        tomador_nome: tomadorNome,
        tomador_referencia: tomadorRef || null,
        observacao: observacao || null,
        assinatura,
      });
      toast.success(`Entrega registrada para ${tomadorNome.trim()}.`);
      setQuantidade('');
      setObservacao('');
      setMaterialId('');
      setAssinatura(null);
      setAssinaturaKey((k) => k + 1);
      await refetch();
      if (historico) setHistorico(null);
    } catch (err: any) {
      toast.error(err.message || 'Não foi possível registrar a entrega.');
    } finally {
      setEnviando(false);
    }
  }

  function abrirEncerramento(ent: EntregaT, modo: Encerramento = 'substituido') {
    setEncerrando(ent);
    setModoEncerrar(modo);
    setDetalhe('');
    setAssinaturaTroca(null);
  }

  async function confirmarEncerramento() {
    if (!encerrando) return;
    if (modoEncerrar === 'substituido' && deposito.exige_assinatura && !assinaturaTroca) return toast.error('A troca precisa da assinatura de quem recebe o novo.');
    setSalvandoEncerramento(true);
    try {
      await api.post(`/api/entregas/${encerrando.id}/encerrar`, { modo: modoEncerrar, detalhe: detalhe || null, assinatura: modoEncerrar === 'substituido' ? assinaturaTroca : null });
      toast.success(modoEncerrar === 'substituido' ? `Troca registrada para ${encerrando.tomador_nome}.` : modoEncerrar === 'devolvido' ? 'Devolução registrada.' : 'Entrega encerrada.');
      setEncerrando(null);
      await refetch();
      if (historico) setHistorico(null);
    } catch (err: any) {
      toast.error(err.message || 'Não foi possível encerrar a entrega.');
    } finally {
      setSalvandoEncerramento(false);
    }
  }

  async function abrirHistorico() {
    setHistoricoAberto(true);
    if (historico) return;
    try {
      const r = await api.get<{ entregas: EntregaT[] }>(`/api/estoques/${deposito.id}/entregas`);
      setHistorico(r.entregas);
    } catch (err: any) {
      toast.error(err.message || 'Não foi possível carregar o histórico.');
    }
  }

  /** O termo de responsabilidade de uma pessoa: o que ela tem em mãos, com as assinaturas. */
  async function gerarTermo(p: Pessoa) {
    try {
      const { default: jsPDF } = await import('jspdf');
      const autoTable = (await import('jspdf-autotable')).default;
      const doc = new jsPDF();
      const org = nomeDaOrganizacao();
      doc.setFontSize(15);
      doc.text('Termo de entrega e responsabilidade', 14, 18);
      doc.setFontSize(10);
      doc.text(`${org} — ${deposito.nome}`, 14, 25);
      doc.text(`Recebedor(a): ${p.nome}${p.referencia ? ` (${p.referencia})` : ''}`, 14, 31);
      doc.text(`Emitido em ${formatDateTime(new Date().toISOString())}`, 14, 37);
      doc.setFontSize(9);
      doc.text(
        doc.splitTextToSize(
          'Declaro ter recebido os itens abaixo em perfeitas condições, comprometendo-me a usá-los conforme orientado, conservá-los e comunicar qualquer dano, extravio ou vencimento para a devida troca.',
          182,
        ),
        14,
        44,
      );
      autoTable(doc, {
        startY: 56,
        head: [['Item', 'Qtd.', 'Entregue em', 'Trocar até', 'Registrou']],
        body: p.entregas.map((e) => [
          e.material_nome,
          `${formatNumber(Number(e.quantidade))} ${e.unidade_medida}`,
          formatDateTime(e.retirado_em),
          e.prazo_em ? fmtData.format(new Date(e.prazo_em)) : '—',
          staffName(e.retirada_matricula, staff),
        ]),
        styles: { fontSize: 9 },
        headStyles: { fillColor: [17, 24, 39] },
      });
      let y = (doc as any).lastAutoTable.finalY + 10;
      const assinadas = p.entregas.filter((e) => e.assinatura);
      if (assinadas.length > 0) {
        doc.setFontSize(10);
        doc.text('Assinaturas registradas na entrega:', 14, y);
        y += 4;
        for (const e of assinadas) {
          if (y + 30 > 285) {
            doc.addPage();
            y = 20;
          }
          doc.addImage(e.assinatura as string, 'PNG', 14, y, 60, 20);
          doc.setFontSize(8);
          doc.text(`${e.material_nome} — ${formatDateTime(e.retirado_em)}`, 78, y + 12);
          y += 26;
        }
      } else {
        if (y + 30 > 285) {
          doc.addPage();
          y = 20;
        }
        doc.line(14, y + 16, 90, y + 16);
        doc.setFontSize(8);
        doc.text(`Assinatura — ${p.nome}`, 14, y + 21);
      }
      doc.save(`termo-${p.nome.replace(/\s+/g, '-').toLowerCase()}-${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (err: any) {
      toast.error(err.message || 'Não foi possível gerar o termo.');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold text-[var(--text)]">{deposito.nome}</h1>
          <p className="text-sm text-[var(--text-muted)]">
            {MODO_LABELS.entrega.descricao}
            {deposito.exige_assinatura && (
              <>
                {' '}
                <span className="inline-flex items-center gap-1 text-[var(--text)]">
                  <ShieldCheck size={13} className="text-[var(--verde)]" /> Exige assinatura.
                </span>
              </>
            )}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" icon={<History size={16} />} onClick={abrirHistorico}>
            Histórico
          </Button>
          {!podeOperar && <Badge variant="neutral">Só consulta</Badge>}
        </div>
      </div>

      <Reveal className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <RevealItem>
          <StatCard label="Com as pessoas" value={daqui.length} icon={<Users size={20} />} accent="brand" sublabel={`${pessoas.length} ${pessoas.length === 1 ? 'pessoa' : 'pessoas'} com itens`} />
        </RevealItem>
        <RevealItem>
          <StatCard label="Trocas vencidas" value={totalVencidas} icon={<AlertTriangle size={20} />} accent="red" sublabel={totalVencidas > 0 ? 'passaram da validade' : 'nenhuma vencida'} />
        </RevealItem>
        <RevealItem>
          <StatCard label="Vencendo" value={totalVencendo} icon={<RefreshCw size={20} />} accent="amber" sublabel={`trocar em ${AVISO_DIAS} dias`} />
        </RevealItem>
        <RevealItem>
          <StatCard label="Disponíveis" value={disponiveis.length} icon={<Check size={20} />} accent="green" sublabel={`de ${materials.length} materiais aqui`} />
        </RevealItem>
      </Reveal>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <Card className="p-5 lg:col-span-2">
          <p className="mb-4 text-sm font-bold text-[var(--text)]">Nova entrega</p>
          {podeOperar ? (
            <form onSubmit={entregar} className="space-y-4">
              <div className="relative">
                <User size={16} className="pointer-events-none absolute left-3 top-[38px] text-[var(--text-muted)]" />
                <Input label="Quem está recebendo" required value={tomadorNome} onChange={(e) => preencherTomador(e.target.value)} className="pl-9" list={`recebedores-${deposito.id}`} maxLength={80} placeholder="Nome" autoComplete="off" />
                <datalist id={`recebedores-${deposito.id}`}>
                  {sugestoes.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              </div>
              <Input label="Referência (matrícula, setor, função)" value={tomadorRef} onChange={(e) => setTomadorRef(e.target.value)} maxLength={40} placeholder="Opcional" />
              <MaterialPicker label="Material" required materials={disponiveis.length > 0 ? disponiveis : materials} value={materialId} onChange={setMaterialId} depositoId={deposito.id} />
              {material && (
                <p className="text-xs text-[var(--text-muted)]">
                  Disponível aqui: <strong className="text-[var(--text)]">{formatNumber(saldoEm(material, deposito.id))} {material.unidade_medida}</strong>
                  {' · '}
                  {material.validade_troca_dias ? (
                    <>
                      troca a cada <strong className="text-[var(--text)]">{material.validade_troca_dias} dias</strong>
                    </>
                  ) : (
                    <span>sem validade de troca (defina em Materiais)</span>
                  )}
                </p>
              )}
              <Input label="Quantidade" required type="number" step="0.01" min="0.01" value={quantidade} onChange={(e) => setQuantidade(e.target.value)} />
              <Textarea label="Observação" rows={2} value={observacao} onChange={(e) => setObservacao(e.target.value)} maxLength={300} placeholder="Opcional: tamanho, CA do EPI, condição..." />
              <SignaturePad required={deposito.exige_assinatura} onChange={setAssinatura} resetKey={assinaturaKey} />
              <Button type="submit" fullWidth loading={enviando} icon={!enviando ? <PenLine size={16} /> : undefined}>
                Registrar entrega
              </Button>
            </form>
          ) : (
            <p className="text-sm text-[var(--text-muted)]">Você tem acesso de consulta a este estoque. Para registrar entregas e trocas, peça ao administrador o nível “Opera” em Configurações.</p>
          )}
        </Card>

        <Card className="p-5 lg:col-span-3">
          <CardHeader icon={<Users size={15} />} title={`Fichas por pessoa (${pessoas.length})`} />
          <div className="my-3 flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por nome, referência ou material..."
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] py-2 pl-9 pr-3 text-sm outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/20"
              />
            </div>
            <div className="flex gap-1">
              {(
                [
                  ['todas', 'Todas'],
                  ['vencidas', 'Vencidas'],
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

          <ul className="max-h-[560px] divide-y divide-[var(--border)] overflow-y-auto">
            {pessoasFiltradas.length === 0 && (
              <EmptyState icon={<Users size={20} />} title={pessoas.length === 0 ? 'Ninguém com itens ainda' : 'Nenhuma ficha com esse filtro'} subtitle={pessoas.length === 0 ? 'Cada entrega registrada aparece na ficha de quem recebeu.' : undefined} />
            )}
            {pessoasFiltradas.map((p) => {
              const aberta = pessoaAberta === p.chave;
              return (
                <li key={p.chave} className="py-2">
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => setPessoaAberta(aberta ? null : p.chave)} aria-expanded={aberta} className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-1 py-1.5 text-left hover:bg-[var(--bg-2)]">
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${p.vencidas > 0 ? COR.vencida : p.vencendo > 0 ? COR.vencendo : COR.ok}`}>
                        <User size={16} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-[var(--text)]">
                          {p.nome}
                          {p.referencia && <span className="font-normal text-[var(--text-muted)]"> · {p.referencia}</span>}
                        </p>
                        <p className="truncate text-xs text-[var(--text-muted)]">
                          {p.entregas.length} {p.entregas.length === 1 ? 'item' : 'itens'}
                          {p.vencidas > 0 && <span className="font-semibold text-[var(--vermelho)]"> · {p.vencidas} com troca vencida</span>}
                          {p.vencendo > 0 && <span className="font-semibold text-[var(--amarelo)]"> · {p.vencendo} vencendo</span>}
                        </p>
                      </div>
                    </button>
                    <Button size="sm" variant="ghost" icon={<FileText size={14} />} onClick={() => gerarTermo(p)}>
                      Termo
                    </Button>
                  </div>
                  {aberta && (
                    <ul className="ml-12 mt-1 space-y-1.5 pb-1">
                      {p.entregas.map((e) => {
                        const s = situacao(e, agora);
                        return (
                          <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg bg-[var(--bg-2)] px-3 py-2">
                            <div className="min-w-[180px] flex-1">
                              <p className="text-sm text-[var(--text)]">
                                <strong>{formatNumber(Number(e.quantidade))} {e.unidade_medida}</strong> de {e.material_nome}
                                {e.assinatura && <PenLine size={12} className="ml-1.5 inline text-[var(--text-muted)]" aria-label="Assinado" />}
                              </p>
                              <p className="text-[11px] text-[var(--text-muted)]">
                                entregue {formatDateTime(e.retirado_em)} · <span className={s === 'vencida' ? 'font-semibold text-[var(--vermelho)]' : s === 'vencendo' ? 'font-semibold text-[var(--amarelo)]' : ''}>{prazoLegivel(e, agora)}</span>
                                {e.observacao && <> · {e.observacao}</>}
                              </p>
                            </div>
                            {podeOperar && (
                              <>
                                <Button size="sm" variant={s === 'vencida' ? 'danger' : 'outline'} icon={<RefreshCw size={13} />} onClick={() => abrirEncerramento(e, 'substituido')}>
                                  Trocar
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => abrirEncerramento(e, 'devolvido')}>
                                  Encerrar
                                </Button>
                              </>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      </div>

      <Modal open={encerrando !== null} onClose={() => setEncerrando(null)} title={encerrando ? `${encerrando.material_nome} — ${encerrando.tomador_nome}` : ''} subtitle="Como esta entrega termina?">
        {encerrando && (
          <div className="space-y-4">
            <div className="space-y-2">
              {ENCERRAMENTOS.map((op) => (
                <button
                  key={op.value}
                  type="button"
                  onClick={() => setModoEncerrar(op.value)}
                  className={`flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors ${modoEncerrar === op.value ? 'border-[var(--brand)] bg-[var(--brand)]/5' : 'border-[var(--border)] hover:bg-[var(--bg-2)]'}`}
                >
                  <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${modoEncerrar === op.value ? 'bg-[var(--brand)] text-white' : 'bg-[var(--bg-2)] text-[var(--text-muted)]'}`}>{op.icone}</span>
                  <span>
                    <span className="block text-sm font-semibold text-[var(--text)]">{op.titulo}</span>
                    <span className="block text-xs text-[var(--text-muted)]">{op.descricao}</span>
                  </span>
                </button>
              ))}
            </div>
            <Textarea label="Detalhe" rows={2} value={detalhe} onChange={(e) => setDetalhe(e.target.value)} maxLength={200} placeholder="Opcional: motivo, estado do item..." />
            {modoEncerrar === 'substituido' && (
              <>
                <p className="text-xs text-[var(--text-muted)]">
                  Sai mais <strong className="text-[var(--text)]">{formatNumber(Number(encerrando.quantidade) - Number(encerrando.quantidade_devolvida))} {encerrando.unidade_medida}</strong> do estoque; a nova entrega recebe uma validade nova.
                </p>
                <SignaturePad required={deposito.exige_assinatura} onChange={setAssinaturaTroca} resetKey={encerrando.id} />
              </>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setEncerrando(null)}>
                Cancelar
              </Button>
              <Button loading={salvandoEncerramento} onClick={confirmarEncerramento}>
                Confirmar
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={historicoAberto} onClose={() => setHistoricoAberto(false)} title={`Histórico — ${deposito.nome}`} subtitle="Últimas 500 entregas, mais novas primeiro" maxWidth="max-w-3xl">
        {historico === null ? (
          <p className="py-8 text-center text-sm text-[var(--text-muted)]">Carregando…</p>
        ) : historico.length === 0 ? (
          <EmptyState icon={<History size={20} />} title="Nenhuma entrega registrada ainda" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
                  <th className="pb-2 pr-3 font-semibold">Quem</th>
                  <th className="pb-2 pr-3 font-semibold">Material</th>
                  <th className="pb-2 pr-3 text-right font-semibold">Qtd.</th>
                  <th className="pb-2 pr-3 font-semibold">Entrega</th>
                  <th className="pb-2 pr-3 font-semibold">Situação</th>
                  <th className="pb-2 font-semibold">Registrou</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {historico.map((e) => {
                  const s = situacao(e, agora);
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
                        {e.devolvido_em ? (
                          <span className="text-[var(--verde)]">devolvida {formatDateTime(e.devolvido_em)}</span>
                        ) : e.encerrado_em ? (
                          <span className="text-[var(--text-muted)]">
                            {e.encerramento === 'substituido' ? 'trocada' : 'consumida'} {formatDateTime(e.encerrado_em)}
                          </span>
                        ) : (
                          <span className={s === 'vencida' ? 'font-semibold text-[var(--vermelho)]' : s === 'vencendo' ? 'font-semibold text-[var(--amarelo)]' : 'text-[var(--text-muted)]'}>{s === 'sem-prazo' ? 'em uso' : prazoLegivel(e, agora)}</span>
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
