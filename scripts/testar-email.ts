/**
 * Manda um e-mail de teste com a mesma configuração que o servidor usa.
 *
 *   npx tsx scripts/testar-email.ts
 *
 * Lê SMTP_* do .env (ou BREVO_*), envia para DEMO_EMAIL/ADMIN_EMAIL/a própria
 * caixa e imprime o que aconteceu. Não toca no banco nem no sistema.
 */
import 'dotenv/config';
import nodemailer from 'nodemailer';
import { configuracaoSmtp, remetente, destinatarioDemo } from '../src/server/mail';

async function main() {
  const config = configuracaoSmtp();
  if (!config) {
    console.error('Nenhum SMTP configurado. Preencha SMTP_HOST, SMTP_PORT, SMTP_USER e SMTP_PASS no .env (veja .env.example).');
    process.exit(1);
  }
  console.log(`SMTP: ${config.host}:${config.port} (${config.secure ? 'TLS direto' : 'STARTTLS'}) como ${config.auth.user}`);
  console.log(`De:   ${remetente()}`);
  console.log(`Para: ${destinatarioDemo()}`);

  const t = nodemailer.createTransport(config);
  await t.verify();
  console.log('Conexão e login: OK');

  const info = await t.sendMail({
    from: remetente(),
    to: destinatarioDemo(),
    subject: 'Stok Aí — teste de e-mail',
    text: `Se você está lendo isto, o envio pelo SMTP está funcionando.\nEnviado em ${new Date().toLocaleString('pt-BR')}.`,
  });
  console.log(`Enviado: ${info.messageId}`);
}

main().catch((err) => {
  console.error('FALHOU:', err.message);
  if (/auth|535|login/i.test(err.message)) console.error('→ Confira SMTP_USER (e-mail completo) e SMTP_PASS (senha da caixa).');
  if (/ECONNREFUSED|ETIMEDOUT|ENOTFOUND/i.test(err.message)) console.error('→ Confira SMTP_HOST e SMTP_PORT (Hostinger: smtp.hostinger.com, 465).');
  process.exit(1);
});
