import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

/** O endereço público do produto. VITE_SITE_URL troca (ex.: um ambiente de teste). */
const SITE_URL_PADRAO = 'https://stokai.app';

/**
 * Tudo que precisa do endereço público do site — og:image, sitemap, robots —
 * lê VITE_SITE_URL, com stokai.app de fábrica. Prévia de rede social exige
 * URL absoluta, então mesmo um deploy de teste aponta a imagem para o site
 * de verdade.
 */
function siteUrl(url: string): Plugin {
  const base = url.replace(/\/+$/, '');
  return {
    name: 'stokai-site-url',
    transformIndexHtml: (html) => html.replaceAll('%SITE_URL%', base),
    generateBundle() {
      const hoje = new Date().toISOString().slice(0, 10);
      const paginas = ['/', '/entrar', '/criar-conta', '/atende', '/atende/planos', '/cloud'];
      this.emitFile({
        type: 'asset',
        fileName: 'sitemap.xml',
        source:
          `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
          paginas.map((p) => `  <url><loc>${base}${p}</loc><lastmod>${hoje}</lastmod></url>`).join('\n') +
          `\n</urlset>\n`,
      });
      this.emitFile({
        type: 'asset',
        fileName: 'robots.txt',
        source: `User-agent: *\nAllow: /\nDisallow: /api/\n${base ? `Sitemap: ${base}/sitemap.xml\n` : ''}`,
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  return {
    plugins: [react(), tailwindcss(), siteUrl(env.VITE_SITE_URL || SITE_URL_PADRAO)],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    // Três entradas: o Stok Aí em index.html, o Atende Aí em atende.html e a
    // SEVLA INFINITY (a empresa-mãe, servida em /cloud) em sevla.html. Bundles separados — mexer num não muda o outro.
    build: {
      rollupOptions: {
        input: {
          index: path.resolve(__dirname, 'index.html'),
          atende: path.resolve(__dirname, 'atende.html'),
          sevla: path.resolve(__dirname, 'sevla.html'),
        },
      },
    },
  };
});
