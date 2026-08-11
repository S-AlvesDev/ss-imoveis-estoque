import express from 'express';
import path from 'path';
import http from 'http';
import { createServer as createViteServer } from 'vite';
import { createApp } from './src/server/app.ts';

const PORT = Number(process.env.PORT) || 3001;

async function startServer() {
  const app = createApp();
  const server = http.createServer(app);

  // --------------------------- FRONTEND (dev/self-host only; a Vercel serve o build separadamente) ---------------------------
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const gracefulShutdown = () => {
    console.log('\n[Server] Encerrando...');
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10000);
  };
  process.on('SIGINT', gracefulShutdown);
  process.on('SIGTERM', gracefulShutdown);

  server.listen(PORT, () => {
    console.log(`[Estoque SS Imóveis] Servidor rodando em http://localhost:${PORT}`);
  });

  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[Server] Porta ${PORT} já está em uso.`);
    } else {
      console.error('[Server] Erro crítico:', err);
    }
  });
}

startServer();
