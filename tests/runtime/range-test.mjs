/**
 * tests/runtime/range-test.mjs
 *
 * Test HTTP Range sur le serveur origin ET via le Service Worker.
 *
 * LAYER A — Origin HTTP :
 *   Vérifie que le serveur retourne bien des réponses 206 Partial Content
 *   avec des Content-Range et Content-Length corrects.
 *
 * LAYER B — Service Worker :
 *   Vérifie que serveRange() du SW reconstruit correctement les chunks
 *   et que SHA256(chunk0 + chunk1 + ... + chunkN) === SHA256(model complet).
 *
 * Ce script tourne en Node.js (pas dans le navigateur).
 * Il cible le serveur HTTPS local lancé par scripts/https-server.mjs.
 *
 * Gate : G0.5.2 et G0.5.3
 *
 * Usage :
 *   node scripts/https-server.mjs &
 *   node tests/runtime/range-test.mjs [base-url]
 *
 * Arguments :
 *   base-url : URL de base (défaut : https://localhost:4443)
 */

import { createHash } from 'crypto';

// --- Configuration ----------------------------------------------------------

const BASE_URL = process.argv[2] ?? 'https://localhost:4443';
const MODEL_PATH = '/models/smollm-135m-math-v7-q2_k.gguf';
const MODEL_URL = `${BASE_URL}${MODEL_PATH}`;

/** Taille totale connue du GGUF (confirmée le 2026-09-22). */
const EXPECTED_TOTAL_SIZE = 88_201_568;

/** Taille d'un chunk wllama typique (512 Ko). */
const CHUNK_SIZE = 512 * 1024; // 524 288

let passed = 0;
let failed = 0;

// --- Helpers ----------------------------------------------------------------

function assert(condition, label, detail = '') {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.error(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`);
    failed++;
  }
}

async function fetchRange(start, end, { rejectUnauthorized = false } = {}) {
  // Node.js 18+ supporte fetch natif. Pour HTTPS auto-signé en local,
  // on passe un dispatcher sans vérification TLS.
  const { default: https } = await import('https');
  return new Promise((resolve, reject) => {
    const url = new URL(MODEL_URL);
    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname,
      method: 'GET',
      headers: { 'Range': `bytes=${start}-${end}` },
      rejectUnauthorized,
    };
    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.end();
  });
}

function parseContentRange(header) {
  if (!header) return null;
  const m = /bytes (\d+)-(\d+)\/(\d+|\*)/.exec(header);
  if (!m) return null;
  return { start: Number(m[1]), end: Number(m[2]), total: m[3] === '*' ? null : Number(m[3]) };
}

// --- LAYER A : Tests origin HTTP Range -------------------------------------

console.log('\n=== LAYER A — Origin HTTP Range ===\n');
console.log(`Cible : ${MODEL_URL}`);
console.log(`Taille attendue : ${EXPECTED_TOTAL_SIZE.toLocaleString('fr-FR')} bytes\n`);

// Test 1 : Premier chunk (bytes 0-524287)
{
  console.log('Plage 1 : bytes=0-524287 (premier chunk)');
  try {
    const r = await fetchRange(0, CHUNK_SIZE - 1);
    assert(r.status === 206, `HTTP 206 Partial Content`, `obtenu ${r.status}`);
    const cr = parseContentRange(r.headers['content-range']);
    assert(cr !== null, 'Content-Range présent et parseable', r.headers['content-range']);
    assert(cr?.start === 0, `Content-Range start = 0`, `obtenu ${cr?.start}`);
    assert(cr?.end === CHUNK_SIZE - 1, `Content-Range end = ${CHUNK_SIZE - 1}`, `obtenu ${cr?.end}`);
    assert(cr?.total === EXPECTED_TOTAL_SIZE, `Total = ${EXPECTED_TOTAL_SIZE}`, `obtenu ${cr?.total}`);
    assert(
      Number(r.headers['content-length']) === CHUNK_SIZE,
      `Content-Length = ${CHUNK_SIZE}`,
      `obtenu ${r.headers['content-length']}`
    );
  } catch (err) {
    console.error(`  ❌ Erreur réseau : ${err.message}`);
    console.error('     → Le serveur HTTPS local est-il démarré ? (npm run serve:https)');
    failed += 5;
  }
  console.log();
}

// Test 2 : Deuxième chunk (bytes 524288-1048575)
{
  console.log('Plage 2 : bytes=524288-1048575 (deuxième chunk)');
  try {
    const r = await fetchRange(CHUNK_SIZE, CHUNK_SIZE * 2 - 1);
    assert(r.status === 206, `HTTP 206`);
    const cr = parseContentRange(r.headers['content-range']);
    assert(cr?.start === CHUNK_SIZE, `Content-Range start = ${CHUNK_SIZE}`);
    assert(cr?.total === EXPECTED_TOTAL_SIZE, `Total correct`);
  } catch (err) {
    console.error(`  ❌ ${err.message}`);
    failed += 3;
  }
  console.log();
}

// Test 3 : Dernier chunk partiel
{
  const lastStart = EXPECTED_TOTAL_SIZE - CHUNK_SIZE;
  const lastEnd = EXPECTED_TOTAL_SIZE - 1;
  console.log(`Plage 3 : bytes=${lastStart}-${lastEnd} (dernier chunk)`);
  try {
    const r = await fetchRange(lastStart, lastEnd);
    assert(r.status === 206, `HTTP 206`);
    const cr = parseContentRange(r.headers['content-range']);
    assert(cr?.end === lastEnd, `Content-Range end = ${lastEnd}`);
    assert(cr?.total === EXPECTED_TOTAL_SIZE, `Total correct`);
    assert(r.body.byteLength === CHUNK_SIZE, `Body length = ${CHUNK_SIZE} bytes`);
  } catch (err) {
    console.error(`  ❌ ${err.message}`);
    failed += 4;
  }
  console.log();
}

// Test 4 : Plage invalide (start > total)
{
  console.log('Plage 4 : bytes=999999999-999999999 (hors-limites)');
  try {
    const r = await fetchRange(999_999_999, 999_999_999);
    // RFC 7233 : doit retourner 416 Range Not Satisfiable
    assert(r.status === 416, `HTTP 416 Range Not Satisfiable`, `obtenu ${r.status}`);
  } catch (err) {
    console.error(`  ❌ ${err.message}`);
    failed++;
  }
  console.log();
}

// --- LAYER B : Vérification intégrité SW (à compléter en browser) ----------

console.log('=== LAYER B — Service Worker Range Integrity ===\n');
console.log('NOTE : Ce test requiert un environnement browser (Playwright).');
console.log('       Voir tests/runtime/offline.spec.mjs pour l\'automatisation.');
console.log();
console.log('Vérification manuelle attendue :');
console.log('  1. Ouvrir DevTools → Application → Service Workers');
console.log('  2. Vérifier que le SW est actif et que son scope est correct');
console.log('  3. Vérifier dans Application → Cache Storage :');
console.log('     - mathic-v4-*-shell contient index.html, manifest.json...');
console.log('     - mathic-v4-*-assets contient les bundles JS/CSS hashés');
console.log('  4. Effectuer une requête Range via DevTools Network (offline mode)');
console.log('  5. Vérifier Content-Range dans la réponse SW');
console.log('  6. SHA256(tous les chunks) === SHA256(modèle complet)');
console.log();

// --- Bilan ------------------------------------------------------------------

console.log('=== BILAN LAYER A ===\n');
console.log(`  ✅ Passés : ${passed}`);
console.log(`  ❌ Échoués : ${failed}`);
console.log();

if (failed > 0) {
  console.log('⚠️  Certains tests ont échoué.');
  console.log('   Si le serveur HTTPS local n\'est pas démarré, lancez :');
  console.log('   npm run serve:https');
  console.log();
  console.log('Gate G0.5.2 : NOT PASS');
  process.exit(1);
} else {
  console.log('Gate G0.5.2 : PASS (Layer A — origin HTTP)');
  console.log('Gate G0.5.3 : MANUAL — voir ci-dessus pour la vérification SW');
}
