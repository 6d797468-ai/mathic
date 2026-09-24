import { test } from "node:test";
import assert from "node:assert/strict";

// --- micro-DOM suffisant pour b1-web.js ---
function makeEl(tag, { cls = "", hidden = false } = {}) {
  const listeners = {};
  const el = {
    tag,
    textContent: "",
    _class: cls,
    disabled: false,
    hidden,
    dataset: {},
    style: {},
    children: [],
    id: "",
    _set: [],
    innerHTML: "",
    addEventListener(type, fn) { (listeners[type] ??= []).push(fn); },
    dispatch(type) { for (const fn of listeners[type] ?? []) fn(); },
    classList: {
      add: (...c) => (el._set = [...new Set([...el._set, ...c])]),
      remove: (...c) => (el._set = el._set.filter((x) => !c.includes(x))),
      toggle: (c, force) => {
        const on = force === undefined ? !el._set.includes(c) : force;
        if (on) el._set = [...new Set([...el._set, c])]; else el._set = el._set.filter((x) => x !== c);
        return on;
      },
      contains: (c) => el._set.includes(c),
    },
    set className(v) { el._class = v; },
    get className() { return el._class; },
    appendChild(child) { el.children.push(child); return child; },
    replaceChildren(...kids) { el.children = kids; },
    set innerHTML(v) {
      el._inner = v;
      el.children = [];
      for (const m of v.matchAll(/id="([^"]+)"/g)) {
        const b = makeEl("button");
        b.id = m[1];
        el.appendChild(b);
      }
    },
    get innerHTML() { return el._inner ?? ""; },
    querySelector(sel) {
      const find = (node) => {
        for (const c of node.children ?? []) {
          if (sel.startsWith("#") && c.id === sel.slice(1)) return c;
          if (sel.startsWith("[data-slot=") && c.dataset?.slot === sel.match(/="([^"]*)"/)[1]) return c;
          const r = find(c);
          if (r) return r;
        }
        return null;
      };
      return find(el);
    },
  };
  return el;
}

const els = {};
const boardButtons = [];
globalThis.document = {
  getElementById(id) {
    if (els[id]) return els[id];
    const el = makeEl(id === "board" ? "section" : "button");
    el.id = id;
    if (id === "board") {
      const orig = el.appendChild.bind(el);
      const origRc = el.replaceChildren.bind(el);
      el.appendChild = (b) => { boardButtons.push(b); return orig(b); };
      el.replaceChildren = (...k) => { boardButtons.length = 0; return origRc(...k); };
    }
    els[id] = el;
    return el;
  },
  createElement(tag) { return makeEl(tag); },
};
globalThis.window = globalThis;

// structure statique avant import du module
for (const id of ["lv", "name", "target", "moves", "score", "chain",
  "item-target", "item-moves", "item-score", "item-chain",
  "board", "res", "commit", "clear", "pv-extra", "status",
  "undo", "restart", "levels", "overlay-card"]) document.getElementById(id);
document.getElementById("overlay").classList.add("hidden");
const formula = document.getElementById("formula");
for (const slot of ["a", "op", "b"]) {
  const s = makeEl("span");
  s.dataset.slot = slot;
  formula.appendChild(s);
}
const eq = makeEl("span");
eq.textContent = "=";
formula.appendChild(eq);

// capture des événements B1| (preuve de comportement) sans bruit dans le runner
const events = [];
const originalLog = console.log;
console.log = (...args) => {
  for (const a of args) {
    if (typeof a === "string" && a.startsWith("B1|")) events.push(JSON.parse(a.slice(3)));
    else originalLog(...args);
  }
};

await import("../../src/b1/web/b1-web.js");

test("B1.5 — SMOKE DOM : grammaire TAP→PREVIEW→TRANSFORMER jouée en live (N1 puis N5)", () => {
  const qs = (slot) => formula.querySelector(`[data-slot="${slot}"]`);
  const cellBtn = (id) => boardButtons.find((b) => b.dataset.id === String(id));
  const tap = (id) => cellBtn(id).dispatch("click");

  // ============ N1 : 2 + 3 = 5 ============
  assert.equal(els["lv"].textContent, "N1");
  assert.ok(els["item-score"].hidden, "N1 masque le score (HUD minimal)");
  assert.ok(els["item-chain"].hidden, "N1 masque la chaîne (pas encore introduite)");
  assert.equal(cellBtn(0).textContent, "2");
  tap(0);
  assert.equal(qs("a").textContent, "2");
  tap(1);
  assert.equal(qs("op").textContent, "+");
  assert.equal(els["commit"].disabled, true, "pas de commit avant le 3e tap");
  tap(2);
  assert.equal(qs("b").textContent, "3");
  assert.equal(els["res"].textContent, "5 ✓", "preview = résultat + objectif");
  assert.equal(els["commit"].disabled, false, "TRANSFORMER actif");
  const moves0 = els["moves"].textContent;
  els["commit"].dispatch("click");
  assert.equal(String(els["moves"].textContent), String(Number(moves0) - 1), "un coup consommé au commit seulement");
  assert.ok(els["status"].textContent.includes("= 5"), "feedback de transformation");
  assert.equal(els["overlay"].classList.contains("hidden"), false, "overlay victoire");
  const again = els["overlay-card"].querySelector("#ov-again");
  assert.ok(again, "bouton Rejouer présent");
  again.dispatch("click");

  // re-sélection complète : le 3e tap NE déclenche JAMAIS apply()
  tap(0);
  tap(1);
  tap(2);
  assert.equal(String(els["moves"].textContent), String(moves0), "le 3e tap seul ne consomme AUCUN coup");
  els["commit"].dispatch("click");
  assert.equal(String(els["moves"].textContent), String(Number(moves0) - 1), "seul TRANSFORMER consomme");
  document.getElementById("clear").dispatch("click");
  assert.equal(qs("a").textContent, "A");

  // ============ N5 : chaîne (2+4=6 à +0, puis 6×8=48) ============
  const nav5 = els["levels"].children.find((b) => b.textContent === "N5");
  nav5.dispatch("click");
  assert.equal(els["lv"].textContent, "N5");
  assert.equal(els["item-chain"].hidden, false, "N5 affiche la chaîne");
  tap(1); // 2 → A
  tap(2); // + → op
  tap(3); // 4 → B
  assert.equal(els["res"].textContent, "6");
  els["commit"].dispatch("click");
  assert.ok(els["status"].textContent.includes("+0"), "coup préparatoire à +0");
  tap(1); // 6 (résultat ancré en 1) → A
  tap(4); // × → op
  tap(5); // 8 → B
  assert.equal(els["res"].textContent, "48 ✓");
  assert.ok(els["pv-extra"].textContent.includes("chaîne"), "preview montre la chaîne");
  els["commit"].dispatch("click");
  assert.ok(els["status"].textContent.includes("chaîne"), "feedback chaîne après commit");
  assert.equal(els["overlay"].classList.contains("hidden"), false, "victoire N5");

  // preuves de traçabilité : previews puis actions, aucune formule invalide sur le parcours propre
  const kinds = events.map((e) => e.kind);
  assert.ok(kinds.includes("preview"), "des previews ont été journalisés");
  assert.ok(kinds.includes("action"), "des actions ont été journalisées");
  assert.ok(kinds.filter((k) => k === "action").length >= 4, "4 commits réels (N1×2 + N5×2)");
  assert.ok(!kinds.includes("invalid"), "aucune formule invalide sur le parcours propre");
});