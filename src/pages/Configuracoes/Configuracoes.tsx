import { useState } from 'react';
import { Building2, Plus } from 'lucide-react';
import { Button } from '@/shared/ui/Button';
import { EmptyState } from '@/shared/ui/EmptyState';
import { NovaUnidadeModal } from '@/features/unidades/NovaUnidadeModal';
import type { Categoria, Deposito, Material, Unidade } from '@/shared/types';
import { UnidadeCard } from './UnidadeCard';
import { AcessosSection } from './AcessosSection';
import { IdentidadeSection } from './IdentidadeSection';
import { CategoriasSection } from './CategoriasSection';

interface ConfiguracoesProps {
  unidades: Unidade[];
  depositos: Deposito[];
  /** Todos os materiais da organização, para escolher o que entra em cada unidade. */
  catalogo: Material[];
  categorias: Categoria[];
  refetch: () => Promise<void>;
  onSelecionarUnidade: (id: string) => void;
}

/**
 * Onde o administrador desenha a empresa: quais unidades existem, quais
 * estoques cada uma tem (e em que modo), as categorias de material e quem
 * opera o quê.
 */
export function Configuracoes({ unidades, depositos, catalogo, categorias, refetch, onSelecionarUnidade }: ConfiguracoesProps) {
  const [criando, setCriando] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-[var(--text)]">Configurações</h1>
          <p className="text-sm text-[var(--text-muted)]">
            Identidade, unidades e seus estoques, categorias, o que cada unidade trabalha e quem opera o quê.
          </p>
        </div>
        <Button icon={<Plus size={15} />} onClick={() => setCriando(true)}>
          Nova unidade
        </Button>
      </div>

      <IdentidadeSection refetch={refetch} />

      <section className="space-y-4">
        <div>
          <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Unidades</h2>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Cada unidade tem os próprios estoques — um almoxarifado, um armário de empréstimo, o que a operação pedir. O estoque mínimo se compara com o total dela.
          </p>
        </div>

        {unidades.length === 0 ? (
          <EmptyState icon={<Building2 size={20} />} title="Nenhuma unidade" subtitle="Crie a primeira para começar a operar." />
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {[...unidades].sort((a, b) => Number(b.ativo) - Number(a.ativo) || a.nome.localeCompare(b.nome)).map((u) => (
              <UnidadeCard
                key={u.id}
                unidade={u}
                depositos={depositos.filter((d) => d.unit_id === u.id)}
                catalogo={catalogo}
                podeDesativar={unidades.filter((x) => x.ativo).length > 1}
                refetch={refetch}
                onSelecionar={() => onSelecionarUnidade(u.id)}
              />
            ))}
          </div>
        )}
      </section>

      <CategoriasSection categorias={categorias} catalogo={catalogo} refetch={refetch} />

      <AcessosSection unidades={unidades} depositos={depositos} />

      <NovaUnidadeModal
        open={criando}
        onClose={() => setCriando(false)}
        onCreated={async (nova) => {
          await refetch();
          onSelecionarUnidade(nova.id);
        }}
      />
    </div>
  );
}
