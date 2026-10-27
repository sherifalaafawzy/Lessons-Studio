// Snapping on the canvas: to the stage and to other elements, while moving and resizing; and rotation angles.
import { describe, expect, it } from "vitest";
import { angleFrom, resizeBox, snapMove } from "../src/snap.ts";

const stage = { x: 0, y: 0, w: 1000, h: 600 };
const box = { x: 100, y: 100, w: 200, h: 100 };

describe("snapping", () => {
  it("moves snap to the stage centre and edges, with guides", () => {
    // The centre lands 4 px short of the stage centre (496), so it snaps onto it.
    const m = snapMove(box, 296, 0, stage, []);
    expect(m.dx).toBe(300);
    expect(m.guides).toContainEqual({ axis: "x", at: 500 });
    const edge = snapMove(box, -97, -103, stage, []);
    expect([edge.dx, edge.dy]).toEqual([-100, -100]);
  });
  it("moves snap to other elements' edges and centres", () => {
    const other = { x: 600, y: 300, w: 100, h: 50 };
    const m = snapMove(box, 297, 152, stage, [other]);
    // The right edge lands 3 px short of the other box (597), and the middle 2 px past its top (302).
    expect([m.dx, m.dy]).toEqual([300, 150]);
    expect(m.guides).toContainEqual({ axis: "x", at: 600 });
  });
  it("leaves moves alone when nothing is near", () => {
    expect(snapMove(box, 37, 41, stage, [])).toEqual({ dx: 37, dy: 41, guides: [] });
  });
  it("resizes only the dragged edges, snapping each, never below 8 px", () => {
    expect(resizeBox(box, "e", 97, 50, stage, []).rect).toEqual({ x: 100, y: 100, w: 297, h: 100 });
    expect(resizeBox(box, "e", 196, 0, stage, []).rect.w).toBe(400); // the right edge (496) snaps to the centre (500)
    expect(resizeBox(box, "nw", 300, 300, stage, []).rect).toMatchObject({ w: 8, h: 8 });
    const keep = resizeBox(box, "se", 100, 0, stage, [], true).rect;
    expect(keep.w / keep.h).toBeCloseTo(2);
  });
  it("measures angles from up, clockwise, with steps", () => {
    expect(angleFrom(0, 0, 0, -10)).toBeCloseTo(0);
    expect(angleFrom(0, 0, 10, 0)).toBeCloseTo(90);
    expect(angleFrom(0, 0, -10, 0)).toBeCloseTo(270);
    expect(angleFrom(0, 0, 10, -9, 15)).toBe(45);
  });
});
