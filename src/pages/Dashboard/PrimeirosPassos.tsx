import { useState } from 'react';
import { ArrowRight, BookOpen, Check, Package, PackagePlus, Settings, Users, X } from 'lucide-react';
import { Card } from '@/shared/ui/Card';
import { viewDoEstoque, type AppView } from '@/app/Sidebar';
import type { Deposito, Material, MaterialMovement } from '@/shared/types';
import { useAuth } from '@/store/auth';

interface Props {
  materials: Material[];
  materialMovements: MaterialMovement[];
  depositos: Deposito[];
  /** Quantas pessoas têm acesso (contando quem criou a conta). */
  equipe: number;
  onNavigate: (view: AppView) => void;
}

interface Passo {
  id: string;
  titulo: string;
  descricao: string;
  icone: React.ReactNode;
  feito: boolean;
  view: AppView;
}

function chaveDeDispensa(userId: number | undefined): string {
  return `stokai:primeiros-passos:${userId ?? 'x'}`;
}

/**
 * A conta nova cai num sistema vazio. Este cartão diz por onde começar e
 * some sozinho quando os passos estão feitos — ou quando a pessoa fecha.
 */
export function PrimeirosPassos({ materials, materialMovements, depositos, equipe, onNavigate }: Props) {
  const userId = useAuth((s) => s.user?.id);
  const [dispensado, setDispensado] = useState(() => {
    try {
      return localStorage.getItem(chaveDeDispensa(userId)) === '1';
    } catch {
      return false;
    }
  });

  const primeiroEstoque = depositos.find((d) => d.ativo && d.modo === 'almoxarifado') ?? depositos[0];
  const passos: Passo[] = [
    {
      id: 'materiais',
      titulo: 'Cadastre os materiais',
      descricao: 'Nome, unidade de medida e estoque mínimo. Dá para importar depois, mas 5 itens já mostram o sistema funcionando.',
      icone: <Package size={16} />,
      feito: materials.length > 0,
      view: 'materiais',
    },
    {
      id: 'entrada',
      titulo: 'Dê a primeira entrada',
      descricao: 'No estoque, registre o que você tem hoje. A partir daí cada saída desconta e o mínimo avisa.',
      icone: <PackagePlus size={16} />,
      feito: materialMovements.length > 0,
      view: primeiroEstoque ? viewDoEstoque(primeiroEstoque.id) : 'materiais',
    },
    {
      id: 'equipe',
      titulo: 'Chame a equipe',
      descricao: 'Crie um usuário por pessoa, com o que cada uma pode ver e operar. Operador entra por matrícula.',
      icone: <Users size={16} />,
      feito: equipe > 1,
      view: 'usuarios',
    },
    {
      id: 'ajustes',
      titulo: 'Deixe com a sua cara',
      descricao: 'Renomeie os estoques, escolha o modo de cada um (EPI, validade, patrimônio…), coloque logo e cor.',
      icone: <Settings size={16} />,
      feito: false,
      view: 'configuracoes',
    },
  ];
  const feitos = passos.filter((p) => p.feito).length;
  const obrigatoriosFeitos = passos.slice(0, 3).every((p) => p.feito);
  if (dispensado || obrigatoriosFeitos) return null;

  function dispensar() {
    try {
      localStorage.setItem(chaveDeDispensa(userId), '1');
    } catch {
      /* sem localStorage: some só nesta visita */
    }
    setDispensado(true);
  }

  return (
    <Card className="relative overflow-hidden p-5 sm:p-6">
      <button type="button" onClick={dispensar} className="absolute right-3 top-3 rounded-full p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-2)] hover:text-[var(--text)]" title="Fechar este guia">
        <X size={16} />
      </button>
      <div className="flex flex-wrap items-end justify-between gap-3 pr-8">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--brand)]">Primeiros passos</p>
          <h2 className="mt-1 text-lg font-bold text-[var(--text)]">Seu estoque em 4 passos</h2>
          <p className="text-sm text-[var(--text-muted)]">Uns 15 minutos. Depois, o dia a dia é só registrar o que entra e o que sai.</p>
        </div>
        <p className="text-xs font-semibold text-[var(--text-muted)]">
          {feitos} de {passos.length}
        </p>
      </div>
      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[var(--bg-2)]">
        <div className="h-full rounded-full bg-[var(--brand)] transition-all" style={{ width: `${(feitos / passos.length) * 100}%` }} />
      </div>
      <ol className="mt-4 grid gap-2 sm:grid-cols-2">
        {passos.map((p, i) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => onNavigate(p.view)}
              className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors ${p.feito ? 'border-[var(--verde)]/30 bg-[var(--verde)]/5' : 'border-[var(--border)] hover:border-[var(--brand)]/50 hover:bg-[var(--brand)]/5'}`}
            >
              <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${p.feito ? 'bg-[var(--verde)] text-white' : 'bg-[var(--brand)]/12 text-[var(--brand)]'}`}>{p.feito ? <Check size={14} /> : p.icone}</span>
              <span className="min-w-0 flex-1">
                <span className={`block text-sm font-bold ${p.feito ? 'text-[var(--text-muted)] line-through' : 'text-[var(--text)]'}`}>
                  {i + 1}. {p.titulo}
                </span>
                <span className="block text-xs text-[var(--text-muted)]">{p.descricao}</span>
              </span>
              {!p.feito && <ArrowRight size={14} className="mt-1 shrink-0 text-[var(--text-muted)]" />}
            </button>
          </li>
        ))}
      </ol>
      <button type="button" onClick={() => onNavigate('ajuda')} className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--brand)] hover:underline">
        <BookOpen size={13} /> Ver a Ajuda completa
      </button>
    </Card>
  );
}
