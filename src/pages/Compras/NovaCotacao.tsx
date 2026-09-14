import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import { Modal } from '@/shared/ui/Modal';
import { Button } from '@/shared/ui/Button';
import { Input, Textarea } from '@/shared/ui/Field';
import { api } from '@/lib/api';
import type { Material, Unidade } from '@/shared/types';
import type { Cotacao, Fornecedor } from '@/shared/cotacoes';
import { formatarWhatsapp } from '@/shared/whatsapp';

interface Linha {
  chave: number;
  material_id: number | null;
  descricao: string;
  quantidade: string;
  unidade: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onCriada: (c: Cotacao) => void;
  catalogo: Material[];
  fornecedores: Fornecedor[];
  unidade: Unidade | null;
}

let proximaChave = 1;
const linhaVazia = (): Linha => ({ chave: proximaChave++, material_id: null, descricao: '', quantidade: '', unidade: 'un' });

/**
 * Montar a cotação: itens (do catálogo ou escritos), quantidades, os
 * fornecedores e onde entregar. Ao confirmar, o servidor manda a mesma
 * mensagem para cada fornecedor e a tela passa a acompanhar as respostas.
 */
export function NovaCotacao({ open, onClose, onCriada, catalogo, fornecedores, unidade }: Props) {
  const [titulo, setTitulo] = useState('');
  const [linhas, setLinhas] = useState<Linha[]>([linhaVazia()]);
  const [escolhidos, setEscolhidos] = useState<string[]>([]);
  const [entrega, setEntrega] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [busca, setBusca] = useState('');
  const [linhaBuscando, setLinhaBuscando] = useState<number | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitulo('');
    setLinhas([linhaVazia()]);
    setEscolhidos(fornecedores.filter((f) => f.ativo).map((f) => f.id));
    setEntrega(unidade ? unidade.nome : '');
    setObservacoes('');
    setBusca('');
    setLinhaBuscando(null);
  }, [open, fornecedores, unidade]);

  const sugestoes = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q || linhaBuscando === null) return [];
    return catalogo.filter((m) => m.nome.toLowerCase().includes(q)).slice(0, 8);
  }, [busca, catalogo, linhaBuscando]);

  function mudar(chave: number, patch: Partial<Linha>) {
    setLinhas((ls) => ls.map((l) => (l.chave === chave ? { ...l, ...patch } : l)));
  }
  function escolherMaterial(chave: number, m: Material) {
    mudar(chave, { material_id: m.id, descricao: m.nome, unidade: m.unidade_medida || 'un' });
    setBusca('');
    setLinhaBuscando(null);
  }

  const ativos = fornecedores.filter((f) => f.ativo);
  const itensValidos = linhas.filter((l) => l.descricao.trim() && Number(l.quantidade.replace(',', '.')) > 0);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (titulo.trim().length < 2) return toast.error('Dê um título — ex.: "Material da obra Bairro Norte".');
    if (itensValidos.length === 0) return toast.error('Adicione pelo menos um item com quantidade.');
    if (escolhidos.length === 0) return toast.error('Escolha pelo menos um fornecedor.');
    setEnviando(true);
    try {
      const r = await api.post<{ cotacao: Cotacao; envio: { enviados: number; falhas: number } }>('/api/cotacoes', {
        titulo: titulo.trim(),
        itens: itensValidos.map((l) => ({ material_id: l.material_id, descricao: l.descricao.trim(), quantidade: Number(l.quantidade.replace(',', '.')), unidade: l.unidade.trim() || 'un' })),
        fornecedores: escolhidos,
        entrega: entrega.trim() || null,
        observacoes: observacoes.trim() || null,
      });
      if (r.envio.falhas > 0) toast.warning(`Enviada para ${r.envio.enviados} fornecedor(es); ${r.envio.falhas} falhou — veja na cotação e reenvie.`);
      else toast.success(`Cotação enviada para ${r.envio.enviados} fornecedor(es) pelo WhatsApp.`);
      onCriada(r.cotacao);
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Não foi possível enviar a cotação.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nova cotação"
      subtitle="A mesma mensagem vai para cada fornecedor, em nome da sua empresa. As respostas aparecem aqui, lado a lado."
      maxWidth="max-w-2xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit" form="form-cotacao" loading={enviando} disabled={itensValidos.length === 0 || escolhidos.length === 0}>
            Enviar para {escolhidos.length} fornecedor{escolhidos.length === 1 ? '' : 'es'}
          </Button>
        </>
      }
    >
      <form id="form-cotacao" onSubmit={enviar} className="space-y-5">
        <Input label="Título" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Material da obra Bairro Norte" required />

        <div>
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Itens</label>
          <div className="space-y-2">
            {linhas.map((l) => (
              <div key={l.chave} className="relative grid grid-cols-[1fr_84px_64px_32px] items-start gap-2">
                <div className="relative">
                  <input
                    value={l.descricao}
                    onChange={(e) => {
                      mudar(l.chave, { descricao: e.target.value, material_id: null });
                      setBusca(e.target.value);
                      setLinhaBuscando(l.chave);
                    }}
                    onFocus={() => {
                      setBusca(l.descricao);
                      setLinhaBuscando(l.chave);
                    }}
                    onBlur={() => setTimeout(() => setLinhaBuscando((atual) => (atual === l.chave ? null : atual)), 150)}
                    placeholder="Cimento CP-II 50kg (do catálogo ou escrito)"
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--brand)]"
                  />
                  {linhaBuscando === l.chave && sugestoes.length > 0 && (
                    <ul className="absolute left-0 right-0 top-full z-20 mt-1 max-h-48 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-lg">
                      {sugestoes.map((m) => (
                        <li key={m.id}>
                          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => escolherMaterial(l.chave, m)} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-[var(--text)] hover:bg-[var(--brand)]/10">
                            <span>{m.nome}</span>
                            <span className="text-[11px] text-[var(--text-muted)]">{m.unidade_medida}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <input value={l.quantidade} onChange={(e) => mudar(l.chave, { quantidade: e.target.value })} inputMode="decimal" placeholder="Qtd" className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--brand)]" />
                <input value={l.unidade} onChange={(e) => mudar(l.chave, { unidade: e.target.value })} placeholder="un" className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--brand)]" />
                <button type="button" onClick={() => setLinhas((ls) => (ls.length === 1 ? [linhaVazia()] : ls.filter((x) => x.chave !== l.chave)))} className="mt-1 rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-rose-500/10 hover:text-rose-500" title="Remover">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
          <button type="button" onClick={() => setLinhas((ls) => [...ls, linhaVazia()])} className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-[var(--brand)] hover:underline">
            <Plus size={13} /> Mais um item
          </button>
        </div>

        <div>
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
            Fornecedores <span className="text-[var(--brand)]">({escolhidos.length})</span>
          </label>
          {ativos.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)]">Nenhum fornecedor ativo — cadastre na aba Fornecedores.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {ativos.map((f) => {
                const on = escolhidos.includes(f.id);
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setEscolhidos((e) => (on ? e.filter((x) => x !== f.id) : [...e, f.id]))}
                    className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${on ? 'bg-[var(--brand)] text-white' : 'bg-[var(--bg-2)] text-[var(--text-muted)] hover:text-[var(--text)]'}`}
                    title={formatarWhatsapp(f.whatsapp)}
                  >
                    {f.nome}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <Input label="Entregar em" value={entrega} onChange={(e) => setEntrega(e.target.value)} placeholder="Obra Bairro Norte — Rua das Flores, 120" />
        <Textarea label="Observações para o fornecedor (opcional)" value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={2} placeholder="Precisamos até sexta. Pagamento em boleto 28 dias." />
      </form>
    </Modal>
  );
}
