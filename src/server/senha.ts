/**
 * Recuperação de senha e os e-mails de conta (boas-vindas, aviso interno).
 * Funções puras; a rota em app.ts grava, envia e responde.
 *
 * O token que vai no link é aleatório (32 bytes) e só o hash dele fica no
 * banco: vazar a tabela não dá acesso a ninguém. Vale uma hora e uma vez.
 */
import { createHash, randomBytes } from 'node:crypto';
import { PRODUTO } from '../shared/produto';
import { escapeHtml, layoutEmail, p, tabela } from './email-layout';

export const VALIDADE_DO_TOKEN_MS = 60 * 60 * 1000;
export const MIN_SENHA = 8;
export const MAX_SENHA = 200;

/** O endereço público do produto, para montar links. SITE_URL troca (ambiente de teste). */
export function siteUrl(env: Record<string, string | undefined> = process.env): string {
  return (env.SITE_URL || env.VITE_SITE_URL || 'https://stokai.app').replace(/\/+$/, '');
}

export function gerarToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashDoToken(token) };
}

export function hashDoToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** O token tem cara de token? Antes de gastar uma consulta no banco. */
export function tokenPlausivel(token: unknown): token is string {
  return typeof token === 'string' && /^[A-Za-z0-9_-]{40,50}$/.test(token);
}

export interface RegistroDeReset {
  expires_at: string;
  used_at: string | null;
}

/** Não usado e dentro do prazo. */
export function tokenValido(registro: RegistroDeReset, agora: Date = new Date()): boolean {
  if (registro.used_at) return false;
  return new Date(registro.expires_at).getTime() > agora.getTime();
}

export function validarNovaSenha(senha: unknown): string | null {
  if (typeof senha !== 'string') return 'Informe a nova senha.';
  if (senha.length < MIN_SENHA) return `A senha deve ter pelo menos ${MIN_SENHA} caracteres.`;
  if (senha.length > MAX_SENHA) return 'Senha longa demais.';
  return null;
}

export function linkDeRedefinicao(token: string, env?: Record<string, string | undefined>): string {
  return `${siteUrl(env)}/redefinir-senha?token=${encodeURIComponent(token)}`;
}

/** Só o primeiro nome, para o e-mail soar como conversa. */
function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] || nome;
}

// ---------------------------------------------------------------------------
//  Os e-mails
// ---------------------------------------------------------------------------

export function emailDeRecuperacao(nome: string, link: string): { subject: string; html: string } {
  return {
    subject: 'Redefinir sua senha do Stok Aí',
    html: layoutEmail({
      titulo: `Olá, ${escapeHtml(primeiroNome(nome))}.`,
      corpo: p('Recebemos um pedido para redefinir a senha da sua conta. O botão abaixo vale por <strong>1 hora</strong> e funciona uma vez só.'),
      botao: { rotulo: 'Criar nova senha', url: link },
      observacao: 'Se você não pediu isso, pode ignorar este e-mail — sua senha continua a mesma.',
    }),
  };
}

export function emailDeBoasVindas(nome: string, empresa: string, env?: Record<string, string | undefined>): { subject: string; html: string } {
  const base = siteUrl(env);
  return {
    subject: `Bem-vindo(a) ao Stok Aí, ${primeiroNome(nome)}`,
    html: layoutEmail({
      titulo: `${escapeHtml(empresa)} está no ar.`,
      corpo:
        p(`Olá, ${escapeHtml(primeiroNome(nome))}. A conta da <strong>${escapeHtml(empresa)}</strong> foi criada e você é o administrador. Ela já vem com uma unidade e dois depósitos (Central e Obra) prontos.`) +
        p('Por onde começar:') +
        `<ol style="margin:0 0 12px;padding-left:20px">` +
        `<li style="margin-bottom:6px"><strong>Materiais</strong> — cadastre o que a empresa controla, com unidade de medida e estoque mínimo.</li>` +
        `<li style="margin-bottom:6px"><strong>Usuários</strong> — crie o acesso de quem opera cada depósito.</li>` +
        `<li style="margin-bottom:6px"><strong>Movimentações</strong> — registre entradas, remessas e consumos; o painel faz o resto.</li>` +
        `</ol>` +
        p(`Você entra com este e-mail em <a href="${escapeHtml(base)}/entrar" style="color:${PRODUTO.cor}">${escapeHtml(base.replace(/^https?:\/\//, ''))}/entrar</a>. Esqueceu a senha? Tem "Esqueci minha senha" na tela de login.`),
      botao: { rotulo: 'Abrir o Stok Aí', url: `${base}/entrar` },
      observacao: 'Dúvida, sugestão ou algo que não funcionou? Responda este e-mail ou chame no WhatsApp — quem responde é gente.',
    }),
  };
}

export interface NovaEmpresa {
  empresa: string;
  nome: string;
  email: string;
  slug: string;
  ip?: string;
}

/** Aviso interno: alguém acabou de criar uma conta. Vai para o comercial. */
export function emailDeNovaEmpresa(dados: NovaEmpresa): { subject: string; html: string } {
  return {
    subject: `Nova empresa no Stok Aí: ${dados.empresa}`,
    html: layoutEmail({
      titulo: 'Nova conta criada',
      corpo:
        p(`<strong>${escapeHtml(dados.nome)}</strong> acabou de criar a conta da <strong>${escapeHtml(dados.empresa)}</strong> sozinho(a), pela Home.`) +
        tabela([
          ['E-mail', dados.email],
          ['Slug', dados.slug],
          ['IP', dados.ip ?? null],
        ]) +
        p('Vale um oi nas próximas 24 horas: é quando a pessoa decide se o produto entra na rotina.'),
    }),
  };
}
