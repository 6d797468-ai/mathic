/**
 * profiler.js — Profillage mobile intégré (roadmap 5.2)
 *
 * HUD discret activable en jeu (bouton 📊 ou touche P) :
 *  - FPS temps réel + pire frame de la dernière seconde
 *  - Long Tasks (> 50 ms) — les tueuses de fluidité mobile
 *  - Empreinte mémoire JS (performance.memory si dispo : Chrome)
 *  - Mémoire du modèle IA (taille du fichier GGUF, chargé en wasm heap)
 *
 * Zéro dépendance. Aucun impact quand il est désactivé (pas de boucle rAF).
 */

/** Taille du modèle GGUF en Mo (public/models) — pour l'affichage. */
const MODEL_SIZE_MB = 85;

/**
 * Crée et pilote le HUD de profilage.
 * @returns {{toggle: () => boolean, isOn: () => boolean}}
 */
export function createProfiler() {
  let enabled = false;
  let rafId = 0;
  let frames = 0;
  let worstFrame = 0;
  let windowStart = performance.now();
  let longTasks = 0;

  // --- DOM du HUD ------------------------------------------------------------

  const hud = document.createElement('div');
  hud.id = 'profiler';
  hud.setAttribute('aria-hidden', 'true');
  hud.innerHTML = `
    <div class="p-row p-big"><span id="p-fps">–</span><small>FPS</small></div>
    <div class="p-row">pire frame <b id="p-worst">–</b></div>
    <div class="p-row">long tasks <b id="p-lt">0</b></div>
    <div class="p-row">JS heap <b id="p-heap">n/d</b></div>
    <div class="p-row">modèle IA <b>${MODEL_SIZE_MB} Mo</b></div>`;
  document.body.appendChild(hud);

  const fpsEl = hud.querySelector('#p-fps');
  const worstEl = hud.querySelector('#p-worst');
  const ltEl = hud.querySelector('#p-lt');
  const heapEl = hud.querySelector('#p-heap');

  // --- Long Tasks (PerformanceObserver si supporté) ----------------------------

  try {
    const obs = new PerformanceObserver((list) => {
      longTasks += list.getEntries().length;
      ltEl.textContent = String(longTasks);
    });
    obs.observe({ entryTypes: ['longtask'] });
  } catch {
    /* Safari/Firefox : pas de longtask API — on garde FPS + mémoire */
  }

  // --- Boucle de mesure ---------------------------------------------------------

  let lastNow = performance.now();

  function tick(now) {
    const delta = now - lastNow;
    lastNow = now;
    frames++;
    if (delta > worstFrame) worstFrame = delta;

    if (now - windowStart >= 1000) {
      const fps = Math.round((frames * 1000) / (now - windowStart));
      fpsEl.textContent = String(fps);
      // Code couleur : vert ≥ 55, orange ≥ 40, rouge en dessous.
      fpsEl.className = fps >= 55 ? 'good' : fps >= 40 ? 'mid' : 'bad';
      worstEl.textContent = `${Math.round(worstFrame)} ms`;
      worstFrame = 0;
      frames = 0;
      windowStart = now;

      // Chrome seulement (performance.memory est non-standard).
      const mem = performance.memory;
      if (mem) {
        heapEl.textContent = `${Math.round(mem.usedJSHeapSize / 1048576)} Mo`;
      }
    }
    rafId = requestAnimationFrame(tick);
  }

  function toggle() {
    enabled = !enabled;
    hud.classList.toggle('on', enabled);
    if (enabled) {
      lastNow = performance.now();
      windowStart = lastNow;
      rafId = requestAnimationFrame(tick);
    } else {
      cancelAnimationFrame(rafId);
    }
    return enabled;
  }

  return { toggle, isOn: () => enabled };
}
