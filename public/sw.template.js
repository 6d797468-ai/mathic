/**
 * sw.template.js — Template du Service Worker hors-ligne de MATHIC
 *
 * CE FICHIER EST UN TEMPLATE. Il ne doit PAS être servi directement.
 *
 * Le fichier dist/sw.js final est généré par scripts/build-sw.mjs :
 *   __SW_VERSION__ → remplacé par 'mathic-v4-<commit>-<buildHash>'
 *
 * Vérification post-build obligatoire :
 *   grep "const VERSION" dist/sw.js
 *   # Ne doit JAMAIS retourner '__SW_VERSION__'
 *
 * Stratégies de cache :
 *  - App shell (HTML/JS/CSS/icônes) : cache au premier chargement.
 *  - Gros assets (modèle GGUF, wasm) : cache progressif par plages
 *    (Range requests). Le modèle est téléchargé par wllama en morceaux →
 *    chaque morceau est servi depuis le cache après le 1er passage.
 *  - Navigations et autres requêtes : réseau d'abord, cache en secours.
 *
 * Gate : G0.5.1
 */

const VERSION = '__SW_VERSION__';
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;

/**
 * Le site vit en sous-chemin (GitHub Pages → /mathic/) OU à la racine
 * (Netlify/Vercel). Tout est donc résolu RELATIVEMENT au scope du worker :
 * caches.match / addAll / keys fonctionnent dans les deux cas, sans rien
 * câbler en dur.
 */
const base = self.registration.scope;
const res = (path) => new URL(path, base).toString();

const SHELL_ASSETS = [
  res(''),
  res('index.html'),
  res('manifest.json'),
  res('favicon.svg'),
  res('icons/icon-192.png'),
  res('icons/icon-512.png'),
];

/** Gros fichiers servis par plages après mise en cache progressif
 *  (chemin complet dans le scope, pour comparaison directe avec request). */
const RANGE_ASSETS = [
  new URL('models/smollm-135m-math-v7-q2_k.gguf', base).pathname,
  new URL('wllama/wllama.wasm', base).pathname,
];

/** Préfixe des bundles hashed générés par Vite (relatif au scope). */
const ASSETS_PREFIX = new URL('assets/', base).pathname;

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
 * Les morceaux sont stockés par clé `${origin}${pathname}::${start}-${end}`,
 * avec un header Content-Range persistent pour pouvoir reconstruire le
 * totalSize lors d'une lecture ultérieure.
 *
 * Bug P0 G0.5.3 corrigé : l'ancienne version retournait totalSize='*'
 * quand Content-Range était absent du cache (il n'était jamais stocké).
 */
async function serveRange(request, cache) {
  const url = new URL(request.url);
  const rangeHeader = request.headers.get('range') || '';
  const match = /bytes=(\d+)-(\d*)/.exec(rangeHeader);
  if (!match) return null;

  const start = Number(match[1]);
  const end = match[2] ? Number(match[2]) : start + 1024 * 512; // 512 Ko par défaut

  // Cherche un morceau englobant en cache.
  // cache.keys() avec un pattern de préfixe n'est pas supporté nativement ;
  // on itère sur toutes les entrées du cache et on filtre manuellement.
  const allKeys = await cache.keys();
  const assetKeys = allKeys.filter((req) => req.url.includes(`${url.pathname}::`) );

  for (const req of assetKeys) {
    const stored = /::(\d+)-(\d+)$/.exec(req.url);
    if (!stored) continue;
    const s = Number(stored[1]);
    const e = Number(stored[2]);
    if (start >= s && end <= e) {
      const full = await cache.match(req);
      if (!full) continue;

      // Le Content-Range est toujours stocké avec l'entrée (voir fetch handler).
      // Si absent (entrée ancienne), on ne peut pas reconstruire totalSize de
      // façon fiable — on retourne null pour forcer un rechargement réseau.
      const cachedRange = full.headers.get('Content-Range');
      if (!cachedRange) return null; // P0 fix : jamais de totalSize='*'

      const totalSize = cachedRange.split('/')[1];
      if (!totalSize || totalSize === '*') return null; // défense en profondeur

      const buf = await full.arrayBuffer();
      const sliced = buf.slice(start - s, end - s + 1);
      return new Response(sliced, {
        status: 206,
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Range': `bytes ${start}-${end}/${totalSize}`,
          'Content-Length': String(sliced.byteLength),
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
        if (network.ok || network.status === 206) {
          // Stocke le morceau reçu avec son Content-Range pour que serveRange
          // puisse reconstruire totalSize lors d'une lecture ultérieure.
          // P0 fix : Content-Range doit être persisté avec la réponse cachée.
          const rangeHeader = request.headers.get('range') || '';
          const match = /bytes=(\d+)-(\d*)/.exec(rangeHeader);
          if (match) {
            const networkBuf = await network.clone().arrayBuffer();
            const start = Number(match[1]);
            const end = match[2] ? Number(match[2]) : start + networkBuf.byteLength - 1;
            const contentRange = network.headers.get('Content-Range')
              ?? `bytes ${start}-${end}/*`;
            await cache.put(
              new Request(`${url.origin}${url.pathname}::${start}-${end}`),
              new Response(networkBuf, {
                headers: {
                  'Content-Type': 'application/octet-stream',
                  // Toujours stocker Content-Range pour que serveRange fonctionne.
                  'Content-Range': contentRange,
                },
              })
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
        if (network.ok && url.pathname.startsWith(ASSETS_PREFIX)) {
          const cache = await caches.open(SHELL_CACHE);
          cache.put(request, network.clone());
        }
        return network;
      } catch (err) {
        // Hors-ligne : renvoie l'app shell pour les navigations.
        if (request.mode === 'navigate') {
          const shell = await caches.match(res('index.html'));
          if (shell) return shell;
        }
        throw err;
      }
    })()
  );
});
