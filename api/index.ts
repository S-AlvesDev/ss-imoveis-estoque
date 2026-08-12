import { createApp } from '../src/server/app';

// Ponto de entrada da Vercel: cada requisição para /api/* cai aqui (ver vercel.json).
// A Vercel empacota este arquivo como uma Serverless Function; o Express app funciona
// diretamente como handler porque sua assinatura (req, res) é compatível.
export default createApp();
