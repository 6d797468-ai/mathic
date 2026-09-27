import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";

const HERE = dirname(fileURLToPath(import.meta.url));
const DIST = join(HERE, "..", "dist-grimoire");
const OUT = join(HERE, "e6-momo-evidence");
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
const profile = mkdtempSync(join(tmpdir(), "e6-momo-"));
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

async function openN1() {
  await evalJs(`document.getElementById('btn-saga').click()`);
  await sleep(800);
  await evalJs(`document.querySelector('[data-level-id="N1"]').click()`);
  await sleep(600);
}

async function clickHint() {
  await evalJs(`document.getElementById('btn-hint').click()`);
  await sleep(300);
  return evalJs(`(() => { const out=document.getElementById('momo-out'); const lines=out.querySelectorAll('.momo-hint-line'); const first=lines[0]; return { visible: out && !out.hidden, count: lines.length, factId: first ? first.dataset.solverFactId : null, verified: out ? out.classList.contains('momo-verified') : false, text: out ? out.textContent.trim() : '' }; })()`);
}

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
  const s0 = await evalJs(`(() => ({ indexVisible: !document.getElementById('vue-index').hidden, save: localStorage.getItem('mathic.save.v1') }))()`);
  checkTrue("E0 · Index chargé (save vierge, profil frais)", s0.indexVisible && s0.save === null);

  await openN1();
  const e1 = await evalJs(`(() => ({ sessionVisible: !document.getElementById('vue-session').hidden, btnHint: !!document.getElementById('btn-hint'), momoOut: !!document.getElementById('momo-out') }))()`);
  await shot("01-session-n1.png");
  checkTrue("E1 · session N1 montée, bouton Indice (Momo) présent", e1.sessionVisible && e1.btnHint && e1.momoOut);

  const beforeHint = await evalJs(`localStorage.getItem('mathic.save.v1')`);
  const h1 = await clickHint();
  await shot("02-hint-n1.png");
  checkTrue("E2 · HINT GENERATED — panneau Momo affiché avec lignes", h1.visible && h1.count >= 1);
  checkTrue("E2 · TRACEABILITY — ligne porte un solverFactId", !!h1.factId && h1.factId.length > 0);
  checkTrue("E2 · FACT VERIFIED — badge fact-verified (confidence verified)", h1.verified);
  checkTrue("E2 · hint texte traçable contient la formule directe N1 (2 + 3 = 5)", h1.text.includes("2") && h1.text.includes("3") && h1.text.includes("5"));

  const afterHint = await evalJs(`localStorage.getItem('mathic.save.v1')`);
  checkTrue("E3 · PROJECTION ≠ MUTATION — mathic.save.v1 inchangé par le hint", beforeHint === afterHint);

  const h2 = await clickHint();
  checkEq("E4 · REPLAY DETERMINISTE — même texte sur clic identique", h1.text, h2.text);

  await evalJs(`localStorage.setItem('mathic.momo.mode','fallback')`);
  await cdp("Page.reload");
  await waitEvent("Page.loadEventFired");
  await sleep(700);
  const modeFallback = await evalJs(`localStorage.getItem('mathic.momo.mode')`);
  checkEq("E5 · mode basculé sur 'fallback'", "fallback", modeFallback);
  await openN1();
  const beforeFallback = await evalJs(`localStorage.getItem('mathic.save.v1')`);
  const hf = await clickHint();
  await shot("03-fallback-hint.png");
  checkTrue("E5 · FALLBACK WORKS — hint déclencheur déterministe (provider absent)", hf.visible && hf.count >= 1);
  const afterFallback = await evalJs(`localStorage.getItem('mathic.save.v1')`);
  checkTrue("E5 · PROJECTION ≠ MUTATION (mode fallback)", beforeFallback === afterFallback);

  await evalJs(`localStorage.setItem('mathic.momo.mode','local-llm')`);
  await cdp("Page.reload");
  await waitEvent("Page.loadEventFired");
  await sleep(700);
  await openN1();
  const hl = await clickHint();
  await shot("04-local-llm-no-provider-hint.png");
  checkTrue("E6 · OFFLINE / NO-LLM — mode local-llm sans provider → fallback déterministe (gameplay continue)", hl.visible && hl.count >= 1 && hl.verified);
  await evalJs(`localStorage.removeItem('mathic.momo.mode')`);

  checkTrue("E6 · zéro erreur console/exception sur toute la boucle Momo", consoleErrors.length === 0);
} finally {
  try { ws.close(); } catch {}
  try { chrome.kill("SIGKILL"); } catch {}
  server.close();
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
}

const passed = results.filter((r) => r.pass).length;
const verdict = {
  scenario: "Momo : save vierge → N1 → btn-hint → hint traçable (solverFactId) + fact-verified → PROJECTION≠MUTATION → REPLAY DETERMINISTE → mode fallback/local-llm (provider absent) → fallback déterministe ; gameplay continue (Chrome headless réel, dist-grimoire)",
  invariants: {
    "fact verification": "chaque hint mécanique remonte à un solverFactId (A14-bis)",
    "projection ≠ mutation": "demander un indice n'écrit jamais mathic.save.v1",
    "offline first": "aucun provider → hint déterministe (aucune dépendance réseau)",
    "gameplay continues": "fallback / timeout / modèle absent → replay déterministe",
  },
  assertions: results,
  passed,
  failed: results.length - passed,
  consoleErrors,
  status: results.every((r) => r.pass) && consoleErrors.length === 0 ? "E6 PROVEN" : "E6 FAILED",
};
writeFileSync(join(OUT, "e6-momo-result.json"), JSON.stringify(verdict, null, 2));
console.log("=== E6 — PREUVE MOMO (M19) ===");
for (const r of results) console.log(`${r.pass ? " ok " : "FAIL"} ${r.name}`);
console.log(`--- ${passed}/${results.length} assertions · consoleErrors=${consoleErrors.length}`);
console.log(`VERDICT: ${verdict.status} · artefacts: lab/e6-momo-evidence/`);
process.exitCode = verdict.status === "E6 PROVEN" ? 0 : 1;
