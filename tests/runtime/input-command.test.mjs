/**
 * K3 — Tests Input → GameCommand (Équipe Kali, tests/runtime/**)
 *
 * Vérifie que input.js ne produit QUE des commandes nommées (POJO), sans
 * calcul mathématique, et que l'API historique onDirection reste compatible.
 */
import assert from 'node:assert/strict';
import { detectSwipe, createInputSource } from '../../src/input.js';

// --- detectSwipe (pur, inchangé) -------------------------------------------
{
  const C = { x: 0, y: 0 };
  assert.equal(detectSwipe(C, { x: 60, y: 0 }), 'right');
  assert.equal(detectSwipe(C, { x: -60, y: 0 }), 'left');
  assert.equal(detectSwipe(C, { x: 0, y: 60 }), 'down');
  assert.equal(detectSwipe(C, { x: 0, y: -60 }), 'up');
  assert.equal(detectSwipe(C, { x: 5, y: 5 }), null, 'sous le seuil → tap, pas un swipe');
  assert.equal(detectSwipe(C, { x: 40, y: 35 }), 'right', 'axe dominant tranche');
  console.log('ok  detectSwipe : 4 directions + seuil + axe dominant');
}

// --- Source injectable sans DOM → GameCommand purs ---------------------------
{
  const src = createInputSource(); // pas de window → source factice
  const cmds = [];
  const handle = src.onCommand((c) => cmds.push(c));
  handle.fire('up');
  handle.fire('left');
  assert.deepEqual(cmds, [
    { type: 'MOVE', dir: 'up', op: null },
    { type: 'MOVE', dir: 'left', op: null },
  ], 'commandes POJO { type, dir, op:null } — aucun calcul métier');
  console.log('ok  onCommand émet des GameCommand purs (op:null, décision côté session)');
}

// --- Compat onDirection (ancien contrat V3) ----------------------------------
{
  const src = createInputSource();
  const dirs = [];
  const handle = src.onDirection((d) => dirs.push(d));
  handle.fire('right');
  assert.deepEqual(dirs, ['right']);
  console.log('ok  onDirection : compat V3 conservée');
}

// --- Source factice : détachement sans effet résiduel -------------------------
{
  const src = createInputSource();
  const handle = src.onCommand(() => {});
  handle.detach();
  handle.fire('up'); // ne doit rien casser
  console.log('ok  detach() inoffensif sur la source factice');
}

console.log('\nK3 INPUT → GAMECOMMAND — tous les tests passent ✅');
