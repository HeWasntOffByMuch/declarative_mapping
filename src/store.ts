// Minimal shared app state. Deliberately dependency-free (React context over a
// reducer) so M0 stays lean; swap for Zustand/Redux later if it grows.

import { createContext, useContext } from "react";
import { Example, makeExample, SceneSpec, TileCatalog } from "./types";

/** A generated scene: one grid of tile ids per layer (-1 = empty). */
export interface SceneGrid {
  width: number;
  height: number;
  layers: number[][];
}

/** An uploaded tileset image. Tiles reference it by id via Tile.sourceId. */
export interface Atlas {
  id: string;
  name: string;
  image: HTMLImageElement;
}

export interface AppState {
  /** All uploaded tileset images; tiles across them share one catalog. */
  atlases: Atlas[];
  catalog: TileCatalog | null;
  /** Named example scenes; each holds one painted map per layer. */
  examples: Example[];
  lastSpec: SceneSpec | null;
  lastGrid: SceneGrid | null;
  /** User's Anthropic key, held in memory only (never persisted). */
  apiKey: string;
}

export const initialState: AppState = {
  atlases: [],
  catalog: null,
  examples: [makeExample("Example 1")],
  lastSpec: null,
  lastGrid: null,
  apiKey: "",
};

/** Accepts a patch object, or a function of the latest state returning a patch
 *  (use the function form inside async callbacks to avoid stale closures). */
export type Updater = (
  patch: Partial<AppState> | ((prev: AppState) => Partial<AppState>),
) => void;

export const StoreContext = createContext<{ state: AppState; update: Updater }>({
  state: initialState,
  update: () => {},
});

export const useStore = () => useContext(StoreContext);

/** sourceId -> image, for rendering tiles from whichever atlas they came from. */
export function atlasImages(atlases: Atlas[]): Map<string, HTMLImageElement> {
  return new Map(atlases.map((a) => [a.id, a.image]));
}
