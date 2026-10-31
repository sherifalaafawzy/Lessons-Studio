import type { Element } from "@lessonstudio/spec";
import { h, svg } from "../../dom.ts";
import { clamp01, fix } from "../../motion.ts";
import type { KitRenderer } from "../../templates/types.ts";
import { at, est, layer, num, panel, put, step, stripH } from "./util.ts";

type G = Extract<Element, { type: "graph" }>;
const FS = 34;

/**
 * A weighted graph on a map: villages and roads, stepped through an algorithm (Dijkstra, a route improving, a spanning
 * tree, colouring). Geography never flips: the map is the same in every language; only the notes card moves to the
 * reading side. `reveal` brings the places in, then the roads; `frame` is the algorithm's step (rounded); `focus`
 * rings the n-th place; `pass` drives a bus along the frame's path.
 */
export const graph: KitRenderer = (el, box, ctx) => {
  const e = el as G;
  const W = e.w ?? 900;
  const H = e.h ?? 480;
  const rtl = ctx.dir === "rtl";
  const N = e.nodes;
  const E = e.edges ?? [];
  const fr = e.frames ?? [];
  const vals = fr.some((f) => f.vals);
  const hasTotal = fr.some((f) => f.total !== undefined);
  const hasPanel = hasTotal || fr.some((f) => f.note);
  const r = vals ? 30 : 17;

  // The map's extent, and room for the names beside the dots.
  const xs = N.map((n) => n.x);
  const ys = N.map((n) => n.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const name = (i: number): string => ctx.t(N[i]!.label);
  const side = (k: string): number => Math.max(0, ...N.map((n, i) => ((n.at ?? "b") === k && n.label ? est(name(i), FS) + 14 : 0)));
  const padL = r + 10 + side("l"), padR = r + 10 + side("r");
  const padT = r + 10 + (N.some((n) => n.at === "t" && n.label) ? FS * 1.2 : 0);
  const padB = r + 10 + (N.some((n) => (n.at ?? "b") === "b" && n.label) ? FS * 1.2 : 0);
  const sx = Math.max(1e-6, x1 - x0), sy = Math.max(1e-6, y1 - y0);
  // A card beside the map when the box is wide enough, else a strip under it.
  let mw = W, mh = H, mx = 0;
  let card: "side" | "strip" | null = null;
  if (hasPanel) {
    if (W >= H * 1.6) { card = "side"; mw = W - Math.min(380, Math.max(300, W * 0.27)) - 24; if (rtl) mx = W - mw; }
    else { card = "strip"; mh = H - stripH(W) - 12; }
  }
  const fill = e.fit === "fill";
  const kx = (mw - padL - padR) / sx, ky = (mh - padT - padB) / sy;
  const kX = fill ? kx : Math.min(kx, ky), kY = fill ? ky : kX;
  const ox = mx + padL + (mw - padL - padR - sx * kX) / 2;
  const oy = padT + (mh - padT - padB - sy * kY) / 2;
  const X = (i: number): number => ox + (N[i]!.x - x0) * kX;
  const Y = (i: number): number => oy + (y1 - N[i]!.y) * kY;

  const root = h("div", { className: "po po-g" });
  const s = layer(W, H);
  const gE = svg("g");
  const gR = svg("g");
  const gW = svg("g");
  const gN = svg("g");
  const labels = h("div", { className: "po-ov" });
  root.append(s, labels);
  // Roads, then the route over them, then the roads' lengths (readable over the route), then the places.
  s.append(gE, gR, gW, gN);

  // Roads, each with its length on a card at its middle.
  const roads = E.map((g) => {
    const ax = X(g.a), ay = Y(g.a), bx = X(g.b), by = Y(g.b);
    const c = g.curve ?? 0;
    const cx = (ax + bx) / 2 - (by - ay) * c, cy = (ay + by) / 2 + (bx - ax) * c;
    const line = svg("path", { d: `M${fix(ax, 1)} ${fix(ay, 1)}Q${fix(cx, 1)} ${fix(cy, 1)} ${fix(bx, 1)} ${fix(by, 1)}`, className: "po-e" });
    let pill: SVGElement | null = null;
    if (g.w !== undefined && e.weights !== false) {
      const t = num(g.w);
      const u = g.pos ?? 0.5, v = 1 - u;
      const mx2 = v * v * ax + 2 * u * v * cx + u * u * bx, my2 = v * v * ay + 2 * u * v * cy + u * u * by;
      const w = est(t, 32) + 16;
      const txt = svg("text", { x: fix(mx2, 1), y: fix(my2 + 11, 1), "text-anchor": "middle" });
      txt.textContent = t;
      pill = svg("g", { className: "po-w" }, svg("rect", { x: fix(mx2 - w / 2, 1), y: fix(my2 - 20, 1), width: fix(w, 1), height: 40, rx: 10 }), txt);
      gW.append(pill);
    }
    gE.append(line);
    return { pill, line };
  });

  // Places: a dot (a square for the school), a value inside, a name beside.
  const places = N.map((n, i) => {
    const x = X(i), y = Y(i);
    const dot = n.shape === "square"
      ? svg("rect", { x: fix(x - r, 1), y: fix(y - r, 1), width: 2 * r, height: 2 * r, rx: 8 })
      : svg("circle", { cx: fix(x, 1), cy: fix(y, 1), r });
    const v = svg("text", { x: fix(x, 1), y: fix(y + 11, 1), "text-anchor": "middle" });
    const g = svg("g", { className: "po-n" }, dot, v);
    gN.append(g);
    let lb: HTMLElement | null = null;
    if (n.label) {
      const where = n.at ?? "b";
      lb = h("div", { className: `po-l po-l${where}`, dir: ctx.dir });
      put(lb, name(i), rtl);
      at(lb, where === "l" ? x - r - 10 : where === "r" ? x + r + 10 : x, where === "t" ? y - r - 6 : where === "b" ? y + r + 4 : y);
      labels.append(lb);
    }
    return { g, v, lb };
  });

  const route = svg("path", { className: "po-r" });
  const cut = svg("path", { className: "po-cut" });
  const add = svg("path", { className: "po-add" });
  const bus = svg("circle", { r: 15, className: "po-bus" });
  gR.append(route, cut, add);
  gN.append(bus);

  let pn: ReturnType<typeof panel> | null = null;
  if (card) {
    pn = panel(ctx, card === "side", hasTotal);
    root.append(card === "side" ? at(pn.el, rtl ? 0 : mw + 24, 0, W - mw - 24, H) : at(pn.el, 0, H - stripH(W), W, stripH(W)));
  }
  const pairs = (ps: [number, number][] | undefined): string => (ps ?? []).map(([a, b]) => `M${fix(X(a), 1)} ${fix(Y(a), 1)}L${fix(X(b), 1)} ${fix(Y(b), 1)}`).join("") || "M0 0";
  let shown = -2;
  let pts: [number, number][] = [];
  let len = 0;
  box.append(root);

  return (st) => {
    const fi = fr.length ? step(fr.length, st.frame) : -1;
    if (fi !== shown) {
      shown = fi;
      const f = fr[fi] ?? {};
      roads.forEach((d, j) => ctx.wr.attr(d.line, "class", `po-e s-${f.edges?.[j] ?? "."}`));
      places.forEach((p, i) => {
        const c = f.colours?.[i] ?? 0;
        ctx.wr.attr(p.g, "class", `po-n s-${f.nodes?.[i] ?? "."}${c ? ` po-k${c}` : ""}`);
        const v = f.vals?.[i];
        const t = v === null || v === undefined ? "" : typeof v === "number" ? num(v) : v;
        if (p.v.textContent !== t) p.v.textContent = t;
      });
      // The path: a polyline through its places (closed for a round trip), and its length for the bus.
      const path = f.path ?? [];
      pts = [...path, ...(f.loop && path.length > 1 ? [path[0]!] : [])].map((i) => [X(i), Y(i)]);
      len = 0;
      for (let q = 1; q < pts.length; q++) len += Math.hypot(pts[q]![0] - pts[q - 1]![0], pts[q]![1] - pts[q - 1]![1]);
      route.setAttribute("d", pts.length > 1 ? pts.map((p, q) => `${q ? "L" : "M"}${fix(p[0], 1)} ${fix(p[1], 1)}`).join("") : "M0 0");
      cut.setAttribute("d", pairs(f.cut));
      add.setAttribute("d", pairs(f.added));
      if (pn) {
        const total = f.total === undefined ? "" : `${num(f.total)}${e.unit ? ` ${ctx.t(e.unit)}` : ""}`;
        pn.set(ctx.t(f.note), ctx.t(e.totalLabel), total);
      }
    }
    // Places come in, then the roads, then whatever is drawn over them.
    const parts = N.length + E.length;
    const rv = st.reveal * (parts + 1);
    const focus = Math.round(st.focus);
    places.forEach((p, i) => {
      const o = fix(clamp01(rv - i));
      ctx.wr.style(p.g, "opacity", o);
      if (p.lb) ctx.wr.style(p.lb, "opacity", o);
      ctx.wr.cls(p.g, "is-on", focus === i + 1);
    });
    roads.forEach((d, j) => {
      const o = fix(clamp01(rv - N.length - j));
      ctx.wr.style(d.line, "opacity", o);
      if (d.pill) ctx.wr.style(d.pill, "opacity", o);
    });
    ctx.wr.style(gR, "opacity", fix(clamp01(rv - parts)));
    // The bus: along the path as pass goes 0 → 1 (and back over 1 → 2).
    const p = st.pass < 0 || pts.length < 2 ? -1 : st.pass > 1 ? 2 - Math.min(2, st.pass) : st.pass;
    ctx.wr.style(bus, "opacity", p < 0 ? "0" : "1");
    if (p >= 0) {
      let left = p * len;
      let q = 1;
      while (q < pts.length - 1 && left > Math.hypot(pts[q]![0] - pts[q - 1]![0], pts[q]![1] - pts[q - 1]![1])) { left -= Math.hypot(pts[q]![0] - pts[q - 1]![0], pts[q]![1] - pts[q - 1]![1]); q++; }
      const [ax, ay] = pts[q - 1]!, [bx, by] = pts[q]!;
      const seg = Math.hypot(bx - ax, by - ay) || 1;
      const t = Math.min(1, left / seg);
      ctx.wr.attr(bus, "cx", fix(ax + (bx - ax) * t, 1));
      ctx.wr.attr(bus, "cy", fix(ay + (by - ay) * t, 1));
    }
  };
};
