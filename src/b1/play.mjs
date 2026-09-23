import { createInterface } from "node:readline";
import { createSession, apply, enumerateActions, isBlocked, isLost, isWon, finalScore } from "./engine.mjs";
import { renderGrid } from "./board.mjs";
import { replay } from "./replay.mjs";
import { LEVELS, levelBy } from "./levels.mjs";

const scripted = process.argv[2] === "--scripts";
const levelArg = scripted ? process.argv[3] : process.argv[2];
const level = levelArg ? levelBy(levelArg) : null;

if (!level) {
  console.log("MATHIC 1.0 — slice B1 (niveaux)");
  for (const l of LEVELS) {
    console.log(`  ${l.id}  ${l.name}  → ${l.target} · ${l.maxMoves} coups · ${l.scenario}`);
  }
  console.log("\nlancer : node src/b1/play.mjs <niveau>   (ex. b1-3)");
  console.log("scripté : node src/b1/play.mjs --scripts <niveau> 'op,a,b' 'op,a,b' …");
  process.exit(0);
}

function describe(state) {
  const allowed = new Set();
  for (const c of state.board.cells) if (c !== null && c.kind === "op") allowed.add(c.v);
  return (
    `NIVEAU ${state.level.id} « ${level.name} »    OBJECTIF : ${state.level.target}    COUPS : ${state.movesLeft}/${state.level.maxMoves}    SCORE : ${state.score}\n` +
    `${renderGrid(state.board)}\n` +
    `Opérateurs autorisés (tuiles) : ${[...allowed].join(" ")} — chaque tuile opérateur est CONSOMMÉE quand utilisée`
  );
}

function parseScriptedTokens(tokens) {
  const actions = [];
  for (const t of tokens) {
    const p = t.split(",").map(Number);
    if (p.length !== 3 || !p.every(Number.isInteger)) throw new Error(`token invalide : ${t}`);
    actions.push({ a: p[1], op: p[0], b: p[2] });
  }
  return actions;
}

if (scripted) {
  const actions = parseScriptedTokens(process.argv.slice(4));
  let state = createSession(level);
  console.log("--- " + level.id + " : " + level.name);
  console.log(describe(state));
  let idx = 0;
  for (const act of actions) {
    const before = state;
    const nxt = apply(state, act);
    if (!nxt) {
      console.log(`  ✗ coup ${idx + 1} rejeté (${act.a},${act.op},${act.b}) — état inchangé`);
      continue;
    }
    const ev = nxt.events[nxt.events.length - 1];
    const ca = before.board.cells[ev.a];
    const cb = before.board.cells[ev.bCell];
    const co = before.board.cells[ev.opCell];
    console.log(`  → ${ca.v} ${co.v} ${cb.v} = ${ev.result}   [cellule ${ev.a} ancrée]   +${ev.delta}${ev.chainRun ? ` (dont chaîne +${ev.chainBonus})` : ""}`);
    state = nxt;
    console.log(describe(state));
    idx++;
  }
  if (isWon(state)) console.log(`OBJECTIF ${state.level.target} atteint ! Score final ${finalScore(state)} (dont objectif +10) · coups utilisés ${state.movesLeft}/${state.level.maxMoves}`);
  if (isLost(state)) console.log("ÉCHEC : plus de coups.");
  if (isBlocked(state)) console.log("BLOQUÉ : aucune formule valable possible — undo (revenir) ou recommencer, ce n'est PAS un échec.");
  console.log("--- fin trace");
  process.exit(0);
}

let state = createSession(level);
const rl = createInterface({ input: process.stdin, output: process.stdout });

console.log(describe(state));

function loop() {
  if (isWon(state)) {
    console.log(`OBJECTIF ${state.level.target} atteint ! Score final ${finalScore(state)} (dont objectif +10). Rejouer : 're' — quitter : 'q'.`);
    rl.question("> ", (line) => {
      const t = line.trim();
      if (t === "q") return rl.close();
      if (t === "re") {
        state = createSession(level);
        console.log("\n" + describe(state));
        return loop();
      }
      return loop();
    });
    return;
  }
  if (isLost(state)) {
    console.log(`ÉCHEC : plus de coups (objectif ${state.level.target} non atteint). Rejouer : 're' — quitter : 'q'.`);
    rl.question("> ", (line) => {
      const t = line.trim();
      if (t === "q") return rl.close();
      if (t === "re") {
        state = createSession(level);
        console.log("\n" + describe(state));
        return loop();
      }
      return loop();
    });
    return;
  }
  if (isBlocked(state)) {
    console.log("BLOQUÉ : aucune formule valable possible. Le blocage n'est PAS un échec — 'undo' ou 're' ou 'q'.");
  }
  console.log("coup : <opérateur> <A> <B> (ids de cellules) — undo | re | q | trace");
  rl.question("> ", (line) => {
    const t = line.trim();
    if (t === "q") return rl.close();
    if (t === "re") {
      state = createSession(level);
      console.log("\n" + describe(state));
      return loop();
    }
    if (t === "undo") {
      const before = state.trace.slice(0, -1);
      const r = replay(level, before).final;
      state = r;
      console.log("\n" + describe(state));
      return loop();
    }
    if (t === "trace") {
      for (const ev of state.events) {
        console.log(`  [${ev.a};${ev.opCell};${ev.b}] ${ev.a}:${ev.op} ${ev.b} = ${ev.result}  +${ev.delta}`);
      }
      return loop();
    }
    const p = t.split(/[\s,]+/).map(Number);
    if (p.length !== 3 || !p.every(Number.isInteger)) {
      console.log("  format : <opId> <cellIdA> <cellIdB>  (3 entiers, ex. '3 0 2' → la tuile op en 3 appliquée à A=0 et B=2)");
      return loop();
    }
    const act = { a: p[1], op: p[0], b: p[2] };
    const before = state;
    const nxt = apply(state, act);
    if (!nxt) {
      console.log("  ✗ coup rejeté — AUCUNE tuile consommée. (formule invalide)");
      return loop();
    }
    const ev = nxt.events[nxt.events.length - 1];
    const ca = before.board.cells[ev.a];
    const cb = before.board.cells[ev.bCell];
    const co = before.board.cells[ev.opCell];
    console.log(`→ ${ca.v} ${co.v} ${cb.v} = ${ev.result}    [résultat ancré en cellule ${ev.a}]   score +${ev.delta}${ev.chainRun ? ` (chaîne ×${ev.chainRun})` : ""}`);
    state = nxt;
    console.log("\n" + describe(state));
    console.log(`coups légaux restants : ${enumerateActions(state).length}`);
    loop();
  });
}

loop();