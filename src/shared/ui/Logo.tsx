export function Logo({ size = 32, className = '' }: { size?: number; className?: string }) {
  return (
    <img
      src="/logo-ss-imoveis.webp"
      alt="SS Imóveis"
      width={size}
      height={size}
      className={`shrink-0 object-contain ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
