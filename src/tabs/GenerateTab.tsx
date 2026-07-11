import { useEffect, useRef, useState } from "react";
import { useStore } from "../store";
import { generateSpec } from "../api-client";
import { compile } from "../lib/scenespec";
import { solve } from "../wfc/solver";
import { SceneSpec, TileCatalogSummary } from "../types";
import { drawGrid } from "../lib/render";

interface Preview {
  grid: number[];
  width: number;
  height: number;
  ok: boolean;
  contradictionAt?: number;
}

const randomSeed = () => Math.floor(Math.random() * 2 ** 31);

export function GenerateTab() {
  const { state, update } = useStore();
  const [prompt, setPrompt] = useState(
    "an abandoned village with a meteor site in the middle",
  );
  const [seed, setSeed] = useState<number>(randomSeed);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const push = (m: string) => setLog((l) => [...l, m]);

  // Solve a spec at a given seed — no LLM call. Used by both Build and Reroll.
  const solveSpec = (spec: SceneSpec, seedVal: number) => {
    if (!state.catalog) return;
    const compiled = compile({ ...spec, seed: seedVal }, state.catalog);
    compiled.warnings.forEach((w) => push(`⚠ ${w}`));
    if (compiled.errors.length || !compiled.input) {
      compiled.errors.forEach((e) => push(`✗ ${e}`));
      return;
    }
    push("Solving with WFC…");
    const r = solve(compiled.input);
    setPreview({
      grid: r.grid ?? [],
      width: spec.width,
      height: spec.height,
      ok: r.ok,
      contradictionAt: r.contradictionAt,
    });
    if (r.ok && r.grid) {
      push(`✓ Solved in ${r.attempts} attempt(s) at seed ${seedVal}.`);
      update({
        lastSpec: spec,
        lastGrid: { width: spec.width, height: spec.height, cells: r.grid },
      });
    } else {
      const c = r.contradictionAt ?? 0;
      const x = c % spec.width;
      const y = Math.floor(c / spec.width);
      push(
        `✗ No full solution after ${r.attempts} attempts — got stuck near (${x}, ${y}).`,
      );
      push(
        "  Try Reroll (a different seed often works), loosen a region's forbidden list, or add more adjacency examples in the Rules tab. The partial fill is shown below.",
      );
      // Keep lastSpec so Reroll works; don't overwrite a good lastGrid.
      update({ lastSpec: spec });
    }
  };

  const build = async () => {
    if (!state.catalog) return push("Upload a tileset and define rules first.");
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

  // Draw the preview (partial or full) with the contradiction cell highlighted.
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !preview || !state.catalog || !state.atlas) return;
    const ts = state.catalog.tileSize;
    const cell = Math.max(4, Math.min(16, Math.floor(480 / preview.width)));
    const scale = cell / ts;
    canvas.width = preview.width * cell;
    canvas.height = preview.height * cell;
    ctx.fillStyle = "#0e1013";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawGrid(ctx, preview.grid, preview.width, preview.height, state.catalog, state.atlas, scale);
    if (!preview.ok && preview.contradictionAt != null) {
      const x = (preview.contradictionAt % preview.width) * cell;
      const y = Math.floor(preview.contradictionAt / preview.width) * cell;
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
          <input
            type="number"
            value={seed}
            onChange={(e) => setSeed(Number(e.target.value))}
            style={{ width: 120 }}
          />
        </label>
        <button onClick={() => setSeed(randomSeed())} title="Randomize seed">
          🎲
        </button>
        <button disabled={busy} onClick={build}>
          {busy ? "Working…" : "Build scene"}
        </button>
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
