import { h, rich, svg } from "../../dom.ts";
import { fix } from "../../motion.ts";
import type { KitRenderer } from "../../templates/types.ts";
import { RTL, clamp, smooth, toneVar, type FlowchartElement } from "./util.ts";

type Pt = [number, number];
interface Box { cx: number; cy: number; w: number; h: number; layer: number; lane: number }

/** About how wide a label is at font size s (Arabic letters are narrower than Latin ones). */
const textW = (t: string, s: number): number => [...t].reduce((a, c) => a + (/[\u{600}-\u{6ff}]/u.test(c) ? 0.5 : c === " " ? 0.28 : 0.56), 0) * s;

/**
 * A flowchart, top to bottom: each node in a layer (the longest path from the start, loops aside) and a lane (a
 * node's first arrow goes straight down, a decision's second one lane to the side). Arrows back up are loops, drawn
 * round the side and into the node they return to. `pass` moves a token along `path` one hop at a time and lights
 * the node it reaches. Shapes and arrows are SVG; labels are HTML on top (Arabic shapes and wraps there). Mirrored in
 * right-to-left languages unless `fixed`.
 */
export const flowchart: KitRenderer = (el, box, ctx) => {
  const e = el as FlowchartElement;
  const W = e.w ?? 900;
  const H = e.h ?? 560;
  const N = e.nodes;
  const idx = new Map(N.map((n, i) => [n.id, i]));
  const E = e.edges.filter((ed) => idx.has(ed.from) && idx.has(ed.to));
  const from = (k: number): number => idx.get(E[k]!.from)!;
  const to = (k: number): number => idx.get(E[k]!.to)!;
  const outs = N.map(() => [] as number[]);
  E.forEach((_, k) => outs[from(k)]!.push(k));
  const flip = ctx.mirror && !e.fixed;
  const rtl = ctx.dir === "rtl";

  // Loops: an arrow to a node still on the depth-first path is one going back.
  const start = Math.max(0, N.findIndex((n) => n.kind === "start"));
  const back = new Set<number>();
  const state = N.map(() => 0);
  const dfs = (u: number): void => {
    state[u] = 1;
    for (const k of outs[u]!) { const v = to(k); if (state[v] === 1) back.add(k); else if (!state[v]) dfs(v); }
    state[u] = 2;
  };
  dfs(start);
  N.forEach((_, i) => { if (!state[i]) dfs(i); });
  const layer = N.map(() => 0);
  for (let r = 0; r < N.length; r++) {
    let moved = false;
    E.forEach((_, k) => { if (!back.has(k) && layer[to(k)]! < layer[from(k)]! + 1) { layer[to(k)] = layer[from(k)]! + 1; moved = true; } });
    if (!moved) break;
  }
  const order = N.map((_, i) => i).sort((a, b) => layer[a]! - layer[b]! || a - b);
  const lane = N.map(() => -1);
  for (const u of order) {
    if (lane[u]! < 0) lane[u] = 0;
    outs[u]!.forEach((k, q) => {
      if (back.has(k)) return;
      const want = lane[u]! + (q === 1 && N[u]!.kind === "decision" ? 1 : 0);
      if (lane[to(k)]! < 0 || want < lane[to(k)]!) lane[to(k)] = want;
    });
  }
  // Two nodes in one place: the later one moves a lane over.
  const taken = new Set<string>();
  for (const u of order) { while (taken.has(`${layer[u]},${lane[u]}`)) lane[u]!++; taken.add(`${layer[u]},${lane[u]}`); }

  // Sizes: each lane as wide as its widest shape wants, shrunk together when they don't fit and spread out when they
  // do (a gutter at the start for loops); rows are as tall as their tallest shape.
  let s = e.size ?? 32;
  const nLanes = Math.max(...lane) + 1;
  const nRows = Math.max(...layer) + 1;
  const gut = back.size ? 34 + 20 * back.size : 6;
  const room = W - gut - 6;
  const labels = N.map((n) => ctx.t(n.label));
  const want = (i: number): number => {
    const tw = textW(labels[i]!, s);
    const dec = N[i]!.kind === "decision";
    return Math.max(dec ? 4.4 * s : 3.4 * s, dec ? tw / 0.58 + s : tw + 1.6 * s);
  };
  let laneW: number[] = [];
  const lanes = (): void => {
    const need = Array.from({ length: nLanes }, (_, l) => Math.max(3 * s, ...N.map((_, i) => (lane[i] === l ? want(i) / 0.94 : 0))));
    const sum = need.reduce((a, b) => a + b, 0);
    laneW = sum > room ? need.map((x) => (x * room) / sum) : need.map((x) => x + (room - sum) / nLanes);
  };
  const sizes = (): { w: number; h: number }[] => (lanes(), N.map((n, i) => {
    const tw = textW(labels[i]!, s);
    const dec = n.kind === "decision";
    const w = Math.min(laneW[lane[i]!]! * 0.94, want(i));
    const inner = dec ? w * 0.58 : w - 1.2 * s;
    const lines = Math.max(1, Math.ceil(tw / inner - 0.05));
    const th = lines * 1.18 * s;
    return { w, h: dec ? Math.max(2.7 * s, th / 0.5) : Math.max(1.7 * s, th + 0.7 * s) };
  }));
  let sz = sizes();
  const rowsH = (): number[] => Array.from({ length: nRows }, (_, l) => Math.max(0, ...sz.filter((_, i) => layer[i] === l).map((b) => b.h)));
  let rh = rowsH();
  // Too tall: smaller text (down to 24 px) until the rows and their gaps fit.
  while (s > 24 && rh.reduce((a, b) => a + b, 0) + (nRows - 1) * 0.55 * s > H - 8) { s -= 1; sz = sizes(); rh = rowsH(); }
  const gap = Math.max(10, (H - 8 - rh.reduce((a, b) => a + b, 0)) / Math.max(1, nRows - 1));
  const tops: number[] = [];
  let acc = 4;
  for (const r of rh) { tops.push(acc); acc += r + gap; }
  const laneX = laneW.map((_, l) => gut + laneW.slice(0, l).reduce((a, b) => a + b, 0) + laneW[l]! / 2);
  const B: Box[] = N.map((_, i) => ({ cx: laneX[lane[i]!]!, cy: tops[layer[i]!]! + rh[layer[i]!]! / 2, w: sz[i]!.w, h: sz[i]!.h, layer: layer[i]!, lane: lane[i]! }));
  const X = (x: number): number => (flip ? W - x : x);

  // Arrows, routed at right angles in the unmirrored layout.
  const top = (b: Box): Pt => [b.cx, b.cy - b.h / 2];
  const bottom = (b: Box): Pt => [b.cx, b.cy + b.h / 2];
  const right = (b: Box): Pt => [b.cx + b.w / 2, b.cy];
  const left = (b: Box): Pt => [b.cx - b.w / 2, b.cy];
  let nBack = 0;
  const routes: Pt[][] = E.map((ed, k) => {
    const a = B[from(k)]!;
    const b = B[to(k)]!;
    const dec = N[from(k)]!.kind === "decision";
    const second = dec && outs[from(k)]!.indexOf(k) === 1;
    if (back.has(k)) {
      const span = B.filter((x) => x.layer >= b.layer && x.layer <= a.layer);
      const gx = Math.min(...span.map((x) => x.cx - x.w / 2)) - 22 - 20 * nBack++;
      if (second) return [left(a), [gx, a.cy], [gx, b.cy], left(b)];
      const yb = bottom(a)[1] + gap / 2;
      return [bottom(a), [a.cx, yb], [gx, yb], [gx, b.cy], left(b)];
    }
    if (second && b.lane > a.lane) return [right(a), [b.cx, a.cy], top(b)];
    const between = B.some((x) => x !== a && x !== b && x.lane === a.lane && x.layer > a.layer && x.layer < b.layer);
    if (b.lane === a.lane && !between) return [bottom(a), top(b)];
    const ym = top(b)[1] - gap / 2;
    if (between) {
      const xr = Math.max(...B.filter((x) => x.layer > a.layer && x.layer < b.layer).map((x) => x.cx + x.w / 2)) + 24;
      const y1 = bottom(a)[1] + gap / 2;
      return [bottom(a), [a.cx, y1], [xr, y1], [xr, ym], [b.cx, ym], top(b)];
    }
    return [bottom(a), [a.cx, ym], [b.cx, ym], top(b)];
  });

  const root = h("div", { className: "pc-flow" });
  root.style.width = `${W}px`;
  root.style.height = `${H}px`;
  const art = svg("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}`, className: "ls-el-svg pc-abs", direction: "ltr" });
  root.append(art);
  const lines = svg("g");
  const shapes = svg("g");
  art.append(lines, shapes);
  const P = (p: Pt): string => `${fix(X(p[0]), 1)},${fix(p[1], 1)}`;
  const arrows = routes.map((pts, k) => {
    const g = svg("g", { className: "pc-fe" });
    g.append(svg("path", { d: `M${pts.map(P).join("L")}`, fill: "none" }));
    const [x2, y2] = pts[pts.length - 1]!;
    const [x1, y1] = pts[pts.length - 2]!;
    const ang = Math.atan2(y2 - y1, X(x2) - X(x1));
    const tip: Pt = [X(x2), y2];
    const hs = 15;
    g.append(svg("polygon", { points: ([tip, [tip[0] - hs * Math.cos(ang - 0.45), tip[1] - hs * Math.sin(ang - 0.45)], [tip[0] - hs * Math.cos(ang + 0.45), tip[1] - hs * Math.sin(ang + 0.45)]] as Pt[]).map((q) => `${fix(q[0], 1)},${fix(q[1], 1)}`).join(" ") }));
    const lab = E[k]!.label;
    if (lab) {
      // A decision's way down is named beside its lower point; a way to the side over its start; others mid-way.
      const a = B[from(k)]!;
      const dec = N[from(k)]!.kind === "decision";
      const first = pts[0]!;
      let at: Pt = [first[0] + 12, first[1] - 10];
      if (dec && first[1] > a.cy + 1) at = [a.cx + a.w * 0.3, a.cy + a.h / 2 - 2];
      else if (!dec) { const m = pts[Math.floor(pts.length / 2)]!; at = [m[0] + 12, m[1] - 8]; }
      else if (first[0] < a.cx) at = [first[0] - 12, first[1] - 10];
      const end = (first[0] < a.cx - 1) !== flip;
      const t = svg("text", { x: fix(X(at[0]), 1), y: fix(at[1], 1), "font-size": s, className: "pc-fl", "text-anchor": end ? "end" : "start" });
      t.textContent = ctx.t(lab);
      g.append(t);
    }
    lines.append(g);
    return g;
  });
  const marks = N.map((n, i) => {
    const b = B[i]!;
    const x = X(b.cx);
    const l = x - b.w / 2;
    const r = x + b.w / 2;
    const t = b.cy - b.h / 2;
    const bt = b.cy + b.h / 2;
    const sk = Math.min(b.h * 0.45, 24);
    const shape = n.kind === "decision" ? svg("polygon", { points: `${fix(x, 1)},${fix(t, 1)} ${fix(r, 1)},${fix(b.cy, 1)} ${fix(x, 1)},${fix(bt, 1)} ${fix(l, 1)},${fix(b.cy, 1)}` })
      : n.kind === "io" ? svg("polygon", { points: `${fix(l + sk, 1)},${fix(t, 1)} ${fix(r, 1)},${fix(t, 1)} ${fix(r - sk, 1)},${fix(bt, 1)} ${fix(l, 1)},${fix(bt, 1)}` })
      : svg("rect", { x: fix(l, 1), y: fix(t, 1), width: fix(b.w, 1), height: fix(b.h, 1), rx: n.kind === "process" ? 10 : fix(b.h / 2, 1) });
    shape.setAttribute("class", `pc-fs pc-f-${n.kind}`);
    if (n.tone) shape.style.fill = toneVar(n.tone, "card");
    shapes.append(shape);
    const dec = n.kind === "decision";
    const lw = dec ? b.w * 0.6 : b.w - 0.8 * s;
    // A label with no right-to-left letters is code ("m >= 50?"): it keeps its own order in every language.
    const code = !RTL.test(labels[i]!);
    const lab = h("div", { className: `pc-fn pc-abs pc-fk-${n.kind}`, dir: code ? "ltr" : ctx.dir }, ...(code ? [labels[i]!] : rich(labels[i]!, rtl)));
    lab.style.cssText += `;left:${fix(x - lw / 2, 1)}px;top:${fix(t, 1)}px;width:${fix(lw, 1)}px;height:${fix(b.h, 1)}px;font-size:${s}px`;
    root.append(lab);
    return { shape, lab };
  });
  const token = svg("circle", { r: 13, className: "pc-tok" });
  shapes.append(token);
  box.append(root);

  // The run: one hop per arrow of `path` (the first arrow between each pair).
  const path = (e.path ?? []).map((id) => idx.get(id)).filter((i): i is number => i !== undefined);
  const hops = path.slice(1).map((v, q) => E.findIndex((ed, k) => from(k) === path[q] && to(k) === v));
  const lens = routes.map((pts) => pts.slice(1).reduce((a, p, q) => a + Math.hypot(p[0] - pts[q]![0], p[1] - pts[q]![1]), 0));

  return (st) => {
    const n = N.length;
    const shown = (i: number): number => clamp(st.reveal * n - i);
    const p = st.pass > 1 ? 2 - st.pass : st.pass;
    const on = st.pass >= 0 && st.pass <= 2 && path.length > 1;
    const hop = on ? clamp(p) * (path.length - 1) : -1;
    const hi = Math.min(path.length - 2, Math.floor(hop));
    const k = on ? hop - hi : 0;
    const lit = on ? path[k < 0.5 ? hi : hi + 1] : undefined;
    const edge = on && k > 0 && k < 1 ? hops[hi] : undefined;
    const focus = Math.round(st.focus);
    marks.forEach((m, i) => {
      ctx.wr.style(m.shape, "opacity", fix(shown(i)));
      ctx.wr.style(m.lab, "opacity", fix(shown(i)));
      ctx.wr.cls(m.shape, "is-on", lit === i || focus === i + 1);
    });
    arrows.forEach((g, q) => {
      ctx.wr.style(g, "opacity", fix(Math.min(shown(from(q)), shown(to(q)))));
      ctx.wr.cls(g, "is-on", edge === q);
    });
    // The token travels the arrow it is on, and fades in and out at either end.
    const moving = edge !== undefined && edge >= 0;
    ctx.wr.style(token, "opacity", moving ? fix(smooth(Math.min(k, 1 - k) * 8)) : "0");
    if (moving) {
      const pts = routes[edge]!;
      let d = k * lens[edge]!;
      let q = 0;
      while (q < pts.length - 2 && d > Math.hypot(pts[q + 1]![0] - pts[q]![0], pts[q + 1]![1] - pts[q]![1])) { d -= Math.hypot(pts[q + 1]![0] - pts[q]![0], pts[q + 1]![1] - pts[q]![1]); q++; }
      const a = pts[q]!;
      const b = pts[q + 1]!;
      const seg = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const f = Math.min(1, d / seg);
      ctx.wr.attr(token, "cx", fix(X(a[0] + (b[0] - a[0]) * f), 1));
      ctx.wr.attr(token, "cy", fix(a[1] + (b[1] - a[1]) * f, 1));
    }
  };
};
