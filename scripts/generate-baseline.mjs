#!/usr/bin/env node
/**
 * G0 — Régénérateur du manifeste de baseline forensic MATHIC V3.
 *
 * Principe (fixé par l'architecte) : le manifeste est DÉRIVÉ de l'artefact réel,
 * jamais recopié à la main. Ce script met à jour uniquement les sections
 * mesurables (commit, versions, tailles, SHA-256) et PRÉSERVE les sections
 * documentaires (debts, sourceInventory, notes d'équipe).
 *
 * Usage :
 *   node scripts/generate-baseline.mjs                     → mesure l'état HEAD courant
 *   node scripts/generate-baseline.mjs --commit <sha>      → pointe la baseline sur un commit précis
 *
 * Zéro dépendance. Ne touche à aucun fichier de code produit.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, statSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

const BASELINE_FILE = 'MATHIC-V3-BASELINE.json';
const ARTIFACTS = [
  { key: 'gguf', path: 'public/models/smollm-135m-math-v7-q2_k.gguf' },
  { key: 'wllamaWasm', path: 'public/wllama/wllama.wasm' },
];

const git = (cmd) => execSync(`git ${cmd}`, { encoding: 'utf8' }).trim();
const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');

// --- Arguments -------------------------------------------------------------
const args = process.argv.slice(2);
let commitArg = null;
const commitIdx = args.indexOf('--commit');
if (commitIdx !== -1) commitArg = args[commitIdx + 1];

// --- Préambule -------------------------------------------------------------
if (!existsSync(BASELINE_FILE)) {
  console.error(`✗ ${BASELINE_FILE} introuvable — rien à régénérer.`);
  process.exit(1);
}
const baseline = JSON.parse(readFileSync(BASELINE_FILE, 'utf8'));

// --- Commit de baseline ----------------------------------------------------
const head = git('rev-parse HEAD');
baseline.baseline.commit = commitArg ?? head;
baseline.baseline.measuredAt = new Date().toISOString();
console.log(`• commit de baseline : ${baseline.baseline.commit.slice(0, 12)}…`);
if (commitArg && commitArg !== head) {
  console.log('  (état mesuré depuis le HEAD courant, baseline pointée explicitement)');
}

// --- Versions outils + deps ------------------------------------------------
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const deps = { ...pkg.dependencies, ...pkg.devDependencies };
baseline.versions.node = process.version;
baseline.versions.npm = execSync('npm --version', { encoding: 'utf8' }).trim();
baseline.versions.vite = deps.vite ?? null;
baseline.versions.capacitor = deps['@capacitor/core'] ?? null;
baseline.versions.wllama = deps['@wllama/wllama'] ?? null;
baseline.versions.packageJsonVersion = pkg.version ?? null;
console.log(`• node ${baseline.versions.node} · npm ${baseline.versions.npm}`);

// --- Artefacts : taille + SHA-256 dérivés du fichier réel -------------------
for (const { key, path } of ARTIFACTS) {
  if (!existsSync(path)) {
    console.error(`✗ artefact manquant : ${path}`);
    process.exit(1);
  }
  const sizeBytes = statSync(path).size;
  const hash = sha256(path);
  baseline.artifacts[key] = { ...baseline.artifacts[key], path, sizeBytes, sha256: hash };
  console.log(`• ${path} → ${sizeBytes} octets · sha256 ${hash.slice(0, 16)}…`);
}

// --- Écriture (sections documentaires intactes) ----------------------------
writeFileSync(BASELINE_FILE, JSON.stringify(baseline, null, 2) + '\n');
console.log(`✓ ${BASELINE_FILE} régénéré — dettes et inventaire préservés (${baseline.debts.length} dettes).`);
