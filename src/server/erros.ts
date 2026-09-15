/**
 * Onde os erros vão parar quando ninguém está olhando o log da Vercel:
 * o Sentry. Com SENTRY_DSN, cada console.error e cada exceção solta vira
 * um evento com contexto; sem a variável, nada muda — o sistema segue
 * escrevendo no log como sempre.
 */

import * as Sentry from '@sentry/node';

export function errosConfigurados(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.SENTRY_DSN);
}

let iniciado = false;
export function iniciarErros(env: Record<string, string | undefined> = process.env): void {
  if (iniciado || !errosConfigurados(env)) return;
  iniciado = true;
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.VERCEL_ENV ?? env.NODE_ENV ?? 'development',
    release: env.VERCEL_GIT_COMMIT_SHA,
    // Cada console.error das rotas vira um evento: é assim que o código já reporta o que deu errado.
    integrations: [Sentry.captureConsoleIntegration({ levels: ['error'] })],
    tracesSampleRate: 0,
    sendDefaultPii: false,
  });
}

/** Erro fora de rota (rotina, webhook): registra com o que se sabe. */
export function reportarErro(erro: unknown, contexto?: Record<string, unknown>): void {
  if (!iniciado) return;
  Sentry.captureException(erro, contexto ? { extra: contexto } : undefined);
}
