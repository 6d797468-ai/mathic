export function makeBoard(rows, cols, tiles) {
  const cap = rows * cols;
  if (tiles.length > cap) throw new RangeError(`board ${rows}×${cols} trop petit pour ${tiles.length} tuiles`);
  const cells = new Array(cap).fill(null);
  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i];
    cells[i] = { id: i, kind: t.kind, v: t.v };
  }
  return { rows, cols, cells };
}

export function allPresent(cells) {
  return cells.filter((c) => c !== null);
}

export function opTiles(cells) {
  return allPresent(cells).filter((c) => c.kind === "op");
}

export function numTiles(cells) {
  return allPresent(cells).filter((c) => c.kind === "num");
}

export function renderGrid(board) {
  const lines = [];
  for (let r = 0; r < board.rows; r++) {
    const row = [];
    for (let c = 0; c < board.cols; c++) {
      const cell = board.cells[r * board.cols + c];
      row.push(cell === null ? "  ." : ` ${cell.kind === "op" ? cell.v : cell.v}`);
    }
    lines.push(" " + row.join("   "));
  }
  return lines.join("\n");
}