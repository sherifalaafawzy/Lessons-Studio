import type { Element } from "@lessonstudio/spec";
import type { KitRenderer } from "../../templates/types.ts";
import { at, clock, clamp01, F, fix, mix, pathOf, pt, say, svg, symbol, text, tw, type Sym } from "./common.ts";

type CircuitElement = Extract<Element, { type: "circuit" }>;
type Part = CircuitElement["parts"][number];

/** How long each symbol's body is along its wire, in units of u. */
const BODY: Record<string, number> = { resistor: 3, ldr: 3, thermistor: 3, led: 1.7, lamp: 2.3, switch: 3.2, button: 3, buzzer: 3, motor: 2.5, battery: 0.6 };
const SIDES = { above: [0, -1], below: [0, 1], left: [-1, 0], right: [1, 0] } as const;

/**
 * A schematic on a grid, never mirrored. Parts sit between grid points with their leads; wires join them, with a dot
 * where three or more meet. Frames set switches, lights, sensors, pins and the values beside parts (blended between
 * frames). Current flows as arrowheads along the wires, as fast as the current, moved by `pass` (seconds of the flow's
 * clock; below 0 they stand still and only show the direction).
 */
export const circuit: KitRenderer = (el, box, ctx) => {
  const e = el as CircuitElement;
  box.setAttribute("dir", "ltr");
  const W = e.w ?? 900;
  const H = e.h ?? 500;
  const rtl = ctx.dir === "rtl";
  const wr = ctx.wr;
  const all = [...e.parts.flatMap((p) => (p.b ? [p.a, p.b] : [p.a])), ...e.wires.flat()];
  const xs = all.map((p) => p[0]);
  const ys = all.map((p) => p[1]);
  const c0 = Math.min(...xs), c1 = Math.max(...xs), r0 = Math.min(...ys), r1 = Math.max(...ys);
  const cols = Math.max(1, c1 - c0), rows = Math.max(1, r1 - r0);
  const mc = (c0 + c1) / 2, mr = (r0 + r1) / 2;
  // In a narrow box, a part's values go one under another ("2.0 V" / "10 mA") instead of side by side.
  const narrow = W < 900;
  const split = (v: string): string[] => (v ? (narrow ? v.split(", ") : [v]) : []);
  const valueLines = (id: string): string[] => (e.frames ?? []).reduce<string[]>((s, f) => { const v = split(f.values?.[id] ?? ""); return v.join().length > s.join().length || v.length > s.length ? v : s; }, []);
  const sideOf = (p: Part): keyof typeof SIDES => p.side ?? (p.kind === "pin" ? (p.a[0] <= mc ? "left" : "right")
    : p.a[1] === p.b![1] ? ((p.a[1] + p.b![1]) / 2 <= mr ? "above" : "below") : (p.a[0] + p.b![0]) / 2 <= mc ? "left" : "right");
  // The room labels, values, pin tags and symbols need around the grid, worked out for a cell size (a few rounds).
  const room = (cell: number): number[] => {
    const u = Math.min(cell, 170) * 0.24;
    const need = [2.4 * u + 8, 2.4 * u + 8, 2.4 * u + 8, 2.4 * u + 8]; // left, right, top, bottom
    const reach = (x: number, y: number, l: number, r: number, t: number, b: number): void => {
      need[0] = Math.max(need[0]!, l - x); need[1] = Math.max(need[1]!, x + r - cols * cell);
      need[2] = Math.max(need[2]!, t - y); need[3] = Math.max(need[3]!, y + b - rows * cell);
    };
    for (const p of e.parts) {
      const x = (((p.b ? (p.a[0] + p.b[0]) / 2 : p.a[0]) - c0) * cell);
      const y = (((p.b ? (p.a[1] + p.b[1]) / 2 : p.a[1]) - r0) * cell);
      if (p.kind === "ground") { reach(x, y, 0, 0, 0, 2.1 * u + 6); continue; }
      const lines = [p.label ? ctx.t(p.label) : "", ...valueLines(p.id)].filter(Boolean);
      const w = Math.max(0, ...lines.map((s) => tw(s)));
      const [vx, vy] = SIDES[sideOf(p)];
      if (p.kind === "pin") {
        const t = tw(lines[0] ?? "") + 52 + 0.9 * u;
        const v = lines[1] ? tw(lines[1]) + 14 : 0;
        if (vx) reach(x, y, vx < 0 ? t + v : 0, vx > 0 ? t + v : 0, 30, 30);
        else reach(x, y, t / 2, t / 2 + v, vy < 0 ? 0.9 * u + 54 : 0, vy > 0 ? 0.9 * u + 54 : 0);
        continue;
      }
      const off = 1.5 * u + 10;
      const h = lines.length * 40 + 6;
      if (vy) reach(x, y, w / 2, w / 2, vy < 0 ? off + h : 0, vy > 0 ? off + h : 0);
      else reach(x, y, vx < 0 ? off + w + 4 : 0, vx > 0 ? off + w + 4 : 0, lines.length * 20 + 14, lines.length * 20 + 14);
    }
    return need;
  };
  let cell = Math.min(W / cols, H / rows);
  let need = room(cell);
  for (let i = 0; i < 4; i++) {
    cell = Math.max(20, Math.min((W - need[0]! - need[1]!) / cols, (H - need[2]! - need[3]!) / rows, 260));
    need = room(cell);
  }
  const ox = need[0]! + (W - need[0]! - need[1]! - cell * cols) / 2 - c0 * cell;
  const oy = need[2]! + (H - need[2]! - need[3]! - cell * rows) / 2 - r0 * cell;
  const X = (p: readonly number[]): number[] => [ox + p[0]! * cell, oy + p[1]! * cell];
  const u = Math.min(cell, 170) * 0.24;

  const root = svg("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}`, className: "ls-el-svg pi", direction: "ltr" });
  const lw = svg("g");
  const ld = svg("g");
  const lp = svg("g");
  root.append(lw, ld, lp);

  // Wires, and a dot where three or more ends meet.
  const deg = new Map<string, number>();
  const bump = (p: readonly number[], n = 1): void => { const k = `${p[0]},${p[1]}`; deg.set(k, (deg.get(k) ?? 0) + n); };
  const wires = e.wires.map((w) => {
    w.forEach((p, i) => bump(p, i === 0 || i === w.length - 1 ? 1 : 2));
    const path = svg("path", { d: pathOf(w.map(X)), className: "pi-w", pathLength: 1, "stroke-dasharray": 1 });
    lw.append(path);
    return path;
  });
  for (const p of e.parts) { bump(p.a); if (p.b) bump(p.b); }
  for (const [k, n] of deg) if (n >= 3) { const [x, y] = X(k.split(",").map(Number)); lw.append(svg("circle", { cx: fix(x!, 1), cy: fix(y!, 1), r: 7, className: "pi-j" })); }

  // Current: arrowheads along each wire segment.
  interface Seg { w: number; k: number; x: number; y: number; dx: number; dy: number; len: number; gap: number; ang: number; dots: SVGElement[] }
  const segs: Seg[] = [];
  e.wires.forEach((w, wi) => w.slice(1).forEach((q, k) => {
    const [x, y] = X(w[k]!);
    const [x2, y2] = X(q);
    const len = Math.hypot(x2! - x!, y2! - y!);
    const n = Math.max(1, Math.round(len / 46));
    const dots = Array.from({ length: n }, () => { const d = svg("polygon", { points: "-8,-8 9,0 -8,8", className: "pi-dot" }); ld.append(d); return d; });
    segs.push({ w: wi, k, x: x!, y: y!, dx: (x2! - x!) / len, dy: (y2! - y!) / len, len, gap: len / n, ang: (Math.atan2(y2! - y!, x2! - x!) * 180) / Math.PI, dots });
  }));

  // Parts, their labels and values.
  interface Drawn { p: Part; g: SVGElement; sym?: Sym; value?: SVGElement[]; level?: SVGElement }
  const valued = (id: string): boolean => !!e.frames?.some((f) => f.values?.[id]);
  const drawn: Drawn[] = e.parts.map((p) => {
    const g = svg("g", { className: "pi-part" });
    lp.append(g);
    const [ax, ay] = X(p.a);
    const d: Drawn = { p, g };
    if (p.kind === "ground") {
      const k = u * 0.9;
      g.append(svg("path", { d: `M${pt(ax!, ay!)}v${fix(k, 1)}M${pt(ax! - k * 1.1, ay! + k)}h${fix(2.2 * k, 1)}M${pt(ax! - k * 0.7, ay! + k * 1.5)}h${fix(1.4 * k, 1)}M${pt(ax! - k * 0.3, ay! + k * 2)}h${fix(0.6 * k, 1)}`, className: "pi-s pi-n" }));
      return d;
    }
    if (p.kind === "pin") {
      const name = ctx.t(p.label);
      const side = sideOf(p);
      const [vx, vy] = SIDES[side];
      const tw0 = tw(name) + 52;
      const th = 50;
      const gap = 0.9 * u;
      const cx = ax! + vx * (gap + tw0 / 2);
      const cy = ay! + vy * (gap + th / 2);
      g.append(svg("line", { x1: fix(ax!, 1), y1: fix(ay!, 1), x2: fix(ax! + vx * gap, 1), y2: fix(ay! + vy * gap, 1), className: "pi-w" }));
      g.append(svg("rect", { x: fix(cx - tw0 / 2, 1), y: fix(cy - th / 2, 1), width: fix(tw0, 1), height: th, rx: 10, className: "pi-s pi-tag" }));
      d.level = svg("circle", { cx: fix(cx - tw0 / 2 + 20, 1), cy: fix(cy, 1), r: 9, className: "pi-lv" });
      g.append(d.level);
      text(g, cx - tw0 / 2 + 36, cy + 11, name, false, "left");
      if (valued(p.id)) {
        const [tx, ty, a] = vx < 0 ? [cx - tw0 / 2 - 12, cy + 11, "right"] : vx > 0 ? [cx + tw0 / 2 + 12, cy + 11, "left"] : [cx + tw0 / 2 + 12, cy + 11, "left"];
        d.value = [text(g, tx as number, ty as number, "", rtl, a as "left" | "right", F, "pi-v")];
      }
      return d;
    }
    const [bx, by] = X(p.b!);
    const cx = (ax! + bx!) / 2;
    const cy = (ay! + by!) / 2;
    const L = Math.hypot(bx! - ax!, by! - ay!);
    const rot = Math.round((Math.atan2(by! - ay!, bx! - ax!) * 180) / Math.PI);
    const B = Math.min(L - 16, BODY[p.kind]! * u);
    const side = sideOf(p);
    const [vx, vy] = SIDES[side];
    // Extras (arrows, a dome, the lever) go to the side away from the label.
    const r = (rot * Math.PI) / 180;
    const s = Math.sin(r) * vx - Math.cos(r) * vy > 0 ? -1 : 1;
    const local = svg("g", { transform: `translate(${pt(cx, cy)}) rotate(${rot})` });
    local.append(svg("path", { d: `M${fix(-L / 2, 1)} 0H${fix(-B / 2, 1)}M${fix(B / 2, 1)} 0H${fix(L / 2, 1)}`, className: "pi-w" }));
    const sym = symbol(wr, p.kind, u, B, s, rot, p.color);
    local.append(sym.g);
    g.append(local);
    d.sym = sym;
    // Label and value: the label nearer the part; above a part the value is nearer.
    const off = 1.5 * u + 10;
    const name = p.label ? ctx.t(p.label) : "";
    const vals = valued(p.id) ? Math.max(1, valueLines(p.id).length) : 0;
    const line = 40;
    const count = (name ? 1 : 0) + vals;
    const put = (s2: string, i: number, cls: string): SVGElement => {
      if (vy) return text(g, cx, vy < 0 ? cy - off - 6 - (count - 1 - i) * line : cy + off + 26 + i * line, s2, rtl, "middle", F, cls);
      return text(g, cx + vx * off, cy + 11 - (count - 1) * 20 + i * line, s2, rtl, vx < 0 ? "right" : "left", F, cls);
    };
    if (name) put(name, 0, "pi-t");
    if (vals) d.value = Array.from({ length: vals }, (_, i) => put("", count - vals + i, "pi-v"));
    return d;
  });
  box.append(root);

  const speed = e.speed ?? 6;
  const N = e.parts.length + e.wires.length;
  return (st) => {
    const { a, b, k, n } = at(e.frames, st.frame);
    const focus = Math.round(st.focus);
    drawn.forEach((d, i) => {
      const id = d.p.id;
      wr.style(d.g, "opacity", fix(clamp01(st.reveal * N - i)));
      wr.cls(d.g, "is-on", focus === i + 1);
      d.sym?.paint({ on: mix(a?.on, b?.on, k, id), closed: mix(a?.closed, b?.closed, k, id), sense: mix(a?.sense, b?.sense, k, id), over: !!n?.over?.includes(id), spin: clock(st) });
      if (d.value) {
        const v = d.value.length > 1 ? split(n?.values?.[id] ?? "") : [n?.values?.[id] ?? ""];
        d.value.forEach((t, j) => { say(t, v[j] ?? ""); wr.cls(t, "pi-bad", !!n?.over?.includes(id)); });
      }
      if (d.level) wr.cls(d.level, "is-hi", (n?.pins?.[id] ?? 0) >= 0.5);
    });
    wires.forEach((w, i) => wr.style(w, "stroke-dashoffset", fix(1 - clamp01(st.reveal * N - e.parts.length - i), 3)));
    for (const sg of segs) {
      const I = (a?.flow?.[sg.w]?.[sg.k] ?? 0) + ((b?.flow?.[sg.w]?.[sg.k] ?? 0) - (a?.flow?.[sg.w]?.[sg.k] ?? 0)) * k;
      const shown = clamp01(st.reveal * N - e.parts.length - sg.w) * clamp01((Math.abs(I) - 0.02) / 0.5);
      const v = Math.min(220, Math.max(14, speed * Math.abs(I)));
      const dir = I < 0 ? -1 : 1;
      const tick = clock(st);
      const phase = tick < 0 ? 0.5 : ((((tick * v * dir) / sg.gap) % 1) + 1) % 1;
      sg.dots.forEach((dot, j) => {
        wr.style(dot, "opacity", fix(shown));
        if (!shown) return;
        const t = (j + phase) * sg.gap;
        wr.attr(dot, "transform", `translate(${pt(sg.x + sg.dx * t, sg.y + sg.dy * t)}) rotate(${fix(sg.ang + (dir < 0 ? 180 : 0), 1)})`);
      });
    }
  };
};
