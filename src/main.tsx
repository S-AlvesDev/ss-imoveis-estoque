import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Analytics } from '@vercel/analytics/react';
import * as Sentry from '@sentry/react';
import App from './App';
import './index.css';

// Erros do navegador vão para o Sentry quando há DSN; sem ela, nada muda.
if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({ dsn: import.meta.env.VITE_SENTRY_DSN, environment: import.meta.env.MODE, sendDefaultPii: false, tracesSampleRate: 0 });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    {/* Visitas e eventos da Home. Só envia em produção, na Vercel. */}
    <Analytics />
  </StrictMode>
);
