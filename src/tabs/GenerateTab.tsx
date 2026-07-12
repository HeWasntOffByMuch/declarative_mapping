import { useEffect, useRef, useState } from "react";
import { useStore } from "../store";
import { generateSpec } from "../api-client";
import { generateScene, LayerFailure } from "../lib/scene";
import { SceneSpec, TileCatalogSummary } from "../types";
import { drawScene } from "../lib/render";
import { SceneGrid } from "../store";

const randomSeed = () => Math.floor(Math.random() * 2 ** 31);

export function GenerateTab() {
  const { state, update } = useStore();
  const [prompt, setPrompt] = useState(
    "an abandoned village with a meteor site in the middle",
  );
  const [seed, setSeed] = useState<number>(randomSeed);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [preview, setPreview] = useState<{ grid: SceneGrid; failures: LayerFailure[] } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const push = (m: string) => setLog((l) => [...l, m]);

  const solveSpec = (spec: SceneSpec, seedVal: number) => {
    if (!state.catalog) return;
    push("Solving layers with WFC…");
    const res = generateScene(spec, state.catalog, state.exampleMaps, seedVal);
    res.warnings.forEach((w) => push(`⚠ ${w}`));
    if (res.errors.length || !res.grid) {
      res.errors.forEach((e) => push(`✗ ${e}`));
      return;
    }
    setPreview({ grid: res.grid, failures: res.failures });
    if (res.ok) {
      push(`✓ Solved all layers at seed ${seedVal}.`);
      update({ lastSpec: spec, lastGrid: res.grid });
    } else {
      for (const f of res.failures) {
        const c = f.contradictionAt ?? 0;
        push(
          `✗ ${["Ground", "Overlay"][f.layer]} layer got stuck near (${c % spec.width}, ${Math.floor(c / spec.width)}).`,
        );
      }
      push(
        "  Try Reroll, loosen a region's forbidden list, or paint more adjacency examples in the Rules tab. Partial fill shown below.",
      );
      update({ lastSpec: spec });
    }
  };

  const build = async () => {
    if (!state.catalog) return push("Upload a tileset and paint rules first.");
    setBusy(true);
    setLog([]);
    setPreview(null);
    try {
      const summary: TileCatalogSummary = {
        tileSize: state.catalog.tileSize,
        tiles: state.catalog.tiles
          .filter((t) => t.enabled !== false)
          .map((t) => ({ label: t.label, tags: t.tags, description: t.description })),
      };
      push("Requesting SceneSpec from Claude…");
      const { spec, warnings } = await generateSpec({
        prompt,
        catalog: summary,
        apiKey: state.apiKey || undefined,
      });
      warnings?.forEach((w) => push(`⚠ ${w}`));
      solveSpec(spec as SceneSpec, seed);
    } catch (err) {
      push(`✗ ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const reroll = () => {
    if (!state.lastSpec) return;
    const s = randomSeed();
    setSeed(s);
    setLog((l) => [...l, `Reroll @ seed ${s}…`]);
    solveSpec(state.lastSpec, s);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !preview || !state.catalog || !state.atlas) return;
    const { grid } = preview;
    const ts = state.catalog.tileSize;
    const cell = Math.max(4, Math.min(16, Math.floor(480 / grid.width)));
    const scale = cell / ts;
    canvas.width = grid.width * cell;
    canvas.height = grid.height * cell;
    ctx.fillStyle = "#0e1013";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawScene(ctx, grid.layers, grid.width, grid.height, state.catalog, state.atlas, scale);
    for (const f of preview.failures) {
      if (f.contradictionAt == null) continue;
      const x = (f.contradictionAt % grid.width) * cell;
      const y = Math.floor(f.contradictionAt / grid.width) * cell;
      ctx.strokeStyle = "#ff5a5a";
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, cell - 2, cell - 2);
    }
  }, [preview, state.catalog, state.atlas]);

  return (
    <section>
      <h2>Generate</h2>
      <label className="block">
        Anthropic API key — optional; only for the messages-api backend. The
        default backend uses your Claude Code login and ignores this.
        <input
          type="password"
          value={state.apiKey}
          placeholder="sk-ant-… (leave blank to use Claude Code login)"
          onChange={(e) => update({ apiKey: e.target.value })}
        />
      </label>
      <label className="block">
        Prompt
        <textarea value={prompt} rows={3} onChange={(e) => setPrompt(e.target.value)} />
      </label>

      <div className="row">
        <label>
          Seed{" "}
          <input type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value))} style={{ width: 120 }} />
        </label>
        <button onClick={() => setSeed(randomSeed())} title="Randomize seed">🎲</button>
        <button disabled={busy} onClick={build}>{busy ? "Working…" : "Build scene"}</button>
        <button disabled={busy || !state.lastSpec} onClick={reroll} title="Re-solve the same spec with a new seed (no LLM call)">
          Reroll
        </button>
      </div>

      {preview && (
        <div className="canvas-wrap" style={{ display: "inline-block", marginBottom: "0.75rem" }}>
          <canvas ref={canvasRef} />
        </div>
      )}
      <pre className="log">{log.join("\n")}</pre>
    </section>
  );
}
