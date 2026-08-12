import { createApp } from './app';

// Entry usado apenas para gerar api/index.js (ver script "build:api" no package.json).
// Mantém a Vercel livre de resolver imports locais entre arquivos em produção.
export default createApp();
