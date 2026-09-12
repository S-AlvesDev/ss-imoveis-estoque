import { useMarca } from '@/store/marca';
import { PRODUTO } from '@/shared/produto';

/**
 * O símbolo do produto: a caixa isométrica com o "S" do Stok Aí. É uma imagem
 * fixa, laranja — a marca não muda de cor junto com a organização. Serve de
 * logo enquanto a organização não sobe o dela.
 */
export function MarcaProduto({ size = 32, className = '' }: { size?: number; className?: string }) {
  return (
    <img
      src={size > 128 ? PRODUTO.simboloGrande : PRODUTO.simbolo}
      alt={PRODUTO.nome}
      width={size}
      height={size}
      decoding="async"
      className={`shrink-0 object-contain ${className}`}
      style={{ width: size, height: size }}
    />
  );
}

type Fundo = 'escuro' | 'claro' | 'auto';

interface LogoProdutoProps {
  /** Altura em px; a largura acompanha a proporção da imagem (584×167). */
  height?: number;
  /** Sobre que fundo a marca vai: "auto" segue o tema claro/escuro do sistema. */
  fundo?: Fundo;
  /** Com o slogan "Sua operação, no controle." embaixo. */
  slogan?: boolean;
  className?: string;
}

/**
 * O logo horizontal do produto — símbolo + "Stok Aí" — na versão certa para
 * o fundo. O "Stok" é branco numa e preto na outra, então a escolha errada
 * some com metade do nome.
 */
export function LogoProduto({ height = 28, fundo = 'escuro', slogan = false, className = '' }: LogoProdutoProps) {
  const fontes = slogan ? PRODUTO.logoComSlogan : PRODUTO.logoHorizontal;
  const alt = slogan ? `${PRODUTO.nome} — ${PRODUTO.slogan}` : PRODUTO.nome;
  const comum = { alt, height, decoding: 'async' as const, style: { height, width: 'auto' } };
  if (fundo !== 'auto') {
    return <img src={fontes[fundo]} className={`shrink-0 ${className}`} {...comum} />;
  }
  // Tema do sistema: a versão clara no tema claro, a escura no escuro.
  return (
    <>
      <img src={fontes.claro} className={`shrink-0 dark:hidden ${className}`} {...comum} />
      <img src={fontes.escuro} className={`hidden shrink-0 dark:block ${className}`} {...comum} aria-hidden />
    </>
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
