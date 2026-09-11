import { useMarca } from '@/store/marca';
import { PRODUTO } from '@/shared/produto';

/**
 * A marca do produto: uma caixa vista de cima, com a tampa aberta — o que um
 * almoxarifado é. Desenhada na cor da marca, então acompanha a cor que a
 * organização escolher. Serve de logo enquanto a organização não sobe o dela.
 */
export function MarcaProduto({ size = 32, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      role="img"
      aria-label={PRODUTO.nome}
      className={`shrink-0 ${className}`}
      style={{ width: size, height: size }}
    >
      <rect width="32" height="32" rx="8" fill="var(--brand)" />
      {/* corpo da caixa */}
      <path d="M8 13.5 L16 17.5 L24 13.5 L24 23 L16 27 L8 23 Z" fill="#fff" fillOpacity="0.92" />
      {/* lado direito em sombra, para dar volume */}
      <path d="M16 17.5 L24 13.5 L24 23 L16 27 Z" fill="#000" fillOpacity="0.12" />
      {/* tampas abertas */}
      <path d="M8 13.5 L16 17.5 L12.5 9.5 L4.5 5.5 Z" fill="#fff" fillOpacity="0.7" />
      <path d="M24 13.5 L16 17.5 L19.5 9.5 L27.5 5.5 Z" fill="#fff" fillOpacity="0.7" />
    </svg>
  );
}

/**
 * O logo da organização em uso — ou a marca do produto, enquanto ela não
 * subir um. Onde a tela é da organização (barra lateral, topo), é este.
 */
export function Logo({ size = 32, className = '' }: { size?: number; className?: string }) {
  const organizacao = useMarca((s) => s.organizacao);
  if (!organizacao?.logo_url) return <MarcaProduto size={size} className={className} />;
  return (
    <img
      src={organizacao.logo_url}
      alt={organizacao.nome}
      width={size}
      height={size}
      className={`shrink-0 object-contain ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
