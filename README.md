# Declarative Mapping

Browser tool that turns a **tileset + adjacency rules** into game-ready **2D
scenes** from a natural-language prompt (e.g. *"an abandoned village with a
meteor site in the middle"*), powered by **Wave Function Collapse**.

See [`DESIGN.md`](./DESIGN.md) for the full architecture and roadmap.

## How it works

1. **Tiles** — upload a tileset atlas, slice it on a grid, label/tag/weight each tile.
2. **Rules** — paint a small example map; adjacency is inferred from it.
3. **Generate** — type a prompt. Claude returns a structured `SceneSpec`
   (regions, weights, forbidden tiles, hard placements) via tool-use; the WFC
   solver turns it into a concrete tile grid.
4. **Export** — PNG, JSON (grid + spec), or Tiled-compatible CSV.

Claude never paints tiles directly — it emits declarative constraints, and the
solver does placement. That's what keeps output coherent.

## Auth — no API key needed

By default the local backend (`server/`) generates the SceneSpec through your
**Claude Code login** by shelling out to the `claude` CLI — so your Pro/Max
subscription covers it and **there's no API key to manage**. Requires the
`claude` CLI installed and logged in.

Prefer a raw API key instead? Set `SPEC_PROVIDER=messages-api` and paste a key
in the UI; it's forwarded per-request to the local backend and never persisted.

Because the subscription lives on an authenticated machine, this runs as a
local / self-hosted tool, not a pure public website.

## Develop

```bash
npm install
npm run dev:server   # backend on :8787 (uses your `claude` login)
npm run dev          # frontend on :5173 (proxies /api → :8787)
npm run typecheck
npm test             # WFC + adjacency + pipeline unit tests

# End-to-end smoke test against the real claude CLI (prints an ASCII map):
npx tsx server/smoke.ts "an abandoned village with a meteor site in the middle"
```

## Status

M0–M6 done. In place and browser-verified end-to-end: Tiles (upload, slice,
thumbnails, grid-overlay preview, label/tag/weight, blank auto-detection),
Rules (canvas paint with a tile palette + adjacency inference), Generate (real
SceneSpec via the local `claude` CLI using your Claude Code login — guaranteed
structured output; `messages-api` key provider is the fallback), and Export
(PNG / JSON / Tiled CSV, validated against a real solved scene). Seedable WFC
solver with backtracking, weights, hard placements, and defensive coordinate
normalization (unit-tested). Project save/restore: one-file `.dm.json` plus
localStorage autosave. Multiple layers (Ground + Overlay): tiles are assigned
to a layer, each layer is painted and solved independently (overlay stays
sparse via a synthetic empty tile) and composited into the PNG, with one CSV
exported per layer. See `DESIGN.md`.
