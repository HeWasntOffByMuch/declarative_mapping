import { describe, expect, it } from "vitest";
import { compile } from "../src/lib/scenespec";
import { solve } from "../src/wfc/solver";
import { Adjacency, SceneSpec, TileCatalog, DIRECTIONS } from "../src/types";

// grass(0), water(1), rubble(2), with fully permissive adjacency so any tile
// may neighbor any other — this isolates the region/weight logic (and the
// coordinate-normalization fix) from adjacency constraints.
function permissiveCatalog(): TileCatalog {
  const labels = ["grass", "water", "rubble"];
  const adjacency: Adjacency = {};
  for (let t = 0; t < 3; t++) {
    adjacency[t] = { N: new Set(), E: new Set(), S: new Set(), W: new Set() };
    for (const d of DIRECTIONS) for (let u = 0; u < 3; u++) adjacency[t][d].add(u);
  }
  return {
    tileSize: 16,
    tiles: labels.map((label, id) => ({
      id,
      label,
      tags: [],
      description: "",
      weight: 1,
      src: { x: 0, y: 0, w: 16, h: 16 },
    })),
    adjacency,
  };
}

describe("full pipeline with absolute (un-normalized) coordinates", () => {
  const catalog = permissiveCatalog();
  // A region the model emitted in ABSOLUTE cell coords (like the live CLI test):
  // top-left 8x8 quadrant of a 16x16 map, forcing water there.
  const spec: SceneSpec = {
    width: 16,
    height: 16,
    seed: 7,
    regions: [
      {
        name: "lake",
        shape: { type: "rect", x: 0, y: 0, w: 8, h: 8 },
        weights: { water: 1 },
        forbidden: ["grass", "rubble"],
      },
    ],
  };

  it("compiles and solves", () => {
    const { input, errors } = compile(spec, catalog);
    expect(errors).toEqual([]);
    const r = solve(input!);
    expect(r.ok).toBe(true);
    expect(r.grid).toHaveLength(256);
  });

  it("normalizes absolute coords so the region stays in its quadrant", () => {
    const { input } = compile(spec, catalog);
    const grid = solve(input!).grid!;
    const at = (x: number, y: number) => grid[y * 16 + x];

    // Inside the (normalized) top-left quadrant: water is forced.
    expect(at(0, 0)).toBe(1);
    expect(at(3, 3)).toBe(1);

    // If normalization had NOT run, w=8/h=8 would read as normalized and cover
    // the whole map (every u,v <= 8), forcing water everywhere. It must not:
    const waterCount = grid.filter((t) => t === 1).length;
    expect(waterCount).toBeLessThan(256);
  });
});
