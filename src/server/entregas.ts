/**
 * Entregas — o modo "Entrega / EPI" de um estoque.
 *
 * Um capacete entregue ao Marlon não volta; o que se cobra é a TROCA quando
 * a validade do material vence. A entrega mora na mesma tabela dos
 * empréstimos (`loans`, tipo = 'entrega'), com `prazo_em` significando
 * "válido até". Aqui ficam as regras puras; a rota grava e mexe no saldo.
 */

const DIA_MS = 24 * 60 * 60 * 1000;

export interface EntregaLimpa {
  material_id: number;
  quantidade: number;
  tomador_nome: string;
  tomador_referencia: string | null;
  observacao: string | null;
  /** PNG em data URL, ou nulo. */
  assinatura: string | null;
}

export type ValidacaoEntrega = { ok: true; entrega: EntregaLimpa } | { ok: false; erro: string };

function texto(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/** Uma assinatura desenhada na tela: PNG pequeno em data URL. Nada de arquivo enorme nem outro formato. */
export function assinaturaValida(s: unknown): s is string {
  return typeof s === 'string' && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(s) && s.length <= 120_000;
}

export function validarEntrega(body: unknown, exigeAssinatura: boolean): ValidacaoEntrega {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;

  const material_id = Number(b.material_id);
  if (!Number.isInteger(material_id) || material_id <= 0) return { ok: false, erro: 'Escolha o material.' };

  const quantidade = Number(b.quantidade);
  if (!Number.isFinite(quantidade) || quantidade <= 0) return { ok: false, erro: 'A quantidade precisa ser maior que zero.' };

  const tomador_nome = texto(b.tomador_nome);
  if (tomador_nome.length < 2 || tomador_nome.length > 80) return { ok: false, erro: 'Informe quem está recebendo (2 a 80 caracteres).' };

  const referencia = texto(b.tomador_referencia);
  if (referencia.length > 40) return { ok: false, erro: 'Referência longa demais (até 40 caracteres).' };

  const observacao = texto(b.observacao);
  if (observacao.length > 300) return { ok: false, erro: 'Observação longa demais (até 300 caracteres).' };

  let assinatura: string | null = null;
  if (b.assinatura !== undefined && b.assinatura !== null && b.assinatura !== '') {
    if (!assinaturaValida(b.assinatura)) return { ok: false, erro: 'Assinatura inválida.' };
    assinatura = b.assinatura;
  }
  if (exigeAssinatura && !assinatura) return { ok: false, erro: 'Este estoque exige a assinatura de quem recebe.' };

  return {
    ok: true,
    entrega: {
      material_id,
      quantidade: Math.round(quantidade * 100) / 100,
      tomador_nome,
      tomador_referencia: referencia || null,
      observacao: observacao || null,
      assinatura,
    },
  };
}

/** "Válido até": agora + validade de troca do material. Sem validade, sem prazo. */
export function validoAte(validadeTrocaDias: number | null | undefined, agora: Date = new Date()): Date | null {
  if (!validadeTrocaDias || validadeTrocaDias <= 0) return null;
  return new Date(agora.getTime() + validadeTrocaDias * DIA_MS);
}

export interface EntregaBase {
  prazo_em: string | null;
  devolvido_em: string | null;
  encerrado_em: string | null;
}

/** Aberta = ainda com a pessoa. */
export function estaAberta(e: EntregaBase): boolean {
  return !e.devolvido_em && !e.encerrado_em;
}

/** Troca vencida: aberta, com validade, e a validade passou. */
export function trocaVencida(e: EntregaBase, agora: Date = new Date()): boolean {
  return estaAberta(e) && e.prazo_em !== null && new Date(e.prazo_em).getTime() < agora.getTime();
}

/** Troca vencendo: aberta, com validade dentro de `dias` dias. */
export function trocaVencendo(e: EntregaBase, dias: number, agora: Date = new Date()): boolean {
  if (!estaAberta(e) || e.prazo_em === null) return false;
  const fim = new Date(e.prazo_em).getTime();
  return fim >= agora.getTime() && fim <= agora.getTime() + dias * DIA_MS;
}

/** Como uma entrega termina sem voltar ao estoque. */
export const ENCERRAMENTOS = ['consumido', 'substituido'] as const;
export type Encerramento = (typeof ENCERRAMENTOS)[number];

export function ehEncerramento(s: unknown): s is Encerramento {
  return typeof s === 'string' && (ENCERRAMENTOS as readonly string[]).includes(s);
}
