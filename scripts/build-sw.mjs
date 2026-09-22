/**
 * scripts/build-sw.mjs
 *
 * Génère dist/sw.js à partir de public/sw.template.js en remplaçant
 * __SW_VERSION__ par une valeur concrète et inspectable :
 *
 *   mathic-v4-<commit>-<distHash>
 *
 * Ce script est appelé APRÈS `vite build` (qui produit dist/).
 * Il ne modifie jamais le fichier source public/sw.template.js.
 *
 * Règle absolue : `grep "const VERSION" dist/sw.js` doit toujours retourner
 * une valeur concrète, jamais '__SW_VERSION__'.
 *
 * Gate : G0.5.1
 *
 * Usage :
 *   node scripts/build-sw.mjs
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { resolve, join } from 'path';
import { execSync } from 'child_process';
import { createHash } from 'crypto';

const TEMPLATE_PATH = resolve('public/sw.template.js');
const OUTPUT_PATH   = resolve('dist/sw.js');
const ASSETS_DIR    = resolve('dist/assets');

// --- Commit court -----------------------------------------------------------

let commit = 'unknown';
try {
  commit = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
} catch {
  // En CI sans git, utiliser la variable d'environnement si disponible.
  commit = process.env.GITHUB_SHA?.slice(0, 7) ?? 'unknown';
}

// --- Hash du build (fingerprint du contenu de dist/assets/) ----------------

let distHash = 'nohash';
try {
  const files = readdirSync(ASSETS_DIR)
    .sort()
    .map((f) => readFileSync(join(ASSETS_DIR, f)));
  distHash = createHash('md5')
    .update(Buffer.concat(files))
    .digest('hex')
    .slice(0, 8);
} catch {
  // dist/assets/ inexistant (build minimal) : on utilise juste le commit.
}

// --- Injection de la version ------------------------------------------------

const VERSION = `mathic-v4-${commit}-${distHash}`;
const template = readFileSync(TEMPLATE_PATH, 'utf8');

if (!template.includes('__SW_VERSION__')) {
  console.error('[build-sw] ERREUR : __SW_VERSION__ introuvable dans sw.template.js');
  process.exit(1);
}

const output = template.replace(/__SW_VERSION__/g, VERSION);
writeFileSync(OUTPUT_PATH, output, 'utf8');

// --- Vérification obligatoire post-écriture --------------------------------

const written = readFileSync(OUTPUT_PATH, 'utf8');
if (written.includes('__SW_VERSION__')) {
  console.error('[build-sw] ERREUR : __SW_VERSION__ toujours présent dans dist/sw.js !');
  process.exit(1);
}

const versionLine = written.split('\n').find((l) => l.trim().startsWith('const VERSION ='));
console.log(`[build-sw] ✅ dist/sw.js généré`);
console.log(`[build-sw]    ${versionLine?.trim()}`);
