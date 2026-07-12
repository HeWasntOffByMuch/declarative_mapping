// Shared domain types. These are the contract between the UI, the WFC solver,
// and the LLM proxy. Keep them the single source of truth.

export type Direction = "N" | "E" | "S" | "W";
export const DIRECTIONS: Direction[] = ["N", "E", "S", "W"];

/** Scene layers. Ground fills every cell; overlay is sparse (objects). */
export const LAYER_NAMES = ["Ground", "Overlay"] as const;
export const NUM_LAYERS = LAYER_NAMES.length;

/** A painted example grid (row-major; -1 = unpainted). */
export interface LayerMap {
  width: number;
  height: number;
  cells: number[];
}

/**
 * A named example scene (e.g. "dungeon", "forest"). Each holds one painted
 * LayerMap per layer. Generation pools patterns across all examples per layer,
 * so several small focused examples beat one big mixed canvas.
 */
export interface Example {
  id: string;
  name: string;
  maps: Array<LayerMap | null>; // index = layer
}

export function makeExample(name: string): Example {
  const id =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `ex_${Math.random().toString(36).slice(2)}`;
  return { id, name, maps: new Array(NUM_LAYERS).fill(null) };
}

export const OPPOSITE: Record<Direction, Direction> = {
  N: "S",
  S: "N",
  E: "W",
  W: "E",
};

/** A single tile sliced out of the uploaded tileset. */
export interface Tile {
  /** Stable internal id (index into the tile array). */
  id: number;
  /** Which uploaded atlas this tile is sliced from. */
  sourceId: string;
  /** Human/LLM-facing label, e.g. "water", "house_roof". Unique per catalog. */
  label: string;
  /** Free-form tags used for grouping/filtering, e.g. ["structure", "impassable"]. */
  tags: string[];
  /** Short natural-language description sent to the LLM to help it reason. */
  description: string;
  /** Relative base frequency. 1 = neutral. Multiplied by SceneSpec weights. */
  weight: number;
  /**
   * Whether this tile participates in generation. Blank/unused atlas cells are
   * auto-disabled so they never appear in a scene or in the LLM's tile list.
   * Undefined is treated as enabled (back-compat).
   */
  enabled?: boolean;
  /**
   * Which layer this tile belongs to. 0 = ground (fully filled base), 1 =
   * overlay (objects/decoration, sparse — empty space allowed). Undefined = 0.
   */
  layer?: number;
  /** Source rectangle in the uploaded atlas (pixels). */
  src: { x: number; y: number; w: number; h: number };
}

/**
 * Adjacency rules. allowed[tileId][direction] = set of tile ids permitted to
 * sit on that side of the tile. Enforced symmetric by construction.
 */
export type Adjacency = Record<number, Record<Direction, Set<number>>>;

/** Everything the solver and the LLM need to know about the tileset. */
export interface TileCatalog {
  tileSize: number;
  tiles: Tile[];
  adjacency: Adjacency;
}

/** The subset of the catalog sent to the LLM (no image data). */
export interface TileCatalogSummary {
  tileSize: number;
  tiles: Array<Pick<Tile, "label" | "tags" | "description" | "layer">>;
}

// --- SceneSpec: the LLM's structured output, consumed by the solver ---------

export interface CircleShape {
  type: "circle";
  cx: number; // normalized 0..1
  cy: number;
  r: number;
}
export interface RectShape {
  type: "rect";
  x: number; // normalized 0..1 (top-left)
  y: number;
  w: number;
  h: number;
}
export type RegionShape = CircleShape | RectShape;

export interface Region {
  name: string;
  shape: RegionShape;
  /** label -> weight multiplier applied within the region. */
  weights: Record<string, number>;
  /** labels forbidden within the region. */
  forbidden?: string[];
}

export interface HardPlacement {
  label: string;
  cx: number; // normalized 0..1
  cy: number;
}

export interface SceneSpec {
  width: number;
  height: number;
  seed?: number;
  /** label -> global weight multiplier. */
  globalWeights?: Record<string, number>;
  /** labels excluded from the whole scene. */
  forbidden?: string[];
  regions?: Region[];
  hardPlacements?: HardPlacement[];
}
