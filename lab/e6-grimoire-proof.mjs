// ============================================================================
// E6-G17 — PREUVE NAVIGATEUR RÉEL · Grimoire des Mondes (boucle M17 complète)
// ----------------------------------------------------------------------------
// Gate G17-04 (contrat MATHIC-1-0-GRIMOIRE-INTEGRATION.md) : la boucle
//   OUVRIR → CHOISIR → JOUER → RÉSOLUTION → RÉCOMPENSE → PROGRESSION → SUIVANT
// exécutée dans Chrome réel (vrai DOM, vrai localStorage) sur dist-grimoire.
//
// Scénario :
//   S0 chargement · S1 index (2 familles, N1 ouverte, N2 scellée)
//   S2 ouverture N1 (session formules) · S3 résolution par clics réels (2+3)
//   S4 récompense (score, N2 débloqué) · S5 « Tourner la page » → N2 montée
//   S6 sommaire → N1 MASTERED, N2 ouverte · S7 lab V5 → résolu → savoir nourri
//   S8 frontière I-5 : le chemin lab n'écrit PAS mathic.save.v1
//   S9 RELOAD → étoiles/états/savoir restaurés, sans doublon
//
// Aucune dépendance : node:http + CDP via WebSocket natif.
// Sortie : lab/e6-grimoire-evidence/{e6-grimoire-result.json, *.png}
// ============================================================================

import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";

const HERE = dirname(fileURLToPath(import.meta.url));
const DIST = join(HERE, "..", "dist-grimoire");
const OUT = join(HERE, "e6-grimoire-evidence");
mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// 1. Serveur statique (dist-grimoire)
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// 2. Chrome headless + CDP (même mécanique que e6-browser-proof.mjs)
// ---------------------------------------------------------------------------
const CHROME = "/usr/bin/google-chrome";
const profile = mkdtempSync(join(tmpdir(), "e6-grimoire-"));
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
const evidence = { url: APP_URL, chrome: "headless (hôte)", profileFrais: true, steps: [], consoleErrors };
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

try {
  await cdp("Page.enable");
  await cdp("Runtime.enable");
  try {
    await cdp("Emulation.setDeviceMetricsOverride", { width: 420, height: 900, deviceScaleFactor: 2, mobile: true });
  } catch {}

  // --- S0 : chargement -------------------------------------------------------
  await cdp("Page.navigate", { url: APP_URL });
  await waitEvent("Page.loadEventFired");
  await sleep(600);
  await shot("00-chargement.png");

  // --- S1 : INDEX — deux familles, verrouillage dérivé du cœur ---------------
  const s1 = await evalJs(`(() => ({
    indexVisible: !document.getElementById('vue-index').hidden,
    familles: document.querySelectorAll('.famille').length,
    n1Open: !document.querySelector('.famille .page').disabled,
    n1Locked: document.querySelector('.famille .page').classList.contains('locked'),
    n2Disabled: document.querySelector('.famille .page:nth-child(2)').disabled,
    n2Hatched: document.querySelector('.famille .page:nth-child(2)').classList.contains('locked'),
    footSave: document.getElementById('foot-save').textContent,
  }))()`);
  evidence.steps.push({ step: "S1-index", ...s1 });
  await shot("01-index.png");
  checkTrue("S1 · vue Index visible au démarrage", s1.indexVisible);
  checkEq("S1 · deux familles (Campagne + Laboratoire)", 2, s1.familles);
  checkTrue("S1 · N1 ouverte (activée, non hachurée)", s1.n1Open && !s1.n1Locked);
  checkTrue("S1 · N2 scellée (désactivée + hachurée) — état dérivé de mathic.save.v1", s1.n2Disabled && s1.n2Hatched);

  // --- S2 : ouverture de N1 (session formules réelle) ------------------------
  const s2 = await evalJs(`(() => {
    document.querySelector('.famille .page').click();
    return {
      sessionVisible: !document.getElementById('vue-session').hidden,
      title: document.getElementById('session-title').textContent,
      engine: document.getElementById('session-engine').textContent,
      tuiles: document.querySelectorAll('#board button.tile').length,
      hint: document.getElementById('session-hint').textContent,
    };
  })()`);
  evidence.steps.push({ step: "S2-session-N1", ...s2 });
  await shot("02-session-n1.png");
  checkTrue("S2 · session montée sur clic réel", s2.sessionVisible);
  checkEq("S2 · page N1", "N1", s2.title);
  checkEq("S2 · moteur affiché = formules (b1 via seam)", "formules", s2.engine);
  checkEq("S2 · plateau N1 = 3 tuiles réelles du niveau", 3, s2.tuiles);

  // --- S3 : jouer 2+3 par clics réels (saisie formule 3 clics) ---------------
  const s3 = await evalJs(`(() => {
    const t = [...document.querySelectorAll('#board button.tile')];
    t[0].click(); t[1].click();
    return { hint: document.getElementById('session-hint').textContent };
  })()`);
  evidence.steps.push({ step: "S3-selection", ...s3 });
  checkTrue("S3 · rappel de sélection visible (« Formule : 2 + »)", s3.hint.includes("Formule : 2"));
  const s3b = await evalJs(`(() => {
    [...document.querySelectorAll('#board button.tile')][2].click();
    return {
      resoluVisible: !document.getElementById('vue-resolu').hidden,
      sessionGone: document.getElementById('vue-session').hidden,
    };
  })()`);
  await sleep(400); // flush knowledge async
  evidence.steps.push({ step: "S3-resolution", ...s3b });
  await shot("03-resolu-n1.png");
  checkTrue("S3 · le 3e clic soumet la formule → vue Résolution", s3b.resoluVisible && s3b.sessionGone);

  // --- S4 : récompense dérivée (score, déblocage, bouton suivant) -------------
  const s4 = await evalJs(`(() => ({
    titre: document.getElementById('resolu-titre').textContent,
    score: document.getElementById('resolu-score').textContent,
    unlocked: document.getElementById('resolu-unlocked').textContent,
    nextLabel: document.getElementById('btn-suivant').textContent,
    nextEnabled: !document.getElementById('btn-suivant').disabled,
    save: JSON.parse(localStorage.getItem('mathic.save.v1')),
  }))()`);
  evidence.steps.push({ step: "S4-recompense", ...s4 });
  await shot("04-recompense.png");
  checkTrue("S4 · page scellée affichée", s4.titre.includes("N1"));
  checkTrue("S4 · N2 débloquée par la récompense (markCompleted délégué)", (s4.save.unlocked ?? []).includes("N2"));
  checkTrue("S4 · victoire enregistrée (wins=1)", (s4.save.completed?.N1?.wins ?? 0) === 1);
  checkTrue("S4 · bouton « Tourner la page » actif vers N2", s4.nextEnabled && s4.nextLabel.includes("N2"));

  // --- S5 : progression → niveau suivant monté -------------------------------
  const s5 = await evalJs(`(() => {
    document.getElementById('btn-suivant').click();
    return {
      sessionVisible: !document.getElementById('vue-session').hidden,
      title: document.getElementById('session-title').textContent,
    };
  })()`);
  evidence.steps.push({ step: "S5-suivant", ...s5 });
  await shot("05-session-n2.png");
  checkTrue("S5 · N2 montée via next() (b1 réel, échelle LADDER)", s5.sessionVisible && s5.title === "N2");

  // --- S6 : sommaire → N1 dorée (MASTERED), N2 ouverte ------------------------
  const s6 = await evalJs(`(() => {
    document.getElementById('btn-index').click();
    return {
      indexVisible: !document.getElementById('vue-index').hidden,
      n1Mastered: document.querySelector('.famille .page').classList.contains('mastered'),
      n2Open: !document.querySelector('.famille .page:nth-child(2)').disabled,
    };
  })()`);
  evidence.steps.push({ step: "S6-sommaire", ...s6 });
  await shot("06-sommaire.png");
  checkTrue("S6 · N1 marquée MASTERED (dorée) après victoire réelle", s6.n1Mastered);
  checkTrue("S6 · N2 désormais ouverte dans l'index", s6.n2Open);

  // --- S7 : laboratoire V5 — résolution réelle, savoir nourri ----------------
  const saveBeforeLab = await evalJs(`localStorage.getItem('mathic.save.v1')`);
  const s7 = await evalJs(`(() => {
    document.querySelectorAll('.famille')[1].querySelector('.page').click();
    return {
      sessionVisible: !document.getElementById('vue-session').hidden,
      engine: document.getElementById('session-engine').textContent,
      title: document.getElementById('session-title').textContent,
    };
  })()`);
  evidence.steps.push({ step: "S7-lab-open", ...s7 });
  checkTrue("S7 · page lab ouverte (moteur = grilles, jamais verrouillée)", s7.sessionVisible && s7.engine === "grilles");

  let resolved = false;
  let guard = 0;
  while (guard++ < 12 && !resolved) {
    const step = await evalJs(`(() => {
      const b = document.querySelector('#board .tile.empty button');
      if (!b) return { stuck: true };
      b.click();
      return { resolved: !document.getElementById('vue-resolu').hidden };
    })()`);
    if (step?.stuck) break;
    resolved = !!step.resolved;
    await sleep(60);
  }
  await sleep(500); // flush knowledge async
  const s7b = await evalJs(`(() => {
    let ids = [];
    try { ids = JSON.parse(localStorage.getItem('mathic.knowledge.v1') ?? '{}').unlockedFragments ?? []; } catch {}
    return {
      knowledgeIds: ids,
      savoirCell: document.getElementById('resolu-savoir')?.textContent ?? '',
    };
  })()`);
  evidence.steps.push({ step: "S7-lab-resolu", resolved, knowledgeIds: s7b.knowledgeIds });
  await shot("07-lab-resolu.png");
  checkTrue("S7 · session lab résolue par clics sur les coups OFFERTS uniquement", resolved);
  checkTrue("S7 · savoir écrit dans mathic.knowledge.v1 (LORE_ATELIER_001)", (s7b.knowledgeIds ?? []).includes("LORE_ATELIER_001"));

  // --- S8 : frontière I-5 — le chemin lab n'a PAS écrit la progression -------
  const saveAfterLab = await evalJs(`localStorage.getItem('mathic.save.v1')`);
  evidence.steps.push({ step: "S8-frontiere", inchangée: saveBeforeLab === saveAfterLab });
  checkTrue("S8 · mathic.save.v1 inchangé par le chemin lab (I-5 en conditions réelles)", saveBeforeLab === saveAfterLab);

  // --- S9 : RELOAD — tous les états restaurés depuis les stores réels --------
  await cdp("Page.reload");
  await waitEvent("Page.loadEventFired");
  await sleep(700);
  const s9 = await evalJs(`(() => {
    let ids = [];
    try { ids = JSON.parse(localStorage.getItem('mathic.knowledge.v1') ?? '{}').unlockedFragments ?? []; } catch {}
    return {
      indexVisible: !document.getElementById('vue-index').hidden,
      n1Mastered: document.querySelector('.famille .page')?.classList.contains('mastered') ?? false,
      n2Open: document.querySelector('.famille .page:nth-child(2)') && !document.querySelector('.famille .page:nth-child(2)').disabled,
      knowledgeIds: ids,
      knowledgeUnique: new Set(ids).size,
      footKnow: document.getElementById('foot-know').textContent,
    };
  })()`);
  evidence.steps.push({ step: "S9-reload", ...s9 });
  await shot("08-reload.png");
  checkTrue("S9 · index restauré après reload", s9.indexVisible);
  checkTrue("S9 · N1 toujours MASTERED après reload", s9.n1Mastered);
  checkTrue("S9 · N2 toujours ouverte après reload", s9.n2Open);
  checkTrue("S9 · savoir restauré, sans doublon", (s9.knowledgeIds ?? []).includes("LORE_ATELIER_001") && s9.knowledgeUnique === s9.knowledgeIds.length);
  checkTrue("S9 · persistance du savoir visible (mode persistent)", s9.footKnow.includes("persistent"));

  // Erreurs console : tolérance zéro
  checkTrue("E6 · zéro erreur console/exception sur toute la boucle", consoleErrors.length === 0);
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
  scenario: "Grimoire : ouvrir → choisir → jouer → résoudre → récompense → progression → suivant → lab → reload (Chrome headless réel)",
  evidence: "E6 (G17-04)",
  assertions: results,
  passed,
  failed: results.length - passed,
  consoleErrors,
  status: results.every((r) => r.pass) && consoleErrors.length === 0 ? "E6 PROVEN" : "E6 FAILED",
};
writeFileSync(join(OUT, "e6-grimoire-result.json"), JSON.stringify(verdict, null, 2));
console.log("=== E6 — PREUVE NAVIGATEUR GRIMOIRE (G17-04) ===");
for (const r of results) console.log(`${r.pass ? " ok " : "FAIL"} ${r.name}`);
console.log(`--- ${passed}/${results.length} assertions · consoleErrors=${consoleErrors.length}`);
console.log(`VERDICT: ${verdict.status} · artefacts: lab/e6-grimoire-evidence/`);
process.exitCode = verdict.status === "E6 PROVEN" ? 0 : 1;
