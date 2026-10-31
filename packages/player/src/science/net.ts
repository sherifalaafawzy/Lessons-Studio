import type { NetElement } from "@lessonstudio/spec";
import { svg } from "../dom.ts";
import { clamp01, fix } from "../motion.ts";
import type { KitRenderer } from "../templates/types.ts";
import { between, blend, num } from "./util.ts";

/**
 * A network neuron by neuron. Lines: thicker for stronger weights, solid accent for positive, dashed for negative.
 * Neurons fill with their activation. `pass` 0 → 1 lights the lines layer by layer as data flows forward and fills the
 * neurons it reaches; 1 → 2 sends the error back (danger colour). Mirrored in right-to-left languages unless `fixed`.
 */
export const net: KitRenderer = (el, box, ctx) => {
  const e = el as NetElement;
  const W = e.w ?? 640;
  const H = e.h ?? 400;
  const L = e.layers;
  const most = Math.max(...L);
  const hasIn = !!e.labels?.in;
  const hasOut = !!e.labels?.out;
  const hasLayers = !!e.labels?.layers;
  const fs = 30;
  const padX = 24 + (hasIn ? 130 : 0);
  const padR = 24 + (hasOut ? 130 : 0);
  const padB = hasLayers ? fs + 22 : 12;
  const r = Math.max(10, Math.min(34, (H - padB - 20) / (most * 2.7), (W - padX - padR) / (L.length * 4)));
  const flip = ctx.mirror && !e.fixed;
  const xOf = (l: number): number => {
    const x = padX + r + ((W - padX - padR - 2 * r) * l) / Math.max(1, L.length - 1);
    return flip ? W - x : x;
  };
  const yOf = (l: number, i: number): number => {
    const n = L[l]!;
    const gap = Math.min(r * 3, (H - padB - 2 * r) / Math.max(1, n - 1));
    return (H - padB) / 2 + (i - (n - 1) / 2) * gap;
  };

  const root = svg("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}`, className: "ls-el-svg ln", direction: "ltr" });
  const lines = svg("g");
  const cells = svg("g");
  root.append(lines, cells);

  // Weights: a fixed spread when none are given, so the drawing still shows lines of different strength.
  const frames = e.weights ?? [L.slice(1).map((n, l) => Array.from({ length: L[l]! }, (_, i) => Array.from({ length: n }, (_, j) => Math.sin(1.7 * (l + 1) + 2.3 * i + 0.9 * j) * 0.9)))];
  const flatW = frames.map((f) => f.flat(2));
  const acts = e.acts?.map((f) => f.flat());

  interface Edge { line: SVGElement; l: number }
  const edges: Edge[] = [];
  for (let l = 0; l < L.length - 1; l++) {
    for (let i = 0; i < L[l]!; i++) for (let j = 0; j < L[l + 1]!; j++) {
      const line = svg("line", { x1: fix(xOf(l), 1), y1: fix(yOf(l, i), 1), x2: fix(xOf(l + 1), 1), y2: fix(yOf(l + 1, j), 1), className: "ln-w" });
      lines.append(line);
      edges.push({ line, l });
    }
  }
  interface Cell { c: SVGElement; fill: SVGElement; v?: SVGElement; l: number }
  const neurons: Cell[] = [];
  L.forEach((n, l) => {
    for (let i = 0; i < n; i++) {
      const x = xOf(l);
      const y = yOf(l, i);
      const fill = svg("circle", { cx: fix(x, 1), cy: fix(y, 1), r: fix(r - 3, 1), className: "ln-a" });
      const c = svg("circle", { cx: fix(x, 1), cy: fix(y, 1), r: fix(r, 1), className: "ln-n" });
      let v: SVGElement | undefined;
      if (e.values) {
        v = svg("text", { x: fix(x, 1), y: fix(y + r * 0.3, 1), "text-anchor": "middle", "font-size": fix(r * 0.8, 1), className: "ln-v" });
        v.setAttribute("dir", "ltr");
      }
      cells.append(c, fill);
      if (v) cells.append(v);
      neurons.push({ c, fill, v, l });
      const lab = l === 0 ? e.labels?.in?.[i] : l === L.length - 1 ? e.labels?.out?.[i] : undefined;
      if (lab) {
        const before = l === 0 !== flip;
        const t = svg("text", { x: fix(x + (before ? -1 : 1) * (r + 12), 1), y: fix(y + fs * 0.35, 1), "text-anchor": before ? "end" : "start", "font-size": fs, className: "ln-l" });
        t.textContent = ctx.t(lab);
        cells.append(t);
      }
    }
    const name = e.labels?.layers?.[l];
    if (name) {
      const t = svg("text", { x: fix(xOf(l), 1), y: H - 8, "text-anchor": "middle", "font-size": fs, className: "ln-l ln-ll" });
      t.textContent = ctx.t(name);
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
    // The wave: forward from layer 0 to the last over pass 0 → 1, then back over 1 → 2.
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
    neurons.forEach((c, n) => {
      const vis = fix(clamp01(shownLayers - c.l));
      // Activations show once the forward wave has reached the layer (always, without a pass track).
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
