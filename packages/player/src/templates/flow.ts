import { h, svg } from "../dom.ts";
import { icon } from "../icons.ts";
import { layoutFlow } from "../layout.ts";
import { enter, fix } from "../motion.ts";
import { emphasis, show, txt } from "./common.ts";
import type { SceneOf, Template } from "./types.ts";

/** Nodes and arrows (pipelines, attack chains). `move` cues send a packet along an arrow. */
export const flow: Template<SceneOf<"flow">> = (scene, ctx) => {
  const c = scene.content;
  const title = c.title ? txt(ctx, "h2", "ls-title", c.title) : null;
  const top = ctx.orient === "portrait" ? 210 : 150;
  const bottom = ctx.orient === "portrait" ? 230 : 130;
  const geo = layoutFlow(c.nodes, c.edges, { orient: ctx.orient, dir: ctx.dir, top, bottom });

  const lines = svg("g", { className: "ls-edges" });
  const packets = svg("g", { className: "ls-packets" });
  const canvas = svg("svg", { className: "ls-flow-svg", viewBox: `0 0 ${ctx.W} ${ctx.H}`, width: ctx.W, height: ctx.H }, lines, packets);
  const area = h("div", { className: "ls-flow" }, canvas);

  const nodes = c.nodes.map((n) => {
    const b = geo.nodes[n.id]!;
    const el = h(
      "div",
      { className: `ls-node ls-tone-${n.tone ?? "neutral"}`, style: `left:${b.x}px;top:${b.y}px;width:${b.w}px;height:${b.h}px` },
      n.icon ? icon(n.icon, 40) : null,
      txt(ctx, "span", "ls-node-label", n.label),
    );
    area.append(el);
    return { id: n.id, el };
  });

  const order = new Map(c.nodes.map((n, i) => [n.id, i]));
  const nodeAt = (id: string, cs: { at: Map<string, number> }): number => cs.at.get(id) ?? 0.2 + (order.get(id) ?? 0) * 0.28;

  const edges = geo.edges.map((g, i) => {
    const line = svg("line", { x1: g.x1, y1: g.y1, x2: g.x2, y2: g.y2, className: "ls-edge", "stroke-dasharray": g.len });
    const head = svg("polygon", { points: g.head, className: "ls-edge-head" });
    const dot = svg("circle", { r: 11, cx: g.x1, cy: g.y1, className: "ls-packet" });
    lines.append(line, head);
    packets.append(dot);
    const e = c.edges[i]!;
    let label: HTMLElement | null = null;
    if (e.label) {
      label = txt(ctx, "span", "ls-edge-label", e.label);
      // Beside the arrow, not on it, so the arrow stays visible: above a mostly level arrow, beside an upright one.
      const len = g.len || 1;
      let nx = (g.y1 - g.y2) / len;
      let ny = (g.x2 - g.x1) / len;
      if (ny > 0) { nx = -nx; ny = -ny; }
      const level = Math.abs(ny) > 0.5;
      const x = (g.x1 + g.x2) / 2 + (level ? nx * 30 : 0);
      const y = (g.y1 + g.y2) / 2 + (level ? ny * 30 : 0);
      // The outer box places the label; the inner one animates.
      const cls = level ? "ls-edge-label-at" : "ls-edge-label-at ls-edge-label-side";
      area.append(h("span", { className: cls, style: `left:${Math.round(x)}px;top:${Math.round(y)}px` }, label));
    }
    return { key: `${g.from}>${g.to}`, g, line, head, dot, label };
  });

  const root = h("div", { className: "ls-scene ls-t-flow" }, title, area);

  return {
    root,
    update(lt, cs) {
      if (title) show(ctx, title, lt, 0, 14, emphasis(ctx, title, "title", cs));
      for (const n of nodes) {
        const s = emphasis(ctx, n.el, n.id, cs);
        const p = enter(lt, nodeAt(n.id, cs), ctx.tier);
        ctx.wr.style(n.el, "opacity", fix(p));
        const k = (0.9 + 0.1 * p) * s;
        ctx.wr.style(n.el, "transform", k === 1 ? "none" : `scale(${fix(k)})`);
      }
      for (const e of edges) {
        const at = Math.max(nodeAt(e.g.from, cs), nodeAt(e.g.to, cs)) + 0.2;
        const p = enter(lt, at, ctx.tier, 0.6);
        ctx.wr.style(e.line, "stroke-dashoffset", fix(e.g.len * (1 - p), 1));
        ctx.wr.style(e.head, "opacity", p >= 0.98 ? "1" : "0");
        ctx.wr.cls(e.line, "is-hi", cs.hi.has(e.key));
        if (e.label) show(ctx, e.label, lt, at + 0.2, 0);
        const move = cs.moves.find((m) => m.target === e.key);
        ctx.wr.style(e.dot, "opacity", move ? "1" : "0");
        const q = move ? move.p : 0;
        ctx.wr.attr(e.dot, "cx", fix(e.g.x1 + (e.g.x2 - e.g.x1) * q, 1));
        ctx.wr.attr(e.dot, "cy", fix(e.g.y1 + (e.g.y2 - e.g.y1) * q, 1));
      }
    },
  };
};
