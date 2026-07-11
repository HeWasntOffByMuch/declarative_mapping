// Shared domain types. These are the contract between the UI, the WFC solver,
// and the LLM proxy. Keep them the single source of truth.

export type Direction = "N" | "E" | "S" | "W";
export const DIRECTIONS: Direction[] = ["N", "E", "S", "W"];

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
  /** Human/LLM-facing label, e.g. "water", "house_roof". Unique per catalog. */
  label: string;
  /** Free-form tags used for grouping/filtering, e.g. ["structure", "impassable"]. */
  tags: string[];
  /** Short natural-language description sent to the LLM to help it reason. */
  description: string;
  /** Relative base frequency. 1 = neutral. Multiplied by SceneSpec weights. */
  weight: number;
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
  tiles: Array<Pick<Tile, "label" | "tags" | "description">>;
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
