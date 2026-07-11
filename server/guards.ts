// Runtime validation of untrusted request bodies before they reach a provider.

import { TileCatalogSummary } from "./scenespec-tool";

export { selectProvider } from "./providers";

export function TileCatalogSummaryGuard(value: unknown): TileCatalogSummary {
  if (typeof value !== "object" || value === null) throw new Error("missing catalog");
  const c = value as Record<string, unknown>;
  if (!Array.isArray(c.tiles) || c.tiles.length === 0)
    throw new Error("catalog.tiles must be a non-empty array");
  const tiles = c.tiles.map((t, i) => {
    const o = t as Record<string, unknown>;
    if (typeof o.label !== "string") throw new Error(`tile ${i} missing label`);
    return {
      label: o.label,
      tags: Array.isArray(o.tags) ? o.tags.map(String) : [],
      description: typeof o.description === "string" ? o.description : "",
    };
  });
  return { tileSize: Number(c.tileSize ?? 16), tiles };
}
