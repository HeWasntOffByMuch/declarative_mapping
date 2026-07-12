// Multi-layer scene generation. Each layer is solved independently with WFC in
// its own dense tile-index space:
//   - Ground (layer 0): every cell filled from the ground tiles.
//   - Overlay (layer 1+): a synthetic EMPTY tile is added so the layer can be
//     sparse; how much empty space you painted around objects in the Rules tab
//     determines how sparse the output is.
// Each layer's adjacency is inferred from that layer's painted example map.
// Results are mapped back to global tile ids (-1 = empty) and composited.

import {
  Direction,
  DIRECTIONS,
  LayerMap,
  NUM_LAYERS,
  OPPOSITE,
  SceneSpec,
  TileCatalog,
} from "../types";
import { inShape, normalizeCoords } from "./scenespec";
import { solve, WfcInput } from "../wfc/solver";
import type { SceneGrid } from "../store";

const EMPTY_GLOBAL = -1;
/** Base weight of the EMPTY tile on overlay layers (higher = sparser). */
const EMPTY_WEIGHT = 6;

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
  exampleMaps: Array<LayerMap | null>,
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
  const labelToLayer = new Map<string, number>();
  for (const t of catalog.tiles) labelToLayer.set(t.label, t.layer ?? 0);

  const layers: number[][] = [];
  const failures: LayerFailure[] = [];
  let anyLayerRendered = false;

  for (let L = 0; L < NUM_LAYERS; L++) {
    const layerTiles = catalog.tiles.filter((t) => (t.layer ?? 0) === L && t.enabled !== false);
    if (layerTiles.length === 0) {
      layers.push(new Array(width * height).fill(EMPTY_GLOBAL));
      continue;
    }
    anyLayerRendered = true;
    const hasEmpty = L > 0;

    // Local tile set: [EMPTY?, ...layerTiles]. local index -> global id (-1=EMPTY).
    const localToGlobal: number[] = hasEmpty ? [EMPTY_GLOBAL] : [];
    for (const t of layerTiles) localToGlobal.push(t.id);
    const globalToLocal = new Map<number, number>();
    localToGlobal.forEach((g, i) => globalToLocal.set(g, i));
    const localCount = localToGlobal.length;

    // Adjacency inferred from this layer's example, in local index space.
    const allowed = inferLocalAdjacency(exampleMaps[L], globalToLocal, localCount, hasEmpty);

    // Structural check (ground only — overlay can always fall back to EMPTY).
    if (!hasEmpty) {
      for (let i = 0; i < localCount; i++) {
        if (!DIRECTIONS.some((d) => allowed[i][d].length > 0)) {
          const label = catalog.tiles[localToGlobal[i]]?.label ?? `#${localToGlobal[i]}`;
          warnings.push(
            `Ground tile "${label}" has no adjacency rules — paint it next to other tiles in the Rules tab.`,
          );
        }
      }
    }

    // Per-cell weights (local). Base from tile.weight, EMPTY gets EMPTY_WEIGHT.
    const cellWeights = buildCellWeights(spec, catalog, localToGlobal, hasEmpty, width, height, labelToLayer, L);

    // Hard placements that belong to this layer.
    const fixed = new Map<number, number>();
    for (const hp of spec.hardPlacements ?? []) {
      const local = globalIdForLabel(catalog, hp.label);
      if (local == null || (catalog.tiles[local].layer ?? 0) !== L) continue;
      const li = globalToLocal.get(local);
      if (li == null) continue;
      const x = clamp(Math.round(hp.cx * width - 0.5), 0, width - 1);
      const y = clamp(Math.round(hp.cy * height - 0.5), 0, height - 1);
      fixed.set(y * width + x, li);
    }

    const input: WfcInput = { width, height, tileCount: localCount, allowed, cellWeights, fixed, seed: seed + L * 0x51ed270b };
    const r = solve(input);
    if (!r.ok) failures.push({ layer: L, contradictionAt: r.contradictionAt });
    const localGrid = r.grid ?? new Array(width * height).fill(-1);
    layers.push(localGrid.map((li) => (li < 0 ? EMPTY_GLOBAL : localToGlobal[li])));
  }

  if (!anyLayerRendered) errors.push("No enabled tiles to generate from.");
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

function globalIdForLabel(catalog: TileCatalog, label: string): number | null {
  const t = catalog.tiles.find((x) => x.label === label);
  return t ? t.id : null;
}

/** Infer adjacency in local index space from a painted example. */
function inferLocalAdjacency(
  map: LayerMap | null,
  globalToLocal: Map<number, number>,
  localCount: number,
  hasEmpty: boolean,
): Record<number, Record<Direction, number[]>> {
  const sets: Record<number, Record<Direction, Set<number>>> = {};
  for (let i = 0; i < localCount; i++)
    sets[i] = { N: new Set(), E: new Set(), S: new Set(), W: new Set() };

  const link = (a: number, d: Direction, b: number) => {
    sets[a][d].add(b);
    sets[b][OPPOSITE[d]].add(a);
  };

  if (map) {
    const { width, height, cells } = map;
    // Map a painted cell to a local index. -1 (unpainted) -> EMPTY(0) on
    // layers with empty, otherwise skipped.
    const local = (v: number): number =>
      v < 0 ? (hasEmpty ? 0 : -1) : (globalToLocal.get(v) ?? -1);
    const at = (x: number, y: number) => local(cells[y * width + x]);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const t = at(x, y);
        if (t < 0) continue;
        if (x + 1 < width) {
          const e = at(x + 1, y);
          if (e >= 0) link(t, "E", e);
        }
        if (y + 1 < height) {
          const s = at(x, y + 1);
          if (s >= 0) link(t, "S", s);
        }
      }
    }
  }

  const out: Record<number, Record<Direction, number[]>> = {};
  for (let i = 0; i < localCount; i++) {
    out[i] = { N: [], E: [], S: [], W: [] };
    for (const d of DIRECTIONS) out[i][d] = [...sets[i][d]];
  }
  return out;
}

function buildCellWeights(
  spec: SceneSpec,
  catalog: TileCatalog,
  localToGlobal: number[],
  hasEmpty: boolean,
  width: number,
  height: number,
  labelToLayer: Map<string, number>,
  layer: number,
): number[][] {
  const cells = width * height;
  const idToLabel = new Map<number, string>();
  for (const t of catalog.tiles) idToLabel.set(t.id, t.label);

  // Base + global multipliers per local tile.
  const base = localToGlobal.map((g) => {
    if (g === EMPTY_GLOBAL) return EMPTY_WEIGHT;
    return Math.max(catalog.tiles[g].weight, 0);
  });
  const globalMul = new Array(base.length).fill(1);
  const forbidden = new Set<number>();
  for (const [label, mul] of Object.entries(spec.globalWeights ?? {})) {
    const li = localIndexForLabel(localToGlobal, idToLabel, label);
    if (li != null) globalMul[li] = mul;
  }
  for (const label of spec.forbidden ?? []) {
    const li = localIndexForLabel(localToGlobal, idToLabel, label);
    if (li != null) forbidden.add(li);
  }

  const out: number[][] = new Array(cells);
  for (let c = 0; c < cells; c++) {
    const u = ((c % width) + 0.5) / width;
    const v = (Math.floor(c / width) + 0.5) / height;
    const w = base.map((b, i) => (forbidden.has(i) ? 0 : b * globalMul[i]));
    for (const region of spec.regions ?? []) {
      if (!inShape(region.shape, u, v)) continue;
      for (const rl of region.forbidden ?? []) {
        const li = localIndexForLabel(localToGlobal, idToLabel, rl);
        if (li != null) w[li] = 0;
      }
      for (const [label, mul] of Object.entries(region.weights)) {
        if ((labelToLayer.get(label) ?? 0) !== layer) continue;
        const li = localIndexForLabel(localToGlobal, idToLabel, label);
        if (li != null) w[li] *= mul;
      }
    }
    void hasEmpty;
    out[c] = w;
  }
  return out;
}

function localIndexForLabel(
  localToGlobal: number[],
  idToLabel: Map<number, string>,
  label: string,
): number | null {
  for (let i = 0; i < localToGlobal.length; i++) {
    const g = localToGlobal[i];
    if (g !== EMPTY_GLOBAL && idToLabel.get(g) === label) return i;
  }
  return null;
}
