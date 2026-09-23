/**
 * ai-text.js — Traitement de texte du coach (pur, testable en Node).
 *
 * K7 : le modèle embarqué est désormais Supra-50M (Q4_K_M, 36 Mo), un
 * modèle BASE (non instruit) : le prompt est une continuation naturelle,
 * et la sortie est filtrée par un garde-fou conservateur — si le petit
 * modèle sort du charabia, Momo retombe sur sa banque de répliques
 * (chaîne de secours toujours vivante).
 */

/** Amorce de complétion utilisée en fin de prompt (retirée à la lecture). */
const CUE = 'Momo :';

/**
 * Construit le prompt du coach pour un modèle BASE (Supra-50M) :
 * consigne claire + amorce de continuation "Momo :". Pas de ChatML :
 * un modèle non instruit répond mieux à du texte naturel.
 * @param {string} user instruction humaine (faits calculés par le code)
 * @returns {string}
 */
export function buildPrompt(user) {
  return `${user}\n\n${CUE}`;
}

/**
 * Filtre une sortie de petit modèle. Tout rejet renvoie '' → la chaîne de
 * secours (banque de répliques) prend le relais dans le caller.
 *
 * Critères :
 *  - première ligne non vide, artefacts de template retirés ;
 *  - longueur bornée (140 → tronqué, > 260 → rejet) ;
 *  - aucun caractère de contrôle (gibberish binaire du petit modèle) ;
 *  - aucune répétition pathologique ;
 *  - au moins 3 caractères alphanumériques (répliques math courtes OK).
 *
 * @param {string} text
 * @returns {string}
 */
export function sanitizeOutput(text) {
  let out = String(text || '');
  out = out.replace(/<\|im_(start|end)\|>/g, '');
  out = out.split('\n').map((l) => l.trim()).filter(Boolean)[0] || '';
  out = out.replace(new RegExp(`^${CUE}\\s*`, 'i'), '');
  out = out.replace(/^(Momo\s*:\s*)/i, '');

  if (out.length < 2) return '';
  if (out.length > 260) return '';
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(out)) return '';
  if (/^(.)\1{24}/.test(out)) return '';
  const letters = [...out.replace(/[^\p{L}]/gu, '')];
  if (new Set(letters).size < 2 && letters.length >= 6) return '';
  if (out.replace(/[^\p{L}\p{N}]/gu, '').length < 3) return '';
  if (out.length > 140) {
    const truncated = out.slice(0, 137).trimEnd();
    // Ne jamais finir sur une virgule/opérateur suspendu.
    return truncated.replace(/[,+×÷−:;-]$/, '') + '…';
  }
  return out;
}