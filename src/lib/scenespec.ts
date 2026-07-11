// Compile a SceneSpec (labels, weights, regions, hard placements) plus a
// TileCatalog into concrete WfcInput. Also validates the spec against the
// catalog so the LLM can never reference a tile that doesn't exist.

import { DIRECTIONS, SceneSpec, TileCatalog, RegionShape } from "../types";
import { toSolverAllowed } from "./adjacency";
import type { WfcInput } from "../wfc/solver";

export interface CompileResult {
  input?: WfcInput;
  warnings: string[];
  errors: string[];
}

function labelToId(catalog: TileCatalog): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of catalog.tiles) m.set(t.label, t.id);
  return m;
}

function inShape(shape: RegionShape, u: number, v: number): boolean {
  // u,v are normalized 0..1 cell-center coordinates.
  if (shape.type === "circle") {
    const dx = u - shape.cx;
    const dy = v - shape.cy;
    return dx * dx + dy * dy <= shape.r * shape.r;
  }
  return (
    u >= shape.x && u <= shape.x + shape.w && v >= shape.y && v <= shape.y + shape.h
  );
}

/**
 * The LLM is asked for normalized 0..1 coordinates, but models frequently emit
 * absolute cell coordinates instead (e.g. cx=16 on a 32-wide map). Detect that
 * per-shape — if any coordinate exceeds 1, treat the shape as absolute and
 * divide x-axis fields by width, y-axis fields by height (r by width). Returns
 * a normalized copy; leaves already-normalized specs untouched.
 */
function normalizeCoords(spec: SceneSpec, width: number, height: number): SceneSpec {
  const nx = (v: number | undefined) => (v === undefined ? v : v / width);
  const ny = (v: number | undefined) => (v === undefined ? v : v / height);
  const looksAbsolute = (nums: Array<number | undefined>) =>
    nums.some((n) => n !== undefined && n > 1);

  const regions = spec.regions?.map((rg) => {
    const s = rg.shape;
    if (s.type === "circle") {
      if (!looksAbsolute([s.cx, s.cy, s.r])) return rg;
      return { ...rg, shape: { type: "circle" as const, cx: nx(s.cx)!, cy: ny(s.cy)!, r: nx(s.r)! } };
    }
    if (!looksAbsolute([s.x, s.y, s.w, s.h])) return rg;
    return { ...rg, shape: { type: "rect" as const, x: nx(s.x)!, y: ny(s.y)!, w: nx(s.w)!, h: ny(s.h)! } };
  });

  const hardPlacements = spec.hardPlacements?.map((hp) =>
    looksAbsolute([hp.cx, hp.cy]) ? { ...hp, cx: nx(hp.cx)!, cy: ny(hp.cy)! } : hp,
  );

  return { ...spec, regions, hardPlacements };
}

export function compile(spec: SceneSpec, catalog: TileCatalog): CompileResult {
  const warnings: string[] = [];
  const errors: string[] = [];
  const ids = labelToId(catalog);
  const tileCount = catalog.tiles.length;

  if (tileCount === 0) errors.push("Tile catalog is empty.");
  if (spec.width <= 0 || spec.height <= 0) errors.push("Scene size must be positive.");
  const CAP = 128;
  if (spec.width > CAP || spec.height > CAP)
    errors.push(`Scene exceeds ${CAP}x${CAP} cap.`);

  const resolve = (label: string, ctx: string): number | null => {
    const id = ids.get(label);
    if (id === undefined) {
      warnings.push(`${ctx}: unknown tile "${label}" ignored.`);
      return null;
    }
    return id;
  };

  if (errors.length) return { warnings, errors };

  const { width, height } = spec;
  const cells = width * height;
  spec = normalizeCoords(spec, width, height);

  // Base weights from the catalog, then global multipliers. Disabled tiles
  // (blank/unused cells) get weight 0 so they can never be placed.
  const base = catalog.tiles.map((t) =>
    t.enabled === false ? 0 : Math.max(t.weight, 0),
  );
  const globalMul = new Array(tileCount).fill(1);
  for (const [label, mul] of Object.entries(spec.globalWeights ?? {})) {
    const id = resolve(label, "globalWeights");
    if (id !== null) globalMul[id] = mul;
  }
  const globalForbidden = new Set<number>();
  for (const label of spec.forbidden ?? []) {
    const id = resolve(label, "forbidden");
    if (id !== null) globalForbidden.add(id);
  }

  // Structural check: an enabled, non-forbidden tile with no adjacency in any
  // direction can't legally sit anywhere — the usual cause of a failed solve.
  for (const t of catalog.tiles) {
    if (base[t.id] <= 0 || globalForbidden.has(t.id)) continue;
    const adj = catalog.adjacency[t.id];
    const hasRule = adj && DIRECTIONS.some((d) => adj[d].size > 0);
    if (!hasRule)
      warnings.push(
        `tile "${t.label}" has no adjacency rules — paint it next to other tiles in the Rules tab, or it can't be placed.`,
      );
  }

  // Per-cell weights start as base*global, then regions layer on top.
  const cellWeights: number[][] = new Array(cells);
  for (let c = 0; c < cells; c++) {
    const cx = (c % width + 0.5) / width;
    const cy = (Math.floor(c / width) + 0.5) / height;
    const w = new Array(tileCount);
    for (let t = 0; t < tileCount; t++) {
      w[t] = globalForbidden.has(t) ? 0 : base[t] * globalMul[t];
    }
    for (const region of spec.regions ?? []) {
      if (!inShape(region.shape, cx, cy)) continue;
      for (const rl of region.forbidden ?? []) {
        const id = ids.get(rl);
        if (id !== undefined) w[id] = 0;
      }
      for (const [label, mul] of Object.entries(region.weights)) {
        const id = ids.get(label);
        if (id !== undefined) w[id] *= mul;
      }
    }
    cellWeights[c] = w;
  }

  // Hard placements -> fixed cells.
  const fixed = new Map<number, number>();
  for (const hp of spec.hardPlacements ?? []) {
    const id = resolve(hp.label, "hardPlacements");
    if (id === null) continue;
    const x = Math.min(width - 1, Math.max(0, Math.round(hp.cx * width - 0.5)));
    const y = Math.min(height - 1, Math.max(0, Math.round(hp.cy * height - 0.5)));
    fixed.set(y * width + x, id);
  }

  const input: WfcInput = {
    width,
    height,
    tileCount,
    allowed: toSolverAllowed(catalog.adjacency, tileCount),
    cellWeights,
    fixed,
    seed: spec.seed ?? (Math.random() * 2 ** 31) | 0,
  };

  return { input, warnings, errors };
}
