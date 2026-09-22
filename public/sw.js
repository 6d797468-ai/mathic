/**
 * sw.js — Service worker hors-ligne de MATHIC
 *
 * Stratégies :
 *  - App shell (HTML/JS/CSS/icônes) : cache au premier chargement.
 *  - Gros assets (modèle GGUF ~85 Mo, wasm) : mis en cache PROGRESSIVEMENT
 *    via un cache par plages (Range requests), car l'objet Response complet
 *    de 85 Mo dépasse les limites pratiques. Le modèle est téléchargé par
 *    wllama en morceaux → chaque morceau servi du cache après 1er passage.
 *  - Navigations et autres requêtes : réseau d'abord, cache en secours.
 */

const VERSION = 'mathic-v2';
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;

const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

/** Gros fichiers servis par plages après mise en cache progressif. */
const RANGE_ASSETS = [
  '/models/smollm-135m-math-v7-q2_k.gguf',
  '/wllama/wllama.wasm',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => !k.startsWith(VERSION))
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

/**
 * Répond à une requête Range depuis le cache d'assets.
 * Les morceaux sont stockés par clé `${url}::${start}-${end}`.
 */
async function serveRange(request, cache) {
  const url = new URL(request.url);
  const rangeHeader = request.headers.get('range') || '';
  const match = /bytes=(\d+)-(\d*)/.exec(rangeHeader);
  if (!match) return null;

  const start = Number(match[1]);
  const end = match[2] ? Number(match[2]) : start + 1024 * 512; // 512 Ko par défaut

  // Cherche un morceau englobant en cache.
  const keys = await cache.keys(`${url.pathname}::*`, { ignoreSearch: true });
  for (const req of keys) {
    const stored = /::(\d+)-(\d+)$/.exec(req.url);
    if (!stored) continue;
    const s = Number(stored[1]);
    const e = Number(stored[2]);
    if (start >= s && end <= e) {
      const full = await cache.match(req);
      const buf = await full.arrayBuffer();
      return new Response(buf.slice(start - s, end - s + 1), {
        status: 206,
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Range': `bytes ${start}-${end}/${e - s + 1}`,
        },
      });
    }
  }
  return null;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Gros assets binaires : cache par plages, réseau sinon.
  if (RANGE_ASSETS.includes(url.pathname)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(ASSET_CACHE);
        const fromCache = await serveRange(request, cache);
        if (fromCache) return fromCache;

        const network = await fetch(request);
        if (network.ok) {
          // Stocke le morceau reçu (m ax 2 Mo par entrée pour rester léger).
          const rangeHeader = request.headers.get('range') || '';
          const match = /bytes=(\d+)-(\d*)/.exec(rangeHeader);
          if (match) {
            const start = Number(match[1]);
            const end = match[2] ? Number(match[2]) : start + (await network.clone().arrayBuffer()).byteLength - 1;
            await cache.put(
              new Request(`${url.origin}${url.pathname}::${start}-${end}`),
              new Response(await network.clone().arrayBuffer())
            );
          }
        }
        return network;
      })()
    );
    return;
  }

  // App shell et autres assets : cache-first, réseau en secours.
  event.respondWith(
    (async () => {
      const cached = await caches.match(request, { ignoreSearch: true });
      if (cached) return cached;
      try {
        const network = await fetch(request);
        if (network.ok && url.pathname.startsWith('/assets/')) {
          const cache = await caches.open(SHELL_CACHE);
          cache.put(request, network.clone());
        }
        return network;
      } catch (err) {
        // Hors-ligne : renvoie l'app shell pour les navigations.
        if (request.mode === 'navigate') {
          const shell = await caches.match('/index.html');
          if (shell) return shell;
        }
        throw err;
      }
    })()
  );
});
