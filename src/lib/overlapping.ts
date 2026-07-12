// Overlapping-model WFC support.
//
// The overlapping model learns N×N *patterns* from a painted example rather than
// single-tile adjacency, so it captures multi-cell structure — wall corners,
// runs, doorways — that pairwise adjacency can't. Crucially it reduces to the
// ordinary tiled solver: treat each unique N×N pattern as a meta-tile, and two
// patterns are "adjacent" in a direction iff their 1-cell-offset overlap agrees.
// We then run the existing solve() over patterns and read each output cell's
// top-left tile.

import { Direction, DIRECTIONS } from "../types";

export interface PatternModel {
  n: number;
  count: number;
  /** Flattened N×N tile values for each pattern (row-major). */
  patterns: number[][];
  /** Representative (top-left) tile value per pattern — what an output cell shows. */
  topLeft: number[];
  /** Occurrence weight per pattern. */
  weights: number[];
  /** allowed[p][dir] = patterns that may sit on that side of p. */
  allowed: Record<number, Record<Direction, number[]>>;
}

const DELTA: Record<Direction, [number, number]> = {
  N: [0, -1],
  S: [0, 1],
  E: [1, 0],
  W: [-1, 0],
};

export interface Sample {
  cells: number[]; // row-major tile values
  width: number;
  height: number;
}

/**
 * Build one pattern model by pooling N×N patterns across several samples (the
 * painted examples). Pattern frequency accumulates across all samples, so a
 * shape that appears in multiple examples is weighted more heavily.
 *
 * @param skip a value marking unpainted cells — any N×N window containing it is
 *   not extracted. Pass a value that never appears to extract everything.
 */
export function buildPatternModel(
  samples: Sample[],
  requestedN: number,
  skip: number,
): PatternModel {
  let n = requestedN;
  for (const s of samples) n = Math.min(n, s.width, s.height);
  n = Math.max(1, n);

  const keyToIndex = new Map<string, number>();
  const patterns: number[][] = [];
  const weights: number[] = [];

  for (const { cells, width, height } of samples) {
    for (let y = 0; y + n <= height; y++) {
      for (let x = 0; x + n <= width; x++) {
        const p: number[] = [];
        let ok = true;
        for (let j = 0; j < n && ok; j++)
          for (let i = 0; i < n; i++) {
            const v = cells[(y + j) * width + (x + i)];
            if (v === skip) { ok = false; break; }
            p.push(v);
          }
        if (!ok) continue;
        const key = p.join(",");
        const idx = keyToIndex.get(key);
        if (idx === undefined) {
          keyToIndex.set(key, patterns.length);
          patterns.push(p);
          weights.push(1);
        } else {
          weights[idx]++;
        }
      }
    }
  }

  const count = patterns.length;
  const topLeft = patterns.map((p) => p[0]);
  const allowed = computeAdjacency(patterns, n);
  return { n, count, patterns, topLeft, weights, allowed };
}

/** Two patterns agree in direction d if their 1-cell-shifted overlap matches. */
function agrees(a: number[], b: number[], n: number, dx: number, dy: number): boolean {
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const bi = i - dx;
      const bj = j - dy;
      if (bi < 0 || bj < 0 || bi >= n || bj >= n) continue; // outside overlap
      if (a[j * n + i] !== b[bj * n + bi]) return false;
    }
  }
  return true;
}

function computeAdjacency(patterns: number[][], n: number): PatternModel["allowed"] {
  const count = patterns.length;
  const allowed: PatternModel["allowed"] = {};
  for (let p = 0; p < count; p++) allowed[p] = { N: [], E: [], S: [], W: [] };
  for (let p = 0; p < count; p++) {
    for (const d of DIRECTIONS) {
      const [dx, dy] = DELTA[d];
      for (let q = 0; q < count; q++) {
        if (agrees(patterns[p], patterns[q], n, dx, dy)) allowed[p][d].push(q);
      }
    }
  }
  return allowed;
}
