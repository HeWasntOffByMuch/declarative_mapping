import { useEffect, useRef } from "react";
import { useStore } from "../store";
import { canvasToPngBlob, downloadBlob, drawGrid, gridToCsv } from "../lib/render";

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
    drawGrid(ctx, lastGrid.cells, lastGrid.width, lastGrid.height, catalog, atlas, scale);
  }, [catalog, atlas, lastGrid]);

  if (!lastGrid) return <section><h2>Export</h2><p>Generate a scene first.</p></section>;

  const exportPng = async () => {
    if (!canvasRef.current) return;
    downloadBlob(await canvasToPngBlob(canvasRef.current), "scene.png");
  };
  const exportJson = () => {
    const payload = { spec: state.lastSpec, grid: lastGrid };
    downloadBlob(
      new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }),
      "scene.json",
    );
  };
  const exportCsv = () => {
    downloadBlob(
      new Blob([gridToCsv(lastGrid.cells, lastGrid.width)], { type: "text/csv" }),
      "scene.csv",
    );
  };

  return (
    <section>
      <h2>Export</h2>
      <div className="row">
        <button onClick={exportPng}>PNG</button>
        <button onClick={exportJson}>JSON</button>
        <button onClick={exportCsv}>Tiled CSV</button>
      </div>
      <div className="canvas-wrap">
        <canvas ref={canvasRef} />
      </div>
    </section>
  );
}
