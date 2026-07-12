import { describe, expect, it } from "vitest";
import { solve, WfcInput } from "../src/wfc/solver";
import { compile } from "../src/lib/scenespec";
import { Adjacency, SceneSpec, TileCatalog } from "../src/types";

describe("solver returns a partial grid on failure", () => {
  it("fails but reports where, with collapsed cells preserved", () => {
    // Tile 1 permits no neighbors; force it into a cell -> guaranteed conflict.
    const input: WfcInput = {
      width: 2,
      height: 2,
      tileCount: 2,
      allowed: {
        0: { N: [0, 1], E: [0, 1], S: [0, 1], W: [0, 1] },
        1: { N: [], E: [], S: [], W: [] },
      },
      cellWeights: Array.from({ length: 4 }, () => [1, 1]),
      fixed: new Map([[0, 1]]),
      seed: 3,
    };
    const r = solve(input);
    expect(r.ok).toBe(false);
    expect(r.grid).toHaveLength(4); // partial, not undefined
    expect(r.contradictionAt).not.toBeUndefined();
    expect(r.grid!.some((t) => t === -1)).toBe(true); // some cells left un-collapsed
  });
});

describe("compile warns about tiles with no adjacency rules", () => {
  it("flags an enabled tile that was never painted next to anything", () => {
    const adjacency: Adjacency = {
      0: { N: new Set([0]), E: new Set([0]), S: new Set([0]), W: new Set([0]) },
      1: { N: new Set(), E: new Set(), S: new Set(), W: new Set() }, // no rules
    };
    const catalog: TileCatalog = {
      tileSize: 16,
      tiles: [0, 1].map((id) => ({
        id,
        sourceId: "s",
        label: id === 0 ? "grass" : "lonely",
        tags: [],
        description: "",
        weight: 1,
        src: { x: 0, y: 0, w: 16, h: 16 },
      })),
      adjacency,
    };
    const spec: SceneSpec = { width: 4, height: 4 };
    const { warnings } = compile(spec, catalog);
    expect(warnings.some((w) => w.includes('"lonely"') && w.includes("no adjacency"))).toBe(true);
  });
});
