// Snapping on the canvas: a moved or resized box lines up with the stage's edges and centre, and with other
// elements' edges and centres, when it comes within a few pixels; the lines it lines up with are drawn as guides.
// Screen pixels throughout (the stage's own box), so the distance feels the same at every zoom.

export interface Rect { x: number; y: number; w: number; h: number }
export interface Guide { axis: "x" | "y"; at: number }

/** The lines something can snap to along one axis: the stage's start, middle and end, and each target's. */
export function snapLines(axis: "x" | "y", stage: Rect, targets: Rect[]): number[] {
  const of = (r: Rect) => (axis === "x" ? [r.x, r.x + r.w / 2, r.x + r.w] : [r.y, r.y + r.h / 2, r.y + r.h]);
  return [stage, ...targets].flatMap(of);
}

/** The smallest shift (within `tol`) that puts one of `edges` on one of `lines`, or 0. */
export function nearestShift(edges: number[], lines: number[], tol: number): number {
  let best = 0, dist = tol + 1e-9;
  for (const e of edges) for (const l of lines) if (Math.abs(l - e) < dist) { dist = Math.abs(l - e); best = l - e; }
  return best;
}

/** The lines that `edges` now sit on (to draw as guides). */
function touching(axis: "x" | "y", edges: number[], lines: number[]): Guide[] {
  const at = [...new Set(lines.filter((l) => edges.some((e) => Math.abs(l - e) < 0.5)).map((l) => Math.round(l * 2) / 2))];
  return at.map((v) => ({ axis, at: v }));
}

/** A box moved by (dx, dy), snapped: the corrected move and the guides to show. */
export function snapMove(r: Rect, dx: number, dy: number, stage: Rect, targets: Rect[], tol = 6): { dx: number; dy: number; guides: Guide[] } {
  const lx = snapLines("x", stage, targets), ly = snapLines("y", stage, targets);
  const ex = (d: number) => [r.x + d, r.x + d + r.w / 2, r.x + d + r.w];
  const ey = (d: number) => [r.y + d, r.y + d + r.h / 2, r.y + d + r.h];
  const sx = dx + nearestShift(ex(dx), lx, tol);
  const sy = dy + nearestShift(ey(dy), ly, tol);
  return { dx: sx, dy: sy, guides: [...touching("x", ex(sx), lx), ...touching("y", ey(sy), ly)] };
}

export type Handle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
export const HANDLES: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

/**
 * A box resized by dragging `handle` by (dx, dy): only the edges that handle moves change, each snapping on its own.
 * With `keep` (Shift on a corner), the box keeps its proportions. Never smaller than 8 px.
 */
export function resizeBox(r: Rect, handle: Handle, dx: number, dy: number, stage: Rect, targets: Rect[], keep = false, tol = 6): { rect: Rect; guides: Guide[] } {
  const lx = snapLines("x", stage, targets), ly = snapLines("y", stage, targets);
  let left = r.x, right = r.x + r.w, top = r.y, bottom = r.y + r.h;
  if (handle.includes("w")) { left += dx; left += nearestShift([left], lx, tol); }
  if (handle.includes("e")) { right += dx; right += nearestShift([right], lx, tol); }
  if (handle.includes("n")) { top += dy; top += nearestShift([top], ly, tol); }
  if (handle.includes("s")) { bottom += dy; bottom += nearestShift([bottom], ly, tol); }
  if (right - left < 8) { if (handle.includes("w")) left = right - 8; else right = left + 8; }
  if (bottom - top < 8) { if (handle.includes("n")) top = bottom - 8; else bottom = top + 8; }
  if (keep && handle.length === 2 && r.w > 0 && r.h > 0) {
    const ratio = r.w / r.h;
    const w = right - left, h = bottom - top;
    if (w / h > ratio) { const nh = w / ratio; if (handle.includes("n")) top = bottom - nh; else bottom = top + nh; }
    else { const nw = h * ratio; if (handle.includes("w")) left = right - nw; else right = left + nw; }
  }
  const rect = { x: left, y: top, w: right - left, h: bottom - top };
  const gx = touching("x", [handle.includes("w") ? left : NaN, handle.includes("e") ? right : NaN].filter((v) => !Number.isNaN(v)), lx);
  const gy = touching("y", [handle.includes("n") ? top : NaN, handle.includes("s") ? bottom : NaN].filter((v) => !Number.isNaN(v)), ly);
  return { rect, guides: [...gx, ...gy] };
}

/** An angle from a box's centre to the pointer, in degrees, 0 pointing up and clockwise; Shift snaps to 15°. */
export function angleFrom(cx: number, cy: number, px: number, py: number, step = 0): number {
  const a = (Math.atan2(py - cy, px - cx) * 180) / Math.PI + 90;
  const n = ((a % 360) + 360) % 360;
  return step ? Math.round(n / step) * step : n;
}
