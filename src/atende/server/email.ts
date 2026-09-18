import { escapeHtml, p } from '../../server/email-layout';
import { siteUrl } from '../../server/senha';
import { remetente } from '../../server/mail';
import { ATENDE, atendeUrl } from '../shared/produto';

/**
 * Os e-mails do Atende Aí, com a marca dele. O layout do Stok Aí é laranja e
 * assina "Stok Aí"; aqui é roxo e assina "Atende Aí" — o mesmo esqueleto de
 * tabela que funciona em todo cliente de e-mail, com as cores trocadas.
 */

interface Partes {
  titulo: string;
  corpo: string;
  botao?: { texto: string; href: string };
  observacao?: string;
}

export function layoutAtende({ titulo, corpo, botao, observacao }: Partes): string {
  const botaoHtml = botao
    ? `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:24px 0 8px"><tr><td style="background:${ATENDE.cor};border-radius:10px">` +
      `<a href="${escapeHtml(botao.href)}" style="display:inline-block;padding:12px 22px;font-family:Inter,Arial,sans-serif;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none">${escapeHtml(botao.texto)}</a>` +
      `</td></tr></table>`
    : '';
  return (
    `<!doctype html><html lang="pt-BR"><body style="margin:0;padding:24px;background:#f4f4fb">` +
    `<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center">` +
    `<table role="presentation" width="560" cellspacing="0" cellpadding="0" style="max-width:560px;width:100%">` +
    `<tr><td style="background:${ATENDE.navy};border-radius:14px 14px 0 0;padding:20px 28px;font-family:Inter,Arial,sans-serif">` +
    `<span style="font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.5px">Atende <span style="color:${ATENDE.lilas}">Aí</span></span>` +
    `<span style="display:block;margin-top:2px;font-size:12px;color:#9aa3c7">${escapeHtml(ATENDE.slogan)}</span>` +
    `</td></tr>` +
    `<tr><td style="background:#ffffff;padding:28px;font-family:Inter,Arial,sans-serif;font-size:15px;line-height:1.55;color:#1a1d2e;border:1px solid #e6e6f2;border-top:0">` +
    `<h1 style="margin:0 0 16px;font-size:20px;font-weight:800;color:${ATENDE.navy}">${titulo}</h1>` +
    corpo +
    botaoHtml +
    (observacao ? `<p style="margin:16px 0 0;font-size:12px;color:#6b7290">${observacao}</p>` : '') +
    `</td></tr>` +
    `<tr><td style="padding:16px 8px;font-family:Inter,Arial,sans-serif;font-size:12px;color:#8a90aa;text-align:center">${escapeHtml(ATENDE.nome)} · ${escapeHtml(atendeUrl(siteUrl()).replace(/^https?:\/\//, ''))}</td></tr>` +
    `</table></td></tr></table></body></html>`
  );
}

function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] || nome;
}

export function linkDeRedefinicaoAtende(token: string): string {
  return `${atendeUrl(siteUrl())}/redefinir-senha?token=${encodeURIComponent(token)}`;
}

export function emailDeRecuperacaoAtende(nome: string, link: string): { subject: string; html: string } {
  return {
    subject: `Redefinir sua senha do ${ATENDE.nome}`,
    html: layoutAtende({
      titulo: `Olá, ${escapeHtml(primeiroNome(nome))}.`,
      corpo: p('Recebemos um pedido para redefinir a sua senha. O link abaixo vale por <strong>1 hora</strong> e só funciona uma vez.') + p('Se não foi você, ignore este e-mail — a sua senha continua a mesma.'),
      botao: { texto: 'Criar nova senha', href: link },
      observacao: `Se o botão não funcionar, copie e cole: ${escapeHtml(link)}`,
    }),
  };
}

export function emailDeBoasVindasAtende(nome: string, empresa: string): { subject: string; html: string } {
  const base = atendeUrl(siteUrl());
  return {
    subject: `${empresa} está no ${ATENDE.nome}`,
    html: layoutAtende({
      titulo: `${escapeHtml(empresa)} está no ar.`,
      corpo:
        p(`Olá, ${escapeHtml(primeiroNome(nome))}. A conta da <strong>${escapeHtml(empresa)}</strong> foi criada e você é o <strong>administrador</strong>: cadastra os times, a equipe e conecta o WhatsApp da empresa.`) +
        p('Os próximos passos, na ordem: descreva a empresa (é o que a IA vai saber), crie os setores, cadastre a equipe e conecte o WhatsApp.') +
        p(`Você entra com este e-mail em <a href="${escapeHtml(base)}/entrar" style="color:${ATENDE.cor}">${escapeHtml(base.replace(/^https?:\/\//, ''))}/entrar</a>.`),
      botao: { texto: 'Entrar no Atende Aí', href: `${base}/entrar` },
    }),
  };
}

export function emailDeConviteAtende(nome: string, empresa: string, papel: string, linkDefinirSenha: string): { subject: string; html: string } {
  return {
    subject: `Você foi adicionado ao ${ATENDE.nome} da ${empresa}`,
    html: layoutAtende({
      titulo: `Olá, ${escapeHtml(primeiroNome(nome))}.`,
      corpo:
        p(`A <strong>${escapeHtml(empresa)}</strong> cadastrou você no ${escapeHtml(ATENDE.nome)} como <strong>${escapeHtml(papel)}</strong>.`) +
        p('Crie a sua senha pelo botão abaixo — o link vale por 1 hora. Depois, é só entrar com este e-mail.'),
      botao: { texto: 'Criar minha senha', href: linkDefinirSenha },
      observacao: `Se o botão não funcionar, copie e cole: ${escapeHtml(linkDefinirSenha)}`,
    }),
  };
}

/** O remetente com o nome do Atende Aí, no mesmo endereço SMTP do Stok Aí. */
export function remetenteAtende(): string {
  const base = remetente();
  const m = /<([^>]+)>/.exec(base);
  return `"${ATENDE.nome}" <${m ? m[1] : base}>`;
}
