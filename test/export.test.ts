import { describe, expect, it } from "vitest";
import { gridToCsv } from "../src/lib/render";

// PNG/canvas export is browser-only (verified via the in-browser E2E run);
// the Tiled-CSV serializer is pure and regression-tested here.
describe("gridToCsv", () => {
  it("emits one line per row with row-major values", () => {
    const grid = [0, 1, 2, 3, 4, 5]; // 3 wide x 2 tall
    const csv = gridToCsv(grid, 3);
    const rows = csv.split("\n");
    expect(rows).toHaveLength(2);
    expect(rows[0].startsWith("0,1,2")).toBe(true);
    expect(rows[1].startsWith("3,4,5")).toBe(true);
  });

  it("keeps width columns per row for a Tiled-importable layer", () => {
    const width = 8;
    const grid = Array.from({ length: width * 5 }, (_, i) => i % 4);
    const rows = gridToCsv(grid, width).trim().split("\n");
    expect(rows).toHaveLength(5);
    for (const r of rows) {
      expect(r.split(",").filter((s) => s.trim() !== "")).toHaveLength(width);
    }
  });
});
