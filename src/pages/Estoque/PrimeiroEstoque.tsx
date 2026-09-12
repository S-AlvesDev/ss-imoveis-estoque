import { useState } from 'react';
import { toast } from 'sonner';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/shared/ui/Button';
import { Input } from '@/shared/ui/Field';
import { Card } from '@/shared/ui/Card';
import { LogoProduto } from '@/shared/ui/Logo';
import { api } from '@/lib/api';
import type { Deposito, ModoEstoque, Unidade } from '@/shared/types';
import { MODO_LABELS } from '@/shared/constants';
import { CONFIG_PADRAO, CamposDoModo, SeletorDeModo, corpoDoEstoque, type ConfigDoModo } from '@/features/estoques/EstoqueModal';

interface PrimeiroEstoqueProps {
  unidade: Unidade;
  onCriado: () => Promise<void>;
}

/**
 * O primeiro acesso de uma empresa nova: ela ainda não tem estoque nenhum,
 * e o sistema não adivinha se é um almoxarifado de obra, um armário de
 * bolas ou uma farmácia. Pergunta o nome e o modo, cria, e o painel abre.
 */
export function PrimeiroEstoque({ unidade, onCriado }: PrimeiroEstoqueProps) {
  const [nome, setNome] = useState('');
  const [modo, setModo] = useState<ModoEstoque>('almoxarifado');
  const [config, setConfig] = useState<ConfigDoModo>(CONFIG_PADRAO);
  const [enviando, setEnviando] = useState(false);

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    try {
      await api.post<{ deposito: Deposito }>(`/api/units/${unidade.id}/estoques`, corpoDoEstoque(nome, modo, config));
      toast.success(`${nome.trim()} criado. Bem-vindo(a)!`);
      await onCriado();
    } catch (err: any) {
      toast.error(err.message || 'Não foi possível criar o estoque.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] p-6">
      <div className="w-full max-w-2xl">
        <div className="mb-6 flex justify-center">
          <LogoProduto height={36} fundo="auto" />
        </div>
        <Card className="p-6 sm:p-8">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.28em] text-[var(--brand)]">Primeiro acesso</p>
          <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-[var(--text)]">Qual é o seu primeiro estoque?</h1>
          <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
            Um estoque é um lugar onde material fica e de onde ele sai — e cada um funciona de um jeito. Você pode criar outros depois, em Configurações.
          </p>

          <form onSubmit={criar} className="mt-6 space-y-5">
            <div>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Como ele funciona</p>
              <SeletorDeModo value={modo} onChange={setModo} />
              <p className="mt-2 text-[11px] text-[var(--text-muted)]">Exemplos: {MODO_LABELS[modo].exemplos}.</p>
            </div>

            <Input label="Nome do estoque" required minLength={2} maxLength={60} value={nome} onChange={(e) => setNome(e.target.value)} placeholder={`Ex.: ${MODO_LABELS[modo].exemplos.split(',')[0]}`} autoFocus />

            <CamposDoModo modo={modo} config={config} onChange={setConfig} />

            <Button type="submit" fullWidth size="lg" loading={enviando} icon={!enviando ? <ArrowRight size={16} /> : undefined}>
              Criar e entrar no painel
            </Button>
          </form>
        </Card>
        <p className="mt-4 text-center text-xs text-[var(--text-muted)]">Unidade: {unidade.nome}. Dá para renomear e criar outras unidades em Configurações.</p>
      </div>
    </div>
  );
}
