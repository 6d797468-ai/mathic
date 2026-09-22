/**
 * K1 — Tests du Runtime Adapter (Équipe Kali, tests/runtime/**)
 *
 * Ces tests couvrent la BRIQUE KALI uniquement : le contrat GameAdapter,
 * la forme des GameState/événements, l'orchestration du pont V3 et la
 * déterminité du mock. Aucune règle mathématique du core n'est re-testée
 * ici (elles appartiennent à lkaddafi — feuille de route §19).
 */
import assert from 'node:assert/strict';
import { createAdapter, createMockAdapter, createV3Adapter, makeEvent, makeState } from '../../src/runtime/game-adapter.js';

const DIRS = ['up', 'down', 'left', 'right'];
const OPS = ['add', 'sub', 'mul', 'div'];

// --- Contrat : forme de l'interface ---------------------------------------
{
  const a = createAdapter('mock', { seed: 7 });
  for (const m of ['start', 'move', 'undo', 'restart', 'getState', 'subscribe']) {
    assert.equal(typeof a[m], 'function', `contrat : ${m}() requis`);
  }
  console.log('ok  contrat GameAdapter : les 6 méthodes sont présentes (mock)');
  const v3 = createAdapter('v3');
  for (const m of ['start', 'move', 'undo', 'restart', 'getState', 'subscribe']) {
    assert.equal(typeof v3[m], 'function', `contrat : ${m}() requis (v3)`);
  }
  console.log('ok  contrat GameAdapter : les 6 méthodes sont présentes (v3)');
}

// --- GAME-STATE-V1 : sérialisable ------------------------------------------
{
  const a = createAdapter('mock', { seed: 11 });
  a.start();
  const s = a.getState();
  assert.equal(s.rows, 4);
  assert.equal(s.cols, 4);
  assert.equal(s.target, 24);
  const round = JSON.parse(JSON.stringify(s));
  assert.deepEqual(round, s, 'GameState : JSON round-trip sans perte');
  console.log('ok  GameState sérialisable (JSON.stringify/parse identiques)');
}

// --- Déterminisme du mock : même seed → mêmes états ------------------------
{
  const run = () => {
    const a = createAdapter('mock', { seed: 99 });
    a.start();
    for (let i = 0; i < 30; i++) a.move(DIRS[i % 4], OPS[i % 4]);
    return a.getState();
  };
  const s1 = run(), s2 = run();
  assert.deepEqual(s1, s2, 'mock : même seed → même partie');
  console.log('ok  mock déterministe : 2 sessions seedées → états identiques (30 coups)');
}

// --- Événements : séquence sur un coup --------------------------------------
{
  const a = createAdapter('mock', { seed: 5 });
  const events = [];
  const off = a.subscribe((e) => events.push(e.type));
  a.start();
  assert.equal(events[0], 'GAME_STARTED', 'premier événement = GAME_STARTED');
  let applied = 0, rejected = 0;
  for (let i = 0; i < 40 && applied < 3; i++) {
    if (a.move(DIRS[i % 4], OPS[i % 4])) applied++; else rejected++;
  }
  assert.ok(applied >= 3, 'le mock doit accepter des coups (seed 5)');
  assert.ok(events.includes('MOVE_APPLIED'), 'MOVE_APPLIED émis');
  // Invariant de cycle de vie : après chaque MOVE_APPLIED, un TILE_SPAWNED
  // clôt la séquence (MOVE_APPLIED [+ MERGE_OCCURRED] → TILE_SPAWNED), même
  // si la session ne spawn pas — le runtime clôt son animation dessus.
  const starts = events.map((t, i) => (t === 'MOVE_APPLIED' ? i : -1)).filter((i) => i >= 0);
  const bounds = [...starts, events.length];
  for (let k = 0; k < bounds.length - 1; k++) {
    const slice = events.slice(bounds[k] + 1, bounds[k + 1]);
    assert.ok(slice.includes('TILE_SPAWNED'), `MOVE_APPLIED n°${k + 1} suivi d'un TILE_SPAWNED (reçu : ${slice.join(',')})`);
  }
  assert.ok(events.some((t) => t === 'MERGE_OCCURRED' || t === 'TILE_SPAWNED'), 'événements de détail émis');
  off();
  const n = events.length;
  a.move('left', 'add');
  assert.equal(events.length, n, 'unsubscribe stoppe la réception');
  console.log(`ok  événements : séquence conforme (${applied} coups appliqués, ${rejected} rejetés, unsubscribe OK)`);
}

// --- V3 : orchestration réelle du socle --------------------------------------
{
  const a = createV3Adapter({ rows: 4, cols: 4, target: 24, initialTiles: 8 });
  a.start();
  const s0 = a.getState();
  assert.equal(s0.board.flat().filter((v) => v !== null).length, 8, 'V3 : 8 tuiles initiales');
  let applied = 0;
  const evs = [];
  a.subscribe((e) => evs.push(e));
  for (let i = 0; i < 60 && applied < 5; i++) if (a.move(DIRS[i % 4], OPS[i % 4])) applied++;
  assert.ok(applied >= 5, 'V3 : au moins 5 coups valides sur une partie fraîche');
  assert.ok(evs.some((e) => e.type === 'MOVE_APPLIED'), 'V3 : MOVE_APPLIED émis');
  const s1 = a.getState();
  assert.ok(s1.moveIndex >= applied, 'V3 : moveIndex avance');
  // Undo : restaure l'état antérieur au dernier coup (score et moveIndex)
  const sBefore = a.getState();
  assert.equal(a.undo(), true, 'V3 : undo accepté');
  const sAfter = a.getState();
  assert.equal(sAfter.moveIndex, sBefore.moveIndex - 1, 'V3 : undo décrémente moveIndex');
  assert.ok(sAfter.score <= sBefore.score, 'V3 : score restauré ≤ score avant undo');
  assert.ok(!sAfter.isGameOver, 'V3 : undo réouvre une partie finie éventuelle');
  // Undo jusqu'à vider la pile : retour exact à l'état initial
  let guard = 0;
  while (a.undo() === true && guard++ < 200) { /* dépile tout */ }
  const sEmpty = a.getState();
  assert.equal(sEmpty.moveIndex, 0, 'V3 : undo complet → moveIndex 0');
  assert.equal(sEmpty.score, s0.score, 'V3 : undo complet → score initial restauré');
  assert.equal(a.undo(), false, 'V3 : undo sur pile vide → false (MOVE_REJECTED émis)');
  console.log(`ok  V3 : ${applied} coups appliqués, undo complet restaure l'état initial (moveIndex 0, score ${sEmpty.score})`);
}

// --- makeEvent / makeState (helpers purs) ------------------------------------
{
  const e = makeEvent('MERGE_OCCURRED', { gained: 6 });
  assert.equal(e.type, 'MERGE_OCCURRED');
  assert.equal(typeof e.timestamp, 'number');
  assert.equal(e.gained, 6);
  const st = makeState({ rows: 4, cols: 4, target: 24 });
  assert.equal(st.board.length, 4);
  assert.equal(st.board[0][0], null);
  console.log('ok  helpers makeEvent/makeState purs et conformes');
}

console.log('\nK1 RUNTIME ADAPTER — tous les tests passent ✅');
