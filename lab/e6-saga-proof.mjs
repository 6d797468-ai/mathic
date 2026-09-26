import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";

const HERE = dirname(fileURLToPath(import.meta.url));
const DIST = join(HERE, "..", "dist-grimoire");
const OUT = join(HERE, "e6-saga-evidence");
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
const profile = mkdtempSync(join(tmpdir(), "e6-saga-"));
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
if (!page) throw new Error("aucune cible page");

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
  await sleep(700);
  await shot("00-chargement.png");
  const s0 = await evalJs(`(() => ({ indexVisible: !document.getElementById('vue-index').hidden, sagaBtn: !!document.getElementById('btn-saga'), save: localStorage.getItem('mathic.save.v1') }))()`);
  checkTrue("S0 · Index chargé (save vierge, profil frais)", s0.indexVisible && s0.sagaBtn && s0.save === null);

  await evalJs(`document.getElementById('btn-saga').click()`);
  await sleep(1500);
  await shot("01-saga-vue.png");
  const s1 = await evalJs(`(() => { const n1 = document.querySelector('[data-level-id="N1"]'); return { sagaVisible: !document.getElementById('vue-saga').hidden, chapters: document.querySelectorAll('.saga-chapter').length, n1Class: n1 ? n1.className : null, n1Stars: n1 ? n1.querySelector('.saga-lv-stars').textContent : null, totals: document.getElementById('saga-out').textContent }; })()`);
  checkTrue("S1 · vue Saga affichée (projection = rendu exploitable)", s1.sagaVisible);
  checkEq("S1 · 6 chapitres (W1..W6)", 6, s1.chapters);
  checkTrue("S1 · N1 OUVERT — état dérivé du save vierge", s1.n1Class && s1.n1Class.includes("open") && !s1.n1Class.includes("mastered"));
  checkEq("S1 · N1 = 0 étoile (☆☆☆)", E0 + E0 + E0, s1.n1Stars);

  await evalJs(`document.querySelector('[data-level-id="N1"]').click()`);
  await sleep(600);
  const s2 = await evalJs(`(() => ({ sessionVisible: !document.getElementById('vue-session').hidden, title: document.getElementById('session-title').textContent, engine: document.getElementById('session-engine').textContent, tuiles: document.querySelectorAll('#board button.tile').length }))()`);
  await shot("02-session-n1.png");
  checkTrue("S2 · N1 monté en session depuis la vue Saga", s2.sessionVisible && s2.title === "N1");
  checkEq("S2 · moteur = formules", "formules", s2.engine);
  checkEq("S2 · plateau N1 = 3 tuiles réelles", 3, s2.tuiles);

  const s3 = await evalJs(`(() => { const t = [...document.querySelectorAll('#board button.tile')]; t[0].click(); t[1].click(); t[2].click(); return { resoluVisible: !document.getElementById('vue-resolu').hidden, save: localStorage.getItem('mathic.save.v1') }; })()`);
  await sleep(400);
  await shot("03-resolu-n1.png");
  checkTrue("S3 · N1 résolu par clics réels (2 + 3 = 5)", s3.resoluVisible);
  checkTrue("S3 · victoire enregivée (wins=1) — markCompleted DÉLÉGUÉ", (() => { try { return JSON.parse(s3.save).completed?.N1?.wins === 1; } catch { return false; } })());

  await evalJs(`(() => { document.getElementById('btn-index').click(); setTimeout(() => document.getElementById('btn-saga').click(), 10); })()`);
  await sleep(1500);
  const s4 = await evalJs(`(() => { const n1 = document.querySelector('[data-level-id="N1"]'); return { sagaVisible: !document.getElementById('vue-saga').hidden, n1Class: n1 ? n1.className : null, n1Stars: n1 ? n1.querySelector('.saga-lv-stars').textContent : null, totals: document.getElementById('saga-out').textContent }; })()`);
  await shot("04-saga-apres-victoire.png");
  checkTrue("S4 · N1 MAÎTRISÉ dans la Saga après victoire réelle", s4.n1Class && s4.n1Class.includes("mastered"));
  checkEq("S4 · N1 = 3 étoiles (★★★) — projection dérivée", E3 + E3 + E3, s4.n1Stars);
  checkTrue("S4 · totaux reflètent 1 page scellée / 3 étoiles dérivées (3‣123, 1‣41)", s4.totals.includes("3\u2043") && s4.totals.includes("1\u2043") && s4.totals.includes("étoiles") && s4.totals.includes("pages scellées"));

  const beforeView = await evalJs(`localStorage.getItem('mathic.save.v1')`);
  await evalJs(`(() => { document.getElementById('btn-saga').click(); document.getElementById('btn-saga').click(); document.getElementById('btn-saga').click(); })()`);
  await sleep(600);
  const afterView = await evalJs(`localStorage.getItem('mathic.save.v1')`);
  checkTrue("S5 · PROJECTION ≠ MUTATION — ré-ouvrir la Saga n'écrit PAS mathic.save.v1", beforeView === afterView);

  await cdp("Page.reload");
  await waitEvent("Page.loadEventFired");
  await sleep(800);
  await evalJs(`document.getElementById('btn-saga').click()`);
  await sleep(1500);
  const s6 = await evalJs(`(() => { const n1 = document.querySelector('[data-level-id="N1"]'); return { sagaVisible: !document.getElementById('vue-saga').hidden, n1Class: n1 ? n1.className : null, n1Stars: n1 ? n1.querySelector('.saga-lv-stars').textContent : null }; })()`);
  await shot("05-saga-apres-reload.png");
  checkTrue("S6 · RELOAD — N1 toujours MAÎTRISÉ", s6.sagaVisible && s6.n1Class && s6.n1Class.includes("mastered"));
  checkEq("S6 · RELOAD — étoiles stables (★★★)", E3 + E3 + E3, s6.n1Stars);

  checkTrue("E6 · zéro erreur console/exception sur toute la boucle Saga", consoleErrors.length === 0);
} finally {
  try { ws.close(); } catch {}
  try { chrome.kill("SIGKILL"); } catch {}
  server.close();
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
}

const passed = results.filter((r) => r.pass).length;
const verdict = {
  scenario: "Saga : save vierge → ouvrir vue Saga → N1 OUVERT/0★ → jouer N1 (2+3) → résolu → retour Saga → N1 MAÎTRISÉ/★★★ → RELOAD stable ; projection ≠ mutation (Chrome headless réel, dist-grimoire)",
  evidence: "E6 (G18-04/G18-05)",
  invariants: {
    "projection ≠ mutation": "ré-ouvrir la vue Saga n'écrit jamais mathic.save.v1",
    "projection ≠ progression engine": "la Saga ne calcule ni verrouillage ni markCompleted",
    "projection ≠ scoring engine": "les étoiles sont lues du save, jamais inventées",
  },
  assertions: results,
  passed,
  failed: results.length - passed,
  consoleErrors,
  status: results.every((r) => r.pass) && consoleErrors.length === 0 ? "E6 PROVEN" : "E6 FAILED",
};
writeFileSync(join(OUT, "e6-saga-result.json"), JSON.stringify(verdict, null, 2));
console.log("=== E6 — PREUVE NAVIGATEUR SAGA (G18-04/G18-05) ===");
for (const r of results) console.log(`${r.pass ? " ok " : "FAIL"} ${r.name}`);
console.log(`--- ${passed}/${results.length} assertions · consoleErrors=${consoleErrors.length}`);
console.log(`VERDICT: ${verdict.status} · artefacts: lab/e6-saga-evidence/`);
process.exitCode = verdict.status === "E6 PROVEN" ? 0 : 1;
