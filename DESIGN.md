# Declarative Mapping — Design

A browser-based tool that turns a tileset + adjacency rules into game-ready 2D
scenes from a natural-language prompt (e.g. *"an abandoned village with a
meteor site in the middle"*).

The name **declarative mapping** captures the core idea: the user *declares*
what tiles mean and how they relate, then declares *what they want* in English,
and the system solves for a concrete map.

---

## 1. User flow

1. **Upload** a tileset — a spritesheet/atlas sliced on a fixed grid, or a set
   of individual tile images.
2. **Slice & label** — confirm tile dimensions, then give each tile a label and
   optional tags/weight ("water", "house_roof", tags: `structure`,
   `impassable`).
3. **Define adjacency** — primarily by **painting a small example map**; the
   tool infers which tiles may neighbor which in each direction. A manual
   pairwise editor is available as a fallback/override.
4. **Generate** — enter a prompt. Claude converts it into a structured
   `SceneSpec`; the WFC solver produces a tile grid.
5. **Export** — render to `<canvas>` → PNG, plus data exports (JSON grid,
   Tiled `.tmx`/`.csv`).

---

## 2. Architecture

Local-backend full-stack app. The backend exists to run the Claude call on a
machine where Claude Code is logged in (so the subscription covers it) and to
sidestep browser CORS.

```
┌──────────────────────────── Browser (React + Canvas) ────────────────────────────┐
│  Tiles tab      Rules tab            Generate tab            Export               │
│  slice/label    paint example /      prompt → SceneSpec →    canvas → PNG / TMX   │
│                 manual adjacency     WFC solve → grid                             │
└───────────────┬──────────────────────────────────────────────────┬──────────────┘
                │  POST /api/generate-spec { prompt, tileCatalog }   │
                ▼                                                    │
┌──────────── Local backend (server/, Node) ────────────┐           │
│  provider = claude-cli (default): `claude --print`     │           │
│    → uses your Claude Code login, no key               │           │
│  provider = messages-api: per-request key → Messages   │           │
│  returns validated SceneSpec                           │           │
└───────────────────────────────────────────────────────┘           │
                                                        WFC runs client-side ◄──────┘
```

- **Frontend:** React + TypeScript, HTML Canvas for tile rendering/painting.
- **Solver:** Wave Function Collapse, client-side, seedable, with backtracking.
  Keeps generation instant and offline once a spec exists.
- **Backend:** one endpoint (`/api/generate-spec`). Stateless. Never sees the
  tileset image — only the text catalog (labels, tags, ids).
- **Auth (subscription-backed default):** the backend is a small **local** Node
  server. By default it generates the SceneSpec by shelling out to the local
  `claude` CLI, which uses your existing Claude Code login — so a Pro/Max
  subscription covers it and **no API key is involved**. A provider seam
  (`server/providers.ts`) also offers a `messages-api` provider that takes a
  per-request key (bills API credits) for anyone without a Claude Code login.
  Because the subscription lives on an authenticated machine, this is a
  locally-run / self-hosted tool rather than a pure public website.

---

## 3. The LLM ↔ WFC bridge

Claude does **not** place tiles. It emits a **declarative constraint spec**; the
WFC solver does placement. This is what makes results reliable.

### `SceneSpec` (Claude's structured output, via tool-use)

```jsonc
{
  "width": 40,
  "height": 30,
  "seed": 12345,                     // optional; enables reproducibility
  "globalWeights": {                 // tileLabel -> relative frequency multiplier
    "dry_grass": 3.0,
    "water": 0.1,
    "rubble": 0.5
  },
  "forbidden": ["water"],            // labels excluded entirely (optional)
  "regions": [                       // spatial zones, resolved in order
    {
      "name": "meteor_crater",
      "shape": { "type": "circle", "cx": 0.5, "cy": 0.5, "r": 0.15 },
      "weights": { "rubble": 5.0, "scorched": 4.0, "crater_center": 1.0 },
      "forbidden": ["house_roof", "wall"]
    },
    {
      "name": "village_scatter",
      "shape": { "type": "rect", "x": 0.1, "y": 0.1, "w": 0.8, "h": 0.8 },
      "weights": { "house_roof": 0.3, "wall": 0.2, "path": 1.5 }
    }
  ],
  "hardPlacements": [                // exact tiles pinned before solving (optional)
    { "label": "crater_center", "cx": 0.5, "cy": 0.5 }
  ]
}
```

- **Coordinates are normalized 0–1** so specs are resolution-independent.
- **`regions`** give spatial control ("in the middle", "along the edge").
- **`hardPlacements`** pin specific features; WFC fills around them.
- The backend **validates every spec** against the current tile catalog
  (unknown labels rejected/dropped) before returning it — the LLM can't
  reference tiles that don't exist.

### Prompt → spec

The backend sends Claude: the user prompt + the tile catalog (labels, tags,
short descriptions) + the `SceneSpec` tool schema. Claude returns a tool call.
No free-form parsing; the schema is the contract.

---

## 4. Adjacency model

- Internal representation: for each tile `t` and direction `d ∈ {N,E,S,W}`, a
  set `allowed[t][d]` of tiles permitted on that side.
- **Inference from example map:** scan every adjacent pair in the painted
  sample; union observed neighbors into `allowed`. Symmetry enforced
  (`b ∈ allowed[a][E]` ⟺ `a ∈ allowed[b][W]`).
- **Rotation/symmetry variants** (optional, phase 2): auto-generate rotated tile
  variants and their rules for tilesets that support it.
- Manual editor can add/remove individual allowances on top of inference.

---

## 5. WFC solver requirements

- Simple-tiled model (adjacency-based), not overlapping-pixel model.
- Seedable RNG → reproducible output for a given `SceneSpec`.
- Region/weight aware: cell entropy uses `globalWeights × region weights`.
- **Contradiction handling:** backtrack + retry with new seed, capped attempts;
  surface a clear "couldn't satisfy constraints" error with the offending
  region if it exhausts retries.
- Max map size cap (perf guardrail, e.g. 128×128 to start).

---

## 6. Export

- **PNG:** composite tiles onto `<canvas>`, `toBlob()`.
- **JSON:** raw grid of tile ids + the `SceneSpec` used (reproducible).
- **Tiled:** `.csv` / `.tmx` for import into the Tiled editor / common engines.

---

## 7. Open decisions

1. ~~**Whose key?**~~ **DECIDED: use the Claude Code subscription, no key.**
   The default `claude-cli` provider runs the SceneSpec call through your local
   Claude Code login (subscription allowance) — no API key. The `messages-api`
   provider (per-request key, API credits) stays available as a fallback for
   users without Claude Code. Implication: the backend runs locally / self-hosted
   on an authenticated machine, not as a pure public website. There is no
   supported way to route a hosted site's traffic through a Pro/Max
   subscription, so "public website" would fall back to the key/OAuth model.
2. ~~**"Automapping" terminology.**~~ **DECIDED: Wave Function Collapse
   adjacency**, not Tiled's pattern-based Automapping rules.
3. **Persistence.** Do projects save server-side (accounts) or export/import a
   project `.json` locally? Local-first is cheaper to build.
4. **Tileset licensing.** Uploaded art is the user's responsibility; add a
   notice.

---

## 8. Milestones

| # | Deliverable |
|---|---|
| M0 | ✅ This design doc + repo scaffold (frontend + backend skeleton) |
| M1 | ✅ Tiles tab: upload, slice, thumbnails, grid-overlay preview, label/tag/weight, blank auto-detection — browser-verified |
| M2 | ✅ Rules tab: canvas paint with tile-thumbnail palette + adjacency inference from the painted example — browser-verified |
| M3 | ✅ WFC solver (seedable, weighted, backtracking, hard placements) — unit-tested |
| M4 | ✅ Local backend generates a real `SceneSpec` via `claude --print --json-schema` (subscription auth); coordinate-normalization guard; smoke-tested end-to-end |
| M5 | ✅ Regions + hard placements (spatial prompts like "in the middle") — in the SceneSpec schema and compiler, verified by the smoke test |
| M6 | ✅ Export: PNG + JSON + Tiled CSV — verified against a real solved scene in-browser (full Tiles→Rules→Generate→Export chain) |
| M7 | ✅ Contradiction UX (partial-fill preview + red stuck-cell marker + root-cause "no adjacency rules" warnings + fix suggestions), seed control + Reroll (re-solve, no LLM), project save/load (one-file `.dm.json` + localStorage autosave) — browser-verified |
| M8 | ✅ Multiple layers (Ground + Overlay) + **overlapping-model WFC**. Tiles are assigned to a layer; each layer learns N×N patterns (default 3) from its painted example and solves in pattern space via the shared tiled solver (overlapping reduces to tiled adjacency over patterns), so walls form runs/corners/rooms instead of pairwise-adjacency speckle. Overlay treats unpainted cells as EMPTY so it stays as sparse as painted. Rules tab paints each layer with the ground shown beneath; results composite to PNG and export one CSV per layer. Unit + generation verified (rooms). Note: no hard closure/connectivity guarantee — a structural room generator would be the next lever. (Deeper: N layers, layered `.tmx`.) |

---

## 9. Risks

- **WFC contradictions** on sparse/over-constrained rulesets → mitigated by
  inference-from-example + backtracking + reroll.
- **LLM referencing nonexistent tiles** → mitigated by server-side spec
  validation against the catalog.
- **Key exposure** → mitigated by backend proxy; never in client bundle/logs.
- **Large maps slow** → size cap + optional web-worker solve.
- **Spatial prompts underdetermined** → normalized region shapes give Claude a
  concrete vocabulary to target.
