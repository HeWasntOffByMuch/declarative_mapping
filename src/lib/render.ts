// Composite a solved grid onto a canvas and export it.

import { TileCatalog } from "../types";

/** Resolves a tile's atlas image by its sourceId. */
export type AtlasResolver = Map<string, CanvasImageSource>;

export function drawGrid(
  ctx: CanvasRenderingContext2D,
  grid: number[],
  width: number,
  height: number,
  catalog: TileCatalog,
  atlases: AtlasResolver,
  scale = 1,
): void {
  const ts = catalog.tileSize;
  ctx.imageSmoothingEnabled = false;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const tile = catalog.tiles[grid[y * width + x]];
      if (!tile) continue;
      const atlas = atlases.get(tile.sourceId);
      if (!atlas) continue;
      const { src } = tile;
      ctx.drawImage(
        atlas,
        src.x,
        src.y,
        src.w,
        src.h,
        x * ts * scale,
        y * ts * scale,
        ts * scale,
        ts * scale,
      );
    }
  }
}

/** Composite all layers (ground first) onto the canvas; -1 cells are skipped. */
export function drawScene(
  ctx: CanvasRenderingContext2D,
  layers: number[][],
  width: number,
  height: number,
  catalog: TileCatalog,
  atlases: AtlasResolver,
  scale = 1,
): void {
  for (const layer of layers) drawGrid(ctx, layer, width, height, catalog, atlases, scale);
}

export async function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
      "image/png",
    );
  });
}

/** Export the grid as a Tiled-compatible CSV layer. */
export function gridToCsv(grid: number[], width: number): string {
  const rows: string[] = [];
  for (let i = 0; i < grid.length; i += width) {
    rows.push(grid.slice(i, i + width).join(","));
  }
  return rows.join(",\n");
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
