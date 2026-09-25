// ============================================================================
// E6 — PREUVE NAVIGATEUR RÉEL · Atelier Astral (M12..M16 sur dist-atelier)
// ----------------------------------------------------------------------------
// Chaîne validée en conditions réelles (Chrome headless, vrai DOM, vrai
// localStorage) :
//   compose (toggles Gardiens + Lier les Sceaux)
//     → play (clics sur les coups OFFERTS par le moteur, en boucle)
//     → solved (transition réelle isSolved → CHALLENGE_COMPLETED)
//     → seal (forge M12 depuis la session composée)
//     → fragments (Marges : débloqués/verrouillés, persistance mathic.knowledge.v1)
//     → reload (rechargement page complet → connaissance conservée, sans doublon)
//
// Aucune dépendance : serveur statique node:http + CDP via WebSocket natif.
// Sortie : lab/e6-evidence/{e6-result.json, *.png}
// ============================================================================

import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";

const HERE = dirname(fileURLToPath(import.meta.url));
const DIST = join(HERE, "..", "dist-atelier");
const OUT = join(HERE, "e6-evidence");
mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// 1. Serveur statique (dist-atelier)
// ---------------------------------------------------------------------------
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webmanifest": "application/manifest+json",
  ".wasm": "application/wasm",
};

const server = createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url ?? "/").split("?")[0]);
  let fsPath = join(DIST, urlPath === "/" ? "index.html" : urlPath);
  if (!fsPath.startsWith(DIST)) {
    res.writeHead(403);
    return res.end();
  }
  if (!existsSync(fsPath)) {
    res.writeHead(404);
    return res.end("not found");
  }
  res.writeHead(200, { "content-type": MIME[extname(fsPath)] ?? "application/octet-stream" });
  res.end(readFileSync(fsPath));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const PORT = server.address().port;
const APP_URL = `http://127.0.0.1:${PORT}/index.html`;

// ---------------------------------------------------------------------------
// 2. Chrome headless + CDP
// ---------------------------------------------------------------------------
const CHROME = "/usr/bin/google-chrome";
const profile = mkdtempSync(join(tmpdir(), "e6-profile-"));
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
    // Collecte NON destructive : les erreurs sont notées puis l'événement reste
    // disponible pour waitEvent (un splice grossier les avalerait).
    if (m.method === "Runtime.exceptionThrown") {
      consoleErrors.push(String(m.params?.exceptionDetails?.exception?.description ?? m.params?.exceptionDetails?.text ?? "exception"));
    } else if (m.method === "Runtime.consoleAPICalled" && m.params?.type === "error") {
      consoleErrors.push(JSON.stringify(m.params.args ?? []));
    }
    events.push(m);
  }
});

function cdp(method, params = {}) {
  return new Promise((res, rej) => {
    const id = ++pendingId;
    pending.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
let pendingId = 0;

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

// ---------------------------------------------------------------------------
// 3. Scénario
// ---------------------------------------------------------------------------
const evidence = {
  url: APP_URL,
  chrome: "headless (version hôte)",
  profileFrais: true,
  steps: [],
  consoleErrors,
};
const results = [];
const check = (name, expected, actual) => {
  const pass = String(expected) === String(actual);
  results.push({ name, expected, actual, pass });
  return pass;
};
const checkTrue = (name, actual) => {
  results.push({ name, expected: true, actual: !!actual, pass: !!actual });
  return !!actual;
};

try {
  await cdp("Page.enable");
  await cdp("Runtime.enable");
  try {
    await cdp("Emulation.setDeviceMetricsOverride", { width: 420, height: 900, deviceScaleFactor: 2, mobile: true });
  } catch {}

  // --- S0 : chargement -------------------------------------------------------
  await cdp("Page.navigate", { url: APP_URL });
  await waitEvent("Page.loadEventFired");
  await sleep(400); // init modules + knowledge.load()
  await shot("00-initial.png");

  // --- S1 : compose (AL_JABR + FRACTALIA) ------------------------------------
  const s1 = await evalJs(`(() => {
    const cards = [...document.querySelectorAll('#guardians-grid .guardian-card')];
    const before = document.getElementById('resonance-state').textContent;
    cards[0].click(); // AL_JABR  → SYMBIOTE_AWAKENED (1re sélection)
    cards[1].click(); // FRACTALIA
    const out = document.getElementById('symbiote-out');
    const btn = document.getElementById('btn-symbiote-compose');
    btn.click();      // SYMBIOTE_COMPOSED + initCtrl(spec composée)
    return {
      resonanceBefore: before,
      resonanceAfter: document.getElementById('resonance-state').textContent,
      out: out.textContent, ok: out.className.includes('ok'),
      cells: document.querySelectorAll('#board .cell').length,
      offerButtons: document.querySelectorAll('#board .cellbtn.ok').length,
    };
  })()`);
  await sleep(300); // writes knowledge async
  evidence.steps.push({ step: "S1-compose", ...s1 });
  await shot("01-compose.png");
  checkTrue("S1 · badge Résonance passe DORMANT → BOUND (|G|=2)", s1.resonanceAfter === "BOUND");
  checkTrue("S1 · forge acceptée (message ok)", s1.ok);
  checkTrue("S1 · grille composée rendue (4 cellules)", s1.cells === 4);
  checkTrue("S1 · le moteur offre des coups", s1.offerButtons > 0);

  // --- S2 : play (coups offerts uniquement, boucle réelle) -------------------
  const played = [];
  for (let i = 0; i < 12; i++) {
    const step = await evalJs(`(() => {
      const b = document.querySelector('#board .cellbtn.ok');
      if (!b) return null;
      const move = { v: b.dataset.v, r: b.dataset.r, c: b.dataset.c };
      b.click();
      return {
        move,
        solved: document.getElementById('solved').textContent,
        offersLeft: document.querySelectorAll('#board .cellbtn.ok').length,
      };
    })()`);
    if (!step) break;
    played.push(step.move);
    if (step.solved.includes("OUI")) break;
    await sleep(60);
  }
  await sleep(400); // CHALLENGE_COMPLETED → recordAll async
  const s2 = await evalJs(`(() => ({
    solved: document.getElementById('solved').textContent,
    moves: document.getElementById('moves').textContent,
    status: document.getElementById('status').textContent,
    resonance: document.getElementById('resonance-state').textContent,
  }))()`);
  evidence.steps.push({ step: "S2-play", played, ...s2 });
  await shot("02-solved.png");
  checkTrue("S2 · session composée RÉSOLUE par l'UI (solved=OUI ✦)", s2.solved.includes("OUI"));
  check("S2 · 4 coups joués (réserve 2×2 pleine)", 4, played.length);
  checkTrue("S2 · Résonance → RESONANT (COMPOSED puis COMPLETED)", s2.resonance === "RESONANT");

  // --- S3 : seal (M12 depuis la session composée) ----------------------------
  await evalJs(`document.getElementById('btn-seal').click()`);
  await sleep(200);
  const s3 = await evalJs(`(() => ({
    seal: document.getElementById('seal-out').textContent,
  }))()`);
  evidence.steps.push({ step: "S3-seal", seal: s3.seal });
  await shot("03-seal.png");
  checkTrue("S3 · Sceau forgé MATHIC-CHAL-1:* depuis la spec composée", s3.seal.startsWith("MATHIC-CHAL-1:"));
  evidence.seal = s3.seal;

  // --- S4 : fragments (Marges) ------------------------------------------------
  const s4 = await evalJs(`(() => {
    const frag = [...document.querySelectorAll('#fragments .frag')];
    return {
      unlocked: frag.filter((f) => f.classList.contains('on')).map((f) => f.querySelector('summary')?.textContent ?? f.textContent),
      locked: frag.filter((f) => f.classList.contains('off')).length,
      total: frag.length,
      note: document.getElementById('marges-note').textContent,
      storageRaw: localStorage.getItem('mathic.knowledge.v1'),
    };
  })()`);
  evidence.steps.push({ step: "S4-fragments", ...s4 });
  await shot("04-fragments.png");
  check("S4 · catalogue complet affiché (10 fragments)", 10, s4.total);
  checkTrue("S4 · 5 fragments débloqués par la chaîne réelle", s4.unlocked.length === 5);
  checkTrue("S4 · stockage mathic.knowledge.v1 écrit", typeof s4.storageRaw === "string" && s4.storageRaw.length > 2);
  // Ordre du scénario (seal APRÈS solve) → LORE_ALJABR_001 reste verrouillé :
  // la règle exige SEAL_CREATED AVANT CHALLENGE_COMPLETED. Comportement honnête.
  checkTrue("S4 · LORE_ALJABR_001 verrouillé (seal après solve → ordre non satisfait)", s4.unlocked.some((u) => u.includes("Sceau & transmission")) === false);
  evidence.unlockedAfterSolve = s4.unlocked;

  // --- S5 : sceau round-trip (verify + import dans l'UI) ----------------------
  const s5 = await evalJs(`(() => {
    const input = document.getElementById('seal-in');
    input.value = ${JSON.stringify(s3.seal)};
    document.getElementById('btn-verify').click();
    const verifyOut = document.getElementById('verify-out').textContent;
    const importEnabled = !document.getElementById('btn-import').disabled;
    document.getElementById('btn-import').click();
    return {
      verifyOut, importEnabled,
      statusAfterImport: document.getElementById('status').textContent,
      solvedAfterImport: document.getElementById('solved').textContent,
    };
  })()`);
  evidence.steps.push({ step: "S5-seal-roundtrip", ...s5 });
  await shot("05-import.png");
  checkTrue("S5 · verifySeal accepte le Sceau in-browser", s5.verifyOut.includes("authentique"));
  checkTrue("S5 · import → nouvelle session jouable non résolue", !s5.solvedAfterImport.includes("OUI"));

  // --- S6 : RELOAD complet (navigation réelle) --------------------------------
  await cdp("Page.reload");
  await waitEvent("Page.loadEventFired");
  await sleep(600); // knowledge.load() async → renderMarges
  const s6 = await evalJs(`(() => {
    const frag = [...document.querySelectorAll('#fragments .frag')];
    let ids = [];
    try { ids = JSON.parse(localStorage.getItem('mathic.knowledge.v1') ?? '{}').unlockedFragments ?? []; } catch {}
    return {
      unlockedCount: frag.filter((f) => f.classList.contains('on')).length,
      storageIds: ids,
      storageUnique: new Set(ids).size,
      resonanceAfterReload: document.getElementById('resonance-state').textContent,
      boardCells: document.querySelectorAll('#board .cell').length,
    };
  })()`);
  evidence.steps.push({ step: "S6-reload", ...s6 });
  await shot("06-reload.png");
  check("S6 · reload → 5 fragments restaurés depuis mathic.knowledge.v1", 5, s6.unlockedCount);
  check("S6 · aucun doublon après reload", s6.storageIds.length, s6.storageUnique);
  checkTrue("S6 · payload de stockage = tableau d'ids (schéma v1)", Array.isArray(s6.storageIds));

  // Erreurs console : tolérance zéro
  checkTrue("E6 · zéro erreur console/exception sur toute la session", consoleErrors.length === 0);
} finally {
  try { ws.close(); } catch {}
  try { chrome.kill("SIGKILL"); } catch {}
  server.close();
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
}

// ---------------------------------------------------------------------------
// 4. Verdict
// ---------------------------------------------------------------------------
const passed = results.filter((r) => r.pass).length;
const verdict = {
  scenario: "compose → play → solved → seal → fragments → reload (Chrome headless réel)",
  evidence: "E6",
  assertions: results,
  passed,
  failed: results.length - passed,
  consoleErrors,
  status: results.every((r) => r.pass) && consoleErrors.length === 0 ? "E6 PROVEN" : "E6 FAILED",
};
writeFileSync(join(OUT, "e6-result.json"), JSON.stringify(verdict, null, 2));
console.log("=== E6 — PREUVE NAVIGATEUR ===");
for (const r of results) console.log(`${r.pass ? " ok " : "FAIL"} ${r.name}  (attendu: ${JSON.stringify(r.expected)} / réel: ${JSON.stringify(r.actual)})`);
console.log(`--- ${passed}/${results.length} assertions · consoleErrors=${consoleErrors.length}`);
console.log(`VERDICT: ${verdict.status} · artefacts: lab/e6-evidence/`);
process.exitCode = verdict.status === "E6 PROVEN" ? 0 : 1;
