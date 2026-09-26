/**
 * @file catalog.mjs
 * MATHIC V6 - M26 Founding Methods Catalog
 *
 * Implements the three founding strategic methods:
 * - METHOD_FUSE
 * - METHOD_DECOMPOSE
 * - METHOD_FACTORIZE
 */

export const METHOD_FUSE = Object.freeze({
  id: "METHOD_FUSE",
  name: "Fusion Additive",
  description: "Construit une cible additive à partir de valeurs composantes.",
  parameters: ["target"],
  primitiveOperations: ["PLACE"],
  cost: { ether: 10 },
  preconditions(state, intent) {
    if (intent.targets.length < 2) {
      return { ok: false, reason: "METHOD_FUSE : au moins 2 cibles sont requises" };
    }
    if (intent.values.length < 2) {
      return { ok: false, reason: "METHOD_FUSE : au moins 2 valeurs sont requises" };
    }
    if (intent.targets.length !== intent.values.length) {
      return { ok: false, reason: "METHOD_FUSE : le nombre de cibles doit correspondre au nombre de valeurs" };
    }
    const sum = intent.values.reduce((acc, v) => acc + v, 0);
    if (intent.parameters?.target != null && sum !== intent.parameters.target) {
      return { ok: false, reason: `METHOD_FUSE : la somme des valeurs (${sum}) ne correspond pas à la cible (${intent.parameters.target})` };
    }
    return { ok: true };
  },
  compile(state, intent) {
    const commands = intent.targets.map((target, idx) => ({
      id: "PLACE",
      v: intent.values[idx],
      r: target.r,
      c: target.c,
    }));
    return {
      methodId: "METHOD_FUSE",
      commands,
    };
  },
});

export const METHOD_DECOMPOSE = Object.freeze({
  id: "METHOD_DECOMPOSE",
  name: "Décomposition",
  description: "Choix stratégique de construire une cible T par addition de ses composantes A + B.",
  parameters: ["target"],
  primitiveOperations: ["PLACE"],
  cost: { ether: 10 },
  preconditions(state, intent) {
    if (!intent.parameters || typeof intent.parameters.target !== "number") {
      return { ok: false, reason: "METHOD_DECOMPOSE : paramètre 'target' (nombre) obligatoire" };
    }
    if (intent.targets.length < 2 || intent.values.length < 2) {
      return { ok: false, reason: "METHOD_DECOMPOSE : au moins 2 cibles et 2 composantes sont requises" };
    }
    if (intent.targets.length !== intent.values.length) {
      return { ok: false, reason: "METHOD_DECOMPOSE : le nombre de cibles doit correspondre au nombre de composantes" };
    }
    const sum = intent.values.reduce((acc, v) => acc + v, 0);
    if (sum !== intent.parameters.target) {
      return { ok: false, reason: `METHOD_DECOMPOSE : somme des composantes (${sum}) ≠ cible (${intent.parameters.target})` };
    }
    return { ok: true };
  },
  compile(state, intent) {
    const commands = intent.targets.map((target, idx) => ({
      id: "PLACE",
      v: intent.values[idx],
      r: target.r,
      c: target.c,
    }));
    return {
      methodId: "METHOD_DECOMPOSE",
      commands,
    };
  },
});

export const METHOD_FACTORIZE = Object.freeze({
  id: "METHOD_FACTORIZE",
  name: "Factorisation",
  description: "Choix stratégique de construire une cible T par multiplication de ses facteurs A x B.",
  parameters: ["target"],
  primitiveOperations: ["PLACE"],
  cost: { ether: 15 },
  preconditions(state, intent) {
    if (!intent.parameters || typeof intent.parameters.target !== "number") {
      return { ok: false, reason: "METHOD_FACTORIZE : paramètre 'target' (nombre) obligatoire" };
    }
    if (intent.targets.length < 2 || intent.values.length < 2) {
      return { ok: false, reason: "METHOD_FACTORIZE : au moins 2 cibles et 2 facteurs sont requis" };
    }
    if (intent.targets.length !== intent.values.length) {
      return { ok: false, reason: "METHOD_FACTORIZE : le nombre de cibles doit correspondre au nombre de facteurs" };
    }
    const product = intent.values.reduce((acc, v) => acc * v, 1);
    if (product !== intent.parameters.target) {
      return { ok: false, reason: `METHOD_FACTORIZE : produit des facteurs (${product}) ≠ cible (${intent.parameters.target})` };
    }
    return { ok: true };
  },
  compile(state, intent) {
    const commands = intent.targets.map((target, idx) => ({
      id: "PLACE",
      v: intent.values[idx],
      r: target.r,
      c: target.c,
    }));
    return {
      methodId: "METHOD_FACTORIZE",
      commands,
    };
  },
});

export function registerFoundingMethods(registry) {
  registry.register(METHOD_FUSE);
  registry.register(METHOD_DECOMPOSE);
  registry.register(METHOD_FACTORIZE);
}
