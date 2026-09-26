export const OPS = ["+", "-", "*", "/"];

export function apply2(a, op, b, { min = null, max = null } = {}) {
  if (!OPS.includes(op)) return null;
  if (!Number.isInteger(a) || !Number.isInteger(b)) return null;
  let r;
  switch (op) {
    case "+":
      r = a + b;
      break;
    case "-":
      if (a - b < 0) return null;
      r = a - b;
      break;
    case "*":
      r = a * b;
      break;
    case "/":
      if (b === 0 || a % b !== 0) return null;
      r = a / b;
      break;
    default:
      return null;
  }
  if (!Number.isInteger(r)) return null;
  if (min !== null && r < min) return null;
  if (max !== null && r > max) return null;
  return r;
}

export function reason(a, op, b) {
  const aIsNum = Number.isInteger(a);
  const bIsNum = Number.isInteger(b);
  if (!aIsNum || !bIsNum) return "opérande non entier";
  if (op === "/" && b === 0) return `${a} ÷ 0 : division par zéro interdite`;
  if (op === "/" && a % b !== 0) return `${a} ÷ ${b} : ${a} n'est pas divisible par ${b}`;
  if (op === "-" && a - b < 0) return `${a} − ${b} : résultat négatif interdit par la règle`;
  return "opération rejetée";
}