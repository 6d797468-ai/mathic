/**
 * audio.js — Moteur audio de MATHIC (V2)
 *
 * 100 % synthèse via Web Audio API : aucun fichier externe, aucun asset
 * propriétaire. Chaque bruitage est généré par oscillateurs et enveloppes
 * d'atténuation — la bibliothèque reste légère et instantanément chargée.
 *
 * Résonance harmonique (combos) : le pitch des fusions monte d'un
 * demi-ton à chaque coup réussi d'affilée — ascension musicale euphorique
 * qui récompense le joueur pour chaque enchaînement.
 */

const MUTE_KEY = 'mathic_audio_muted';

/**
 * Facteur de conversion : +1 octave = x2 fréquence.
 * @param {number} semitones
 * @returns {number} multiplicateur de fréquence
 */
function semitoneRatio(semitones) {
  return Math.pow(2, semitones / 12);
}

/**
 * Crée le gestionnaire audio. Le contexte n'est créé qu'au premier geste
 * utilisateur (contrainte « autoplay » des navigateurs).
 */
export function createAudioManager() {
  /** @type {AudioContext|null} */
  let ctx = null;
  let muted = false;

  // État de muet restauré depuis la session précédente.
  try {
    muted = localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    muted = false;
  }

  function ensureCtx() {
    if (typeof window === 'undefined') return null;
    try {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        ctx = new AC();
      }
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    } catch {
      ctx = null;
    }
    return ctx;
  }

  /**
   * À appeler depuis un geste utilisateur (pointerdown / keydown / touchend /
   * clic) la première fois : débloque le contexte pour la session (politique
   * d'autoplay).
   */
  function unlock() {
    const c = ensureCtx();
    if (c && c.state === 'suspended') {
      c.resume().catch(() => {});
    }
  }

  /**
   * Note unique : un oscillateur + une enveloppe exponentielle de gain.
   * @param {object} o
   * @param {number} o.freq fréquence initiale (Hz)
   * @param {'sine'|'triangle'|'square'} [o.type]
   * @param {number} [o.dur] durée (s)
   * @param {number} [o.gain] amplitude de départ
   * @param {number} [o.delay] retard avant départ (s)
   * @param {number} [o.glideTo] glissando vers cette fréquence
   */
  function tone({ freq, type = 'sine', dur = 0.2, gain = 0.2, delay = 0, glideTo = null }) {
    if (muted) return; // silencieux dans l'état muet (pas même de planification)
    try {
      const c = ensureCtx();
      if (!c) return;

      const t0 = c.currentTime + delay;
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, t0 + dur);
      g.gain.setValueAtTime(gain, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g);
      g.connect(c.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.03);
    } catch {
      /* K6 : une défaillance audio ne doit jamais casser la boucle de jeu */
    }
  }

  /** « Pop » mat et discret : glissement d'une tuile. */
  function playMove() {
    tone({ freq: 195, type: 'triangle', dur: 0.09, gain: 0.16, glideTo: 150 });
    tone({ freq: 330, type: 'sine', dur: 0.05, gain: 0.05, delay: 0.015 });
  }

  /**
   * Fusion satisfaisante. `steps` = nombre de fusions RÉUSSIES D'AFFILÉE :
   * le pitch monte d'un demi-ton par pas → crescendo des enchaînements.
   * @param {number} [steps]
   */
  function playMerge(steps) {
    const semis = Math.max(0, (steps || 1) - 1);
    const base = 523.25 * semitoneRatio(semis); // Do5 → ascension par demi-tons
    const g = Math.min(0.34, 0.16 + semis * 0.016);
    tone({ freq: base, type: 'sine', dur: 0.26, gain: g });
    tone({ freq: base * 1.5, type: 'sine', dur: 0.15, gain: g * 0.4, delay: 0.012 });
    tone({ freq: base * 2, type: 'triangle', dur: 0.1, gain: g * 0.16, delay: 0.024 });
  }

  /**
   * Explosion d'une tuile-objectif : impact sourd + éclat lumineux.
   * Un combo (chainLength > 1) déclenche un arpège ascendant — récompense
   * amplifiée proportionnellement à la série.
   * @param {number} [chainLength]
   */
  function playExplode(chainLength) {
    tone({ freq: 140, type: 'sine', dur: 0.22, gain: 0.32, glideTo: 55 });
    tone({ freq: 880, type: 'triangle', dur: 0.13, gain: 0.15 });
    const extras = Math.min(chainLength || 1, 6);
    for (let i = 1; i <= extras; i++) {
      tone({
        freq: 660 * semitoneRatio(i),
        type: 'triangle',
        dur: 0.09,
        gain: 0.09,
        delay: i * 0.055,
      });
    }
  }

  /** Erreur / contact invalide : son sourd et bloquant, frustrant à souhait. */
  function playError() {
    tone({ freq: 120, type: 'square', dur: 0.12, gain: 0.07, glideTo: 70 });
    tone({ freq: 92, type: 'sine', dur: 0.18, gain: 0.15, delay: 0.045, glideTo: 52 });
  }

  function setMuted(value) {
    muted = !!value;
    try {
      localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
    } catch {
      /* stockage indisponible : on ignore */
    }
  }

  /** Inverse l'état de muet et renvoie le nouvel état. */
  function toggleMute() {
    setMuted(!muted);
    return muted;
  }

  function isMuted() {
    return muted;
  }

  return {
    unlock,
    playMove,
    playMerge,
    playExplode,
    playError,
    setMuted,
    toggleMute,
    isMuted,
  };
}