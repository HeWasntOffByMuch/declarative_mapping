// Minimal shared app state. Deliberately dependency-free (React context over a
// reducer) so M0 stays lean; swap for Zustand/Redux later if it grows.

import { createContext, useContext } from "react";
import { SceneSpec, TileCatalog } from "./types";

export interface AppState {
  /** The uploaded atlas image, once loaded. */
  atlas: HTMLImageElement | null;
  catalog: TileCatalog | null;
  /** Painted example map for adjacency inference (row-major, -1 = empty). */
  exampleMap: { width: number; height: number; cells: number[] } | null;
  lastSpec: SceneSpec | null;
  lastGrid: { width: number; height: number; cells: number[] } | null;
  /** User's Anthropic key, held in memory only (never persisted). */
  apiKey: string;
}

export const initialState: AppState = {
  atlas: null,
  catalog: null,
  exampleMap: null,
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
