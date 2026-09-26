import { createInterface } from "node:readline";
import { createSession, isSolved, getMoves, apply, replay } from "./engine.mjs";

const SPECS = {
  sum2x2: {
    grid: [
      [-1, -1],
      [-1, -1],
    ],
    rows: [{ ops: ["+"], target: 5 }, { ops: ["+"], target: 7 }],
    cols: [{ ops: ["+"], target: 4 }, { ops: ["+"], target: 8 }],
    reserve: { 2: 2, 3: 1, 5: 1 },
  },
  mixed2x2: {
    grid: [
      [-1, -1],
      [-1, -1],
    ],
    rows: [{ ops: ["*"], target: 10 }, { ops: ["-"], target: 4 }],
    cols: [{ ops: ["+"], target: 9 }, { ops: ["+"], target: 8 }],
    reserve: { 2: 1, 3: 1, 5: 1, 7: 1 },
  },
};

const name = process.argv[2] ?? "mixed2x2";
const spec = SPECS[name];
if (!spec) {
  console.error(`spec inconnue '${name}'. Attendues : ${Object.keys(SPECS).join(", ")}`);
  process.exit(1);
}

let s = createSession(spec);
const rl = createInterface({ input: process.stdin, output: process.stdout });

function render(state) {
  const nR = state.spec.grid.length;
  const nC = state.spec.grid[0].length;
  console.log("\n  grille");
  for (let r = 0; r < nR; r++) {
    const cells = [];
    for (let c = 0; c < nC; c++) {
      const v = state.grid[r][c];
      cells.push(v === -1 ? "·" : String(v).padStart(2));
    }
    const { ops, target } = state.spec.rows[r];
    console.log(`  ${cells.join("  ")}   → ${ops.join(" ")} = ${target}`);
  }
  console.log("  colonnes");
  for (let c = 0; c < nC; c++) {
    const { ops, target } = state.spec.cols[c];
    console.log(`  col${c}: ${ops.join(" ")} = ${target}`);
  }
  const res = Object.entries(state.reserve).filter(([, n]) => n > 0).map(([v, n]) => `${v}×${n}`).join("  ");
  console.log(`  réserve : ${res}`);
}

render(s);
loop();

function loop() {
  if (isSolved(s)) {
    console.log("  RÉSOLU ✅ — contraintes lignes et colonnes toutes vérifiées.");
    return rl.close();
  }
  const legal = getMoves(s);
  console.log(`  ${legal.length} coups légaux (ex: '2 0 1' = poser 2 en (0,1), 'b' = revenir, 'q' = quitter)`);
  rl.question("  coup : ", (line) => {
    const t = line.trim();
    if (t === "q") return rl.close();
    if (t === "b") {
      const before = s.events.slice(0, -1);
      const states = replay(spec, before);
      s = states.length ? states[states.length - 1] : createSession(spec);
      render(s);
      return loop();
    }
    const p = t.split(/\s+/).map(Number);
    if (p.length < 3 || !p.every(Number.isInteger)) {
      console.log("  format : <valeur> <rang> <col>");
      return rl.close();
    }
    const [v, r, c] = p;
    const n = apply(s, { id: "PLACE", v, r, c });
    if (!n) {
      console.log("  coup illégal (case occupée, quantité épuisée).");
      return rl.close();
    }
    s = n;
    render(s);
    loop();
  });
}