import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Analytics } from '@vercel/analytics/react';
import { Sevla } from './Sevla';
import { MinhaSevla } from './MinhaSevla';
import { SEVLA } from './produto';
import './sevla.css';

// Duas páginas só: a apresentação da SEVLA em /cloud e a conta em /cloud/conta.
// Sem router — quando houver mais, ele entra.
const caminho = window.location.pathname.replace(/\/+$/, '');
const Pagina = caminho === SEVLA.conta ? MinhaSevla : Sevla;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Pagina />
    <Analytics />
  </StrictMode>,
);
