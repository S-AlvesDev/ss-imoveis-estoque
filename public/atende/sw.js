/* O service worker do Atende Aí: só notificações. Nada de cache — a tela
 * sempre vem do servidor, sem versão velha presa no aparelho.
 *
 * Push: se há uma janela do Atende visível, ela mesma avisa (toast, som);
 * senão, a notificação do sistema. Tocar na notificação abre (ou foca) o
 * Atende na conversa. */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => {
  let carga = {};
  try {
    carga = e.data ? e.data.json() : {};
  } catch {
    carga = { titulo: 'Atende Aí', corpo: e.data ? e.data.text() : '' };
  }
  e.waitUntil(
    (async () => {
      const janelas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const visivel = janelas.find((j) => j.visibilityState === 'visible');
      if (visivel) {
        visivel.postMessage({ tipo: 'push', carga });
        return;
      }
      await self.registration.showNotification(carga.titulo || 'Atende Aí', {
        body: carga.corpo || '',
        icon: '/atende/favicon_atendeai.png',
        badge: '/atende/favicon_atendeai.png',
        tag: carga.tag || 'atende',
        renotify: true,
        data: { url: carga.url || '/atende/central' },
      });
    })(),
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/atende/central';
  e.waitUntil(
    (async () => {
      const janelas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const janela = janelas[0];
      if (janela) {
        try {
          await janela.focus();
        } catch {
          /* alguns navegadores não deixam focar */
        }
        janela.postMessage({ tipo: 'abrir', url });
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});
