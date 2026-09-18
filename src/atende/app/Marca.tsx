import { useState } from 'react';
import { ATENDE } from '../shared/produto';

/**
 * A marca do Atende Aí na tela.
 *
 * Em fundo claro, o logo completo (símbolo + nome + slogan, em navy). Em fundo
 * escuro o logo some — o "Atende" é navy —, então a marca vira o símbolo com o
 * nome desenhado: "Atende" em branco e "Aí" no gradiente roxo, como no logo.
 */
export function MarcaAtende({ tema, tamanho = 32, className = '' }: { tema: 'escuro' | 'claro'; tamanho?: number; className?: string }) {
  const [semArquivo, setSemArquivo] = useState(false);
  if (tema === 'claro' && !semArquivo) {
    // O arquivo tem o slogan embaixo, então é mais alto que um logo horizontal comum: ~1,8× o tamanho pedido.
    return <img src={ATENDE.logoClaro} alt={`${ATENDE.nome} — ${ATENDE.slogan}`} style={{ height: tamanho * 1.8, width: 'auto' }} onError={() => setSemArquivo(true)} className={`select-none ${className}`} draggable={false} />;
  }
  const principal = tema === 'escuro' ? 'text-white' : 'text-[var(--navy)]';
  return (
    <span className={`inline-flex items-center gap-2 font-extrabold tracking-tight ${className}`} style={{ fontSize: tamanho * 0.72, lineHeight: 1 }} aria-label={ATENDE.nome}>
      <Simbolo tamanho={tamanho} />
      <span>
        <span className={principal}>Atende</span> <span className="bg-gradient-to-r from-[#8b5cf6] to-[#4c1d95] bg-clip-text text-transparent">Aí</span>
      </span>
    </span>
  );
}

/** O "A" com três pontos, em SVG, para quando não há arquivo. */
export function Simbolo({ tamanho = 32 }: { tamanho?: number }) {
  const [semArquivo, setSemArquivo] = useState(false);
  if (!semArquivo) return <img src={ATENDE.simbolo} alt="" width={tamanho} height={tamanho} onError={() => setSemArquivo(true)} className="select-none" draggable={false} />;
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 48 48" aria-hidden="true" className="shrink-0 self-center">
      <defs>
        <linearGradient id="atende-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8b5cf6" />
          <stop offset="1" stopColor="#4c1d95" />
        </linearGradient>
      </defs>
      <path d="M24 4 L44 40 H30 L24 29 L18 40 H4 Z" fill="url(#atende-g)" />
      <circle cx="17" cy="35" r="2.4" fill="#fff" />
      <circle cx="24" cy="35" r="2.4" fill="#fff" />
      <circle cx="31" cy="35" r="2.4" fill="#fff" />
    </svg>
  );
}
