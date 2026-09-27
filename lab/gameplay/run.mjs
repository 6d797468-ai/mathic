import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runAll, g0Verdicts, overallVerdict, r2 } from "./lib/compare.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WANT_WRITE = process.argv.includes("--write");

const { rowsA, rowsA2, rowsB, probe } = runAll({ probeN: 100 });

function table(rows, extra) {
  const lines = [];
  const head = `| id | ${extra ? extra + " | " : ""}solvable | minMoves | nbSols | branching | deadEnd% | decision% | divMinSeq |`;
  lines.push(head, head.replace(/[^|]/g, "-"));
  for (const r of rows) {
    lines.push(
      `| ${r.id} | ${r.title || ""} | ${r.solvable ? "✓" : "✗"} | ${r.minMoves ?? "∞"} | ${r.numSolutions}${r.budgeted ? "~" : ""} | ${r.branchingAvg} | ${Math.round(r.deadEndRate * 100)} | ${Math.round(r.decisionRatio * 100)} | ${r.solutionDiversity} |`
    );
  }
  return lines.join("\n");
}

function aggTable(g1, g2, g3) {
  const keys = ["nTotal", "nSolvable", "branchingMean", "branchingMedian", "numSolutionsMean", "numSolutionsMedian", "diversityMean", "diversityMedian", "trivialCount", "multiCount", "reasoningCount", "deadEndMean", "decisionMean"];
  const pad = Math.max(...keys.map((k) => k.length));
  const out = [`| métrique (${" ".repeat(pad - 9)}) | A v1 | A v2 | B |`];
  out.push(`|${"-".repeat(pad + 2)}|-----|-----|---|`);
  for (const k of keys) {
    out.push(`| ${k.padEnd(pad)} | ${typeof g1[k] === "number" ? r2(g1[k]) : g1[k]} | ${typeof g2[k] === "number" ? r2(g2[k]) : g2[k]} | ${typeof g3[k] === "number" ? r2(g3[k]) : g3[k]} |`);
  }
  return out.join("\n");
}

function buildReport() {
  const sections = [];
  sections.push("# GATE 1 — Gameplay Laboratory : A vs B (rapport complet, passe de retest A-v2 incluse)\n");
  sections.push("> Question : les nouvelles règles produisent-elles de MEILLEURES DÉCISIONS que V4 ?\n");
  sections.push("## Concept A — Chaînes (v1 · curation serrée)\n");
  sections.push(table(rowsA));
  sections.push("\n## Concept A — Chaînes (v2 · curation desserrée — retest design)\n");
  sections.push(table(rowsA2));
  sections.push("\n## Concept B — Grille croisée\n");
  sections.push(table(rowsB));
  sections.push("\n## Évolution de curation A : v1 → v2 (retest §7)\n");
  const a = g0s(rowsA);
  const a2 = g0s(rowsA2);
  const b = g0s(rowsB);
  sections.push(aggTable(a, a2, b));
  sections.push("\n## Aggrégats A vs B vs V4 (baseline audité · branching 14,6 qualitativement faible)\n");
  sections.push("> `~` = comptage borné par budget de recherche (valeur au minimum). B `(sum)` = refus arithmétique immédiat (grille tout-`+` à total incohérent). V4 : baseline de l'audit (branching 14,6 majoritairement équivalent, min dégénéré MTH-001).\n");
  const b2 = { ...b, nTotal: "—", nSolvable: "—", branchingMean: "14.60 (V4)", branchingMedian: "—", numSolutionsMean: "n/a", numSolutionsMedian: "—", diversityMean: "—", diversityMedian: "—", trivialCount: "0 (mais min dégénéré)", multiCount: "—", reasoningCount: "0 (audit)", deadEndMean: "—", decisionMean: "—" };
  sections.push(aggTable(a, a2, b2));
  sections.push("\n## Sonde anti-MTH-001 (génération naïve, 100 specs seedées)\n");
  sections.push(`- total : ${probe.total}\n- résolvables : ${probe.solvable}/${probe.total}\n- non résolvables : ${probe.unsolvable}\n- cible préexistante (dégénérescence fallback) : ${probe.targetPreset}\n- solutions min ≤ 1 : ${probe.trivial}`);
  sections.push("\n**Lecture** : la génération naïve produit des niveaux dégénérés/triviaux/impossibles ; donc TOUTE génération dynamique V5 doit passer par un certificateur (solver) — MTH-001 traité par design.\n");
  sections.push("\n## Verdicts GAMEPLAY-G0\n");
  const vv = g0Verdicts(a, b, probe);
  for (const key of Object.keys(vv)) {
    const v = vv[key];
    sections.push(`- **${v.id} ${v.grade}** — ${v.evidence}`);
  }
  sections.push("\n## Décision GATE 1\n");
  const ov = overallVerdict(a, b);
  sections.push(`**${ov.text}** (score G0 A=${ov.sa}/8, B=${ov.sb}/8)`);
  sections.push(""); 
  sections.push(`**Retest design A (v2) · preuves** : branch ${r2(a2.branchingMean)} (v1 ${r2(a.branchingMean)}), décision ${r2(a2.decisionMean)} (v1 ${r2(a.decisionMean)}), ≥2 solutions ${a2.multiCount}/10 (v1 ${a.multiCount}/10), profondeur solution max ${Math.max(...rowsA2.map((r) => r.minMoves ?? 0))}. Conclusion : la curation desserrée double la multiplicité et améliore la densité de décision sans atteindre B ; viabilité de A en mode secondaire, B reste chef de file pour Phase 6.`);
  return sections.join("\n");
}

function g0s(rows) {
  const solvable = rows.filter((r) => r.solvable);
  if (!solvable.length) return { nTotal: rows.length, nSolvable: 0, branchingMean: 0, branchingMedian: 0, numSolutionsMean: 0, numSolutionsMedian: 0, diversityMean: 0, diversityMedian: 0, trivialCount: 0, multiCount: 0, reasoningCount: 0, deadEndMean: 0, decisionMean: 0 };
  const mm = (f) => {
    const xs = solvable.map(f);
    const s = [...xs].sort((x, y) => x - y);
    return s.length ? s[Math.floor(s.length / 2)] : 0;
  };
  return {
    nTotal: rows.length,
    nSolvable: solvable.length,
    branchingMean: r2(mean(solvable.map((r) => r.branchingAvg))),
    branchingMedian: r2(mm((r) => r.branchingAvg)),
    numSolutionsMean: r2(mean(solvable.map((r) => r.numSolutions))),
    numSolutionsMedian: r2(mm((r) => r.numSolutions)),
    diversityMean: r2(mean(solvable.map((r) => r.solutionDiversity))),
    diversityMedian: r2(mm((r) => r.solutionDiversity)),
    trivialCount: solvable.filter((r) => r.trivial || r.minOneSolution).length,
    multiCount: solvable.filter((r) => r.numSolutions >= 2).length,
    reasoningCount: solvable.filter((r) => (r.minMoves ?? 0) >= 2 && r.decisionRatio > 0).length,
    deadEndMean: r2(mean(solvable.map((r) => r.deadEndRate))),
    decisionMean: r2(mean(solvable.map((r) => r.decisionRatio))),
  };
}

function mean(xs) {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

const report = buildReport();
console.log(report);

if (WANT_WRITE) {
  const dir = join(__dirname, "reports");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "g0-report.md");
  writeFileSync(path, report + "\n");
  console.log(`\n[écrit] ${path}`);
}