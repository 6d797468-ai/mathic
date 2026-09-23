export const OP = {
  "+": (a, b) => a + b,
  "-": (a, b) => (a - b >= 0 ? a - b : null),
  "*": (a, b) => a * b,
  "/": (a, b) => (b !== 0 && a % b === 0 ? a / b : null),
};

export const OPS = Object.keys(OP);

export function eval2(a, op, b) {
  return OP[op](a, b);
}