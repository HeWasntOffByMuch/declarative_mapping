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

export interface AppState {
  /** The uploaded atlas image, once loaded. */
  atlas: HTMLImageElement | null;
  catalog: TileCatalog | null;
  /** Named example scenes; each holds one painted map per layer. */
  examples: Example[];
  lastSpec: SceneSpec | null;
  lastGrid: SceneGrid | null;
  /** User's Anthropic key, held in memory only (never persisted). */
  apiKey: string;
}

export const initialState: AppState = {
  atlas: null,
  catalog: null,
  examples: [makeExample("Example 1")],
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
