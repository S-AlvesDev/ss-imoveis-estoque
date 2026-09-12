import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { CalendarClock, Laptop, PackageOpen, ShieldCheck, Warehouse } from 'lucide-react';
import { Modal } from '@/shared/ui/Modal';
import { Button } from '@/shared/ui/Button';
import { Input } from '@/shared/ui/Field';
import { api } from '@/lib/api';
import type { Deposito, ModoEstoque, OperacaoGenerica, Unidade } from '@/shared/types';
import { MODO_LABELS, OPERACOES_ALMOXARIFADO } from '@/shared/constants';

export const MODOS_NA_ORDEM: ModoEstoque[] = ['almoxarifado', 'emprestimo', 'entrega', 'validade', 'patrimonio'];

export const ICONE_DO_MODO: Record<ModoEstoque, React.ReactNode> = {
  almoxarifado: <Warehouse size={16} />,
  emprestimo: <PackageOpen size={16} />,
  entrega: <ShieldCheck size={16} />,
  validade: <CalendarClock size={16} />,
  patrimonio: <Laptop size={16} />,
};

/** Os cartões de modo, compartilhados por criar, editar e o primeiro acesso. */
export function SeletorDeModo({ value, onChange, disabled }: { value: ModoEstoque; onChange: (m: ModoEstoque) => void; disabled?: boolean }) {
  return (
    <div className="grid gap-2.5 sm:grid-cols-2">
      {MODOS_NA_ORDEM.map((m) => {
        const ativo = value === m;
        return (
          <button
            key={m}
            type="button"
            disabled={disabled}
            onClick={() => onChange(m)}
            aria-pressed={ativo}
            className={`rounded-xl border p-3 text-left transition-colors disabled:opacity-60 ${ativo ? 'border-[var(--brand)] bg-[var(--brand)]/10' : 'border-[var(--border)] bg-[var(--surface)] hover:border-[var(--brand)]/50'}`}
          >
            <div className="flex items-center gap-2">
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${ativo ? 'bg-[var(--brand)] text-white' : 'bg-[var(--bg-2)] text-[var(--text-muted)]'}`}>{ICONE_DO_MODO[m]}</span>
              <p className="text-sm font-bold text-[var(--text)]">{MODO_LABELS[m].nome}</p>
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--text-muted)]">{MODO_LABELS[m].descricao}</p>
          </button>
        );
      })}
    </div>
  );
}

/** O que cada modo configura além do nome. Estado e campos ficam juntos para o modal e o primeiro acesso usarem igual. */
export interface ConfigDoModo {
  prazo: string;
  operacoes: OperacaoGenerica[];
  exigeAssinatura: boolean;
  diasAviso: string;
}

export const CONFIG_PADRAO: ConfigDoModo = { prazo: '2', operacoes: OPERACOES_ALMOXARIFADO.map((o) => o.value), exigeAssinatura: false, diasAviso: '30' };

export function configDoDeposito(d: Deposito | null | undefined): ConfigDoModo {
  return {
    prazo: String(d?.prazo_padrao_horas ?? 2),
    operacoes: d?.operacoes_permitidas ?? OPERACOES_ALMOXARIFADO.map((o) => o.value),
    exigeAssinatura: d?.exige_assinatura ?? false,
    diasAviso: String(d?.dias_aviso_validade ?? 30),
  };
}

/** O corpo que a API espera, a partir do modo e da config. */
export function corpoDoEstoque(nome: string, modo: ModoEstoque, c: ConfigDoModo) {
  return {
    nome: nome.trim(),
    modo,
    prazo_padrao_horas: modo === 'emprestimo' ? Number(c.prazo) : undefined,
    operacoes_permitidas: modo === 'almoxarifado' ? c.operacoes : undefined,
    exige_assinatura: modo === 'entrega' ? c.exigeAssinatura : undefined,
    dias_aviso_validade: modo === 'validade' ? Number(c.diasAviso) : undefined,
  };
}

/** Os campos específicos do modo escolhido. */
export function CamposDoModo({ modo, config, onChange }: { modo: ModoEstoque; config: ConfigDoModo; onChange: (c: ConfigDoModo) => void }) {
  if (modo === 'emprestimo') {
    return <Input label="Prazo padrão de devolução (horas)" required type="number" min="1" max="8760" value={config.prazo} onChange={(e) => onChange({ ...config, prazo: e.target.value })} />;
  }
  if (modo === 'almoxarifado') {
    return (
      <div>
        <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Operações ligadas</p>
        <div className="flex flex-wrap gap-2">
          {OPERACOES_ALMOXARIFADO.map((o) => {
            const ligada = config.operacoes.includes(o.value);
            return (
              <button
                key={o.value}
                type="button"
                title={o.dica}
                aria-pressed={ligada}
                onClick={() => {
                  const proximas = ligada ? config.operacoes.filter((x) => x !== o.value) : [...config.operacoes, o.value];
                  if (proximas.length === 0) return toast.error('Deixe pelo menos uma operação ligada.');
                  onChange({ ...config, operacoes: proximas });
                }}
                className={`rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide transition-colors ${ligada ? 'bg-[var(--brand)] text-white' : 'bg-[var(--bg-2)] text-[var(--text-muted)] line-through'}`}
              >
                {o.label}
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 text-[11px] text-[var(--text-muted)]">Uma copa só recebe e consome; desligue o que não faz sentido e a tela fica mais simples.</p>
      </div>
    );
  }
  if (modo === 'entrega') {
    return (
      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
        <input type="checkbox" checked={config.exigeAssinatura} onChange={(e) => onChange({ ...config, exigeAssinatura: e.target.checked })} className="mt-0.5 accent-[var(--brand)]" />
        <span>
          <span className="block text-sm font-semibold text-[var(--text)]">Exigir assinatura na tela</span>
          <span className="block text-[11px] text-[var(--text-muted)]">Quem recebe assina no celular ou tablet; a assinatura sai no termo de entrega. Sem isso, o termo sai com linha para assinar no papel.</span>
        </span>
      </label>
    );
  }
  if (modo === 'validade') {
    return <Input label="Avisar quando o lote vencer em (dias)" required type="number" min="1" max="365" value={config.diasAviso} onChange={(e) => onChange({ ...config, diasAviso: e.target.value })} />;
  }
  return <p className="text-[11px] text-[var(--text-muted)]">Cada item recebe um número de patrimônio ao ser cadastrado na tela do estoque.</p>;
}

interface EstoqueModalProps {
  open: boolean;
  onClose: () => void;
  unidade: Unidade;
  /** Presente = editar; ausente = criar nesta unidade. */
  deposito?: Deposito | null;
  onSaved: () => Promise<void>;
}

/**
 * Cria ou edita um estoque de uma unidade: nome, modo e o que o modo pede.
 * Mudar o modo com retirada/entrega pendente é o servidor que recusa, e a
 * mensagem dele aparece aqui.
 */
export function EstoqueModal({ open, onClose, unidade, deposito, onSaved }: EstoqueModalProps) {
  const [nome, setNome] = useState('');
  const [modo, setModo] = useState<ModoEstoque>('almoxarifado');
  const [config, setConfig] = useState<ConfigDoModo>(CONFIG_PADRAO);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setNome(deposito?.nome ?? '');
    setModo(deposito?.modo ?? 'almoxarifado');
    setConfig(configDoDeposito(deposito));
  }, [open, deposito]);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const corpo = corpoDoEstoque(nome, modo, config);
      if (deposito) {
        await api.patch(`/api/warehouses/${deposito.id}`, corpo);
        toast.success('Estoque atualizado.');
      } else {
        const r = await api.post<{ deposito: Deposito; materiais: number }>(`/api/units/${unidade.id}/estoques`, corpo);
        toast.success(r.materiais > 0 ? `${r.deposito.nome} criado com ${r.materiais} materiais da unidade (saldo zero).` : `${r.deposito.nome} criado.`);
      }
      onClose();
      await onSaved();
    } catch (err: any) {
      toast.error(err.message || 'Não foi possível salvar o estoque.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={deposito ? `Editar ${deposito.nome}` : `Novo estoque em ${unidade.nome}`} subtitle="Nome, modo de operação e o que o modo pede" maxWidth="max-w-2xl">
      <form onSubmit={salvar} className="space-y-4">
        <div>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Modo</p>
          <SeletorDeModo value={modo} onChange={setModo} />
        </div>
        <Input label="Nome" required minLength={2} maxLength={60} value={nome} onChange={(e) => setNome(e.target.value)} placeholder={`Ex.: ${MODO_LABELS[modo].exemplos.split(',')[0]}`} autoFocus={!deposito} />
        <CamposDoModo modo={modo} config={config} onChange={setConfig} />
        {!deposito && <p className="text-xs text-[var(--text-muted)]">Os materiais que esta unidade já trabalha entram no estoque novo com saldo zero.</p>}
        <Button type="submit" fullWidth loading={saving}>
          {deposito ? 'Salvar' : 'Criar estoque'}
        </Button>
      </form>
    </Modal>
  );
}
