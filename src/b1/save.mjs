import { LADDER, nextLevel } from "./levels.mjs";

export const SAVE_KEY = "mathic.save.v1";

const memoryStore = () => {
  const m = new Map();
  return {
    get: (k) => (m.has(k) ? m.get(k) : null),
    set: (k, v) => void m.set(k, v),
    _raw: m,
  };
};

export function pickStorage() {
  if (typeof globalThis !== "undefined" && globalThis.localStorage && typeof globalThis.localStorage.getItem === "function") {
    try {
      return {
        get: (k) => globalThis.localStorage.getItem(k),
        set: (k, v) => globalThis.localStorage.setItem(k, v),
      };
    } catch {
      return memoryStore();
    }
  }
  return memoryStore();
}

let _storage = pickStorage();

export function setStorage(s) {
  _storage = s;
  return _storage;
}

export function getStorage() {
  return _storage;
}

export function blankSave() {
  return {
    version: 1,
    unlocked: ["N1"],
    completed: {},
    current: "N1",
  };
}

export function loadSave(storage = _storage) {
  const raw = storage.get(SAVE_KEY);
  if (!raw) return blankSave();
  try {
    const parsed = JSON.parse(raw);
    if (parsed && parsed.version === 1 && Array.isArray(parsed.unlocked) && parsed.unlocked.length) {
      return { ...blankSave(), ...parsed };
    }
  } catch {
    /* stockage corrompu → sauvegarde vierge, jamais de crash */
  }
  return blankSave();
}

export function saveNow(state, storage = _storage) {
  storage.set(SAVE_KEY, JSON.stringify(state));
  return state;
}

export function isUnlocked(state, id) {
  return state.unlocked.includes(id);
}

export function setCurrent(state, id) {
  const st = { ...state, current: id };
  return st;
}

export function unlockTo(state, id) {
  const idx = LADDER.findIndex((l) => l.id === id);
  if (idx < 0) return state;
  if (state.unlocked.length - 1 >= idx) return state;
  const next = [];
  for (let i = 0; i <= idx; i++) {
    const lv = LADDER[i].id;
    if (!next.includes(lv)) next.push(lv);
  }
  return { ...state, unlocked: next };
}

export function markCompleted(state, levelId, { score, movesLeft }) {
  const rec = state.completed[levelId] ?? { wins: 0, bestScore: null, bestMovesLeft: null };
  const better = rec.bestScore === null || score > rec.bestScore || (score === rec.bestScore && (rec.bestMovesLeft === null || movesLeft > rec.bestMovesLeft));
  const updated = {
    wins: rec.wins + 1,
    bestScore: better ? score : rec.bestScore,
    bestMovesLeft: better ? movesLeft : rec.bestMovesLeft,
  };
  const completed = { ...state.completed, [levelId]: updated };
  let st = { ...state, completed, current: levelId };
  const nxt = nextLevel(levelId);
  if (nxt && !st.unlocked.includes(nxt.id)) st.unlocked = [...st.unlocked, nxt.id];
  return st;
}

export function replayable(state, levelId) {
  return Boolean(LADDER.some((l) => l.id === levelId) && (isUnlocked(state, levelId) || state.completed[levelId]));
}

export function completedCount(state, worldId = null) {
  const count = worldId
    ? LADDER.filter((l) => l.world === worldId && state.completed[l.id]?.wins > 0).length
    : LADDER.filter((l) => state.completed[l.id]?.wins > 0).length;
  return count;
}

export function worldProgress(state, worldId) {
  const levels = LADDER.filter((l) => l.world === worldId);
  return {
    total: levels.length,
    unlocked: levels.filter((l) => isUnlocked(state, l.id) || state.completed[l.id]?.wins > 0).length,
    done: levels.filter((l) => state.completed[l.id]?.wins > 0).length,
  };
}

export function bestScore(state, levelId) {
  return state.completed[levelId]?.bestScore ?? null;
}

export function hasWon(state, levelId) {
  return (state.completed[levelId]?.wins ?? 0) > 0;
}

export function normalized(state, storage = _storage) {
  const s = loadSave(storage);
  const ids = new Set(LADDER.map((l) => l.id));
  const completed = Object.fromEntries(Object.entries(s.completed).filter(([id]) => ids.has(id)));
  const unlocked = s.unlocked.filter((id) => ids.has(id));
  if (!unlocked.includes("N1")) unlocked.unshift("N1");
  return { ...blankSave(), ...s, unlocked, completed, current: ids.has(s.current) ? s.current : "N1" };
}