import { describe, expect, it } from "vitest";
import { inferAdjacency, toSolverAllowed } from "../src/lib/adjacency";
import { solve, WfcInput } from "../src/wfc/solver";

// A 3-tile "coast": water(0) - sand(1) - grass(2). Water may touch sand,
// sand may touch water and grass, grass may touch sand. Painted as a
// left->right gradient so inference derives exactly those rules.
function coastSample(w: number, h: number): number[] {
  const cells: number[] = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) cells.push(x < w / 3 ? 0 : x < (2 * w) / 3 ? 1 : 2);
  return cells;
}

describe("adjacency inference", () => {
  it("derives symmetric rules from an example map", () => {
    const adj = inferAdjacency(coastSample(9, 3), 9, 3, 3);
    // water never directly touches grass
    expect(adj[0].E.has(2)).toBe(false);
    expect(adj[2].W.has(0)).toBe(false);
    // sand bridges both
    expect(adj[1].E.has(2)).toBe(true);
    expect(adj[2].W.has(1)).toBe(true);
    // symmetry
    expect(adj[0].E.has(1)).toBe(adj[1].W.has(0));
  });
});

describe("wfc solver", () => {
  const adj = inferAdjacency(coastSample(9, 3), 9, 3, 3);
  const base: WfcInput = {
    width: 12,
    height: 8,
    tileCount: 3,
    allowed: toSolverAllowed(adj, 3),
    cellWeights: Array.from({ length: 96 }, () => [1, 1, 1]),
    seed: 42,
  };

  it("produces a fully collapsed, valid grid", () => {
    const r = solve(base);
    expect(r.ok).toBe(true);
    expect(r.grid).toHaveLength(96);
    // no water adjacent to grass anywhere
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 11; x++) {
        const a = r.grid![y * 12 + x];
        const b = r.grid![y * 12 + x + 1];
        expect(!(a === 0 && b === 2) && !(a === 2 && b === 0)).toBe(true);
      }
  });

  it("is deterministic for a fixed seed", () => {
    expect(solve(base).grid).toEqual(solve({ ...base }).grid);
  });

  it("honors hard placements", () => {
    const r = solve({ ...base, fixed: new Map([[0, 2]]) });
    expect(r.ok).toBe(true);
    expect(r.grid![0]).toBe(2);
  });
});
