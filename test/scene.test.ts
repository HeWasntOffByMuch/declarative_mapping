import { describe, expect, it } from "vitest";
import { generateScene } from "../src/lib/scene";
import { Adjacency, LayerMap, SceneSpec, TileCatalog } from "../src/types";

function emptyAdj(n: number): Adjacency {
  const a: Adjacency = {};
  for (let i = 0; i < n; i++) a[i] = { N: new Set(), E: new Set(), S: new Set(), W: new Set() };
  return a;
}

// grass(0)/water(1) on ground; tree(2)/rock(3) on overlay.
function catalog(): TileCatalog {
  const defs: Array<[string, number]> = [
    ["grass", 0], ["water", 0], ["tree", 1], ["rock", 1],
  ];
  return {
    tileSize: 16,
    tiles: defs.map(([label, layer], id) => ({
      id, sourceId: "s", label, layer, tags: [], description: "", weight: 1,
      src: { x: 0, y: 0, w: 16, h: 16 },
    })),
    adjacency: emptyAdj(4),
  };
}

// Build a W×H example grid from a (x,y)->value function.
function grid(w: number, h: number, f: (x: number, y: number) => number): LayerMap {
  const cells: number[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) cells.push(f(x, y));
  return { width: w, height: h, cells };
}

describe("generateScene — multiple layers (overlapping model)", () => {
  const w = 10, h = 10;
  // Ground: water stripe on the left, grass elsewhere (both fully painted).
  const ground = grid(10, 10, (x) => (x < 3 ? 1 : 0));
  // Overlay (walls): mostly empty with a solid 4×4 wall block — gives both
  // wall patterns and a freely-tileable all-empty pattern.
  const overlay = grid(10, 10, (x, y) => (x >= 2 && x <= 5 && y >= 2 && y <= 5 ? 2 : -1));
  const spec: SceneSpec = { width: w, height: h };

  it("solves both layers and keeps each layer to its own tiles", () => {
    const examples = [{ id: "a", name: "test", maps: [ground, overlay] }];
    const res = generateScene(spec, catalog(), examples, 11);
    expect(res.errors).toEqual([]);
    expect(res.ok).toBe(true);
    expect(res.grid!.layers).toHaveLength(2);

    const [g, o] = res.grid!.layers;
    // Ground fully filled with ground tiles only.
    expect(g).toHaveLength(w * h);
    expect(g.every((t) => t === 0 || t === 1)).toBe(true);

    // Overlay holds only its own tiles or empty — never a ground tile.
    expect(o.every((t) => t === -1 || t === 2 || t === 3)).toBe(true);
    expect(o.some((t) => t === -1)).toBe(true); // genuinely sparse
  });

  it("pools ground patterns across multiple examples", () => {
    // One example is all grass, another all water → the pooled model can place
    // either; the run must succeed and stay within the ground tile set.
    const grassOnly = grid(8, 8, () => 0);
    const waterOnly = grid(8, 8, () => 1);
    const examples = [
      { id: "a", name: "grass", maps: [grassOnly, null] },
      { id: "b", name: "water", maps: [waterOnly, null] },
    ];
    const res = generateScene(spec, catalog(), examples, 3);
    expect(res.errors).toEqual([]);
    expect(res.ok).toBe(true);
    expect(res.grid!.layers[0].every((t) => t === 0 || t === 1)).toBe(true);
  });
});
