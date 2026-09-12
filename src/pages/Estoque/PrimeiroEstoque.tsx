import { useState } from 'react';
import { toast } from 'sonner';
import { ArrowRight, PackageOpen, Warehouse } from 'lucide-react';
import { Button } from '@/shared/ui/Button';
import { Input } from '@/shared/ui/Field';
import { Card } from '@/shared/ui/Card';
import { LogoProduto } from '@/shared/ui/Logo';
import { api } from '@/lib/api';
import type { Deposito, ModoEstoque, Unidade } from '@/shared/types';
import { MODO_LABELS } from '@/shared/constants';

interface PrimeiroEstoqueProps {
  unidade: Unidade;
  onCriado: () => Promise<void>;
}

const EXEMPLOS: Record<ModoEstoque, string> = {
  almoxarifado: 'Ex.: Almoxarifado, Depósito da obra, Farmácia',
  emprestimo: 'Ex.: Coordenação de Esportes, Laboratório, Ferramentaria',
};

/**
 * O primeiro acesso de uma empresa nova: ela ainda não tem estoque nenhum,
 * e o sistema não adivinha se é um almoxarifado de obra ou um armário de
 * bolas. Pergunta o nome e o modo, cria, e o painel abre.
 */
export function PrimeiroEstoque({ unidade, onCriado }: PrimeiroEstoqueProps) {
  const [nome, setNome] = useState('');
  const [modo, setModo] = useState<ModoEstoque>('almoxarifado');
  const [prazo, setPrazo] = useState('2');
  const [enviando, setEnviando] = useState(false);

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    try {
      await api.post<{ deposito: Deposito }>(`/api/units/${unidade.id}/estoques`, {
        nome,
        modo,
        prazo_padrao_horas: modo === 'emprestimo' ? Number(prazo) : undefined,
      });
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
      <div className="w-full max-w-xl">
        <div className="mb-6 flex justify-center">
          <LogoProduto height={36} fundo="auto" />
        </div>
        <Card className="p-6 sm:p-8">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.28em] text-[var(--brand)]">Primeiro acesso</p>
          <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-[var(--text)]">Qual é o seu primeiro estoque?</h1>
          <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
            Um estoque é um lugar onde material fica e de onde ele sai. Você pode criar outros depois, em Configurações — cada um com o próprio modo.
          </p>

          <form onSubmit={criar} className="mt-6 space-y-5">
            <div>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Como ele funciona</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {(['almoxarifado', 'emprestimo'] as ModoEstoque[]).map((m) => {
                  const ativo = modo === m;
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setModo(m)}
                      className={`rounded-xl border p-4 text-left transition-colors ${ativo ? 'border-[var(--brand)] bg-[var(--brand)]/10' : 'border-[var(--border)] bg-[var(--surface)] hover:border-[var(--brand)]/50'}`}
                      aria-pressed={ativo}
                    >
                      <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${ativo ? 'bg-[var(--brand)] text-white' : 'bg-[var(--bg-2)] text-[var(--text-muted)]'}`}>
                        {m === 'almoxarifado' ? <Warehouse size={18} /> : <PackageOpen size={18} />}
                      </span>
                      <p className="mt-3 text-sm font-bold text-[var(--text)]">{MODO_LABELS[m].nome}</p>
                      <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">{MODO_LABELS[m].descricao}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            <Input label="Nome do estoque" required minLength={2} maxLength={60} value={nome} onChange={(e) => setNome(e.target.value)} placeholder={EXEMPLOS[modo]} autoFocus />

            {modo === 'emprestimo' && (
              <Input
                label="Prazo padrão de devolução (horas)"
                required
                type="number"
                min="1"
                max="8760"
                value={prazo}
                onChange={(e) => setPrazo(e.target.value)}
              />
            )}

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
