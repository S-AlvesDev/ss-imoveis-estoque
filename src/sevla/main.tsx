import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Analytics } from '@vercel/analytics/react';
import { Sevla } from './Sevla';
import './sevla.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Sevla />
    <Analytics />
  </StrictMode>,
);
