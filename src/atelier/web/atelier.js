// ============================================================================
// MATHIC — Atelier Astral (UI minimale M12)
// Rôle : surface produit autour du moteur V5 + du Sceau de Défi.
// Le moteur reste souverain : toute interaction passe par createV5GameAdapter;
// toute importation passe par decodeSeal → vérification complète → createSession.
// Aucun accès direct à l'Engine, aucune modification de Save/Policy/Progression.
// ============================================================================

import { createV5GameAdapter } from "../../runtime/game-adapter-v5.js";
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
};

let adapter = null;
let currentLabel = null;
let importedSpec = null;

function renderBoard() {
  const { board, solved, rows, cols } = adapter.getState();

  let gridHtml = "";
  const moves = adapter.getCommands();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const val = board[r][c];
      const opts = val === null ? moves.filter((m) => m.r === r && m.c === c) : [];
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

  els.moves.textContent = adapter.getSession().moves;
  els.solved.textContent = solved ? "OUI ✦" : "non";
  els.solved.style.color = solved ? "#4ade80" : "#8b91a7";
  const reserveTxt = Object.entries(adapter.getSession().reserve)
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
}

function setStatus(text, tone = "") {
  els.status.textContent = text;
  els.status.className = "status" + (tone ? " " + tone : "");
}

function place({ v, r, c }) {
  if (!adapter) return;
  const ok = adapter.move({ value: +v, r: +r, c: +c });
  if (ok) renderBoard();
  else setStatus("Mouvement refusé par le moteur.", "err");
}

function initAdapter(spec, label) {
  adapter = createV5GameAdapter({ spec, seedLabel: "atelier-m12" });
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
    b.addEventListener("click", () => initAdapter(JSON.parse(JSON.stringify(p.spec)), p.label));
    els.presets.appendChild(b);
  }
}

// ---- Sceau : génération & copie -------------------------------------------

els.btnSeal.addEventListener("click", () => {
  if (!adapter) return;
  try {
    const spec = adapter.getSession().spec;
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
  initAdapter(JSON.parse(JSON.stringify(importedSpec)), "défi importé du Sceau");
  setStatus("Défi du Sceau initié. Résous-le, puis compare le résultat final.", "ok");
});

renderPresets();
initAdapter(JSON.parse(JSON.stringify(PRESETS.SUM2X2.spec)), PRESETS.SUM2X2.label);