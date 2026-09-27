import { validateSpec } from "../v5/rules/engine.mjs";

// ============================================================================
// M12 — SCEAU DE DÉFI · Atelier Astral
// ----------------------------------------------------------------------------
// Enveloppe :  MATHIC-CHAL-<version>:<payload-base64url>:<crc32hex>
//   payload   : JSON canonique (clés triées) { schemaVersion, gameVersion,
//               ruleVersion, spec, origin, metadata }
//   checksum  : CRC32 (implémentation pure) sur le payload encodé
//
// Invariant de sécurité :
//   raw seal → parse → format → version → checksum → spec → createSession(spec)
// Jamais de session avant validation complète.
//
// Invariant de reproductibilité :
//   decode(encode(spec)) = spec   (rond-point exact, byte-identique à spec égal)
//   Aucun Math.random, aucune horloge système, aucun réseau, aucune I/O.
// ============================================================================

export const ENVELOPE_NAME = "MATHIC-CHAL";
export const SEAL_PREFIX_VERSION = 1;
export const SEAL_SCHEMA_VERSION = 1;
export const SEAL_GAME_VERSION = "v5";
export const SEAL_RULE_VERSION = "v5-engine";
export const SEAL_ORIGIN = "atelier";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const ALPHABET_REV = new Map([...ALPHABET].map((ch, i) => [ch, i]));
const ENVELOPE_RE = /^MATHIC-CHAL-([0-9]+):([A-Za-z0-9_-]+):([0-9a-fA-F]{8})$/;

// ----------------------------------------------------------------------------
// Base64url pur (sans buffer, sans btoa) — navigateur + Node
// ----------------------------------------------------------------------------

function encodeUtf8(str) {
  return new TextEncoder().encode(str);
}

function decodeUtf8(bytes) {
  return new TextDecoder().decode(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
}

export function bytesToBase64url(bytes) {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    out += ALPHABET[b0 >>> 2];
    out += ALPHABET[((b0 & 3) << 4) | (b1 === undefined ? 0 : b1 >>> 4)];
    if (b1 !== undefined) {
      out += ALPHABET[((b1 & 15) << 2) | (b2 === undefined ? 0 : b2 >>> 6)];
      if (b2 !== undefined) out += ALPHABET[b2 & 63];
    }
  }
  return out;
}

export function base64urlToBytes(str) {
  const out = [];
  let acc = 0;
  let bits = 0;
  for (const ch of str) {
    const v = ALPHABET_REV.get(ch);
    if (v === undefined) throw new TypeError(`base64url : caractère invalide '${ch}'`);
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((acc >>> bits) & 0xff);
      acc &= (1 << bits) - 1;
    }
  }
  return out;
}

// ----------------------------------------------------------------------------
// CRC32 (implémentation pure, déterministe)
// ----------------------------------------------------------------------------

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(str) {
  let c = 0xffffffff;
  for (let i = 0; i < str.length; i++) {
    c = CRC32_TABLE[(c ^ str.charCodeAt(i)) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function crc32hex(str) {
  return crc32(str).toString(16).padStart(8, "0");
}

// ----------------------------------------------------------------------------
// JSON canonique — clés triées (numériques d'abord, puis lexicales)
// ----------------------------------------------------------------------------

function compareKeys(a, b) {
  const na = +a;
  const nb = +b;
  const aNum = Number.isInteger(na) && String(na) === a;
  const bNum = Number.isInteger(nb) && String(nb) === b;
  if (aNum && bNum) return na - nb;
  if (aNum) return -1;
  if (bNum) return 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

export function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === "object") {
    const out = {};
    for (const k of Object.keys(value).sort(compareKeys)) out[k] = sortKeys(value[k]);
    return out;
  }
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(sortKeys(value));
}

// ----------------------------------------------------------------------------
// API Sceau
// ----------------------------------------------------------------------------

export function encodeSeal(spec, opts = {}) {
  validateSpec(spec);
  const { origin = SEAL_ORIGIN, createdFrom = "spec", metadata } = opts;
  const payloadJson = canonicalJson({
    schemaVersion: SEAL_SCHEMA_VERSION,
    gameVersion: SEAL_GAME_VERSION,
    ruleVersion: SEAL_RULE_VERSION,
    spec,
    origin,
    metadata: { createdFrom, ...(metadata ?? {}) },
  });
  const payload = bytesToBase64url(encodeUtf8(payloadJson));
  return `${ENVELOPE_NAME}-${SEAL_PREFIX_VERSION}:${payload}:${crc32hex(payload)}`;
}

export function decodeSeal(raw) {
  if (typeof raw !== "string" || raw.length === 0) {
    return { ok: false, reason: "CHECKSUM_OR_FORMAT", message: "Sceau vide ou non textuel." };
  }

  const m = ENVELOPE_RE.exec(raw);
  if (!m) {
    return { ok: false, reason: "FORMAT", message: "Forme MATHIC-CHAL-<version>:<payload>:<checksum> attendue." };
  }

  const [, prefixVersion, payload, checksum] = m;

  if (+prefixVersion !== SEAL_PREFIX_VERSION) {
    return { ok: false, reason: "UNKNOWN_VERSION", message: `Version d'enveloppe ${prefixVersion} inconnue (attendue ${SEAL_PREFIX_VERSION}).` };
  }

  if (crc32(payload).toString(16).padStart(8, "0") !== checksum.toLowerCase()) {
    return { ok: false, reason: "CHECKSUM", message: "Checksum invalide : le Sceau a été altéré." };
  }

  let payloadObj;
  try {
    payloadObj = JSON.parse(decodeUtf8(base64urlToBytes(payload)));
  } catch {
    return { ok: false, reason: "PAYLOAD", message: "Payload illisible." };
  }

  if (!payloadObj || typeof payloadObj !== "object" || Array.isArray(payloadObj)) {
    return { ok: false, reason: "PAYLOAD", message: "Payload non-objet." };
  }

  if (payloadObj.schemaVersion !== SEAL_SCHEMA_VERSION) {
    return { ok: false, reason: "UNKNOWN_VERSION", message: `schemaVersion ${payloadObj.schemaVersion} inconnue (attendue ${SEAL_SCHEMA_VERSION}).` };
  }

  if (payloadObj.gameVersion !== SEAL_GAME_VERSION || payloadObj.ruleVersion !== SEAL_RULE_VERSION) {
    return { ok: false, reason: "UNKNOWN_VERSION", message: "Version moteur/règles incompatible avec ce client." };
  }

  const spec = payloadObj.spec;
  try {
    validateSpec(spec);
  } catch (err) {
    return { ok: false, reason: "INVALID_SPEC", message: err instanceof TypeError ? err.message : "Spec invalide." };
  }

  return { ok: true, spec, payload: payloadObj, seal: raw };
}

export function verifySeal(raw) {
  const r = decodeSeal(raw);
  return { ok: r.ok, reason: r.reason, message: r.message };
}