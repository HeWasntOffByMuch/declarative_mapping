import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../store";
import { Adjacency, Tile, TileCatalog } from "../types";

// M1: upload an atlas, slice it on a fixed grid, and label/tag/weight/enable
// each tile with a live thumbnail. Blank (fully transparent) cells are
// auto-disabled so they never leak into a generated scene.

function emptyAdjacency(n: number): Adjacency {
  const adj: Adjacency = {};
  for (let t = 0; t < n; t++)
    adj[t] = { N: new Set(), E: new Set(), S: new Set(), W: new Set() };
  return adj;
}

/** Slice the atlas and flag fully-transparent cells as disabled. */
function sliceAtlas(img: HTMLImageElement, tileSize: number): Tile[] {
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
    return true; // every pixel fully transparent
  };

  const tiles: Tile[] = [];
  let id = 0;
  for (let ry = 0; ry < rows; ry++) {
    for (let rx = 0; rx < cols; rx++) {
      const x = rx * tileSize;
      const y = ry * tileSize;
      tiles.push({
        id: id++,
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

/** Full-atlas preview with a grid overlay to confirm the tile size is right. */
function AtlasPreview({ atlas, tileSize }: { atlas: HTMLImageElement; tileSize: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const maxW = 460;
    const scale = Math.max(1, Math.min(6, Math.floor(maxW / atlas.naturalWidth) || 1));
    canvas.width = atlas.naturalWidth * scale;
    canvas.height = atlas.naturalHeight * scale;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(atlas, 0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "rgba(91,140,255,0.6)";
    ctx.lineWidth = 1;
    for (let x = 0; x <= atlas.naturalWidth; x += tileSize) {
      ctx.beginPath();
      ctx.moveTo(x * scale + 0.5, 0);
      ctx.lineTo(x * scale + 0.5, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y <= atlas.naturalHeight; y += tileSize) {
      ctx.beginPath();
      ctx.moveTo(0, y * scale + 0.5);
      ctx.lineTo(canvas.width, y * scale + 0.5);
      ctx.stroke();
    }
  }, [atlas, tileSize]);
  return (
    <div className="canvas-wrap" style={{ maxWidth: 480 }}>
      <canvas ref={ref} />
    </div>
  );
}

/** One tile's cropped image, drawn from the atlas via CSS background. */
function Thumb({ atlas, tile, scale }: { atlas: HTMLImageElement; tile: Tile; scale: number }) {
  const { src } = tile;
  return (
    <div
      className="thumb"
      style={{
        width: src.w * scale,
        height: src.h * scale,
        backgroundImage: `url(${atlas.src})`,
        backgroundPosition: `-${src.x * scale}px -${src.y * scale}px`,
        backgroundSize: `${atlas.naturalWidth * scale}px ${atlas.naturalHeight * scale}px`,
      }}
    />
  );
}

export function TilesTab() {
  const { state, update } = useStore();
  const [tileSize, setTileSize] = useState(16);

  const reslice = (img: HTMLImageElement, size: number) => {
    const tiles = sliceAtlas(img, size);
    const catalog: TileCatalog = {
      tileSize: size,
      tiles,
      adjacency: emptyAdjacency(tiles.length),
    };
    update({ atlas: img, catalog });
  };

  const onFile = (file: File) => {
    const img = new Image();
    img.onload = () => reslice(img, tileSize);
    img.src = URL.createObjectURL(file);
  };

  const setTile = (id: number, patch: Partial<Tile>) => {
    if (!state.catalog) return;
    const tiles = state.catalog.tiles.map((t) => (t.id === id ? { ...t, ...patch } : t));
    update({ catalog: { ...state.catalog, tiles } });
  };

  const setAllEnabled = (enabled: boolean) => {
    if (!state.catalog) return;
    update({
      catalog: {
        ...state.catalog,
        tiles: state.catalog.tiles.map((t) => ({ ...t, enabled })),
      },
    });
  };

  const thumbScale = useMemo(
    () => Math.max(1, Math.round(40 / (state.catalog?.tileSize ?? tileSize))),
    [state.catalog, tileSize],
  );
  const enabledCount = state.catalog?.tiles.filter((t) => t.enabled !== false).length ?? 0;

  return (
    <section>
      <h2>Tiles</h2>
      <div className="row">
        <label>
          Tile size (px){" "}
          <input
            type="number"
            min={1}
            value={tileSize}
            onChange={(e) => setTileSize(Number(e.target.value))}
            style={{ width: 64 }}
          />
        </label>
        <input
          type="file"
          accept="image/*"
          onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
        />
        {state.atlas && (
          <button onClick={() => reslice(state.atlas!, tileSize)}>Re-slice</button>
        )}
      </div>

      {!state.atlas && <p className="muted">Upload a tileset atlas to begin.</p>}

      {state.atlas && (
        <>
          <AtlasPreview atlas={state.atlas} tileSize={state.catalog?.tileSize ?? tileSize} />

          <div className="row" style={{ marginTop: "1rem" }}>
            <strong>
              {enabledCount} / {state.catalog?.tiles.length ?? 0} tiles enabled
            </strong>
            <button onClick={() => setAllEnabled(true)}>Enable all</button>
            <button onClick={() => setAllEnabled(false)}>Disable all</button>
            <span className="muted">Blank cells are auto-disabled.</span>
          </div>

          <div className="tile-cards">
            {state.catalog?.tiles.map((t) => (
              <div key={t.id} className={`tile-card${t.enabled === false ? " off" : ""}`}>
                <div className="tile-card-head">
                  <Thumb atlas={state.atlas!} tile={t} scale={thumbScale} />
                  <label className="tile-enable" title="Include in generation">
                    <input
                      type="checkbox"
                      checked={t.enabled !== false}
                      onChange={(e) => setTile(t.id, { enabled: e.target.checked })}
                    />
                  </label>
                </div>
                <input
                  className="tile-label"
                  value={t.label}
                  placeholder="label"
                  onChange={(e) => setTile(t.id, { label: e.target.value })}
                />
                <input
                  value={t.tags.join(", ")}
                  placeholder="tags"
                  onChange={(e) =>
                    setTile(t.id, {
                      tags: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                    })
                  }
                />
                <div className="row" style={{ gap: "0.4rem", margin: 0 }}>
                  <span className="muted">wt</span>
                  <input
                    type="number"
                    step="0.1"
                    value={t.weight}
                    onChange={(e) => setTile(t.id, { weight: Number(e.target.value) })}
                    style={{ width: 56 }}
                  />
                </div>
                <input
                  value={t.description}
                  placeholder="description (for the LLM)"
                  onChange={(e) => setTile(t.id, { description: e.target.value })}
                />
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
