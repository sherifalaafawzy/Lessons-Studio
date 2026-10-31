import { svg } from "../../dom.ts";
import { clamp01, fix } from "../../motion.ts";
import type { Ctx, KitRenderer } from "../../templates/types.ts";
import { baseSize, est, fit, glyph, label, onTone, smooth, tv, type Topology } from "./util.ts";

/**
 * Devices and links: laid out as a star, a line, a tree or a mesh (or by hand), with Wi-Fi rings, zones ("Your
 * home", "The internet"), broken links and devices, and packets hopping along routes. Mirrored in right-to-left
 * languages unless `fixed`.
 */

interface Pt { x: number; y: number }

/** A logical anchor for text placed on the physical left or right of something. */
export const sideAnchor = (left: boolean, ctx: Ctx): "start" | "end" => (left === (ctx.dir !== "rtl") ? "start" : "end");

export const topology: KitRenderer = (el, box, ctx) => {
  const e = el as Topology;
  const W = e.w ?? 900;
  const H = e.h ?? 500;
  const flip = ctx.mirror && !e.fixed;
  const fs = baseSize(ctx, e.size);
  const fn = Math.round(fs * 0.94);
  const devs = e.devices;
  const n = devs.length;
  const idx = new Map(devs.map((d, i) => [d.id, i]));
  const links = e.links ?? [];
  const routes = e.routes ?? [];
  const zones = e.zones ?? [];
  const layout = e.layout ?? "star";
  // A line in a tall box runs down it.
  const upright = layout === "line" && H > W * 1.2;
  const top = zones.length ? fs * 1.3 + 14 : 0;

  // Levels from the first device, for trees.
  const nb = devs.map(() => [] as number[]);
  for (const l of links) { const a = idx.get(l.from); const b = idx.get(l.to); if (a !== undefined && b !== undefined) { nb[a]!.push(b); nb[b]!.push(a); } }
  const level = devs.map(() => -1);
  const order: number[] = [];
  if (n) { level[0] = 0; order.push(0); }
  for (let k = 0; k < order.length; k++) for (const m of nb[order[k]!]!) if (level[m]! < 0) { level[m] = level[order[k]!]! + 1; order.push(m); }
  const deepest = Math.max(0, ...level);
  devs.forEach((_, i) => { if (level[i]! < 0) { level[i] = deepest + 1; order.push(i); } });
  const levels = Math.max(...level) + 1;
  const perLevel = Array.from({ length: levels }, (_, d) => order.filter((i) => level[i] === d));
  const cols = layout === "mesh" ? Math.max(1, Math.min(n, Math.round(Math.sqrt((n * W) / Math.max(1, H - top) * 0.7)))) : 1;
  const rows = Math.ceil(n / cols);

  // Room under each card: its label's lines at the width it will roughly get, and a note.
  const nominal = layout === "line" ? (upright ? W * 0.8 : W / n) : layout === "tree" ? W / Math.max(...perLevel.map((l) => l.length)) : layout === "mesh" ? W / (cols + 0.5) : Math.min(320, W / 3);
  const lines = Math.max(0, ...devs.map((d) => (d.label ? fit(ctx.t(d.label), fs, nominal - 24, 2, fn).lines.length : 0)));
  const labelH = lines * fs * 1.15 + (devs.some((d) => d.note) ? fn * 1.15 : 0) + 12;

  const place = (R: number): Pt[] => {
    const y0 = top + R + 6;
    const span = Math.max(0, H - labelH - R - y0);
    const mid = y0 + span / 2;
    const out: Pt[] = devs.map(() => ({ x: W / 2, y: mid }));
    if (layout === "line" && upright) devs.forEach((_, i) => { out[i] = { x: W / 2, y: n > 1 ? y0 + (span * i) / (n - 1) : mid }; });
    else if (layout === "line") devs.forEach((_, i) => { out[i] = { x: (W * (i + 0.5)) / n, y: mid }; });
    else if (layout === "tree") perLevel.forEach((list, d) => list.forEach((i, k) => { out[i] = { x: (W * (k + 0.5)) / list.length, y: levels > 1 ? y0 + (span * d) / (levels - 1) : mid }; }));
    else if (layout === "mesh") {
      const cw = W / (cols + (rows > 1 ? 0.5 : 0));
      devs.forEach((_, i) => {
        const r = Math.floor(i / cols);
        out[i] = { x: cw * ((i % cols) + 0.5 + (r % 2 ? 0.5 : 0)), y: rows > 1 ? y0 + (span * r) / (rows - 1) : mid };
      });
    } else if (n > 1) {
      // A star: the first device in the middle, the others round it, none straight under its label.
      // Spread to fill the box: the farthest devices reach its sides and its top and bottom.
      const m = n - 1;
      const rx = W / 2 - R - Math.min(130, W * 0.11);
      const ry = span / 2;
      const ang = Array.from({ length: m }, (_, k) => -Math.PI / 2 + (2 * Math.PI * k) / m + (m % 2 ? 0 : Math.PI / m));
      const cx = Math.max(...ang.map((a) => Math.abs(Math.cos(a)))) || 1;
      const cy = Math.max(...ang.map((a) => Math.abs(Math.sin(a)))) || 1;
      ang.forEach((a, k) => { out[k + 1] = { x: W / 2 + (rx * Math.cos(a)) / cx, y: mid + (ry * Math.sin(a)) / cy }; });
    }
    devs.forEach((d, i) => { if (d.x !== undefined && d.y !== undefined) out[i] = { x: d.x, y: d.y }; });
    return out;
  };
  // Cards as big as the room allows: up to 56 px across on a 1280 stage, smaller when devices sit close.
  let R = Math.min((56 * fs) / 34, Math.max(0, H - top - labelH - 12) / 2);
  let pos = place(R);
  let closest = Infinity;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) closest = Math.min(closest, Math.hypot(pos[i]!.x - pos[j]!.x, pos[i]!.y - pos[j]!.y));
  if (closest * 0.3 < R) { R = Math.max((26 * fs) / 34, closest * 0.3); pos = place(R); }
  if (flip) pos = pos.map((p) => ({ x: W - p.x, y: p.y }));

  // Each label gets the width to its nearest neighbour in its row.
  const texts = devs.map((d, i) => {
    let room = (360 * fs) / 34;
    pos.forEach((q, j) => {
      const dx = Math.abs(q.x - pos[i]!.x);
      if (j !== i && dx > 1 && Math.abs(q.y - pos[i]!.y) < R + labelH) room = Math.min(room, dx - 18);
    });
    room = Math.max(room, 2 * R + 16);
    const lab = d.label ? fit(ctx.t(d.label), fs, room, 2, fn) : { lines: [], size: fs };
    const note = d.note ? fit(ctx.t(d.note), fn, room, 1, fn) : undefined;
    const w = Math.max(2 * R, ...lab.lines.map((l) => est(l, lab.size)), ...(note ? note.lines.map((l) => est(l, fn)) : []));
    return { lab, note, w, h: lab.lines.length * lab.size * 1.15 + (note ? fn * 1.15 : 0) };
  });

  const root = svg("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}`, className: "ls-el-svg pn", direction: "ltr" });
  const zoneL = svg("g");
  const ringL = svg("g");
  const linkL = svg("g");
  const trailL = svg("g");
  const devL = svg("g");
  const pkL = svg("g");
  root.append(zoneL, ringL, linkL, trailL, devL, pkL);

  // Zones: a dashed frame round their devices and labels, its name inside at the top (start side).
  const zrects = zones.map((z) => {
    const ms = z.devices.map((id) => idx.get(id)!).filter((i) => i !== undefined);
    const half = (i: number): number => Math.max(R, texts[i]!.w / 2);
    // At least as wide as its name.
    let x = Math.min(...ms.map((i) => pos[i]!.x - half(i))) - 14;
    let x2 = Math.max(...ms.map((i) => pos[i]!.x + half(i))) + 14;
    const need = est(ctx.t(z.label), fn) + 36 - (x2 - x);
    if (need > 0) { x -= need / 2; x2 += need / 2; }
    return {
      z, ms,
      x: Math.max(2, x),
      x2: Math.min(W - 2, x2),
      y: Math.max(2, Math.min(...ms.map((i) => pos[i]!.y - R)) - fs * 1.3 - 10),
      y2: Math.min(H - 2, Math.max(...ms.map((i) => pos[i]!.y + R + texts[i]!.h + 8)) + 8),
    };
  });
  // Frames side by side share the space between them.
  for (const a of zrects) for (const b of zrects) {
    if (a === b || a.x >= b.x || a.x2 <= b.x || a.y2 <= b.y || b.y2 <= a.y) continue;
    const m = (a.x2 + b.x) / 2;
    a.x2 = m - 8;
    b.x = m + 8;
  }
  const zoneEls = zrects.map((r) => {
    const g = svg("g", { className: "pn-z" });
    if (r.z.tone) g.style.color = tv(r.z.tone);
    g.append(svg("rect", { x: fix(r.x, 1), y: fix(r.y, 1), width: fix(r.x2 - r.x, 1), height: fix(r.y2 - r.y, 1), rx: 22 }));
    const left = !flip;
    const zl = fit(ctx.t(r.z.label), fn, r.x2 - r.x - 32, 1, fn);
    g.append(label(zl.lines, left ? r.x + 16 : r.x2 - 16, r.y + 8 + fn * 0.9, zl.size, "pn-zl", ctx, sideAnchor(left, ctx)));
    zoneL.append(g);
    return { g, first: Math.min(...r.ms) };
  });

  // Wi-Fi range: three rings.
  const rings = devs.map((d, i) => {
    if (!d.range) return undefined;
    const g = svg("g", { className: "pn-ring" });
    for (const k of [1, 2, 3]) g.append(svg("circle", { cx: fix(pos[i]!.x, 1), cy: fix(pos[i]!.y, 1), r: fix((d.range * k) / 3, 1) }));
    ringL.append(g);
    return g;
  });

  // Links, cut back to the cards' edges; a cross in the middle of one that breaks.
  const cut = (a: Pt, b: Pt, by: number): [Pt, Pt] => {
    const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const ux = (b.x - a.x) / L;
    const uy = (b.y - a.y) / L;
    return [{ x: a.x + ux * by, y: a.y + uy * by }, { x: b.x - ux * by, y: b.y - uy * by }];
  };
  const linkEls = links.map((l) => {
    const a = idx.get(l.from)!;
    const b = idx.get(l.to)!;
    const [p, q] = cut(pos[a]!, pos[b]!, R + 2);
    const g = svg("g");
    const line = svg("line", { x1: fix(p.x, 1), y1: fix(p.y, 1), x2: fix(q.x, 1), y2: fix(q.y, 1), className: l.kind === "wireless" ? "pn-l is-w" : "pn-l" });
    g.append(line);
    const mx = (p.x + q.x) / 2;
    const my = (p.y + q.y) / 2;
    if (l.label) {
      // Beside the middle of the line, on its upper side.
      const L = Math.hypot(q.x - p.x, q.y - p.y) || 1;
      let nx = -(q.y - p.y) / L;
      let ny = (q.x - p.x) / L;
      if (ny > 0 || (ny === 0 && nx > 0)) { nx = -nx; ny = -ny; }
      const off = fn * 0.75 + 6;
      g.append(label([ctx.t(l.label)], mx + nx * off, my + ny * off + fn * 0.35, fn, "pn-ll pn-h", ctx));
    }
    let x: SVGElement | undefined;
    if (l.kind === "down" || l.downAt !== undefined) {
      const s = (12 * fs) / 34;
      x = svg("g", { className: "pn-x" },
        svg("circle", { cx: fix(mx, 1), cy: fix(my, 1), r: fix(s * 1.6, 1) }),
        svg("path", { d: `M${fix(mx - s, 1)} ${fix(my - s, 1)}L${fix(mx + s, 1)} ${fix(my + s, 1)}M${fix(mx + s, 1)} ${fix(my - s, 1)}L${fix(mx - s, 1)} ${fix(my + s, 1)}` }));
      g.append(x);
    }
    linkL.append(g);
    return { g, line, x, a, b, l };
  });

  // Devices: a card with its glyph, the label and note under it, a cross for one that can break.
  const cards = devs.map((d, i) => {
    const { x, y } = pos[i]!;
    const g = svg("g", { className: "pn-d" });
    if (d.tone) g.style.color = tv(d.tone);
    g.append(svg("circle", { cx: fix(x, 1), cy: fix(y, 1), r: fix(R, 1), className: "pn-c" }), glyph(d.kind, x, y, R * 1.2));
    const t = texts[i]!;
    let by = y + R + 4 + t.lab.size * 0.95;
    if (t.lab.lines.length) { g.append(label(t.lab.lines, x, by, t.lab.size, "pn-h", ctx)); by += t.lab.lines.length * t.lab.size * 1.15; }
    if (t.note) g.append(label(t.note.lines, x, by - t.lab.size * 0.95 + fn * 0.95, fn, "pn-m pn-h", ctx));
    let bad: SVGElement | undefined;
    if (d.down || d.downAt !== undefined) {
      const bx = x + (flip ? -1 : 1) * R * 0.72;
      const byy = y - R * 0.72;
      const s = R * 0.17;
      bad = svg("g", { className: "pn-x" },
        svg("circle", { cx: fix(bx, 1), cy: fix(byy, 1), r: fix(R * 0.34, 1) }),
        svg("path", { d: `M${fix(bx - s, 1)} ${fix(byy - s, 1)}L${fix(bx + s, 1)} ${fix(byy + s, 1)}M${fix(bx + s, 1)} ${fix(byy - s, 1)}L${fix(bx - s, 1)} ${fix(byy + s, 1)}` }));
      g.append(bad);
    }
    devL.append(g);
    return { g, bad };
  });

  // Routes: a trail lit hop by hop under the cards, and a packet (with its tag) on top.
  const paths = routes.map((r) => {
    const pts = r.path.map((id) => pos[idx.get(id)!]!);
    const segs = pts.slice(1).map(() => {
      const s = svg("line", { className: "pn-rt", x1: 0, y1: 0, x2: 0, y2: 0 });
      s.style.stroke = tv(r.tone, "accent");
      trailL.append(s);
      return s;
    });
    const pk = svg("g", { className: "pn-pk" });
    const pr = Math.max(12, R * 0.3);
    const dot = svg("circle", { r: fix(pr, 1) });
    dot.style.fill = tv(r.tone, "accent");
    pk.append(dot);
    let tagG: SVGElement | undefined;
    if (r.label) {
      const s = ctx.t(r.label);
      const w = est(s, fn) + 28;
      const hh = fn * 1.35;
      // Over the card when the packet is at a device, so the device still shows.
      const cy = -(Math.max(pr, R) + hh / 2 + 4);
      const tag = svg("rect", { x: fix(-w / 2, 1), y: fix(cy - hh / 2, 1), width: fix(w, 1), height: fix(hh, 1), rx: fix(hh / 2, 1), className: "pn-tag" });
      tag.style.fill = tv(r.tone, "accent");
      const t = label([s], 0, cy + fn * 0.36, fn, "", ctx);
      t.style.fill = onTone(r.tone ?? "accent");
      tagG = svg("g", null, tag, t);
      pk.append(tagG);
    }
    pkL.append(pk);
    return { pts, segs, pk, tag: tagG, ids: r.path.map((id) => idx.get(id)!) };
  });

  box.append(root);

  const at = (pts: Pt[], q: number): { p: Pt; hop: number; mid: number } => {
    const m = pts.length - 1;
    const hq = clamp01(q) * m;
    const hop = Math.min(m - 1, Math.floor(hq));
    const k = smooth(hq - hop);
    const a = pts[hop]!;
    const b = pts[hop + 1]!;
    return { p: { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k }, hop, mid: Math.min(k, 1 - k) };
  };
  const seg = (s: SVGElement, a: Pt, b: Pt): void => {
    ctx.wr.attr(s, "x1", fix(a.x, 1)); ctx.wr.attr(s, "y1", fix(a.y, 1));
    ctx.wr.attr(s, "x2", fix(b.x, 1)); ctx.wr.attr(s, "y2", fix(b.y, 1));
  };

  return (s) => {
    const shown = (i: number): number => clamp01(s.reveal * n - i);
    const f = s.frame;
    const focus = Math.round(s.focus);
    cards.forEach((c, i) => {
      const d = devs[i]!;
      ctx.wr.style(c.g, "opacity", fix(shown(i)));
      ctx.wr.cls(c.g, "is-on", focus === i + 1);
      const down = !!d.down || (d.downAt !== undefined && f >= d.downAt);
      ctx.wr.cls(c.g, "is-down", down);
      if (c.bad) ctx.wr.style(c.bad, "opacity", down ? "1" : "0");
    });
    rings.forEach((r, i) => { if (r) ctx.wr.style(r, "opacity", fix(shown(i))); });
    zoneEls.forEach((z) => ctx.wr.style(z.g, "opacity", fix(shown(z.first))));
    for (const k of linkEls) {
      ctx.wr.style(k.g, "opacity", fix(Math.min(shown(k.a), shown(k.b))));
      const down = k.l.kind === "down" || (k.l.downAt !== undefined && f >= k.l.downAt);
      ctx.wr.cls(k.line, "is-down", down);
      if (k.x) ctx.wr.style(k.x, "opacity", down ? "1" : "0");
    }
    // Which route moves, and how far: `pass` carries route ⌊frame⌋ there and back; else frame k → k + 1 carries route k.
    let active = -1;
    let q = 0;
    let back = false;
    if (paths.length && s.pass >= 0) {
      active = Math.min(paths.length - 1, Math.max(0, Math.floor(f)));
      back = s.pass > 1;
      q = back ? 2 - Math.min(2, s.pass) : s.pass;
    } else if (paths.length && f > 0) {
      active = Math.min(paths.length - 1, Math.floor(f));
      q = clamp01(f - active);
    }
    paths.forEach((r, k) => {
      const on = k === active && r.ids.every((i) => shown(i) >= 1);
      ctx.wr.style(r.pk, "opacity", on ? "1" : "0");
      if (!on) { for (const sg of r.segs) ctx.wr.style(sg, "opacity", "0"); return; }
      const { p, hop, mid } = at(r.pts, q);
      ctx.wr.style(r.pk, "transform", `translate(${fix(p.x, 1)}px,${fix(p.y, 1)}px)`);
      // The tag reads at each device and fades between them, where it would cover labels.
      if (r.tag) ctx.wr.style(r.tag, "opacity", fix(0.3 + 0.7 * clamp01(1 - mid / 0.2)));
      r.segs.forEach((sg, j) => {
        const lit = back ? j >= hop : j <= hop;
        ctx.wr.style(sg, "opacity", lit ? "1" : "0");
        if (!lit) return;
        if (j === hop) seg(sg, back ? r.pts[j + 1]! : r.pts[j]!, p);
        else seg(sg, r.pts[j]!, r.pts[j + 1]!);
      });
    });
  };
};
