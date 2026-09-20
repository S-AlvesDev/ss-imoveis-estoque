import { type ReactNode } from 'react';

/**
 * A tabela que vira cartões no celular. No desktop, cabeçalho miúdo em
 * caixa alta e linhas com zebra suave; abaixo de `sm`, cada linha é um
 * cartão com rótulo e valor — nada de rolagem horizontal.
 */
export interface Coluna<T> {
  chave: string;
  titulo: ReactNode;
  render: (linha: T) => ReactNode;
  alinhar?: 'esquerda' | 'direita' | 'centro';
  /** A coluna que dá nome ao cartão no celular (vai no topo, sem rótulo). */
  principal?: boolean;
  /** Não aparece no cartão do celular (ações repetidas, colunas decorativas). */
  soNoDesktop?: boolean;
  /** Botões de ação: no celular vão para o rodapé do cartão, alinhados à direita. */
  acoes?: boolean;
  larguraMinima?: string;
  className?: string;
}

interface TabelaProps<T> {
  colunas: Coluna<T>[];
  linhas: T[];
  chave: (linha: T) => string;
  vazio?: ReactNode;
  onClickLinha?: (linha: T) => void;
  /** Um rodapé (totais) no desktop. */
  rodape?: ReactNode;
  compacta?: boolean;
  className?: string;
}

const ALINHAR = { esquerda: 'text-left', direita: 'text-right', centro: 'text-center' };

export function Tabela<T>({ colunas, linhas, chave, vazio, onClickLinha, rodape, compacta, className = '' }: TabelaProps<T>) {
  if (linhas.length === 0 && vazio) return <>{vazio}</>;
  const principal = colunas.find((c) => c.principal) ?? colunas[0];
  const doCartao = colunas.filter((c) => c !== principal && !c.soNoDesktop && !c.acoes);
  const acoesDoCartao = colunas.filter((c) => c.acoes);
  return (
    <div className={className}>
      {/* Desktop e tablet: a tabela. */}
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              {colunas.map((c) => (
                <th key={c.chave} scope="col" style={{ minWidth: c.larguraMinima }} className={`whitespace-nowrap border-b border-[var(--border)] pb-2.5 pr-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)] first:pl-1 last:pr-1 ${ALINHAR[c.alinhar ?? 'esquerda']} ${c.className ?? ''}`}>
                  {c.titulo}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={chave(l)} onClick={onClickLinha ? () => onClickLinha(l) : undefined} className={`group ${onClickLinha ? 'cursor-pointer' : ''}`}>
                {colunas.map((c) => (
                  <td key={c.chave} className={`border-b border-[var(--border)] pr-3 align-middle first:pl-1 last:pr-1 group-last:border-b-0 ${compacta ? 'py-2' : 'py-3'} ${onClickLinha ? 'transition-colors group-hover:bg-[var(--bg)]' : ''} ${ALINHAR[c.alinhar ?? 'esquerda']} ${c.className ?? ''}`}>
                    {c.render(l)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {rodape && <tfoot>{rodape}</tfoot>}
        </table>
      </div>

      {/* Celular: um cartão por linha. */}
      <ul className="space-y-2 sm:hidden">
        {linhas.map((l) => (
          <li key={chave(l)} onClick={onClickLinha ? () => onClickLinha(l) : undefined} className={`rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3.5 ${onClickLinha ? 'active:bg-[var(--bg)]' : ''}`}>
            <div className="text-sm font-semibold text-[var(--text)]">{principal.render(l)}</div>
            {doCartao.length > 0 && (
              <dl className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-2">
                {doCartao.map((c) => (
                  <div key={c.chave} className="min-w-0">
                    <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">{c.titulo}</dt>
                    <dd className="mt-0.5 min-w-0 text-sm text-[var(--text)]">{c.render(l)}</dd>
                  </div>
                ))}
              </dl>
            )}
            {acoesDoCartao.length > 0 && (
              <div className="mt-2.5 flex justify-end gap-1 border-t border-[var(--border)] pt-2.5">
                {acoesDoCartao.map((c) => (
                  <span key={c.chave}>{c.render(l)}</span>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
