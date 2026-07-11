// Compile a SceneSpec (labels, weights, regions, hard placements) plus a
// TileCatalog into concrete WfcInput. Also validates the spec against the
// catalog so the LLM can never reference a tile that doesn't exist.

import { SceneSpec, TileCatalog, RegionShape } from "../types";
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

  // Base weights from the catalog, then global multipliers.
  const base = catalog.tiles.map((t) => Math.max(t.weight, 0));
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
