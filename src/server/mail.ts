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
 * O remetente. Provedores como a Hostinger só aceitam enviar como a própria
 * caixa autenticada, então o padrão é o usuário do SMTP.
 */
export function remetente(env: Ambiente = process.env): string {
  return env.SMTP_FROM_EMAIL || env.SMTP_USER || 'noreply@stokai.app';
}

/** Quem recebe alertas de estoque e chamados: o administrador. */
export function destinatarioAdmin(env: Ambiente = process.env): string {
  return env.ADMIN_EMAIL || remetente(env);
}

/** Quem recebe pedidos de demonstração: o comercial, ou o administrador. */
export function destinatarioDemo(env: Ambiente = process.env): string {
  return env.DEMO_EMAIL || destinatarioAdmin(env);
}
