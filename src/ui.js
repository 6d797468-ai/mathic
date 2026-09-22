/**
 * ui.js — Couche de rendu animée (DOM uniquement)
 *
 * Architecture : une grille de cases fixes (fond) SUR laquelle une couche
 * de tuiles absolues est superposée. Les tuiles persistent d'un rendu à
 * l'autre (identifiées par leur position) : le glissement est une simple
 * transition CSS sur left/top.
 *
 * Le gestionnaire est PILOTÉ PAR CHORÉGRAPHIE : main.js déclenche chaque
 * étape (slide → explode → spawn) dans l'ordre. Aucune logique de jeu ici.
 */

/** Durées d'animation (ms) — partagées avec main.js pour la chorégraphie. */
export const MOVE_DURATION = 150;
export const EXPLODE_DURATION = 320;
export const SPAWN_DURATION = 180;

/**
 * Construit la structure DOM : cases de fond + couche de tuiles.
 * @param {HTMLElement} container
 * @param {number} rows
 * @param {number} cols
 * @returns {{ cells: HTMLElement[], tileLayer: HTMLElement }}
 */
export function buildGrid(container, rows, cols) {
  container.innerHTML = '';
  container.style.setProperty('--rows', rows);
  container.style.setProperty('--cols', cols);

  const cells = [];
  for (let i = 0; i < rows * cols; i++) {
    const cell = document.createElement('div');
    cell.className = 'cell';
    container.appendChild(cell);
    cells.push(cell);
  }

  const tileLayer = document.createElement('div');
  tileLayer.className = 'tile-layer';
  container.appendChild(tileLayer);

  return { cells, tileLayer };
}

/**
 * Classe de couleur selon la magnitude de la valeur (plages log^2).
 * @param {number} value
 * @returns {string}
 */
function magnitudeClass(value) {
  if (value <= 2) return 'mag-1';
  if (value <= 8) return 'mag-2';
  if (value <= 32) return 'mag-3';
  if (value <= 128) return 'mag-4';
  if (value <= 512) return 'mag-5';
  return 'mag-6';
}

/**
 * Anime un élément via une classe CSS temporaire.
 * @param {HTMLElement} el
 * @param {string} animationClass
 */
function animate(el, animationClass) {
  el.classList.add(animationClass);
  el.addEventListener(
    'animationend',
    () => el.classList.remove(animationClass),
    { once: true }
  );
}

/**
 * Ajuste la taille de police selon le nombre de chiffres.
 * @param {HTMLElement} el
 * @param {number} value
 */
function fitFont(el, value) {
  const digits = String(value).length;
  const k = digits >= 5 ? 0.5 : digits === 4 ? 0.62 : digits === 3 ? 0.8 : 1;
  el.style.fontSize = `clamp(${20 * k}px, ${6 * k}vw, ${34 * k}px)`;
}

/**
 * Crée le gestionnaire de la couche de tuiles.
 * @param {HTMLElement} tileLayer
 * @param {number} rows
 * @param {number} cols
 */
export function createTileManager(tileLayer, rows, cols) {
  /** @type {Map<string, {value: number, row: number, col: number, el: HTMLElement}>} */
  const tiles = new Map();

  /**
   * Compteur d'identités : chaque tuile DOM reçoit un id STABLE, jamais
   * réutilisé. Un déplacement conserve le MÊME élément (donc le même id) :
   * la transition CSS left/top glisse sans casser l'animation. Pour les
   * dé-fusions (Undo), les deux opérandes reçoivent de nouveaux ids —
   * impossible de scinder un seul élément en deux.
   */
  let idSeq = 1;

  const posKey = (r, c) => `${r},${c}`;

  /** Positionne un élément sur la case (row, col) — calc CSS exact. */
  function place(el, r, c) {
    const w = `((100% - (${cols} - 1) * var(--gap)) / ${cols})`;
    const h = `((100% - (${rows} - 1) * var(--gap)) / ${rows})`;
    el.style.width = `calc(${w})`;
    el.style.height = `calc(${h})`;
    el.style.left = `calc(${c} * ${w} + ${c} * var(--gap))`;
    el.style.top = `calc(${r} * ${h} + ${r} * var(--gap))`;
  }

  function tileAt(r, c) {
    return tiles.get(posKey(r, c)) || null;
  }

  function createTile(r, c, value, withPop) {
    const el = document.createElement('div');
    el.className = `tile ${magnitudeClass(value)}`;
    el.dataset.tileId = String(idSeq++);
    el.textContent = value;
    fitFont(el, value);
    place(el, r, c);
    tileLayer.appendChild(el);
    const tile = { value, row: r, col: c, el };
    tiles.set(posKey(r, c), tile);
    if (withPop) animate(el, 'spawn');
    return tile;
  }

  /**
   * Animation de glissement : chaque entrée de `moves` décrit une tuile
   * allant de (fromRow,fromCol) vers (toRow,toCol). Une fusion = 2 entrées
   * vers la même destination : les deux tuiles convergent, une seule
   * survit et affiche la valeur fusionnée avec un rebond.
   * @param {{fromRow: number, fromCol: number, toRow: number, toCol: number, value: number}[]} moves
   * @param {{row: number, col: number, value: number}[]} mergedCells
   */
  function slide(moves, mergedCells = []) {
    const mergedKeys = new Set(mergedCells.map((m) => posKey(m.row, m.col)));

    // Grouper par destination.
    const groups = new Map();
    for (const m of moves) {
      const key = posKey(m.toRow, m.toCol);
      let arr = groups.get(key);
      if (!arr) {
        arr = [];
        groups.set(key, arr);
      }
      arr.push(m);
    }

    // Résoudre les tuiles AVANT toute mutation de position.
    const lookups = [];
    for (const [key, entries] of groups) {
      lookups.push({
        key,
        merged: mergedKeys.has(key) && entries.length >= 2,
        items: entries.map((m) => ({ m, tile: tileAt(m.fromRow, m.fromCol) })),
      });
    }

    for (const { key, merged, items } of lookups) {
      const [toRow, toCol] = key.split(',').map(Number);

      if (merged) {
        const survivor = items[items.length - 1].tile;
        for (const { tile } of items) {
          if (!tile || tile === survivor) continue;
          tile.el.style.zIndex = '2'; // l'arrivante passe au-dessus
          tiles.delete(posKey(tile.row, tile.col));
          setTimeout(() => tile.el.remove(), MOVE_DURATION);
        }
        if (survivor) {
          tiles.delete(posKey(survivor.row, survivor.col));
          survivor.row = toRow;
          survivor.col = toCol;
          tiles.set(key, survivor);
          place(survivor.el, toRow, toCol);

          setTimeout(() => {
            const mc = mergedCells.find((m) => posKey(m.row, m.col) === key);
            if (mc) {
              survivor.value = mc.value;
              survivor.el.textContent = mc.value;
              survivor.el.className = `tile ${magnitudeClass(mc.value)}`;
              fitFont(survivor.el, mc.value);
              place(survivor.el, toRow, toCol);
            }
            survivor.el.style.zIndex = '';
            animate(survivor.el, 'merge');
          }, MOVE_DURATION);
        }
      } else {
        const { tile } = items[0];
        if (!tile) continue;
        tiles.delete(posKey(tile.row, tile.col));
        tile.row = toRow;
        tile.col = toCol;
        tiles.set(key, tile);
        place(tile.el, toRow, toCol);
      }
    }
  }

  /**
   * Synchronise la couche avec le modèle : supprime les tuiles absentes,
   * crée celles manquantes (pop), met à jour la surbrillance cible.
   * @param {(number|null)[][]} board
   * @param {number[]} [targetCells] index (row*cols+col) des tuiles = cible
   */
  function sync(board, targetCells = []) {
    const present = new Set();
    for (let r = 0; r < board.length; r++) {
      for (let c = 0; c < board[r].length; c++) {
        if (board[r][c] !== null) present.add(posKey(r, c));
      }
    }

    for (const [key, tile] of [...tiles]) {
      if (!present.has(key)) {
        tile.el.remove();
        tiles.delete(key);
      }
    }

    for (let r = 0; r < board.length; r++) {
      for (let c = 0; c < board[r].length; c++) {
        const value = board[r][c];
        if (value !== null && !tiles.has(posKey(r, c))) {
          createTile(r, c, value, true);
        }
      }
    }

    setHighlight(targetCells);
  }

  /**
   * Marque d'un halo les tuiles dont la valeur égale l'objectif.
   * @param {number[]} targetCells
   */
  function setHighlight(targetCells = []) {
    const set = new Set(targetCells);
    for (const tile of tiles.values()) {
      const index = tile.row * cols + tile.col;
      tile.el.classList.toggle('is-target', set.has(index));
    }
  }

  /**
   * Fait flasher brièvement les tuiles aux positions données (indice).
   * @param {{row: number, col: number}[]} positions
   */
  function flash(positions) {
    for (const { row, col } of positions) {
      const tile = tileAt(row, col);
      if (!tile) continue;
      tile.el.classList.add('hinted');
      setTimeout(() => tile.el.classList.remove('hinted'), 1800);
    }
  }

  /**
   * Fait trembler les tuiles concernées (contact invalide).
   * @param {{row: number, col: number}[]} cells
   */
  function shake(cells) {
    for (const { row, col } of cells) {
      const tile = tileAt(row, col);
      if (tile) animate(tile.el, 'shake');
    }
  }  /**
   * Fait exploser les tuiles consommées, avec popup de points, particules
   * et halo expansif (Phase 4 : juiciness). `combo` amplifie l'effet.
   * @param {{row: number, col: number, value: number}[]} consumed
   * @param {number} points bonus total gagné
   * @param {{combo?: boolean}} [opts]
   */
  function explode(consumed, points, { combo = false } = {}) {
    consumed.forEach(({ row, col }, i) => {
      const tile = tileAt(row, col);
      if (!tile) return;
      tile.el.classList.remove('is-target');
      tiles.delete(posKey(row, col));
      tile.el.classList.add('exploding');
      setTimeout(() => tile.el.remove(), EXPLODE_DURATION);
      if (i === 0) floatText(tile.el, `+${points}`);
      burstParticles(tile.el, combo);
      if (i === 0) spawnHalo(tile.el, combo);
    });
  }

  /**
   * Burst de particules : 8 éclats colorés projetés autour de la tuile.
   * @param {HTMLElement} tileEl
   * @param {boolean} big true pour un combo (12 particules, plus rapides)
   */
  function burstParticles(tileEl, big) {
    const count = big ? 12 : 8;
    const color = getComputedStyle(tileEl).backgroundColor;
    for (let i = 0; i < count; i++) {
      const p = document.createElement('div');
      p.className = 'particle';
      p.style.backgroundColor = color;
      // Point de départ : centre de la tuile.
      const cx = tileEl.offsetLeft + tileEl.offsetWidth / 2;
      const cy = tileEl.offsetTop + tileEl.offsetHeight / 2;
      p.style.left = `${cx}px`;
      p.style.top = `${cy}px`;
      // Direction balistique via variables CSS consommées par keyframes.
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
      const dist = (big ? 70 : 48) + Math.random() * 24;
      p.style.setProperty('--px', `${Math.cos(angle) * dist}px`);
      p.style.setProperty('--py', `${Math.sin(angle) * dist - 14}px`);
      p.style.setProperty('--ps', big ? 1.15 : 0.85);
      tileLayer.appendChild(p);
      setTimeout(() => p.remove(), 700);
    }
  }

  /**
   * Halo expansif au centre de la tuile qui explose.
   * @param {HTMLElement} tileEl
   * @param {boolean} combo
   */
  function spawnHalo(tileEl, combo) {
    const halo = document.createElement('div');
    halo.className = combo ? 'halo halo-combo' : 'halo';
    halo.style.left = tileEl.style.left;
    halo.style.top = tileEl.style.top;
    halo.style.width = tileEl.style.width;
    halo.style.height = tileEl.style.height;
    tileLayer.appendChild(halo);
    setTimeout(() => halo.remove(), 700);
  }

  /**
   * Texte flottant au-dessus d'une tuile.
   * @param {HTMLElement} anchor
   * @param {string} text
   */
  function floatText(anchor, text) {
    const popup = document.createElement('div');
    popup.className = 'float-text';
    popup.textContent = text;
    popup.style.left = anchor.style.left;
    popup.style.top = anchor.style.top;
    popup.style.width = anchor.style.width;
    tileLayer.appendChild(popup);
    setTimeout(() => popup.remove(), 900);
  }

  /**
   * Bump visuel du score.
   * @param {HTMLElement} scoreElement
   */
  function bumpScore(scoreElement) {
    scoreElement.classList.remove('bump');
    void scoreElement.offsetWidth; // force reflow pour relancer l'anim
    scoreElement.classList.add('bump');
  }

  /**
   * Screen shake : secousse du plateau entier (contact invalide, roadmap
   * 4.2). Amplifié si un combo vient de casser la dynamique.
   * @param {{strong?: boolean}} [opts]
   */
  function screenShake({ strong = false } = {}) {
    const host = tileLayer.parentElement;
    if (!host) return;
    host.classList.remove('screen-shake', 'screen-shake-strong');
    void host.offsetWidth; // force reflow
    host.classList.add(strong ? 'screen-shake-strong' : 'screen-shake');
    setTimeout(() => {
      host.classList.remove('screen-shake', 'screen-shake-strong');
    }, strong ? 450 : 320);
  }

  /**
   * Joue l'Undo d'un coup EN MIROIR à partir d'un plan `reversePlan`
   * (history.js) :
   *  1. retire les tuiles créées (spawns) ;
   *  2. dé-fait les fusions : le survivant à `to` est remplacé par deux
   *     tuiles opérandes aux positions d'origine (pop) ;
   *  3. remonte les glissements avec le MÊME élément (même id DOM) : la
   *     transition CSS left/top anime le retour.
   * La synchronisation finale (`sync`) reste l'autorité : elle recrée les
   * tuiles explosées et retire les éventuels résidus — l'état DOM correspond
   * exactement à `before`.
   * @param {{splits: {to: {row:number,col:number}, operands:{row:number,col:number,value:number}[]}[],
   *          slidesBack: {from: {row:number,col:number}, to:{row:number,col:number}, value:number}[],
   *          spawns: {row:number,col:number,value:number}[]}} plan
   */
  function rewind(plan) {
    // 1) Spawns : retirer les tuiles créées à la fin du coup annulé.
    for (const s of plan.spawns) {
      const t = tileAt(s.row, s.col);
      if (!t) continue;
      tiles.delete(posKey(s.row, s.col));
      t.el.remove();
    }

    // 2) Fusions : le survivant redevient deux tuiles opérandes (pop-in).
    for (const sp of plan.splits) {
      const survivor = tileAt(sp.to.row, sp.to.col);
      if (!survivor) continue;
      tiles.delete(posKey(survivor.row, survivor.col));
      survivor.el.remove();
      for (const op of sp.operands) {
        createTile(op.row, op.col, op.value, true);
      }
    }

    // 3) Glissements : le même élément repart vers l'origine (CSS transition).
    for (const s of plan.slidesBack) {
      const t = tileAt(s.to.row, s.to.col);
      if (!t) continue;
      tiles.delete(posKey(t.row, t.col));
      t.row = s.from.row;
      t.col = s.from.col;
      tiles.set(posKey(t.row, t.col), t);
      place(t.el, s.from.row, s.from.col);
    }
  }

  return {
    slide,
    sync,
    setHighlight,
    flash,
    shake,
    explode,
    bumpScore,
    screenShake,
    rewind,
    tileAt,
  };
}

/**
 * Met à jour l'état visuel "actif" des boutons d'opérateur et mirotre la
 * sélection sur l'attribut ARIA (`role="radio"` / `aria-checked`).
 * @param {NodeListOf<Element>|Element[]} buttons
 * @param {'add'|'sub'|'mul'|'div'} activeOp
 */
export function renderOperatorSelection(buttons, activeOp) {
  buttons.forEach((btn) => {
    const active = btn.dataset.op === activeOp;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-checked', String(active));
  });
}
