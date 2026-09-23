import { createSession, apply, evaluate, isWon, isLost, isBlocked, finalScore } from "../engine.mjs";
import { replay } from "../replay.mjs";
import { LEVELS } from "../levels.mjs";

const OP_SYMB = { "+": "+", "-": "−", "*": "×", "/": "÷" };

const $ = (id) => document.getElementById(id);

let level = LEVELS[0];
let state = createSession(level);
let sel = { op: null, a: null, b: null };

const boardEl = $("board");

function log(entry) {
  console.log("B1|" + JSON.stringify({ ts: Date.now(), ...entry }));
}

function cells() {
  return state.board.cells;
}

function tileLabel(cell) {
  return cell.kind === "op" ? OP_SYMB[cell.v] ?? cell.v : String(cell.v);
}

function render() {
  $("lv").textContent = level.id;
  $("name").textContent = level.name;
  $("scenario").textContent = level.scenario;
  $("target").textContent = level.target;
  $("moves").textContent = state.movesLeft;
  $("score").textContent = state.score;
  $("chain").textContent = state.nextChain;

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

  $("formula").querySelector('[data-slot="op"]').textContent = sel.op !== null ? OP_SYMB[cells()[sel.op].v] : "?";
  $("formula").querySelector('[data-slot="a"]').textContent = sel.a !== null ? String(cells()[sel.a].v) : "A";
  $("formula").querySelector('[data-slot="b"]').textContent = sel.b !== null ? String(cells()[sel.b].v) : "B";
  $("formula").querySelector('[data-slot="op"]').classList.toggle("filled", sel.op !== null);
  $("formula").querySelector('[data-slot="a"]').classList.toggle("filled", sel.a !== null);
  $("formula").querySelector('[data-slot="b"]').classList.toggle("filled", sel.b !== null);

  $("undo").disabled = state.trace.length === 0;

  renderLevels();
  renderOverlay();
}

function renderLevels() {
  $("levels").replaceChildren();
  for (const l of LEVELS) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = l.id.replace("b1-", "");
    if (l.id === level.id) b.classList.add("current");
    b.addEventListener("click", () => switchLevel(l.id));
    $("levels").appendChild(b);
  }
}

function setStatus(text, kind = "") {
  const el = $("status");
  el.textContent = text;
  el.className = "status " + kind;
}

function tap(id) {
  if (overlayOpen()) return;
  const cell = cells()[id];
  if (!cell) return;
  if (cell.kind === "op") {
    sel.op = id;
  } else if (cell.kind === "num") {
    if (sel.a === null) {
      if (sel.op === id) return;
      sel.a = id;
    } else if (sel.b === null && sel.a !== id && sel.op !== id) {
      sel.b = id;
    } else {
      return;
    }
  }
  render();
  maybeApply();
}

function maybeApply() {
  const { op, a, b } = sel;
  if (op === null || a === null || b === null) return;
  if (a === b) {
    setStatus("Il faut deux nombres distincts (A et B).", "hint");
    return;
  }
  const action = { a, op, b };
  const ev = evaluate(state, action);
  if (!ev.ok) {
    sel = { op: null, a: null, b: null };
    setStatus("Rejeté — aucune tuile consommée : " + ev.reason + ".", "error");
    render();
    return;
  }
  const before = state;
  const nxt = apply(state, action);
  const ca = before.board.cells[ev.a];
  const cb = before.board.cells[ev.bCell];
  const co = before.board.cells[ev.opCell];
  const chain = ev.chainRun ? ` (chaîne ×${ev.chainRun} = +${ev.chainBonus})` : "";
  log({ level: level.id, action, result: ev.result, delta: ev.delta, chainRun: ev.chainRun,
    score: nxt.score, movesLeft: nxt.movesLeft, won: nxt.won });
  setStatus(`${ca.v} ${OP_SYMB[co.v]} ${cb.v} = ${ev.result}  ·  +${ev.delta}${chain}`, "hint");
  state = nxt;
  sel = { op: null, a: null, b: null };
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
    ptext = `Score final ${finalScore(state)} (dont objectif +10) · coups restants ${state.movesLeft}`;
    buttons = `<button id="ov-again">Rejouer</button>`;
    if (LEVELS[LEVELS.findIndex((l) => l.id === level.id) + 1]) {
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
  if (again) again.addEventListener("click", () => { reset(level.id); });
  const next = card.querySelector("#ov-next");
  if (next) {
    next.addEventListener("click", () => {
      const i = LEVELS.findIndex((l) => l.id === level.id);
      switchLevel(LEVELS[i + 1].id);
    });
  }
  overlay.classList.remove("hidden");
}

function switchLevel(id) {
  log({ level: id, action: "switch" });
  reset(id);
}

function reset(id) {
  level = LEVELS.find((l) => l.id === id) ?? LEVELS[0];
  state = createSession(level);
  sel = { op: null, a: null, b: null };
  setStatus("");
  render();
}

$("clear").addEventListener("click", () => {
  sel = { op: null, a: null, b: null };
  setStatus("");
  render();
});

$("undo").addEventListener("click", () => {
  if (state.trace.length === 0) return;
  const undoAction = state.trace[state.trace.length - 1];
  log({ level: level.id, action: "undo", undone: undoAction });
  state = replayFromTrace(state.trace.slice(0, -1));
  sel = { op: null, a: null, b: null };
  setStatus("");
  render();
});

$("restart").addEventListener("click", () => {
  log({ level: level.id, action: "restart" });
  reset(level.id);
});

render();