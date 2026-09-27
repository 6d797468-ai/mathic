// ============================================================================
// MATHIC 1.0 — Grimoire des Mondes · Contrôleur UI (M17)
// ----------------------------------------------------------------------------
// Surface produit du cœur pur (../grimoire.mjs) assemblé (../engines.mjs).
// L'UI ne possède AUCUNE règle : elle rend la vue exposée par le cœur, propose
// les coups OFFERTS (legalMoves), et délègue transitions/récompenses/progression.
// Un seul chemin d'écriture persistence : les modules dédiés (save, knowledge).
// ============================================================================

import { createGrimoire } from "../grimoire.mjs";
import { createGrimoireAssembly } from "../engines.mjs";
import { createKnowledgeStore } from "../../atelier/knowledge.mjs";
import { guardianFragments, guardianRules } from "../../atelier/symbiote.mjs";
import { createSaga } from "../saga.mjs";
import { solve as solveB1 } from "../../b1/solver.mjs";
import { loadSave, pickStorage } from "../../b1/save.mjs";
import { createMaggeek } from "../../intel/maggeek.mjs";
import { createMomo, momoMode } from "../../intel/momo.mjs";
import { solverFacts } from "../../intel/facts.mjs";
import { ladderBy } from "../../b1/levels.mjs";

const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------------------
// Assemblage réel — les mêmes modules que les tests d'intégration
// ---------------------------------------------------------------------------

const storageBackend = (() => {
  try {
    const ls = window.localStorage;
    return { get: (k) => ls.getItem(k), set: (k, v) => ls.setItem(k, v) };
  } catch {
    return null; // fallback mémoire géré par les modules réels
  }
})();

const knowledge = createKnowledgeStore(storageBackend, {
  extraFragments: guardianFragments(),
  extraRules: guardianRules(),
});

const grimoire = createGrimoire(createGrimoireAssembly({ storage: storageBackend, knowledgeStore: knowledge }));

const saga = createSaga({
  save: () => loadSave(storageBackend ?? pickStorage()),
  solve: solveB1,
  knowledge: () => ({ unlockedFragments: knowledge ? knowledge.listFragments() : [] }),
});

const maggeek = createMaggeek({ facts: solverFacts });
const momo = createMomo({ coach: maggeek, provider: null, mode: momoMode(typeof window !== "undefined" ? window : undefined) });

// M20 PWA : registration du Service Worker + haptics via Vibration API
if ("serviceWorker" in window.navigator) {
  window.navigator.serviceWorker.register("./sw.js").catch(() => {});
}
function vibrate(pattern) {
  const nav = window.navigator;
  if ("vibrate" in nav) nav.vibrate(pattern);
}

// ---------------------------------------------------------------------------
// Vue : saga
// ---------------------------------------------------------------------------

const VUES = ["vue-saga", "vue-index", "vue-session", "vue-resolu", "vue-echec"];

function showVue(id) {
  for (const v of VUES) $(v).hidden = v !== id;
}

const OP_SYMB = { "+": "+", "-": "−", "*": "×", "/": "÷" };

function setStatus(el, text, tone = "") {
  el.textContent = text;
  el.className = "status mono" + (tone ? " " + tone : "");
}

// ---------------------------------------------------------------------------
// VUE INDEX — lecture pure du catalogue (états dérivés du cœur)
// ---------------------------------------------------------------------------

function renderIndex() {
  showVue("vue-index");
  const familles = $("familles");
  familles.innerHTML = "";
  const levels = grimoire.listLevels();
  const byEngine = new Map();
  for (const l of levels) {
    if (!byEngine.has(l.engine)) byEngine.set(l.engine, []);
    byEngine.get(l.engine).push(l);
  }
  const famLabels = { b1: "Campagne · Formules", v5: "Laboratoire · Grilles" };
  for (const [engine, list] of byEngine) {
    const div = document.createElement("div");
    div.className = "famille";
    const title = document.createElement("p");
    title.className = "famille-title";
    title.textContent = famLabels[engine] ?? engine;
    const pages = document.createElement("div");
    pages.className = "pages";
    for (const l of list.slice(0, 12)) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "page" + (l.state === "LOCKED" ? " locked" : "") + (l.state === "MASTERED" ? " mastered" : "");
      b.disabled = !grimoire.canPlay(l.engine, l.id);
      b.innerHTML = `<span class="pid">${l.id}</span><span class="pname">${l.state === "LOCKED" ? "scellée" : l.title}</span>`;
      b.addEventListener("click", () => startLevel(l.engine, l.id));
      pages.appendChild(b);
    }
    div.append(title, pages);
    familles.appendChild(div);
  }
  setStatus($("index-out"), `${levels.filter((l) => l.state !== "LOCKED").length} pages ouvertes sur ${levels.length}.`);
  renderFooter();
}

function starsBadge(count) {
  return "★".repeat(count) + "☆".repeat(Math.max(0, 3 - count));
}

function renderSagaView() {
  showVue("vue-saga");
  const v = saga.view();
  const entries = $("saga-entries");
  entries.innerHTML = "";
  for (const ch of v.chapters) {
    const card = document.createElement("div");
     card.className = "saga-chapter";
    card.dataset.chapterId = ch.id;
    const head = document.createElement("div");
    head.className = "saga-chapter-head";
    const title = document.createElement("h3");
    title.textContent = ch.name;
    const sub = document.createElement("div");
    sub.className = "saga-chapter-sub";
    sub.textContent = `${ch.done}\u2043${ch.levels.length} scellées  \u2605 ${ch.starsEarned}/${ch.starsPossible}  (→ ${ch.thresholdMet ? "ouvert" : "à sceller"})`;
    head.append(title, sub);
    const grid = document.createElement("div");
    grid.className = "saga-levels";
    for (const lv of ch.levels) {
      const b = document.createElement("button");
      b.type = "button";
       b.className = "saga-level " + lv.state.toLowerCase();
      b.dataset.levelId = lv.id;
      b.disabled = lv.state === "LOCKED";
      const name = document.createElement("span");
      name.className = "saga-lv-name";
      name.textContent = lv.id;
      const stars = document.createElement("span");
      stars.className = "saga-lv-stars";
      stars.textContent = starsBadge(lv.stars);
      b.append(name, stars);
      b.addEventListener("click", () => {
        if (lv.state !== "LOCKED") startLevel("b1", lv.id);
      });
      grid.appendChild(b);
    }
    card.append(head, grid);
    entries.appendChild(card);
  }
  const lab = document.createElement("div");
  lab.className = "saga-lab";
  lab.textContent = "Laboratoire V5 — hors hiérarchie des étoiles (aucun verrou, aucune étoile)";
  entries.appendChild(lab);
  setStatus(
    $("saga-out"),
    `${v.totals.starsEarned}\u2043${v.totals.starsPossible} étoiles  \u2022  ${v.totals.completed}\u2043${v.totals.levelsTotal} pages scellées  \u2022  page courante : ${v.current?.levelId ?? "—"} (${v.current?.worldId ?? "—"})  \u2022  ${v.knowledge ? v.knowledge.fragments : grimoire.readSavoir().length} fragments de savoir`
  );
  renderFooter();
}

// ---------------------------------------------------------------------------
// VUE SESSION — plateaux en view-model (aucune connaissance moteur interne)
// ---------------------------------------------------------------------------

let selections = []; // saisie multi-clics (b1 : a, op, b)

function startLevel(engine, id) {
  const r = grimoire.start(engine, id);
  if (!r.ok) {
    setStatus($("index-out"), `Refusé par le Grimoire : ${r.reason}`, "err");
    return;
  }
  selections = [];
  renderSession();
}

function renderSession() {
  showVue("vue-session");
  const st = grimoire.status();
  $("session-title").textContent = st.levelId;
  $("session-engine").textContent = st.engine === "b1" ? "formules" : "grilles";
  const vm = st.session;

  if (st.engine === "b1") renderB1Board(vm);
  else renderV5Board(vm);

  $("hud-target").textContent = vm.target ?? "–";
  $("hud-moves").textContent = st.engine === "b1" ? `${vm.movesLeft}/${vm.maxMoves}` : String(vm.moves ?? 0);
  $("hud-score-item").style.display = st.engine === "b1" ? "" : "none";
  $("hud-score").textContent = vm.score ?? 0;

  renderFooter();
}

function renderHint() {
  const out = $("momo-out");
  if (!out) return;
  const st = grimoire.status();
  if (st.screen !== "PLAYING") {
    out.innerHTML = "";
    out.hidden = true;
    return;
  }
  const level = ladderBy(st.levelId);
  let record = null;
  try {
    record = loadSave(storageBackend ?? pickStorage()).completed?.[st.levelId] ?? null;
  } catch {
    record = null;
  }
  const h = momo.hint({ levelId: st.levelId, level, record });
  out.innerHTML = "";
  if (!h || h.abstain || !h.lines || !h.lines.length) {
    out.textContent = (h && h.text) || "";
    out.hidden = !(h && h.text);
    return;
  }
  out.className = "momo-panel " + (h.confidence === "verified" ? "momo-verified" : "momo-fallback");
  out.hidden = false;
  for (const line of h.lines) {
    const li = document.createElement("li");
    li.className = "momo-hint-line";
    li.dataset.solverFactId = line.solverFactId;
    li.textContent = line.text;
    const fact = document.createElement("span");
    fact.className = "momo-fact";
    fact.textContent = `[${line.solverFactId}]`;
    li.appendChild(fact);
    out.appendChild(li);
  }
}

function renderB1Board(vm) {
  const board = $("board");
  board.style.gridTemplateColumns = `repeat(${vm.cols}, 52px)`;
  board.innerHTML = "";
  vm.cells.forEach((c, i) => {
    let el;
    if (c === null) {
      el = document.createElement("div");
      el.className = "tile empty";
      el.textContent = "·";
    } else {
      el = document.createElement("button");
      el.type = "button";
      el.className = "tile " + c.kind + (c.result ? " result" : "");
      el.textContent = c.kind === "op" ? (OP_SYMB[c.v] ?? c.v) : String(c.v);
      el.dataset.pos = String(i);
      el.addEventListener("click", () => onB1Tile(i));
    }
    board.appendChild(el);
  });
  // rappel des sélections en cours
  const selText = selections
    .map((p) => {
      const c = vm.cells[p];
      return c ? (c.kind === "op" ? (OP_SYMB[c.v] ?? c.v) : String(c.v)) : "?";
    })
    .join(" ");
  $("session-hint").textContent = selText ? `Formule : ${selText}` : "Choisis un nombre, un opérateur, un nombre.";
}

function onB1Tile(pos) {
  const st = grimoire.status();
  const vm = st.session;
  const cell = vm.cells[pos];
  if (!cell) return;
  if (selections.length === 1 && cell.kind === "num" && selections[0] === pos) {
    selections = []; // re-clic sur le même nombre → reset propre
  } else if (selections.length === 2 && cell.kind === "num" && selections[1] === pos) {
    submitB1();
    return;
  } else if (selections.includes(pos)) {
    return;
  }
  if (selections.length < 3) selections.push(pos);
  if (selections.length === 3) submitB1();
  else renderSession();
}

function submitB1() {
  const [a, op, b] = selections;
  selections = [];
  const r = grimoire.play({ a, op, b });
  handlePlayResult(r);
}

function renderV5Board(vm) {
  const board = $("board");
  const cols = vm.grid[0].length;
  board.style.gridTemplateColumns = `repeat(${cols}, 52px)`;
  board.innerHTML = "";
  const offered = grimoire.legalMoves(); // coups OFFERTS par la loi (getMoves)
  vm.grid.forEach((row, r) => {
    row.forEach((v, c) => {
      let el;
      if (v === -1) {
        const opts = offered.filter((m) => m.r === r && m.c === c);
        if (opts.length) {
          el = document.createElement("div");
          el.className = "tile empty";
          for (const o of opts.slice(0, 4)) {
            const b = document.createElement("button");
            b.type = "button";
            b.className = "tile num";
            b.style.width = "auto";
            b.style.minWidth = "24px";
            b.style.height = "28px";
            b.style.fontSize = "0.8rem";
            b.textContent = String(o.v);
            b.addEventListener("click", () => {
              const res = grimoire.play({ id: "PLACE", v: o.v, r, c });
              handlePlayResult(res);
            });
            el.appendChild(b);
          }
        } else {
          el = document.createElement("div");
          el.className = "tile empty";
          el.textContent = "·";
        }
      } else {
        el = document.createElement("div");
        el.className = "tile num";
        el.textContent = String(v);
      }
      board.appendChild(el);
    });
  });
  $("session-hint").textContent = "Pose une valeur : chaque ligne et chaque colonne doit dire vrai.";
}

// ---------------------------------------------------------------------------
// Transitions — solve, échec, récompense (tout vient du cœur)
// ---------------------------------------------------------------------------

function handlePlayResult(r) {
  if (!r.ok) {
    vibrate([30, 30, 30]);
    setStatus($("session-out"), r.reason === "MOVE_ILLEGAL" ? "La loi refuse cette incantation." : `Refusé : ${r.reason}`, "err");
    renderSession();
    return;
  }
  vibrate([10]);
  setStatus($("session-out"), "");
  if (r.status.screen === "RESOLVED") renderResolved();
  else if (r.status.screen === "FAILED") renderFailed();
  else renderSession();
}

function renderResolved() {
  vibrate([20, 30, 100]);
  showVue("vue-resolu");
  const st = grimoire.status();
  const rw = grimoire.reward();
  const isB1 = st.engine === "b1";
  $("resolu-titre").textContent = `${st.levelId} — page scellée`;
  $("resolu-lore").textContent = isB1
    ? "« La formule a dit vrai. Le Grimoire tourne ses pages tout seul. »"
    : "« Chaque ligne, chaque colonne : tout est vrai. La pierre se souvient. »";
  $("resolu-score").textContent = String(rw.finalScore ?? "–");
  $("resolu-unlocked").textContent = rw.progression?.unlocked?.length ? rw.progression.unlocked.join(", ") : "—";
  $("btn-suivant").disabled = !rw.next;
  $("btn-suivant").textContent = rw.next ? `✦ Tourner la page → ${rw.next.id}` : "✦ Fin du chapitre";
  flushKnowledge();
}

function renderFailed() {
  vibrate([50, 100, 50]);
  showVue("vue-echec");
  const st = grimoire.status();
  setStatus($("echec-out"), `Plus de coups sur ${st.levelId} — la page reste ouverte.`);
}

async function flushKnowledge() {
  try {
    const f = await grimoire.flushKnowledge();
    if (f.newlyUnlocked.length) {
      const frag = knowledge.getFragment(f.newlyUnlocked[0]);
      setStatus($("resolu-out"), `Fragment de savoir : « ${frag?.title ?? f.newlyUnlocked[0]} »`, "ok");
    }
  } catch {
    /* le savoir ne bloque jamais la boucle */
  }
  renderFooter();
}

// ---------------------------------------------------------------------------
// Navigation & boot
// ---------------------------------------------------------------------------

$("btn-index").addEventListener("click", () => {
  grimoire.toIndex();
  renderIndex();
});
$("btn-saga").addEventListener("click", () => {
  renderSagaView();
});
$("btn-saga-back").addEventListener("click", () => {
  showVue("vue-index");
  renderIndex();
});
if ($("btn-hint")) {
  $("btn-hint").addEventListener("click", () => {
    renderHint();
    setStatus($("session-out"), "Momo : indice dérivé des faits solver — aucune règle inventée.", "ok");
  });
}
$("btn-retour-index").addEventListener("click", () => {
  grimoire.toIndex();
  renderIndex();
});
$("btn-echec-index").addEventListener("click", () => {
  grimoire.toIndex();
  renderIndex();
});
$("btn-suivant").addEventListener("click", () => {
  const r = grimoire.next();
  if (r.ok) {
    selections = [];
    renderSession();
  } else {
    setStatus($("resolu-out"), r.reason === "END_OF_LADDER" ? "Fin du chapitre — le Grimoire n'a plus de page à offrir." : `Refusé : ${r.reason}`, "err");
  }
});
const replay = () => {
  const st = grimoire.status();
  const r = grimoire.start(st.engine, st.levelId);
  if (r.ok) {
    selections = [];
    renderSession();
  }
};
$("btn-rejouer").addEventListener("click", replay);
$("btn-echec-rejouer").addEventListener("click", replay);

function renderFooter() {
  const p = grimoire.readPersistence();
  $("foot-save").textContent = "mathic.save.v1";
  $("foot-know").textContent = `savoir ${p.mode} (${grimoire.readSavoir().length} fragments)`;
}

// Boot : ouverture du Grimoire + premier rendu (knowledge async)
grimoire.open();
renderIndex();
knowledge
  .load()
  .then(renderFooter)
  .catch(renderFooter);
