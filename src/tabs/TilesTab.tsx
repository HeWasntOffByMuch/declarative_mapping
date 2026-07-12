import { useEffect, useMemo, useRef, useState } from "react";
import { Atlas, useStore } from "../store";
import { Adjacency, LAYER_NAMES, Tile } from "../types";
import { fuzzyMatch } from "../lib/fuzzy";

// Upload one or more tileset atlases (shared tile size). All tiles across all
// sheets live in one catalog; each tile remembers its source atlas. Label /
// tag / weight / layer / enable per tile, with a fuzzy search that dims
// non-matching tiles. Blank (transparent) cells are auto-disabled.

function emptyAdjacency(n: number): Adjacency {
  const adj: Adjacency = {};
  for (let t = 0; t < n; t++)
    adj[t] = { N: new Set(), E: new Set(), S: new Set(), W: new Set() };
  return adj;
}

function newId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `atlas_${Math.random().toString(36).slice(2)}`;
}

/** Slice one atlas into tiles (ids start at `startId`); flag transparent cells. */
function sliceAtlas(img: HTMLImageElement, sourceId: string, tileSize: number, startId: number): Tile[] {
  const cols = Math.floor(img.naturalWidth / tileSize);
  const rows = Math.floor(img.naturalHeight / tileSize);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx?.drawImage(img, 0, 0);
  const isBlank = (x: number, y: number): boolean => {
    if (!ctx) return false;
    const { data } = ctx.getImageData(x, y, tileSize, tileSize);
    for (let i = 3; i < data.length; i += 4) if (data[i] !== 0) return false;
    return true;
  };
  const tiles: Tile[] = [];
  let id = startId;
  for (let ry = 0; ry < rows; ry++) {
    for (let rx = 0; rx < cols; rx++) {
      const x = rx * tileSize;
      const y = ry * tileSize;
      tiles.push({
        id: id++,
        sourceId,
        label: `tile_${rx}_${ry}`,
        tags: [],
        description: "",
        weight: 1,
        enabled: !isBlank(x, y),
        src: { x, y, w: tileSize, h: tileSize },
      });
    }
  }
  return tiles;
}

function AtlasPreview({ atlas, tileSize }: { atlas: Atlas; tileSize: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const img = atlas.image;
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const scale = Math.max(1, Math.min(6, Math.floor(460 / img.naturalWidth) || 1));
    canvas.width = img.naturalWidth * scale;
    canvas.height = img.naturalHeight * scale;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "rgba(91,140,255,0.6)";
    for (let x = 0; x <= img.naturalWidth; x += tileSize) {
      ctx.beginPath(); ctx.moveTo(x * scale + 0.5, 0); ctx.lineTo(x * scale + 0.5, canvas.height); ctx.stroke();
    }
    for (let y = 0; y <= img.naturalHeight; y += tileSize) {
      ctx.beginPath(); ctx.moveTo(0, y * scale + 0.5); ctx.lineTo(canvas.width, y * scale + 0.5); ctx.stroke();
    }
  }, [img, tileSize]);
  return (
    <div style={{ marginBottom: "0.5rem" }}>
      <div className="muted" style={{ marginBottom: 2 }}>{atlas.name}</div>
      <div className="canvas-wrap" style={{ maxWidth: 480, display: "inline-block" }}>
        <canvas ref={ref} />
      </div>
    </div>
  );
}

function Thumb({ atlas, tile, scale }: { atlas: Atlas; tile: Tile; scale: number }) {
  const { src } = tile;
  return (
    <div
      className="thumb"
      style={{
        width: src.w * scale,
        height: src.h * scale,
        backgroundImage: `url(${atlas.image.src})`,
        backgroundPosition: `-${src.x * scale}px -${src.y * scale}px`,
        backgroundSize: `${atlas.image.naturalWidth * scale}px ${atlas.image.naturalHeight * scale}px`,
      }}
    />
  );
}

export function TilesTab() {
  const { state, update } = useStore();
  const [tileSize, setTileSize] = useState(() => state.catalog?.tileSize ?? 16);
  const [query, setQuery] = useState("");

  const atlasById = useMemo(() => new Map(state.atlases.map((a) => [a.id, a])), [state.atlases]);

  const addTileset = (file: File) => {
    const img = new Image();
    const atlas: Atlas = { id: newId(), name: file.name.replace(/\.[^.]+$/, ""), image: img };
    img.onload = () => {
      // Functional update: read the latest state (this runs async, after other
      // uploads may have landed) so sheets append instead of clobbering.
      update((s) => {
        const size = s.catalog?.tileSize ?? tileSize;
        const startId = s.catalog?.tiles.length ?? 0;
        const newTiles = sliceAtlas(img, atlas.id, size, startId);
        const tiles = [...(s.catalog?.tiles ?? []), ...newTiles];
        return { atlases: [...s.atlases, atlas], catalog: { tileSize: size, tiles, adjacency: emptyAdjacency(tiles.length) } };
      });
    };
    img.src = URL.createObjectURL(file);
  };

  const setTile = (id: number, patch: Partial<Tile>) => {
    if (!state.catalog) return;
    const tiles = state.catalog.tiles.map((t) => (t.id === id ? { ...t, ...patch } : t));
    update({ catalog: { ...state.catalog, tiles } });
  };
  const setAllEnabled = (enabled: boolean) => {
    if (!state.catalog) return;
    update({ catalog: { ...state.catalog, tiles: state.catalog.tiles.map((t) => ({ ...t, enabled })) } });
  };

  const thumbScale = useMemo(
    () => Math.max(1, Math.round(40 / (state.catalog?.tileSize ?? tileSize))),
    [state.catalog, tileSize],
  );
  const tiles = state.catalog?.tiles ?? [];
  const enabledCount = tiles.filter((t) => t.enabled !== false).length;
  const matches = (t: Tile) =>
    fuzzyMatch(query, `${t.label} ${t.tags.join(" ")} ${atlasById.get(t.sourceId)?.name ?? ""}`);

  return (
    <section>
      <h2>Tiles</h2>
      <div className="row">
        <label>
          Tile size (px){" "}
          <input type="number" min={1} value={tileSize} onChange={(e) => setTileSize(Number(e.target.value))} style={{ width: 64 }} disabled={tiles.length > 0} />
        </label>
        <label className="filebtn">
          + Add tileset
          <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => e.target.files?.[0] && addTileset(e.target.files[0])} />
        </label>
        {tiles.length > 0 && <span className="muted">Tile size is fixed once tiles exist (start a new project to change it).</span>}
      </div>

      {state.atlases.length === 0 && <p className="muted">Add one or more tileset atlases to begin.</p>}

      {state.atlases.map((a) => (
        <AtlasPreview key={a.id} atlas={a} tileSize={state.catalog?.tileSize ?? tileSize} />
      ))}

      {tiles.length > 0 && (
        <>
          <div className="row" style={{ marginTop: "0.75rem" }}>
            <input placeholder="Search tiles (fuzzy: label, tags, sheet)…" value={query} onChange={(e) => setQuery(e.target.value)} style={{ flex: 1, minWidth: 220 }} />
            <strong>{enabledCount} / {tiles.length} enabled</strong>
            <button onClick={() => setAllEnabled(true)}>Enable all</button>
            <button onClick={() => setAllEnabled(false)}>Disable all</button>
          </div>

          <div className="tile-cards">
            {tiles.map((t) => {
              const atlas = atlasById.get(t.sourceId);
              if (!atlas) return null;
              const dim = !matches(t);
              return (
                <div key={t.id} className={`tile-card${t.enabled === false ? " off" : ""}`} style={dim ? { opacity: 0.15 } : undefined}>
                  <div className="tile-card-head">
                    <Thumb atlas={atlas} tile={t} scale={thumbScale} />
                    <label className="tile-enable" title="Include in generation">
                      <input type="checkbox" checked={t.enabled !== false} onChange={(e) => setTile(t.id, { enabled: e.target.checked })} />
                    </label>
                  </div>
                  <input className="tile-label" value={t.label} placeholder="label" onChange={(e) => setTile(t.id, { label: e.target.value })} />
                  <input value={t.tags.join(", ")} placeholder="tags" onChange={(e) => setTile(t.id, { tags: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} />
                  <div className="row" style={{ gap: "0.4rem", margin: 0 }}>
                    <span className="muted">wt</span>
                    <input type="number" step="0.1" value={t.weight} onChange={(e) => setTile(t.id, { weight: Number(e.target.value) })} style={{ width: 48 }} />
                    <select value={t.layer ?? 0} title="Layer" onChange={(e) => setTile(t.id, { layer: Number(e.target.value) })}>
                      {LAYER_NAMES.map((name, i) => (<option key={i} value={i}>{name}</option>))}
                    </select>
                  </div>
                  <input value={t.description} placeholder="description (for the LLM)" onChange={(e) => setTile(t.id, { description: e.target.value })} />
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
