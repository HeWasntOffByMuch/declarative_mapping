// Multi-layer scene generation via the overlapping WFC model.
//
// Each layer is generated independently and composited:
//   - Ground (layer 0): every cell filled.
//   - Overlay layers (walls, objects): unpainted cells in the example count as
//     EMPTY, so the layer stays as sparse (or as solid) as you painted it.
// For each layer we learn N×N patterns from that layer's painted example and
// solve in pattern space with the shared tiled solver, then read each output
// cell's top-left tile. Patterns capture wall corners/runs/doorways that plain
// pairwise adjacency cannot, so painted rooms come out looking like rooms.

import { Example, NUM_LAYERS, SceneSpec, TileCatalog } from "../types";
import { inShape, normalizeCoords } from "./scenespec";
import { buildPatternModel, Sample } from "./overlapping";
import { solve, WfcInput } from "../wfc/solver";
import type { SceneGrid } from "../store";

const EMPTY = -1; // in output layer grids
const EMPTY_VAL = -2; // empty marker inside pattern samples (distinct from -1 "unpainted")
const SKIP = -999; // window-excluding sentinel (never appears in real samples)
/** Pattern size. 3 captures wall corners with thickness; clamped to sample size. */
export const PATTERN_N = 3;

export interface LayerFailure {
  layer: number;
  contradictionAt?: number;
}
export interface SceneResult {
  ok: boolean;
  grid?: SceneGrid;
  warnings: string[];
  errors: string[];
  failures: LayerFailure[];
}

export function generateScene(
  rawSpec: SceneSpec,
  catalog: TileCatalog,
  examples: Example[],
  seed: number,
): SceneResult {
  const warnings: string[] = [];
  const errors: string[] = [];
  if (catalog.tiles.length === 0) errors.push("Tile catalog is empty.");
  if (rawSpec.width <= 0 || rawSpec.height <= 0) errors.push("Scene size must be positive.");
  const CAP = 128;
  if (rawSpec.width > CAP || rawSpec.height > CAP) errors.push(`Scene exceeds ${CAP}x${CAP} cap.`);
  if (errors.length) return { ok: false, warnings, errors, failures: [] };

  const { width, height } = rawSpec;
  const spec = normalizeCoords(rawSpec, width, height);

  const idToLabel = new Map<number, string>();
  const labelToLayer = new Map<string, number>();
  for (const t of catalog.tiles) {
    idToLabel.set(t.id, t.label);
    labelToLayer.set(t.label, t.layer ?? 0);
  }
  const labelToId = new Map<string, number>();
  for (const t of catalog.tiles) labelToId.set(t.label, t.id);

  const layers: number[][] = [];
  const failures: LayerFailure[] = [];

  for (let L = 0; L < NUM_LAYERS; L++) {
    const hasEmpty = L > 0;
    const layerTiles = catalog.tiles.filter((t) => (t.layer ?? 0) === L && t.enabled !== false);
    const maps = examples.map((ex) => ex.maps[L]).filter((m): m is NonNullable<typeof m> => !!m);

    // Empty layers / unpainted overlay → all empty.
    if (layerTiles.length === 0 || (maps.length === 0 && hasEmpty)) {
      layers.push(new Array(width * height).fill(EMPTY));
      continue;
    }
    if (maps.length === 0) {
      errors.push(`Paint a ${L === 0 ? "Ground" : "layer " + L} example in the Rules tab first.`);
      layers.push(new Array(width * height).fill(EMPTY));
      continue;
    }

    // Build samples from every example painted on this layer. Overlay's
    // unpainted cells become EMPTY_VAL (a real value patterns can include);
    // ground's unpainted cells are SKIP (windows touching them aren't used).
    const enabledIds = new Set(layerTiles.map((t) => t.id));
    const samples: Sample[] = maps.map((m) => ({
      width: m.width,
      height: m.height,
      cells: m.cells.map((v) =>
        v < 0 ? (hasEmpty ? EMPTY_VAL : SKIP) : enabledIds.has(v) ? v : hasEmpty ? EMPTY_VAL : SKIP,
      ),
    }));
    const model = buildPatternModel(samples, PATTERN_N, SKIP);
    if (model.count === 0) {
      warnings.push(
        `${L === 0 ? "Ground" : "Overlay"}: painted example too small/empty to learn patterns (need at least a ${PATTERN_N}×${PATTERN_N} painted area).`,
      );
      layers.push(new Array(width * height).fill(EMPTY));
      if (L === 0) errors.push("Ground layer produced no patterns.");
      continue;
    }

    // Per-pattern global multiplier (by the pattern's representative tile).
    const globalMul = model.topLeft.map((tv) => tileMult(tv, spec.globalWeights, idToLabel));
    const forbiddenGlobal = model.topLeft.map((tv) => isForbidden(tv, spec.forbidden, idToLabel));

    // Per-cell weights: base occurrence × global × region.
    const cells = width * height;
    const cellWeights: number[][] = new Array(cells);
    for (let c = 0; c < cells; c++) {
      const u = ((c % width) + 0.5) / width;
      const v = (Math.floor(c / width) + 0.5) / height;
      const w = new Array(model.count);
      for (let p = 0; p < model.count; p++) {
        w[p] = forbiddenGlobal[p] ? 0 : model.weights[p] * globalMul[p];
      }
      for (const region of spec.regions ?? []) {
        if (!inShape(region.shape, u, v)) continue;
        for (let p = 0; p < model.count; p++) {
          const label = idToLabel.get(model.topLeft[p]);
          if (label == null || (labelToLayer.get(label) ?? 0) !== L) continue;
          if (region.forbidden?.includes(label)) w[p] = 0;
          const mul = region.weights[label];
          if (mul != null) w[p] *= mul;
        }
      }
      cellWeights[c] = w;
    }

    // Soft hard-placements: boost patterns whose top-left is the requested tile.
    for (const hp of spec.hardPlacements ?? []) {
      const gid = labelToId.get(hp.label);
      if (gid == null || (catalog.tiles[gid]?.layer ?? 0) !== L) continue;
      const x = clamp(Math.round(hp.cx * width - 0.5), 0, width - 1);
      const y = clamp(Math.round(hp.cy * height - 0.5), 0, height - 1);
      const cw = cellWeights[y * width + x];
      for (let p = 0; p < model.count; p++) if (model.topLeft[p] === gid) cw[p] *= 1000;
    }

    const input: WfcInput = {
      width,
      height,
      tileCount: model.count,
      allowed: model.allowed,
      cellWeights,
      seed: seed + L * 0x51ed270b,
      maxAttempts: 15,
    };
    const r = solve(input);
    if (!r.ok) failures.push({ layer: L, contradictionAt: r.contradictionAt });
    const patternGrid = r.grid ?? new Array(cells).fill(-1);
    layers.push(
      patternGrid.map((p) => {
        if (p < 0) return EMPTY;
        const tv = model.topLeft[p];
        return tv === EMPTY_VAL ? EMPTY : tv;
      }),
    );
  }

  return {
    ok: failures.length === 0 && errors.length === 0,
    grid: errors.length ? undefined : { width, height, layers },
    warnings,
    errors,
    failures,
  };
}

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}

function tileMult(
  tileVal: number,
  globalWeights: Record<string, number> | undefined,
  idToLabel: Map<number, string>,
): number {
  if (tileVal < 0 || !globalWeights) return 1;
  const label = idToLabel.get(tileVal);
  return label && globalWeights[label] != null ? globalWeights[label] : 1;
}

function isForbidden(
  tileVal: number,
  forbidden: string[] | undefined,
  idToLabel: Map<number, string>,
): boolean {
  if (tileVal < 0 || !forbidden) return false;
  const label = idToLabel.get(tileVal);
  return label != null && forbidden.includes(label);
}
