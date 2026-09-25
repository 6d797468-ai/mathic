import { createSession, apply, evaluate, isWon, isLost, isBlocked, finalScore } from "../engine.mjs";
import { replay } from "../replay.mjs";
import { LADDER, WORLDS, worldOf, nextLevel } from "../levels.mjs";
import { loadSave, saveNow, markCompleted, isUnlocked, hasWon, worldProgress, pickStorage } from "../save.mjs";
import { createIntelNavigation } from "./intel-navigation.mjs";

const OP_SYMB = { "+": "+", "-": "−", "*": "×", "/": "÷" };

const $ = (id) => document.getElementById(id);

let save = loadSave();
let level = (LADDER.find((l) => l.id === save.current && isUnlocked(save, l.id)) ?? LADDER[0]);
let activeWorld = worldOf(level.id);
let state = createSession(level);
let sel = { a: null, op: null, b: null };
let pv = null;

// Pont M7 — l'UI observe via l'intelligence réelle (Engine injecté par l'UI) ;
// l'UI n'a AUCUNE autorité de progression hors la victoire UI standard.
const nav = createIntelNavigation({
  engine: { createSession, apply, evaluate, isWon, isLost, isBlocked },
  storage: pickStorage(),
});

const boardEl = $("board");

let lastHud = { id: null, score: null, chain: null };

function bump(el, prev, next) {
  if (Number(prev) === Number(next)) return;
  el.classList.remove("pop");
  void el.offsetWidth;
  el.classList.add("pop");
  clearTimeout(el._popTimer);
  el._popTimer = setTimeout(() => el.classList.remove("pop"), 320);
}

function log(entry) {
  console.log("B1|" + JSON.stringify({ ts: Date.now(), ...entry }));
}

function cells() {
  return state.board.cells;
}

function tileLabel(cell) {
  return cell.kind === "op" ? OP_SYMB[cell.v] ?? cell.v : String(cell.v);
}

function setStatus(text, kind = "hint") {
  const el = $("status");
  el.textContent = text;
  el.className = "status " + kind;
}

function shakeFormula() {
  const f = $("formula");
  f.classList.remove("shake");
  void f.offsetWidth;
  f.classList.add("shake");
}

function applyHud() {
  const h = new Set(level.hud ?? ["target", "moves"]);
  $("item-target").hidden = !h.has("target");
  $("item-moves").hidden = !h.has("moves");
  $("item-score").hidden = !h.has("score");
  $("item-chain").hidden = !h.has("chain");
}

function refreshPreview() {
  const res = $("res");
  const extra = $("pv-extra");
  const commit = $("commit");
  const { a, op, b } = sel;
  if (a === null || op === null || b === null) {
    pv = null;
    res.textContent = "–";
    res.className = "slot res-slot";
    extra.textContent = "";
    commit.disabled = true;
    return;
  }
  const act = { a, op, b };
  const ev = evaluate(state, act);
  if (!ev.ok) {
    pv = { ok: false, reason: ev.reason };
    res.textContent = "✗";
    res.className = "slot res-slot err";
    extra.textContent = ev.reason;
    commit.disabled = true;
    log({ level: level.id, kind: "invalid", action: act, reason: ev.reason });
    return;
  }
  const targetHit = ev.result === state.level.target;
  pv = {
    ok: true,
    action: act,
    result: ev.result,
    delta: ev.delta,
    chainRun: ev.chainRun,
    chainBonus: ev.chainBonus,
    targetHit,
  };
  res.textContent = targetHit ? ev.result + " ✓" : String(ev.result);
  res.className = "slot res-slot" + (targetHit ? " ok target" : " ok");
  extra.textContent = `+${ev.delta}` + (ev.chainRun ? ` · chaîne +${ev.chainBonus}` : "") + (targetHit ? " · objectif !" : "");
  commit.disabled = false;
  nav.preview(act);
  log({ level: level.id, kind: "preview", action: act, result: ev.result, delta: ev.delta, chainRun: ev.chainRun, targetHit });
}

function renderLevels() {
  const wrap = $("levels");
  wrap.replaceChildren();
  for (const w of WORLDS) {
    const block = document.createElement("div");
    block.className = "world-block" + (w.id === activeWorld ? " active" : "");
    const title = document.createElement("h3");
    title.textContent = `${w.id} · ${w.name}`;
    block.appendChild(title);
    const row = document.createElement("div");
    row.className = "level-row";
    for (const l of LADDER.filter((x) => x.world === w.id)) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = l.id;
      const reachable = isUnlocked(save, l.id) || hasWon(save, l.id);
      if (reachable) {
        if (l.id === level.id) b.classList.add("current");
        if (hasWon(save, l.id)) b.classList.add("done");
        b.addEventListener("click", () => switchLevel(l.id));
      } else {
        b.classList.add("locked");
        b.addEventListener("click", () => {
          setStatus("Niveau verrouillé — termine les niveaux précédents.", "error");
          log({ level: l.id, kind: "locked" });
        });
      }
      row.appendChild(b);
    }
    block.appendChild(row);
    wrap.appendChild(block);
  }
}

function renderWorlds() {
  const wrap = $("worlds");
  wrap.replaceChildren();
  for (const w of WORLDS) {
    const p = worldProgress(save, w.id);
    const b = document.createElement("button");
    b.type = "button";
    b.className = "world-pill" + (w.id === activeWorld ? " current" : "") + (p.done === p.total && p.total > 0 ? " done" : "");
    b.dataset.world = w.id;
    b.textContent = `${w.name} ${p.done}/${p.total}`;
    b.addEventListener("click", () => {
      activeWorld = w.id;
      renderWorlds();
      renderLevels();
    });
    wrap.appendChild(b);
  }
}

function renderProgress() {
  const w = WORLDS.find((x) => x.id === activeWorld) ?? WORLDS[0];
  const p = worldProgress(save, w.id);
  $("progress").textContent = `${w.id} · ${w.name} — ${p.done}/${p.total} réussis · ${p.unlocked}/${p.total} ouverts`;
}

function render() {
  $("lv").textContent = level.id;
  $("name").textContent = level.name;
  $("target").textContent = level.target;
  $("moves").textContent = state.movesLeft;
  $("score").textContent = state.score;
  $("chain").textContent = state.nextChain;
  if (lastHud.id !== level.id) {
    lastHud = { id: level.id, score: state.score, chain: state.nextChain };
  } else {
    bump($("score"), lastHud.score, state.score);
    bump($("chain"), lastHud.chain, state.nextChain);
    lastHud.score = state.score;
    lastHud.chain = state.nextChain;
  }
  applyHud();

  boardEl.style.gridTemplateColumns = `repeat(${state.board.cols}, minmax(54px, 1fr))`;
  boardEl.replaceChildren();
  cells().forEach((cell, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "cell";
    b.dataset.id = String(i);
    if (!cell) {
      b.disabled = true;
      b.textContent = "";
    } else {
      b.className += cell.kind === "op" ? " op" : cell.result ? " res" : "";
      if (i === sel.op) b.classList.add("selected", "op");
      if (i === sel.a || i === sel.b) b.classList.add("selected");
      b.textContent = tileLabel(cell);
    }
    b.addEventListener("click", () => tap(i));
    boardEl.appendChild(b);
  });

  const slotA = $("formula").querySelector('[data-slot="a"]');
  const slotOp = $("formula").querySelector('[data-slot="op"]');
  const slotB = $("formula").querySelector('[data-slot="b"]');
  slotA.textContent = sel.a !== null ? tileLabel(cells()[sel.a]) : "A";
  slotOp.textContent = sel.op !== null ? OP_SYMB[cells()[sel.op].v] : "?";
  slotB.textContent = sel.b !== null ? tileLabel(cells()[sel.b]) : "B";
  slotA.classList.toggle("filled", sel.a !== null);
  slotOp.classList.toggle("filled", sel.op !== null);
  slotB.classList.toggle("filled", sel.b !== null);

  $("undo").disabled = state.trace.length === 0;
  $("commit").disabled = true;

  renderWorlds();
  renderProgress();
  renderLevels();
  renderOverlay();
  refreshPreview();
}

function persistVictory(nxt) {
  const score = finalScore(nxt);
  save = saveNow(markCompleted(save, level.id, { score, movesLeft: nxt.movesLeft }));
  nav.finishLevel({ won: true, score, movesLeft: nxt.movesLeft });
  log({ level: level.id, kind: "completed", score, movesLeft: nxt.movesLeft, unlocked: save.unlocked.length });
}

function tap(id) {
  if (overlayOpen()) return;
  const cell = cells()[id];
  if (!cell) {
    setStatus("Case vide — rien à sélectionner.", "error");
    shakeFormula();
    return;
  }
  if (cell.kind === "op") {
    if (sel.op === id) {
      sel.op = null;
      setStatus("Opérateur retiré.", "hint");
    } else if (sel.a === id || sel.b === id) {
      setStatus("Cet opérateur est déjà un opérande (A ou B).", "error");
      shakeFormula();
      return;
    } else {
      sel.op = id;
      setStatus("Opérateur choisi.", "hint");
    }
  } else {
    if (sel.a === null) {
      sel.a = id;
      setStatus("Premier nombre choisi (A).", "hint");
    } else if (id === sel.a) {
      sel.a = null;
      if (sel.b !== null) {
        sel.a = sel.b;
        sel.b = null;
        setStatus("A retiré — B devient A.", "hint");
      } else {
        setStatus("A retiré.", "hint");
      }
    } else if (sel.b !== null && id === sel.b) {
      sel.b = null;
      setStatus("B retiré.", "hint");
    } else if (sel.b === null && id !== sel.op) {
      sel.b = id;
      setStatus("Second nombre choisi (B).", "hint");
    } else {
      setStatus("Deux nombres (A et B) déjà choisis — toucher un slot pour le remplacer.", "error");
      shakeFormula();
      return;
    }
  }
  render();
}

function commitAction() {
  if (!pv || !pv.ok) return;
  const act = pv.action;
  const before = state;
  const nxt = apply(state, act);
  if (!nxt) {
    setStatus("Transformation refusée — aucune tuile consommée.", "error");
    return;
  }
  const ca = before.board.cells[act.a];
  const cb = before.board.cells[act.b];
  const co = before.board.cells[act.op];
  const chain = pv.chainRun ? ` (chaîne ×${pv.chainRun} = +${pv.chainBonus})` : "";
  setStatus(`${ca.v} ${OP_SYMB[co.v]} ${cb.v} = ${pv.result} · +${pv.delta}${chain}`, "hint");
  log({
    level: level.id,
    kind: "action",
    action: act,
    result: pv.result,
    delta: pv.delta,
    chainRun: pv.chainRun,
    score: nxt.score,
    movesLeft: nxt.movesLeft,
    won: nxt.won,
  });
  state = nxt;
  sel = { a: null, op: null, b: null };
  pv = null;
  nav.commit(act);
  if (nxt.won) persistVictory(nxt);
  render();
}

function overlayOpen() {
  return !$("overlay").classList.contains("hidden");
}

function replayFromTrace(trace) {
  try {
    return replay(level, trace).final;
  } catch {
    return createSession(level);
  }
}

function renderOverlay() {
  const overlay = $("overlay");
  const card = $("overlay-card");
  let h2 = "";
  let ptext = "";
  let buttons = "";
  if (isWon(state)) {
    h2 = "Objectif atteint !";
    const bases = state.events.reduce((t, e) => t + e.base, 0);
    const chained = state.events.reduce((t, e) => t + e.chainBonus, 0);
    const score = finalScore(state);
    if (state.events.length) {
      ptext = `Score ${score} = ${bases} de base + ${chained} de chaînes + 10 d'objectif · coups restants ${state.movesLeft}`;
    } else {
      ptext = `Score ${score} (objectif +10) · coups restants ${state.movesLeft}`;
    }
    buttons = `<button id="ov-again">Rejouer</button>`;
    const decision = nav.decideNext();
    const targetId = decision ? decision.nextLevel : (nextLevel(level.id)?.id ?? null);
    if (targetId && (isUnlocked(save, targetId) || hasWon(save, targetId))) {
      buttons += `<button id="ov-next" class="ghost">Niveau suivant</button>`;
    }
  } else if (isLost(state)) {
    h2 = "Échec";
    ptext = "Plus de coups, objectif non atteint.";
    buttons = `<button id="ov-again">Rejouer</button>`;
  } else if (isBlocked(state)) {
    h2 = "Blocage";
    ptext = "Aucune formule valable. Le blocage n'est PAS un échec — annulez le coup ou recommencez.";
  }
  if (!h2) {
    overlay.classList.add("hidden");
    card.replaceChildren();
    return;
  }
  card.innerHTML = `<h2>${h2}</h2><p>${ptext}</p><div class="buttons">${buttons}</div>`;
  const again = card.querySelector("#ov-again");
  if (again) again.addEventListener("click", () => reset(level.id));
  const next = card.querySelector("#ov-next");
  if (next) {
    next.addEventListener("click", () => {
      const decision = nav.decideNext();
      const n = decision && decision.nextLevel ? decision.nextLevel : (nextLevel(level.id)?.id ?? null);
      if (n) switchLevel(n);
    });
  }
  overlay.classList.remove("hidden");
}

function switchLevel(id) {
  if (!isUnlocked(save, id) && !hasWon(save, id)) {
    setStatus("Niveau verrouillé — termine les niveaux précédents.", "error");
    log({ level: id, kind: "locked" });
    return;
  }
  save = loadSave();
  log({ level: id, kind: "switch" });
  activeWorld = worldOf(id);
  reset(id);
}

function reset(id) {
  level = LADDER.find((l) => l.id === id) ?? LADDER[0];
  state = createSession(level);
  nav.beginLevel(level);
  sel = { a: null, op: null, b: null };
  pv = null;
  setStatus("");
  render();
}

$("commit").addEventListener("click", commitAction);

$("clear").addEventListener("click", () => {
  sel = { a: null, op: null, b: null };
  pv = null;
  setStatus("");
  render();
});

$("formula").querySelector('[data-slot="a"]').addEventListener("click", () => {
  if (sel.a === null) return;
  sel.a = null;
  if (sel.b !== null) {
    sel.a = sel.b;
    sel.b = null;
    setStatus("A retiré — B devient A.", "hint");
  } else {
    setStatus("A retiré.", "hint");
  }
  render();
});

$("formula").querySelector('[data-slot="op"]').addEventListener("click", () => {
  if (sel.op === null) return;
  sel.op = null;
  setStatus("Opérateur retiré.", "hint");
  render();
});

$("formula").querySelector('[data-slot="b"]').addEventListener("click", () => {
  if (sel.b === null) return;
  sel.b = null;
  setStatus("B retiré.", "hint");
  render();
});

$("undo").addEventListener("click", () => {
  if (state.trace.length === 0) return;
  const undoAction = state.trace[state.trace.length - 1];
  log({ level: level.id, kind: "undo", undone: undoAction });
  state = replayFromTrace(state.trace.slice(0, -1));
  nav.undo();
  sel = { a: null, op: null, b: null };
  pv = null;
  setStatus("Coup annulé (rejoué depuis la trace).", "hint");
  render();
});

$("restart").addEventListener("click", () => {
  log({ level: level.id, kind: "restart" });
  nav.restart();
  reset(level.id);
});

nav.beginLevel(level);
render();