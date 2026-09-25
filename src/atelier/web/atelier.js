// ============================================================================
// MATHIC — Atelier Astral (UI M12 + M13)
// Rôle : surface produit autour du moteur V5 + Sceau de Défi + Sablier de Chronos.
// Le moteur reste souverain : toute interaction passe par le ReplayController
// (lui-même adossé à replay(spec, events)). L'état affiché à la position k est
// TOUJOURS celui du replay réel — jamais un état reconstruit par l'UI.
// Aucun accès direct à l'Engine, aucune modification de Save/Policy/Progression.
// ============================================================================

import { createReplayController } from "../replay-controller.mjs";
import {
  createOculusController,
  analyzeState,
  analyzeAction,
  reserveValuesAt,
  present,
} from "../oculus-controller.mjs";
import { encodeSeal, decodeSeal, verifySeal } from "../seal.mjs";
import {
  createKnowledgeStore,
  getFragment,
  listFragments,
} from "../knowledge.mjs";

const PRESETS = {
  SUM2X2: {
    label: "Sceau 2×2 · Ligne",
    spec: {
      grid: [[-1, -1], [-1, -1]],
      rows: [
        { ops: ["+"], target: 5 },
        { ops: ["+"], target: 7 },
      ],
      cols: [
        { ops: ["+"], target: 4 },
        { ops: ["+"], target: 8 },
      ],
      reserve: { 2: 2, 3: 1, 5: 1 },
    },
  },
  MIXED2X2: {
    label: "Creuset 2×2 · Mixte",
    spec: {
      grid: [[-1, -1], [-1, -1]],
      rows: [
        { ops: ["*"], target: 10 },
        { ops: ["-"], target: 4 },
      ],
      cols: [
        { ops: ["+"], target: 9 },
        { ops: ["+"], target: 8 },
      ],
      reserve: { 2: 1, 3: 1, 5: 1, 7: 1 },
    },
  },
  TRIPLE1X3: {
    label: "Étoile 1×3 · Somme",
    spec: {
      grid: [[-1, -1, -1]],
      rows: [{ ops: ["+", "+"], target: 12 }],
      cols: [{ ops: [], target: 4 }, { ops: [], target: 4 }, { ops: [], target: 4 }],
      reserve: { 2: 2, 4: 2, 6: 1 },
    },
  },
};

const $ = (id) => document.getElementById(id);

const els = {
  presets: $("presets"),
  board: $("board"),
  moves: $("moves"),
  solved: $("solved"),
  reserve: $("reserve"),
  status: $("status"),
  btnSeal: $("btn-seal"),
  btnCopy: $("btn-copy"),
  sealOut: $("seal-out"),
  sealIn: $("seal-in"),
  btnVerify: $("btn-verify"),
  btnImport: $("btn-import"),
  verifyOut: $("verify-out"),
  // Sablier de Chronos
  sablier: $("sablier"),
  btnBack: $("btn-back"),
  btnStart: $("btn-start"),
  btnPresent: $("btn-present"),
  btnUndo: $("btn-undo"),
  cursorPos: $("cursor-pos"),
  cursorTotal: $("cursor-total"),
  curve: $("curve"),
  replayStatus: $("replay-status"),
  // Oculus d'Analyse
  btnOculus: $("btn-oculus"),
  oculus: $("oculus"),
  oculusBody: $("oculus-body"),
  btnOculusClose: $("btn-oculus-close"),
  btnOculusClose2: $("btn-oculus-close2"),
  // Marges de Maggeek
  fragments: $("fragments"),
  margesNote: $("marges-note"),
};

// ---- Mémoire pédagogique (M15) — Fragments de Savoir ----------------------
// L'observation (Verified Event) → évaluation pure → union monotone → persistance.
// Le lore n'INVENTE jamais un fait : chaque Fragment est rattaché à un fait
// moteur/Oculus/Sablier/Sceau réellement observé dans CETTE session.

let ctrl = null;          // ReplayController — le présent est le curseur
let currentLabel = null;
let importedSpec = null;
let wasSolved = false;     // détection de transition réelle vers solved

// Backend de persistance injecté (Web Storage). S'il est indisponible ou qu'il
// échoue, knowledge bascule en mémoire : l'Atelier ne dépend jamais du lore.
let knowledge = null;
const storageBackend = (() => {
  try {
    const ls = window.localStorage;
    return {
      get: (k) => ls.getItem(k),
      set: (k, v) => ls.setItem(k, v),
    };
  } catch {
    return null; // storage indisponible → fallback mémoire (KNOW-18)
  }
})();
knowledge = createKnowledgeStore(storageBackend);

let unlockedIds = [];
let sessionSeq = []; // évidence réelle de la session, chronologique

async function observe(o) {
  if (!knowledge) return;
  sessionSeq.push(o);
  try {
    const { state, newlyUnlocked } = await knowledge.recordAll({ sequence: sessionSeq });
    unlockedIds = state.unlockedFragments;
    renderMarges();
    if (newlyUnlocked.length) {
      const f = getFragment(newlyUnlocked[0]);
      setStatus(`Fragment débloqué : « ${f.title} »`, "ok");
    }
  } catch {
    renderMarges(); // le lore ne bloque jamais la session
  }
}

function renderMarges() {
  if (!els.fragments) return;
  const unlocked = new Set(unlockedIds);
  els.fragments.innerHTML = "";
  for (const f of listFragments()) {
    const li = document.createElement("li");
    li.className = "frag" + (unlocked.has(f.id) ? " on" : " off");
    if (unlocked.has(f.id)) {
      const det = document.createElement("details");
      const sum = document.createElement("summary");
      sum.textContent = `✦ ${f.title} · ${f.category}`;
      const fact = document.createElement("p");
      fact.className = "mono frag-fact";
      fact.textContent = `FAIT — ${f.fact}`;
      const body = document.createElement("p");
      body.className = "frag-body";
      body.textContent = f.body;
      det.append(sum, fact, body);
      li.appendChild(det);
    } else {
      const span = document.createElement("span");
      span.className = "frag-locked";
      span.textContent = `○ ${f.title}`;
      li.appendChild(span);
    }
    els.fragments.appendChild(li);
  }
  if (els.margesNote) {
    els.margesNote.textContent = knowledge
      ? `${unlockedIds.length}/${listFragments().length} fragments · mémoire ${knowledge.mode}`
      : "mémoire indisponible — l'Atelier continue.";
  }
}

const boardView = (state) =>
  state.grid.map((row) => row.map((v) => (v === -1 ? null : v)));

function renderBoard() {
  if (!ctrl) return;
  const state = ctrl.getState();                 // état AU CURSEUR (replay réel)
  const { solved, moves } = state;
  const board = boardView(state);
  const rows = board.length;
  const cols = board[0].length;
  const movesAt = ctrl.getCommands();            // commandes valides au curseur
  const reserveVals = reserveValuesAt(state).map(Number); // valeurs réelles restantes

  let gridHtml = "";
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const val = board[r][c];
      const offered = movesAt.filter((m) => m.r === r && m.c === c);
      const offeredVals = new Set(offered.map((o) => o.value));
      const obstacles = reserveVals.filter((v) => !offeredVals.has(v));
      if (val !== null) {
        gridHtml += `<div class="cell fill">${val}</div>`;
      } else {
        gridHtml += `<div class="cell empty">`;
        if (offered.length) {
          gridHtml += `<span class="opts">${offered
            .map((o) => `<button class="cellbtn ok" data-v="${o.value}" data-r="${r}" data-c="${c}">${o.value}</button>`)
            .join("")}</span>`;
        } else {
          gridHtml += `–`;
        }
        if (obstacles.length) {
          gridHtml += `<span class="obs">${obstacles
            .map((v) => `<button class="cellbtn obs" data-v="${v}" data-r="${r}" data-c="${c}" title="le moteur n'offre pas cette valeur ici">${v}✕</button>`)
            .join("")}</span>`;
        }
        gridHtml += `</div>`;
      }
    }
  }

  els.board.style.gridTemplateColumns = `repeat(${cols}, 56px)`;
  els.board.innerHTML = gridHtml;

  els.moves.textContent = moves;
  els.solved.textContent = solved ? "OUI ✦" : "non";
  els.solved.style.color = solved ? "#4ade80" : "#8b91a7";

  // CHALLENGE_COMPLETED — transition RÉELLE vers isSolved (jamais le fait que la
  // grille soit « affichable »). Observé depuis getState() au curseur.
  if (solved && !wasSolved) {
    wasSolved = true;
    observe({ t: "CHALLENGE_COMPLETED", moves });
  }
  const reserveTxt = Object.entries(state.reserve)
    .filter(([, n]) => n > 0)
    .map(([v, n]) => `${v}×${n}`)
    .join(" · ");
  els.reserve.textContent = reserveTxt || "−";

  els.status.classList.toggle("ok", !!solved);
  els.status.textContent = solved
    ? "Anomalie stabilisée. Frappe le Sceau pour l'éterniser."
    : currentLabel;

  // coups OFFERTS par la loi → place() ; valeurs ÉCARTÉES → analyse Oculus.
  for (const btn of els.board.querySelectorAll(".cellbtn.ok")) {
    btn.addEventListener("click", () => place(btn.dataset));
  }
  for (const btn of els.board.querySelectorAll(".cellbtn.obs")) {
    btn.addEventListener("click", () => oculusAttempt(btn.dataset));
  }

  renderSablier();
  if (ctrl && !els.oculus.hidden) renderOculusState(); // analyse rattachée au curseur affiché
}

function setStatus(text, tone = "") {
  els.status.textContent = text;
  els.status.className = "status" + (tone ? " " + tone : "");
}

function place({ v, r, c }) {
  if (!ctrl) return;
  const r0 = ctrl.move({ value: +v, r: +r, c: +c });
  if (r0.ok) {
    renderBoard();
    if (!ctrl.atEnd()) setStatus("Branche créée — la trace a reflué.", "ok");
  } else {
    setStatus("Mouvement refusé par le moteur (aucune transition).", "err");
  }
}

// ---- Sablier de Chronos -----------------------------------------------------
// Le locus est le curseur du ReplayController. Chaque déplacement appelle
// seek()/back()/toPresent()/undo() du contrôleur : l'état affiché en réponse
// est celui du replay réel du préfixe sélectionné.

function renderSablier() {
  if (!ctrl) return;
  const { position, total } = ctrl.cursor();

  els.cursorPos.textContent = position;
  els.cursorTotal.textContent = total;

  // barre de progression 0..total (100% = présent)
  els.curve.style.width = total === 0 ? "0%" : `${Math.round((position / total) * 100)}%`;

  els.btnBack.disabled = position === 0;
  els.btnStart.disabled = position === 0;
  els.btnUndo.disabled = position === 0;
  els.btnPresent.disabled = position === total;

  const atPresent = position === total;
  els.sablier.dataset.mode = atPresent ? "present" : "history";
  document.body.classList.toggle("rewound", !atPresent);
  els.replayStatus.textContent = atPresent
    ? "Présent — la trace est vivante."
    : `Historique — état au coup ${position}/${total} (replay réel). Jouer ici crée une branche.`;
  els.replayStatus.className = "status mono" + (atPresent ? "" : " rewound");
}

els.btnBack.addEventListener("click", () => {
  if (!ctrl) return;
  try {
    ctrl.back(1);
    observe({ t: "REWIND_USED", depth: 1, source: "back" });
    setStatus("Un cran remonté. Observe le point de bascule.", "ok");
    renderBoard();
  } catch (err) {
    setStatus(err.message, "err");
  }
});

els.btnStart.addEventListener("click", () => {
  if (!ctrl) return;
  try {
    ctrl.backToStart();
    observe({ t: "REWIND_USED", depth: ctrl.cursor().position, source: "backToStart" });
    setStatus("Retour à l'origine de la trace.", "ok");
    renderBoard();
  } catch (err) {
    setStatus(err.message, "err");
  }
});

els.btnPresent.addEventListener("click", () => {
  if (!ctrl) return;
  try {
    ctrl.toPresent();
    setStatus("Retour au présent de la trace.", "ok");
    renderBoard();
  } catch (err) {
    setStatus(err.message, "err");
  }
});

els.btnUndo.addEventListener("click", () => {
  if (!ctrl) return;
  const u = ctrl.undo();
  if (u.ok) {
    observe({ t: "UNDO_USED", position: u.position });
    setStatus("Dernier coup tronqué de la trace (branche).", "ok");
    renderBoard();
  } else {
    setStatus("Rien à annuler.", "err");
  }
});

// ---- Oculus d'Analyse -------------------------------------------------------
//  Analyse ATTACHÉE au curseur du Sablier : S_k = replay(spec, E[1..k]).
//  Les causes exposées ne viennent que des faits du moteur (apply/getMoves/
//  validateSpec/quickReject). Aucune mutation : l'Oculus observe, jamais il ne
//  joue, jamais il ne recule, jamais il n'écrit.

const escapeHtml = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));

function fmtLine(l) {
  const cells = l.cells.map((c) => (c === -1 ? "·" : c)).join(" ");
  const ops = l.ops.join(" ");
  return `${l.kind === "row" ? "L" : "C"}${l.idx + 1}  ${cells}  [${ops}]  = ${l.target}`;
}

function oculusOpen() {
  els.oculus.hidden = false;
}
function oculusClose() {
  els.oculus.hidden = true;
}

function renderOculusState() {
  if (!ctrl) return;
  const a = analyzeState(ctrl.spec, ctrl.trace, ctrl.position);
  observe({ t: "OCULUS_STATE_ANALYZED", cursor: a.cursor });
  const p = present(a);
  const lines = a.lines.rows.concat(a.lines.cols);
  let html = `
    <p class="oc-cursor mono">Coup <b>${a.cursor}</b> / ${a.total} · ${a.atPresent ? "PRÉSENT" : "HISTORIQUE"}</p>
    <p class="oc-result ${p.tone}">${escapeHtml(p.title)}${a.solved ? " ✦" : ""}</p>
    <ul class="oc-lines">${lines.map((l) => `<li>${escapeHtml(fmtLine(l))}</li>`).join("")}</ul>
    <p class="oc-note mono">Moteur : ${a.offeredMoves.length} coups offerts · additivité ${escapeHtml(a.specNote)}</p>`;
  if (!a.atPresent && a.lastEvent) {
    html += `<p class="oc-event mono">Dernier coup : PLACE ${a.lastEvent.value} @ (${a.lastEvent.r},${a.lastEvent.c})</p>`;
  }
  els.oculusBody.innerHTML = html;
  oculusOpen();
}

function oculusAttempt({ v, r, c }) {
  if (!ctrl) return;
  const a = analyzeAction(ctrl.spec, ctrl.trace, ctrl.position, { value: +v, r: +r, c: +c });
  observe({ t: "OCULUS_ACTION_ANALYZED", reasonCode: a.reasonCode, valid: a.valid, offered: a.offered });
  // Une incantation refusée OU écartée par la loi est une « erreur inspectée » :
  // deux faits réels et distincts de l'Oculus (apply / getMoves), jamais inventés.
  if (!a.valid || !a.offered) {
    observe({ t: "OCULUS_REJECTION_OBSERVED", reasonCode: a.reasonCode });
  }
  const p = present(a);
  const st = analyzeState(ctrl.spec, ctrl.trace, a.cursor);
  const lines = st.lines.rows.concat(st.lines.cols);
  let html = `
    <p class="oc-cursor mono">Coup <b>${a.cursor}</b> / ${a.total} · Commande : PLACE ${a.command.value} @ (${a.command.r},${a.command.c})</p>
    <p class="oc-result ${p.tone}">${escapeHtml(p.title)}</p>`;
  if (p.body) html += `<p class="oc-fact mono">Cause : ${escapeHtml(p.body)}</p>`;
  for (const cell of a.affectedCells) {
    html += `<p class="oc-fact mono">Cellule (${cell.r},${cell.c}) — ${escapeHtml(String(cell.role))}${cell.content !== null ? ` : ${escapeHtml(String(cell.content))}` : ""}</p>`;
  }
  for (const v0 of a.affectedValues) {
    html += `<p class="oc-fact mono">Valeur ${v0.value} — ${escapeHtml(String(v0.role))}${v0.qty !== undefined ? ` : ${v0.qty} restant${v0.qty > 1 ? "s" : ""}` : ""}</p>`;
  }
  if (a.valid) {
    html += `<p class="oc-note mono">Transition réelle du moteur : ${escapeHtml(JSON.stringify(a.stateAfter.grid))}</p>`;
  }
  html += `<ul class="oc-lines">${lines.map((l) => `<li>${escapeHtml(fmtLine(l))}</li>`).join("")}</ul>`;
  els.oculusBody.innerHTML = html;
  oculusOpen();
}

els.btnOculus.addEventListener("click", renderOculusState);
els.btnOculusClose.addEventListener("click", oculusClose);
els.btnOculusClose2.addEventListener("click", oculusClose);

// ---- Initialisation ---------------------------------------------------------

function initCtrl(spec, label) {
  ctrl = createReplayController(spec);
  currentLabel = label;
  importedSpec = null;
  wasSolved = false;
  renderBoard();
}

function renderPresets() {
  els.presets.innerHTML = "";
  for (const [key, p] of Object.entries(PRESETS)) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = p.label;
    b.addEventListener("click", () => initCtrl(JSON.parse(JSON.stringify(p.spec)), p.label));
    els.presets.appendChild(b);
  }
}

// ---- Sceau : génération & copie -------------------------------------------

els.btnSeal.addEventListener("click", () => {
  if (!ctrl) return;
  try {
    const spec = ctrl.spec;
    const seal = encodeSeal(spec);
    observe({ t: "SEAL_CREATED", length: seal.length });
    els.sealOut.textContent = seal;
    els.btnCopy.disabled = seal.length === 0;
    setStatus(`Sceau forgé (${seal.length} caractères). Copie-le, partout, hors ligne.`, "ok");
  } catch (err) {
    els.sealOut.textContent = "";
    setStatus(`Forging impossible : ${err.message}`, "err");
  }
});

els.btnCopy.addEventListener("click", async () => {
  const text = els.sealOut.textContent;
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    setStatus("Sceau copié. Un autre appareil peut l'importer.", "ok");
  } catch {
    els.sealIn.value = text;
    els.sealIn.select();
    setStatus("Copie auto indisponible — sélectionne et copie manuellement.", "err");
  }
});

// ---- Import : vérification stricte puis initiation ------------------------

els.btnVerify.addEventListener("click", () => {
  const raw = els.sealIn.value.trim();
  const v = verifySeal(raw);
  if (!v.ok) {
    els.sealIn.classList.add("invalid");
    els.sealIn.classList.remove("valid");
    els.verifyOut.textContent = `Rejeté : ${v.message ?? v.reason}`;
    els.verifyOut.className = "status mono err";
    els.btnImport.disabled = true;
    return;
  }
  els.sealIn.classList.remove("invalid");
  els.sealIn.classList.add("valid");
  const dec = decodeSeal(raw);
  els.verifyOut.textContent = `Sceau authentique. Défi ${dec.spec.grid.length}×${dec.spec.grid[0].length}.`;
  els.verifyOut.className = "status mono ok";
  els.btnImport.disabled = false;
  importedSpec = dec.spec;
});

els.btnImport.addEventListener("click", () => {
  if (!importedSpec) return;
  initCtrl(JSON.parse(JSON.stringify(importedSpec)), "défi importé du Sceau");
  setStatus("Défi du Sceau initié. Résous-le, puis compare le résultat final.", "ok");
});

renderPresets();
if (knowledge) {
  knowledge
    .load()
    .then((s) => {
      unlockedIds = s.unlockedFragments;
      renderMarges();
    })
    .catch(() => renderMarges());
} else {
  renderMarges();
}
initCtrl(JSON.parse(JSON.stringify(PRESETS.SUM2X2.spec)), PRESETS.SUM2X2.label);