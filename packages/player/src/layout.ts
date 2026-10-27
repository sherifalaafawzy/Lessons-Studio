import type { Dir, FlowEdge, FlowNode } from "@lessonstudio/spec";

export type Orient = "landscape" | "portrait" | "square";

/** Logical stage sizes. The stage is drawn at this size and scaled to fit. */
export const STAGE: Record<Orient, { W: number; H: number }> = {
  landscape: { W: 1280, H: 720 },
  portrait: { W: 720, H: 1280 },
  square: { W: 1080, H: 1080 },
};

/** Portrait on narrow, tall screens (phones held upright); landscape otherwise. */
export function autoOrient(width: number, screenW: number, screenH: number): Orient {
  if (!width) return "landscape";
  return width < 640 && screenH >= screenW * 1.2 ? "portrait" : "landscape";
}

export interface Box { x: number; y: number; w: number; h: number }
export interface EdgeGeom { from: string; to: string; x1: number; y1: number; x2: number; y2: number; len: number; head: string }
export interface FlowLayout { nodes: Record<string, Box>; edges: EdgeGeom[] }

/** Longest-path layers, sources first. Nodes caught in a cycle go after the rest, in input order. */
export function layers(nodes: FlowNode[], edges: FlowEdge[]): string[][] {
  const ids = nodes.map((n) => n.id);
  const indeg = new Map(ids.map((id) => [id, 0]));
  for (const e of edges) indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);
  const layer = new Map<string, number>(ids.map((id) => [id, 0]));
  const queue = ids.filter((id) => indeg.get(id) === 0);
  const done = new Set<string>();
  while (queue.length) {
    const u = queue.shift()!;
    done.add(u);
    for (const e of edges) {
      if (e.from !== u) continue;
      layer.set(e.to, Math.max(layer.get(e.to) ?? 0, (layer.get(u) ?? 0) + 1));
      indeg.set(e.to, (indeg.get(e.to) ?? 0) - 1);
      if (indeg.get(e.to) === 0) queue.push(e.to);
    }
  }
  let max = Math.max(0, ...[...done].map((id) => layer.get(id) ?? 0));
  for (const id of ids) if (!done.has(id)) layer.set(id, ++max);
  const out: string[][] = [];
  for (const id of ids) (out[layer.get(id)!] ??= []).push(id);
  return out.filter(Boolean);
}

/** Where a line from the centre of `b` towards (tx, ty) leaves the box, plus a small gap. */
function exit(b: Box, tx: number, ty: number, gap: number): [number, number] {
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const dx = tx - cx;
  const dy = ty - cy;
  const k = Math.min(dx ? b.w / 2 / Math.abs(dx) : Infinity, dy ? b.h / 2 / Math.abs(dy) : Infinity);
  const len = Math.hypot(dx, dy) || 1;
  return [cx + dx * k + (dx / len) * gap, cy + dy * k + (dy / len) * gap];
}

const r1 = (x: number): number => Math.round(x * 10) / 10;

/**
 * Positions for a flow diagram on the stage. Landscape and square run in columns, portrait in rows.
 * Right-to-left mirrors every x, so the flow reads from the right.
 */
export function layoutFlow(nodes: FlowNode[], edges: FlowEdge[], o: { orient: Orient; dir: Dir; top: number; bottom: number }): FlowLayout {
  const { W, H } = STAGE[o.orient];
  const L = layers(nodes, edges);
  const area = { x: 64, y: o.top, w: W - 128, h: H - o.top - o.bottom };
  const boxes: Record<string, Box> = {};
  if (o.orient === "portrait") {
    const rowH = area.h / L.length;
    L.forEach((row, i) => {
      const colW = area.w / row.length;
      const w = Math.min(300, colW - 28);
      const h = Math.min(132, rowH - 64);
      row.forEach((id, k) => {
        boxes[id] = { x: area.x + colW * k + (colW - w) / 2, y: area.y + rowH * i + (rowH - h) / 2, w, h };
      });
    });
  } else {
    const colW = area.w / L.length;
    L.forEach((col, i) => {
      const rowH = area.h / col.length;
      const w = Math.min(250, colW - 64);
      const h = Math.min(124, rowH - 40);
      col.forEach((id, k) => {
        boxes[id] = { x: area.x + colW * i + (colW - w) / 2, y: area.y + rowH * k + (rowH - h) / 2, w, h };
      });
    });
  }
  for (const b of Object.values(boxes)) {
    if (o.dir === "rtl") b.x = W - b.x - b.w;
    b.x = r1(b.x); b.y = r1(b.y); b.w = r1(b.w); b.h = r1(b.h);
  }
  const geoms: EdgeGeom[] = [];
  for (const e of edges) {
    const a = boxes[e.from];
    const b = boxes[e.to];
    if (!a || !b) continue;
    const [x1, y1] = exit(a, b.x + b.w / 2, b.y + b.h / 2, 8);
    const [x2, y2] = exit(b, a.x + a.w / 2, a.y + a.h / 2, 14);
    const len = Math.hypot(x2 - x1, y2 - y1);
    const ux = (x2 - x1) / (len || 1);
    const uy = (y2 - y1) / (len || 1);
    const head = [
      [x2 + ux * 8, y2 + uy * 8],
      [x2 - ux * 10 - uy * 9, y2 - uy * 10 + ux * 9],
      [x2 - ux * 10 + uy * 9, y2 - uy * 10 - ux * 9],
    ].map(([x, y]) => `${r1(x!)},${r1(y!)}`).join(" ");
    geoms.push({ from: e.from, to: e.to, x1: r1(x1), y1: r1(y1), x2: r1(x2), y2: r1(y2), len: r1(len), head });
  }
  return { nodes: boxes, edges: geoms };
}
