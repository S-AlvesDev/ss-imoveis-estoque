import { describe, it, expect } from 'vitest';
import { configuracaoSmtp, remetente, destinatarioAdmin, destinatarioDemo } from './mail';

describe('configuracaoSmtp', () => {
  it('sem variável nenhuma, não há e-mail', () => {
    expect(configuracaoSmtp({})).toBeNull();
  });

  it('Hostinger: host, usuário e senha; porta 465 com TLS direto por padrão', () => {
    const c = configuracaoSmtp({ SMTP_HOST: 'smtp.hostinger.com', SMTP_USER: 'contato@stokai.app', SMTP_PASS: 'segredo' });
    expect(c).toEqual({ host: 'smtp.hostinger.com', port: 465, secure: true, auth: { user: 'contato@stokai.app', pass: 'segredo' } });
  });

  it('porta 587 vira STARTTLS (secure falso)', () => {
    const c = configuracaoSmtp({ SMTP_HOST: 'smtp.hostinger.com', SMTP_PORT: '587', SMTP_USER: 'a@b.co', SMTP_PASS: 'x' });
    expect(c?.port).toBe(587);
    expect(c?.secure).toBe(false);
  });

  it('as variáveis antigas da Brevo continuam funcionando', () => {
    const c = configuracaoSmtp({ BREVO_SMTP_LOGIN: 'login', BREVO_SMTP_KEY: 'chave' });
    expect(c).toEqual({ host: 'smtp-relay.brevo.com', port: 2525, secure: false, auth: { user: 'login', pass: 'chave' } });
  });

  it('SMTP_* tem prioridade sobre BREVO_*', () => {
    const c = configuracaoSmtp({ BREVO_SMTP_LOGIN: 'login', BREVO_SMTP_KEY: 'chave', SMTP_HOST: 'smtp.hostinger.com', SMTP_USER: 'u', SMTP_PASS: 'p' });
    expect(c?.host).toBe('smtp.hostinger.com');
    expect(c?.auth.user).toBe('u');
  });

  it('host sem senha não configura pela metade', () => {
    expect(configuracaoSmtp({ SMTP_HOST: 'smtp.hostinger.com', SMTP_USER: 'u' })).toBeNull();
  });
});

describe('endereços', () => {
  const hostinger = { SMTP_USER: 'contato@stokai.app' };

  it('remetente é a caixa autenticada, com o nome do produto na frente', () => {
    expect(remetente(hostinger)).toBe('"Stok Aí" <contato@stokai.app>');
    expect(remetente({ ...hostinger, SMTP_FROM_EMAIL: 'noreply@stokai.app' })).toBe('"Stok Aí" <noreply@stokai.app>');
  });

  it('nome próprio manda; endereço já formatado passa intacto', () => {
    expect(remetente({ ...hostinger, SMTP_FROM_NOME: 'Compras Horizonte' })).toBe('"Compras Horizonte" <contato@stokai.app>');
    expect(remetente({ ...hostinger, SMTP_FROM_EMAIL: 'Suporte <ajuda@stokai.app>' })).toBe('Suporte <ajuda@stokai.app>');
  });

  it('administrador recebe na própria caixa se ADMIN_EMAIL não existir', () => {
    expect(destinatarioAdmin(hostinger)).toBe('contato@stokai.app');
    expect(destinatarioAdmin({ ...hostinger, ADMIN_EMAIL: 'samuel@stokai.app' })).toBe('samuel@stokai.app');
  });

  it('demonstração cai em DEMO_EMAIL, depois ADMIN_EMAIL, depois a caixa', () => {
    expect(destinatarioDemo(hostinger)).toBe('contato@stokai.app');
    expect(destinatarioDemo({ ...hostinger, ADMIN_EMAIL: 'adm@stokai.app' })).toBe('adm@stokai.app');
    expect(destinatarioDemo({ ...hostinger, ADMIN_EMAIL: 'adm@stokai.app', DEMO_EMAIL: 'vendas@stokai.app' })).toBe('vendas@stokai.app');
  });
});
