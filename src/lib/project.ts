// Save/restore a whole project to a single portable file (and to localStorage
// as an autosave safety net). Bundles the atlas image (as a data URL), every
// tile's slice/label/tags/description/weight/enabled, the adjacency rules, and
// the painted example map — so none of the manual authoring work is lost.

import {
  Adjacency,
  Direction,
  DIRECTIONS,
  Example,
  LayerMap,
  makeExample,
  NUM_LAYERS,
  Tile,
  TileCatalog,
} from "../types";
import type { AppState } from "../store";

export const PROJECT_VERSION = 3;

export interface ProjectFile {
  version: number;
  tileSize: number;
  atlas: string; // data URL (image/png)
  tiles: Tile[];
  adjacency: Record<number, Record<Direction, number[]>>;
  /** v3+: named example scenes. */
  examples?: Example[];
  /** v2: single per-layer maps. v1: single `exampleMap`. Both migrated. */
  exampleMaps?: Array<LayerMap | null>;
  exampleMap?: LayerMap | null;
}

function atlasToDataUrl(img: HTMLImageElement): string {
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  canvas.getContext("2d")!.drawImage(img, 0, 0);
  return canvas.toDataURL("image/png");
}

function serializeAdjacency(adj: Adjacency): Record<number, Record<Direction, number[]>> {
  const out: Record<number, Record<Direction, number[]>> = {};
  for (const key of Object.keys(adj)) {
    const t = Number(key);
    out[t] = { N: [], E: [], S: [], W: [] };
    for (const d of DIRECTIONS) out[t][d] = [...adj[t][d]];
  }
  return out;
}

function deserializeAdjacency(
  ser: Record<number, Record<Direction, number[]>>,
  tileCount: number,
): Adjacency {
  const adj: Adjacency = {};
  for (let t = 0; t < tileCount; t++) {
    const src = ser[t];
    adj[t] = { N: new Set(), E: new Set(), S: new Set(), W: new Set() };
    if (src) for (const d of DIRECTIONS) adj[t][d] = new Set(src[d] ?? []);
  }
  return adj;
}

/** Build a ProjectFile from current state, or null if there's nothing to save. */
export function serializeProject(state: AppState): ProjectFile | null {
  if (!state.atlas || !state.catalog) return null;
  return {
    version: PROJECT_VERSION,
    tileSize: state.catalog.tileSize,
    atlas: atlasToDataUrl(state.atlas),
    tiles: state.catalog.tiles,
    adjacency: serializeAdjacency(state.catalog.adjacency),
    examples: state.examples,
  };
}

export interface RestoredProject {
  atlas: HTMLImageElement;
  catalog: TileCatalog;
  examples: AppState["examples"];
}

/** Read examples from v3, or migrate v2 (single per-layer maps) / v1 (single map). */
function readExamples(pf: ProjectFile): Example[] {
  if (pf.examples && pf.examples.length) return pf.examples;
  const maps: Array<LayerMap | null> = new Array(NUM_LAYERS).fill(null);
  if (pf.exampleMaps) {
    for (let i = 0; i < NUM_LAYERS; i++) maps[i] = pf.exampleMaps[i] ?? null;
  } else if (pf.exampleMap) {
    maps[0] = pf.exampleMap;
  }
  const ex = makeExample("Example 1");
  ex.maps = maps;
  return [ex];
}

/** Reconstruct usable state (loads the atlas image) from a ProjectFile. */
export function applyProject(pf: ProjectFile): Promise<RestoredProject> {
  return new Promise((resolve, reject) => {
    if (pf.version > PROJECT_VERSION)
      return reject(new Error(`project version ${pf.version} is newer than this app supports`));
    const img = new Image();
    img.onload = () => {
      const catalog: TileCatalog = {
        tileSize: pf.tileSize,
        tiles: pf.tiles,
        adjacency: deserializeAdjacency(pf.adjacency, pf.tiles.length),
      };
      resolve({ atlas: img, catalog, examples: readExamples(pf) });
    };
    img.onerror = () => reject(new Error("failed to load atlas image from project"));
    img.src = pf.atlas;
  });
}

// --- localStorage autosave -------------------------------------------------

const LS_KEY = "declarative-mapping:autosave:v1";

export function autosave(state: AppState): void {
  const pf = serializeProject(state);
  if (!pf) return;
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(pf));
  } catch {
    // Quota exceeded (large atlas) — autosave is best-effort; explicit
    // Save-project export still works.
  }
}

export function loadAutosave(): ProjectFile | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as ProjectFile) : null;
  } catch {
    return null;
  }
}
