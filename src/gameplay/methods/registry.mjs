/**
 * @file registry.mjs
 * MATHIC V6 - M26 Method Registry
 *
 * Stores and validates strategic methods.
 */

const ALLOWED_PRIMITIVES = new Set(["PLACE"]);

export class MethodRegistry {
  constructor() {
    this._methods = new Map();
  }

  register(method) {
    if (!method || typeof method !== "object") {
      throw new TypeError("MethodRegistry.register : la méthode doit être un objet non nul");
    }

    const { id, name, compile, primitiveOperations } = method;

    if (typeof id !== "string" || !id.trim()) {
      throw new TypeError("MethodRegistry.register : id de méthode requis (chaîne non vide)");
    }

    if (this._methods.has(id)) {
      throw new TypeError(`MethodRegistry.register : identifiant dupliqué '${id}'`);
    }

    if (typeof name !== "string" || !name.trim()) {
      throw new TypeError(`MethodRegistry.register : nom requis pour '${id}'`);
    }

    if (typeof compile !== "function") {
      throw new TypeError(`MethodRegistry.register : compilateur requis (fonction) pour '${id}'`);
    }

    if (!Array.isArray(primitiveOperations)) {
      throw new TypeError(`MethodRegistry.register : primitiveOperations (tableau) requis pour '${id}'`);
    }

    for (const op of primitiveOperations) {
      if (!ALLOWED_PRIMITIVES.has(op)) {
        throw new TypeError(
          `MethodRegistry.register : primitive non supportée '${op}' dans '${id}'. Primitives V5 autorisées: ${Array.from(ALLOWED_PRIMITIVES).join(", ")}`
        );
      }
    }

    this._methods.set(id, method);
  }

  get(methodId) {
    if (!this._methods.has(methodId)) {
      throw new Error(`MethodRegistry : méthode non trouvée '${methodId}'`);
    }
    return this._methods.get(methodId);
  }

  has(methodId) {
    return this._methods.has(methodId);
  }

  list() {
    return Array.from(this._methods.values());
  }

  clear() {
    this._methods.clear();
  }
}

export const globalMethodRegistry = new MethodRegistry();
