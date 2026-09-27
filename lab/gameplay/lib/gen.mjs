import { makeRng } from "./rng.mjs";

// Générateur de niveaux A « naïfs » : ligne aléatoire, file aléatoire, cible aléatoire.
// Utilisé UNIQUEMENT comme SONDE anti-MTH-001 : il ne doit PAS produire de contenu publiable,
// il doit RÉVÉLER la dégénérescence de la génération non certifiée.

const OPS = ["+", "-", "*", "/"];

export function genSpecA(seed) {
  const rng = makeRng(seed);
  const len = rng.int(2, 4);
  const line = [];
  for (let i = 0; i < len; i++) line.push(rng.int(1, 9));
  const nOps = rng.int(1, Math.min(3, len - 1));
  const queue = [];
  for (let i = 0; i < nOps; i++) queue.push(rng.pick(OPS));
  const target = rng.int(2, 24);
  return {
    id: `gen-${seed}`,
    line,
    queue,
    budget: nOps,
    objective: { type: "EXACT_VALUE", value: target },
    constraints: [],
    seed: `gen-${seed}`,
  };
}

export function probeGenerationA(n = 100, baseSeed = "mth-probe") {
  const tallies = { total: 0, solvable: 0, unsolvable: 0, targetPreset: 0, trivial: 0, budgetHit: 0 };
  for (let i = 0; i < n; i++) {
    const spec = genSpecA(`${baseSeed}-${i}`);
    tallies.total++;
    if (spec.line.includes(spec.objective.value)) tallies.targetPreset++;
  }
  return { tallies, note: "solvabilité/trivialité calculées dans run.mjs via le solver" };
}