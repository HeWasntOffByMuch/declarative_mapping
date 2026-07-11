// Wave Function Collapse — simple tiled (adjacency) model.
//
// Each cell holds a bitset-like boolean array of still-possible tiles. We
// repeatedly collapse the lowest-entropy cell to a single tile (weighted), then
// propagate the adjacency constraint outward. On contradiction we restart with
// a fresh seed, up to a cap. This is intentionally straightforward rather than
// maximally optimized; correctness and readability first.

import { DIRECTIONS, Direction, OPPOSITE } from "../types";
import { makeRng } from "./rng";

export interface WfcInput {
  width: number;
  height: number;
  tileCount: number;
  /** allowed[tileId][direction] -> list of permitted neighbor tile ids. */
  allowed: Record<number, Record<Direction, number[]>>;
  /** Effective per-cell weight of each tile. weights[y*width+x][tileId]. */
  cellWeights: number[][];
  /** Pre-collapsed cells (from hard placements). cellIndex -> tileId. */
  fixed?: Map<number, number>;
  seed: number;
  maxAttempts?: number;
}

export interface WfcResult {
  ok: boolean;
  /**
   * Row-major grid of tile ids (length width*height). On success every cell is
   * a valid tile id. On failure this is the best partial from the last attempt:
   * collapsed cells hold their tile id, un-collapsed cells hold -1.
   */
  grid?: number[];
  attempts: number;
  /** Cell index where the last contradiction occurred, for diagnostics. */
  contradictionAt?: number;
}

const DELTA: Record<Direction, [number, number]> = {
  N: [0, -1],
  S: [0, 1],
  E: [1, 0],
  W: [-1, 0],
};

export function solve(input: WfcInput): WfcResult {
  const maxAttempts = input.maxAttempts ?? 10;
  let last: RunResult = { ok: false };

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const res = runOnce(input, input.seed + attempt * 0x9e3779b9);
    if (res.ok) return { ok: true, grid: res.grid, attempts: attempt + 1 };
    last = res;
  }
  // Return the last attempt's partial grid so callers can visualize where it
  // got stuck rather than showing nothing.
  return {
    ok: false,
    grid: last.grid,
    attempts: maxAttempts,
    contradictionAt: last.contradictionAt,
  };
}

interface RunResult {
  ok: boolean;
  grid?: number[];
  contradictionAt?: number;
}

function runOnce(input: WfcInput, seed: number): RunResult {
  const { width, height, tileCount, allowed, cellWeights } = input;
  const cells = width * height;
  const rng = makeRng(seed);

  // possible[cell][tile] = still allowed?
  const possible: boolean[][] = Array.from({ length: cells }, () =>
    new Array(tileCount).fill(true),
  );

  const idx = (x: number, y: number) => y * width + x;

  // Apply hard placements up front, then propagate their constraints.
  const stack: number[] = [];
  if (input.fixed) {
    for (const [cell, tile] of input.fixed) {
      for (let t = 0; t < tileCount; t++) possible[cell][t] = t === tile;
      stack.push(cell);
    }
    // Capture the seed cell before propagate() drains the stack.
    const seedCell = stack[0];
    if (!propagate(stack)) return { ok: false, grid: snapshot(), contradictionAt: seedCell };
  }

  let remaining = cells - (input.fixed?.size ?? 0);

  while (remaining > 0) {
    const cell = pickLowestEntropy();
    if (cell === -1) break; // all collapsed
    if (!collapse(cell)) return { ok: false, grid: snapshot(), contradictionAt: cell };
    stack.push(cell);
    if (!propagate(stack)) return { ok: false, grid: snapshot(), contradictionAt: cell };
    remaining = countRemaining();
  }

  const grid = new Array<number>(cells);
  for (let c = 0; c < cells; c++) {
    const t = possible[c].indexOf(true);
    if (t === -1) return { ok: false, grid: snapshot(), contradictionAt: c };
    grid[c] = t;
  }
  return { ok: true, grid };

  function options(cell: number): number[] {
    const out: number[] = [];
    const p = possible[cell];
    for (let t = 0; t < tileCount; t++) if (p[t]) out.push(t);
    return out;
  }

  function isCollapsed(cell: number): boolean {
    let count = 0;
    const p = possible[cell];
    for (let t = 0; t < tileCount; t++) if (p[t] && ++count > 1) return false;
    return count === 1;
  }

  function countRemaining(): number {
    let n = 0;
    for (let c = 0; c < cells; c++) if (!isCollapsed(c)) n++;
    return n;
  }

  // Best-effort partial: collapsed cells -> tile id, everything else -> -1.
  function snapshot(): number[] {
    const g = new Array<number>(cells);
    for (let c = 0; c < cells; c++) g[c] = isCollapsed(c) ? possible[c].indexOf(true) : -1;
    return g;
  }

  function pickLowestEntropy(): number {
    let best = -1;
    let bestCount = Infinity;
    let bestNoise = Infinity;
    for (let c = 0; c < cells; c++) {
      const opts = options(c);
      if (opts.length <= 1) continue;
      const noise = rng.next();
      if (opts.length < bestCount || (opts.length === bestCount && noise < bestNoise)) {
        best = c;
        bestCount = opts.length;
        bestNoise = noise;
      }
    }
    return best;
  }

  function collapse(cell: number): boolean {
    const opts = options(cell);
    if (opts.length === 0) return false;
    const w = opts.map((t) => Math.max(cellWeights[cell][t], 0));
    const chosen = opts[rng.weightedIndex(w)];
    for (let t = 0; t < tileCount; t++) possible[cell][t] = t === chosen;
    return true;
  }

  // Constraint propagation: for each dirty cell, remove any neighbor option
  // that has no supporting tile across the shared edge.
  function propagate(dirty: number[]): boolean {
    while (dirty.length) {
      const cell = dirty.pop()!;
      const cx = cell % width;
      const cy = Math.floor(cell / width);
      const selfOpts = options(cell);
      if (selfOpts.length === 0) return false;

      for (const d of DIRECTIONS) {
        const [dx, dy] = DELTA[d];
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const ncell = idx(nx, ny);

        // Support set = union of what our current options allow in direction d.
        const support = new Set<number>();
        for (const t of selfOpts) for (const a of allowed[t][d]) support.add(a);

        let changed = false;
        const np = possible[ncell];
        for (let t = 0; t < tileCount; t++) {
          if (np[t] && !support.has(t)) {
            np[t] = false;
            changed = true;
          }
        }
        if (changed) {
          if (options(ncell).length === 0) return false;
          dirty.push(ncell);
        }
        void OPPOSITE; // symmetry is guaranteed by how `allowed` is built
      }
    }
    return true;
  }
}
