import { createInterface } from "node:readline";
import { appendFileSync } from "node:fs";
import { createSession, apply, evaluate, isBlocked, isLost, isWon, finalScore } from "./engine.mjs";
import { replay } from "./replay.mjs";
import { LEVELS, levelBy } from "./levels.mjs";
import { describe } from "./render.mjs";

const levelId = process.argv[2] ?? "";
const outIndex = process.argv.indexOf("--out");
const logFile = outIndex >= 0 ? process.argv[outIndex + 1] : null;
const level = levelBy(levelId);
if (!level) {
  console.error(`observation : niveau inconnu '${levelId}'. B1 = ${LEVELS.map((l) => l.id).join(", ")}`);
  console.error("usage : node src/b1/observe.mjs <niveau> [--out <fichier.jsonl>]");
  process.exit(1);
}

const t0 = process.hrtime.bigint();
const ts = () => Number(process.hrtime.bigint() - t0) / 1e6;

function log(kind, data) {
  const row = { level: level.id, tms: Math.round(ts()), kind, ...data };
  const line = JSON.stringify(row);
  console.log(`[obs] ${String(row.tms).padStart(8)}ms ${kind} ${format(row)}`);
  if (logFile) appendFileSync(logFile, line + "\n");
}

function format(row) {
  if (row.kind === "action") return `${row.expr} = ${row.result}  a+${row.delta}  T${row.chain ? `+${row.chain}` : "0"}`;
  if (row.kind === "reject") return `rejeté ${row.expr} (${row.reason})`;
  if (row.kind === "input") return row.cmd;
  if (row.kind === "end") return row.msg;
  return JSON.stringify(row);
}

let state = createSession(level);
log("level", { target: level.target, maxMoves: level.maxMoves });
console.log(describe(level, state));

const rl = createInterface({ input: process.stdin, output: process.stdout });
const stats = { inputs: 0, applied: 0, rejected: 0, undos: 0, restarts: 0, firstMoveMs: null, waited: 0, lastInputMs: null };
let firstApplied = false;

function loop() {
  if (isWon(state)) {
    log("end", { msg: `OBJECTIF ${level.target} atteint — score final ${finalScore(state)}`, won: true, score: finalScore(state), movesLeft: state.movesLeft });
    log("summary", toSummary());
    return rl.close();
  }
  if (isLost(state)) {
    log("end", { msg: `ÉCHEC — plus de coups (objectif ${level.target})`, won: false, movesLeft: 0 });
    log("summary", toSummary());
    return rl.close();
  }
  if (isBlocked(state)) log("blocked", { msg: "aucune formule valable possible (bloqué ≠ échec)" });
  rl.question("> ", (line) => {
    const t = line.trim();
    stats.inputs++;
    if (stats.lastInputMs !== null) stats.waited += Math.round(ts()) - stats.lastInputMs;
    stats.lastInputMs = Math.round(ts());
    log("input", { cmd: t });
    if (t === "q") {
      log("end", { msg: "abandon du niveau", won: false, score: state.score, movesLeft: state.movesLeft });
      return rl.close();
    }
    if (t === "re") {
      stats.restarts++;
      state = createSession(level);
      log("restart", {});
      console.log(describe(level, state));
      return loop();
    }
    if (t === "undo") {
      const r = replay(level, state.trace.slice(0, -1)).final;
      stats.undos++;
      state = r;
      log("undo", { movesLeft: state.movesLeft });
      console.log(describe(level, state));
      return loop();
    }
    if (t === "trace") {
      for (const ev of state.events) console.log(`  [${ev.a};${ev.opCell};${ev.b}] ${ev.a}:${ev.op} ${ev.b} = ${ev.result}  +${ev.delta}`);
      return loop();
    }
    const p = t.split(/[\s,]+/).map(Number);
    if (p.length !== 3 || !p.every(Number.isInteger)) {
      log("badinput", { msg: "format <opId> <cellIdA> <cellIdB>" });
      return loop();
    }
    const before = state;
    const nxt = apply(state, { a: p[1], op: p[0], b: p[2] });
    if (!nxt) {
      stats.rejected++;
      const ev = evaluate(before, { a: p[1], op: p[0], b: p[2] });
      const expr = `${before.board.cells[p[1]]?.v ?? "?"} ${before.board.cells[p[0]]?.v ?? "?"} ${before.board.cells[p[2]]?.v ?? "?"}`;
      log("reject", { expr, reason: ev.reason ?? "référence invalide" });
      return loop();
    }
    const ev = nxt.events[nxt.events.length - 1];
    const expr = `${before.board.cells[ev.a].v} ${ev.op} ${before.board.cells[ev.bCell].v}`;
    if (!firstApplied) {
      stats.firstMoveMs = Math.round(ts());
      firstApplied = true;
    }
    stats.applied++;
    log("action", { expr, a: ev.a, anchor: ev.a, b: ev.bCell, result: ev.result, delta: ev.delta, chain: ev.chainRun, base: ev.base });
    state = nxt;
    console.log(describe(level, state));
    loop();
  });
}

function toSummary() {
  return {
    level: level.id,
    applied: stats.applied,
    inputs: stats.inputs,
    rejected: stats.rejected,
    undos: stats.undos,
    restarts: stats.restarts,
    firstMoveMs: stats.firstMoveMs,
    totalActiveMs: Math.round(ts()),
    waitingMs: stats.waited,
    won: isWon(state),
    finalScore: isWon(state) ? finalScore(state) : state.score,
  };
}

loop();