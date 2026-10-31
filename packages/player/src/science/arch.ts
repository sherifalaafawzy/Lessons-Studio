import type { ArchElement } from "@lessonstudio/spec";
import { h, rich, svg } from "../dom.ts";
import { clamp01, fix } from "../motion.ts";
import type { KitRenderer } from "../templates/types.ts";
import { toneVar } from "./util.ts";

/**
 * A model's architecture: blocks in layers along the flow (longest path from the inputs, skip arrows aside), arrows
 * between them, residual connections routed around the side, and groups in a dashed frame with "× N". Blocks are HTML
 * (Arabic shapes and wraps there), arrows SVG underneath. Mirrored in right-to-left languages unless `fixed`.
 */

interface Placed { x: number; y: number; w: number; h: number; layer: number; i: number }

const SMALL = new Set(["add", "concat"]);
const GLYPH: Record<string, string> = { add: "+", concat: "‖" };

export const arch: KitRenderer = (el, box, ctx) => {
  const e = el as ArchElement;
  const W = e.w ?? 900;
  const H = e.h ?? 500;
  const flow = e.flow ?? "right";
  const vertical = flow !== "right";
  const flip = ctx.mirror && !e.fixed;
  const rtl = ctx.dir === "rtl";
  const ids = e.blocks.map((b) => b.id);
  const idx = new Map(ids.map((id, i) => [id, i]));
  const main = e.edges.filter((ed) => !ed.skip);
  const skips = e.edges.filter((ed) => ed.skip);

  // Layers: the longest path from an input (blocks without arrows in), in topological order.
  const preds = ids.map(() => [] as number[]);
  const succs = ids.map(() => [] as number[]);
  for (const ed of main) { preds[idx.get(ed.to)!]!.push(idx.get(ed.from)!); succs[idx.get(ed.from)!]!.push(idx.get(ed.to)!); }
  const layer = ids.map(() => 0);
  const order: number[] = [];
  const indeg = preds.map((p) => p.length);
  const queue = ids.map((_, i) => i).filter((i) => indeg[i] === 0);
  while (queue.length) {
    const n = queue.shift()!;
    order.push(n);
    for (const m of succs[n]!) { layer[m] = Math.max(layer[m]!, layer[n]! + 1); if (--indeg[m]! === 0) queue.push(m); }
  }
  const nLayers = Math.max(...layer) + 1;
  const byLayer: number[][] = Array.from({ length: nLayers }, () => []);
  for (const n of order) byLayer[layer[n]!]!.push(n);
  const most = Math.max(...byLayer.map((l) => l.length));

  // Sizes: along the flow each layer gets an equal slot; across, blocks share the width (or height).
  const groups = e.groups ?? [];
  // Room around the blocks: vertical flows keep skip arrows, a group's name and "× N" on one side (the end side, so the
  // start side when mirrored), so the blocks get the rest of the width; flows left to right keep names and "× N" above
  // and skip arrows below.
  const sideRoom = vertical ? (skips.length || groups.length ? 190 : 24) : 24;
  const topRoom = !vertical && groups.length ? 56 : 16;
  const bottomRoom = !vertical && skips.length ? 36 + 18 * skips.length : 16;
  const alongStart = vertical ? 12 : 16;
  const alongLen = (vertical ? H : W) - alongStart - (vertical ? 12 : 16);
  const crossLen = vertical ? W - sideRoom - 24 : H - topRoom - bottomRoom;
  const slot = alongLen / nLayers;
  const thick = vertical ? Math.min(96, slot * 0.66) : Math.min(230, slot * 0.8);
  const span = Math.min(vertical ? 460 : 170, (crossLen / most) * (vertical ? 0.86 : 0.8));
  const crossMid = vertical ? 24 + crossLen / 2 : topRoom + crossLen / 2;
  const placed: Placed[] = ids.map(() => ({ x: 0, y: 0, w: 0, h: 0, layer: 0, i: 0 }));
  byLayer.forEach((list, l) => {
    const alongC = alongStart + slot * (l + 0.5);
    list.forEach((n, k) => {
      const kind = e.blocks[n]!.kind;
      const small = SMALL.has(kind);
      const t = small ? Math.min(60, thick) : kind === "norm" && vertical ? thick * 0.62 : thick;
      const s = small ? Math.min(60, thick) : span;
      const cross = crossMid + (k - (list.length - 1) / 2) * (span + 24);
      const a = flow === "up" ? (vertical ? H : W) - alongC : alongC;
      let x = vertical ? cross - s / 2 : a - t / 2;
      const y = vertical ? a - t / 2 : cross - s / 2;
      const w = vertical ? s : t;
      if (flip) x = W - x - w;
      placed[n] = { x, y, w, h: vertical ? t : s, layer: l, i: n };
    });
  });

  const root = h("div", { className: "la" });
  root.style.width = `${W}px`;
  root.style.height = `${H}px`;
  const art = svg("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}`, className: "ls-el-svg la-svg", direction: "ltr" });
  root.append(art);

  // Points where an arrow leaves and enters a block, along the flow.
  const exitOf = (p: Placed): [number, number] => vertical ? [p.x + p.w / 2, flow === "up" ? p.y : p.y + p.h] : [flip ? p.x : p.x + p.w, p.y + p.h / 2];
  const entryOf = (p: Placed): [number, number] => vertical ? [p.x + p.w / 2, flow === "up" ? p.y + p.h : p.y] : [flip ? p.x + p.w : p.x, p.y + p.h / 2];
  const head = (x: number, y: number, ang: number): string => {
    const s = 14;
    return [[x, y], [x - s * Math.cos(ang - 0.45), y - s * Math.sin(ang - 0.45)], [x - s * Math.cos(ang + 0.45), y - s * Math.sin(ang + 0.45)]]
      .map((q) => q.map((v) => fix(v, 1)).join(",")).join(" ");
  };
  interface Arrow { g: SVGElement; from: number; to: number; pts: [number, number][] }
  const arrows: Arrow[] = [];
  const addArrow = (from: number, to: number, pts: [number, number][], label: string | undefined, skip: boolean): void => {
    const g = svg("g", { className: skip ? "la-e la-skip" : "la-e" });
    const d = pts.map((p, q) => `${q ? "L" : "M"}${fix(p[0], 1)} ${fix(p[1], 1)}`).join("");
    const [ax, ay] = pts[pts.length - 1]!;
    const [bx, by] = pts[pts.length - 2]!;
    g.append(svg("path", { d, fill: "none" }), svg("polygon", { points: head(ax, ay, Math.atan2(ay - by, ax - bx)) }));
    if (label) {
      const m = pts[Math.floor(pts.length / 2)]!;
      const t = svg("text", { x: fix(m[0] + (vertical ? 10 : 0), 1), y: fix(m[1] - 8, 1), "font-size": 26, className: "la-el", "text-anchor": vertical ? "start" : "middle" });
      t.textContent = label;
      g.append(t);
    }
    art.append(g);
    arrows.push({ g, from, to, pts });
  };
  for (const ed of main) {
    const a = idx.get(ed.from)!;
    const b = idx.get(ed.to)!;
    const [x1, y1] = exitOf(placed[a]!);
    const [x2, y2] = entryOf(placed[b]!);
    // Straight when aligned; otherwise out, across and in, at right angles.
    const pts: [number, number][] = Math.abs(vertical ? x1 - x2 : y1 - y2) < 1 ? [[x1, y1], [x2, y2]]
      : vertical ? [[x1, y1], [x1, (y1 + y2) / 2], [x2, (y1 + y2) / 2], [x2, y2]] : [[x1, y1], [(x1 + x2) / 2, y1], [(x1 + x2) / 2, y2], [x2, y2]];
    addArrow(a, b, pts, ed.label ? ctx.t(ed.label) : undefined, false);
  }
  skips.forEach((ed, k) => {
    // Around the blocks in between, on the side (vertical) or above (left to right).
    const a = placed[idx.get(ed.from)!]!;
    const b = placed[idx.get(ed.to)!]!;
    const lo = Math.min(a.layer, b.layer);
    const hi = Math.max(a.layer, b.layer);
    const between = placed.filter((p) => p.layer >= lo && p.layer <= hi);
    const off = 30 + 18 * k;
    if (vertical) {
      const side = flip ? Math.min(...between.map((p) => p.x)) - off : Math.max(...between.map((p) => p.x + p.w)) + off;
      const ax = flip ? a.x : a.x + a.w;
      const bx = flip ? b.x : b.x + b.w;
      addArrow(idx.get(ed.from)!, idx.get(ed.to)!, [[ax, a.y + a.h / 2], [side, a.y + a.h / 2], [side, b.y + b.h / 2], [bx, b.y + b.h / 2]], ed.label ? ctx.t(ed.label) : undefined, true);
    } else {
      const under = Math.max(...between.map((p) => p.y + p.h)) + off;
      addArrow(idx.get(ed.from)!, idx.get(ed.to)!, [[a.x + a.w / 2, a.y + a.h], [a.x + a.w / 2, under], [b.x + b.w / 2, under], [b.x + b.w / 2, b.y + b.h]], ed.label ? ctx.t(ed.label) : undefined, true);
    }
  });

  // Groups: a dashed frame around their blocks, a name, and "× N" beside it.
  const frames: { g: SVGElement; members: number[] }[] = [];
  for (const gr of groups) {
    const members = gr.blocks.map((b) => idx.get(b)!).filter((n) => n !== undefined);
    const ps = members.map((n) => placed[n]!);
    const pad = 18;
    // The frame takes in the skip arrows beside (vertical) or under (left to right) its blocks.
    const lane = skips.length ? 24 + 18 * skips.length : 0;
    let x = Math.min(...ps.map((p) => p.x)) - pad;
    let x2 = Math.max(...ps.map((p) => p.x + p.w)) + pad;
    if (vertical && lane) { if (flip) x -= lane; else x2 += lane; }
    const y = Math.min(...ps.map((p) => p.y)) - pad;
    const y2 = Math.max(...ps.map((p) => p.y + p.h)) + pad + (!vertical ? lane : 0);
    const g = svg("g", { className: "la-g" });
    g.append(svg("rect", { x: fix(x, 1), y: fix(y, 1), width: fix(x2 - x, 1), height: fix(y2 - y, 1), rx: 18 }));
    // Left to right: the name above the frame at its start, "× N" above its end. Vertical: both beside the frame, on
    // the side kept for them (blocks are stacked closely, so there's no room above).
    const sideX = flip ? x - 14 : x2 + 14;
    const sideAnchor = flip ? "end" : "start";
    const mid = (y + y2) / 2;
    if (gr.label) {
      const t = vertical
        ? svg("text", { x: fix(sideX, 1), y: fix(gr.repeat ? mid - 16 : mid + 8, 1), "font-size": 28, className: "la-gl", "text-anchor": sideAnchor })
        : svg("text", { x: fix((flip ? x2 : x) + (flip ? -6 : 6), 1), y: fix(y - 12, 1), "font-size": 28, className: "la-gl", "text-anchor": flip ? "end" : "start" });
      t.textContent = ctx.t(gr.label);
      g.append(t);
    }
    if (gr.repeat) {
      const t = vertical
        ? svg("text", { x: fix(sideX, 1), y: fix(gr.label ? mid + 26 : mid + 12, 1), "font-size": 36, className: "la-gr", "text-anchor": sideAnchor })
        : svg("text", { x: fix(flip ? x + 6 : x2 - 6, 1), y: fix(y - 12, 1), "font-size": 36, className: "la-gr", "text-anchor": flip ? "start" : "end" });
      t.setAttribute("direction", "ltr");
      t.textContent = `× ${gr.repeat}`;
      g.append(t);
    }
    art.insertBefore(g, art.firstChild);
    frames.push({ g, members });
  }

  // Blocks.
  const cards = e.blocks.map((b, n) => {
    const p = placed[n]!;
    const small = SMALL.has(b.kind);
    const card = h("div", { className: `la-b la-k-${b.kind}` });
    card.style.cssText = `left:${fix(p.x, 1)}px;top:${fix(p.y, 1)}px;width:${fix(p.w, 1)}px;height:${fix(p.h, 1)}px`;
    if (b.tone) { card.style.background = toneVar(b.tone); card.style.color = "var(--ls-on-accent)"; }
    if (small) {
      card.append(h("span", { className: "la-glyph" }, GLYPH[b.kind] ?? ""));
      const label = ctx.t(b.label);
      if (label.trim()) {
        const side = h("span", { className: "la-side" }, ...rich(label, rtl));
        card.append(side);
      }
    } else {
      const label = ctx.t(b.label);
      const size = fitSize(label, b.note ? ctx.t(b.note) : "", p.w - 20, p.h - 10);
      const lab = h("span", { className: "la-t" }, ...rich(label, rtl));
      lab.style.fontSize = `${fix(size, 1)}px`;
      card.append(lab);
      if (b.note) {
        const note = h("span", { className: "la-n" }, ...rich(ctx.t(b.note), rtl));
        note.style.fontSize = `${fix(Math.max(26, size * 0.8), 1)}px`;
        card.append(note);
      }
      if (b.kind === "rnn") card.append(h("span", { className: "la-loop" }, "↻"));
    }
    card.setAttribute("dir", ctx.dir);
    root.append(card);
    return card;
  });

  // The packet's road: from the first input along the first arrow out of each block, to an output.
  const road: [number, number][] = [];
  if (order.length) {
    let n: number | undefined = order[0];
    const seen = new Set<number>();
    while (n !== undefined && !seen.has(n)) {
      seen.add(n);
      const p = placed[n]!;
      road.push([p.x + p.w / 2, p.y + p.h / 2]);
      n = succs[n]![0];
    }
  }
  const lens = road.slice(1).map((p, q) => Math.hypot(p[0] - road[q]![0], p[1] - road[q]![1]));
  const total = lens.reduce((a, b) => a + b, 0);
  const packet = svg("circle", { r: 13, className: "la-p" });
  art.append(packet);
  box.append(root);

  const rank = new Map(order.map((n, k) => [n, k]));
  return (s) => {
    const nb = e.blocks.length;
    const shown = (n: number): number => clamp01(s.reveal * nb - (rank.get(n) ?? 0));
    const focus = Math.round(s.focus);
    cards.forEach((c, n) => {
      ctx.wr.style(c, "opacity", fix(shown(n)));
      ctx.wr.cls(c, "is-on", focus === n + 1);
    });
    for (const a of arrows) ctx.wr.style(a.g, "opacity", fix(Math.min(shown(a.from), shown(a.to))));
    for (const f of frames) ctx.wr.style(f.g, "opacity", fix(Math.min(...f.members.map(shown))));
    // The packet: forward over pass 0 → 1, back over 1 → 2 (the error), hidden otherwise.
    const on = s.pass >= 0 && s.pass <= 2 && total > 0;
    ctx.wr.style(packet, "opacity", on ? "1" : "0");
    if (on) {
      const back = s.pass > 1;
      let d = (back ? 2 - s.pass : s.pass) * total;
      let q = 0;
      while (q < lens.length - 1 && d > lens[q]!) { d -= lens[q]!; q++; }
      const k = lens[q] ? Math.min(1, d / lens[q]!) : 0;
      const a = road[q]!;
      const b = road[q + 1] ?? a;
      ctx.wr.attr(packet, "cx", fix(a[0] + (b[0] - a[0]) * k, 1));
      ctx.wr.attr(packet, "cy", fix(a[1] + (b[1] - a[1]) * k, 1));
      ctx.wr.cls(packet, "is-back", back);
    }
  };
};

/**
 * The largest label size (20–34 px) at which the longest word fits the block's width and the wrapped lines, with the
 * note under them, fit its height. Estimated from letter widths, so it never measures while playing.
 */
function fitSize(label: string, note: string, w: number, h: number): number {
  const per = (s: string): number => (/[\u0600-\u06ff]/.test(s) ? 0.52 : 0.62);
  const words = label.split(/\s+/).filter(Boolean);
  const longest = Math.max(1, ...words.map((x) => x.length * per(x)));
  for (let size = 34; size > 20; size--) {
    if (longest * size > w) continue;
    const lines = Math.ceil((label.length * per(label) * size) / Math.max(1, w));
    if (lines * size * 1.18 + (note ? size * 0.9 : 0) <= h) return size;
  }
  return 20;
}
