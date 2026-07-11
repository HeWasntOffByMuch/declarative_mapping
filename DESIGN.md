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

Thin-backend full-stack app. The backend exists mainly to keep the Anthropic
key out of the browser and sidestep CORS.

```
┌──────────────────────────── Browser (React + Canvas) ────────────────────────────┐
│  Tiles tab      Rules tab            Generate tab            Export               │
│  slice/label    paint example /      prompt → SceneSpec →    canvas → PNG / TMX   │
│                 manual adjacency     WFC solve → grid                             │
└───────────────┬──────────────────────────────────────────────────┬──────────────┘
                │  POST /api/generate-spec { prompt, tileCatalog }   │
                ▼                                                    │
┌──────────── Backend proxy (serverless fn) ────────────┐           │
│  holds ANTHROPIC_API_KEY                               │           │
│  calls Claude with tool-use → validated SceneSpec      │           │
└───────────────────────────────────────────────────────┘           │
                                                        WFC runs client-side ◄──────┘
```

- **Frontend:** React + TypeScript, HTML Canvas for tile rendering/painting.
- **Solver:** Wave Function Collapse, client-side, seedable, with backtracking.
  Keeps generation instant and offline once a spec exists.
- **Backend:** one endpoint (`/api/generate-spec`). Stateless. Never sees the
  tileset image — only the text catalog (labels, tags, ids).
- **Key handling (per-user):** each user supplies their own Anthropic key. It's
  sent over HTTPS to the proxy, forwarded on that single request, and never
  persisted or logged. No operator-held key/secret. The proxy is purely a
  CORS + key-hiding relay.

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

1. ~~**Whose key?**~~ **DECIDED: per-user.** Each user pastes their own
   Anthropic key. The backend proxy forwards it per-request and never persists
   or logs it. Safer for the operator legally/financially. (Implication: no
   server-held key/secret; the proxy is purely a CORS + key-hiding relay for
   the request in flight.)
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
| M0 | This design doc + repo scaffold (frontend + backend skeleton) |
| M1 | Tiles tab: upload, slice, label, tag, weight |
| M2 | Rules tab: paint example map + adjacency inference + manual override |
| M3 | WFC solver (seedable, weighted, backtracking) — generate from a hand-built spec |
| M4 | Backend proxy + Claude `SceneSpec` generation from a prompt |
| M5 | Regions + hard placements (spatial prompts like "in the middle") |
| M6 | Export: PNG + JSON + Tiled |
| M7 | Polish: contradiction UX, seeds/reroll, project save/load |

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
