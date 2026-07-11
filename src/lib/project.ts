// Save/restore a whole project to a single portable file (and to localStorage
// as an autosave safety net). Bundles the atlas image (as a data URL), every
// tile's slice/label/tags/description/weight/enabled, the adjacency rules, and
// the painted example map — so none of the manual authoring work is lost.

import { Adjacency, Direction, DIRECTIONS, Tile, TileCatalog } from "../types";
import type { AppState } from "../store";

export const PROJECT_VERSION = 1;

export interface ProjectFile {
  version: number;
  tileSize: number;
  atlas: string; // data URL (image/png)
  tiles: Tile[];
  adjacency: Record<number, Record<Direction, number[]>>;
  exampleMap: { width: number; height: number; cells: number[] } | null;
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
    exampleMap: state.exampleMap,
  };
}

export interface RestoredProject {
  atlas: HTMLImageElement;
  catalog: TileCatalog;
  exampleMap: AppState["exampleMap"];
}

/** Reconstruct usable state (loads the atlas image) from a ProjectFile. */
export function applyProject(pf: ProjectFile): Promise<RestoredProject> {
  return new Promise((resolve, reject) => {
    if (pf.version !== PROJECT_VERSION)
      return reject(new Error(`unsupported project version ${pf.version}`));
    const img = new Image();
    img.onload = () => {
      const catalog: TileCatalog = {
        tileSize: pf.tileSize,
        tiles: pf.tiles,
        adjacency: deserializeAdjacency(pf.adjacency, pf.tiles.length),
      };
      resolve({ atlas: img, catalog, exampleMap: pf.exampleMap ?? null });
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
