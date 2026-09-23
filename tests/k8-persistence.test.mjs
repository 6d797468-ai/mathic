/**
 * K8-PERSIST — Empreinte de la persistance de session
 * (jouer → fermer → rouvrir → continuer).
 *
 * Vérifie :
 *  - l'aller-retour SNAPSHOT → RESTORE (classic et puzzle) préserve
 *    board/score/jauge/position du flux game, sans re-générateur ;
 *  - la CONTINUITÉ : après reprise, la partie se poursuit À L'IDENTIQUE
 *    d'une session fraîche même seed (le stream game est re-dérivé) ;
 *  - le module persistence.js : bascule version, corruption, stockage
 *    indisponible, ok.
 *
 * Gate : K8
 */

import { createGame } from '../src/game.js';
import { createPersistence } from '../src/persistence.js';

let failures = 0;
const check = (name, ok) => {
  if (!ok) { failures++; console.error('FAIL', name); }
  else console.log('  ok ', name);
};
const deepEq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const seq1 = [['right', 'add'], ['down', 'mul'], ['left', 'sub'], ['right', 'div']];
const seq2 = [['down', 'add'], ['up', 'mul'], ['right', 'sub'], ['left', 'add']];

console.log('— K8-PERSIST : aller-retour classic (board/score/jauge/position) —');
{
  const g = createGame({ rows: 4, cols: 4 });
  g.newClassic({ seed: 'k8-cls' });
  for (const [d, o] of seq1) g.move(d, o);
  const snap = g.getSnapshot();
  check('snapshot : mode classic + seed conservés', snap.mode === 'classic' && snap.seed === 'k8-cls');
  check('snapshot : compteurs de présentation sérialisés', Number.isInteger(snap.classicBonus) && Number.isInteger(snap.targetCount));

  const g2 = createGame({ rows: 4, cols: 4 });
  g2.restoreSnapshot(snap);
  check('restore : board moteur identique', deepEq(g2.engineBoard, g.engineBoard));
  check('restore : score affiché identique', g2.score === g.score);
  check('restore : moveIndex identique', g2.moveIndex === g.moveIndex);
  check('restore : movesLeft (classic = 0)', g2.movesLeft === g.movesLeft);
  check('restore : mode classic', g2.mode === 'classic');
}

console.log('— K8-PERSIST : continuité après reprise (dérivation exacte du flux game) —');
{
  // Fresh : seed X, seq1 puis seq2 (jamais de snapshot).
  const fresh = createGame({ rows: 4, cols: 4 });
  fresh.newClassic({ seed: 'k8-cont' });
  for (const [d, o] of seq1) fresh.move(d, o);
  for (const [d, o] of seq2) fresh.move(d, o);

  // Repris : seq1, snapshot, restore (adapter neuf), puis seq2.
  const a = createGame({ rows: 4, cols: 4 });
  a.newClassic({ seed: 'k8-cont' });
  for (const [d, o] of seq1) a.move(d, o);
  const snapA = a.getSnapshot();
  const b = createGame({ rows: 4, cols: 4 });
  b.restoreSnapshot(snapA);
  check('reprise : partie reprise au point exact de la sauvegarde', deepEq(b.engineBoard, a.engineBoard));
  for (const [d, o] of seq2) b.move(d, o);

  check('continuité : la partie reprise finit À L\'IDENTIQUE de la fraîche',
        deepEq(b.engineBoard, fresh.engineBoard) && b.score === fresh.score && b.moveIndex === fresh.moveIndex);
}

console.log('— K8-PERSIST : aller-retour puzzle (jauge budget/restante) —');
{
  const g = createGame({ rows: 4, cols: 4 });
  g.newPuzzle({ seed: 'k8-pz', target: 42, moves: 4 });
  const played = [];
  for (const [d, o] of seq1) {
    const r = g.move(d, o);
    if (r.moved) played.push([d, o]);
    if (g.victory || g.movesLeft <= 0) break;
  }
  // NB : en puzzle, state.moves démarre à generated.moves (budget) puis
  // croît de 1 par coup appliqué → jauge restante = budget − coups.
  check('puzzle : jauge consommée avant save', g.moveIndex - g.puzzleMoves === played.length && g.movesLeft === g.puzzleMoves - played.length);
  const snap = g.getSnapshot();
  const g2 = createGame({ rows: 4, cols: 4 });
  g2.restoreSnapshot(snap);
  check('restore puzzle : board identique', deepEq(g2.engineBoard, g.engineBoard));
  check('restore puzzle : jauge restante identique', g2.movesLeft === g.movesLeft && g2.puzzleMoves === g.puzzleMoves);
  check('restore puzzle : score identique', g2.score === g.score);
}

console.log('— K8-PERSIST : module persistence.js (version, corruption, storage) —');
{
  const store = new Map();
  const storage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
  };
  const p = createPersistence({ storage });

  const g = createGame({ rows: 4, cols: 4 });
  g.newClassic({ seed: 'k8-mod' });
  for (const [d, o] of seq1) g.move(d, o);

  check('save : persisté', p.save(g) === true);
  check('has : détecte la sauvegarde', p.has() === true);
  const loaded = p.load();
  check('load : snapshot exploitable (v + state)', loaded && loaded.v === 1 && loaded.state && loaded.state.rows === 4);

  const g2 = createGame({ rows: 4, cols: 4 });
  g2.restoreSnapshot(loaded);
  check('load → restore : board identique', deepEq(g2.engineBoard, g.engineBoard));

  // Corruption
  store.set('mathic_session_v1', '{pasJson');
  check('corruption → load() null', p.load() === null && p.has() === false);

  // Version incompatible
  store.set('mathic_session_v1', JSON.stringify({ v: 99, state: { rows: 4 } }));
  check('version inconnue → load() null', p.load() === null);
  check('restore version inconnue → throw', (() => { try { g2.restoreSnapshot({ v: 99, state: { rows: 4 } }); return false; } catch { return true; } })());

  // Storage indisponible → callbacks sûrs
  const dead = createPersistence({ storage: { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); }, removeItem() { throw new Error('x'); } } });
  check('storage mort → save() false sans crash', dead.save(g) === false);
  check('storage mort → load() null sans crash', dead.load() === null && dead.has() === false);
  dead.clear();
  check('storage mort → clear() sans crash', true);

  p.clear();
  check('clear : sauvegarde retirée', p.has() === false);
}

if (failures > 0) {
  console.error(`\n❌ ${failures} échec(s) K8`);
  process.exit(1);
} else {
  console.log('\n✅ K8 Persistence — tous les tests passent');
}