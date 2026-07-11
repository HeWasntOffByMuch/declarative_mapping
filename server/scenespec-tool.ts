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
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          // Single shape object with an enum discriminator — broadly compatible
          // with structured-output engines that don't handle oneOf/const.
          // circle uses cx,cy,r; rect uses x,y,w,h. All values normalized 0..1.
          shape: {
            type: "object",
            required: ["type"],
            additionalProperties: false,
            properties: {
              type: { type: "string", enum: ["circle", "rect"] },
              cx: { type: "number" },
              cy: { type: "number" },
              r: { type: "number" },
              x: { type: "number" },
              y: { type: "number" },
              w: { type: "number" },
              h: { type: "number" },
            },
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
    "describe regions, per-tile weights, forbidden tiles, and hard placements.",
    "",
    "COORDINATES ARE NORMALIZED FRACTIONS 0..1 — never pixel or cell counts.",
    "The map center is cx=0.5, cy=0.5. A circle covering the middle fifth is",
    "r≈0.1. A rect covering the left third is x=0, y=0, w=0.33, h=1. Do NOT",
    `use ${size.width} or ${size.height} in any coordinate.`,
    "",
    "Shapes: circle = {type:'circle', cx, cy, r}; rect = {type:'rect', x, y, w, h}",
    "(x,y is the top-left corner). Only 'circle' and 'rect' are allowed.",
    "",
    "`weights` and `globalWeights` map a TILE LABEL to a positive multiplier.",
    "`forbidden` is a list of TILE LABELS to exclude — NOT tile pairs or rules.",
    "Reference ONLY these exact tile labels; never invent labels:",
    list,
    "",
    `Target scene size: ${size.width} x ${size.height} cells (for density only;`,
    "coordinates stay 0..1). Use `regions` for spatial intent, `hardPlacements`",
    "to pin unique single features, `globalWeights`/`forbidden` for overall mood.",
    "",
    `Scene description: ${userPrompt}`,
  ].join("\n");
}
