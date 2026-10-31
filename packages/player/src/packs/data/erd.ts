import type { Element } from "@lessonstudio/spec";
import { h, rich, svg } from "../../dom.ts";
import { clamp01, fix } from "../../motion.ts";
import type { KitRenderer } from "../../templates/types.ts";
import { ems, px, toneVar } from "./util.ts";

type E = Extract<Element, { type: "erd" }>;
type Pt = [number, number];
interface Placed { x: number; y: number; w: number; h: number }

/**
 * An entity-relationship diagram: tables with their columns (PK and FK marked, types beside them) and relationships
 * drawn with crow's feet (|| for one, a fork for many). Laid out from the first table along its relationships, in
 * columns (top to bottom in a tall box); lines meet the key columns. Positions mirror in right-to-left languages unless
 * `fixed`; names and types stay left to right.
 */
export const erd: KitRenderer = (el, box, ctx) => {
  const e = el as E;
  const W = e.w ?? 1100;
  const H = e.h ?? 500;
  const flip = ctx.mirror && !e.fixed;
  const rtl = ctx.dir === "rtl";
  const T = e.tables;
  const rels = e.rels ?? [];
  const typed = T.some((t) => t.cols.some((c) => c.type));
  // A table's label in the lesson's language, unless it only repeats the name ("Members" under members).
  const labels = T.map((t) => { const l = t.label ? ctx.t(t.label) : ""; return l.toLowerCase().replace(/[\s_]/g, "") ===t.name.toLowerCase().replace(/_/g, "") ? "" : l; });
  const idx = new Map(T.map((t, i) => [t.name, i]));
  const adj = T.map(() => [] as number[]);
  for (const r of rels) { const a = idx.get(r.from)!; const b = idx.get(r.to)!; adj[a]!.push(b); adj[b]!.push(a); }

  // Layers: from the first table out along the relationships (each part of the diagram after the last).
  const layer = T.map(() => -1);
  const order: number[] = [];
  for (let s = 0, base = 0; s < T.length; s++) {
    if (layer[s]! >= 0) continue;
    layer[s] = base;
    const q = [s];
    while (q.length) {
      const a = q.shift()!;
      order.push(a);
      for (const b of adj[a]!) if (layer[b]! < 0) { layer[b] = layer[a]! + 1; q.push(b); }
    }
    base = Math.max(...layer) + 1;
  }
  const L = Math.max(...layer) + 1;
  const byLayer: number[][] = Array.from({ length: L }, () => []);
  for (const a of order) byLayer[layer[a]!]!.push(a);
  for (let l = 1; l < L; l++) {
    const prev = byLayer[l - 1]!;
    const bc = (a: number): number => { const ns = adj[a]!.filter((b) => layer[b] === l - 1).map((b) => prev.indexOf(b)); return ns.length ? ns.reduce((x, y) => x + y, 0) / ns.length : 99; };
    byLayer[l]!.sort((a, b) => bc(a) - bc(b));
  }

  // Sizes in em, then the text size that fits them all.
  const keyed = T.map((t) => t.cols.some((c) => c.key));
  const headEm = (i: number): number => 1.55 + (labels[i] ? 1.1 : 0);
  // Sizes in em with or without the types, in columns or in rows, and the text size that fits them.
  const fit = (types: boolean, vertical: boolean) => {
    const tw = T.map((t, i) => Math.max(ems(t.name, true) * 1.05, ems(labels[i]!) * 0.875,
      ...t.cols.map((c) => (keyed[i] ? 1.9 : 0) + ems(c.name, true) + (types && c.type ? 0.8 + ems(c.type, true) * 0.875 : 0))) + 1.1);
    const th = T.map((t, i) => headEm(i) + t.cols.length * 1.3 + 0.4);
    const along = byLayer.map((ls) => Math.max(...ls.map((a) => (vertical ? th[a]! : tw[a]!))));
    const across = byLayer.map((ls) => ls.reduce((s, a) => s + (vertical ? tw[a]! : th[a]!), 0) + (ls.length - 1));
    // Room between layers for the crow's feet, and for a relationship's label across it.
    const gapEm = Array.from({ length: Math.max(0, L - 1) }, (_, l) => Math.max(4, ...rels.filter((r) => !vertical && r.label && Math.min(layer[idx.get(r.from)!]!, layer[idx.get(r.to)!]!) === l).map((r) => ems(ctx.t(r.label!)) * 0.875 + 2.8)));
    const alongEm = along.reduce((a, b) => a + b, 0) + gapEm.reduce((a, b) => a + b, 0);
    return { types, vertical, tw, th, along, across, gapEm, alongEm, size: Math.min(e.size ?? 42, (vertical ? H : W) / alongEm, (vertical ? W : H) / Math.max(...across)) };
  };
  // Tables in columns, or top to bottom when that's clearly bigger (a tall or square box); types show unless they'd
  // shrink the text below 32 px (or `types` says otherwise).
  const best = (types: boolean): ReturnType<typeof fit> => { const a = fit(types, false); const b = fit(types, true); return b.size > a.size * 1.15 ? b : a; };
  let F = best(e.types ?? typed);
  if (e.types === undefined && F.types && F.size < 32) { const bare = best(false); if (bare.size > F.size) F = bare; }
  const { types, vertical, tw, th, along, across, gapEm, alongEm, size } = F;

  const room = vertical ? H : W;
  const used = alongEm * size;
  const extra = L > 1 ? Math.min((room - used) / (L - 1), 3 * size) : 0;
  let pos = (room - used - extra * (L - 1)) / 2;
  const P: Placed[] = T.map(() => ({ x: 0, y: 0, w: 0, h: 0 }));
  byLayer.forEach((ls, l) => {
    const len = along[l]! * size;
    let c = ((vertical ? W : H) - across[l]! * size) / 2;
    for (const a of ls) {
      const w = tw[a]! * size;
      const ht = th[a]! * size;
      const p = pos + (len - (vertical ? ht : w)) / 2;
      P[a] = vertical ? { x: c, y: p, w, h: ht } : { x: p, y: c, w, h: ht };
      if (flip) P[a]!.x = W - P[a]!.x - w;
      c += (vertical ? w : ht) + size;
    }
    pos += len + (gapEm[l] ?? 0) * size + extra;
  });

  const root = h("div", { className: "pd-erd" });
  root.style.fontSize = px(size);
  const art = svg("svg", { className: "ls-el-svg pd-links", width: W, height: H, viewBox: `0 0 ${W} ${H}`, direction: "ltr" });
  root.append(art);

  // Tables.
  const rowsOf: HTMLElement[][] = [];
  const cards = T.map((t, i) => {
    const p = P[i]!;
    const card = h("div", { className: "pd-t", dir: "ltr" });
    card.style.cssText += `;left:${px(p.x)};top:${px(p.y)};width:${px(p.w)};height:${px(p.h)}`;
    if (t.tone) card.style.setProperty("--pd-tone", toneVar(t.tone));
    const head = h("div", { className: "pd-th" }, h("span", { className: "pd-tn" }, t.name));
    if (labels[i]) head.append(h("div", { className: "pd-tl", dir: ctx.dir }, ...rich(labels[i]!, rtl)));
    card.append(head);
    rowsOf[i] = t.cols.map((c) => {
      const row = h("div", { className: `pd-tc${c.key === "pk" || c.key === "pkfk" ? " is-pk" : ""}${c.key === "fk" || c.key === "pkfk" ? " is-fk" : ""}` });
      if (keyed[i]) row.append(h("span", { className: "pd-key" }, c.key === "fk" ? "FK" : c.key ? "PK" : ""));
      row.append(h("span", { className: "pd-cn" }, c.name));
      if (types && c.type) row.append(h("span", { className: "pd-ct" }, c.type));
      card.append(row);
      return row;
    });
    root.append(card);
    return card;
  });

  // The centre of a column's row (or of the table, without one).
  const rowY = (i: number, col: number): number => (col < 0 ? P[i]!.y + P[i]!.h / 2 : P[i]!.y + (headEm(i) + 0.2 + col * 1.3 + 0.65) * size);
  const pk = (i: number): number => T[i]!.cols.findIndex((c) => c.key === "pk" || c.key === "pkfk");
  const end = (p: Pt, d: Pt, many: boolean): string => {
    const q = (s: number, o: number): string => `${fix(p[0] + d[0] * s * size - d[1] * o * size, 1)} ${fix(p[1] + d[1] * s * size + d[0] * o * size, 1)}`;
    const bar = (s: number): string => `M${q(s, 0.42)}L${q(s, -0.42)}`;
    return many ? `M${q(0, 0.48)}L${q(0.95, 0)}L${q(0, -0.48)}M${q(0, 0)}L${q(0.95, 0)}${bar(1.2)}` : `${bar(0.5)}${bar(0.8)}`;
  };
  const lines = rels.map((r) => {
    const a = idx.get(r.from)!;
    const b = idx.get(r.to)!;
    const A = P[a]!;
    const B = P[b]!;
    const viaRow = r.via ? T[b]!.cols.findIndex((c) => c.name === r.via) : pk(b);
    const ca = vertical ? 0 : pk(a);
    let pa: Pt, pb: Pt, da: Pt, db: Pt, route: Pt[];
    if (layer[a] !== layer[b] ? !vertical : vertical) {
      // Side by side: from the side of one that faces the other, at the key columns.
      const right = A.x + A.w / 2 < B.x + B.w / 2;
      pa = [right ? A.x + A.w : A.x, vertical ? A.y + A.h / 2 : rowY(a, ca)];
      pb = [right ? B.x : B.x + B.w, vertical ? B.y + B.h / 2 : rowY(b, viaRow)];
      da = [right ? 1 : -1, 0];
      db = [right ? -1 : 1, 0];
      const mx = (pa[0] + pb[0]) / 2;
      route = Math.abs(pa[1] - pb[1]) < 2 ? [pa, pb] : [pa, [mx, pa[1]], [mx, pb[1]], pb];
    } else {
      const down = A.y + A.h / 2 < B.y + B.h / 2;
      pa = [A.x + A.w / 2, down ? A.y + A.h : A.y];
      pb = [B.x + B.w / 2, down ? B.y : B.y + B.h];
      da = [0, down ? 1 : -1];
      db = [0, down ? -1 : 1];
      const my = (pa[1] + pb[1]) / 2;
      route = Math.abs(pa[0] - pb[0]) < 2 ? [pa, pb] : [pa, [pa[0], my], [pb[0], my], pb];
    }
    const g = svg("g", { className: "pd-rel" });
    g.append(svg("path", { d: route.map((p, k) => `${k ? "L" : "M"}${fix(p[0], 1)} ${fix(p[1], 1)}`).join("") + end(pa, da, r.kind === "n-n") + end(pb, db, r.kind !== "1-1") }));
    if (r.label) {
      // Over a line across, beside a line down (at its end side).
      const across = da[1] === 0;
      const t = svg("text", {
        x: fix((pa[0] + pb[0]) / 2 + (across ? 0 : (flip ? -0.5 : 0.5) * size), 1), y: fix((pa[1] + pb[1]) / 2 + (across ? -0.35 : 0.3) * size, 1),
        "text-anchor": across ? "middle" : flip ? "end" : "start", "font-size": fix(size * 0.875, 1), className: "pd-rl",
      });
      t.textContent = ctx.t(r.label);
      g.append(t);
    }
    art.append(g);
    return { g, a, b, ra: pk(a), rb: viaRow };
  });
  box.append(root);

  const rank = new Map(order.map((n, k) => [n, k]));
  return (s) => {
    const shown = (i: number): number => clamp01(s.reveal * T.length - rank.get(i)!);
    const focus = Math.round(s.focus);
    const rel = focus - T.length - 1;
    cards.forEach((c, i) => {
      ctx.wr.style(c, "opacity", fix(shown(i)));
      ctx.wr.cls(c, "is-on", focus === i + 1);
    });
    const on = new Set<HTMLElement>();
    lines.forEach((l, k) => {
      ctx.wr.style(l.g, "opacity", fix(Math.min(shown(l.a), shown(l.b))));
      ctx.wr.cls(l.g, "is-on", rel === k);
      if (rel === k) for (const [t, c] of [[l.a, l.ra], [l.b, l.rb]] as const) if (c >= 0) on.add(rowsOf[t]![c]!);
    });
    rowsOf.forEach((rows) => rows.forEach((r) => ctx.wr.cls(r, "is-on", on.has(r))));
  };
};
