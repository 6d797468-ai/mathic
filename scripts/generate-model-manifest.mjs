/**
 * scripts/generate-model-manifest.mjs
 *
 * Génère public/models/manifest.json à partir de l'artefact GGUF réel.
 *
 * Règle : aucune taille ni hash n'est jamais hardcodé dans le code source.
 * Toutes les valeurs sont calculées depuis le fichier physique.
 *
 * Usage :
 *   node scripts/generate-model-manifest.mjs
 *
 * Peut aussi être invoqué en mode CI avec le chemin du modèle en argument :
 *   node scripts/generate-model-manifest.mjs /path/to/model.gguf
 *
 * Gate : G0.2
 */

import { createHash } from 'crypto';
import { readFileSync, writeFileSync, statSync, existsSync } from 'fs';
import { resolve, basename } from 'path';

const MODEL_PATH = resolve(
  process.argv[2] ?? 'public/models/smollm-135m-math-v7-q2_k.gguf'
);

const MANIFEST_PATH = resolve('public/models/manifest.json');

// --- Vérification de présence -----------------------------------------------

if (!existsSync(MODEL_PATH)) {
  console.error(`[generate-model-manifest] Modèle introuvable : ${MODEL_PATH}`);
  console.error('  Si le GGUF est absent en local, générez le manifest depuis CI');
  console.error('  avec le fichier téléchargé, ou conservez le manifest versionné.');
  process.exit(1);
}

// --- Calcul des valeurs depuis l'artefact -----------------------------------

console.log(`[generate-model-manifest] Lecture de ${MODEL_PATH} …`);

const stat = statSync(MODEL_PATH);
const size = stat.size;

console.log(`  Taille : ${size.toLocaleString('fr-FR')} bytes`);
console.log('  SHA-256 en cours de calcul …');

const buf = readFileSync(MODEL_PATH);
const sha256 = createHash('sha256').update(buf).digest('hex');

console.log(`  SHA-256 : ${sha256}`);

// --- Génération du manifest -------------------------------------------------

const manifest = {
  model: basename(MODEL_PATH),
  size,           // dérivé depuis l'artefact réel — jamais hardcodé
  sha256,         // dérivé depuis l'artefact réel — jamais hardcodé
  version: '1',
  generated: new Date().toISOString(),
};

writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');

console.log(`[generate-model-manifest] Manifest écrit : ${MANIFEST_PATH}`);
console.log(JSON.stringify(manifest, null, 2));
