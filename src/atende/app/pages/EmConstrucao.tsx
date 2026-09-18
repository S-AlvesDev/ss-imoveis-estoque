import type { ReactNode } from 'react';
import { Card } from '@/shared/ui/Card';

/** As telas das próximas etapas, com o que vão fazer — para o menu já ter o desenho final. */
export function EmConstrucao({ titulo, etapa, descricao, icone }: { titulo: string; etapa: string; descricao: string; icone: ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-extrabold tracking-tight text-[var(--text)]">{titulo}</h1>
      <Card className="mt-5 flex flex-col items-center gap-3 p-10 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradiente text-white shadow-lg shadow-[var(--brand)]/30">{icone}</span>
        <p className="text-base font-bold text-[var(--text)]">Chega na {etapa}.</p>
        <p className="max-w-md text-sm text-[var(--text-muted)]">{descricao}</p>
      </Card>
    </div>
  );
}
