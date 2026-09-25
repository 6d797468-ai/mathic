// ============================================================================
// MATHIC — Atelier Astral (UI M12 + M13)
// Rôle : surface produit autour du moteur V5 + Sceau de Défi + Sablier de Chronos.
// Le moteur reste souverain : toute interaction passe par le ReplayController
// (lui-même adossé à replay(spec, events)). L'état affiché à la position k est
// TOUJOURS celui du replay réel — jamais un état reconstruit par l'UI.
// Aucun accès direct à l'Engine, aucune modification de Save/Policy/Progression.
// ============================================================================

import { createReplayController } from "../replay-controller.mjs";
import { encodeSeal, decodeSeal, verifySeal } from "../seal.mjs";

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
};

let ctrl = null;          // ReplayController — le présent est le curseur
let currentLabel = null;
let importedSpec = null;

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

  let gridHtml = "";
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const val = board[r][c];
      const opts = val === null ? movesAt.filter((m) => m.r === r && m.c === c) : [];
      if (val !== null) {
        gridHtml += `<div class="cell fill">${val}</div>`;
      } else if (opts.length) {
        gridHtml += `<div class="cell empty"><span class="opts">${opts
          .map((o) => `<button class="cellbtn" data-v="${o.value}" data-r="${r}" data-c="${c}">${o.value}</button>`)
          .join("")}</span></div>`;
      } else {
        gridHtml += `<div class="cell empty">–</div>`;
      }
    }
  }

  els.board.style.gridTemplateColumns = `repeat(${cols}, 56px)`;
  els.board.innerHTML = gridHtml;

  els.moves.textContent = moves;
  els.solved.textContent = solved ? "OUI ✦" : "non";
  els.solved.style.color = solved ? "#4ade80" : "#8b91a7";
  const reserveTxt = Object.entries(state.reserve)
    .filter(([, n]) => n > 0)
    .map(([v, n]) => `${v}×${n}`)
    .join(" · ");
  els.reserve.textContent = reserveTxt || "−";

  els.status.classList.toggle("ok", !!solved);
  els.status.textContent = solved
    ? "Anomalie stabilisée. Frappe le Sceau pour l'éterniser."
    : currentLabel;

  for (const btn of els.board.querySelectorAll(".cellbtn")) {
    btn.addEventListener("click", () => place(btn.dataset));
  }

  renderSablier();
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
    setStatus("Dernier coup tronqué de la trace (branche).", "ok");
    renderBoard();
  } else {
    setStatus("Rien à annuler.", "err");
  }
});

// ---- Initialisation ---------------------------------------------------------

function initCtrl(spec, label) {
  ctrl = createReplayController(spec);
  currentLabel = label;
  importedSpec = null;
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
initCtrl(JSON.parse(JSON.stringify(PRESETS.SUM2X2.spec)), PRESETS.SUM2X2.label);