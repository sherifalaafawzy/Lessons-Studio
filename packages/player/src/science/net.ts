import type { NetElement } from "@lessonstudio/spec";
import { svg } from "../dom.ts";
import { clamp01, fix } from "../motion.ts";
import type { KitRenderer } from "../templates/types.ts";
import { between, blend, num } from "./util.ts";

/**
 * A network neuron by neuron. Lines: thicker for stronger weights, solid accent for positive, dashed for negative.
 * Neurons fill with their activation. `pass` 0 → 1 lights the lines layer by layer as data flows forward and fills the
 * neurons it reaches; 1 → 2 sends the error back (danger colour). Mirrored in right-to-left languages unless `fixed`.
 *
 * `form: "deep"` draws a wide layer as a few neurons, an ellipsis and the real count, so a stack such as
 * 784, 128, 64, 10 stays a picture instead of thousands of lines.
 */
export const net: KitRenderer = (el, box, ctx) => {
  const e = el as NetElement;
  const W = e.w ?? 640;
  const H = e.h ?? 400;
  const L = e.layers;
  const deep = e.form === "deep";
  type Slot = { i: number } | { gap: true };
  const slots: Slot[][] = L.map((n) => (deep && n > 4
    ? [{ i: 0 }, { i: 1 }, { gap: true }, { i: n - 1 }]
    : Array.from({ length: n }, (_, i) => ({ i }))));
  const most = Math.max(...slots.map((s) => s.length));
  const hasIn = !deep && !!e.labels?.in;
  const hasOut = !deep && !!e.labels?.out;
  const hasLayers = deep || !!e.labels?.layers;
  const fs = 30;
  const padX = 24 + (hasIn ? 130 : 0);
  const padR = 24 + (hasOut ? 130 : 0);
  const padB = hasLayers ? fs + 28 : 12;
  const r = Math.max(10, Math.min(34, (H - padB - 20) / (most * 2.7), (W - padX - padR) / (L.length * 4)));
  const flip = ctx.mirror && !e.fixed;
  const xOf = (l: number): number => {
    const x = padX + r + ((W - padX - padR - 2 * r) * l) / Math.max(1, L.length - 1);
    return flip ? W - x : x;
  };
  const yOf = (l: number, s: number): number => {
    const n = slots[l]!.length;
    const gap = Math.min(r * 3, (H - padB - 2 * r) / Math.max(1, n - 1));
    return (H - padB) / 2 + (s - (n - 1) / 2) * gap;
  };

  const root = svg("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}`, className: "ls-el-svg ln", direction: "ltr" });
  const lines = svg("g");
  const cells = svg("g");
  root.append(lines, cells);

  interface Drawn { l: number; i: number; j: number }
  const drawn: Drawn[] = [];
  for (let l = 0; l < L.length - 1; l++) {
    const from = slots[l]!.flatMap((s) => ("i" in s ? [s.i] : []));
    const to = slots[l + 1]!.flatMap((s) => ("i" in s ? [s.i] : []));
    for (const i of from) for (const j of to) drawn.push({ l, i, j });
  }
  const slotAt = (l: number, i: number): number => slots[l]!.findIndex((s) => "i" in s && s.i === i);

  // Weights: a fixed spread when none are given. A deep layer never stores every weight.
  const frames = deep || !e.weights
    ? [drawn.map(({ l, i, j }) => Math.sin(1.7 * (l + 1) + 2.3 * i + 0.9 * j) * 0.9)]
    : e.weights.map((f) => f.flat(2));
  const flatW = frames;
  const acts = !deep && e.acts ? e.acts.map((f) => f.flat()) : undefined;

  interface Edge { line: SVGElement; l: number }
  const edges: Edge[] = [];
  for (const d of drawn) {
    const line = svg("line", {
      x1: fix(xOf(d.l), 1), y1: fix(yOf(d.l, slotAt(d.l, d.i)), 1),
      x2: fix(xOf(d.l + 1), 1), y2: fix(yOf(d.l + 1, slotAt(d.l + 1, d.j)), 1), className: "ln-w",
    });
    lines.append(line);
    edges.push({ line, l: d.l });
  }
  interface Cell { c: SVGElement; fill: SVGElement; v?: SVGElement; l: number }
  const neurons: Cell[] = [];
  const gaps: { t: SVGElement; l: number }[] = [];
  L.forEach((n, l) => {
    slots[l]!.forEach((slot, s) => {
      const x = xOf(l);
      const y = yOf(l, s);
      if ("gap" in slot) {
        const t = svg("text", { x: fix(x, 1), y: fix(y + fs * 0.35, 1), "text-anchor": "middle", "font-size": fs, className: "ln-l" });
        t.textContent = "⋯";
        cells.append(t);
        gaps.push({ t, l });
        return;
      }
      const fill = svg("circle", { cx: fix(x, 1), cy: fix(y, 1), r: fix(r - 3, 1), className: "ln-a" });
      const c = svg("circle", { cx: fix(x, 1), cy: fix(y, 1), r: fix(r, 1), className: "ln-n" });
      let v: SVGElement | undefined;
      if (e.values && !deep) {
        v = svg("text", { x: fix(x, 1), y: fix(y + r * 0.3, 1), "text-anchor": "middle", "font-size": fix(r * 0.8, 1), className: "ln-v" });
        v.setAttribute("dir", "ltr");
      }
      cells.append(c, fill);
      if (v) cells.append(v);
      neurons.push({ c, fill, v, l });
      const lab = !deep && (l === 0 ? e.labels?.in?.[slot.i] : l === L.length - 1 ? e.labels?.out?.[slot.i] : undefined);
      if (lab) {
        const before = l === 0 !== flip;
        const t = svg("text", { x: fix(x + (before ? -1 : 1) * (r + 12), 1), y: fix(y + fs * 0.35, 1), "text-anchor": before ? "end" : "start", "font-size": fs, className: "ln-l" });
        t.textContent = ctx.t(lab);
        cells.append(t);
      }
    });
    const name = e.labels?.layers?.[l];
    if (name || deep) {
      const t = svg("text", { x: fix(xOf(l), 1), y: H - 8, "text-anchor": "middle", "font-size": fs, className: "ln-l ln-ll" });
      const count = deep ? String(n) : "";
      t.textContent = name && count ? `${ctx.t(name)} ${count}` : name ? ctx.t(name) : count;
      cells.append(t);
    }
  });
  box.append(root);

  let maxW = 1e-9;
  for (const f of flatW) for (const w of f) maxW = Math.max(maxW, Math.abs(w));

  return (s) => {
    const shownLayers = s.reveal * L.length;
    const [i, j, k] = between(flatW.length, s.frame);
    const w = blend(flatW[i]!, flatW[j]!, k);
    let a: number[] | undefined;
    if (acts) { const [p, q, m] = between(acts.length, s.frame); a = blend(acts[p]!, acts[q]!, m); }
    const back = s.pass > 1;
    const wave = s.pass < 0 ? -1 : back ? (2 - Math.min(2, s.pass)) * (L.length - 1) : s.pass * (L.length - 1);
    const focus = Math.round(s.focus);
    edges.forEach((ed, n) => {
      const v = w[n] ?? 0;
      ctx.wr.attr(ed.line, "stroke-width", fix(1.5 + (5.5 * Math.abs(v)) / maxW, 2));
      ctx.wr.cls(ed.line, "is-neg", v < 0);
      const lit = wave >= 0 && wave > ed.l && wave <= ed.l + 1.0001;
      ctx.wr.cls(ed.line, "is-fwd", lit && !back);
      ctx.wr.cls(ed.line, "is-back", lit && back);
      ctx.wr.style(ed.line, "opacity", fix(clamp01(shownLayers - ed.l - 1)));
    });
    for (const g of gaps) ctx.wr.style(g.t, "opacity", fix(clamp01(shownLayers - g.l)));
    neurons.forEach((c, n) => {
      const vis = fix(clamp01(shownLayers - c.l));
      const reached = s.pass < 0 || back || wave >= c.l - 0.001;
      const av = a ? (a[n] ?? 0) : 0;
      ctx.wr.style(c.c, "opacity", vis);
      ctx.wr.style(c.fill, "opacity", fix(Math.min(Number(vis), reached ? Math.abs(av) : 0)));
      ctx.wr.cls(c.c, "is-on", focus === c.l + 1);
      if (c.v) {
        const want = a && reached ? num(Math.round(av * 100) / 100) : "";
        if (c.v.textContent !== want) c.v.textContent = want;
        ctx.wr.style(c.v, "opacity", vis);
      }
    });
  };
};
