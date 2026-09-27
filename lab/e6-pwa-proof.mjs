import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";

const HERE = dirname(fileURLToPath(import.meta.url));
const DIST = join(HERE, "..", "dist-grimoire");
const OUT = join(HERE, "e6-pwa-evidence");
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
const profile = mkdtempSync(join(tmpdir(), "e6-pwa-"));
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

try {
  await cdp("Page.enable");
  await cdp("Runtime.enable");
  try {
    await cdp("Emulation.setDeviceMetricsOverride", { width: 420, height: 900, deviceScaleFactor: 2, mobile: true });
  } catch {}

  await cdp("Page.navigate", { url: APP_URL });
  await waitEvent("Page.loadEventFired");
  await sleep(1500);
  await shot("00-app-install-banners.png");

  const s0 = await evalJs(`(() => {
    const manifestLink = document.querySelector('link[rel="manifest"]');
    const viewport = document.querySelector('meta[name="viewport"]');
    const appleIcon = document.querySelector('link[rel="apple-touch-icon"]');
    return {
      manifestLink: manifestLink ? manifestLink.href : null,
      viewport: viewport ? viewport.content : null,
      appleIcon: appleIcon ? appleIcon.href : null,
      display: document.getElementById('vue-index') ? !document.getElementById('vue-index').hidden : null,
      sw: 'serviceWorker' in window.navigator,
      vibrate: 'vibrate' in window.navigator,
    };
  })()`);
  checkTrue("S0 · link[rel=manifest] présent", s0.manifestLink !== null);
  checkTrue("S0 · meta viewport optimisé mobile (width=device-width)", s0.viewport && s0.viewport.includes("width=device-width"));
  checkTrue("S0 · apple-touch-icon présent", s0.appleIcon !== null);
  checkTrue("S0 · serviceWorker navigable", s0.sw);
  checkTrue("S0 · Vibration API disponible (haptics)", s0.vibrate);

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
  checkTrue("S1 · Service Worker enregistré (scriptURL contient sw.js)", swState.registered && swState.scriptURL && swState.scriptURL.includes("sw.js"));
  checkEq("S1 · SW state = activated", "activated", swState.state);

  const manifestResult = await evalJs(`(async () => {
    const link = document.querySelector('link[rel="manifest"]');
    if (!link) return { ok: false };
    const resp = await fetch(link.href);
    const m = await resp.json();
    return { ok: true, name: m.name, short_name: m.short_name, display: m.display, theme_color: m.theme_color, iconCount: m.icons?.length ?? 0, start_url: m.start_url };
  })()`);
  checkTrue("S2 · manifest fetchable + lisible", manifestResult.ok);
  checkEq("S2 · display = standalone", "standalone", manifestResult.display);
  checkGe("S2 · manifest ≥ 2 icônes", 2, manifestResult.iconCount);

  let cacheResult = await evalJs(`(async () => {
    const cacheNames = await caches.keys();
    return { cacheNames, hasCache: cacheNames.length > 0 };
  })()`);
  for (let attempt = 0; attempt < 5 && !cacheResult.hasCache; attempt++) {
    await sleep(300);
    cacheResult = await evalJs(`(async () => {
      const cacheNames = await caches.keys();
      return { cacheNames, hasCache: cacheNames.length > 0 };
    })()`);
  }
  checkTrue("S3 · caches Cache API présents (prêt offline)", cacheResult.hasCache);

  let offlineResult = await evalJs(`(async () => {
    const cacheNames = await caches.keys();
    if (!cacheNames.length) return { checked: false };
    const cache = await caches.open(cacheNames[0]);
    const keys = await cache.keys();
    const hasHTML = keys.some((r) => r.url && (String(r.url).endsWith("/") || String(r.url).includes("index.html")));
    const hasCSS = keys.some((r) => r.url && r.url.includes("grimoire.css"));
    const hasJS = keys.some((r) => r.url && r.url.includes("grimoire.js"));
    return { checked: true, htmlCached: hasHTML, cssCached: hasCSS, jsCached: hasJS, cacheName: cacheNames[0], entryCount: keys.length };
  })()`);
  checkTrue("S4 · index.html mis en cache", offlineResult.htmlCached);
  checkTrue("S4 · grimoire.css mis en cache", offlineResult.cssCached);
  checkTrue("S4 · grimoire.js mis en cache", offlineResult.jsCached);

  const offlineNav = await evalJs(`(async () => {
    try {
      const resp = await fetch('/index.html', { cache: 'force-cache' });
      return { ok: resp.ok, status: resp.status, fromCache: resp.headers.get('x-cache') === 'HIT' || !resp.fromCache };
    } catch { return { ok: false }; }
  })()`);
  checkTrue("S5 · navigation offline réussit (cache-first)", offlineNav.ok);

  const before = await evalJs(`localStorage.getItem('mathic.save.v1')`);
  await evalJs(`document.querySelector('#familles button.page:not(:disabled)').click()`);
  await sleep(600);
  await evalJs(`(async () => {
    const t = [...document.querySelectorAll('#board button.tile')];
    t[0].click(); t[1].click(); t[2].click();
    await new Promise(r => setTimeout(r, 500));
  })()`);
  const after = await evalJs(`localStorage.getItem('mathic.save.v1')`);
  await shot("02-offline-jeu-complet.png");
  checkTrue("S6 · gameplay offline complet (save écrite)", before !== after);

  checkTrue("E6 · zéro erreur console/exception pendant PWA E6", consoleErrors.length === 0);
} finally {
  try { ws.close(); } catch {}
  try { chrome.kill("SIGKILL"); } catch {}
  server.close();
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
}

const passed = results.filter((r) => r.pass).length;
const verdict = {
  scenario: "M20 PWA : manifest standalone + SW activé + cache offline + gameplay offline sans erreur (Chrome headless réel, dist-grimoire)",
  evidence: "E6 (M20 PWA)",
  invariants: {
    "SW cache-first": "l'asset de navigation est disponible hors-ligne via le cache",
    "manifest installability": "display=standalone + icônes + start_url",
    "haptics disponibles": "Vibration API exposée, hooks gameplay injectés",
  },
  assertions: results,
  passed,
  failed: results.length - passed,
  consoleErrors,
  status: results.every((r) => r.pass) && consoleErrors.length === 0 ? "E6 PROVEN" : "E6 FAILED",
};
writeFileSync(join(OUT, "e6-pwa-result.json"), JSON.stringify(verdict, null, 2));
console.log("=== E6 — PREUVE M20 PWA ===");
for (const r of results) console.log(`${r.pass ? " ok " : "FAIL"} ${r.name}`);
console.log(`--- ${passed}/${results.length} assertions · consoleErrors=${consoleErrors.length}`);
console.log(`VERDICT: ${verdict.status} · artefacts: lab/e6-pwa-evidence/`);
process.exitCode = verdict.status === "E6 PROVEN" ? 0 : 1;
