import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../store";
import { LAYER_NAMES, LayerMap, NUM_LAYERS } from "../types";

// M8: paint an example per layer. Ground (layer 0) is the filled base; overlay
// layers are sparse (unpainted = empty). When editing an overlay you see the
// ground beneath for context. Painting is saved per layer; generation infers
// each layer's adjacency from its own example.

const ERASE = -1;

export function RulesTab() {
  const { state, update } = useStore();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const painting = useRef(false);

  const catalog = state.catalog;
  const atlas = state.atlas;

  const seedMap = state.exampleMaps.find((m) => m) ?? null;
  const [dims, setDims] = useState(() => ({
    w: seedMap?.width ?? 16,
    h: seedMap?.height ?? 12,
  }));
  const [layer, setLayer] = useState(0);
  const [brush, setBrush] = useState<number>(ERASE);
  // One painted grid per layer, kept in local state; committed to the store on
  // each stroke end so autosave + generation see the latest.
  const [maps, setMaps] = useState<number[][]>(() =>
    Array.from({ length: NUM_LAYERS }, (_, L) => {
      const m = state.exampleMaps[L];
      return m && m.width === (seedMap?.width ?? 16) && m.height === (seedMap?.height ?? 12)
        ? m.cells.slice()
        : new Array((seedMap?.width ?? 16) * (seedMap?.height ?? 12)).fill(ERASE);
    }),
  );

  // Adopt example maps that arrive later (e.g. project load).
  useEffect(() => {
    if (!seedMap) return;
    setDims({ w: seedMap.width, h: seedMap.height });
    setMaps(
      Array.from({ length: NUM_LAYERS }, (_, L) => {
        const m = state.exampleMaps[L];
        return m && m.width === seedMap.width && m.height === seedMap.height
          ? m.cells.slice()
          : new Array(seedMap.width * seedMap.height).fill(ERASE);
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.exampleMaps]);

  useEffect(() => {
    if (brush === ERASE && catalog) {
      const first = catalog.tiles.find((t) => t.enabled !== false && (t.layer ?? 0) === layer);
      if (first) setBrush(first.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog, layer]);

  const cellPx = useMemo(() => {
    const ts = catalog?.tileSize ?? 16;
    return ts * Math.max(1, Math.round(28 / ts));
  }, [catalog]);

  const commit = (nextMaps: number[][]) => {
    const exampleMaps: Array<LayerMap | null> = nextMaps.map((cells) => ({
      width: dims.w,
      height: dims.h,
      cells: cells.slice(),
    }));
    update({ exampleMaps });
  };

  const resize = (w: number, h: number) => {
    setDims({ w, h });
    const next = Array.from({ length: NUM_LAYERS }, () => new Array(w * h).fill(ERASE));
    setMaps(next);
    update({ exampleMaps: next.map((cells) => ({ width: w, height: h, cells })) });
  };

  const paintAt = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((clientX - rect.left) / cellPx);
    const y = Math.floor((clientY - rect.top) / cellPx);
    if (x < 0 || y < 0 || x >= dims.w || y >= dims.h) return;
    setMaps((m) => {
      const i = y * dims.w + x;
      if (m[layer][i] === brush) return m;
      const next = m.map((c, L) => (L === layer ? c.slice() : c));
      next[layer][i] = brush;
      return next;
    });
  };

  // Redraw: ground (context) then the active overlay on top; active-layer cells
  // draw at full strength, lower layers dimmed when editing above them.
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !catalog || !atlas) return;
    canvas.width = dims.w * cellPx;
    canvas.height = dims.h * cellPx;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#181b21";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let L = 0; L <= layer; L++) {
      ctx.globalAlpha = L === layer ? 1 : 0.4;
      for (let y = 0; y < dims.h; y++) {
        for (let x = 0; x < dims.w; x++) {
          const t = maps[L][y * dims.w + x];
          if (t < 0 || !catalog.tiles[t]) continue;
          const { src } = catalog.tiles[t];
          ctx.drawImage(atlas, src.x, src.y, src.w, src.h, x * cellPx, y * cellPx, cellPx, cellPx);
        }
      }
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    for (let y = 0; y <= dims.h; y++) {
      ctx.beginPath(); ctx.moveTo(0, y * cellPx + 0.5); ctx.lineTo(canvas.width, y * cellPx + 0.5); ctx.stroke();
    }
    for (let x = 0; x <= dims.w; x++) {
      ctx.beginPath(); ctx.moveTo(x * cellPx + 0.5, 0); ctx.lineTo(x * cellPx + 0.5, canvas.height); ctx.stroke();
    }
  }, [maps, dims, cellPx, atlas, catalog, layer]);

  if (!catalog || !atlas)
    return (
      <section>
        <h2>Rules</h2>
        <p className="muted">Upload a tileset in the Tiles tab first.</p>
      </section>
    );

  const layerTiles = catalog.tiles.filter((t) => t.enabled !== false && (t.layer ?? 0) === layer);
  const SWATCH = 34;
  const pScale = SWATCH / catalog.tileSize;
  const painted = maps[layer].filter((c) => c >= 0).length;

  return (
    <section>
      <h2>Rules</h2>
      <p className="muted">
        Paint an example per layer. Ground fills every cell; overlay is sparse
        (leave gaps — they mean "empty"). Editing an overlay shows the ground
        beneath for context.
      </p>

      <div className="palette" style={{ marginBottom: "0.5rem" }}>
        {LAYER_NAMES.map((name, i) => (
          <button
            key={i}
            className={`layer-tab${layer === i ? " sel" : ""}`}
            onClick={() => {
              setLayer(i);
              setBrush(ERASE);
            }}
          >
            {name}
          </button>
        ))}
      </div>

      <div className="palette">
        <button
          className={`brush-swatch${brush === ERASE ? " sel" : ""}`}
          title="Erase"
          onClick={() => setBrush(ERASE)}
        >
          ⌫
        </button>
        {layerTiles.map((t) => (
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
        {layerTiles.length === 0 && (
          <span className="muted">No tiles assigned to this layer (set a tile's layer in the Tiles tab).</span>
        )}
      </div>

      <div className="row">
        <label>W <input type="number" min={2} max={64} value={dims.w} onChange={(e) => resize(Number(e.target.value), dims.h)} style={{ width: 56 }} /></label>
        <label>H <input type="number" min={2} max={64} value={dims.h} onChange={(e) => resize(dims.w, Number(e.target.value))} style={{ width: 56 }} /></label>
        <button
          onClick={() => {
            const cleared = maps.map((c, L) => (L === layer ? new Array(dims.w * dims.h).fill(ERASE) : c));
            setMaps(cleared);
            commit(cleared);
          }}
        >
          Clear layer
        </button>
        <span className="muted">{painted} painted on {LAYER_NAMES[layer]}</span>
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
          onMouseUp={() => {
            painting.current = false;
            commit(maps);
          }}
          onMouseLeave={() => {
            if (painting.current) commit(maps);
            painting.current = false;
          }}
        />
      </div>
    </section>
  );
}
