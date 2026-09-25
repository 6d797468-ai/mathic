// ============================================================================
// M17 — GRIMOIRE · Cœur pur de la boucle joueur
// ----------------------------------------------------------------------------
// Rôle (contrat MATHIC-1-0-GRIMOIRE-INTEGRATION.md) : rendre cohérente la
// boucle OUVRIR → CHOISIR → JOUER → ÉVÉNEMENTS → RÉSOLUTION → RÉCOMPENSE →
// PROGRESSION → NIVEAU SUIVANT — sans ajouter la moindre puissance au noyau.
//
// Le Grimoire est un LECTEUR de progression/savoir et un MONTEUR de sessions.
// Il ne connaît aucun moteur en interne : uniquement les SEAMS injectées
// (forme commune createSession / apply / isTerminal / finalize). Toute
// transition d'état reste une transition moteur ; toute écriture de
// persistence reste déléguée aux modules dédiés (save, knowledge).
//
// PUR : aucun DOM, aucun générateur d'aléa, aucune horloge, aucun réseau,
// aucun accès direct au stockage navigateur (backends injectés). F(G, I) = F(G, I).
// ============================================================================

// ---------------------------------------------------------------------------
// Machine de boucle — écrans (narratif UI ; le moteur ne les connaît pas)
// ---------------------------------------------------------------------------

export const GRIMOIRE_SCREENS = Object.freeze([
  "CLOSED",   // le Grimoire n'est pas ouvert
  "INDEX",    // sommaire : niveaux + états (verrouillé/jouable/maîtrisé)
  "PLAYING",  // session montée, coups en cours
  "RESOLVED", // session terminée (gagnée) — récompense consultable
  "FAILED",   // session terminée (perdue) — rejouable
]);

// ---------------------------------------------------------------------------
// Fabrique du Grimoire — les trois dépendances sont injectées :
//   engines     : { [engineName]: seam } — montage/jeu/terminalité par moteur
//   progression : façade mathic.save.v1 (lecture + délégation markCompleted)
//   knowledge   : seam mathic.knowledge.v1 (optionnelle — la boucle reste
//                 jouable sans savoir, jamais l'inverse)
// ---------------------------------------------------------------------------

export function createGrimoire({ engines, progression, knowledge = null }) {
  if (!engines || typeof engines !== "object" || Object.keys(engines).length === 0) {
    throw new TypeError("grimoire : au moins un moteur (seam) requis");
  }
  if (!progression || typeof progression.read !== "function") {
    throw new TypeError("grimoire : façade progression requise");
  }
  for (const [name, seam] of Object.entries(engines)) {
    if (!seam || typeof seam.mount !== "function" || typeof seam.apply !== "function" || typeof seam.isTerminal !== "function") {
      throw new TypeError(`grimoire : seam moteur '${name}' incomplète (mount/apply/isTerminal requis)`);
    }
  }

  let st = initialState();

  function initialState() {
    return { screen: "CLOSED", sessionId: 0, engine: null, levelId: null, session: null, terminal: null, loop: [], knowledgeQueue: [], rewarded: false };
  }

  function emit(type, extra = {}) {
    st.loop.push({ t: type, ...extra });
  }

  // --- Ouverture / fermeture -------------------------------------------------

  function open() {
    if (st.screen !== "CLOSED") return view();
    st.screen = "INDEX";
    emit("GRIMOIRE_OPENED");
    return view();
  }

  function close() {
    st = initialState();
    return view();
  }

  // --- INDEX : lecture pure du catalogue + progression -----------------------

  function listLevels() {
    const out = [];
    for (const [engineName, seam] of Object.entries(engines)) {
      for (const entry of seam.catalog()) {
        out.push({
          engine: engineName,
          id: entry.id,
          title: entry.title ?? entry.id,
          playable: entry.playable ?? true,
          state: levelState(engineName, entry),
        });
      }
    }
    return out;
  }

  function levelState(engineName, entry) {
    if (engineName !== "b1") return "OPEN"; // le lab (V5/cycle) n'est pas verrouillé
    if (progression.hasWon(entry.id)) return "MASTERED";
    if (progression.isUnlocked(entry.id)) return "OPEN";
    return "LOCKED";
  }

  function levelEntry(engine, id) {
    const seam = engines[engine];
    if (!seam) return null;
    const entry = seam.catalog().find((e) => e.id === id);
    if (!entry) return null;
    return { engine, id: entry.id, title: entry.title ?? entry.id, playable: entry.playable ?? true, state: levelState(engine, entry) };
  }

  function canPlay(engine, id) {
    const entry = levelEntry(engine, id);
    return Boolean(entry && (entry.playable ?? true) && entry.state !== "LOCKED");
  }

  // --- JOUER : montage d'une session par la seam du moteur -------------------

  function start(engine, id) {
    const seam = engines[engine];
    if (!seam) return { ok: false, reason: "ENGINE_UNKNOWN" };
    if (st.screen !== "INDEX" && st.screen !== "RESOLVED" && st.screen !== "FAILED") {
      return { ok: false, reason: "CLOSED_OR_BUSY" };
    }
    const entry = seam.catalog().find((e) => e.id === id);
    if (!entry) return { ok: false, reason: "LEVEL_UNKNOWN" };
    if (entry.playable === false) return { ok: false, reason: "LEVEL_NOT_PLAYABLE" };
    if (engine === "b1" && !progression.isUnlocked(id)) return { ok: false, reason: "LEVEL_LOCKED" };

    const mounted = seam.mount(entry);
    if (!mounted || !mounted.session) return { ok: false, reason: "MOUNT_FAILED" };

    st.sessionId += 1;
    st.engine = engine;
    st.levelId = id;
    st.session = mounted.session;
    st.terminal = null;
    st.rewarded = false;
    st.screen = "PLAYING";
    emit("LEVEL_STARTED", { levelId: id, engine });
    return { ok: true, status: status() };
  }

  // --- Coups : la seam applique, le Grimoire n'invente aucune règle ----------

  function legalMoves() {
    if (st.screen !== "PLAYING") return [];
    return engines[st.engine].legal(st.session);
  }

  function play(move) {
    if (st.screen !== "PLAYING") return { ok: false, reason: "NOT_PLAYING" };
    const seam = engines[st.engine];
    const next = seam.apply(st.session, move);
    if (!next) {
      emit("MOVE_REJECTED", { levelId: st.levelId });
      return { ok: false, reason: "MOVE_ILLEGAL", status: status() };
    }
    st.session = next;
    if (seam.isTerminal(st.session)) {
      const outcome = seam.outcome(st.session);
      st.terminal = { outcome, finalScore: seam.finalize ? seam.finalize(st.session) : null };
      st.screen = outcome === "WON" ? "RESOLVED" : "FAILED";
      emit(outcome === "WON" ? "CHALLENGE_COMPLETED" : "LEVEL_FAILED", {
        levelId: st.levelId,
        engine: st.engine,
        finalScore: st.terminal.finalScore,
      });
    } else {
      emit("MOVE_APPLIED", { levelId: st.levelId });
    }
    return { ok: true, status: status() };
  }

  function status() {
    if (st.screen !== "PLAYING" && st.screen !== "RESOLVED" && st.screen !== "FAILED") {
      return { screen: st.screen, levelId: st.levelId };
    }
    const seam = engines[st.engine];
    return {
      screen: st.screen,
      engine: st.engine,
      levelId: st.levelId,
      sessionId: st.sessionId,
      session: seam.expose ? seam.expose(st.session) : st.session,
      terminal: st.terminal,
    };
  }

  // --- RÉCOMPENSE : délégation pure, aucun calcul de règle ici ---------------

  function reward() {
    if (st.screen !== "RESOLVED") return { ok: false, reason: "NOT_RESOLVED" };
    if (st.rewarded) return { ok: false, reason: "ALREADY_REWARDED" }; // idempotent : une récompense par session
    st.rewarded = true;
    const seam = engines[st.engine];

    // b1 (campagne) → progression (mathic.save.v1) via markCompleted délégué.
    // v5/cycle (lab) → savoir (mathic.knowledge.v1) via la seam knowledge.
    const delegate = seam.finalizeProgression;
    const effects = typeof delegate === "function" ? delegate(st.session, st.levelId, st.terminal) : { progression: null, knowledge: null };
    if (effects && effects.progression) emit("PROGRESSION_ADVANCED", { levelId: st.levelId, unlocked: effects.progression.unlocked ?? null });
    if (effects && effects.knowledge) for (const obs of effects.knowledge) st.knowledgeQueue.push(obs);

    return {
      ok: true,
      won: st.terminal.outcome === "WON",
      finalScore: st.terminal.finalScore,
      progression: effects?.progression ?? null,
      next: seam.nextLevel ? seam.nextLevel(st.levelId) : null,
    };
  }

  // --- PROGRESSION : avance au niveau suivant (b1 uniquement) ----------------

  function next() {
    if (st.screen !== "RESOLVED") return { ok: false, reason: "NOT_RESOLVED" };
    const seam = engines[st.engine];
    if (typeof seam.nextLevel !== "function") return { ok: false, reason: "NO_LADDER" };
    const nxt = seam.nextLevel(st.levelId);
    if (!nxt) return { ok: false, reason: "END_OF_LADDER" };
    if (!progression.isUnlocked(nxt.id)) return { ok: false, reason: "NEXT_LOCKED" };
    const r = start(st.engine, nxt.id);
    if (r.ok) emit("LEVEL_ADVANCED", { levelId: nxt.id });
    return r;
  }

  // --- Événements de boucle (source d'évidence pour le savoir) ---------------

  function takeEvents() {
    const out = st.loop;
    st.loop = [];
    return out;
  }

  // Savoir : file d'attente → flush explicite (async côté store, jamais ici).
  // Les événements CHALLENGE_COMPLETED nourrissent mathic.knowledge.v1 —
  // la PROGRESSION (mathic.save.v1) n'est jamais écrite par ce chemin.
  function queueKnowledge(obs) {
    st.knowledgeQueue.push(obs);
  }

  async function flushKnowledge() {
    if (!knowledge || st.knowledgeQueue.length === 0) {
      return { flushed: 0, newlyUnlocked: [], noop: true };
    }
    const sequence = st.knowledgeQueue.splice(0);
    const res = await knowledge.recordAll({ sequence });
    return { flushed: sequence.length, newlyUnlocked: res.newlyUnlocked, noop: res.noop };
  }

  // --- Snapshot / restore (reload-safe, JSON-able) ----------------------------

  function snapshot() {
    return {
      v: 1,
      screen: st.screen,
      sessionId: st.sessionId,
      engine: st.engine,
      levelId: st.levelId,
      session: st.session,
      terminal: st.terminal,
      loop: st.loop,
      knowledgeQueue: st.knowledgeQueue,
      rewarded: st.rewarded,
    };
  }

  function restore(snap) {
    if (!snap || snap.v !== 1 || !GRIMOIRE_SCREENS.includes(snap.screen)) {
      return { ok: false, reason: "SNAPSHOT_INVALID" };
    }
    if (snap.engine && !engines[snap.engine]) return { ok: false, reason: "SNAPSHOT_ENGINE_UNKNOWN" };
    st = {
      v: 1,
      screen: snap.screen,
      sessionId: snap.sessionId ?? 0,
      engine: snap.engine ?? null,
      levelId: snap.levelId ?? null,
      session: snap.session ?? null,
      terminal: snap.terminal ?? null,
      loop: Array.isArray(snap.loop) ? snap.loop : [],
      knowledgeQueue: Array.isArray(snap.knowledgeQueue) ? snap.knowledgeQueue : [],
      rewarded: Boolean(snap.rewarded),
    };
    return { ok: true };
  }

  function view() {
    return { screen: st.screen, levelId: st.levelId, engine: st.engine, sessionId: st.sessionId };
  }

  return {
    open, close,
    listLevels, levelEntry, canPlay,
    start, legalMoves, play, status,
    reward, next,
    takeEvents, queueKnowledge, flushKnowledge,
    snapshot, restore,
    readSavoir: () => (knowledge && knowledge.listFragments ? knowledge.listFragments() : []),
    readPersistence: () => (knowledge ? { mode: knowledge.mode, key: knowledge.key } : { mode: "none", key: null }),
  };
}
