import { useMemo, useState } from 'react';
import { ChevronDown, HelpCircle, Info, LifeBuoy, Search, TriangleAlert } from 'lucide-react';
import { Card } from '@/shared/ui/Card';
import { EmptyState } from '@/shared/ui/EmptyState';
import { useAuth } from '@/store/auth';
import { GUIA, audiencesForRole, type Topic } from '@/features/ajuda/content';
import { ChangelogCard } from '@/features/changelog/UpdateGuide';

function TipRow({ tipo, texto }: { tipo: 'dica' | 'atencao'; texto: string }) {
  const isAlerta = tipo === 'atencao';
  return (
    <div
      className={`flex items-start gap-2 rounded-lg p-2.5 text-xs ${
        isAlerta ? 'bg-rose-500/10 text-[var(--text)]' : 'bg-[var(--brand)]/10 text-[var(--text)]'
      }`}
    >
      {isAlerta ? (
        <TriangleAlert size={14} className="mt-0.5 shrink-0 text-rose-500" />
      ) : (
        <Info size={14} className="mt-0.5 shrink-0 text-[var(--brand)]" />
      )}
      <span>{texto}</span>
    </div>
  );
}

function TopicItem({ topic }: { topic: Topic }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-b border-[var(--border)] last:border-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--brand)]/5"
      >
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[var(--text)]">{topic.titulo}</p>
          {!open && <p className="mt-0.5 line-clamp-2 text-xs text-[var(--text-muted)]">{topic.resumo}</p>}
        </div>
        <ChevronDown
          size={16}
          className={`mt-0.5 shrink-0 text-[var(--text-muted)] transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="space-y-3 px-4 pb-4">
          <p className="text-sm text-[var(--text-muted)]">{topic.resumo}</p>

          {topic.passos && (
            <ol className="space-y-2">
              {topic.passos.map((passo, i) => (
                <li key={i} className="flex gap-2.5 text-sm text-[var(--text)]">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--brand)]/15 text-[10px] font-bold text-[var(--brand)]">
                    {i + 1}
                  </span>
                  <span>{passo}</span>
                </li>
              ))}
            </ol>
          )}

          {topic.dicas?.map((d, i) => (
            <TipRow key={i} tipo={d.tipo} texto={d.texto} />
          ))}
        </div>
      )}
    </div>
  );
}

export function Ajuda() {
  const user = useAuth((s) => s.user);
  const [search, setSearch] = useState('');
  const [verTudo, setVerTudo] = useState(false);

  const audiences = useMemo(() => audiencesForRole(user?.role || ''), [user?.role]);

  const sections = useMemo(() => {
    const q = search.trim().toLowerCase();
    return GUIA.map((section) => ({
      ...section,
      topicos: section.topicos.filter((t) => {
        const relevante = verTudo || t.audiencia.some((a) => audiences.includes(a));
        if (!relevante) return false;
        if (!q) return true;
        const alvo = [t.titulo, t.resumo, ...(t.passos ?? []), ...(t.dicas ?? []).map((d) => d.texto)]
          .join(' ')
          .toLowerCase();
        return alvo.includes(q);
      }),
    })).filter((s) => s.topicos.length > 0);
  }, [audiences, search, verTudo]);

  const totalTopicos = sections.reduce((n, s) => n + s.topicos.length, 0);
  // Só oferece "ver tudo" a quem realmente tem conteúdo escondido.
  const temConteudoOculto = !audiences.includes('admin');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-[var(--text)]">Ajuda</h1>
        <p className="text-sm text-[var(--text-muted)]">
          Guia de uso do sistema. Mostrando o que se aplica ao seu perfil.
        </p>
      </div>

      <ChangelogCard />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar na ajuda... (ex.: remessa, recontagem, senha)"
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] py-2 pl-9 pr-3 text-sm text-[var(--text)] outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/20"
          />
        </div>
        {temConteudoOculto && (
          <button
            onClick={() => setVerTudo((v) => !v)}
            className={`rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${
              verTudo
                ? 'border-[var(--brand)] bg-[var(--brand)] text-white'
                : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:border-[var(--brand)]/50'
            }`}
          >
            Ver todas as telas
          </button>
        )}
      </div>

      {sections.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Search size={20} />}
            title="Nada encontrado"
            subtitle={`Nenhum tópico corresponde a “${search.trim()}”. Tente outra palavra.`}
          />
        </Card>
      ) : (
        <>
          {search.trim() && (
            <p className="text-xs text-[var(--text-muted)]">
              {totalTopicos} tópico(s) encontrado(s) para “{search.trim()}”.
            </p>
          )}

          {sections.map((section) => (
            <div key={section.id}>
              <div className="mb-2">
                <h2 className="font-display text-sm font-bold text-[var(--text)]">{section.titulo}</h2>
                <p className="text-xs text-[var(--text-muted)]">{section.descricao}</p>
              </div>
              <Card className="overflow-hidden">
                {section.topicos.map((t) => (
                  <TopicItem key={t.id} topic={t} />
                ))}
              </Card>
            </div>
          ))}
        </>
      )}

      <Card className="flex flex-wrap items-center gap-3 p-4">
        <LifeBuoy size={18} className="shrink-0 text-[var(--brand)]" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-[var(--text)]">Não achou o que precisava?</p>
          <p className="text-xs text-[var(--text-muted)]">
            Abra um chamado em Suporte descrevendo a dúvida — a gestão responde por lá.
          </p>
        </div>
        <HelpCircle size={16} className="shrink-0 text-[var(--text-muted)]" />
      </Card>
    </div>
  );
}
