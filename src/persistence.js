/**
 * persistence.js — Persistance de session (K8)
 *
 * Parlât le parcours réel : jouer → fermer → rouvrir → continuer. Le
 * snapshot de l'adapter (src/game.js) est la seule source de vérité ; ici
 * on ne fait que le sérialiser avec garde de version, en tolérant un
 * stockage indisponible (incognito / WebView fermé sur quota).
 *
 * Aucun contrat Engine/GameSession n'est touché : la réhydratation passe
 * par session.loadSnapshot (K3-U1) déjà prouvée déterministe.
 */

const SAVE_KEY = 'mathic_session_v1';
const SAVE_VERSION = 1;

/**
 * Crée un gestionnaire de persistance.
 * @param {{storage?: StorageLike, key?: string}} [opts]
 * @returns {Object}
 */
export function createPersistence({ storage = null, key = SAVE_KEY } = {}) {
  const store = storage ?? (typeof window !== 'undefined' && window.localStorage ? window.localStorage : null);

  const read = () => {
    if (!store) return null;
    try {
      const raw = store.getItem(key);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || data.v !== SAVE_VERSION || !data.state) return null;
      return data;
    } catch {
      return null;
    }
  };

  return {
    /**
     * Enregistre le snapshot courant.
     * @param {Object} adapter adapter créé par createGame()
     * @returns {boolean} true si persisté
     */
    save(adapter) {
      if (!store) return false;
      try {
        store.setItem(key, JSON.stringify({ ...adapter.getSnapshot(), savedAt: Date.now() }));
        return true;
      } catch {
        return false;
      }
    },

    /** Retire la sauvegarde (nouvelle partie). */
    clear() {
      if (!store) return;
      try {
        store.removeItem(key);
      } catch {
        /* stockage indisponible : rien à retirer */
      }
    },

    /** @returns {Object|null} snapshot validé (version + état). */
    load() {
      return read();
    },

    /** @returns {boolean} une sauvegarde exploitable existe. */
    has() {
      return read() !== null;
    },
  };
}