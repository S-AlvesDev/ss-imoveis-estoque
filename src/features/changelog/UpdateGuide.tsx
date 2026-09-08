import { useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import { Card } from '@/shared/ui/Card';
import { Button } from '@/shared/ui/Button';
import { Modal } from '@/shared/ui/Modal';
import { KIND_META, LATEST, RELEASES, type Change } from './entries';

/** 'YYYY-MM-DD' puro é interpretado como UTC e o fuso -03 exibe o dia anterior. */
function formatarData(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('pt-BR');
}

const STORAGE_KEY = 'estoque-changelog-visto';

function versaoVista(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function marcarVisto(versao: string) {
  try {
    localStorage.setItem(STORAGE_KEY, versao);
  } catch {
    /* modo privado ou storage bloqueado — o aviso simplesmente reaparece */
  }
}

function ChangeRow({ change }: { change: Change }) {
  const meta = KIND_META[change.tipo];
  return (
    <div className="flex gap-3 border-b border-[var(--border)] py-3 last:border-0">
      <span
        className={`mt-0.5 h-fit shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${meta.className}`}
      >
        {meta.label}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-[var(--text)]">{change.titulo}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-[var(--text-muted)]">{change.descricao}</p>
      </div>
    </div>
  );
}

/** O histórico completo. Usado pelo aviso e pela tela de Ajuda. */
export function ChangelogModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Guia de atualização"
      subtitle="Tudo que mudou no sistema, da versão mais recente para a mais antiga"
      maxWidth="max-w-2xl"
    >
      <div className="space-y-6">
        {RELEASES.map((release) => (
          <div key={release.versao}>
            <div className="mb-1 flex flex-wrap items-baseline gap-2">
              <h3 className="font-display text-base font-bold text-[var(--text)]">
                Versão {release.versao} — {release.titulo}
              </h3>
              <span className="font-mono text-[11px] text-[var(--text-muted)]">{formatarData(release.data)}</span>
            </div>
            <p className="mb-2 text-sm text-[var(--text-muted)]">{release.resumo}</p>
            <div className="rounded-xl border border-[var(--border)] px-4">
              {release.mudancas.map((c, i) => (
                <ChangeRow key={i} change={c} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}

/**
 * Aviso de novidades, exibido uma vez por versão na tela inicial de cada perfil.
 * Some ao ser dispensado; o histórico continua acessível pela Ajuda.
 */
export function UpdateBanner() {
  const [dispensado, setDispensado] = useState(() => versaoVista() === LATEST.versao);
  const [aberto, setAberto] = useState(false);

  function dispensar() {
    marcarVisto(LATEST.versao);
    setDispensado(true);
  }

  const destaques = LATEST.mudancas.slice(0, 3);

  return (
    <>
      {!dispensado && (
        <Card className="relative mb-6 overflow-hidden p-5">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-[var(--brand)] to-[var(--brand-secondary)]" />
          <button
            onClick={dispensar}
            className="absolute right-3 top-3 rounded-full p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-2)] hover:text-[var(--text)]"
            title="Não mostrar de novo"
          >
            <X size={16} />
          </button>

          <div className="flex items-start gap-3 pr-8">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--brand)]/15 text-[var(--brand)]">
              <Sparkles size={19} />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--brand)]">
                Versão {LATEST.versao} · {formatarData(LATEST.data)}
              </p>
              <p className="font-display mt-0.5 text-lg font-bold text-[var(--text)]">{LATEST.titulo}</p>
              <p className="mt-1 text-sm text-[var(--text-muted)]">{LATEST.resumo}</p>

              <ul className="mt-3 space-y-1.5">
                {destaques.map((c, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-[var(--text)]">
                    <span
                      className={`mt-0.5 h-fit rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase ${KIND_META[c.tipo].className}`}
                    >
                      {KIND_META[c.tipo].label}
                    </span>
                    <span>{c.titulo}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" onClick={() => setAberto(true)}>
                  Ver todas as {LATEST.mudancas.length} mudanças
                </Button>
                <Button size="sm" variant="ghost" onClick={dispensar}>
                  Já vi
                </Button>
              </div>
            </div>
          </div>
        </Card>
      )}

      <ChangelogModal open={aberto} onClose={() => setAberto(false)} />
    </>
  );
}

/** Acesso permanente ao histórico, para quem já dispensou o aviso. */
export function ChangelogCard() {
  const [aberto, setAberto] = useState(false);

  return (
    <>
      <Card className="flex flex-wrap items-center gap-3 p-4">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--brand)]/15 text-[var(--brand)]">
          <Sparkles size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-[var(--text)]">
            Novidades da versão {LATEST.versao} — {LATEST.titulo}
          </p>
          <p className="text-xs text-[var(--text-muted)]">
            {LATEST.mudancas.length} mudanças em {formatarData(LATEST.data)}.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setAberto(true)}>
          Ver o que mudou
        </Button>
      </Card>

      <ChangelogModal open={aberto} onClose={() => setAberto(false)} />
    </>
  );
}
