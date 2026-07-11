import { useRef, useState } from "react";
import { useStore } from "../store";
import { Adjacency, Tile, TileCatalog } from "../types";

// M1 scope: upload an atlas, slice it on a fixed grid, label/tag/weight each
// tile. This skeleton implements upload + slicing + a labeling table; the
// per-tile UI polish is M1 proper.

function sliceAtlas(img: HTMLImageElement, tileSize: number): Tile[] {
  const cols = Math.floor(img.width / tileSize);
  const rows = Math.floor(img.height / tileSize);
  const tiles: Tile[] = [];
  let id = 0;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      tiles.push({
        id: id++,
        label: `tile_${x}_${y}`,
        tags: [],
        description: "",
        weight: 1,
        src: { x: x * tileSize, y: y * tileSize, w: tileSize, h: tileSize },
      });
    }
  }
  return tiles;
}

function emptyAdjacency(n: number): Adjacency {
  const adj: Adjacency = {};
  for (let t = 0; t < n; t++)
    adj[t] = { N: new Set(), E: new Set(), S: new Set(), W: new Set() };
  return adj;
}

export function TilesTab() {
  const { state, update } = useStore();
  const [tileSize, setTileSize] = useState(16);
  const fileRef = useRef<HTMLInputElement>(null);

  const onFile = (file: File) => {
    const img = new Image();
    img.onload = () => {
      const tiles = sliceAtlas(img, tileSize);
      const catalog: TileCatalog = {
        tileSize,
        tiles,
        adjacency: emptyAdjacency(tiles.length),
      };
      update({ atlas: img, catalog });
    };
    img.src = URL.createObjectURL(file);
  };

  const setTile = (id: number, patch: Partial<Tile>) => {
    if (!state.catalog) return;
    const tiles = state.catalog.tiles.map((t) => (t.id === id ? { ...t, ...patch } : t));
    update({ catalog: { ...state.catalog, tiles } });
  };

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
          />
        </label>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
        />
      </div>

      {state.catalog && (
        <table className="tiles">
          <thead>
            <tr>
              <th>#</th>
              <th>Label</th>
              <th>Tags (comma)</th>
              <th>Weight</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            {state.catalog.tiles.map((t) => (
              <tr key={t.id}>
                <td>{t.id}</td>
                <td>
                  <input
                    value={t.label}
                    onChange={(e) => setTile(t.id, { label: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    value={t.tags.join(", ")}
                    onChange={(e) =>
                      setTile(t.id, {
                        tags: e.target.value
                          .split(",")
                          .map((s) => s.trim())
                          .filter(Boolean),
                      })
                    }
                  />
                </td>
                <td>
                  <input
                    type="number"
                    step="0.1"
                    value={t.weight}
                    onChange={(e) => setTile(t.id, { weight: Number(e.target.value) })}
                  />
                </td>
                <td>
                  <input
                    value={t.description}
                    onChange={(e) => setTile(t.id, { description: e.target.value })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
