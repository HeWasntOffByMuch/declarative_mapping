// Build adjacency rules by observing an example map the user painted.
//
// For every pair of horizontally/vertically adjacent cells in the sample, we
// record that those two tiles may sit next to each other in that direction.
// Symmetry is enforced so the solver never sees an asymmetric rule.

import { Adjacency, Direction, DIRECTIONS, OPPOSITE } from "../types";

function emptyAdjacency(tileCount: number): Adjacency {
  const adj: Adjacency = {};
  for (let t = 0; t < tileCount; t++) {
    adj[t] = { N: new Set(), E: new Set(), S: new Set(), W: new Set() };
  }
  return adj;
}

function link(adj: Adjacency, a: number, d: Direction, b: number) {
  adj[a][d].add(b);
  adj[b][OPPOSITE[d]].add(a); // keep it symmetric
}

/**
 * @param sample Row-major grid of tile ids; use -1 for "unpainted" cells.
 */
export function inferAdjacency(
  sample: number[],
  width: number,
  height: number,
  tileCount: number,
): Adjacency {
  const adj = emptyAdjacency(tileCount);
  const at = (x: number, y: number) => sample[y * width + x];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const t = at(x, y);
      if (t < 0) continue;
      if (x + 1 < width) {
        const e = at(x + 1, y);
        if (e >= 0) link(adj, t, "E", e);
      }
      if (y + 1 < height) {
        const s = at(x, y + 1);
        if (s >= 0) link(adj, t, "S", s);
      }
    }
  }
  return adj;
}

/** Convert Set-based adjacency into the array form the solver expects. */
export function toSolverAllowed(
  adj: Adjacency,
  tileCount: number,
): Record<number, Record<Direction, number[]>> {
  const out: Record<number, Record<Direction, number[]>> = {};
  for (let t = 0; t < tileCount; t++) {
    out[t] = { N: [], E: [], S: [], W: [] };
    for (const d of DIRECTIONS) out[t][d] = [...adj[t][d]];
  }
  return out;
}
