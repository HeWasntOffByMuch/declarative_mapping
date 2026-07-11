// Shared between providers: the SceneSpec contract Claude must emit, plus the
// prompt that grounds it in the user's tile catalog. Kept in sync with
// src/types.ts SceneSpec.

export interface TileCatalogSummary {
  tileSize: number;
  tiles: Array<{ label: string; tags: string[]; description: string }>;
}

// JSON schema for the emit_scene_spec tool (used by the Messages-API provider's
// tool-use call, and as documentation of the exact shape the CLI provider must
// return as raw JSON).
export const SCENE_SPEC_SCHEMA = {
  type: "object",
  required: ["width", "height"],
  additionalProperties: false,
  properties: {
    width: { type: "integer", minimum: 1, maximum: 128 },
    height: { type: "integer", minimum: 1, maximum: 128 },
    seed: { type: "integer" },
    globalWeights: { type: "object", additionalProperties: { type: "number" } },
    forbidden: { type: "array", items: { type: "string" } },
    regions: {
      type: "array",
      items: {
        type: "object",
        required: ["name", "shape", "weights"],
        properties: {
          name: { type: "string" },
          shape: {
            oneOf: [
              {
                type: "object",
                required: ["type", "cx", "cy", "r"],
                properties: {
                  type: { const: "circle" },
                  cx: { type: "number" },
                  cy: { type: "number" },
                  r: { type: "number" },
                },
              },
              {
                type: "object",
                required: ["type", "x", "y", "w", "h"],
                properties: {
                  type: { const: "rect" },
                  x: { type: "number" },
                  y: { type: "number" },
                  w: { type: "number" },
                  h: { type: "number" },
                },
              },
            ],
          },
          weights: { type: "object", additionalProperties: { type: "number" } },
          forbidden: { type: "array", items: { type: "string" } },
        },
      },
    },
    hardPlacements: {
      type: "array",
      items: {
        type: "object",
        required: ["label", "cx", "cy"],
        properties: {
          label: { type: "string" },
          cx: { type: "number" },
          cy: { type: "number" },
        },
      },
    },
  },
} as const;

export function buildPrompt(
  userPrompt: string,
  catalog: TileCatalogSummary,
  size: { width: number; height: number },
): string {
  const list = catalog.tiles
    .map(
      (t) =>
        `- "${t.label}"${t.tags.length ? ` [${t.tags.join(", ")}]` : ""}: ${t.description || "(no description)"}`,
    )
    .join("\n");
  return [
    "You translate a scene description into a declarative SceneSpec for a Wave",
    "Function Collapse tile generator. You do NOT paint tiles directly; you",
    "describe regions, weights, forbidden tiles, and hard placements. All",
    "coordinates are normalized 0..1. Reference ONLY the tile labels below;",
    "never invent labels.",
    "",
    "Available tiles:",
    list,
    "",
    `Target scene size: ${size.width} x ${size.height} cells.`,
    "",
    "Use `regions` for spatial intent (e.g. a crater in the middle -> a circle",
    "region near cx=0.5, cy=0.5). Use `hardPlacements` to pin unique features.",
    "Use `globalWeights` and `forbidden` for overall biome/mood.",
    "",
    `Scene description: ${userPrompt}`,
  ].join("\n");
}
