import { useState } from "react";
import { useStore } from "../store";
import { generateSpec } from "../api-client";
import { compile } from "../lib/scenespec";
import { solve } from "../wfc/solver";
import { TileCatalogSummary } from "../types";

export function GenerateTab() {
  const { state, update } = useStore();
  const [prompt, setPrompt] = useState("an abandoned village with a meteor site in the middle");
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  const push = (m: string) => setLog((l) => [...l, m]);

  const run = async () => {
    if (!state.catalog) return push("Upload a tileset and define rules first.");
    setBusy(true);
    setLog([]);
    try {
      const summary: TileCatalogSummary = {
        tileSize: state.catalog.tileSize,
        tiles: state.catalog.tiles.map((t) => ({
          label: t.label,
          tags: t.tags,
          description: t.description,
        })),
      };
      push("Requesting SceneSpec from Claude…");
      const { spec, warnings } = await generateSpec({
        prompt,
        catalog: summary,
        apiKey: state.apiKey || undefined,
      });
      warnings?.forEach((w) => push(`⚠ ${w}`));

      const compiled = compile(spec, state.catalog);
      compiled.warnings.forEach((w) => push(`⚠ ${w}`));
      if (compiled.errors.length || !compiled.input) {
        compiled.errors.forEach((e) => push(`✗ ${e}`));
        return;
      }
      push("Solving with WFC…");
      const result = solve(compiled.input);
      if (!result.ok || !result.grid) {
        push(`✗ No solution after ${result.attempts} attempts (contradiction at cell ${result.contradictionAt}).`);
        return;
      }
      push(`✓ Solved in ${result.attempts} attempt(s).`);
      update({
        lastSpec: spec,
        lastGrid: { width: spec.width, height: spec.height, cells: result.grid },
      });
    } catch (err) {
      push(`✗ ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

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
      <button disabled={busy} onClick={run}>
        {busy ? "Working…" : "Build scene"}
      </button>
      <pre className="log">{log.join("\n")}</pre>
    </section>
  );
}
