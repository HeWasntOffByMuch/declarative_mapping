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
import type { Atlas, AppState } from "../store";

export const PROJECT_VERSION = 4;

export interface SerializedAtlas {
  id: string;
  name: string;
  data: string; // data URL (image/png)
}

export interface ProjectFile {
  version: number;
  tileSize: number;
  /** v4+: multiple atlases. */
  atlases?: SerializedAtlas[];
  /** ≤v3: single atlas data URL (migrated to one atlas on load). */
  atlas?: string;
  tiles: Tile[];
  adjacency: Record<number, Record<Direction, number[]>>;
  examples?: Example[];
  exampleMaps?: Array<LayerMap | null>; // v2
  exampleMap?: LayerMap | null; // v1
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
  if (state.atlases.length === 0 || !state.catalog) return null;
  return {
    version: PROJECT_VERSION,
    tileSize: state.catalog.tileSize,
    atlases: state.atlases.map((a) => ({ id: a.id, name: a.name, data: atlasToDataUrl(a.image) })),
    tiles: state.catalog.tiles,
    adjacency: serializeAdjacency(state.catalog.adjacency),
    examples: state.examples,
  };
}

export interface RestoredProject {
  atlases: Atlas[];
  catalog: TileCatalog;
  examples: AppState["examples"];
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("failed to load atlas image from project"));
    img.src = dataUrl;
  });
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

/** Reconstruct usable state (loads all atlas images) from a ProjectFile. */
export async function applyProject(pf: ProjectFile): Promise<RestoredProject> {
  if (pf.version > PROJECT_VERSION)
    throw new Error(`project version ${pf.version} is newer than this app supports`);

  let tiles = pf.tiles;
  let serialized: SerializedAtlas[];
  if (pf.atlases && pf.atlases.length) {
    serialized = pf.atlases;
  } else if (pf.atlas) {
    // Migrate ≤v3 single atlas → one atlas; tiles gain its sourceId.
    const id = "atlas_migrated";
    serialized = [{ id, name: "tileset", data: pf.atlas }];
    tiles = tiles.map((t) => ({ ...t, sourceId: t.sourceId ?? id }));
  } else {
    throw new Error("project has no atlas");
  }

  const atlases: Atlas[] = await Promise.all(
    serialized.map(async (a) => ({ id: a.id, name: a.name, image: await loadImage(a.data) })),
  );
  const catalog: TileCatalog = {
    tileSize: pf.tileSize,
    tiles,
    adjacency: deserializeAdjacency(pf.adjacency, tiles.length),
  };
  return { atlases, catalog, examples: readExamples(pf) };
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
