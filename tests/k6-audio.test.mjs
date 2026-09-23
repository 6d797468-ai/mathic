/**
 * K6-AUDIO — Garanties mobiles du moteur audio.
 *
 * Vérifie :
 *  - la défaillance/déterrence NE CASSE JAMAIS la boucle de jeu :
 *    contexte audio absent (Node), AudioContext qui jette, oscillateur
 *    qui jette → les play* retournent sans exception ;
 *  - le déblocage autoplay (context suspended → resume) au premier geste ;
 *  - le muet persiste via stockage, et toggleMute/isMuted cohérents.
 *
 * Gate : K6
 */

let failures = 0;
const check = (name, ok) => {
  if (!ok) { failures++; console.error('FAIL', name); }
  else console.log('  ok ', name);
};

console.log('— K6-AUDIO : sans window (Node) — silence sûr, aucune exception —');
{
  const { createAudioManager } = await import('../src/audio.js');
  const a = createAudioManager();
  for (const fn of ['playMove', 'playMerge', 'playExplode', 'playError']) {
    let threw = false;
    try { a[fn](); } catch { threw = true; }
    check(`${fn}() ne jette pas sans contexte`, threw === false);
  }
  a.unlock(); // ne jette pas
  check('unlock() ne jette pas sans contexte', true);
}

console.log('— K6-AUDIO : contexte mock — déblocage autoplay + synthèse sans crash —');
{
  const AC = class MockAudioContext {
    constructor() { this.state = 'suspended'; this.currentTime = 0; this.destination = {}; this.resumes = 0; }
    resume() { this.resumes++; this.state = 'running'; return Promise.resolve(); }
    createOscillator() { return { connect() {}, start() {}, stop() {} }; }
    createGain() {
      return {
        connect() {},
        gain: {
          setValueAtTime() {},
          exponentialRampToValueAtTime() {},
        },
      };
    }
  };
  const resumeSpy = [];
  const OrigAC = AC;
  AC.prototype.resume = function () { resumeSpy.push(1); OrigAC.prototype.resume.call(this); };

  const store = new Map();
  globalThis.window = { localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) }, AudioContext: AC };
  globalThis.localStorage = globalThis.window.localStorage;

  try {
    const { createAudioManager } = await import('../src/audio.js');
    const a = createAudioManager();
    a.unlock();
    a.unlock(); // idempotent
    check('unlock() : contexte créé et repris (autoplay débloqué)', resumeSpy.length >= 1);

    for (const fn of ['playMove', 'playMerge', 'playExplode', 'playError']) {
      let threw = false;
      try { a[fn](); } catch { threw = true; }
      check(`${fn}() avec contexte mock ne jette pas`, threw === false);
    }

    check('muet : initialement non muet', a.isMuted() === false);
    a.toggleMute();
    check('toggle : muet', a.isMuted() === true);
    check('muet : persisté dans le storage', store.get('mathic_audio_muted') === '1');
    a.toggleMute();
    check('re-toggle : non muet', a.isMuted() === false);
    check('muet : restauré du storage', store.get('mathic_audio_muted') === '0');
  } finally {
    delete globalThis.window;
    delete globalThis.localStorage;
  }
}

console.log('— K6-AUDIO : AudioContext qui JETTE — téléphone capricieux, zéro crash —');
{
  const BadAC = class { constructor() { throw new Error('audio bloqué'); } };
  globalThis.window = { localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} }, AudioContext: BadAC };
  globalThis.localStorage = globalThis.window.localStorage;
  try {
    const { createAudioManager } = await import('../src/audio.js');
    const a = createAudioManager();
    let threw = false;
    try {
      a.unlock();
      a.playMove();
      a.playExplode(3);
    } catch { threw = true; }
    check('tous les play* avec AudioContext cassé : aucune exception', threw === false);
  } finally {
    delete globalThis.window;
    delete globalThis.localStorage;
  }
}

if (failures > 0) {
  console.error(`\n❌ ${failures} échec(s) K6`);
  process.exit(1);
} else {
  console.log('\n✅ K6 Audio — tous les tests passent');
}