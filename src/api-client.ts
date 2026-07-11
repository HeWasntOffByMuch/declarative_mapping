import { SceneSpec, TileCatalogSummary } from "./types";

export interface GenerateSpecRequest {
  prompt: string;
  catalog: TileCatalogSummary;
  /**
   * Optional Anthropic API key. Only needed when the backend runs the
   * `messages-api` provider; the default `claude-cli` provider uses the local
   * Claude Code login and ignores this. Forwarded per-request, never persisted.
   */
  apiKey?: string;
  width?: number;
  height?: number;
}

export interface GenerateSpecResponse {
  spec: SceneSpec;
  warnings?: string[];
}

/**
 * Calls the local backend, which returns a SceneSpec. By default the backend
 * generates it through your Claude Code login (no key). If a key is supplied
 * and the backend runs the messages-api provider, it's sent only to our own
 * `/api` endpoint and never persisted client-side.
 */
export async function generateSpec(
  req: GenerateSpecRequest,
): Promise<GenerateSpecResponse> {
  const res = await fetch("/api/generate-spec", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`generate-spec failed (${res.status}): ${detail}`);
  }
  return res.json();
}
