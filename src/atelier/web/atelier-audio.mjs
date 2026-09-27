// ============================================================================
// M23.1 — ATLAS AUDIO · Son Ambient de l'Atelier Astral
// ----------------------------------------------------------------------------
// 100 % Web Audio API : aucun asset fichier. Chaque son est un oscillateur +
// enveloppe, généré synthétiquement. Inspiré du thème narratif de
// Mathic-Univers-2.txt : plume sur parchemin, cliquetis d'engrenages,
// bourdonnement électrique, corde tendue.
//
// Principe : createAtelierAudio() → gestionnaire injecté dans atelier.js.
// Le contexte audio n'est créé qu'au premier geste utilisateur (autoplay).
// Aucun hasard, aucune horloge, aucune I/O — sons déterministes.
// ============================================================================

const MUTE_KEY = "mathic_atelier_audio_muted";

function semitoneRatio(semitones) {
  return Math.pow(2, semitones / 12);
}

function whiteNoise(buffer, duration, gainNode, ctx, startTime) {
  const sampleRate = ctx.sampleRate;
  const length = sampleRate * duration;
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = (Math.random() * 2 - 1) * 0.5;
  }
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  noise.connect(gainNode);
  noise.start(startTime);
  noise.stop(startTime + duration);
}

export function createAtelierAudio() {
  let ctx = null;
  let muted = false;

  try {
    muted = window.localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    muted = false;
  }

  function ensureCtx() {
    if (typeof window === "undefined") return null;
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    return ctx;
  }

  function unlock() {
    const c = ensureCtx();
    if (c && c.state === "suspended") {
      c.resume().catch(() => {});
    }
  }

  function tone({ freq, type = "sine", dur = 0.15, gain = 0.12, delay = 0, glideTo = null }) {
    if (muted) return;
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
  }

  function noise({ freq = 200, dur = 0.1, gain = 0.15, delay = 0, filterFreq = 200 }) {
    if (muted) return;
    const c = ensureCtx();
    if (!c) return;

    const t0 = c.currentTime + delay;
    const buffer = c.createBuffer(1, c.sampleRate * dur, c.sampleRate);
    whiteNoise(buffer, dur, c.createGain(), c, t0);
    const noiseSrc = c.createBufferSource();
    noiseSrc.buffer = buffer;
    const filter = c.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(filterFreq, t0);
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    noiseSrc.connect(filter);
    filter.connect(g);
    g.connect(c.destination);
    noiseSrc.start(t0);
    noiseSrc.stop(t0 + dur);
  }

  function chord(notes, dur = 0.4, gain = 0.1) {
    if (muted) return;
    const c = ensureCtx();
    if (!c) return;
    const t0 = c.currentTime;
    for (const n of notes) {
      const osc = c.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(n, t0);
      const g = c.createGain();
      g.gain.setValueAtTime(gain / notes.length, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g);
      g.connect(c.destination);
      osc.start(t0);
      osc.stop(t0 + dur);
    }
  }

  // ---- Sons narratifs de l'Atelier ----

  function playPlace() {
    tone({ freq: 880, type: "triangle", dur: 0.06, gain: 0.1, glideTo: 660 });
    tone({ freq: 1200, type: "sine", dur: 0.04, gain: 0.05, delay: 0.02 });
  }

  function playReject() {
    noise({ dur: 0.08, gain: 0.12, filterFreq: 1800 });
    tone({ freq: 300, type: "square", dur: 0.1, gain: 0.08, delay: 0.03, glideTo: 150 });
  }

  function playForge() {
    tone({ freq: 110, type: "sawtooth", dur: 0.3, gain: 0.18, glideTo: 880 });
    tone({ freq: 220, type: "sine", dur: 0.2, gain: 0.1, delay: 0.05 });
    tone({ freq: 440, type: "triangle", dur: 0.15, gain: 0.08, delay: 0.1 });
  }

  function playOculus() {
    const c = ensureCtx();
    if (!c || muted) return;
    const t0 = c.currentTime;
    const filter = c.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(200, t0);
    filter.frequency.exponentialRampToValueAtTime(2000, t0 + 0.3);
    const osc = c.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(660, t0);
    osc.frequency.exponentialRampToValueAtTime(880, t0 + 0.2);
    const g = c.createGain();
    g.gain.setValueAtTime(0.1, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.3);
    osc.connect(filter);
    filter.connect(g);
    g.connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + 0.3);
  }

  function playSeal() {
    const notes = [523.25, 659.25, 783.99];
    chord(notes, 0.3, 0.1);
    for (let i = 0; i < notes.length; i++) {
      tone({ freq: notes[i], type: "sine", dur: 0.2, gain: 0.08, delay: i * 0.1 });
    }
  }

  function playRewind() {
    const c = ensureCtx();
    if (!c || muted) return;
    const t0 = c.currentTime;
    const buffer = c.createBuffer(1, c.sampleRate * 0.2, c.sampleRate);
    whiteNoise(buffer, 0.2, c.createGain(), c, t0);
    const src = c.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = 0.5;
    const filter = c.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.setValueAtTime(400, t0);
    filter.frequency.exponentialRampToValueAtTime(800, t0 + 0.15);
    const g = c.createGain();
    g.gain.setValueAtTime(0.12, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.2);
    src.connect(filter);
    filter.connect(g);
    g.connect(c.destination);
    src.start(t0);
    src.stop(t0 + 0.2);
  }

  function playVictory() {
    chord([523.25, 659.25, 783.99, 1046.5], 1.0, 0.15);
  }

  function setMuted(value) {
    muted = !!value;
    try {
      window.localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
    } catch {}
  }

  function isMuted() {
    return muted;
  }

  function toggleMute() {
    setMuted(!muted);
    return muted;
  }

  return {
    unlock,
    playPlace,
    playReject,
    playForge,
    playOculus,
    playSeal,
    playRewind,
    playVictory,
    setMuted,
    toggleMute,
    isMuted,
  };
}
