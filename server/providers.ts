// SceneSpec providers. Both return the same shape; the server picks one via
// the SPEC_PROVIDER env var. This is the seam that lets the tool run against
// your Claude Code subscription (no key) OR a raw Anthropic API key.

import { spawn } from "node:child_process";
import { TileCatalogSummary, buildPrompt } from "./scenespec-tool";

export interface SpecResult {
  spec: unknown; // validated against the tile catalog in the browser (scenespec.ts)
  warnings: string[];
}

export interface SpecProvider {
  name: string;
  generate(
    prompt: string,
    catalog: TileCatalogSummary,
    size: { width: number; height: number },
    opts: { apiKey?: string },
  ): Promise<SpecResult>;
}

/** Pull the first top-level JSON object out of arbitrary model text. */
function extractJson(text: string): unknown {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fence ? fence[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("no JSON object in model output");
  return JSON.parse(candidate.slice(start, end + 1));
}

/**
 * Default provider: shells out to the local `claude` CLI in print mode with a
 * JSON schema, so the reply is guaranteed-shaped structured output. Uses
 * whatever Claude Code is logged in with on this machine — a Pro/Max
 * subscription login covers it and no API key is needed. Requires the `claude`
 * CLI installed and authenticated.
 *
 * `--print --output-format json --json-schema <inline JSON>` returns a wrapper
 * object whose `structured_output` field is the parsed SceneSpec. Override the
 * model with SPEC_MODEL (default: the CLI's configured model).
 */
export const claudeCliProvider: SpecProvider = {
  name: "claude-cli",
  async generate(prompt, catalog, size) {
    const { SCENE_SPEC_SCHEMA } = await import("./scenespec-tool");
    const wrapper = await runClaude(
      buildPrompt(prompt, catalog, size),
      JSON.stringify(SCENE_SPEC_SCHEMA),
    );
    // Prefer the parsed structured_output; fall back to extracting from result.
    const spec =
      wrapper.structured_output ??
      (typeof wrapper.result === "string" ? extractJson(wrapper.result) : undefined);
    if (spec === undefined) throw new Error("claude CLI returned no structured output");
    return { spec, warnings: [] };
  },
};

function runClaude(prompt: string, schema: string): Promise<any> {
  return new Promise((resolve, reject) => {
    // Prompt is a positional arg (spawn uses no shell, so no quoting issues);
    // stdin is closed so the CLI doesn't wait on it.
    const args = ["--print", prompt, "--output-format", "json", "--json-schema", schema];
    if (process.env.SPEC_MODEL) args.push("--model", process.env.SPEC_MODEL);
    const child = spawn("claude", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", (e) =>
      reject(new Error(`failed to spawn claude CLI (installed & logged in?): ${e.message}`)),
    );
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(`claude CLI exited ${code}: ${stderr}`));
      try {
        resolve(JSON.parse(stdout));
      } catch (e) {
        reject(new Error(`could not parse claude CLI output: ${(e as Error).message}`));
      }
    });
  });
}

/**
 * Fallback provider: raw Anthropic Messages API with a per-request key and a
 * forced tool call. No SDK dependency (uses fetch). Bills API credits.
 */
export const messagesApiProvider: SpecProvider = {
  name: "messages-api",
  async generate(prompt, catalog, size, opts) {
    if (!opts.apiKey) throw new Error("messages-api provider requires an apiKey");
    const { SCENE_SPEC_SCHEMA } = await import("./scenespec-tool");
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": opts.apiKey, // per-request, never persisted
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-opus-4-8",
        max_tokens: 2048,
        tools: [
          {
            name: "emit_scene_spec",
            description:
              "Emit the declarative SceneSpec. Coordinates normalized 0..1; reference only existing tile labels.",
            input_schema: SCENE_SPEC_SCHEMA,
          },
        ],
        tool_choice: { type: "tool", name: "emit_scene_spec" },
        messages: [{ role: "user", content: buildPrompt(prompt, catalog, size) }],
      }),
    });
    if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as {
      content: Array<{ type: string; input?: unknown }>;
    };
    const toolUse = data.content.find((c) => c.type === "tool_use");
    if (!toolUse?.input) throw new Error("model did not return a tool call");
    return { spec: toolUse.input, warnings: [] };
  },
};

export function selectProvider(): SpecProvider {
  const which = process.env.SPEC_PROVIDER ?? "claude-cli";
  if (which === "messages-api") return messagesApiProvider;
  return claudeCliProvider;
}
