import type { Element } from "@lessonstudio/spec";
import type { KitRenderer } from "../../templates/types.ts";
import { clamp01, F, fix, pathOf, say, svg, text, tw } from "./common.ts";

type SignalElement = Extract<Element, { type: "signal" }>;

/** A number for a tick or a readout: at most `d` decimals, a real minus sign. */
const num = (v: number, d = 2): string => String(Math.round(v * 10 ** d) / 10 ** d).replace("-", "−");
/** About n round ticks between lo and hi. */
function ticks(lo: number, hi: number, n: number): number[] {
  const raw = (hi - lo) / n;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => (hi - lo) / s <= n + 0.5) ?? 10 * mag;
  const out: number[] = [];
  for (let t = Math.ceil(lo / step - 1e-9) * step; t <= hi + 1e-9; t += step) out.push(Math.round(t / step) * step);
  return out;
}

/**
 * A sensor reading over time, always left to right. Layers, in `focus` order: 1 the analog reading, 2 the samples,
 * 3 the ADC's steps (with its numbers on the right), 4 the threshold and the digital output under the plot, 5 the
 * moving average. A cursor draws time: everything left of it shows (one clipping viewport, nothing rebuilt).
 */
export const signal: KitRenderer = (el, box, ctx) => {
  const e = el as SignalElement;
  box.setAttribute("dir", "ltr");
  const W = e.w ?? 900;
  const H = e.h ?? 450;
  const rtl = ctx.dir === "rtl";
  const wr = ctx.wr;
  const [x0, x1] = e.xr;
  const [y0, y1] = e.yr;
  const unit = e.unit ? ` ${e.unit}` : "";
  const dp = y1 - y0 <= 10 ? 2 : 1;
  const adc = e.adc;
  const lo = adc?.lo ?? y0, hi = adc?.hi ?? y1;
  const levels = adc ? 2 ** adc.bits - 1 : 0;
  const code = (v: number): number => Math.round(clamp01((v - lo) / (hi - lo)) * levels);
  const qv = (v: number): number => lo + (code(v) * (hi - lo)) / levels;
  const yl = e.yLabel ? ctx.t(e.yLabel) : "";
  const xl = e.xLabel ? ctx.t(e.xLabel) : "";
  const ol = e.out ? (e.outLabel ? ctx.t(e.outLabel) : "") : "";
  const yt = ticks(y0, y1, 4);
  const xt = ticks(x0, x1, Math.max(3, Math.min(6, Math.floor((W - 300) / 160))));
  const left = Math.max(...yt.map((t) => tw(num(t))), ol ? tw(ol) : 0) + 26;
  const codeT = adc ? (levels <= 8 ? Array.from({ length: levels + 1 }, (_, i) => i) : [0, Math.round(levels / 2), levels]) : [];
  const right = adc ? tw(String(levels)) + 28 : 24;
  const top = e.readout || yl ? 60 : 14;
  const strip = e.out ? Math.min(100, H * 0.2) : 0;
  const bottom = 50 + (xl ? 46 : 0);
  const ph = H - top - bottom - strip - (strip ? 22 : 0);
  const pw = W - left - right;
  const span = e.window && e.window < x1 - x0 ? e.window : x1 - x0;
  const X = (t: number): number => left + ((t - x0) * pw) / span;
  const Y = (v: number): number => top + (1 - (v - y0) / (y1 - y0)) * ph;
  const sTop = top + ph + 22, sBot = sTop + strip;
  const P = (pts: readonly (readonly number[])[]): string => pathOf(pts.map(([t, v]) => [X(t!), Y(v!)]));

  const root = svg("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}`, className: "ls-el-svg pi" });
  const layer = (): SVGElement => svg("g");
  const L = [layer(), layer(), layer(), layer(), layer()];
  // Axes, value ticks and grid.
  for (const t of yt) {
    root.append(svg("line", { x1: left, y1: fix(Y(t), 1), x2: left + pw, y2: fix(Y(t), 1), className: "pi-grid" }));
    text(root, left - 12, Y(t) + 11, num(t), false, "right", F, "pi-t pi-m");
  }
  root.append(svg("path", { d: `M${left} ${top}V${fix(top + ph, 1)}H${fix(left + pw, 1)}`, className: "pi-w pi-n" }));
  // The value's name over its axis, level (not turned on its side, so Arabic reads too).
  if (yl) text(root, left - 12, top - 22, yl, rtl, "left");
  // The ADC: its numbers on the right, its levels as faint lines (layer 3).
  for (const c of codeT) {
    const yy = Y(lo + (c * (hi - lo)) / levels);
    if (levels <= 15) L[2]!.append(svg("line", { x1: left, y1: fix(yy, 1), x2: left + pw, y2: fix(yy, 1), className: "pi-lvl" }));
    text(L[2]!, left + pw + 12, yy + 11, String(c), false, "left", F, "pi-t pi-v");
  }
  // Thresholds (layer 4): the on line above its label, the off line below.
  const th = e.threshold === undefined ? [] : typeof e.threshold === "number" ? [e.threshold] : e.threshold;
  th.forEach((v, i) => {
    L[3]!.append(svg("line", { x1: left, y1: fix(Y(v), 1), x2: left + pw, y2: fix(Y(v), 1), className: "pi-th" }));
    text(L[3]!, left + 12, i ? Y(v) + 38 : Y(v) - 12, `${num(v, dp)}${unit}`, false, "left", F, "pi-t pi-bad");
  });
  if (strip) {
    L[3]!.append(svg("line", { x1: left, y1: fix(sBot, 1), x2: left + pw, y2: fix(sBot, 1), className: "pi-w" }));
    if (ol) text(L[3]!, left - 14, (sTop + sBot) / 2 + 11, ol, rtl, "right");
  }

  // What moves with time sits in `slide` (it scrolls with a window); what the cursor draws sits in `drawn`.
  const m = span < x1 - x0 ? 2 : left; // the time ticks may reach past the plot's ends unless the view scrolls
  const view = svg("svg", { x: left - m, y: 0, width: pw + m + Math.min(m, right + 40), height: H, viewBox: `${left - m} 0 ${pw + m + Math.min(m, right + 40)} ${H}`, overflow: "hidden" });
  const slide = svg("g");
  view.append(slide);
  for (const t of xt) {
    slide.append(svg("line", { x1: fix(X(t), 1), y1: fix(top + ph, 1), x2: fix(X(t), 1), y2: fix(top + ph + 8, 1), className: "pi-w" }));
    text(slide, X(t), H - bottom + 40, num(t), false, "middle", F, "pi-t pi-m");
  }
  if (xl) text(root, left + pw / 2, H - 10, xl, rtl, "middle");
  const drawn = svg("svg", { x: left, y: 0, width: 0, height: H, overflow: "hidden" });
  slide.append(drawn);
  const g = (): SVGElement => { const k = svg("g"); drawn.append(k); return k; };
  const layers = [g(), g(), g(), g(), g()];
  layers[0]!.append(svg("path", { d: P(e.curve), className: "pi-curve" }));
  const S = e.samples ?? [];
  if (S.length) {
    layers[1]!.append(svg("path", { d: S.map(([t, v]) => `M${fix(X(t), 1)} ${fix(top + ph, 1)}V${fix(Y(v), 1)}`).join(""), className: "pi-stem" }));
    for (const [t, v] of S) layers[1]!.append(svg("circle", { cx: fix(X(t), 1), cy: fix(Y(v), 1), r: 8, className: "pi-smp" }));
    if (adc) {
      const steps: number[][] = [];
      S.forEach(([t, v], i) => { const q = qv(v); steps.push([t, q], [S[i + 1]?.[0] ?? x1, q]); });
      layers[2]!.append(svg("path", { d: P(steps), className: "pi-step" }));
    }
  }
  if (e.out?.length) {
    const yOf = (b: number): number => (b ? sTop + 8 : sBot);
    let d = `M${fix(X(e.out[0]![0]), 1)} ${fix(sBot, 1)}`;
    e.out.forEach(([t, b], i) => { d += `H${fix(X(t), 1)}V${fix(yOf(b), 1)}`; if (i === e.out!.length - 1) d += `H${fix(X(x1), 1)}`; });
    layers[3]!.append(svg("path", { d: `${d}V${fix(sBot, 1)}Z`, className: "pi-dig" }));
  }
  if (e.avg) layers[4]!.append(svg("path", { d: P(e.avg), className: "pi-avg" }));
  const cursor = svg("line", { y1: top, y2: fix(strip ? sBot : top + ph, 1), className: "pi-cur" });
  slide.append(cursor);
  root.append(...L, view);
  // The readout: the latest sample's value, its ADC number, or both.
  let readout: SVGElement | null = null;
  const card = svg("g");
  if (e.readout && S.length) {
    card.append(svg("rect", { x: fix(left + pw - 330, 1), y: 2, width: 330, height: 48, rx: 10, className: "pi-s pi-tag" }));
    readout = text(card, left + pw - 165, 38, "", false, "middle", 34, "pi-t pi-v");
    root.append(card);
  }
  box.append(root);

  const byFrame = e.frame !== undefined || !!e.anim?.some((t) => t.prop === "frame");
  return (st) => {
    const T = Math.min(x1, Math.max(x0, byFrame ? x0 + st.frame : x0 + st.reveal * (x1 - x0)));
    const shift = span < x1 - x0 ? Math.min(x1 - x0 - span, Math.max(0, T - x0 - span)) : 0;
    wr.attr(slide, "transform", shift ? `translate(${fix((-shift * pw) / span, 1)} 0)` : "");
    const w = Math.max(0, X(T) - left);
    wr.attr(drawn, "width", fix(w + 9, 1));
    wr.attr(drawn, "viewBox", `${left} 0 ${fix(w + 9, 1)} ${H}`);
    wr.attr(cursor, "x1", fix(X(T), 1));
    wr.attr(cursor, "x2", fix(X(T), 1));
    wr.style(cursor, "opacity", T > x0 && T < x1 ? "1" : "0");
    const f = Math.round(st.focus);
    layers.forEach((k, i) => {
      const o = f >= 1 && i + 1 > f ? "0" : "1";
      wr.style(k, "opacity", o);
      wr.style(L[i]!, "opacity", o);
      wr.cls(k, "is-on", f === i + 1);
    });
    if (readout) {
      let i = -1;
      while (i + 1 < S.length && S[i + 1]![0] <= T + 1e-9) i++;
      const v = S[i]?.[1];
      const s = v === undefined ? "" : e.readout === "code" ? String(code(v)) : e.readout === "both" ? `${num(v, dp)}${unit} → ${code(v)}` : `${num(v, dp)}${unit}`;
      say(readout, s);
      wr.style(card, "opacity", f === 1 ? "0" : "1");
    }
  };
};
