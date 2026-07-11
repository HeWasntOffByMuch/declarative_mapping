import { useMemo, useState } from "react";
import { useStore } from "../store";
import { inferAdjacency } from "../lib/adjacency";

// M2 scope: paint a small example map, infer adjacency from it, and allow
// manual overrides. This skeleton wires the inference call against a painted
// grid; the paint canvas UI is fleshed out in M2 proper. For now the example
// grid is editable as a coarse dropdown grid so inference is testable.

const GRID_W = 12;
const GRID_H = 8;

export function RulesTab() {
  const { state, update } = useStore();
  const [cells, setCells] = useState<number[]>(() =>
    new Array(GRID_W * GRID_H).fill(-1),
  );
  const [brush, setBrush] = useState(0);

  const tileCount = state.catalog?.tiles.length ?? 0;

  const paint = (i: number) => {
    setCells((c) => {
      const next = c.slice();
      next[i] = brush;
      return next;
    });
  };

  const ruleSummary = useMemo(() => {
    if (!state.catalog) return "";
    const adj = state.catalog.adjacency;
    let count = 0;
    for (const t of Object.keys(adj))
      for (const d of Object.keys(adj[+t]) as Array<keyof (typeof adj)[number]>)
        count += adj[+t][d].size;
    return `${count} directional allowances`;
  }, [state.catalog]);

  const runInference = () => {
    if (!state.catalog) return;
    const adjacency = inferAdjacency(cells, GRID_W, GRID_H, tileCount);
    update({
      catalog: { ...state.catalog, adjacency },
      exampleMap: { width: GRID_W, height: GRID_H, cells },
    });
  };

  if (!state.catalog) return <section><h2>Rules</h2><p>Upload a tileset first.</p></section>;

  return (
    <section>
      <h2>Rules</h2>
      <p>Paint an example scene; adjacency is inferred from neighboring tiles.</p>

      <div className="row">
        <label>
          Brush:{" "}
          <select value={brush} onChange={(e) => setBrush(Number(e.target.value))}>
            <option value={-1}>(erase)</option>
            {state.catalog.tiles.map((t) => (
              <option key={t.id} value={t.id}>
                {t.id}: {t.label}
              </option>
            ))}
          </select>
        </label>
        <button onClick={runInference}>Infer adjacency</button>
        <span className="muted">{ruleSummary}</span>
      </div>

      <div
        className="paint-grid"
        style={{ gridTemplateColumns: `repeat(${GRID_W}, 24px)` }}
      >
        {cells.map((v, i) => (
          <div
            key={i}
            className="paint-cell"
            title={v < 0 ? "empty" : state.catalog!.tiles[v]?.label}
            onMouseDown={() => paint(i)}
            onMouseEnter={(e) => e.buttons === 1 && paint(i)}
          >
            {v < 0 ? "" : v}
          </div>
        ))}
      </div>
    </section>
  );
}
