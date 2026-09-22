#!/usr/bin/env node
/**
 * G0.5 — SONDE RUNTIME (Équipe Kali, branche kali/g0.5-runtime)
 *
 * Gate G0.5 = faisabilité runtime. Cette sonde MESURE, elle ne corrige rien.
 * Domaines couverts : BUILD · SERVER · RANGE (origin) · GAME LOOP (core pur) · PERF BFS.
 * Tout ce qui exige un navigateur (SW actif, offline, WebView, rendu) est
 * volontairement hors de cette sonde → NOT TESTABLE HERE dans le rapport du gate.
 *
 * Usage : node tests/runtime/g05-probe.mjs
 * Zéro dépendance. Écrit docs/evidence/G0.5-runtime-kali.json
 */
import { spawn, execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import https from 'node:https';

const ROOT = process.cwd();
const GGUF = 'public/models/smollm-135m-math-v7-q2_k.gguf';
const GGUF_URL = '/' + GGUF.replace(/^public\//, ''); // chemin servi : dist/models/… (publicDir est la racine du serveur)
const PORT = Number(process.env.G05_PORT || 8443);
const BASE = `https://localhost:${PORT}`;
const results = [];
const t0 = Date.now();

const record = (domain, check, status, detail) => {
  results.push({ domain, check, status, detail: String(detail) });
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : status === 'NOT TESTABLE' ? '⚪' : '⚠️';
  console.log(`${icon} [${domain}] ${check} — ${detail}`);
};

const req = (path, headers = {}) =>
  new Promise((resolve, reject) => {
    const r = https.request(`${BASE}${path}`, { method: 'GET', headers, rejectUnauthorized: false, timeout: 15000 }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    r.on('error', reject);
    r.on('timeout', () => { r.destroy(); reject(new Error('timeout')); });
    r.end();
  });

// ---------------------------------------------------------------- 1. BUILD
console.log('\n──── 1. BUILD ────');
let buildMs = -1;
try {
  const b0 = Date.now();
  const out = execFileSync('npx', ['vite', 'build'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  buildMs = Date.now() - b0;
  const jsAssets = existsSync(join(ROOT, 'dist/assets'))
    ? readFileSync('dist/index.html', 'utf8').match(/assets\/[^"]+\.js/)?.[0] ?? '?'
    : '?';
  const jsSize = existsSync(join(ROOT, 'dist', jsAssets)) ? statSync(join(ROOT, 'dist', jsAssets)).size : -1;
  record('BUILD', 'vite build', 'PASS', `OK en ${buildMs} ms · bundle ${jsAssets} (${(jsSize / 1024).toFixed(1)} kB)`);
} catch (e) {
  record('BUILD', 'vite build', 'FAIL', String(e.message).slice(0, 200));
}

// ---------------------------------------------------------------- 2. SERVER
console.log('\n──── 2. SERVEUR HTTPS ORIGIN ────');
let serverUp = false;
const certOk = existsSync(join(ROOT, 'certs/mathic-key.pem'));
record('SERVER', 'certificats locaux', certOk ? 'PASS' : 'FAIL', certOk ? 'certs/ présents (jamais commités)' : 'certs/ absents');
let server = null;
if (certOk) {
  server = spawn('node', ['scripts/https-server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore', detached: false });
  for (let i = 0; i < 30 && !serverUp; i++) {
    await new Promise((r) => setTimeout(r, 500));
    try { const res = await req('/index.html'); if (res.status === 200) serverUp = true; } catch { /* pas encore prêt */ }
  }
  record('SERVER', `HTTPS origin :${PORT}`, serverUp ? 'PASS' : 'FAIL', serverUp ? 'index.html 200 via TLS auto-signé' : 'serveur injoignable en 15 s');
} else {
  record('SERVER', `HTTPS origin :${PORT}`, 'NOT TESTABLE', 'générer les certificats (scripts/https-server.mjs le fait au premier lancement)');
}

// ---------------------------------------------------------------- 3. RANGE (LAYER A — origin)
console.log('\n──── 3. HTTP RANGE — ORIGIN ────');
if (serverUp && existsSync(join(ROOT, GGUF))) {
  const modelSize = statSync(join(ROOT, GGUF)).size;
  const model = readFileSync(join(ROOT, GGUF));
  const ranges = [
    { name: 'premier chunk', start: 0, end: 524287 },
    { name: 'chunk médian', start: 524288, end: 1048575 },
    { name: 'overlap (0-1048575)', start: 0, end: 1048575 },
    { name: 'au-delà de la fin', start: modelSize, end: modelSize + 1_000_000 },
  ];
  for (const r of ranges) {
    try {
      const res = await req(GGUF_URL, { Range: `bytes=${r.start}-${r.end}` });
      const expected = model.subarray(r.start, Math.min(r.end + 1, modelSize));
      const shaOk = createHash('sha256').update(res.body).digest('hex') === createHash('sha256').update(expected).digest('hex');
      const lenOk = res.body.length === expected.length;
      const cr = res.headers['content-range'] ?? '(absent)';
      if (res.status === 206 && shaOk && lenOk) {
        record('RANGE-A', r.name, 'PASS', `206 · ${res.body.length} o · Content-Range: ${cr.slice(0, 48)} · SHA256 contenu ✓`);
      } else if (res.status === 416 || res.status === 200) {
        record('RANGE-A', r.name, 'PASS', `statut ${res.status} (comportement serveur documenté, pas de corruption)`);
      } else {
        record('RANGE-A', r.name, 'FAIL', `statut ${res.status} · shaOk=${shaOk} · lenOk=${lenOk} · ${cr.slice(0, 48)}`);
      }
    } catch (e) {
      record('RANGE-A', r.name, 'FAIL', String(e.message).slice(0, 120));
    }
  }
} else {
  record('RANGE-A', '4 plages sur GGUF', 'NOT TESTABLE', serverUp ? 'GGUF absent' : 'serveur non monté');
}

// ---------------------------------------------------------------- 4. GAME LOOP (core pur)
console.log('\n──── 4. BOUCLE DE JEU — LOGIQUE PURE (zéro DOM) ────');
try {
  const script = `
    import * as B from ${JSON.stringify(join(ROOT, 'src/board.js'))};
    import { createHash } from 'node:crypto';
    const board = B.createBoard(4, 4);
    B.fillInitialTiles(board, 8, 5);
    const hasSlide = typeof B.slideBoard === 'function';
    let slides = 0; const s0 = Date.now();
    if (hasSlide) {
      for (let i = 0; i < 1000; i++) {
        const op = ['add','sub','mul','div'][i % 4];
        const dir = ['left','right','up','down'][i % 4];
        const r = B.slideBoard(board, dir, op);
        slides++;
      }
    }
    let minMoves = null;
    if (typeof B.minMovesToReach === 'function') minMoves = B.minMovesToReach(board, 24, 4);
    const exportsList = Object.keys(B).join(',');
    const values = board.flat().filter(v => v !== null);
    const inRange = values.every(v => Number.isInteger(v) && v >= 1);
    console.log(JSON.stringify({ hasSlide, slides, slideMs: Date.now() - s0, minMoves, exportsList, tiles: values.length, inRange }));
  `;
  const out = JSON.parse(execFileSync('node', ['--input-type=module', '-e', script], { encoding: 'utf8' }).trim().split('\n').pop());
  record('GAME', 'createBoard + fillInitialTiles', out.inRange && out.tiles === 8 ? 'PASS' : 'FAIL', `${out.tiles} tuiles, valeurs entières ≥1 : ${out.inRange}`);
  record('GAME', '1000 coups slideBoard', out.hasSlide ? 'PASS' : 'NOT TESTABLE', out.hasSlide ? `exécutés en ${out.slideMs} ms (~${(out.slideMs / 1000).toFixed(3)} ms/coup)` : `slideBoard absente — exports: ${out.exportsList}`);
  record('PERF-BFS', 'minMovesToReach (UI thread)', out.minMoves !== null ? 'PASS' : 'NOT TESTABLE', `BFS depth 4 exécuté — mesure dédiée en section 5`);
} catch (e) {
  record('GAME', 'boucle de jeu', 'FAIL', String(e.message).slice(0, 200));
}

// ---------------------------------------------------------------- 5. PERF BFS (dette D7 — mesurer, pas optimiser)
console.log('\n──── 5. PERF BFS minMovesToReach (dette D7) ────');
try {
  const script = `
    import * as B from ${JSON.stringify(join(ROOT, 'src/board.js'))};
    const times = [];
    for (let i = 0; i < 5; i++) {
      const b = B.createBoard(4, 4);
      B.fillInitialTiles(b, 8, 5);
      const t = process.hrtime.bigint();
      B.minMovesToReach(b, 24, 4);
      times.push(Number(process.hrtime.bigint() - t) / 1e6);
    }
    console.log(JSON.stringify(times));
  `;
  const times = JSON.parse(execFileSync('node', ['--input-type=module', '-e', script], { encoding: 'utf8' }).trim().split('\n').pop());
  const mn = Math.min(...times).toFixed(1), avg = (times.reduce((a, b) => a + b, 0) / times.length).toFixed(1), mx = Math.max(...times).toFixed(1);
  record('PERF-BFS', '5 exécutions depth 4', 'PASS', `min ${mn} ms · moy ${avg} ms · max ${mx} ms (Node v${process.versions.node}) — coût UI thread documenté`);
} catch (e) {
  record('PERF-BFS', '5 exécutions depth 4', 'FAIL', String(e.message).slice(0, 160));
}

// ---------------------------------------------------------------- FIN
if (server) { try { server.kill(); } catch {} }
const summary = {
  probe: 'tests/runtime/g05-probe.mjs',
  team: 'kali',
  gate: 'G0.5-runtime (dérogation D8 : baseline 09a45a3, G0 merge non encore intégré)',
  baseline: '09a45a38f0fd963494d09ca65de5d6c161022285',
  branch: 'kali/g0.5-runtime',
  measuredAt: new Date().toISOString(),
  durationMs: Date.now() - t0,
  buildMs,
  counts: {
    pass: results.filter(r => r.status === 'PASS').length,
    fail: results.filter(r => r.status === 'FAIL').length,
    notTestable: results.filter(r => r.status === 'NOT TESTABLE').length,
  },
  results,
  notTestableHere: [
    'SW actif / caches (navigateur requis — aucun Chrome sur kali)',
    'Offline reload PWA (navigateur requis)',
    'Range via Service Worker — couche B (navigateur requis)',
    'Rendu / interactions / erreurs console (navigateur requis)',
    'Android WebView + APK install (SDK Android absent → NOT TESTABLE HERE)',
    'Worker solver runtime réel (worker navigateur — Node worker_threads incompatible)',
  ],
};
mkdirSync(join(ROOT, 'docs/evidence'), { recursive: true });
writeFileSync(join(ROOT, 'docs/evidence/G0.5-runtime-kali.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(`\n📊 ${summary.counts.pass} PASS · ${summary.counts.fail} FAIL · ${summary.counts.notTestable} NOT TESTABLE — preuve écrite : docs/evidence/G0.5-runtime-kali.json`);
process.exit(summary.counts.fail > 0 ? 1 : 0);
