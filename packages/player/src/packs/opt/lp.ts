import type { Element } from "@lessonstudio/spec";
import { h, svg } from "../../dom.ts";
import { clamp01, fix } from "../../motion.ts";
import type { KitRenderer } from "../../templates/types.ts";
import { at, est, num, put, step } from "./util.ts";

type L = Extract<Element, { type: "lp" }>;
type P = [number, number];
const DASH = ["", "18 10", "4 10", "26 8 4 8", "10 6", "2 6"];

/** The part of a convex polygon where a·x + b·y ≤ c (or ≥), Sutherland–Hodgman. */
function clip(poly: P[], a: number, b: number, c: number, ge: boolean): P[] {
  const side = (p: P): number => (ge ? a * p[0] + b * p[1] - c : c - a * p[0] - b * p[1]);
  const out: P[] = [];
  poly.forEach((p, i) => {
    const q = poly[(i + 1) % poly.length]!;
    const sp = side(p), sq = side(q);
    if (sp >= -1e-9) out.push(p);
    if ((sp >= -1e-9) !== (sq >= -1e-9)) { const t = sp / (sp - sq); out.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]); }
  });
  return out.filter((p, i) => { const q = out[(i + 1) % out.length]!; return out.length < 2 || Math.abs(p[0] - q[0]) > 1e-7 || Math.abs(p[1] - q[1]) > 1e-7; });
}
/** "2x + y ≤ 14", "x + 3y ≥ 6", "y ≤ 6": a limit or a goal written out. */
export function expr(a: number, b: number, v: [string, string]): string {
  const term = (k: number, x: string, first: boolean): string => {
    if (!k) return "";
    const m = Math.abs(k) === 1 ? x : `${num(Math.abs(k))}${x}`;
    return first ? (k < 0 ? `−${m}` : m) : ` ${k < 0 ? "−" : "+"} ${m}`;
  };
  return `${term(a, v[0], true)}${term(b, v[1], !a)}`;
}

/**
 * A linear program in two variables, drawn like a plot (left to right in every language). `reveal` brings the limits
 * in one by one (each line, then the side it rules out shaded), then the plans that fit (the feasible region) and its
 * corners; `frame` slides the goal line (levels blend) and the best corner lights up when the line reaches it; `focus`
 * lights limit n (from 1), then the corners (n + 1 …, counterclockwise from the one nearest the origin). The legend
 * card sits on the reading side.
 */
export const lp: KitRenderer = (el, box, ctx) => {
  const e = el as L;
  const W = e.w ?? 1000;
  const H = e.h ?? 480;
  const rtl = ctx.dir === "rtl";
  const v = e.vars ?? ["x", "y"];
  const fr = e.frames ?? [];
  const cons = e.cons;
  const n = cons.length;
  const [x0, x1] = e.xr;
  const [y0, y1] = e.yr;
  // The plot on one side, the legend card on the other (under it when the box is narrow).
  const side = W >= H * 1.35;
  const legendH = 58 * (n + (e.obj ? 1 : 0)) + (fr.some((f) => f.note) ? 70 : 0) + 20;
  // The legend is as wide as its longest row (a limit, or the goal at its last level), within half the box.
  const limitText = cons.map((k) => { const nm = ctx.t(k.label); return `${nm ? `${nm}: ` : ""}${expr(k.a, k.b, v)} ${k.op === ">=" ? "≥" : "≤"} ${num(k.c)}`; });
  const goalName = e.obj ? ctx.t(e.obj.label) : "";
  const goalText = (L: number | null): string => (e.obj ? `${goalName ? `${goalName}: ` : ""}${expr(e.obj.a, e.obj.b, v)}${L === null ? "" : ` = ${num(Math.round(L))}`}` : "");
  const legW = Math.min(W * 0.5, Math.max(340, ...[...limitText, goalText(Math.max(0, ...fr.map((f) => f.level)))].map((s) => est(s, 32) + 130)));
  const PW = side ? W - legW - 20 : W;
  const PH = side ? H : H - legendH;
  const px = side && rtl ? W - PW : 0;
  const left = 70 + (e.yLabel ? 48 : 0), bottom = 52 + (e.xLabel ? 48 : 0), top = 20, right = 24;
  const pw = PW - left - right, ph = PH - top - bottom;
  const X = (x: number): number => left + ((x - x0) / (x1 - x0)) * pw;
  const Y = (y: number): number => top + (1 - (y - y0) / (y1 - y0)) * ph;
  const pts = (ps: P[]): string => ps.map((p) => `${fix(X(p[0]), 1)},${fix(Y(p[1]), 1)}`).join(" ");

  const root = h("div", { className: "po po-lp" });
  const s = svg("svg", { width: PW, height: PH, viewBox: `0 0 ${PW} ${PH}`, direction: "ltr", className: "po-svg" });
  s.style.left = `${px}px`;
  root.append(s);
  const ov = h("div", { className: "po-ov" });
  ov.style.left = `${px}px`;
  root.append(ov);

  // Axes, ticks and a light grid.
  const ticks = (a: number, b: number): number[] => {
    const span = b - a;
    const st = [1, 2, 5, 10, 20, 50, 100].find((k) => span / k <= 6) ?? span / 5;
    const out: number[] = [];
    for (let t = Math.ceil(a / st) * st; t <= b + 1e-9; t += st) out.push(Math.round(t * 1e6) / 1e6);
    return out;
  };
  const tick = (x: number, y: number, t: string, anchor: string): void => {
    const el2 = svg("text", { x: fix(x, 1), y: fix(y, 1), "text-anchor": anchor, className: "po-tick" });
    el2.textContent = t;
    s.append(el2);
  };
  for (const t of ticks(x0, x1)) { s.append(svg("line", { x1: X(t), y1: top, x2: X(t), y2: top + ph, className: "po-grid" })); tick(X(t), top + ph + 40, num(t), "middle"); }
  for (const t of ticks(y0, y1)) { s.append(svg("line", { x1: left, y1: Y(t), x2: left + pw, y2: Y(t), className: "po-grid" })); tick(left - 12, Y(t) + 11, num(t), "end"); }
  s.append(svg("path", { d: `M${left} ${top}V${top + ph}H${left + pw}`, className: "po-axis" }));
  const axisLabel = (t: string, x: number, y: number, rot: boolean): void => {
    const d = at(h("div", { className: `po-al${rot ? " is-y" : ""}`, dir: ctx.dir }), x, y);
    put(d, t, rtl);
    ov.append(d);
  };
  if (e.xLabel) axisLabel(ctx.t(e.xLabel), left + pw / 2, PH - 46, false);
  if (e.yLabel) axisLabel(ctx.t(e.yLabel), 4, top + ph / 2, true);

  // Inside the plot (clipped by a nested viewport): what each limit rules out, the region that fits, the lines.
  const area = svg("svg", { x: left, y: top, width: pw, height: ph, viewBox: `${left} ${top} ${pw} ${ph}`, overflow: "hidden" });
  s.append(area);
  const boxPoly: P[] = [[Math.max(0, x0), Math.max(0, y0)], [x1, Math.max(0, y0)], [x1, y1], [Math.max(0, x0), y1]];
  const tone = (i: number): string => `var(--ls-${cons[i]!.tone ?? "fg"})`;
  const parts = cons.map((k, i) => {
    const out = clip(boxPoly, k.a, k.b, k.c, k.op !== ">=");
    const shade = svg("polygon", { points: pts(out.length > 2 ? out : [[0, 0]]), className: "po-off" });
    // The line itself: where it crosses the drawing.
    const seg = clip([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], k.a, k.b, k.c, false).filter((p) => Math.abs(k.a * p[0] + k.b * p[1] - k.c) < 1e-6 * (Math.abs(k.c) + 1));
    const [p, q] = seg.length >= 2 ? [seg[0]!, seg[seg.length - 1]!] : [[0, 0] as P, [0, 0] as P];
    const line = svg("line", { x1: fix(X(p[0]), 1), y1: fix(Y(p[1]), 1), x2: fix(X(q[0]), 1), y2: fix(Y(q[1]), 1), className: "po-con" });
    line.style.stroke = tone(i);
    if (DASH[i % DASH.length]) line.setAttribute("stroke-dasharray", DASH[i % DASH.length]!);
    area.append(shade);
    return { shade, line, p, q };
  });
  let region = boxPoly;
  for (const k of cons) region = clip(region, k.a, k.b, k.c, k.op === ">=");
  const feas = svg("polygon", { points: pts(region.length > 2 ? region : [[0, 0]]), className: "po-fit" });
  area.append(feas);
  parts.forEach((p) => area.append(p.line));
  const goal = svg("line", { className: "po-goal" });
  area.append(goal);
  // Whole-number plans that fit.
  const dots = svg("g", { className: "po-int" });
  if (e.ints) {
    for (let x = Math.ceil(Math.max(0, x0)); x <= x1; x++) for (let y = Math.ceil(Math.max(0, y0)); y <= y1; y++) {
      if (cons.every((k) => (k.op === ">=" ? k.a * x + k.b * y >= k.c - 1e-9 : k.a * x + k.b * y <= k.c + 1e-9))) dots.append(svg("circle", { cx: fix(X(x), 1), cy: fix(Y(y), 1), r: 6 }));
    }
    area.append(dots);
  }

  // Badges naming each line (on the side it rules out), the same numbers as the legend: by default near the end of the
  // line farther from the region, out of the way of its corners.
  const rx = region.reduce((a, q) => a + q[0], 0) / (region.length || 1), ry = region.reduce((a, q) => a + q[1], 0) / (region.length || 1);
  const badges = parts.map((p, i) => {
    const k = cons[i]!;
    const t = k.at ?? (Math.hypot(p.p[0] - rx, p.p[1] - ry) > Math.hypot(p.q[0] - rx, p.q[1] - ry) ? 0.1 : 0.9);
    const mx = p.p[0] + (p.q[0] - p.p[0]) * t, my = p.p[1] + (p.q[1] - p.p[1]) * t;
    const len = Math.hypot(k.a, k.b);
    const out = k.op === ">=" ? -1 : 1;
    const bx = X(mx) + ((out * k.a) / len) * 34, by = Y(my) - ((out * k.b) / len) * 34;
    const tx = svg("text", { x: fix(bx, 1), y: fix(by + 11, 1), "text-anchor": "middle" });
    tx.textContent = String(i + 1);
    const g = svg("g", { className: "po-bdg" }, svg("circle", { cx: fix(bx, 1), cy: fix(by, 1), r: 22 }), tx);
    g.style.color = tone(i);
    s.append(g);
    return g;
  });

  // Corners: those of the region that lie on two of the lines (the axes count), counterclockwise from the origin.
  const on = (p: P): number => cons.filter((k) => Math.abs(k.a * p[0] + k.b * p[1] - k.c) < 1e-6 * (Math.abs(k.c) + 1)).length + (Math.abs(p[0]) < 1e-9 ? 1 : 0) + (Math.abs(p[1]) < 1e-9 ? 1 : 0);
  const real = region.filter((p) => on(p) >= 2);
  let s0 = 0;
  real.forEach((p, i) => { if (Math.hypot(p[0], p[1]) < Math.hypot(real[s0]![0], real[s0]![1]) - 1e-9) s0 = i; });
  const corners = [...real.slice(s0), ...real.slice(0, s0)];
  const cx = corners.reduce((a, p) => a + p[0], 0) / (corners.length || 1), cy = corners.reduce((a, p) => a + p[1], 0) / (corners.length || 1);
  const value = (p: P): number => (e.obj ? e.obj.a * p[0] + e.obj.b * p[1] : 0);
  let best = 0;
  corners.forEach((p, i) => { if (e.obj && (e.obj.min ? value(p) < value(corners[best]!) - 1e-9 : value(p) > value(corners[best]!) + 1e-9)) best = i; });
  const cg = corners.map((p) => {
    const x = X(p[0]), y = Y(p[1]);
    // On an axis the label goes inside the plot; elsewhere, away from the region's middle.
    let lx: number, ly: number, anchor: string;
    if (Math.abs(p[1]) < 1e-9 && p[0] > 1e-9) { lx = x + 10; ly = y - 22; anchor = "start"; }
    else if (Math.abs(p[0]) < 1e-9 && p[1] > 1e-9) { lx = x + 18; ly = y - 18; anchor = "start"; }
    else { const dx = X(p[0]) - X(cx), dy = Y(p[1]) - Y(cy); const d = Math.hypot(dx, dy) || 1; lx = x + (dx / d) * 22; ly = y + (dy / d) * 22 + 10; anchor = dx > d * 0.45 ? "start" : dx < -d * 0.45 ? "end" : "middle"; }
    const label = svg("text", { x: fix(lx, 1), y: fix(ly, 1), "text-anchor": anchor, className: "po-cl" });
    label.textContent = Math.hypot(p[0], p[1]) < 1e-9 ? "" : `(${num(p[0])}, ${num(p[1])})`;
    const val = svg("text", { x: fix(lx, 1), y: fix(ly + 38, 1), "text-anchor": anchor, className: "po-cv" });
    val.textContent = e.obj ? num(value(p)) : "";
    const g = svg("g", { className: "po-cn" }, svg("circle", { cx: fix(x, 1), cy: fix(y, 1), r: 10 }), label, val);
    s.append(g);
    return { g, val };
  });

  // The legend card: each limit, the goal and its level, the step's note.
  // The card takes the height it needs, in the middle of its side.
  const card = h("div", { className: "po-lg", dir: ctx.dir });
  const inner = h("div", { className: "po-card po-lgc" });
  card.append(inner);
  at(card, side ? (rtl ? 0 : PW + 20) : 0, side ? 0 : PH + 8, side ? W - PW - 20 : W, side ? H : legendH - 8);
  const row = (sample: SVGElement, text: string): HTMLElement => {
    const t = h("span", null);
    put(t, text, rtl);
    const r = h("div", { className: "po-lgr" }, sample, t);
    inner.append(r);
    return r;
  };
  const sample = (i: number): SVGElement => {
    const g = svg("svg", { width: 56, height: 44, viewBox: "0 0 56 44", className: "po-ls" });
    const l = svg("line", { x1: 2, y1: 22, x2: 54, y2: 22 });
    if (i >= 0) {
      l.style.stroke = tone(i);
      if (DASH[i % DASH.length]) l.setAttribute("stroke-dasharray", DASH[i % DASH.length]!.replace(/\d+/g, (m) => String(Math.round(Number(m) * 0.6))));
      const tx = svg("text", { x: 28, y: 33, "text-anchor": "middle" });
      tx.textContent = String(i + 1);
      g.append(l, svg("circle", { cx: 28, cy: 22, r: 18 }), tx);
      g.style.color = tone(i);
    } else { l.setAttribute("class", "is-goal"); g.append(l); }
    return g;
  };
  const rows = cons.map((_, i) => row(sample(i), limitText[i]!));
  const goalRow = e.obj ? row(sample(-1), "") : null;
  const goalEl = goalRow?.lastChild as HTMLElement | undefined;
  const note = h("div", { className: "po-nt" });
  inner.append(note);
  root.append(card);
  box.append(root);

  const lvl = (k: number): number => fr[k]?.level ?? 0;
  return (st) => {
    const nf = fr.length;
    const f = nf ? Math.max(0, Math.min(nf - 1, st.frame)) : 0;
    const k0 = Math.floor(f), k1 = Math.min(Math.max(0, nf - 1), k0 + 1);
    const L = nf ? lvl(k0) + (lvl(k1) - lvl(k0)) * (f - k0) : 0;
    const k = st.reveal * (n + 2);
    const focus = Math.round(st.focus);
    parts.forEach((p, i) => {
      ctx.wr.style(p.line, "opacity", fix(clamp01((k - i) * 2)));
      ctx.wr.style(p.shade, "opacity", fix(clamp01((k - i - 0.5) * 2)));
      ctx.wr.cls(p.line, "is-on", focus === i + 1);
      ctx.wr.style(badges[i]!, "opacity", fix(clamp01((k - i) * 2)));
      ctx.wr.style(rows[i]!, "opacity", fix(clamp01((k - i) * 2)));
      ctx.wr.cls(rows[i]!, "is-on", focus === i + 1);
    });
    ctx.wr.style(feas, "opacity", fix(clamp01(k - n)));
    ctx.wr.style(dots, "opacity", fix(clamp01(k - n)));
    const cornersOn = clamp01(k - n - 1);
    const goalOn = nf && e.obj ? cornersOn : 0;
    // The goal line a·x + b·y = L across the drawing; the best corner lights up once the line has reached it.
    const reached = nf > 0 && !!e.obj && corners.length > 0 && Math.abs(L - value(corners[best]!)) <= 1e-6 + Math.abs(value(corners[best]!)) * 0.005;
    cg.forEach((c, i) => {
      ctx.wr.style(c.g, "opacity", fix(cornersOn));
      ctx.wr.cls(c.g, "is-best", reached && i === best);
      ctx.wr.cls(c.g, "is-on", focus === n + i + 1);
      ctx.wr.style(c.val, "opacity", e.values ? "1" : "0");
    });
    if (e.obj && goalEl && goalRow) {
      const seg = clip([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], e.obj.a, e.obj.b, L, false).filter((p) => Math.abs(e.obj!.a * p[0] + e.obj!.b * p[1] - L) < 1e-6 * (Math.abs(L) + 1));
      const ok = seg.length >= 2 && goalOn > 0;
      ctx.wr.style(goal, "opacity", ok ? fix(goalOn) : "0");
      if (ok) {
        const p = seg[0]!, q = seg[seg.length - 1]!;
        ctx.wr.attr(goal, "x1", fix(X(p[0]), 1)); ctx.wr.attr(goal, "y1", fix(Y(p[1]), 1));
        ctx.wr.attr(goal, "x2", fix(X(q[0]), 1)); ctx.wr.attr(goal, "y2", fix(Y(q[1]), 1));
      }
      put(goalEl, goalText(nf ? L : null), rtl);
      ctx.wr.style(goalRow, "opacity", fix(nf ? goalOn : cornersOn));
    }
    put(note, ctx.t(fr[nf ? step(nf, f) : 0]?.note), rtl);
  };
};
