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
      id, label, layer, tags: [], description: "", weight: 1,
      src: { x: 0, y: 0, w: 16, h: 16 },
    })),
    adjacency: emptyAdj(4),
  };
}

describe("generateScene — multiple layers", () => {
  const w = 6, h = 4;
  // Ground: grass/water checkerboard (both may neighbor each other).
  const ground: LayerMap = { width: 4, height: 2, cells: [0, 1, 0, 1, 1, 0, 1, 0] };
  // Overlay: a couple objects with empty gaps around them (id -1 = unpainted).
  const overlay: LayerMap = { width: 4, height: 2, cells: [2, -1, 3, -1, -1, -1, -1, -1] };
  const spec: SceneSpec = { width: w, height: h };

  it("solves both layers and composites correctly", () => {
    const res = generateScene(spec, catalog(), [ground, overlay], 11);
    expect(res.errors).toEqual([]);
    expect(res.ok).toBe(true);
    expect(res.grid!.layers).toHaveLength(2);

    const [g, o] = res.grid!.layers;
    // Ground is fully filled with ground tiles only.
    expect(g).toHaveLength(w * h);
    expect(g.every((t) => t === 0 || t === 1)).toBe(true);

    // Overlay holds only overlay tiles or empty (-1) — never ground tiles.
    expect(o.every((t) => t === -1 || t === 2 || t === 3)).toBe(true);
    // And it is genuinely sparse (some empty cells), not fully packed.
    expect(o.some((t) => t === -1)).toBe(true);
  });
});
