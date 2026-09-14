/** Máscara do WhatsApp na tela: "5584991434190" ou "84991434190" → "(84) 99143-4190"; com DDI estrangeiro, deixa os dígitos. */
export function formatarWhatsapp(v: string): string {
  let d = v.replace(/\D/g, '');
  if (d.startsWith('55') && d.length >= 12) d = d.slice(2);
  if (d.length > 11) return `+${d}`;
  d = d.slice(0, 11);
  if (d.length <= 2) return d ? `(${d}` : '';
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}
