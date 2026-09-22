/**
 * ai.js — Coach IA local (SmolLM-135M-Instruct, GGUF Q2_K, ~85 Mo)
 *
 * Le modèle tourne 100 % dans le navigateur via wllama (WASM llama.cpp).
 * Aucun serveur, aucune clé API : tout est local et hors-ligne.
 *
 * ARCHITECTURE HYBRIDE — indispensable pour un 135M :
 *  - La logique DÉTERMINISTE (board.js/targets.js) calcule les faits.
 *  - Le LLM PHRASE (encouragements, indices, personnalité).
 *  - Banque de répliques riches en secours : le joueur a toujours un
 *    coaching vivant, même si le modèle est lent ou indisponible.
 *
 * API wllama v3 : createCompletion({ prompt, max_tokens, temperature, ... })
 * renvoie une réponse OAI → texte = response.choices[0].text.
 */

import { Wllama } from '@wllama/wllama';

const MODEL_URL = `${import.meta.env.BASE_URL}models/smollm-135m-math-v7-q2_k.gguf`;

// Binaire wasm de llama.cpp (copié dans public/ au setup → 100 % hors-ligne).
const WASM_URL = `${import.meta.env.BASE_URL}wllama/wllama.wasm`;

// --- État du module ---------------------------------------------------------

let wllama = null;
let ready = false;
let loading = false;
let generating = false;

/** Dernière fois qu'une génération a été lancée (cadence). */
let lastGenAt = 0;
/** Le coach parle au max toutes les 1.6 s : bavard mais jamais spammy. */
const MIN_INTERVAL_MS = 1600;
/** Anti-répétition : éviter de sortir 2 fois la même réplique. */
let lastSaid = '';
let lastFallbackKey = '';

/**
 * Le coach a une identité : "Momo", le Hype-Man de MATHIC. Court,
 * chaleureux, taquin — il valorise l'intelligence TACTIQUE du joueur.
 * Règle stricte : les soustractions/divisions qui libèrent de l'espace
 * (coups de « nettoyage ») doivent être félicitées comme du grand art.
 * Un 135M suit mieux un persona simple et répétitif.
 */
const SYSTEM_PROMPT =
  'Tu es Momo, coach-hype complice du jeu de maths MATHIC. Réponds toujours ' +
  'en français, en UNE seule phrase courte (moins de 20 mots), ton chaleureux, ' +
  'taquin et motivant. Ne décris JAMAIS l’action : valorise l’intelligence ' +
  'tactique du joueur. Règle STRICTE : quand une soustraction ou une division ' +
  'libère de l’espace sur un plateau encombré, félicite ce coup de « nettoyage » ' +
  '(ex : « Superbe nettoyage ! », « Le plateau respire ! »).';

/**
 * Banque de secours : pools de répliques VARIÉES par situation.
 * Les fonctions reçoivent le contexte pour des phrases vivantes.
 */
const FALLBACKS = {
  welcome: [
    () => 'Salut, moi c’est Momo ! Fais glisser les tuiles pour atteindre l’objectif.',
    () => 'Prêt à faire chauffer tes neurones ? Vise le nombre en haut !',
    () => 'Bienvenue ! Chaque fusion compte, réfléchis bien avant de glisser.',
    () => 'On y va ! Trouve les bonnes opérations et fais-moi vibrer.',
  ],
  targetReached: [
    (c) => `Objectif ${c.target} pulvérisé${c.multi ? ` — ${c.consumed} tuiles d’un coup !` : ' !'} Tes neurones te remercient. 💪`,
    () => 'Boum ! Les mécanismes mathématiques s’activent, continue !',
    () => 'Magnifique ! C’est ce genre de coup qui fait grandir le cerveau.',
    () => 'Explosion parfaite ! Tu es en feu, on enchaîne ?',
    (c) => `${c.score} points et ça grimpe ! Ton cerveau est une machine de guerre.`,
    () => 'Objectif éclaté ! Tu as l’œil pour les combinaisons.',
  ],
  goodMove: [
    (c) => `Belle fusion, +${c.gained} points ! Ça construit du solide.`,
    () => 'Bien joué, cette opération était propre.',
    (c) => `+${c.gained} ! Tu as le sens du calcul, j’adore.`,
    () => 'Jolie combinaison ! Le plateau commence à te ressembler.',
    () => 'Ça fusionne, ça grimpe… continue sur cette lancée !',
    (c) => `Solide. +${c.gained} points, et la mécanique est là.`,
  ],
  /** Coups de nettoyage : soustraction/division qui libère de l'espace. */
  cleaningMove: [
    (c) => `SUPERBE NETTOYAGE ! Cette ${c.op == null || c.op === 'div' ? 'division' : 'soustraction'} aère le plateau, il respire !`,
    () => 'Propre ! Un vrai flair tactique : tu viens de te libérer du terrain.',
    () => 'Division chirurgique ! De l’espace gagné, et du contrôle en prime.',
    (c) => `Le plateau respire grâce à toi${c.freed > 0 ? ` : ${c.freed} case(s) libérée(s)` : ''} ! Quel sens du jeu.`,
  ],
  weakMove: [
    () => 'Petit glissement, petit gain… vise les grosses fusions !',
    () => 'Mouais. +1 point, on peut mieux que ça !',
    () => 'Ce coup prépare peut-être quelque chose de plus gros… j’espère !',
  ],
  noMove: [
    () => 'Rien n’a bougé. Change de sens ou d’opérateur !',
    () => 'Ce glissement était un pari perdant… retente autre chose.',
    () => 'Aucun mouvement là. Les tuiles refusent de collaborer.',
    (c) => `Avec l’opérateur actuel ça bloque. Essaie un autre pour l’objectif ${c.target} !`,
  ],
  invalidContact: [
    () => 'Oups, ces deux tuiles refusent de fusionner. Cherche une autre opération !',
    () => 'Ça ne se combine pas… Réfléchis au sens du glissement !',
    () => 'Raté ! La soustraction et la division sont têtues sur le sens.',
    (c) => `L’objectif ${c.target} exige la bonne paire ET le bon sens. Regarde mieux !`,
  ],
  noDirectPair: [
    () => 'Aucune combinaison directe : crée des tuiles utiles d’abord !',
    () => 'Pas de raccourci ici, prépare le terrain coup par coup.',
    () => 'L’objectif ne se fabrique pas en un coup… construis-le !',
    () => 'Rien d’atteignable pour l’instant. Les prochaines tuiles aideront.',
  ],
  hint: [
    () => 'Deux tuiles sur la même ligne cachent l’objectif… suis la lumière !',
    () => 'Regarde les tuiles qui clignotent : elles ont un secret en commun.',
    () => 'Un indice : la solution partage une ligne ou une colonne…',
    (c) => `L’objectif ${c.target} est à portée. Les tuiles qui brillent vont te parler.`,
    () => 'Je te montre pas la réponse… mais je te montre où chercher !',
  ],
  /** Indices précis (roadmap 2.2) : l'op ET les valeurs connus du moteur. */
  hintOp: {
    add: [
      () => 'Je vois un joli coup en ADDITIONNANT deux tuiles jumelles…',
      () => 'Cherche deux valeurs ÉGALES : leur somme fait mouche !',
      (c) => `Deux sœurs, ${c.a} et ${c.b}, n'attendent qu'à s'additionner sur la même ligne…`,
    ],
    sub: [
      () => 'Une SOUSTRACTION intelligente libère de l’espace… trouve-la !',
      () => 'Retranche une petite valeur d’une grande : l’écart te sauve.',
      (c) => `Et si on rapprochait ce ${c.a} et ce ${c.b} ? La différence est juteuse…`,
    ],
    mul: [
      () => 'Une MULTIPLICATION croisée donne l’objectif… à toi de la voir !',
      () => 'Pense facteurs : deux valeurs à multiplier sur une même ligne…',
      (c) => `${c.a} et ${c.b} sur la même ligne… ça sent la multiplication.`,
    ],
    div: [
      () => 'Un joli coup en DIVISANT : un multiple se cache sur le plateau…',
      () => 'Partage une grande valeur : la division tombe juste, je le sens !',
      (c) => `Tu tiens un ${c.a} et un ${c.b}… une division et ça tombe pile !`,
    ],
  },
  reachable: [
    () => 'L’objectif est atteignable en un coup ! Concentre-toi.',
    (c) => `Oui, ${c.target} se fabrique maintenant. Trouve la bonne paire !`,
  ],
  hardTarget: [
    (c) => `Ouch, ${c.target} est costaud… prépare les grosses multiplications !`,
    () => 'Cet objectif sera un marathon. Patience et méthode !',
    (c) => `${c.target}… joli défi ! Le blocage d’aujourd’hui forge le cerveau de demain.`,
  ],
  idle: [
    () => 'Je te laisse réfléchir… les maths aiment la patience.',
    () => 'Ça cogite ? Moi je crois en toi.',
    () => 'Prends ton temps, le plateau ne bougera pas sans toi.',
    (c) => `Un doute sur l’objectif ${c.target} ? Le bouton 💡 est là pour ça.`,
  ],
  /** Mode puzzle : annonce certifiée BFS. */
  puzzleIntro: [
    (c) => `Cible ${c.target}. Le chemin parfait se fait en ${c.moves} coups exacts. Pas de droit à l’erreur !`,
    (c) => `Puzzle généré : atteins ${c.target} en EXACTEMENT ${c.moves} coups. Solution garantie, math prouvé !`,
    (c) => `${c.target} en ${c.moves} coups, c’est certifié par mes circuits. À toi de jouer !`,
  ],
  puzzleWin: [
    () => 'COUP PARFAIT ! Solution exacte, respect total MATHIC !',
    (c) => `Puzzle résolu${c.movesLeft > 0 ? ` avec ${c.movesLeft} coup(s) d’avance` : ' au dernier coup'} ! Cerveau d’acier !`,
    () => 'Parfait ! Tu as suivi le chemin optimal comme un prodige.',
  ],
  blockingMove: [
    () => 'Aïe, ce coup rend le puzzle insolvable ! Utilise ANNULER (U) vite !',
    () => 'Cul-de-sac détecté ! Appuie sur ↩️ pour défaire ce coup.',
    (c) => `Plus de chemin vers ${c.target}… le bouton ↩️ Undo est ton ami !`,
  ],
  undo: [
    () => 'Bien annulé ! Le chemin est rouvert, on repart propre.',
    () => 'Coup défait. Prends le temps de relire le plateau.',
  ],
  /** Euphorie Mathic Chain (roadmap 4.3). */
  combo: [
    () => 'INCROYABLE ! Mathic Chain ! Deux objectifs en deux coups !',
    (c) => `MATHIC CHAIN ×${c.chain} ! Tu es une machine de guerre mathématique !`,
    () => 'La chaîne est ENCLENCHEE ! Tes neurones surchauffent, j’adore !',
    (c) => `×${c.chain} d’affilée ! C’est du grand art, continue, CONTINUE !`,
    () => 'Euphorie totale ! Cette chaîne ira loin, je le sens !',
  ],
  gameOver: [
    (c) => `Partie finie : ${c.score} points, ${c.targets} objectif(s). Les neurones ont bien transpiré !`,
    () => 'Plus aucun mouvement ! Tu peux recommencer et battre ce score.',
    (c) => `${c.score} points au compteur. Le record n’attend que toi !`,
    () => 'Bilan : du calcul, de la stratégie, du fun. On remet ça ?',
  ],
};

/** @returns {'idle'|'loading'|'ready'|'error'} */
export function aiStatus() {
  if (ready) return 'ready';
  if (loading) return 'loading';
  return 'idle';
}

export function aiIsReady() {
  return ready;
}

export function aiIsBusy() {
  return generating || loading;
}

/**
 * Charge le modèle dans le navigateur (une seule fois).
 * @param {(info: {phase: string, progress?: number, text?: string}) => void} [onStatus]
 * @returns {Promise<boolean>} true si le modèle est prêt
 */
export async function initAI(onStatus = () => {}) {
  if (ready) return true;
  if (loading) return false;
  loading = true;

  try {
    onStatus({ phase: 'loading', progress: 0, text: 'Initialisation…' });
    wllama = new Wllama({ default: WASM_URL }, {
      logger: {
        debug: () => {},
        log: () => {},
        warn: (...a) => console.warn(...a),
        error: (...a) => console.error(...a),
      },
    });

    await wllama.loadModelFromUrl(MODEL_URL, {
      n_ctx: 1024,
      progressCallback: ({ loaded, total }) => {
        const progress = total > 0 ? Math.round((loaded / total) * 100) : 0;
        onStatus({
          phase: 'loading',
          progress,
          text: `Téléchargement du cerveau de Momo… ${progress} %`,
        });
      },
    });

    ready = true;
    onStatus({ phase: 'ready', text: 'Momo est prêt !' });
    return true;
  } catch (err) {
    console.error('[ai] chargement impossible :', err);
    ready = false;
    onStatus({ phase: 'error', text: 'Momo est indisponible (mode hors-IA).' });
    return false;
  } finally {
    loading = false;
  }
}

/**
 * Libère les ressources du modèle.
 */
export async function disposeAI() {
  if (wllama && ready) {
    try {
      await wllama.exit();
    } catch {
      /* ignore */
    }
  }
  ready = false;
  wllama = null;
}

// --- Génération -------------------------------------------------------------

/**
 * Nettoie une sortie de petit modèle : couper à la 1re ligne, limiter la
 * longueur, retirer les artefacts de template.
 * @param {string} text
 * @returns {string}
 */
function sanitize(text) {
  let out = String(text || '');
  out = out.replace(/<\|im_(start|end)\|>/g, '');
  out = out.split('\n').map((l) => l.trim()).filter(Boolean)[0] || '';
  out = out.replace(/^(Momo\s*:\s*)/i, '');
  if (out.length > 140) out = out.slice(0, 137).trimEnd() + '…';
  if (out.replace(/[^\p{L}\p{N}]/gu, '').length < 4) return '';
  return out;
}

/**
 * Construit un prompt ChatML (format natif de SmolLM-Instruct).
 * @param {string} user
 * @returns {string}
 */
function chatml(user) {
  return (
    `<|im_start|>system\n${SYSTEM_PROMPT}<|im_end|>\n` +
    `<|im_start|>user\n${user}<|im_end|>\n` +
    `<|im_start|>assistant\n`
  );
}

/**
 * Génère une phrase courte via le LLM (API OAI de wllama v3).
 * Retourne '' si indisponible/échec/timeout.
 * @param {string} userPrompt
 * @param {number} [maxTokens]
 * @returns {Promise<string>}
 */
async function generate(userPrompt, maxTokens = 40) {
  if (!ready || !wllama || generating) return '';
  generating = true;
  try {
    const response = await Promise.race([
      wllama.createCompletion({
        prompt: chatml(userPrompt),
        max_tokens: maxTokens,
        temperature: 0.8,
        top_p: 0.9,
        stop: ['<|im_end|>', '<|im_start|>'],
      }),
      new Promise((resolve) => setTimeout(() => resolve(null), 8000)),
    ]);
    if (!response || !response.choices || !response.choices[0]) return '';
    return sanitize(response.choices[0].text);
  } catch (err) {
    console.warn('[ai] génération échouée :', err);
    return '';
  } finally {
    generating = false;
  }
}

/**
 * Tirage dans un pool avec anti-répétition immédiate (jamais 2 fois la
 * même phrase d'affilée).
 * @param {string[]} pool
 * @returns {string}
 */
function pickVaried(pool) {
  if (!pool || pool.length === 0) return '';
  if (pool.length === 1) return pool[0];
  let pick = pool[Math.floor(Math.random() * pool.length)];
  let guard = 0;
  while (pick === lastSaid && guard++ < 4) {
    pick = pool[Math.floor(Math.random() * pool.length)];
  }
  return pick;
}

/**
 * Réplique de secours : rendu du pool (fonctions templates ou strings)
 * avec anti-répétition par catégorie. Supporte les chemins pointés
 * ('hintOp.mul') pour les sous-catégories.
 * @param {string} key
 * @param {object} [ctx]
 * @returns {string}
 */
function fallback(key, ctx = {}) {
  let pool = FALLBACKS;
  for (const part of key.split('.')) {
    pool = pool ? pool[part] : undefined;
  }
  if (!pool || pool.length === 0) return '';
  let pick;
  let guard = 0;
  do {
    const item = pool[Math.floor(Math.random() * pool.length)];
    pick = typeof item === 'function' ? item(ctx) : item;
  } while (pick === lastFallbackKey && guard++ < 3);
  lastFallbackKey = pick;
  return pick;
}

// --- API coach --------------------------------------------------------------

/**
 * Message de bienvenue (nouvelle partie).
 * @param {{target: number}} [ctx]
 * @returns {Promise<string>}
 */
export async function coachWelcome(ctx = {}) {
  const ask = ctx.target
    ? `Nouvelle partie. Premier objectif : ${ctx.target}. Souhaite bonne chance au joueur en citant l’objectif.`
    : 'Nouvelle partie. Souhaite bonne chance au joueur.';
  const text = await generate(ask, 36);
  const fb = fallback('welcome');
  return text || fb;
}

/**
 * Réaction du coach après chaque coup. CATEGORIES :
 *  - targetReached : objectif explosé (avec stats du coup)
 *  - goodMove      : grosse fusion (>= 12 pts)
 *  - weakMove      : petite fusion (< 12 pts)
 *  - noMove        : le glissement n'a rien déplacé
 *  - invalidContact: contact de tuiles incompatibles
 *  - idle          : joueur inactif longtemps
 *
 * @param {{type: string, score: number, target: number, gained?: number,
 *          consumed?: number, multi?: boolean}} event
 * @returns {Promise<string>}
 */
export async function coachReact(event) {
  const ctx = {
    score: event.score,
    target: event.target,
    gained: event.gained,
    consumed: event.consumed,
    multi: event.multi,
    chain: event.chain,
    op: event.op,
    freed: event.freed,
  };

  // Cadence : si on vient de parler, réplique de secours immédiate (courte).
  const now = Date.now();
  const throttle = now - lastGenAt < MIN_INTERVAL_MS;

  let ask;
  switch (event.type) {
    case 'targetReached':
      ask =
        `Le joueur vient d'exploser l'objectif ${ctx.target} ` +
        `(score : ${ctx.score}, ${ctx.consumed || 1} tuile(s) d'un coup). ` +
        'Félicite-le et encourage-le pour la suite.';
      break;
    case 'cleaningMove':
      ask =
        `Le joueur vient d'utiliser une ${ctx.op === 'div' ? 'division' : 'soustraction'} ` +
        `qui a fusionné deux tuiles et libéré de l'espace sur un plateau encombré ` +
        `(score : ${ctx.score}, ${ctx.freed} case(s) libérée(s)). Félicite ce coup ` +
        'de « nettoyage » tactique — ex : « Superbe nettoyage ! », « Le plateau respire ! ».';
      break;
    case 'goodMove':
      ask =
        `Le joueur vient de faire une fusion rapportant ${ctx.gained} points ` +
        `(score : ${ctx.score}, objectif actuel : ${ctx.target}). ` +
        'Félicite-le brièvement.';
      break;
    case 'weakMove':
      ask =
        `La fusion du joueur ne rapporte que ${ctx.gained} point(s) ` +
        `(objectif : ${ctx.target}). Encourage-le à viser plus gros, sans le rabaisser.`;
      break;
    case 'noMove':
      ask =
        `Le glissement du joueur n'a déplacé aucune tuile (objectif : ${ctx.target}). ` +
        'Invite-le gentiment à changer de tactique ou d’opérateur.';
      break;
    case 'invalidContact':
      ask =
        `Deux tuiles ont entré en contact mais l'opération était impossible ` +
        `(objectif : ${ctx.target}). Invite-le à réfléchir au sens du glissement.`;
      break;
    case 'idle':
      ask =
        `Le joueur réfléchit depuis un moment (objectif : ${ctx.target}). ` +
        'Donne-lui un petit coup de pouce moral.';
      break;
    case 'undo':
      ask =
        'Le joueur vient d’annuler un coup dans un puzzle. ' +
        'Encourage-le positivement, sans le juger.';
      break;
    case 'combo':
      ask =
        `MATHIC CHAIN ! Le joueur a détruit ${ctx.chain || 2} objectifs en moins ` +
        'de 2 coups consécutifs. Explose de joie et mentionne la chaîne, ' +
        'c’est un moment d’euphorie !';
      break;
    case 'blockingMove':
    default:
      ask =
        `Le coup du joueur a rendu le puzzle insolvable (objectif : ${ctx.target}, ` +
        `${ctx.movesLeft || '?'} coup(s) restant(s)). Recommande IMMÉDIATEMENT ` +
        'le bouton Annuler (Undo), sans punir.';
      break;
  }

  lastGenAt = now;
  if (throttle) return fallback(event.type, ctx);

  const text = await generate(ask, 38);
  const fb = fallback(event.type, ctx);
  return text || fb;
}

/**
 * Annonce commentée d'un NOUVEL objectif — le cœur du "choix d'objectifs
 * commentés" : le code sait si l'objectif est atteignable MAINTENANT
 * (paires directes) et combien de candidats existent ; Momo commente.
 * @param {{board: (number|null)[][], target: number, directPairs: number}} ctx
 * @returns {Promise<{text: string, kind: 'easy'|'reachable'|'hard'}>}
 */
export async function coachNewTarget(ctx) {
  const kind =
    ctx.directPairs >= 2 ? 'easy' : ctx.directPairs === 1 ? 'reachable' : 'hard';

  const ask =
    `Nouvel objectif du jeu : ${ctx.target}. ` +
    (ctx.directPairs > 0
      ? `Il existe ${ctx.directPairs} combinaison(s) possible(s) dès maintenant sur le plateau. `
      : 'Aucune combinaison directe n’est possible pour l’instant. ') +
    'Fais une annonce courte et motivante.';

  const text = await generate(ask, 36);
  const fb = fallback(
    kind === 'hard' ? 'hardTarget' : 'reachable',
    { target: ctx.target }
  );
  return { text: text || fb, kind };
}

/**
 * Indice : le fait (la paire gagnante + ses valeurs + l'op) est calculé par
 * le moteur déterministe, le LLM le transforme en suggestion naturelle et
 * taquine (« Et si on rapprochait ce 12 et ce 3 ? »). Le fallback reste
 * tout aussi explicite. Le clignotement visuel est piloté par main.js.
 * @param {{board: (number|null)[][], target: number, hasPair: boolean,
 *          pairCount: number, hintOp?: string, hintA?: number,
 *          hintB?: number}} ctx
 * @returns {Promise<{text: string, kind: 'pair'|'none'}>}
 */
export async function coachHint(ctx) {
  if (!ctx.hasPair) {
    return { text: fallback('noDirectPair', { target: ctx.target }), kind: 'none' };
  }

  // Indice NATUREL précis : la paire (valeurs + op) est injectée dans le
  // prompt. Le LLM phrase une suggestion subtile ; le fallback aussi.
  if (ctx.hintOp && ctx.hintA !== undefined && ctx.hintB !== undefined) {
    const natural = fallback('hintOp.' + ctx.hintOp, {
      target: ctx.target,
      op: ctx.hintOp,
      a: ctx.hintA,
      b: ctx.hintB,
    });
    const ask =
      `Objectif du jeu : ${ctx.target}. La paire gagnante du plateau est ` +
      `${ctx.hintA} et ${ctx.hintB}, reliées par l’opération « ${ctx.hintOp} » ` +
      '(le sens du glissement compte). Formule en français UNE suggestion ' +
      `naturelle et taquine, du genre « Et si on rapprochait ce ${ctx.hintA} et ` +
      `ce ${ctx.hintB} avec une division ? », sans donner la réponse toute faite.`;
    const text = await generate(ask, 46);
    return { text: text || natural, kind: 'pair' };
  }

  // Indice générique : seule l'opération est connue (valeurs absentes).
  if (ctx.hintOp) {
    const natural = fallback('hintOp.' + ctx.hintOp, { target: ctx.target });
    const ask =
      `Objectif : ${ctx.target}. Indice factuel : une opération « ${ctx.hintOp} » ` +
      'entre deux tuiles du plateau produit exactement l’objectif. Rephrase ' +
      'cet indice de façon taquine sans donner les valeurs.';
    const text = await generate(ask, 40);
    return { text: text || natural, kind: 'pair' };
  }

  const ask =
    `Objectif : ${ctx.target}. ${ctx.pairCount} combinaison(s) gagnante(s) ` +
    'existent sur le plateau. Donne un indice court qui oriente SANS donner ' +
    'la réponse (pas de valeurs, pas d’opération).';

  const text = await generate(ask, 40);
  return {
    text: text || fallback('hint', { target: ctx.target }),
    kind: 'pair',
  };
}

/**
 * Annonce d'un puzzle « Coup Parfait » : la profondeur N est certifiée
 * par le BFS (minMovesToReach) — Momo l'annonce avec fierté.
 * @param {{target: number, moves: number}} ctx
 * @returns {Promise<string>}
 */
export async function coachPuzzleIntro(ctx) {
  const ask =
    `Un puzzle MATHIC vient d'être généré : cible ${ctx.target}, solution ` +
    `garantie en EXACTEMENT ${ctx.moves} coups. Annonce-le de façon ` +
    'motivante et précise.';
  const text = await generate(ask, 42);
  return text || fallback('puzzleIntro', ctx);
}

/**
 * Victoire d'un puzzle.
 * @param {{score: number, movesLeft: number}} ctx
 * @returns {Promise<string>}
 */
export async function coachPuzzleWin(ctx) {
  const ask =
    `Le joueur vient de résoudre le puzzle « Coup Parfait » (score : ${ctx.score}, ` +
    `${ctx.movesLeft} coup(s) non utilisé(s)). Félicite-le chaleureusement.`;
  const text = await generate(ask, 40);
  return text || fallback('puzzleWin', ctx);
}

/**
 * Message de fin de partie.
 * @param {{score: number, targetCount: number}} stats
 * @returns {Promise<string>}
 */
export async function coachGameOver(stats) {
  const ask =
    `Fin de partie : score final ${stats.score}, ${stats.targetCount} ` +
    'objectif(s) atteint(s). Fais un bilan encourageant et propose de rejouer.';
  const text = await generate(ask, 44);
  return text || fallback('gameOver', { score: stats.score, targets: stats.targetCount });
}
