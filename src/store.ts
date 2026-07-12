// Minimal shared app state. Deliberately dependency-free (React context over a
// reducer) so M0 stays lean; swap for Zustand/Redux later if it grows.

import { createContext, useContext } from "react";
import { LayerMap, NUM_LAYERS, SceneSpec, TileCatalog } from "./types";

/** A generated scene: one grid of tile ids per layer (-1 = empty). */
export interface SceneGrid {
  width: number;
  height: number;
  layers: number[][];
}

export interface AppState {
  /** The uploaded atlas image, once loaded. */
  atlas: HTMLImageElement | null;
  catalog: TileCatalog | null;
  /** Painted example map per layer (index = layer). */
  exampleMaps: Array<LayerMap | null>;
  lastSpec: SceneSpec | null;
  lastGrid: SceneGrid | null;
  /** User's Anthropic key, held in memory only (never persisted). */
  apiKey: string;
}

export const initialState: AppState = {
  atlas: null,
  catalog: null,
  exampleMaps: new Array(NUM_LAYERS).fill(null),
  lastSpec: null,
  lastGrid: null,
  apiKey: "",
};

export type Updater = (patch: Partial<AppState>) => void;

export const StoreContext = createContext<{ state: AppState; update: Updater }>({
  state: initialState,
  update: () => {},
});

export const useStore = () => useContext(StoreContext);
