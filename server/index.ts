// Minimal local backend for the SceneSpec step.
//
// Why a local server (not a static site): to use your Claude Code subscription
// there must be a process on a machine where `claude` is logged in. This server
// is that process. It exposes one endpoint the frontend calls; by default it
// generates the SceneSpec via the local `claude` CLI (no API key). Set
// SPEC_PROVIDER=messages-api to use a per-request Anthropic key instead.

import { createServer } from "node:http";
import { selectProvider, TileCatalogSummaryGuard } from "./guards";

const PORT = Number(process.env.PORT ?? 8787);
const provider = selectProvider();

const server = createServer(async (req, res) => {
  if (req.method !== "POST" || req.url !== "/api/generate-spec") {
    res.writeHead(404).end("Not Found");
    return;
  }
  try {
    const body = await readJson(req);
    const catalog = TileCatalogSummaryGuard(body.catalog);
    if (!body.prompt) throw new Error("missing prompt");
    const size = {
      width: Number(body.width ?? 32),
      height: Number(body.height ?? 24),
    };
    const result = await provider.generate(body.prompt, catalog, size, {
      apiKey: body.apiKey,
    });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(result));
  } catch (err) {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: (err as Error).message }));
  }
});

function readJson(req: import("node:http").IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

server.listen(PORT, () => {
  console.log(`SceneSpec backend on :${PORT} (provider: ${provider.name})`);
});
