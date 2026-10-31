import type { PlotElement, PlotSeries } from "@lessonstudio/spec";
import { compileExpr } from "@lessonstudio/spec/science";
import { svg } from "../dom.ts";
import { clamp01, fix } from "../motion.ts";
import type { KitRenderer } from "../templates/types.ts";
import { between, blend, CLASS_TONES, niceTicks, num, SERIES_TONES, toneVar } from "./util.ts";

/**
 * Plots in SVG, left to right in every language (like a textbook): axes, ticks, grid, then each series. Frames blend
 * (a fitted line turning, points moving to their cluster, a ball rolling down a loss curve); `reveal` draws lines from
 * left to right and brings dots in order; `focus` thickens one series and fades the others.
 */
export const plot: KitRenderer = (el, box, ctx) => {
  const e = el as PlotElement;
  box.setAttribute("dir", "ltr");
  const W = e.w ?? 640;
  const H = e.h ?? 400;
  const fs = 28;
  const left = 78 + (e.yLabel ? 44 : 0);
  const bottom = 52 + (e.xLabel ? 44 : 0);
  const top = 18;
  const right = 18;
  const pw = W - left - right;
  const ph = H - top - bottom;
  const [x0, x1] = e.xr;
  const [y0, y1] = e.yr;
  const X = (x: number): number => left + ((x - x0) / (x1 - x0)) * pw;
  const Y = (y: number): number => top + (1 - (y - y0) / (y1 - y0)) * ph;
  const P = (x: number, y: number): string => `${fix(X(x), 1)},${fix(Y(y), 1)}`;

  const root = svg("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}`, className: "ls-el-svg lp" });

  // Axes, ticks and grid.
  const xt = e.xTicks ?? niceTicks(x0, x1);
  const yt = e.yTicks ?? niceTicks(y0, y1);
  const label = (x: number, y: number, s: string, anchor: string, extra: Record<string, string | number> = {}): SVGElement => {
    const t = svg("text", { x: fix(x, 1), y: fix(y, 1), "text-anchor": anchor, "font-size": fs, fill: "var(--ls-muted)", ...extra });
    t.textContent = s;
    return t;
  };
  for (const t of xt) {
    if (e.grid) root.append(svg("line", { x1: X(t), y1: top, x2: X(t), y2: top + ph, className: "lp-grid" }));
    root.append(svg("line", { x1: X(t), y1: top + ph, x2: X(t), y2: top + ph + 8, className: "lp-axis" }), label(X(t), top + ph + 8 + fs, num(t), "middle"));
  }
  for (const t of yt) {
    if (e.grid) root.append(svg("line", { x1: left, y1: Y(t), x2: left + pw, y2: Y(t), className: "lp-grid" }));
    root.append(svg("line", { x1: left - 8, y1: Y(t), x2: left, y2: Y(t), className: "lp-axis" }), label(left - 12, Y(t) + fs * 0.35, num(t), "end"));
  }
  if (y0 < 0 && y1 > 0) root.append(svg("line", { x1: left, y1: Y(0), x2: left + pw, y2: Y(0), className: "lp-zero" }));
  if (x0 < 0 && x1 > 0) root.append(svg("line", { x1: X(0), y1: top, x2: X(0), y2: top + ph, className: "lp-zero" }));
  root.append(svg("path", { d: `M${left} ${top}V${top + ph}H${left + pw}`, className: "lp-axis", fill: "none" }));
  if (e.xLabel) root.append(label(left + pw / 2, H - 10, ctx.t(e.xLabel), "middle", { "font-weight": 700, fill: "var(--ls-fg)" }));
  if (e.yLabel) {
    const t = label(0, 0, ctx.t(e.yLabel), "middle", { "font-weight": 700, fill: "var(--ls-fg)" });
    t.setAttribute("transform", `translate(${fs + 4} ${fix(top + ph / 2, 1)}) rotate(-90)`);
    root.append(t);
  }

  // A nested viewport clips the series to the plot (an id'd clipPath would repeat when a scene is drawn twice).
  const area = svg("svg", { x: left, y: top, width: pw, height: ph, viewBox: `${left} ${top} ${pw} ${ph}`, overflow: "hidden" });
  root.append(area);
  type Painter = (frame: number, reveal: number, focused: boolean | null) => void;
  const painters: Painter[] = [];
  let legendY = top + 8;
  // The legend sits on a card in the top corner, above the curves.
  const legend = svg("g", { className: "lp-legend" });
  const legendBack = svg("rect", { rx: 8, className: "lp-lb" });
  legend.append(legendBack);
  let legendW = 0;

  e.series.forEach((s: PlotSeries, si) => {
    const tone = toneVar("tone" in s && s.tone ? s.tone : SERIES_TONES[si % SERIES_TONES.length]);
    const g = svg("g", { className: "lp-s" });
    g.style.color = tone;
    area.append(g);
    const dim = (focused: boolean | null): void => {
      ctx.wr.style(g, "opacity", focused === false ? "0.3" : "1");
      ctx.wr.cls(g, "is-on", focused === true);
    };
    if ("label" in s && s.label) {
      // A legend line in the top corner: a swatch and the series' name.
      const ly = legendY;
      legendY += fs + 10;
      legend.append(svg("rect", { x: left + pw - 30, y: ly, width: 22, height: 6, rx: 3, fill: tone }));
      const name = ctx.t(s.label);
      legend.append(label(left + pw - 40, ly + 8, name, "end", { fill: "var(--ls-fg)", "font-weight": 600 }));
      legendW = Math.max(legendW, name.length * fs * 0.56 + 52);
    }
    switch (s.kind) {
      case "fn": {
        const f = compileExpr(s.fn);
        const path = svg("path", { className: "lp-line", fill: "none", pathLength: 1, "stroke-dasharray": s.dash ? undefined : 1 });
        if (s.dash) path.setAttribute("stroke-dasharray", "10 10");
        g.append(path);
        const params = s.params ?? [[]];
        let key: string | null = null;
        painters.push((frame, reveal, focused) => {
          const [i, j, k] = between(params.length, frame);
          const p = blend(params[i]!, params[j]!, k);
          const want = p.map((v) => fix(v, 4)).join(",");
          if (want !== key) {
            key = want;
            // Sampled at 160 points; a gap wherever the curve leaves the plot by far (asymptotes).
            let d = "";
            let pen = false;
            for (let n = 0; n <= 160; n++) {
              const x = x0 + ((x1 - x0) * n) / 160;
              const y = f(x, p);
              const ok = Number.isFinite(y) && y > y0 - (y1 - y0) && y < y1 + (y1 - y0);
              if (ok) { d += `${pen ? "L" : "M"}${P(x, y)}`; pen = true; } else pen = false;
            }
            path.setAttribute("d", d || "M0 0");
          }
          if (!s.dash) ctx.wr.style(path, "stroke-dashoffset", fix(1 - reveal, 4));
          dim(focused);
        });
        break;
      }
      case "line": case "area": case "dots": {
        const sets = s.frames ?? [s.pts ?? []];
        const n = sets[0]!.length;
        const flat = sets.map((set) => set.flat());
        if (s.kind === "dots") {
          const dots = Array.from({ length: n }, (_, d) => {
            const c = svg("circle", { r: 9, className: "lp-dot" });
            if (s.cls && !s.clsFrames) c.style.fill = toneVar(CLASS_TONES[s.cls[d]!]);
            g.append(c);
            return c;
          });
          painters.push((frame, reveal, focused) => {
            const [i, j, k] = between(flat.length, frame);
            const v = blend(flat[i]!, flat[j]!, k);
            // Classes snap to the nearer frame (a point is in one group or another).
            const cls = s.clsFrames?.[Math.min(s.clsFrames.length - 1, Math.max(0, Math.round(frame)))];
            dots.forEach((c, d) => {
              if (cls) ctx.wr.style(c, "fill", toneVar(CLASS_TONES[cls[d]!]));
              ctx.wr.attr(c, "cx", fix(X(v[2 * d]!), 1));
              ctx.wr.attr(c, "cy", fix(Y(v[2 * d + 1]!), 1));
              ctx.wr.style(c, "opacity", fix(clamp01(reveal * n - d)));
            });
            dim(focused);
          });
        } else {
          const path = svg("path", { className: s.kind === "area" ? "lp-area" : "lp-line", pathLength: 1 });
          if (s.dash) path.setAttribute("stroke-dasharray", "10 10");
          else if (s.kind === "line") path.setAttribute("stroke-dasharray", "1");
          g.append(path);
          let key: string | null = null;
          painters.push((frame, reveal, focused) => {
            const [i, j, k] = between(flat.length, frame);
            const v = blend(flat[i]!, flat[j]!, k);
            const want = `${fix(frame, 3)}`;
            if (want !== key) {
              key = want;
              let d = "";
              for (let q = 0; q < n; q++) d += `${q ? "L" : "M"}${P(v[2 * q]!, v[2 * q + 1]!)}`;
              if (s.kind === "area" && n) d += `L${P(v[2 * (n - 1)]!, y0)}L${P(v[0]!, y0)}Z`;
              path.setAttribute("d", d || "M0 0");
            }
            if (s.kind === "line" && !s.dash) ctx.wr.style(path, "stroke-dashoffset", fix(1 - reveal, 4));
            else ctx.wr.style(path, "opacity", fix(reveal));
            dim(focused);
          });
        }
        break;
      }
      case "heat": {
        const grids = s.frames ?? [s.grid ?? [[0]]];
        let shown = -1;
        painters.push((frame, reveal, focused) => {
          const f = Math.min(grids.length - 1, Math.max(0, Math.round(frame)));
          if (f !== shown) {
            shown = f;
            g.replaceChildren();
            const grid = grids[f]!;
            const rows = grid.length;
            const cols = grid[0]!.length;
            const cw = pw / cols;
            const chh = ph / rows;
            // Runs of equal cells in a row are one rectangle: a class map is mostly long runs.
            grid.forEach((row, r) => {
              let c = 0;
              while (c < cols) {
                let end = c + 1;
                while (end < cols && row[end] === row[c]) end++;
                const v = row[c]!;
                const rect = svg("rect", { x: fix(left + c * cw, 1), y: fix(top + r * chh, 1), width: fix((end - c) * cw + 0.6, 1), height: fix(chh + 0.6, 1) });
                rect.setAttribute("fill", s.scale ? "var(--ls-accent)" : toneVar(CLASS_TONES[v]));
                rect.setAttribute("fill-opacity", s.scale ? fix(0.08 + 0.7 * v, 2) : "0.22");
                g.append(rect);
                c = end;
              }
            });
          }
          ctx.wr.style(g, "opacity", fix(reveal));
          dim(focused);
        });
        // Regions sit under everything else.
        area.insertBefore(g, area.firstChild);
        break;
      }
      case "hline": case "vline": {
        const ln = s.kind === "hline"
          ? svg("line", { x1: left, y1: Y(s.at), x2: left + pw, y2: Y(s.at), className: "lp-line lp-thin" })
          : svg("line", { x1: X(s.at), y1: top, x2: X(s.at), y2: top + ph, className: "lp-line lp-thin" });
        if (s.dash !== false) ln.setAttribute("stroke-dasharray", "12 10");
        g.append(ln);
        painters.push((_f, reveal, focused) => { ctx.wr.style(g, "opacity", fix(reveal)); dim(focused); });
        break;
      }
      case "marker": {
        const trail = s.trail ? svg("path", { className: "lp-trail", fill: "none" }) : null;
        if (trail) g.append(trail);
        const ball = svg("circle", { r: 14, className: "lp-ball" });
        g.append(ball);
        const flat = s.pts.map((p) => p as number[]);
        let key = -1;
        painters.push((frame, reveal, focused) => {
          const [i, j, k] = between(flat.length, frame);
          const [x, y] = blend(flat[i]!, flat[j]!, k);
          ctx.wr.attr(ball, "cx", fix(X(x!), 1));
          ctx.wr.attr(ball, "cy", fix(Y(y!), 1));
          if (trail && i !== key) {
            key = i;
            trail.setAttribute("d", flat.slice(0, i + 1).map((p, q) => `${q ? "L" : "M"}${P(p[0]!, p[1]!)}`).join("") || "M0 0");
          }
          ctx.wr.style(g, "opacity", fix(reveal));
          dim(focused);
        });
        break;
      }
    }
  });
  if (legendW) {
    for (const [k, v] of Object.entries({ x: left + pw - legendW - 6, y: top + 2, width: legendW + 4, height: legendY - top - 2 })) legendBack.setAttribute(k, fix(v, 1));
    root.append(legend);
  }
  box.append(root);

  return (st) => {
    const f = Math.round(st.focus);
    painters.forEach((p, i) => p(st.frame, st.reveal, f >= 1 ? f === i + 1 : null));
  };
};
