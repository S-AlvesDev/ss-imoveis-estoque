import { type ReactNode } from 'react';
import { AlertTriangle, RefreshCw, WifiOff } from 'lucide-react';
import { Botao } from './Botao';

/**
 * Os estados que toda tela tem: carregando (esqueleto), vazio, erro e
 * offline — sempre com o mesmo desenho, para a pessoa reconhecer de longe.
 */

/** Um bloco cinza que pulsa no lugar do que ainda não chegou. */
export function Esqueleto({ className = '' }: { className?: string }) {
  return <div className={`esqueleto rounded-lg ${className}`} aria-hidden />;
}

/** Linhas de texto de mentira. */
export function EsqueletoDeTexto({ linhas = 3, className = '' }: { linhas?: number; className?: string }) {
  return (
    <div className={`space-y-2 ${className}`} aria-hidden>
      {Array.from({ length: linhas }).map((_, i) => (
        <Esqueleto key={i} className={`h-3 ${i === linhas - 1 ? 'w-2/3' : 'w-full'}`} />
      ))}
    </div>
  );
}

/** O cartão de KPI ainda carregando. */
export function EsqueletoDeKpi() {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5" aria-hidden>
      <div className="flex items-center justify-between">
        <Esqueleto className="h-3 w-24" />
        <Esqueleto className="h-8 w-8 rounded-lg" />
      </div>
      <Esqueleto className="mt-3 h-8 w-20" />
      <Esqueleto className="mt-2.5 h-3 w-32" />
    </div>
  );
}

/** Linhas de uma lista carregando (avatar + duas linhas). */
export function EsqueletoDeLista({ linhas = 4, className = '' }: { linhas?: number; className?: string }) {
  return (
    <div className={`divide-y divide-[var(--border)] ${className}`} aria-hidden>
      {Array.from({ length: linhas }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3">
          <Esqueleto className="h-10 w-10 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <Esqueleto className="h-3 w-1/3" />
            <Esqueleto className="h-3 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

interface VazioProps {
  icone: ReactNode;
  titulo: ReactNode;
  texto?: ReactNode;
  acao?: ReactNode;
  /** Roxo suave para "tudo tranquilo", cinza para "nada aqui". */
  tom?: 'neutro' | 'positivo';
  compacto?: boolean;
  className?: string;
}

/** Nada para mostrar — dito com calma, e com o que fazer a seguir quando há. */
export function Vazio({ icone, titulo, texto, acao, tom = 'neutro', compacto, className = '' }: VazioProps) {
  return (
    <div className={`flex flex-col items-center justify-center text-center ${compacto ? 'gap-2 px-4 py-8' : 'gap-3 px-6 py-14'} ${className}`}>
      <span className={`flex items-center justify-center rounded-2xl ${compacto ? 'h-10 w-10' : 'h-12 w-12'} ${tom === 'positivo' ? 'bg-[var(--brand-soft)] text-[var(--brand)]' : 'bg-[var(--bg-2)] text-[var(--text-muted)]'}`}>{icone}</span>
      <div>
        <p className={`font-semibold text-[var(--text)] ${compacto ? 'text-sm' : 'text-[15px]'}`}>{titulo}</p>
        {texto && <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-[var(--text-muted)] sm:text-[13px]">{texto}</p>}
      </div>
      {acao && <div className="mt-1">{acao}</div>}
    </div>
  );
}

/** Deu errado: a mensagem e o botão de tentar de novo. */
export function Erro({ mensagem, aoTentar, className = '' }: { mensagem: ReactNode; aoTentar?: () => void; className?: string }) {
  return (
    <div className={`flex flex-col items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50/70 px-5 py-6 text-center sm:flex-row sm:text-left ${className}`} role="alert">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[var(--vermelho)] shadow-sm">
        <AlertTriangle size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-rose-900">Não deu certo.</p>
        <p className="mt-0.5 text-xs text-rose-800/80">{mensagem}</p>
      </div>
      {aoTentar && (
        <Botao variante="secundaria" tamanho="sm" icone={<RefreshCw size={13} />} onClick={aoTentar}>
          Tentar de novo
        </Botao>
      )}
    </div>
  );
}

/** Sem conexão (ou sem o WhatsApp): uma faixa discreta. */
export function FaixaOffline({ texto, acao }: { texto: ReactNode; acao?: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">
      <WifiOff size={14} className="shrink-0" />
      <span className="min-w-0 flex-1">{texto}</span>
      {acao}
    </div>
  );
}

type TomDoAlerta = 'info' | 'aviso' | 'erro' | 'sucesso' | 'ia';
const ALERTA: Record<TomDoAlerta, string> = {
  info: 'border-sky-200 bg-sky-50 text-sky-900',
  aviso: 'border-amber-200 bg-amber-50 text-amber-900',
  erro: 'border-rose-200 bg-rose-50 text-rose-900',
  sucesso: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  ia: 'border-[var(--brand)]/20 bg-[var(--brand-soft)]/60 text-[var(--brand-ink)]',
};

/** Um aviso dentro da tela: cor pelo tom, ícone opcional, ação à direita. */
export function Alerta({ tom = 'info', icone, titulo, children, acao, className = '' }: { tom?: TomDoAlerta; icone?: ReactNode; titulo?: ReactNode; children?: ReactNode; acao?: ReactNode; className?: string }) {
  return (
    <div className={`flex flex-col gap-2 rounded-xl border px-4 py-3 text-sm sm:flex-row sm:items-center ${ALERTA[tom]} ${className}`} role={tom === 'erro' ? 'alert' : undefined}>
      <div className="flex min-w-0 flex-1 items-start gap-2.5">
        {icone && <span className="mt-0.5 shrink-0 opacity-80">{icone}</span>}
        <div className="min-w-0">
          {titulo && <p className="font-semibold">{titulo}</p>}
          {children && <div className={`text-[13px] leading-5 ${titulo ? 'mt-0.5 opacity-85' : ''}`}>{children}</div>}
        </div>
      </div>
      {acao && <div className="shrink-0 self-start sm:self-auto">{acao}</div>}
    </div>
  );
}
