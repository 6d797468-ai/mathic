/**
 * @file intent.mjs
 * MATHIC V6 - M26 Intent Model
 *
 * Defines canonical PlayerIntent structure for strategic gameplay layer.
 * Canonical, serializable, deterministic, immutable during compilation.
 */

export function createIntent({ methodId, targets = [], values = [], parameters = {} }) {
  const intent = {
    methodId,
    targets: targets.map(({ r, c }) => ({ r, c })),
    values: [...values],
    parameters: { ...parameters },
  };

  const validation = validateIntent(intent);
  if (!validation.valid) {
    throw new TypeError(`PlayerIntent invalide:\n - ${validation.errors.join("\n - ")}`);
  }

  return Object.freeze({
    methodId: intent.methodId,
    targets: Object.freeze(intent.targets.map((t) => Object.freeze({ r: t.r, c: t.c }))),
    values: Object.freeze([...intent.values]),
    parameters: Object.freeze({ ...intent.parameters }),
  });
}

export function validateIntent(intent) {
  const errors = [];
  if (!intent || typeof intent !== "object") {
    return { valid: false, errors: ["Intent doit être un objet non nul"] };
  }

  if (typeof intent.methodId !== "string" || !intent.methodId.trim()) {
    errors.push("methodId : chaîne non vide requise");
  }

  if (!Array.isArray(intent.targets)) {
    errors.push("targets : tableau requis");
  } else {
    intent.targets.forEach((t, i) => {
      if (!t || !Number.isInteger(t.r) || !Number.isInteger(t.c) || t.r < 0 || t.c < 0) {
        errors.push(`targets[${i}] : coordonnées { r, c } entières non négatives requises`);
      }
    });
  }

  if (!Array.isArray(intent.values)) {
    errors.push("values : tableau requis");
  } else {
    intent.values.forEach((v, i) => {
      if (!Number.isInteger(v) || v <= 0) {
        errors.push(`values[${i}] : entier positif requis`);
      }
    });
  }

  if (intent.parameters === null || typeof intent.parameters !== "object" || Array.isArray(intent.parameters)) {
    errors.push("parameters : objet requis");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function serializeIntent(intent) {
  const v = validateIntent(intent);
  if (!v.valid) {
    throw new TypeError(`Impossible de sérialiser une Intent invalide: ${v.errors.join(", ")}`);
  }
  return JSON.stringify({
    methodId: intent.methodId,
    targets: intent.targets.map(({ r, c }) => ({ r, c })),
    values: [...intent.values],
    parameters: { ...intent.parameters },
  });
}

export function deserializeIntent(jsonString) {
  const parsed = JSON.parse(jsonString);
  return createIntent(parsed);
}
