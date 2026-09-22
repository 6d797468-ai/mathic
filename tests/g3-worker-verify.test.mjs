/**
 * G3 — Worker Adapter (vérification structurelle)
 *
 * Vérifie que solver.worker.js existe et exporte les bons handlers.
 * Usage : node tests/g3-worker-verify.test.mjs
 */

import { existsSync, readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const workerPath = resolve(__dirname, '..', 'src', 'levels', 'solver.worker.js');

let failures = 0;
function check(name, cond) {
  if (cond) {
    console.log(`  ok  ${name}`);
  } else {
    failures++;
    console.error(`FAIL  ${name}`);
  }
}

console.log('— G3-WORKER : solver.worker.js —');
check('solver.worker.js existe', existsSync(workerPath));

// Lit le fichier et vérifie qu'il importe les 3 fonctions du solver.
const content = readFileSync(workerPath, 'utf8');
check('worker importe solveLevel', content.includes('solveLevel'));
check('worker importe certificateLevel', content.includes('certificateLevel'));
check('worker importe verifyCertificate', content.includes('verifyCertificate'));
check('worker a un handler onmessage', content.includes('onmessage'));
check('worker gère le type "solve"', content.includes("'solve'"));
check('worker gère le type "certificate"', content.includes("'certificate'"));
check('worker gère le type "verify"', content.includes("'verify'"));

if (failures > 0) {
  console.error(`\n❌ ${failures} échec(s)`);
  process.exit(1);
} else {
  console.log('\n✅ G3 Worker Adapter — structure validée');
}