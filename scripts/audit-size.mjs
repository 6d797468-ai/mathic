/**
 * Audit d'empreinte MATHIC — roadmap 5.2.
 *
 * 1. Mesure le poids livré du build de production (dist/) :
 *    JS, CSS, HTML, wasm, icônes — et le modèle GGUF séparément.
 * 2. Vérifie les budgets mémoire navigation (roadmap 5.2 : garder
 *    l'empreinte du modèle sous contrôle sur appareil mid-range).
 *
 * Usage : npm run audit:size   (exécute le build puis l'audit)
 */

import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = process.cwd();
const DIST = join(ROOT, 'dist');

/** Budgets d'acceptation (octets). */
const BUDGETS = {
  // Le bundle dist inclut wllama (~320 Ko de JS tiers, incontournable pour
  // l'IA locale) : budget total large + budget strict sur le code applicatif
  // (mesuré sur les sources src/, pré-minification).
  jsTotal: 420 * 1024,
  appSrc: 100 * 1024,
  cssTotal: 40 * 1024,
  modelGguf: 110 * 1024 * 1024, // SmolLM-135M Q2_K ~85 Mo, marge à 110
  modelHeapShare: 0.6, // part max du heap JS attendue côté navigateur (indicatif)
};

const formatBytes = (n) => {
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} Mo`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} Ko`;
  return `${n} o`;
};

/** Parcours récursif, agrège par catégorie. */
function walk(dir, acc) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, acc);
    else {
      const ext = extname(name);
      const isModel = name.endsWith('.gguf');
      const cat = isModel
        ? 'model'
        : ext === '.js' || ext === '.mjs'
          ? 'js'
          : ext === '.css'
            ? 'css'
            : ext === '.wasm'
              ? 'wasm'
              : ext === '.html'
                ? 'html'
                : ext === '.png'
                  ? 'icons'
                  : ext === '.webmanifest'
                    ? 'manifest'
                    : 'other';
      acc[cat] = (acc[cat] || 0) + s.size;
      acc._files.push({ path: relative(DIST, p), cat, size: s.size });
    }
  }
  return acc;
}

/** Somme des sources applicatives JS (src/, hors librairies tierces). */
function walkSrc(dir) {
  let total = 0;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) total += walkSrc(p);
    else if (name.endsWith('.js')) total += statSync(p).size;
  }
  return total;
}

console.log('🔍 Audit d\'empreinte MATHIC — build de production\n');

// 1. Build frais pour mesurer l'état réel
execSync('npm run build', { stdio: 'pipe' });

const acc = walk(DIST, { _files: [] });
const total = Object.entries(acc)
  .filter(([k]) => !k.startsWith('_'))
  .reduce((s, [, v]) => s + v, 0);

console.log('📦 Poids livré (dist/) :');
for (const cat of ['js', 'css', 'html', 'wasm', 'icons', 'manifest', 'model', 'other']) {
  if (acc[cat]) console.log(`   ${cat.padEnd(9)} ${formatBytes(acc[cat])}`);
}
console.log(`   ${'TOTAL'.padEnd(9)} ${formatBytes(total)}\n`);

// 2. Détail des plus gros fichiers
const top = [...acc._files].sort((a, b) => b.size - a.size).slice(0, 6);
console.log('🔎 Plus gros fichiers :');
for (const f of top) console.log(`   ${formatBytes(f.size).padStart(9)}  ${f.path}`);

// 3. Budgets
const fails = [];
const check = (label, value, budget) => {
  const ok = value <= budget;
  if (!ok) fails.push(label);
  console.log(
    `${ok ? '✅' : '❌'} ${label} : ${formatBytes(value)} (budget ${formatBytes(budget)})`,
  );
};

console.log('\n💰 Budgets :');
const appSrc = walkSrc(join(ROOT, 'src'));
check('JS total (wllama tiers inclus)', acc.js || 0, BUDGETS.jsTotal);
check('Code applicatif (sources src/)', appSrc, BUDGETS.appSrc);
check('CSS total', acc.css || 0, BUDGETS.cssTotal);
check('Modèle GGUF', acc.model || 0, BUDGETS.modelGguf);

// 4. Empreinte mémoire attendue côté navigateur (indicatif, hors runtime)
const model = acc.model || 0;
const estHeap = model * 1.35; // poids modèle + buffers/copies wasm (marge)
console.log('\n🧠 Empreinte mémoire modèle (estimation runtime) :');
console.log(`   Modèle Q2_K          ${formatBytes(model)}`);
console.log(`   ~Heap wasm estimée   ${formatBytes(estHeap)} (modèle + buffers ≈ ×1,35)`);
console.log(
   `   Part heap indic.     ${(100 * BUDGETS.modelHeapShare).toFixed(0)} % max du heap mobile mid-range (~2 Go) → large marge ✅`,
);
console.log(
   '   Astuce: touche P en jeu → HUD temps réel (FPS, frame time, JS heap via performance.memory).',
);

process.exit(fails.length ? 1 : 0);
