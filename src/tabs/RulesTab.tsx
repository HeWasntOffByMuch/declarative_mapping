import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../store";
import { inferAdjacency } from "../lib/adjacency";
import { DIRECTIONS } from "../types";

// M2: paint a small example scene using the real tiles as a brush palette, then
// infer adjacency rules from which tiles end up next to which. Painting on a
// canvas (click-drag), tiles drawn straight from the atlas.

const ERASE = -1;

export function RulesTab() {
  const { state, update } = useStore();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const painting = useRef(false);

  const catalog = state.catalog;
  const atlas = state.atlas;

  // Grid dimensions, seeded from a restored example map if present.
  const [dims, setDims] = useState(() => ({
    w: state.exampleMap?.width ?? 16,
    h: state.exampleMap?.height ?? 12,
  }));
  const [cells, setCells] = useState<number[]>(() =>
    state.exampleMap && state.exampleMap.width === (state.exampleMap?.width ?? 16)
      ? state.exampleMap.cells.slice()
      : new Array(16 * 12).fill(ERASE),
  );
  const [brush, setBrush] = useState<number>(ERASE);

  // If an example map arrives later (e.g. project load), adopt it.
  useEffect(() => {
    if (state.exampleMap) {
      setDims({ w: state.exampleMap.width, h: state.exampleMap.height });
      setCells(state.exampleMap.cells.slice());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.exampleMap]);

  // Default the brush to the first enabled tile once a catalog exists.
  useEffect(() => {
    if (brush === ERASE && catalog) {
      const first = catalog.tiles.find((t) => t.enabled !== false);
      if (first) setBrush(first.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog]);

  const cellPx = useMemo(() => {
    const ts = catalog?.tileSize ?? 16;
    return ts * Math.max(1, Math.round(28 / ts));
  }, [catalog]);

  const resize = (w: number, h: number) => {
    setDims({ w, h });
    setCells(new Array(w * h).fill(ERASE));
  };

  const paintAt = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((clientX - rect.left) / cellPx);
    const y = Math.floor((clientY - rect.top) / cellPx);
    if (x < 0 || y < 0 || x >= dims.w || y >= dims.h) return;
    setCells((c) => {
      const i = y * dims.w + x;
      if (c[i] === brush) return c;
      const next = c.slice();
      next[i] = brush;
      return next;
    });
  };

  // Redraw whenever the painted grid changes.
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !catalog) return;
    canvas.width = dims.w * cellPx;
    canvas.height = dims.h * cellPx;
    ctx.imageSmoothingEnabled = false;
    for (let y = 0; y < dims.h; y++) {
      for (let x = 0; x < dims.w; x++) {
        const px = x * cellPx;
        const py = y * cellPx;
        const t = cells[y * dims.w + x];
        if (t >= 0 && atlas && catalog.tiles[t]) {
          const { src } = catalog.tiles[t];
          ctx.drawImage(atlas, src.x, src.y, src.w, src.h, px, py, cellPx, cellPx);
        } else {
          ctx.fillStyle = "#181b21";
          ctx.fillRect(px, py, cellPx, cellPx);
        }
        ctx.strokeStyle = "rgba(255,255,255,0.06)";
        ctx.strokeRect(px + 0.5, py + 0.5, cellPx, cellPx);
      }
    }
  }, [cells, dims, cellPx, atlas, catalog]);

  const ruleCount = useMemo(() => {
    if (!catalog) return 0;
    let n = 0;
    for (const t of Object.keys(catalog.adjacency))
      for (const d of DIRECTIONS) n += catalog.adjacency[+t][d].size;
    return n;
  }, [catalog]);

  const runInference = () => {
    if (!catalog) return;
    const adjacency = inferAdjacency(cells, dims.w, dims.h, catalog.tiles.length);
    update({
      catalog: { ...catalog, adjacency },
      exampleMap: { width: dims.w, height: dims.h, cells: cells.slice() },
    });
  };

  if (!catalog || !atlas)
    return (
      <section>
        <h2>Rules</h2>
        <p className="muted">Upload a tileset in the Tiles tab first.</p>
      </section>
    );

  const enabled = catalog.tiles.filter((t) => t.enabled !== false);
  // Swatches are SWATCH px but tiles are tileSize px — scale the atlas so
  // exactly one tile fills each swatch (otherwise neighbors bleed in).
  const SWATCH = 34;
  const pScale = SWATCH / catalog.tileSize;

  return (
    <section>
      <h2>Rules</h2>
      <p className="muted">
        Paint an example scene; adjacency is inferred from which tiles you place
        next to which. Then hit <em>Infer adjacency</em>.
      </p>

      <div className="palette">
        <button
          className={`brush-swatch${brush === ERASE ? " sel" : ""}`}
          title="Erase"
          onClick={() => setBrush(ERASE)}
        >
          ⌫
        </button>
        {enabled.map((t) => (
          <button
            key={t.id}
            className={`brush-swatch${brush === t.id ? " sel" : ""}`}
            title={t.label}
            onClick={() => setBrush(t.id)}
            style={{
              backgroundImage: `url(${atlas.src})`,
              backgroundPosition: `-${t.src.x * pScale}px -${t.src.y * pScale}px`,
              backgroundSize: `${atlas.naturalWidth * pScale}px ${atlas.naturalHeight * pScale}px`,
            }}
          />
        ))}
      </div>

      <div className="row">
        <label>
          W{" "}
          <input
            type="number"
            min={2}
            max={64}
            value={dims.w}
            onChange={(e) => resize(Number(e.target.value), dims.h)}
            style={{ width: 56 }}
          />
        </label>
        <label>
          H{" "}
          <input
            type="number"
            min={2}
            max={64}
            value={dims.h}
            onChange={(e) => resize(dims.w, Number(e.target.value))}
            style={{ width: 56 }}
          />
        </label>
        <button onClick={runInference}>Infer adjacency</button>
        <button onClick={() => setCells(new Array(dims.w * dims.h).fill(ERASE))}>
          Clear
        </button>
        <span className="muted">{ruleCount} directional allowances</span>
      </div>

      <div className="canvas-wrap" style={{ display: "inline-block" }}>
        <canvas
          ref={canvasRef}
          style={{ cursor: "crosshair", touchAction: "none" }}
          onMouseDown={(e) => {
            painting.current = true;
            paintAt(e.clientX, e.clientY);
          }}
          onMouseMove={(e) => painting.current && paintAt(e.clientX, e.clientY)}
          onMouseUp={() => (painting.current = false)}
          onMouseLeave={() => (painting.current = false)}
        />
      </div>
    </section>
  );
}
