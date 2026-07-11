// End-to-end smoke test of the SceneSpec path, hitting the real `claude` CLI.
//   npx tsx server/smoke.ts "an abandoned village with a meteor site in the middle"
// Requires the `claude` CLI installed and logged in. Prints the generated
// SceneSpec and an ASCII render of the solved grid.

import { claudeCliProvider } from "./providers";
import type { TileCatalogSummary } from "./scenespec-tool";
import { compile } from "../src/lib/scenespec";
import { solve } from "../src/wfc/solver";
import { Adjacency, TileCatalog, DIRECTIONS } from "../src/types";

const TILES = [
  { label: "dry_grass", tags: ["ground"], description: "cracked dry grassland" },
  { label: "water", tags: ["liquid"], description: "shallow water" },
  { label: "house_roof", tags: ["structure"], description: "village house roof" },
  { label: "wall", tags: ["structure"], description: "stone wall" },
  { label: "path", tags: ["ground"], description: "dirt path" },
  { label: "rubble", tags: ["debris"], description: "scattered rubble" },
  { label: "scorched", tags: ["ground"], description: "burnt scorched earth" },
  { label: "crater_center", tags: ["feature"], description: "glowing meteor impact core" },
];
const GLYPH = [".", "~", "#", "|", "-", "%", "x", "@"];

function permissiveCatalog(): TileCatalog {
  const adjacency: Adjacency = {};
  for (let t = 0; t < TILES.length; t++) {
    adjacency[t] = { N: new Set(), E: new Set(), S: new Set(), W: new Set() };
    for (const d of DIRECTIONS) for (let u = 0; u < TILES.length; u++) adjacency[t][d].add(u);
  }
  return {
    tileSize: 16,
    tiles: TILES.map((t, id) => ({ id, ...t, weight: 1, src: { x: 0, y: 0, w: 16, h: 16 } })),
    adjacency,
  };
}

async function main() {
  const prompt =
    process.argv[2] ?? "an abandoned village with a meteor site in the middle";
  const summary: TileCatalogSummary = { tileSize: 16, tiles: TILES };

  console.log(`Prompt: ${prompt}\nAsking claude CLI for a SceneSpec…\n`);
  const { spec } = await claudeCliProvider.generate(prompt, summary, { width: 32, height: 24 }, {});
  console.log("SceneSpec:\n" + JSON.stringify(spec, null, 2) + "\n");

  const catalog = permissiveCatalog();
  const { input, warnings, errors } = compile(spec as any, catalog);
  warnings.forEach((w) => console.log("⚠ " + w));
  if (errors.length || !input) {
    errors.forEach((e) => console.log("✗ " + e));
    process.exit(1);
  }

  const r = solve(input);
  if (!r.ok || !r.grid) {
    console.log(`✗ solve failed (attempts ${r.attempts}, contradiction ${r.contradictionAt})`);
    process.exit(1);
  }
  console.log(`✓ solved in ${r.attempts} attempt(s). ${input.width}x${input.height} grid:\n`);
  for (let y = 0; y < input.height; y++) {
    let row = "";
    for (let x = 0; x < input.width; x++) row += GLYPH[r.grid[y * input.width + x]] ?? "?";
    console.log(row);
  }
}

main().catch((e) => {
  console.error("✗ " + e.message);
  process.exit(1);
});
