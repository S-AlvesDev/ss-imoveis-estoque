/**
 * De onde o sistema manda e-mail — alertas de estoque, chamados de suporte,
 * pedidos de demonstração.
 *
 * Qualquer SMTP serve (Hostinger, Gmail, Brevo...): SMTP_HOST, SMTP_PORT,
 * SMTP_USER, SMTP_PASS. As variáveis BREVO_* continuam valendo, para quem
 * já configurou por elas. Sem nada disso, o sistema não manda e-mail e
 * segue funcionando — cada envio é conveniência, nunca requisito.
 *
 * Funções puras sobre um objeto de ambiente, para dar para testar sem
 * mexer no process.env.
 */

import nodemailer from 'nodemailer';
import { PRODUTO } from '../shared/produto';

type Ambiente = Record<string, string | undefined>;

export interface ConfiguracaoSmtp {
  host: string;
  port: number;
  /** TLS desde a conexão (porta 465). Nas outras portas o nodemailer sobe para STARTTLS sozinho. */
  secure: boolean;
  auth: { user: string; pass: string };
}

export function configuracaoSmtp(env: Ambiente = process.env): ConfiguracaoSmtp | null {
  const brevo = Boolean(env.BREVO_SMTP_LOGIN && env.BREVO_SMTP_KEY);
  const host = env.SMTP_HOST || (brevo ? 'smtp-relay.brevo.com' : '');
  const user = env.SMTP_USER || env.BREVO_SMTP_LOGIN || '';
  const pass = env.SMTP_PASS || env.BREVO_SMTP_KEY || '';
  if (!host || !user || !pass) return null;

  // Brevo atende em 2525; o resto do mundo em 465 (TLS direto) ou 587.
  const port = Number(env.SMTP_PORT) || (env.SMTP_HOST ? 465 : 2525);
  return { host, port, secure: port === 465, auth: { user, pass } };
}

/**
 * O remetente, com nome: na caixa de entrada aparece "Stok Aí", não
 * "team". Provedores como a Hostinger só aceitam enviar como a própria
 * caixa autenticada, então o endereço é sempre o do SMTP.
 *
 * Quem já escreveu o nome na variável (`Fulano <a@b.com>`) manda nela.
 */
export function remetente(env: Ambiente = process.env): string {
  const endereco = enderecoDoRemetente(env);
  if (endereco.includes('<')) return endereco;
  const nome = env.SMTP_FROM_NOME || PRODUTO.nome;
  return `"${nome.replace(/"/g, '')}" <${endereco}>`;
}

/** O endereço puro, sem nome — é o que serve como destinatário de fallback. */
function enderecoDoRemetente(env: Ambiente): string {
  return env.SMTP_FROM_EMAIL || env.SMTP_USER || 'noreply@stokai.app';
}

/** Quem recebe alertas de estoque e chamados: o administrador. */
export function destinatarioAdmin(env: Ambiente = process.env): string {
  return env.ADMIN_EMAIL || enderecoDoRemetente(env);
}

/** Quem recebe pedidos de demonstração: o comercial, ou o administrador. */
export function destinatarioDemo(env: Ambiente = process.env): string {
  return env.DEMO_EMAIL || destinatarioAdmin(env);
}

let transporter: nodemailer.Transporter | null = null;
/** O transporte de e-mail, criado uma vez. Nulo sem SMTP configurado: o sistema segue sem e-mail. */
export async function getTransporter(): Promise<nodemailer.Transporter | null> {
  if (transporter) return transporter;
  const config = configuracaoSmtp();
  if (!config) return null;
  transporter = nodemailer.createTransport(config);
  return transporter;
}
