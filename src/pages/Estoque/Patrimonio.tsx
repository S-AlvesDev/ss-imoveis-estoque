import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { Archive, ArrowLeftRight, Check, History, Landmark, MoreHorizontal, Pencil, Plus, Search, User, Wrench } from 'lucide-react';
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
import type { Deposito, EstadoDoItem, EventoDoItem, Item, Material, StaffUser } from '@/shared/types';
import { formatDateTime, staffName } from '@/features/estoque/utils';
import { ESTADO_DO_ITEM, MODO_LABELS } from '@/shared/constants';
import { buscaInicial } from '@/store/busca';

interface PatrimonioProps {
  deposito: Deposito;
  materials: Material[];
  /** Os itens deste estoque (vêm no /api/data), inclusive baixados. */
  itens: Item[];
  staff: StaffUser[];
  refetch: () => Promise<void>;
  podeOperar: boolean;
}

type TipoEvento = 'alocacao' | 'devolucao' | 'manutencao' | 'retorno' | 'baixa';

const BADGE: Record<EstadoDoItem, 'success' | 'info' | 'warning' | 'neutral'> = { disponivel: 'success', em_uso: 'info', manutencao: 'warning', baixado: 'neutral' };

/** Que eventos cada estado aceita — espelho de TRANSICOES no servidor, para o menu só oferecer o que vale. */
const EVENTOS_DO_ESTADO: Record<EstadoDoItem, TipoEvento[]> = {
  disponivel: ['alocacao', 'manutencao', 'baixa'],
  em_uso: ['devolucao', 'manutencao', 'baixa'],
  manutencao: ['retorno', 'baixa'],
  baixado: [],
};

const EVENTO: Record<TipoEvento, { titulo: string; descricao: string; icone: React.ReactNode; botao: string }> = {
  alocacao: { titulo: 'Entregar a alguém', descricao: 'O item passa a ficar com uma pessoa ou setor.', icone: <User size={16} />, botao: 'Entregar' },
  devolucao: { titulo: 'Receber de volta', descricao: 'A pessoa devolveu; o item fica disponível.', icone: <Check size={16} />, botao: 'Receber' },
  manutencao: { titulo: 'Mandar para manutenção', descricao: 'Sai de circulação até voltar do conserto.', icone: <Wrench size={16} />, botao: 'Mandar' },
  retorno: { titulo: 'Voltou da manutenção', descricao: 'Consertado; fica disponível de novo.', icone: <ArrowLeftRight size={16} />, botao: 'Registrar retorno' },
  baixa: { titulo: 'Dar baixa', descricao: 'Fim da vida do item: quebrou, foi doado, vendido ou perdido. Não volta.', icone: <Archive size={16} />, botao: 'Dar baixa' },
};

const TIPO_LABEL: Record<EventoDoItem['tipo'], string> = {
  cadastro: 'Cadastrado',
  alocacao: 'Entregue',
  devolucao: 'Devolvido',
  manutencao: 'Para manutenção',
  retorno: 'Voltou da manutenção',
  baixa: 'Baixado',
  transferencia: 'Transferido',
  edicao: 'Dados alterados',
};

/** Altura máxima do menu de ações (5 itens), para decidir se abre para cima. */
const ALTURA_DO_MENU = 200;

const fmtMoeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtData = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' });

interface FormItem {
  material_id: string;
  codigo: string;
  serie: string;
  local: string;
  adquirido_em: string;
  valor: string;
  observacao: string;
}

const FORM_VAZIO: FormItem = { material_id: '', codigo: '', serie: '', local: '', adquirido_em: '', valor: '', observacao: '' };

/**
 * A tela de um estoque no modo patrimônio. Notebook, projetor, cadeira,
 * furadeira: cada item tem número próprio e uma vida — cadastrado,
 * entregue a alguém, devolvido, na manutenção, baixado. O material é só o
 * modelo; o saldo dele acompanha quantos itens ainda existem.
 */
export function Patrimonio({ deposito, materials, itens, staff, refetch, podeOperar }: PatrimonioProps) {
  const daqui = useMemo(() => itens.filter((i) => i.warehouse_id === deposito.id), [itens, deposito.id]);

  const [busca, setBusca] = useState(buscaInicial);
  const [filtro, setFiltro] = useState<EstadoDoItem | 'ativos'>('ativos');

  // cadastro / edição
  const [formAberto, setFormAberto] = useState(false);
  const [editando, setEditando] = useState<Item | null>(null);
  const [form, setForm] = useState<FormItem>(FORM_VAZIO);
  const [salvando, setSalvando] = useState(false);

  // evento
  const [alvo, setAlvo] = useState<Item | null>(null);
  const [tipoEvento, setTipoEvento] = useState<TipoEvento>('alocacao');
  const [paraNome, setParaNome] = useState('');
  const [paraRef, setParaRef] = useState('');
  const [detalhe, setDetalhe] = useState('');
  const [registrando, setRegistrando] = useState(false);

  // histórico de um item
  const [historicoDe, setHistoricoDe] = useState<Item | null>(null);
  const [eventos, setEventos] = useState<EventoDoItem[] | null>(null);

  // Menu de ações aberto: qual item e onde ancorar. Vai num portal com
  // position fixed porque a tabela rola na horizontal, e o overflow cortaria
  // um menu absoluto dentro dela.
  const [menu, setMenu] = useState<{ id: string; top?: number; bottom?: number; right: number } | null>(null);
  useEffect(() => {
    if (!menu) return;
    const fechar = () => setMenu(null);
    document.addEventListener('click', fechar);
    window.addEventListener('scroll', fechar, true);
    window.addEventListener('resize', fechar);
    return () => {
      document.removeEventListener('click', fechar);
      window.removeEventListener('scroll', fechar, true);
      window.removeEventListener('resize', fechar);
    };
  }, [menu]);
  const itemDoMenu = menu ? daqui.find((i) => i.id === menu.id) ?? null : null;

  const contagem = useMemo(() => {
    const c: Record<EstadoDoItem, number> = { disponivel: 0, em_uso: 0, manutencao: 0, baixado: 0 };
    for (const i of daqui) c[i.estado]++;
    return c;
  }, [daqui]);

  const listados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return daqui.filter((i) => {
      if (filtro === 'ativos' ? i.estado === 'baixado' : i.estado !== filtro) return false;
      if (!q) return true;
      return [i.codigo, i.material_nome, i.serie ?? '', i.responsavel_nome ?? '', i.responsavel_referencia ?? '', i.local ?? ''].some((t) => t.toLowerCase().includes(q));
    });
  }, [daqui, busca, filtro]);

  // Quem já recebeu item antes vira sugestão.
  const sugestoes = useMemo(() => {
    const vistos = new Map<string, string>();
    for (const i of daqui) {
      if (!i.responsavel_nome) continue;
      const chave = i.responsavel_nome.trim().toLowerCase();
      if (!vistos.has(chave)) vistos.set(chave, i.responsavel_referencia ? `${i.responsavel_nome} — ${i.responsavel_referencia}` : i.responsavel_nome);
    }
    return [...vistos.values()].slice(0, 50);
  }, [daqui]);

  function abrirCadastro() {
    setEditando(null);
    setForm({ ...FORM_VAZIO, material_id: materials.length === 1 ? String(materials[0].id) : '' });
    setFormAberto(true);
  }

  function abrirEdicao(i: Item) {
    setEditando(i);
    setForm({ material_id: String(i.material_id), codigo: i.codigo, serie: i.serie ?? '', local: i.local ?? '', adquirido_em: i.adquirido_em ?? '', valor: i.valor == null ? '' : String(i.valor), observacao: i.observacao ?? '' });
    setFormAberto(true);
  }

  async function salvarItem(e: React.FormEvent) {
    e.preventDefault();
    if (!editando && !form.material_id) return toast.error('Escolha o modelo (material).');
    setSalvando(true);
    try {
      const corpo = { ...form, material_id: Number(form.material_id), valor: form.valor === '' ? null : Number(form.valor), adquirido_em: form.adquirido_em || null };
      if (editando) {
        await api.patch(`/api/patrimonio/${editando.id}`, corpo);
        toast.success(`Item ${form.codigo.trim()} atualizado.`);
      } else {
        await api.post(`/api/estoques/${deposito.id}/patrimonio`, corpo);
        toast.success(`Item ${form.codigo.trim()} cadastrado.`);
      }
      setFormAberto(false);
      await refetch();
    } catch (err: any) {
      toast.error(err.message || 'Não foi possível salvar o item.');
    } finally {
      setSalvando(false);
    }
  }

  function abrirEvento(i: Item, tipo: TipoEvento) {
    setAlvo(i);
    setTipoEvento(tipo);
    setParaNome('');
    setParaRef('');
    setDetalhe('');
  }

  function preencherPara(valor: string) {
    const [nome, ref] = valor.split(' — ');
    setParaNome(nome);
    if (ref !== undefined) setParaRef(ref);
  }

  async function registrarEvento(e: React.FormEvent) {
    e.preventDefault();
    if (!alvo) return;
    setRegistrando(true);
    try {
      await api.post(`/api/patrimonio/${alvo.id}/eventos`, { tipo: tipoEvento, para_nome: paraNome || null, para_referencia: paraRef || null, detalhe: detalhe || null });
      toast.success(`${TIPO_LABEL[tipoEvento]}: ${alvo.codigo}.`);
      setAlvo(null);
      await refetch();
    } catch (err: any) {
      toast.error(err.message || 'Não foi possível registrar.');
    } finally {
      setRegistrando(false);
    }
  }

  async function abrirHistorico(i: Item) {
    setHistoricoDe(i);
    setEventos(null);
    try {
      const r = await api.get<{ eventos: EventoDoItem[] }>(`/api/patrimonio/${i.id}/eventos`);
      setEventos(r.eventos);
    } catch (err: any) {
      toast.error(err.message || 'Não foi possível carregar o histórico.');
    }
  }

  const FILTROS: Array<[EstadoDoItem | 'ativos', string]> = [
    ['ativos', 'Ativos'],
    ['disponivel', ESTADO_DO_ITEM.disponivel.nome],
    ['em_uso', ESTADO_DO_ITEM.em_uso.nome],
    ['manutencao', ESTADO_DO_ITEM.manutencao.nome],
    ['baixado', ESTADO_DO_ITEM.baixado.nome],
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold text-[var(--text)]">{deposito.nome}</h1>
          <p className="text-sm text-[var(--text-muted)]">{MODO_LABELS.patrimonio.descricao}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {podeOperar ? (
            <Button icon={<Plus size={16} />} onClick={abrirCadastro} disabled={materials.length === 0}>
              Cadastrar item
            </Button>
          ) : (
            <Badge variant="neutral">Só consulta</Badge>
          )}
        </div>
      </div>

      <Reveal className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <RevealItem>
          <StatCard label="Disponíveis" value={contagem.disponivel} icon={<Check size={20} />} accent="green" sublabel="prontos para entregar" onClick={() => setFiltro('disponivel')} />
        </RevealItem>
        <RevealItem>
          <StatCard label="Em uso" value={contagem.em_uso} icon={<User size={20} />} accent="blue" sublabel="com alguém" onClick={() => setFiltro('em_uso')} />
        </RevealItem>
        <RevealItem>
          <StatCard label="Manutenção" value={contagem.manutencao} icon={<Wrench size={20} />} accent="amber" sublabel="fora de circulação" onClick={() => setFiltro('manutencao')} />
        </RevealItem>
        <RevealItem>
          <StatCard label="Baixados" value={contagem.baixado} icon={<Archive size={20} />} accent="slate" sublabel="fim de vida" onClick={() => setFiltro('baixado')} />
        </RevealItem>
      </Reveal>

      <Card className="p-5">
        <CardHeader icon={<Landmark size={15} />} title={`Itens (${daqui.length - contagem.baixado} ativos)`} />
        <div className="my-3 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por número, modelo, série, responsável ou local..."
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] py-2 pl-9 pr-3 text-sm outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/20"
            />
          </div>
          <div className="flex flex-wrap gap-1">
            {FILTROS.map(([v, l]) => (
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

        {materials.length === 0 ? (
          <EmptyState icon={<Landmark size={20} />} title="Nenhum modelo cadastrado" subtitle="Cadastre o modelo em Materiais (ex.: “Notebook Dell Latitude 5420”) escolhendo este estoque; depois cadastre cada item aqui." />
        ) : listados.length === 0 ? (
          <EmptyState icon={<Landmark size={20} />} title={daqui.length === 0 ? 'Nenhum item ainda' : 'Nenhum item com esse filtro'} subtitle={daqui.length === 0 ? 'Cada item cadastrado aqui ganha número, estado e histórico próprios.' : undefined} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
                  <th className="pb-2 pr-3 font-semibold">Número</th>
                  <th className="pb-2 pr-3 font-semibold">Modelo</th>
                  <th className="pb-2 pr-3 font-semibold">Estado</th>
                  <th className="pb-2 pr-3 font-semibold">Responsável</th>
                  <th className="pb-2 pr-3 font-semibold">Local</th>
                  <th className="pb-2 font-semibold"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {listados.map((i) => (
                  <tr key={i.id} className={i.estado === 'baixado' ? 'opacity-60' : ''}>
                    <td className="py-2 pr-3">
                      <span className="font-mono text-xs font-semibold text-[var(--text)]">{i.codigo}</span>
                      {i.serie && <span className="block text-[11px] text-[var(--text-muted)]">S/N {i.serie}</span>}
                    </td>
                    <td className="py-2 pr-3 text-[var(--text)]">{i.material_nome}</td>
                    <td className="py-2 pr-3">
                      <Badge variant={BADGE[i.estado]}>{ESTADO_DO_ITEM[i.estado].nome}</Badge>
                    </td>
                    <td className="py-2 pr-3 text-xs">
                      {i.responsavel_nome ? (
                        <>
                          <span className="font-medium text-[var(--text)]">{i.responsavel_nome}</span>
                          {i.responsavel_referencia && <span className="text-[var(--text-muted)]"> · {i.responsavel_referencia}</span>}
                        </>
                      ) : (
                        <span className="text-[var(--text-muted)]">—</span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-xs text-[var(--text-muted)]">{i.local ?? '—'}</td>
                    <td className="py-2 text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<MoreHorizontal size={16} />}
                        onClick={(ev) => {
                          ev.stopPropagation();
                          if (menu?.id === i.id) return setMenu(null);
                          // Abre para baixo; sem espaço, abre para cima.
                          const r = ev.currentTarget.getBoundingClientRect();
                          const cabeEmbaixo = r.bottom + ALTURA_DO_MENU < window.innerHeight;
                          setMenu({ id: i.id, right: window.innerWidth - r.right, ...(cabeEmbaixo ? { top: r.bottom + 4 } : { bottom: window.innerHeight - r.top + 4 }) });
                        }}
                        aria-label="Ações"
                        aria-haspopup="menu"
                        aria-expanded={menu?.id === i.id}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {menu &&
        itemDoMenu &&
        createPortal(
          <div role="menu" style={{ top: menu.top, bottom: menu.bottom, right: menu.right }} className="fixed z-50 w-56 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] py-1 text-left shadow-xl">
            {podeOperar &&
              EVENTOS_DO_ESTADO[itemDoMenu.estado].map((t) => (
                <button key={t} type="button" role="menuitem" onClick={() => abrirEvento(itemDoMenu, t)} className="flex w-full items-center gap-2 px-3 py-2 text-sm text-[var(--text)] hover:bg-[var(--bg-2)]">
                  <span className="text-[var(--text-muted)]">{EVENTO[t].icone}</span> {EVENTO[t].titulo}
                </button>
              ))}
            {podeOperar && itemDoMenu.estado !== 'baixado' && (
              <button type="button" role="menuitem" onClick={() => abrirEdicao(itemDoMenu)} className="flex w-full items-center gap-2 px-3 py-2 text-sm text-[var(--text)] hover:bg-[var(--bg-2)]">
                <Pencil size={16} className="text-[var(--text-muted)]" /> Editar dados
              </button>
            )}
            <button type="button" role="menuitem" onClick={() => abrirHistorico(itemDoMenu)} className="flex w-full items-center gap-2 px-3 py-2 text-sm text-[var(--text)] hover:bg-[var(--bg-2)]">
              <History size={16} className="text-[var(--text-muted)]" /> Histórico
            </button>
          </div>,
          document.body,
        )}

      <Modal open={formAberto} onClose={() => setFormAberto(false)} title={editando ? `Editar ${editando.codigo}` : 'Cadastrar item'} subtitle={editando ? 'O estado muda pelas ações, não aqui.' : 'Um item por número de patrimônio.'}>
        <form onSubmit={salvarItem} className="space-y-4">
          {editando ? (
            <p className="text-sm text-[var(--text-muted)]">
              Modelo: <strong className="text-[var(--text)]">{editando.material_nome}</strong>
            </p>
          ) : (
            <MaterialPicker label="Modelo (material)" required materials={materials} value={form.material_id} onChange={(v) => setForm((f) => ({ ...f, material_id: v }))} depositoId={deposito.id} />
          )}
          <div className="grid grid-cols-2 gap-3">
            <Input label="Número de patrimônio" required value={form.codigo} onChange={(e) => setForm((f) => ({ ...f, codigo: e.target.value }))} maxLength={40} placeholder="Ex.: PAT-0042" autoFocus />
            <Input label="Nº de série" value={form.serie} onChange={(e) => setForm((f) => ({ ...f, serie: e.target.value }))} maxLength={80} placeholder="Opcional" />
          </div>
          <Input label="Local" value={form.local} onChange={(e) => setForm((f) => ({ ...f, local: e.target.value }))} maxLength={80} placeholder="Sala, setor, prédio..." />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Adquirido em" type="date" value={form.adquirido_em} onChange={(e) => setForm((f) => ({ ...f, adquirido_em: e.target.value }))} />
            <Input label="Valor (R$)" type="number" step="0.01" min="0" value={form.valor} onChange={(e) => setForm((f) => ({ ...f, valor: e.target.value }))} placeholder="Opcional" />
          </div>
          <Textarea label="Observação" rows={2} value={form.observacao} onChange={(e) => setForm((f) => ({ ...f, observacao: e.target.value }))} maxLength={300} placeholder="Opcional: estado, acessórios, nota fiscal..." />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setFormAberto(false)}>
              Cancelar
            </Button>
            <Button type="submit" loading={salvando}>
              {editando ? 'Salvar' : 'Cadastrar'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={alvo !== null} onClose={() => setAlvo(null)} title={alvo ? `${EVENTO[tipoEvento].titulo} — ${alvo.codigo}` : ''} subtitle={alvo ? `${alvo.material_nome} · ${EVENTO[tipoEvento].descricao}` : undefined}>
        {alvo && (
          <form onSubmit={registrarEvento} className="space-y-4">
            {tipoEvento === 'alocacao' && (
              <>
                <div className="relative">
                  <User size={16} className="pointer-events-none absolute left-3 top-[38px] text-[var(--text-muted)]" />
                  <Input label="Para quem" required value={paraNome} onChange={(e) => preencherPara(e.target.value)} className="pl-9" list={`responsaveis-${deposito.id}`} maxLength={80} placeholder="Nome ou setor" autoComplete="off" autoFocus />
                  <datalist id={`responsaveis-${deposito.id}`}>
                    {sugestoes.map((s) => (
                      <option key={s} value={s} />
                    ))}
                  </datalist>
                </div>
                <Input label="Referência (matrícula, setor, sala)" value={paraRef} onChange={(e) => setParaRef(e.target.value)} maxLength={40} placeholder="Opcional" />
              </>
            )}
            {tipoEvento === 'baixa' && <p className="rounded-lg bg-[var(--vermelho)]/10 px-3 py-2 text-xs text-[var(--text)]">A baixa é definitiva: o item sai do saldo do modelo e não muda mais de estado. O histórico fica.</p>}
            <Textarea label={tipoEvento === 'baixa' ? 'Motivo' : 'Detalhe'} rows={2} value={detalhe} onChange={(e) => setDetalhe(e.target.value)} maxLength={300} placeholder={tipoEvento === 'manutencao' ? 'O que aconteceu, para onde foi...' : tipoEvento === 'baixa' ? 'Quebrou, doado, vendido, extraviado...' : 'Opcional'} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setAlvo(null)}>
                Cancelar
              </Button>
              <Button type="submit" variant={tipoEvento === 'baixa' ? 'danger' : 'primary'} loading={registrando}>
                {EVENTO[tipoEvento].botao}
              </Button>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={historicoDe !== null} onClose={() => setHistoricoDe(null)} title={historicoDe ? `${historicoDe.codigo} — ${historicoDe.material_nome}` : ''} subtitle="A vida deste item, do cadastro até hoje">
        {historicoDe && (
          <div className="space-y-4">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <dt className="text-[var(--text-muted)]">Estado</dt>
              <dd>
                <Badge variant={BADGE[historicoDe.estado]}>{ESTADO_DO_ITEM[historicoDe.estado].nome}</Badge>
              </dd>
              {historicoDe.serie && (
                <>
                  <dt className="text-[var(--text-muted)]">Série</dt>
                  <dd className="text-[var(--text)]">{historicoDe.serie}</dd>
                </>
              )}
              {historicoDe.local && (
                <>
                  <dt className="text-[var(--text-muted)]">Local</dt>
                  <dd className="text-[var(--text)]">{historicoDe.local}</dd>
                </>
              )}
              {historicoDe.adquirido_em && (
                <>
                  <dt className="text-[var(--text-muted)]">Adquirido em</dt>
                  <dd className="text-[var(--text)]">{fmtData.format(new Date(`${historicoDe.adquirido_em}T00:00:00`))}</dd>
                </>
              )}
              {historicoDe.valor != null && (
                <>
                  <dt className="text-[var(--text-muted)]">Valor</dt>
                  <dd className="text-[var(--text)]">{fmtMoeda.format(Number(historicoDe.valor))}</dd>
                </>
              )}
              {historicoDe.observacao && (
                <>
                  <dt className="text-[var(--text-muted)]">Observação</dt>
                  <dd className="text-[var(--text)]">{historicoDe.observacao}</dd>
                </>
              )}
            </dl>
            {eventos === null ? (
              <p className="py-6 text-center text-sm text-[var(--text-muted)]">Carregando…</p>
            ) : (
              <ul className="max-h-[360px] divide-y divide-[var(--border)] overflow-y-auto">
                {eventos.map((ev) => (
                  <li key={ev.id} className="py-2">
                    <p className="text-sm font-semibold text-[var(--text)]">
                      {TIPO_LABEL[ev.tipo]}
                      {ev.para_nome && (
                        <span className="font-normal">
                          {' '}
                          a {ev.para_nome}
                          {ev.para_referencia && <span className="text-[var(--text-muted)]"> · {ev.para_referencia}</span>}
                        </span>
                      )}
                    </p>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      {formatDateTime(ev.created_at)} · {staffName(ev.funcionario_matricula, staff)}
                      {ev.detalhe && <> · {ev.detalhe}</>}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
