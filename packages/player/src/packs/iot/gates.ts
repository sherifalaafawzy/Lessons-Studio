import type { Element } from "@lessonstudio/spec";
import type { KitRenderer } from "../../templates/types.ts";
import { clamp01, F, fix, pt, say, svg, text, tw } from "./common.ts";

type GatesElement = Extract<Element, { type: "gates" }>;

/** The value of every input, gate and output for one row of inputs (a few logic operations, as the drawing needs). */
export function evaluate(e: Pick<GatesElement, "inputs" | "gates" | "outputs">, row: readonly number[] | undefined): Record<string, number> {
  const v: Record<string, number> = {};
  e.inputs.forEach((x, i) => { v[x.id] = row?.[i] ? 1 : 0; });
  for (const g of e.gates) {
    const a = g.in.map((s) => v[s] ?? 0);
    const and = a.every(Boolean), or = a.some(Boolean), x = a.reduce((p, q) => p ^ q, 0);
    v[g.id] = Number({ and, or, not: !a[0], xor: !!x, nand: !and, nor: !or }[g.kind]);
  }
  for (const o of e.outputs) v[o.id] = v[o.from] ?? 0;
  return v;
}

/** A gate's outline, from x = 0 to w, centred on y = 0 (ANSI shapes; a bubble after NOT, NAND and NOR). */
function shape(kind: string, w: number, h: number): string {
  const r = h / 2;
  const b = kind === "not" || kind === "nand" || kind === "nor" ? 16 : 0;
  const x = w - b;
  switch (kind) {
    case "and": case "nand": return `M0 ${fix(-r)}H${fix(x - r)}A${fix(r)} ${fix(r)} 0 0 1 ${fix(x - r)} ${fix(r)}H0Z`;
    case "not": return `M0 ${fix(-r * 0.8)}L${fix(x)} 0L0 ${fix(r * 0.8)}Z`;
    default: {
      const o = kind === "xor" ? 12 : 0;
      return `M${o} ${fix(-r)}Q${fix(o + x * 0.55)} ${fix(-r)} ${fix(x)} 0Q${fix(o + x * 0.55)} ${fix(r)} ${o} ${fix(r)}Q${fix(o + x * 0.28)} 0 ${o} ${fix(-r)}Z` +
        (o ? `M0 ${fix(-r)}Q${fix(x * 0.28)} 0 0 ${fix(r)}` : "");
    }
  }
}

/**
 * Logic gates from a netlist, left to right in every language: inputs, gates in columns by depth, output lamps; a
 * truth table beside (below on a tall box) that fills in as the frames go. Wires light where the signal is 1.
 */
export const gates: KitRenderer = (el, box, ctx) => {
  const e = el as GatesElement;
  box.setAttribute("dir", "ltr");
  const W = e.w ?? 900;
  const H = e.h ?? 400;
  const rtl = ctx.dir === "rtl";
  const wr = ctx.wr;
  const col = new Map<string, number>();
  for (const x of e.inputs) col.set(x.id, 0);
  for (const g of e.gates) col.set(g.id, 1 + Math.max(0, ...g.in.map((s) => col.get(s) ?? 0)));
  const D = 1 + Math.max(0, ...e.gates.map((g) => col.get(g.id)!));
  for (const o of e.outputs) col.set(o.id, D);
  const name = (t: GatesElement["inputs"][number]["label"] | undefined): string => (t ? ctx.t(t) : "");

  // The truth table's size: beside the diagram, or under it when the box is tall.
  const rowsN = e.table ? Math.min(8, e.frames.length) : 0;
  const heads = [...e.inputs.map((x) => name(x.label)), ...e.outputs.map((o) => name(o.label))];
  const cw = heads.map((h) => Math.max(64, tw(h) + 28));
  const tW = cw.reduce((a, b) => a + b, 0);
  const tall = H > W * 0.9;
  const rh = e.table ? Math.min(52, (tall ? H * 0.45 : H - 10) / (rowsN + 1)) : 0;
  const tH = rh * (rowsN + 1);
  const dW = e.table && !tall ? W - tW - 40 : W;
  const dH = e.table && tall ? H - tH - 30 : H;

  const inW = Math.max(0, ...e.inputs.map((x) => tw(name(x.label)))) + 16;
  const outW = Math.max(0, ...e.outputs.map((o) => tw(name(o.label)))) + 16;
  const xl = inW + 40, xr = dW - outW - 40;
  const cx = (c: number): number => xl + ((xr - xl) * c) / D;
  const per = (c: number): number => (c === 0 ? e.inputs.length : c === D ? e.outputs.length : e.gates.filter((g) => col.get(g.id) === c).length);
  const most = Math.max(...Array.from({ length: D + 1 }, (_, c) => per(c)));
  const gh = Math.min(100, (dH / most) * 0.62);
  const gw = Math.min(160, Math.max(130, ((xr - xl) / D) * 0.42));
  const y = new Map<string, number>();
  const place = (ids: string[], c: number): void => ids.forEach((id, i) => y.set(id, (dH * (i + 0.5)) / ids.length));
  place(e.inputs.map((x) => x.id), 0);
  for (let c = 1; c < D; c++) {
    const list = e.gates.filter((g) => col.get(g.id) === c);
    const bary = (g: (typeof list)[number]): number => g.in.reduce((a, s) => a + (y.get(s) ?? 0), 0) / g.in.length;
    place([...list].sort((a, b) => bary(a) - bary(b)).map((g) => g.id), c);
  }
  place([...e.outputs].sort((a, b) => y.get(a.from)! - y.get(b.from)!).map((o) => o.id), D);

  const root = svg("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}`, className: "ls-el-svg pi", direction: "ltr" });
  const lw = svg("g");
  root.append(lw);
  const groups = Array.from({ length: D + 1 }, () => { const g = svg("g"); root.append(g); return g; });
  const out = (id: string): number[] => {
    const c = col.get(id)!;
    return [cx(c) + (c === 0 ? 40 : gw / 2), y.get(id)!];
  };

  // Wires: into each column, each on its own track in the channel before it.
  interface Wire { src: string; c: number; path: SVGElement }
  const wires: Wire[] = [];
  const sinks: { src: string; c: number; tx: number; ty: number }[] = [];
  for (const g of e.gates) {
    const c = col.get(g.id)!;
    const k = g.in.length;
    g.in.forEach((s, j) => sinks.push({ src: s, c, tx: cx(c) - gw / 2 + (g.kind === "or" || g.kind === "nor" || g.kind === "xor" ? gw * 0.1 : 0), ty: y.get(g.id)! + (k === 1 ? 0 : (j - (k - 1) / 2) * (gh * 0.6 / (k - 1))) }));
  }
  for (const o of e.outputs) sinks.push({ src: o.from, c: D, tx: cx(D) - 32, ty: y.get(o.id)! });
  for (let c = 1; c <= D; c++) {
    const list = sinks.filter((s) => s.c === c).sort((a, b) => a.ty - b.ty);
    const l = cx(c - 1) + (c - 1 === 0 ? 40 : gw / 2) + 14;
    const r = cx(c) - gw / 2 - 14;
    list.forEach((s, i) => {
      const [sx, sy] = out(s.src);
      const mx = l + ((r - l) * (i + 1)) / (list.length + 1);
      const path = svg("path", { d: `M${pt(sx!, sy!)}H${fix(mx, 1)}V${fix(s.ty, 1)}H${fix(s.tx, 1)}`, className: "pi-w pi-lw" });
      lw.append(path);
      wires.push({ src: s.src, c, path });
    });
  }

  // Inputs (switches showing their bit), gates, output lamps.
  const nodes: { id: string; g: SVGElement; v?: SVGElement }[] = [];
  e.inputs.forEach((x) => {
    const g = svg("g", { className: "pi-in" });
    const yy = y.get(x.id)!;
    g.append(svg("rect", { x: fix(cx(0) - 40, 1), y: fix(yy - 32, 1), width: 80, height: 64, rx: 14, className: "pi-s pi-key" }));
    const v = text(g, cx(0), yy + 13, "0", false, "middle", 38, "pi-t pi-bv");
    text(g, cx(0) - 54, yy + 11, name(x.label), rtl, "right");
    groups[0]!.append(g);
    nodes.push({ id: x.id, g, v });
  });
  e.gates.forEach((gt) => {
    const c = col.get(gt.id)!;
    const g = svg("g", { className: "pi-gate", transform: `translate(${pt(cx(c) - gw / 2, y.get(gt.id)!)})` });
    g.append(svg("path", { d: shape(gt.kind, gw, gh), className: "pi-s pi-gs" }));
    if (gt.kind === "not" || gt.kind === "nand" || gt.kind === "nor") g.append(svg("circle", { cx: fix(gw - 8, 1), r: 8, className: "pi-s" }));
    text(g, gw * (gt.kind === "not" ? 0.32 : gt.kind === "and" || gt.kind === "nand" ? 0.44 : 0.52), 11, gt.label ? ctx.t(gt.label) : gt.kind.toUpperCase(), rtl, "middle", gt.kind === "not" ? 28 : F);
    groups[c]!.append(g);
    nodes.push({ id: gt.id, g });
  });
  e.outputs.forEach((o) => {
    const g = svg("g", { className: "pi-out" });
    const yy = y.get(o.id)!;
    g.append(svg("circle", { cx: fix(cx(D), 1), cy: fix(yy, 1), r: 52, className: "pi-g1 pi-lamp pi-glo" }));
    g.append(svg("circle", { cx: fix(cx(D), 1), cy: fix(yy, 1), r: 32, className: "pi-s pi-bulb" }));
    text(g, cx(D) + 46, yy + 11, name(o.label), rtl, "left");
    groups[D]!.append(g);
    nodes.push({ id: o.id, g });
  });

  // The truth table, a row per frame (up to 8).
  const table = svg("g", { className: "pi-tt" });
  const tx0 = tall ? (W - tW) / 2 : W - tW;
  const ty0 = tall ? H - tH : (H - tH) / 2;
  const rowsG: { g: SVGElement; hi: SVGElement }[] = [];
  if (e.table) {
    let x = tx0;
    heads.forEach((h, i) => { text(table, x + cw[i]! / 2, ty0 + rh * 0.68, h, rtl, "middle", F); x += cw[i]!; });
    table.append(svg("line", { x1: fix(tx0, 1), y1: fix(ty0 + rh, 1), x2: fix(tx0 + tW, 1), y2: fix(ty0 + rh, 1), className: "pi-w" }));
    const sep = tx0 + cw.slice(0, e.inputs.length).reduce((a, b) => a + b, 0);
    table.append(svg("line", { x1: fix(sep, 1), y1: fix(ty0 + 6, 1), x2: fix(sep, 1), y2: fix(ty0 + tH, 1), className: "pi-w" }));
    for (let r = 0; r < rowsN; r++) {
      const g = svg("g");
      const yy = ty0 + rh * (r + 1);
      const hi = svg("rect", { x: fix(tx0, 1), y: fix(yy + 3, 1), width: fix(tW, 1), height: fix(rh - 6, 1), rx: 8, className: "pi-row" });
      g.append(hi);
      const v = evaluate(e, e.frames[r]);
      let xx = tx0;
      [...e.inputs.map((q) => v[q.id]), ...e.outputs.map((q) => v[q.id])].forEach((b, i) => { text(g, xx + cw[i]! / 2, yy + rh * 0.68, String(b), false, "middle", F); xx += cw[i]!; });
      table.append(g);
      rowsG.push({ g, hi });
    }
    root.append(table);
  }
  box.append(root);

  return (st) => {
    const f = Math.min(e.frames.length - 1, Math.max(0, Math.round(st.frame)));
    const now = evaluate(e, e.frames[f]);
    const before = evaluate(e, e.frames[Math.max(0, f - 1)]);
    // `pass` 0 → 1 carries the new row through the columns; without it, everything shows the new row.
    const reach = st.pass < 0 ? Infinity : st.pass * D;
    const val = (id: string): number => (col.get(id)! <= reach + 1e-6 ? now[id] : before[id]) ?? 0;
    const focus = Math.round(st.focus);
    groups.forEach((g, c) => wr.style(g, "opacity", fix(clamp01(st.reveal * (D + 1) - c))));
    for (const w of wires) {
      wr.cls(w.path, "pi-hot", val(w.src) === 1);
      wr.style(w.path, "opacity", fix(clamp01(st.reveal * (D + 1) - w.c)));
    }
    for (const nd of nodes) {
      wr.cls(nd.g, "is-1", val(nd.id) === 1);
      if (nd.v) say(nd.v, String(val(nd.id)));
    }
    e.gates.forEach((_, i) => wr.cls(nodes[e.inputs.length + i]!.g, "is-on", focus === i + 1));
    wr.style(table, "opacity", fix(clamp01(st.reveal * (D + 1) - D)));
    rowsG.forEach((r, i) => {
      wr.style(r.g, "opacity", i <= f ? "1" : "0");
      wr.style(r.hi, "opacity", i === f ? "1" : "0");
    });
  };
};
