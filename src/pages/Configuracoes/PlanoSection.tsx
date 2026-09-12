import { Check, CreditCard, Lock, MessageCircle } from 'lucide-react';
import { Card } from '@/shared/ui/Card';
import { Badge } from '@/shared/ui/Badge';
import { usePlano } from '@/features/planos/usePlano';
import { DEFINICOES, PLANOS, formatarPreco, descreverLimite, type Limite, type Recurso } from '@/shared/planos';
import { PRODUTO } from '@/shared/produto';
import type { Deposito, Unidade } from '@/shared/types';

interface PlanoSectionProps {
  unidades: Unidade[];
  depositos: Deposito[];
}

const RECURSOS_VISIVEIS: Array<{ id: Recurso; nome: string }> = [
  { id: 'transferencia', nome: 'Transferência entre depósitos' },
  { id: 'identidade-visual', nome: 'Logo e cor da empresa' },
  { id: 'exportacoes', nome: 'Auditoria em PDF e exportações' },
  { id: 'alertas-por-email', nome: 'Alertas por e-mail' },
  { id: 'whatsapp', nome: 'Avisos por WhatsApp (em breve)' },
  { id: 'relatorios-automaticos', nome: 'Relatórios automáticos (em breve)' },
];

/** Uma barra "x de y" — ou "x, sem limite". */
function Uso({ rotulo, atual, max }: { rotulo: string; atual: number; max: number | null }) {
  const pct = max === null ? 0 : Math.min(100, Math.round((atual / max) * 100));
  const cheio = max !== null && atual >= max;
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-[var(--text-muted)]">{rotulo}</span>
        <span className={`font-semibold tabular-nums ${cheio ? 'text-[var(--brand)]' : 'text-[var(--text)]'}`}>
          {atual}
          {max === null ? ' · sem limite' : ` de ${max}`}
        </span>
      </div>
      {max !== null && (
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--bg-2)]">
          <div className="h-full rounded-full bg-[var(--brand)] transition-[width]" style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}

/**
 * O plano da organização: qual é, quanto do limite já está em uso e o que
 * ele libera. Enquanto não existe assinatura, "Avaliação" com tudo do
 * Empresarial; mudar de plano é falar com a gente.
 */
export function PlanoSection({ unidades, depositos }: PlanoSectionProps) {
  const planoAtual = usePlano();
  const d = planoAtual.definicao;

  const unidadesAtivas = unidades.filter((u) => u.ativo);
  // O limite de depósitos é por unidade: mostra a unidade mais cheia.
  const maisDepositos = Math.max(0, ...unidadesAtivas.map((u) => depositos.filter((x) => x.unit_id === u.id && x.ativo).length));
  const usos: Array<{ limite: Limite; rotulo: string; atual: number }> = [
    { limite: 'unidades', rotulo: 'Unidades', atual: unidadesAtivas.length },
    { limite: 'depositosPorUnidade', rotulo: 'Depósitos na maior unidade', atual: maisDepositos },
  ];

  const whatsapp = `https://wa.me/${PRODUTO.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(`Olá! Quero falar sobre o plano do Stok Aí (${planoAtual.nome}).`)}`;

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Plano</h2>
        <p className="mt-1 text-xs text-[var(--text-muted)]">O que a sua conta inclui e quanto do limite já está em uso.</p>
      </div>

      <Card className="p-5">
        <div className="grid gap-6 lg:grid-cols-[1fr_1fr_1.2fr]">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--brand)]/12 text-[var(--brand)]">
                <CreditCard size={18} />
              </span>
              <div>
                <p className="text-lg font-bold leading-tight text-[var(--text)]">{planoAtual.nome}</p>
                <p className="text-[11px] text-[var(--text-muted)]">
                  {planoAtual.emAvaliacao ? 'Período de avaliação · tudo do Empresarial' : `${formatarPreco(d.preco)}/mês · ${d.publico}`}
                </p>
              </div>
            </div>
            {planoAtual.emAvaliacao && (
              <p className="mt-3 text-xs text-[var(--text-muted)]">
                Sua conta ainda não tem assinatura. Enquanto isso, nada está travado — os limites abaixo são os do Empresarial.
              </p>
            )}
            <div className="mt-4 flex flex-wrap gap-1.5">
              {PLANOS.map((p) => (
                <Badge key={p} variant={p === planoAtual.plano ? 'info' : 'neutral'}>
                  {DEFINICOES[p].nome} · {formatarPreco(DEFINICOES[p].preco)}
                </Badge>
              ))}
            </div>
            <a href={whatsapp} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--brand)] hover:underline">
              <MessageCircle size={14} /> Falar sobre planos
            </a>
          </div>

          <div className="space-y-3">
            {usos.map((u) => (
              <Uso key={u.limite} rotulo={u.rotulo} atual={u.atual} max={planoAtual.limite(u.limite)} />
            ))}
            <p className="text-[11px] text-[var(--text-muted)]">
              Inclui {descreverLimite('usuarios', planoAtual.limite('usuarios'))} — veja em Usuários.
            </p>
          </div>

          <ul className="grid gap-1.5 text-xs sm:grid-cols-2 lg:grid-cols-1">
            {RECURSOS_VISIVEIS.map((r) => {
              const tem = planoAtual.libera(r.id);
              return (
                <li key={r.id} className={`flex items-center gap-2 ${tem ? 'text-[var(--text)]' : 'text-[var(--text-muted)]'}`}>
                  {tem ? <Check size={14} className="shrink-0 text-[var(--verde)]" /> : <Lock size={13} className="shrink-0" />}
                  {r.nome}
                </li>
              );
            })}
          </ul>
        </div>
      </Card>
    </section>
  );
}
