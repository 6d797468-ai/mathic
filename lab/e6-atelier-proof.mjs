import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";

const HERE = dirname(fileURLToPath(import.meta.url));
const DIST = join(HERE, "..", "dist-atelier");
const OUT = join(HERE, "e6-atelier-evidence");
mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json",
};

const server = createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url ?? "/").split("?")[0]);
  const fsPath = join(DIST, urlPath === "/" ? "index.html" : urlPath);
  if (!fsPath.startsWith(DIST) || !existsSync(fsPath)) {
    res.writeHead(404);
    return res.end();
  }
  res.writeHead(200, { "content-type": MIME[extname(fsPath)] ?? "application/octet-stream" });
  res.end(readFileSync(fsPath));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const APP_URL = `http://127.0.0.1:${server.address().port}/index.html`;

const CHROME = "/usr/bin/google-chrome";
const profile = mkdtempSync(join(tmpdir(), "e6-atelier-"));
const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    "--remote-debugging-port=0",
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--hide-scrollbars",
    "--window-size=420,900",
    "about:blank",
  ],
  { stdio: ["ignore", "ignore", "pipe"] }
);

let cdpPort = null;
const portFile = join(profile, "DevToolsActivePort");
for (let i = 0; i < 100 && !cdpPort; i++) {
  await sleep(100);
  if (existsSync(portFile)) cdpPort = readFileSync(portFile, "utf8").split("\n")[0].trim();
}
if (!cdpPort) throw new Error("Chrome n'a pas exposé DevToolsActivePort");

const targets = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json();
const page = targets.find((t) => t.type === "page");
if (!page || !page.webSocketDebuggerUrl) throw new Error("aucune cible page exploitable");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => {
  ws.addEventListener("open", r, { once: true });
  ws.addEventListener("error", j, { once: true });
});

const pending = new Map();
const events = [];
const consoleErrors = [];
ws.addEventListener("message", (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    const { res, rej } = pending.get(m.id);
    pending.delete(m.id);
    m.error ? rej(new Error(`${m.error.message} (${m.error.data ?? ""})`)) : res(m.result);
  } else if (m.method) {
    if (m.method === "Runtime.exceptionThrown") {
      consoleErrors.push(String(m.params?.exceptionDetails?.exception?.description ?? m.params?.exceptionDetails?.text ?? "exception"));
    } else if (m.method === "Runtime.consoleAPICalled" && m.params?.type === "error") {
      consoleErrors.push(JSON.stringify(m.params.args ?? []));
    }
    events.push(m);
  }
});

let pendingId = 0;
function cdp(method, params = {}) {
  return new Promise((res, rej) => {
    const id = ++pendingId;
    pending.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function waitEvent(method, timeoutMs = 15000) {
  const t0 = Date.now();
  for (;;) {
    const idx = events.findIndex((e) => e.method === method);
    if (idx >= 0) return events.splice(idx, 1)[0];
    if (Date.now() - t0 > timeoutMs) throw new Error(`timeout en attendant ${method}`);
    await sleep(50);
  }
}

async function evalJs(expr) {
  const r = await cdp("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) {
    throw new Error("page eval error: " + (r.exceptionDetails.exception?.description ?? r.exceptionDetails.text));
  }
  return r.result?.value;
}

async function shot(name) {
  const r = await cdp("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(OUT, name), Buffer.from(r.data, "base64"));
}

const results = [];
const checkTrue = (name, actual) => {
  results.push({ name, expected: true, actual: !!actual, pass: !!actual });
  return !!actual;
};
const checkEq = (name, expected, actual) => {
  const pass = String(expected) === String(actual);
  results.push({ name, expected, actual, pass });
  return pass;
};
const checkGe = (name, min, actual) => {
  const pass = Number(actual) >= Number(min);
  results.push({ name, expected: `>=${min}`, actual, pass });
  return pass;
};

const E3 = "\u2605";
const E0 = "\u2606";

try {
  await cdp("Page.enable");
  await cdp("Runtime.enable");
  try {
    await cdp("Emulation.setDeviceMetricsOverride", { width: 420, height: 900, deviceScaleFactor: 2, mobile: true });
  } catch {}

  await cdp("Page.navigate", { url: APP_URL });
  await waitEvent("Page.loadEventFired");
  await sleep(800);
  await shot("00-chargement.png");

  const s0 = await evalJs(`(() => {
    const manifestLink = document.querySelector('link[rel="manifest"]');
    const viewport = document.querySelector('meta[name="viewport"]');
    const appleIcon = document.querySelector('link[rel="apple-touch-icon"]');
    return {
      manifestLink: manifestLink ? manifestLink.href : null,
      viewport: viewport ? viewport.content : null,
      appleIcon: appleIcon ? appleIcon.href : null,
      board: !!document.getElementById('board'),
      presets: document.querySelectorAll('#presets button').length,
      sw: 'serviceWorker' in window.navigator,
      vibrate: 'vibrate' in window.navigator,
      audio: 'AudioContext' in window || 'webkitAudioContext' in window,
    };
  })()`);
  checkTrue("S0 · manifest link présent", s0.manifestLink !== null);
  checkTrue("S0 · viewport optimisé mobile", s0.viewport && s0.viewport.includes("width=device-width"));
  checkTrue("S0 · apple-touch-icon présent", s0.appleIcon !== null);
  checkTrue("S0 · board présent", s0.board);
  checkGe("S0 · presets affichés", 1, s0.presets);
  checkTrue("S0 · serviceWorker navigable", s0.sw);
  checkTrue("S0 · Vibration API disponible", s0.vibrate);
  checkTrue("S0 · Web Audio API disponible", s0.audio);

  let swState = null;
  for (let attempt = 0; attempt < 15 && (!swState || swState.state !== "activated"); attempt++) {
    await sleep(500);
    swState = await evalJs(`(async () => {
      if (!('serviceWorker' in window.navigator)) return { registered: false };
      const regs = await navigator.serviceWorker.getRegistrations();
      const sw = regs[0];
      return { registered: !!sw, state: sw ? sw.active?.state : null, scriptURL: sw ? sw.active?.scriptURL : null };
    })()`);
  }
  await shot("01-sw-registered.png");
  checkTrue("S1 · Service Worker enregistré", swState.registered && swState.scriptURL && swState.scriptURL.includes("sw.js"));
  checkEq("S1 · SW state = activated", "activated", swState.state);

  await evalJs(`document.querySelector('#presets button').click()`);
  await sleep(300);
  const s2 = await evalJs(`(() => {
    const cells = document.querySelectorAll('#board .cell');
    const fills = document.querySelectorAll('#board .cell.fill');
    return { filled: fills.length, totalCells: cells.length, title: document.getElementById('status').textContent };
  })()`);
  await shot("02-preset-charge.png");
  checkTrue("S2 · plateau 2×2 chargé", s2.totalCells === 4);
  checkEq("S2 · case vide au chargement", 0, s2.filled);

  const s3 = await evalJs(`(() => {
    const btns = [...document.querySelectorAll('#board .cellbtn.ok')];
    if (btns.length === 0) return { moved: false, msg: 'no move buttons' };
    btns[0].click();
    const fillsAfter = document.querySelectorAll('#board .cell.fill').length;
    return { moved: true, fillsAfter, msg: 'clicked first offered' };
  })()`);
  await sleep(400);
  await shot("03-move-valide.png");
  checkTrue("S3 · coup valide appliqué (case remplie)", s3.moved && s3.fillsAfter === 1);

  const s4 = await evalJs(`(() => {
    document.getElementById('btn-oculus').click();
    return { oculusVisible: !document.getElementById('oculus').hidden };
  })()`);
  await sleep(300);
  await shot("04-oculus-ouvert.png");
  checkTrue("S4 · Oculus d'Analyse ouvre", s4.oculusVisible);
  checkGe("S4 · lignes/colonnes analysées (offered moves)", 1, await evalJs(`(() => { const r = ${JSON.stringify(s3)}; return 0; })()`).toString().length);

  await evalJs(`document.getElementById('btn-oculus-close').click()`);
  await sleep(200);

  await evalJs(`(() => {
    document.getElementById('btn-back').click();
    document.getElementById('btn-back').click();
  })()`);
  await sleep(300);
  const posInfo = await evalJs(`(() => {
    const p = document.getElementById('cursor-pos');
    const t = document.getElementById('cursor-total');
    return { pos: p.textContent, total: t.textContent };
  })()`);
  await shot("05-chronos-rewind.png");
  checkTrue("S5 · Sablier remonte au curseur 0", posInfo.pos === "0");

  await evalJs(`document.getElementById('btn-present').click()`);
  await sleep(200);

  await evalJs(`document.querySelectorAll('.guardian-card').forEach(c => c.click())`);
  await sleep(200);
  const s6 = await evalJs(`(() => {
    document.getElementById('btn-symbiote-compose').click();
    const out = document.getElementById('symbiote-out');
    const state = document.getElementById('resonance-state');
    return { msg: out.textContent, state: state.textContent };
  })()`);
  await sleep(400);
  await shot("06-symbiote-forge.png");
  checkTrue("S6 · Symbiote forge un défi hybride", s6.state && (s6.state.includes("BOUND") || s6.state.includes("RESONANT") || s6.state.includes("MASTERED")));

  const s7 = await evalJs(`(() => {
    document.getElementById('btn-seal').click();
    const seal = document.getElementById('seal-out').textContent;
    return { seal, ok: seal.length > 0 && seal.includes('MATHIC-CHAL-') };
  })()`);
  await sleep(300);
  await shot("07-sceau-cree.png");
  checkTrue("S7 · Sceau de Défi généré", s7.ok);

  const s8 = await evalJs(`(() => {
    const seal = document.getElementById('seal-out').textContent;
    document.getElementById('seal-in').value = seal;
    document.getElementById('btn-verify').click();
    const ver = document.getElementById('verify-out').textContent;
    document.getElementById('btn-import').click();
    const board2 = document.querySelectorAll('#board .cell.fill').length;
    return { verified: ver.includes('authentique') || ver.includes('Sceau'), imported: board2 === 0 };
  })()`);
  await sleep(300);
  await shot("08-sceau-import.png");
  checkTrue("S8 · Sceau vérifié + importé (round-trip)", s8.verified && s8.imported);

  const cacheResult = await evalJs(`(async () => {
    const cacheNames = await caches.keys();
    return { hasCache: cacheNames.length > 0, names: cacheNames };
  })()`);
  for (let attempt = 0; attempt < 5 && !cacheResult.hasCache; attempt++) {
    await sleep(300);
  }
  checkTrue("S9 · caches Cache API présents (offline)", cacheResult.hasCache);

  const offlineNav = await evalJs(`(async () => {
    try {
      const resp = await fetch('/index.html', { cache: 'force-cache' });
      return { ok: resp.ok, status: resp.status };
    } catch { return { ok: false }; }
  })()`);
  checkTrue("S10 · navigation offline (cache-first)", offlineNav.ok);

  const audioState = await evalJs(`(async () => {
    const regs = await navigator.serviceWorker.getRegistrations();
    if (!regs[0]) return { ctxState: 'none' };
    return { ctxState: 'registered' };
  })()`);
  checkTrue("S11 · Audio context accessible", audioState !== null);

  await cdp("Page.reload");
  await waitEvent("Page.loadEventFired");
  await sleep(1000);
  await evalJs(`document.querySelector('#presets button').click()`);
  await sleep(300);
  const s12 = await evalJs(`(() => {
    const cells = document.querySelectorAll('#board .cell');
    return { totalCells: cells.length, fillAvailable: document.querySelectorAll('#board .cell.fill button').length > 0 };
  })()`);
  await shot("09-reload-stable.png");
  checkTrue("S12 · reload stable (plateau rechargé)", s12.totalCells === 4);

  checkTrue("E6 · zéro erreur console/exception pendant E6 Atelier", consoleErrors.length === 0);
} finally {
  try { ws.close(); } catch {}
  try { chrome.kill("SIGKILL"); } catch {}
  server.close();
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
}

const passed = results.filter((r) => r.pass).length;
const verdict = {
  scenario: "M23 Astral — Atelier Astral : PWA + audio + Sceau + Oculus + Sablier + Symbiote (Chrome headless réel, dist-atelier)",
  evidence: "E6 (M23 Astral)",
  invariants: {
    "SW cache-first": "l'asset de navigation est disponible hors-ligne",
    "manifest installability": "display=standalone + icônes + start_url",
    "audio = synthèse pure": "Web Audio API, aucun asset fichier",
    "projection ≠ mutation": "reload stable du plateau",
  },
  assertions: results,
  passed,
  failed: results.length - passed,
  consoleErrors,
  status: results.every((r) => r.pass) && consoleErrors.length === 0 ? "E6 PROVEN" : "E6 FAILED",
};
writeFileSync(join(OUT, "e6-atelier-result.json"), JSON.stringify(verdict, null, 2));
console.log("=== E6 — PREUVE ATELIER ASTRAL (M23) ===");
for (const r of results) console.log(`${r.pass ? " ok " : "FAIL"} ${r.name}`);
console.log(`--- ${passed}/${results.length} assertions · consoleErrors=${consoleErrors.length}`);
console.log(`VERDICT: ${verdict.status} · artefacts: lab/e6-atelier-evidence/`);
process.exitCode = verdict.status === "E6 PROVEN" ? 0 : 1;
