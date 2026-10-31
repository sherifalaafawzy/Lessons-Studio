import type { Element } from "@lessonstudio/spec";
import { h, rich, svg } from "../../dom.ts";
import { icon } from "../../icons.ts";
import { clamp01, fix } from "../../motion.ts";
import type { KitRenderer } from "../../templates/types.ts";
import { ems, lerp, px, setText, smooth, toneVar } from "./util.ts";

type P = Extract<Element, { type: "pipeline" }>;
type Way = P["records"][number]["path"][number];
interface Rect { x: number; y: number; w: number; h: number }

const SP = 0.75; // dot spacing, em
const ICON: Record<string, string> = { source: "data", store: "data", check: "shield", step: "spark" };

/**
 * A data pipeline: stages in layers along the flow (top to bottom in a tall box), arrows between them, records as
 * dots resting in each stage's tray and moving along the arrows, a counter on each stage, and a set-aside tray under
 * the stage that catches bad records (danger; fixed ones turn ok). Mirrors in right-to-left languages unless `fixed`.
 */
export const pipeline: KitRenderer = (el, box, ctx) => {
  const e = el as P;
  const W = e.w ?? 1100;
  const H = e.h ?? 400;
  const flip = ctx.mirror && !e.fixed;
  const rtl = ctx.dir === "rtl";
  const n = e.stages.length;
  const ids = e.stages.map((s) => s.id);
  const edges = e.edges.map(([a, b]) => [ids.indexOf(a), ids.indexOf(b)] as [number, number]);

  // Layers: the longest path from a stage with no arrows in.
  const layer = ids.map(() => 0);
  const order: number[] = [];
  const indeg = ids.map((_, i) => edges.filter((x) => x[1] === i).length);
  const queue = ids.map((_, i) => i).filter((i) => indeg[i] === 0);
  while (queue.length) {
    const a = queue.shift()!;
    order.push(a);
    for (const [x, b] of edges) if (x === a) { layer[b] = Math.max(layer[b]!, layer[a]! + 1); if (--indeg[b]! === 0) queue.push(b); }
  }
  const L = Math.max(...layer) + 1;
  const byLayer: number[][] = Array.from({ length: L }, () => []);
  for (const a of order) byLayer[layer[a]!]!.push(a);
  const most = Math.max(...byLayer.map((l) => l.length));

  // Sizes in em, then the text size that fits.
  const labels = e.stages.map((s) => ctx.t(s.label));
  const nRec = Math.max(1, e.records.length);
  const cols = Math.min(nRec, 6);
  const trayRows = Math.ceil(nRec / cols);
  const cw = Math.max(5.4, cols * SP + 1, ...labels.map((l) => Math.max(...l.split(/\s+/).map((x) => ems(x))) + 1));
  const lines = Math.min(2, Math.max(...labels.map((l) => Math.ceil(ems(l) / (cw - 1)))));
  const ch = 0.5 + 1.3 + 0.15 + lines * 1.22 + 0.5 + trayRows * SP + 0.4;
  const asideAt = new Set(e.records.flatMap((r) => r.path.filter((w) => w.length === 3).map((w) => w[1])));
  const aside = e.aside ? ctx.t(e.aside) : "";
  const trayH = 0.4 + (aside ? 1.15 : 0) + trayRows * SP + 0.3;
  const extra = asideAt.size ? trayH + 1.6 : 0;
  // Along the width, or top to bottom when that's clearly bigger (a tall box).
  const across = Math.min(W / (L * cw + (L - 1) * 2.6), H / (most * ch + (most - 1) * 0.9 + extra + 0.7));
  const down = Math.min(H / (L * ch + (L - 1) * 2 + 0.7), W / (most * cw + (most - 1) * 0.9 + (asideAt.size ? cw + 1.6 : 0)));
  const vertical = down > across * 1.15;
  const size = Math.min(e.size ?? 42, vertical ? down : across);
  const cwp = cw * size;
  const chp = ch * size;

  // Cards: along the flow in even slots, each layer's cards centred across it.
  const cards: Rect[] = ids.map(() => ({ x: 0, y: 0, w: cwp, h: chp }));
  byLayer.forEach((ls, l) => {
    ls.forEach((a, k) => {
      if (vertical) {
        const y = (H - L * chp) / (L + 1) * (l + 1) + l * chp;
        const span = most * cwp + (most - 1) * 0.9 * size + (asideAt.size ? cwp + 1.6 * size : 0);
        const x = (W - span) / 2 + k * (cwp + 0.9 * size);
        cards[a] = { x: flip ? W - x - cwp : x, y, w: cwp, h: chp };
      } else {
        const x = (W - L * cwp) / (L + 1) * (l + 1) + l * cwp;
        const span = ls.length * chp + (ls.length - 1) * 0.9 * size;
        const y = (H - (most * chp + (most - 1) * 0.9 * size + extra * size)) / 2 + 0.35 * size + (most * chp + (most - 1) * 0.9 * size - span) / 2 + k * (chp + 0.9 * size);
        cards[a] = { x: flip ? W - x - cwp : x, y, w: cwp, h: chp };
      }
    });
  });
  // The set-aside trays: under the card (beside it, to the end side, in a tall box).
  const trays = new Map<number, Rect>();
  for (const s of asideAt) {
    const c = cards[s]!;
    const th = trayH * size;
    trays.set(s, vertical ? { x: c.x + (flip ? -cwp - 1.6 * size : cwp + 1.6 * size), y: c.y + (chp - th) / 2, w: cwp, h: th } : { x: c.x, y: c.y + chp + 1.6 * size, w: cwp, h: th });
  }
  // Where dot i rests in a tray band.
  const bands = cards.map((c) => ({ x: c.x, y: c.y + chp - (0.4 + trayRows * SP) * size, w: c.w }));
  const asideBands = new Map([...trays].map(([s, t]) => [s, { x: t.x, y: t.y + t.h - (0.3 + trayRows * SP) * size, w: t.w }]));
  const slot = (b: { x: number; y: number; w: number }, i: number): [number, number] => {
    const col = i % cols;
    const row = Math.floor(i / cols) % trayRows;
    const c = rtl ? cols - 1 - col : col;
    return [b.x + b.w / 2 + (c - (cols - 1) / 2) * SP * size, b.y + (row + 0.5) * SP * size];
  };
  const at = (w: Way, i: number): [number, number] => slot(w[2] ? asideBands.get(w[1])! : bands[w[1]]!, i);

  const root = h("div", { className: "pd-p" });
  root.style.fontSize = px(size);
  const art = svg("svg", { className: "ls-el-svg pd-links", width: W, height: H, viewBox: `0 0 ${W} ${H}`, direction: "ltr" });
  const head = (x: number, y: number, ang: number): string => {
    const s = 0.42 * size;
    return [[x, y], [x - s * Math.cos(ang - 0.5), y - s * Math.sin(ang - 0.5)], [x - s * Math.cos(ang + 0.5), y - s * Math.sin(ang + 0.5)]].map((q) => q.map((v) => fix(v, 1)).join(",")).join(" ");
  };
  const arrow = (pts: [number, number][], cls: string): SVGElement => {
    const g = svg("g", { className: cls });
    const [ax, ay] = pts[pts.length - 1]!;
    const [bx, by] = pts[pts.length - 2]!;
    g.append(svg("path", { d: pts.map((p, k) => `${k ? "L" : "M"}${fix(p[0], 1)} ${fix(p[1], 1)}`).join(""), fill: "none" }), svg("polygon", { points: head(ax, ay, Math.atan2(ay - by, ax - bx)) }));
    art.append(g);
    return g;
  };
  const arrows = edges.map(([a, b]) => {
    const A = cards[a]!;
    const B = cards[b]!;
    let pts: [number, number][];
    if (vertical) {
      const x1 = A.x + A.w / 2, y1 = A.y + A.h, x2 = B.x + B.w / 2, y2 = B.y - 0.1 * size;
      pts = Math.abs(x1 - x2) < 1 ? [[x1, y1], [x2, y2]] : [[x1, y1], [x1, (y1 + y2) / 2], [x2, (y1 + y2) / 2], [x2, y2]];
    } else {
      const fwd = A.x < B.x;
      const x1 = fwd ? A.x + A.w : A.x, y1 = A.y + A.h / 2, x2 = fwd ? B.x - 0.1 * size : B.x + B.w + 0.1 * size, y2 = B.y + B.h / 2;
      pts = Math.abs(y1 - y2) < 1 ? [[x1, y1], [x2, y2]] : [[x1, y1], [(x1 + x2) / 2, y1], [(x1 + x2) / 2, y2], [x2, y2]];
    }
    return { g: arrow(pts, "pd-pe"), a, b };
  });
  const asideArrows = [...trays].map(([s, t]) => {
    const c = cards[s]!;
    const pts: [number, number][] = vertical
      ? [[flip ? c.x : c.x + c.w, c.y + c.h / 2], [flip ? t.x + t.w + 0.1 * size : t.x - 0.1 * size, c.y + c.h / 2]]
      : [[c.x + c.w / 2, c.y + c.h], [c.x + c.w / 2, t.y - 0.1 * size]];
    return { g: arrow(pts, "pd-pe pd-pa"), s };
  });
  root.append(art);

  const counts = e.counts !== false;
  const cardEls = e.stages.map((st, i) => {
    const c = cards[i]!;
    const card = h("div", { className: `pd-st pd-st-${st.kind ?? "step"}`, dir: ctx.dir });
    card.style.cssText += `;left:${px(c.x)};top:${px(c.y)};width:${px(c.w)};height:${px(c.h)}`;
    if (st.tone) card.style.setProperty("--pd-tone", toneVar(st.tone));
    const ic = icon((st.icon ?? ICON[st.kind ?? "step"]) as never, Math.round(1.3 * size));
    card.append(ic, h("span", { className: "pd-sl" }, ...rich(labels[i]!, rtl)));
    const badge = h("span", { className: "pd-cnt", dir: "ltr" });
    if (counts) card.append(badge);
    root.append(card);
    return { card, badge };
  });
  const trayEls = [...trays].map(([s, t]) => {
    const tray = h("div", { className: "pd-tray", dir: ctx.dir });
    tray.style.cssText += `;left:${px(t.x)};top:${px(t.y)};width:${px(t.w)};height:${px(t.h)}`;
    if (aside) tray.append(h("span", { className: "pd-tl2" }, ...rich(aside, rtl)));
    const badge = h("span", { className: "pd-cnt", dir: "ltr" });
    if (counts) tray.append(badge);
    root.append(tray);
    return { s, tray, badge };
  });
  const dots = e.records.map(() => {
    const d = svg("circle", { r: fix(0.29 * size, 1), className: "pd-dot" });
    return d;
  });
  const dotLayer = svg("svg", { className: "ls-el-svg pd-links", width: W, height: H, viewBox: `0 0 ${W} ${H}`, direction: "ltr" }, ...dots);
  root.append(dotLayer);
  box.append(root);

  const rank = new Map(order.map((a, k) => [a, k]));
  const T = e.frames.length - 1;
  return (st) => {
    const t = st.pass >= 0 ? clamp01(st.pass) * T : Math.max(0, st.frame);
    const shown = (i: number): number => clamp01(st.reveal * n - rank.get(i)!);
    const focus = Math.round(st.focus);
    const frame = e.frames[Math.min(T, Math.floor(t + 1e-6))]!;
    cardEls.forEach(({ card, badge }, i) => {
      ctx.wr.style(card, "opacity", fix(shown(i)));
      ctx.wr.cls(card, "is-on", focus === i + 1);
      setText(badge, String(frame[i] ?? 0));
    });
    for (const a of arrows) ctx.wr.style(a.g, "opacity", fix(Math.min(shown(a.a), shown(a.b))));
    for (const a of asideArrows) ctx.wr.style(a.g, "opacity", fix(shown(a.s)));
    for (const tr of trayEls) {
      ctx.wr.style(tr.tray, "opacity", fix(shown(tr.s)));
      setText(tr.badge, String(frame[n] ?? 0));
    }
    const dotsOn = clamp01(st.reveal * n - (n - 1));
    e.records.forEach((r, i) => {
      const p = r.path;
      let k = 0;
      while (k < p.length - 1 && p[k + 1]![0] <= t) k++;
      const a = p[k]!;
      const b = p[k + 1];
      let xy = at(a, i);
      if (b && t > a[0] && (a[1] !== b[1] || !!a[2] !== !!b[2])) {
        const q = smooth(clamp01((t - a[0]) / Math.max(1e-6, b[0] - a[0])));
        const to = at(b, i);
        xy = [lerp(xy[0], to[0], q), lerp(xy[1], to[1], q)];
      }
      const d = dots[i]!;
      ctx.wr.attr(d, "cx", fix(xy[0], 1));
      ctx.wr.attr(d, "cy", fix(xy[1], 1));
      const ok = r.ok !== undefined && t >= r.ok;
      ctx.wr.cls(d, "is-ok", ok);
      ctx.wr.cls(d, "is-bad", !ok && r.bad !== undefined && t >= r.bad);
      ctx.wr.style(d, "opacity", fix(dotsOn));
    });
  };
};
