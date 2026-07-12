import { useEffect, useRef } from "react";
import { useStore } from "../store";
import { canvasToPngBlob, downloadBlob, drawScene, gridToCsv } from "../lib/render";
import { LAYER_NAMES } from "../types";

export function ExportTab() {
  const { state } = useStore();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { catalog, atlas, lastGrid } = state;

  useEffect(() => {
    if (!canvasRef.current || !catalog || !atlas || !lastGrid) return;
    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;
    const scale = 2;
    canvasRef.current.width = lastGrid.width * catalog.tileSize * scale;
    canvasRef.current.height = lastGrid.height * catalog.tileSize * scale;
    drawScene(ctx, lastGrid.layers, lastGrid.width, lastGrid.height, catalog, atlas, scale);
  }, [catalog, atlas, lastGrid]);

  if (!lastGrid)
    return (
      <section>
        <h2>Export</h2>
        <p className="muted">Generate a scene first.</p>
      </section>
    );

  const exportPng = async () => {
    if (!canvasRef.current) return;
    downloadBlob(await canvasToPngBlob(canvasRef.current), "scene.png");
  };
  const exportJson = () => {
    downloadBlob(
      new Blob([JSON.stringify({ spec: state.lastSpec, grid: lastGrid }, null, 2)], {
        type: "application/json",
      }),
      "scene.json",
    );
  };
  const exportCsv = () => {
    // One CSV layer per non-empty scene layer (Tiled imports each as a layer).
    lastGrid.layers.forEach((cells, L) => {
      if (cells.every((c) => c < 0)) return; // skip empty layers
      const name = (LAYER_NAMES[L] ?? `layer${L}`).toLowerCase();
      downloadBlob(new Blob([gridToCsv(cells, lastGrid.width)], { type: "text/csv" }), `scene-${name}.csv`);
    });
  };

  return (
    <section>
      <h2>Export</h2>
      <div className="row">
        <button onClick={exportPng}>PNG</button>
        <button onClick={exportJson}>JSON</button>
        <button onClick={exportCsv}>Tiled CSV (per layer)</button>
      </div>
      <div className="canvas-wrap">
        <canvas ref={canvasRef} />
      </div>
    </section>
  );
}
