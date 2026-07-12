import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../store";
import { Example, LAYER_NAMES, LayerMap, makeExample, NUM_LAYERS } from "../types";

// M9: paint several NAMED examples (e.g. "dungeon", "forest"), each with a
// Ground and an Overlay layer. Generation pools patterns across all examples
// per layer. Unpainted overlay cells mean "empty"; resizing preserves paint.

const ERASE = -1;
const DEF_W = 16, DEF_H = 12;

function seedDims(ex: Example) {
  const m = ex.maps.find((x) => x);
  return { w: m?.width ?? DEF_W, h: m?.height ?? DEF_H };
}
function loadMaps(ex: Example, w: number, h: number): number[][] {
  return Array.from({ length: NUM_LAYERS }, (_, L) => {
    const m = ex.maps[L];
    return m && m.width === w && m.height === h ? m.cells.slice() : new Array(w * h).fill(ERASE);
  });
}

export function RulesTab() {
  const { state, update } = useStore();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const painting = useRef(false);
  const catalog = state.catalog;
  const atlas = state.atlas;

  const [activeId, setActiveId] = useState(() => state.examples[0]?.id);
  const active = state.examples.find((e) => e.id === activeId) ?? state.examples[0];

  const [dims, setDims] = useState(() => seedDims(active));
  const [layer, setLayer] = useState(0);
  const [brush, setBrush] = useState<number>(ERASE);
  const [maps, setMaps] = useState<number[][]>(() => {
    const d = seedDims(active);
    return loadMaps(active, d.w, d.h);
  });

  // Reload local paint whenever the active example (or the examples list) changes.
  useEffect(() => {
    if (!active) return;
    const d = seedDims(active);
    setDims(d);
    setMaps(loadMaps(active, d.w, d.h));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, state.examples]);

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

  // --- example list ops -----------------------------------------------------
  const writeExamples = (next: Example[]) => update({ examples: next });

  const commit = (nextMaps: number[][]) => {
    if (!active) return;
    const layerMaps: Array<LayerMap | null> = nextMaps.map((cells) => ({
      width: dims.w,
      height: dims.h,
      cells: cells.slice(),
    }));
    writeExamples(state.examples.map((e) => (e.id === active.id ? { ...e, maps: layerMaps } : e)));
  };

  const addExample = () => {
    const ex = makeExample(`Example ${state.examples.length + 1}`);
    writeExamples([...state.examples, ex]);
    setActiveId(ex.id);
  };
  const renameExample = (name: string) =>
    writeExamples(state.examples.map((e) => (e.id === active.id ? { ...e, name } : e)));
  const deleteExample = () => {
    if (state.examples.length <= 1) return;
    const remaining = state.examples.filter((e) => e.id !== active.id);
    writeExamples(remaining);
    setActiveId(remaining[0].id);
  };

  const resize = (w: number, h: number) => {
    if (!Number.isFinite(w) || !Number.isFinite(h) || w < 1 || h < 1) return;
    const { w: ow, h: oh } = dims;
    const next = maps.map((cells) => {
      const grid = new Array(w * h).fill(ERASE);
      for (let y = 0; y < Math.min(h, oh); y++)
        for (let x = 0; x < Math.min(w, ow); x++) grid[y * w + x] = cells[y * ow + x];
      return grid;
    });
    setDims({ w, h });
    setMaps(next);
    commitWith(next, w, h);
  };
  // commit with explicit dims (used by resize before dims state settles).
  const commitWith = (nextMaps: number[][], w: number, h: number) => {
    if (!active) return;
    const layerMaps = nextMaps.map((cells) => ({ width: w, height: h, cells: cells.slice() }));
    writeExamples(state.examples.map((e) => (e.id === active.id ? { ...e, maps: layerMaps } : e)));
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
          const t = maps[L]?.[y * dims.w + x];
          if (t == null || t < 0 || !catalog.tiles[t]) continue;
          const { src } = catalog.tiles[t];
          ctx.drawImage(atlas, src.x, src.y, src.w, src.h, x * cellPx, y * cellPx, cellPx, cellPx);
        }
      }
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    for (let y = 0; y <= dims.h; y++) { ctx.beginPath(); ctx.moveTo(0, y*cellPx+0.5); ctx.lineTo(canvas.width, y*cellPx+0.5); ctx.stroke(); }
    for (let x = 0; x <= dims.w; x++) { ctx.beginPath(); ctx.moveTo(x*cellPx+0.5, 0); ctx.lineTo(x*cellPx+0.5, canvas.height); ctx.stroke(); }
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
  const painted = maps[layer]?.filter((c) => c >= 0).length ?? 0;

  return (
    <section>
      <h2>Rules</h2>

      {/* Example selector */}
      <div className="palette" style={{ marginBottom: "0.4rem" }}>
        {state.examples.map((e) => (
          <button
            key={e.id}
            className={`layer-tab${e.id === active?.id ? " sel" : ""}`}
            onClick={() => setActiveId(e.id)}
          >
            {e.name || "(unnamed)"}
          </button>
        ))}
        <button className="layer-tab" onClick={addExample} title="Add example">+ Example</button>
      </div>
      <div className="row" style={{ marginBottom: "0.75rem" }}>
        <label>
          Name{" "}
          <input value={active?.name ?? ""} onChange={(e) => renameExample(e.target.value)} placeholder="dungeon, forest…" />
        </label>
        <button onClick={deleteExample} disabled={state.examples.length <= 1}>Delete example</button>
        <span className="muted">Generation pools patterns from all examples.</span>
      </div>

      <p className="muted">
        Ground fills every cell; overlay is sparse (gaps = empty). Editing an
        overlay shows the ground beneath.
      </p>

      {/* Layer tabs */}
      <div className="palette" style={{ marginBottom: "0.5rem" }}>
        {LAYER_NAMES.map((name, i) => (
          <button key={i} className={`layer-tab${layer === i ? " sel" : ""}`} onClick={() => { setLayer(i); setBrush(ERASE); }}>
            {name}
          </button>
        ))}
      </div>

      <div className="palette">
        <button className={`brush-swatch${brush === ERASE ? " sel" : ""}`} title="Erase" onClick={() => setBrush(ERASE)}>⌫</button>
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
          <span className="muted">No tiles on this layer (set a tile's layer in the Tiles tab).</span>
        )}
      </div>

      <div className="row">
        <label>W <input type="number" min={2} max={64} value={dims.w} onChange={(e) => resize(Number(e.target.value), dims.h)} style={{ width: 56 }} /></label>
        <label>H <input type="number" min={2} max={64} value={dims.h} onChange={(e) => resize(dims.w, Number(e.target.value))} style={{ width: 56 }} /></label>
        <button onClick={() => { const c = maps.map((cells, L) => (L === layer ? new Array(dims.w * dims.h).fill(ERASE) : cells)); setMaps(c); commit(c); }}>Clear layer</button>
        <span className="muted">{painted} painted on {LAYER_NAMES[layer]}</span>
      </div>

      <div className="canvas-wrap" style={{ display: "inline-block" }}>
        <canvas
          ref={canvasRef}
          style={{ cursor: "crosshair", touchAction: "none" }}
          onMouseDown={(e) => { painting.current = true; paintAt(e.clientX, e.clientY); }}
          onMouseMove={(e) => painting.current && paintAt(e.clientX, e.clientY)}
          onMouseUp={() => { painting.current = false; commit(maps); }}
          onMouseLeave={() => { if (painting.current) commit(maps); painting.current = false; }}
        />
      </div>
    </section>
  );
}
