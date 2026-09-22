/**
 * Serveur HTTPS statique pour MATHIC — permet l'installation PWA sur
 * Android via Chrome (« Ajouter à l'écran d'accueil » exige HTTPS hors localhost).
 *
 * Caractéristiques :
 *  - Certificat auto-signé via openssl (SAN localhost/127.0.0.1 — Chrome
 *    accepte silencieusement ces SAN pour localhost). Repli HTTP explicite
 *    si openssl est absent.
 *  - COOP/COEP pour activer SharedArrayBuffer (recommandé par wllama)
 *  - Support des requêtes Range (requis par wllama pour le GGUF 85 Mo)
 *  - Sert dist/ par défaut, racine du projet sinon (dev manuel)
 *
 * Usage :
 *   npm run serve:https            → sert dist/   (production)
 *   npm run serve:https:dev        → sert ./      (dev, modules non bundlés)
 */

import { createServer } from 'node:https';
import { createServer as createHttp } from 'node:http';
import { readFileSync, existsSync, statSync, mkdirSync, createReadStream } from 'node:fs';
import { join, extname, normalize, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const CERT_DIR = join(ROOT, 'certs');
const CERT_FILE = join(CERT_DIR, 'mathic-cert.pem');
const KEY_FILE = join(CERT_DIR, 'mathic-key.pem');

// `npm run serve:https:dev` → sert la racine, sinon dist/ (production)
const SERVE_ROOT =
  process.env.SERVE_ROOT === 'dev' || process.argv.includes('--dev')
    ? ROOT
    : existsSync(join(ROOT, 'dist'))
      ? join(ROOT, 'dist')
      : ROOT;
const PORT = Number(process.env.PORT || 8443);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.gguf': 'application/octet-stream',
};

/* ------------------------------------------------------------------ *
 * Certificat auto-signé (openssl, avec SAN)
 * ------------------------------------------------------------------ */
function ensureCertificate() {
  if (existsSync(CERT_FILE) && existsSync(KEY_FILE)) return true;

  mkdirSync(CERT_DIR, { recursive: true });
  console.log('🔐 Génération du certificat (openssl, SAN localhost)…');

  try {
    execFileSync(
      'openssl',
      [
        'req',
        '-x509',
        '-newkey', 'rsa:2048',
        '-keyout', KEY_FILE,
        '-out', CERT_FILE,
        '-days', '365',
        '-nodes',
        '-subj', '/CN=MATHIC Local',
        '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1,IP:::1',
      ],
      { stdio: 'pipe' },
    );
    console.log(`   → ${CERT_FILE.replace(ROOT + '/', '')}`);
  } catch {
    console.error(
      '⚠️  openssl indisponible — repli HTTP.\n' +
        '   Installe openssl (apt install openssl) pour activer le HTTPS,\n' +
        '   ou sers dist/ via n\'importe quel hébergeur HTTPS (Netlify, Vercel…).',
    );
    return false;
  }
  return true;
}

/* ------------------------------------------------------------------ *
 * HTTP : statique + Range + COOP/COEP
 * ------------------------------------------------------------------ */
function handleRequest(req, res) {
  const url = new URL(req.url, `https://${req.headers.host || 'localhost'}`);
  let pathname = decodeURIComponent(url.pathname);

  // COOP/COEP : SharedArrayBuffer pour wllama ; CORP : les assets restent
  // chargeables sous le COEP du même origin.
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');

  if (pathname === '/') pathname = '/index.html';

  const filePath = resolve(SERVE_ROOT, `.${normalize(pathname)}`);
  if (!filePath.startsWith(resolve(SERVE_ROOT))) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('Not found');
  }

  const stat = statSync(filePath);
  const type = MIME[extname(filePath).toLowerCase()] || 'application/octet-stream';
  const range = req.headers.range;

  // Range : wllama stream le GGUF par plages (85 Mo, pas de téléchargement
  // complet en RAM avant le load).
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    if (m) {
      const start = m[1] === '' ? 0 : parseInt(m[1], 10);
      const end = m[2] === '' ? stat.size - 1 : Math.min(parseInt(m[2], 10), stat.size - 1);
      if (start <= end && start < stat.size) {
        res.writeHead(206, {
          'Content-Type': type,
          'Content-Range': `bytes ${start}-${end}/${stat.size}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': end - start + 1,
        });
        return createReadStream(filePath, { start, end }).pipe(res);
      }
    }
    res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` });
    return res.end();
  }

  res.writeHead(200, {
    'Content-Type': type,
    'Content-Length': stat.size,
    'Accept-Ranges': 'bytes',
  });
  createReadStream(filePath).pipe(res);
}

/* ------------------------------------------------------------------ *
 * Démarrage
 * ------------------------------------------------------------------ */
const hasCert = ensureCertificate();

if (hasCert) {
  try {
    createServer({ key: readFileSync(KEY_FILE), cert: readFileSync(CERT_FILE) }, handleRequest).listen(
      PORT,
      () => {
        console.log(`\n🚀 MATHIC en HTTPS : https://localhost:${PORT}`);
        console.log('   📱 Android Chrome : ⋮ → « Ajouter à l’écran d’accueil »');
        console.log('   ⚠️  Auto-signé : accepte l’avertissement une fois (desktop).\n');
      },
    );
  } catch (err) {
    console.error('❌ HTTPS impossible :', err.message);
    process.exit(1);
  }
} else {
  createHttp(handleRequest).listen(PORT, () => {
    console.log(`\n📶 MATHIC en HTTP : http://localhost:${PORT} (PWA : HTTPS requis hors localhost)\n`);
  });
}
