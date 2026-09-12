/**
 * A moldura de todo e-mail que o Stok Aí manda: cabeçalho navy com o nome,
 * um cartão branco com o conteúdo, rodapé com o WhatsApp. Só HTML de tabela
 * e estilo inline — é o que clientes de e-mail entendem. Sem imagens: um
 * logo que não carrega vira um quadrado quebrado no topo da mensagem.
 */
import { PRODUTO, linkWhatsApp, whatsappFormatado } from '../shared/produto';

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Tudo que vem de fora (nome, empresa, e-mail) passa por aqui antes de entrar no HTML. */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

interface Partes {
  /** O que aparece em destaque, logo abaixo do cabeçalho. */
  titulo: string;
  /** HTML já montado (e já escapado onde precisa). */
  corpo: string;
  /** Botão principal, se houver. */
  botao?: { rotulo: string; url: string };
  /** Linha discreta no fim, para o "se não foi você, ignore". */
  observacao?: string;
}

export function layoutEmail({ titulo, corpo, botao, observacao }: Partes): string {
  const botaoHtml = botao
    ? `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:24px 0 8px"><tr><td style="background:${PRODUTO.cor};border-radius:10px">` +
      `<a href="${escapeHtml(botao.url)}" style="display:inline-block;padding:12px 22px;color:#1a0c00;font-weight:700;text-decoration:none;font-family:Inter,Arial,sans-serif;font-size:15px">${escapeHtml(botao.rotulo)}</a>` +
      `</td></tr></table>` +
      `<p style="margin:8px 0 0;font-size:12px;color:#607089;font-family:Inter,Arial,sans-serif;word-break:break-all">Se o botão não abrir, copie este endereço: <a href="${escapeHtml(botao.url)}" style="color:#607089">${escapeHtml(botao.url)}</a></p>`
    : '';
  const obsHtml = observacao ? `<p style="margin:24px 0 0;font-size:13px;color:#607089;font-family:Inter,Arial,sans-serif">${observacao}</p>` : '';

  return (
    `<!doctype html><html lang="pt-BR"><body style="margin:0;padding:0;background:#f3f4f7">` +
    `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f4f7;padding:24px 12px"><tr><td align="center">` +
    `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px">` +
    // cabeçalho
    `<tr><td style="background:${PRODUTO.navy};border-radius:14px 14px 0 0;padding:20px 28px;font-family:Inter,Arial,sans-serif">` +
    `<span style="font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.5px">Stok <span style="color:${PRODUTO.cor}">Aí</span></span>` +
    `<span style="display:block;margin-top:2px;font-size:12px;color:#8a94a6">${escapeHtml(PRODUTO.slogan)}</span>` +
    `</td></tr>` +
    // cartão
    `<tr><td style="background:#ffffff;padding:28px;font-family:Inter,Arial,sans-serif;color:#050f24;font-size:15px;line-height:1.55">` +
    `<h1 style="margin:0 0 14px;font-size:22px;line-height:1.2;font-weight:800;letter-spacing:-0.3px">${escapeHtml(titulo)}</h1>` +
    corpo +
    botaoHtml +
    obsHtml +
    `</td></tr>` +
    // rodapé
    `<tr><td style="background:#ffffff;border-top:1px solid #e1e1e1;border-radius:0 0 14px 14px;padding:16px 28px;font-family:Inter,Arial,sans-serif;font-size:12px;color:#607089">` +
    `${escapeHtml(PRODUTO.nome)} · <a href="${escapeHtml(linkWhatsApp())}" style="color:#607089">WhatsApp ${escapeHtml(whatsappFormatado())}</a>` +
    `</td></tr>` +
    `</table></td></tr></table></body></html>`
  );
}

/** Um parágrafo do corpo. O texto já deve vir escapado (ou ser literal do código). */
export function p(html: string): string {
  return `<p style="margin:0 0 12px">${html}</p>`;
}

/** Tabela rótulo → valor, para dados do formulário. Valores são escapados aqui. */
export function tabela(linhas: Array<[string, string | null]>): string {
  return (
    `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:12px 0;font-size:14px">` +
    linhas
      .map(
        ([rotulo, valor]) =>
          `<tr><td style="padding:4px 14px 4px 0;color:#607089;vertical-align:top">${escapeHtml(rotulo)}</td><td style="padding:4px 0"><strong>${escapeHtml(valor ?? '—')}</strong></td></tr>`,
      )
      .join('') +
    `</table>`
  );
}
