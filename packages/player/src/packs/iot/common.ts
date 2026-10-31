/** Shared by the IoT pack's renderers: text in SVG, frame blending, and the schematic symbols. */
import { ltrRuns } from "../../bidi.ts";
import { svg, type Writer } from "../../dom.ts";
import { clamp01, fix } from "../../motion.ts";
import type { KitState } from "../../templates/types.ts";

export { svg, fix, clamp01 };
export const F = 32;
export const ARABIC = /[֐-ࣿיִ-ﻼ]/;
/** About how wide a text is (no measuring while playing). */
export const tw = (s: string, size = F): number => s.length * size * 0.6;

/** Left-to-right runs ("GP15", "3.0 V") inside right-to-left text, isolated with U+2066 … U+2069. */
export function isolate(s: string): string {
  let out = "";
  let last = 0;
  for (const [a, b] of ltrRuns(s)) { out += `${s.slice(last, a)}⁦${s.slice(a, b)}⁩`; last = b; }
  return out + s.slice(last);
}

/**
 * SVG text at (x, y). `at` says where x is on the text as seen: its left edge, its middle or its right edge, so the
 * anchor is right in both directions. Text with Arabic letters is set right to left.
 */
export function text(parent: Element, x: number, y: number, s: string, rtl: boolean, at: "left" | "middle" | "right" = "middle", size = F, cls = "pi-t"): SVGElement {
  const r = rtl && ARABIC.test(s);
  const anchor = at === "middle" ? "middle" : (at === "left") !== r ? "start" : "end";
  const t = svg("text", { x: fix(x, 1), y: fix(y, 1), "text-anchor": anchor, "font-size": size, className: cls, direction: r ? "rtl" : undefined });
  t.textContent = r ? isolate(s) : s;
  parent.append(t);
  return t;
}

/** Sets a text's words when they change. */
export const say = (t: Element, s: string): void => { if (t.textContent !== s) t.textContent = s; };

/** The frames either side of `f`, how far between, and the nearer one. */
export function at<T>(list: readonly T[] | undefined, f: number): { a?: T; b?: T; k: number; n?: T } {
  if (!list?.length) return { k: 0 };
  const g = Math.min(list.length - 1, Math.max(0, f));
  const i = Math.floor(g);
  const j = Math.min(list.length - 1, i + 1);
  const k = g - i;
  return { a: list[i], b: list[j], k, n: list[k < 0.5 ? i : j] };
}
/** A value by id, blended between two frames. */
export const mix = (a: Record<string, number> | undefined, b: Record<string, number> | undefined, k: number, id: string): number =>
  (a?.[id] ?? 0) + ((b?.[id] ?? 0) - (a?.[id] ?? 0)) * k;

/**
 * Seconds of the flow's clock: the scene's own time if the player passes it (KitState.t), else `pass`, which the
 * authoring helpers run from 0 to the scene's length; below 0, still.
 */
export const clock = (s: KitState): number => (s as KitState & { t?: number }).t ?? s.pass;
export const pt = (x: number, y: number): string => `${fix(x, 1)},${fix(y, 1)}`;
/** A path through points. */
export const pathOf = (p: number[][]): string => p.map(([x, y], i) => `${i ? "L" : "M"}${pt(x!, y!)}`).join("");

export interface SymState { on: number; closed: number; sense: number; over: boolean; spin: number }
export interface Sym { g: SVGElement; paint(v: SymState): void }

/**
 * A schematic symbol drawn along x, centred on 0, its body B long; `s` (1 or −1) is the side its extras go (arrows,
 * a dome, an opening lever): −y when 1. `rot` is the turn of the group it sits in, undone for its letters.
 */
export function symbol(wr: Writer, kind: string, u: number, B: number, s: number, rot: number, color = "red"): Sym {
  const g = svg("g", { className: `pi-p pi-${kind}` });
  const add = (tag: string, a: Record<string, string | number>, cls = "pi-s"): SVGElement => { const e = svg(tag, { ...a, className: cls }); g.append(e); return e; };
  const up = (y: number): number => -y * s;
  const arrow = (x1: number, y1: number, x2: number, y2: number, cls: string): SVGElement => {
    const a = svg("g", { className: cls });
    const ang = Math.atan2(y2 - y1, x2 - x1);
    const h = (d: number): string => pt(x2 - 0.55 * u * Math.cos(ang + d), y2 - 0.55 * u * Math.sin(ang + d));
    a.append(svg("line", { x1: fix(x1, 1), y1: fix(y1, 1), x2: fix(x2, 1), y2: fix(y2, 1), className: "pi-a" }), svg("polygon", { points: `${pt(x2, y2)} ${h(0.45)} ${h(-0.45)}`, className: "pi-ah" }));
    g.append(a);
    return a;
  };
  const letter = (ch: string, size: number, x = 0, y = 0): void => {
    const t = svg("text", { x: fix(x, 1), y: fix(y + size * 0.36, 1), "text-anchor": "middle", "font-size": fix(size, 1), className: "pi-t", transform: rot ? `rotate(${-rot} ${fix(x, 1)} ${fix(y, 1)})` : undefined });
    t.textContent = ch;
    g.append(t);
  };
  const glow = (r: number, cls: string): SVGElement => {
    const k = svg("g", { className: cls });
    k.append(svg("circle", { r: fix(r * 1.7, 1), className: "pi-g1" }), svg("circle", { r: fix(r * 1.25, 1), className: "pi-g2" }));
    g.append(k);
    return k;
  };
  const h = B / 2;
  let paint: Sym["paint"] = () => {};
  switch (kind) {
    case "resistor": case "ldr": case "thermistor": {
      add("rect", { x: fix(-h, 1), y: fix(-0.55 * u, 1), width: fix(B, 1), height: fix(1.1 * u, 1), rx: 4 });
      if (kind === "thermistor") {
        const tint = add("rect", { x: fix(-h + 3, 1), y: fix(-0.55 * u + 3, 1), width: fix(B - 6, 1), height: fix(1.1 * u - 6, 1) }, "pi-heat");
        add("path", { d: `M${pt(-h - 0.7 * u, 1.1 * u * s)}H${fix(-h + 0.1 * u, 1)}L${pt(h + 0.3 * u, -1.1 * u * s)}` }, "pi-s pi-n");
        paint = (v) => { wr.style(tint, "opacity", fix(0.6 * v.sense)); };
      }
      if (kind === "ldr") {
        const a = svg("g");
        g.append(a);
        const ar = [arrow(-0.9 * u, up(2.8 * u), -0.25 * u, up(0.95 * u), "pi-light"), arrow(0.25 * u, up(2.8 * u), 0.9 * u, up(0.95 * u), "pi-light")];
        paint = (v) => { for (const x of ar) wr.style(x, "opacity", fix(0.15 + 0.85 * v.sense)); };
      }
      break;
    }
    case "led": case "lamp": {
      const lit = glow(kind === "led" ? 1.1 * u : 1.3 * u, `pi-glow pi-${kind === "led" ? color : "lamp"}`);
      let body: SVGElement, fill: SVGElement;
      if (kind === "led") {
        const tri = `M${pt(-0.85 * u, -1 * u)}L${pt(0.85 * u, 0)}L${pt(-0.85 * u, u)}Z`;
        body = add("path", { d: tri });
        fill = add("path", { d: tri }, `pi-lit pi-${color}`);
        add("line", { x1: fix(0.85 * u, 1), y1: fix(-u, 1), x2: fix(0.85 * u, 1), y2: fix(u, 1) });
        const em = [arrow(0.1 * u, up(1.2 * u), 0.9 * u, up(2.3 * u), "pi-emit"), arrow(0.9 * u, up(0.9 * u), 1.7 * u, up(2.0 * u), "pi-emit")];
        // Burnt out: over its limit and dark.
        const x = 1.3 * u;
        const cross = add("path", { d: `M${pt(-x, -x)}L${pt(x, x)}M${pt(x, -x)}L${pt(-x, x)}` }, "pi-x");
        paint = (v) => {
          const on = v.on;
          wr.style(cross, "opacity", v.over && on < 0.01 ? "1" : "0");
          wr.style(fill, "opacity", fix(on));
          wr.style(lit, "opacity", fix(on));
          for (const e of em) wr.style(e, "opacity", fix(on));
          wr.cls(body, "pi-over", v.over);
        };
      } else {
        body = add("circle", { r: fix(1.15 * u, 1) });
        fill = add("circle", { r: fix(1.15 * u - 3, 1) }, "pi-lit pi-lamp");
        const d = 0.8 * u;
        add("path", { d: `M${pt(-d, -d)}L${pt(d, d)}M${pt(d, -d)}L${pt(-d, d)}` }, "pi-s pi-n");
        paint = (v) => { wr.style(fill, "opacity", fix(v.on)); wr.style(lit, "opacity", fix(v.on)); };
      }
      break;
    }
    case "switch": {
      add("circle", { cx: fix(-h, 1), r: fix(0.28 * u, 1) });
      add("circle", { cx: fix(h, 1), r: fix(0.28 * u, 1) });
      const lever = add("line", { x1: fix(-h, 1), y1: 0, x2: fix(h - 0.1 * u, 1), y2: 0 }, "pi-s pi-lever");
      paint = (v) => { wr.attr(lever, "transform", `rotate(${fix(-32 * s * (1 - v.closed), 2)} ${fix(-h, 1)} 0)`); };
      break;
    }
    case "button": {
      add("circle", { cx: fix(-h * 0.8, 1), r: fix(0.28 * u, 1) });
      add("circle", { cx: fix(h * 0.8, 1), r: fix(0.28 * u, 1) });
      const bar = svg("g");
      bar.append(svg("path", { d: `M${pt(-h, 0)}H${fix(h, 1)}M0 0V${fix(up(1.1 * u), 1)}M${pt(-0.6 * u, up(1.1 * u))}H${fix(0.6 * u, 1)}`, className: "pi-s pi-n pi-lever" }));
      g.append(bar);
      paint = (v) => { wr.attr(bar, "transform", `translate(0 ${fix(up(0.35 * u + 0.75 * u * (1 - v.closed)), 1)})`); };
      break;
    }
    case "buzzer": {
      add("path", { d: `M${pt(-1.2 * u, 0)}A${fix(1.2 * u, 1)} ${fix(1.2 * u, 1)} 0 0 ${s > 0 ? 1 : 0} ${pt(1.2 * u, 0)}Z` });
      add("line", { x1: fix(-1.5 * u, 1), y1: 0, x2: fix(1.5 * u, 1), y2: 0 }, "pi-s pi-base");
      const waves = [1, 2, 3].map((n) => add("path", { d: `M${pt(-0.6 * u * n, up(1.2 * u + 0.45 * u * n))}Q${pt(0, up(1.6 * u + 0.6 * u * n))} ${pt(0.6 * u * n, up(1.2 * u + 0.45 * u * n))}` }, "pi-s pi-n pi-wave"));
      paint = (v) => waves.forEach((w, n) => {
        const beat = v.spin < 0 ? 1 : 0.35 + 0.65 * Math.abs(Math.sin(Math.PI * (v.spin * 3 - n / 3)));
        wr.style(w, "opacity", fix(v.on * beat));
      });
      break;
    }
    case "motor": {
      add("circle", { r: fix(1.25 * u, 1) });
      letter("M", 1.25 * u);
      const turn = svg("g");
      turn.append(svg("polygon", { points: `${pt(0, -1.25 * u - 0.45 * u)} ${pt(0.55 * u, -1.25 * u)} ${pt(0, -1.25 * u + 0.45 * u)}`, className: "pi-turn" }));
      g.append(turn);
      paint = (v) => {
        wr.style(turn, "opacity", fix(Math.min(1, v.on * 3)));
        wr.attr(turn, "transform", `rotate(${fix(((v.spin < 0 ? 0 : v.spin) * 300 * v.on) % 360, 1)})`);
      };
      break;
    }
    case "battery": {
      add("line", { x1: fix(-0.3 * u, 1), y1: fix(-1.4 * u, 1), x2: fix(-0.3 * u, 1), y2: fix(1.4 * u, 1) }, "pi-s pi-plate");
      add("line", { x1: fix(0.3 * u, 1), y1: fix(-0.7 * u, 1), x2: fix(0.3 * u, 1), y2: fix(0.7 * u, 1) }, "pi-s pi-neg");
      letter("+", Math.max(F, 1.1 * u), -1.15 * u, up(1.75 * u));
      break;
    }
  }
  return { g, paint };
}
