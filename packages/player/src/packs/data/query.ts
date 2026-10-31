import type { Element } from "@lessonstudio/spec";
import { h, svg } from "../../dom.ts";
import { clamp01, fix } from "../../motion.ts";
import type { KitRenderer } from "../../templates/types.ts";
import { between, ems, lerp, px, shown, smooth, valueNodes, type Value } from "./util.ts";

type Q = Extract<Element, { type: "query" }>;
type View = Q["steps"][number]["views"][number];

/** SQL words, quoted text and numbers, for the colours. */
const TOKENS = /('[^']*')|\b(SELECT|FROM|WHERE|GROUP|BY|HAVING|ORDER|LIMIT|OFFSET|JOIN|LEFT|INNER|OUTER|ON|AS|AND|OR|NOT|IN|IS|NULL|LIKE|BETWEEN|DISTINCT|ASC|DESC)\b|\b(\d+(?:\.\d+)?)\b/gi;
// Sizes in em of the text size.
const ROW = 1.25;
const HEAD = 1.3;
const GAP = 0.45;
const LINK = 3.2;
const LINE = 1.25;

interface RowAt { y: number; op: number; out: boolean; grp: number }
interface GridAt { x: number; y: number; rows: Map<number, RowAt>; colOp: number[]; lit: Set<number>; sort: Map<number, string>; cut: number; h: number }

/**
 * A SQL query, step by step: the SQL (left to right, the step's clause lit, each clause numbered in the order it
 * runs) beside or above the tables. Rows fade and are struck out at WHERE, matching rows are joined by lines, groups
 * gather with a colour each, picked columns light and the others dim, rows move as they're sorted, LIMIT cuts, and
 * the result is framed. Fractional frames move the rows between steps. Tables follow the lesson's direction; the
 * layout mirrors unless `fixed`.
 */
export const query: KitRenderer = (el, box, ctx) => {
  const e = el as Q;
  const W = e.w ?? 1100;
  const H = e.h ?? 500;
  const rtl = ctx.dir === "rtl";
  const flip = ctx.mirror && !e.fixed;
  const lines = e.sql.split("\n");
  const steps = e.steps;
  const text = e.grids.map((g) => g.rows.map((r) => r.map((v) => shown(v, e.words, ctx))));

  // Sizes in em: the SQL panel, each grid's columns, and the biggest step.
  const sqlW = Math.max(...lines.map((l) => l.length)) * 0.6 + 2.9;
  const sqlH = lines.length * LINE + 0.75;
  // A sorted column keeps room for its arrow.
  const sorted = e.grids.map((_, gi) => new Set(steps.flatMap((s) => s.views.filter((v) => v.g === gi).flatMap((v) => (v.sort ?? []).map((x) => x[0])))));
  const colW = e.grids.map((g, gi) => g.cols.map((c, k) => Math.max(ems(c, true) * 0.94 + (sorted[gi]!.has(k) ? 0.8 : 0), ...text[gi]!.map((r) => ems(r[k]!))) + 0.9));
  const gw = colW.map((c) => c.reduce((a, b) => a + b, 0));
  const gaps = (v: View): number => {
    if (!v.groups || !v.groups.some((g, i) => v.groups!.indexOf(g) !== i)) return 0;
    return v.groups.filter((g, i) => i > 0 && g !== v.groups![i - 1]).length;
  };
  const need = steps.map((s) => [
    s.views.reduce((a, v) => a + gw[v.g]!, 0) + (s.views.length - 1) * LINK,
    Math.max(...s.views.map((v) => HEAD + v.rows.length * ROW + gaps(v) * GAP)),
  ]);
  const tw = Math.max(...need.map((n) => n[0]!));
  const th = Math.max(...need.map((n) => n[1]!));
  const sideFit = Math.min(W / (sqlW + 1.2 + tw), H / Math.max(sqlH, th));
  const topFit = Math.min(W / Math.max(sqlW, tw), H / (sqlH + 0.6 + th));
  const side = e.layout ? e.layout === "side" : sideFit >= topFit;
  const size = Math.min(e.size ?? 42, side ? sideFit : topFit);
  // The whole composition, centred in the box.
  const compW = (side ? sqlW + 1.2 + tw : Math.max(sqlW, tw)) * size;
  const compH = (side ? Math.max(sqlH, th) : sqlH + 0.6 + th) * size;
  const ox = Math.max(0, (W - compW) / 2);
  const oy = Math.max(0, (H - compH) / 2);
  const X = (x: number, w: number): number => (flip ? W - x - w : x);

  const root = h("div", { className: "pd-q" });
  root.style.fontSize = px(size);
  box.append(root);

  // The SQL.
  const panel = h("div", { className: "pd-sql", dir: "ltr" });
  panel.style.cssText += `;left:${px(X(ox, sqlW * size))};top:${px(oy)};width:${px(sqlW * size)}`;
  const first = lines.map((_, li) => steps.findIndex((s) => s.lines.includes(li)));
  const order = [...new Set(first.filter((f) => f >= 0))].sort((a, b) => a - b);
  const lineEls = lines.map((l, li) => {
    const code = h("span", { className: "pd-code" });
    let last = 0;
    for (const m of l.matchAll(TOKENS)) {
      if (m.index! > last) code.append(l.slice(last, m.index));
      code.append(h("span", { className: m[1] ? "pd-str" : m[2] ? "pd-kw" : "pd-nu" }, m[0]));
      last = m.index! + m[0].length;
    }
    code.append(l.slice(last));
    const badge = h("span", { className: "pd-b" }, first[li]! >= 0 ? String(order.indexOf(first[li]!) + 1) : "");
    const row = h("div", { className: "pd-ln" }, badge, code);
    panel.append(row);
    return { row, badge };
  });
  root.append(panel);

  // Where the tables go: beside the SQL or under it.
  const ax = ox + (side ? (sqlW + 1.2) * size : 0);
  const ay = oy + (side ? 0 : (sqlH + 0.6) * size);
  const aw = side ? tw * size : compW;

  // Each step's state of every grid it shows: place, rows, columns.
  const states: Map<number, GridAt>[] = steps.map((s, si) => {
    const m = new Map<number, GridAt>();
    let x = ax + Math.max(0, (aw - need[si]![0]! * size) / 2);
    for (const v of s.views) {
      const w = gw[v.g]! * size;
      const out = new Set(v.out ?? []);
      const gapOn = gaps(v) > 0;
      const rows = new Map<number, RowAt>();
      let y = HEAD;
      v.rows.forEach((r, j) => {
        const grp = v.groups?.[j] ?? -1;
        if (gapOn && j > 0 && grp !== v.groups![j - 1]) y += GAP;
        rows.set(r, { y: y * size, op: out.has(r) ? 0.5 : 1, out: out.has(r), grp });
        y += ROW;
      });
      const cols = e.grids[v.g]!.cols.length;
      const colOp = Array.from({ length: cols }, (_, c) => (v.hide?.includes(c) ? 0 : v.dim?.includes(c) ? 0.28 : 1));
      const sort = new Map((v.sort ?? []).map(([c, d]) => [c, d === "desc" ? "↓" : "↑"]));
      m.set(v.g, { x: X(x, w), y: ay, rows, colOp, lit: new Set(v.lit ?? []), sort, cut: v.cut ?? -1, h: y });
      x += w + LINK * size;
    }
    return m;
  });

  // The grids: built once, every row of each.
  const grids = e.grids.map((g, gi) => {
    const widths = colW[gi]!;
    const cellOf = (k: number, kids: Node[]): HTMLElement => {
      // One inline span inside the flex box, so the spaces between words stay.
      const c = h("span", { className: `pd-c${k && k === g.split ? " pd-split" : ""}` }, h("span", null, ...kids));
      c.style.width = `${fix(widths[k]!, 2)}em`;
      return c;
    };
    const arrows = g.cols.map(() => h("span", { className: "pd-ar" }));
    // A column's name is code: it and its sort arrow read left to right in every language.
    const head = g.cols.map((c, k) => cellOf(k, [h("span", { dir: "ltr" }, c, arrows[k]!)]));
    const gridEl = h("div", { className: "pd-g", dir: ctx.dir }, h("div", { className: "pd-h" }, ...head));
    gridEl.style.width = `${fix(gw[gi]!, 2)}em`;
    const rows = g.rows.map((r, ri) => {
      const cells = r.map((v, k) => {
        const c = cellOf(k, valueNodes(v as Value, text[gi]![ri]![k]!, rtl));
        if (typeof v === "number") c.classList.add("pd-num");
        return c;
      });
      const row = h("div", { className: "pd-r" }, ...cells);
      gridEl.append(row);
      return { row, cells };
    });
    const cut = h("div", { className: "pd-cut" });
    gridEl.append(cut);
    root.append(gridEl);
    return { el: gridEl, head, arrows, rows, cut };
  });

  // A join's links, between the rows of its two tables, where that step puts them.
  const links: { line: SVGElement; step: number }[] = [];
  const art = svg("svg", { className: "ls-el-svg pd-links", width: W, height: H, viewBox: `0 0 ${W} ${H}`, direction: "ltr" });
  root.insertBefore(art, root.firstChild);
  steps.forEach((s, si) => {
    if (!s.links || s.views.length !== 2) return;
    const [va, vb] = s.views as [View, View];
    const A = states[si]!.get(va.g)!;
    const B = states[si]!.get(vb.g)!;
    const aw_ = gw[va.g]! * size;
    const bw = gw[vb.g]! * size;
    // From A's side that faces B to B's side that faces A.
    const ar = A.x < B.x;
    for (const [ra, rb] of s.links) {
      const y1 = A.y + A.rows.get(ra)!.y + (ROW * size) / 2;
      const y2 = B.y + B.rows.get(rb)!.y + (ROW * size) / 2;
      const x1 = ar ? A.x + aw_ : A.x;
      const x2 = ar ? B.x : B.x + bw;
      const line = svg("path", { d: `M${fix(x1, 1)} ${fix(y1, 1)}C${fix((x1 + x2) / 2, 1)} ${fix(y1, 1)} ${fix((x1 + x2) / 2, 1)} ${fix(y2, 1)} ${fix(x2, 1)} ${fix(y2, 1)}`, className: "pd-link" });
      art.append(line);
      links.push({ line, step: si });
    }
  });

  const last = steps.length - 1;
  const home = e.grids.map((_, gi) => states.find((m) => m.has(gi))?.get(gi));
  return (st) => {
    const [i, j, k0] = between(steps.length, st.frame);
    const k = smooth(k0);
    const now = Math.round(Math.min(last, Math.max(0, st.frame)));
    const showSql = clamp01(st.reveal / 0.55);
    const showTables = clamp01((st.reveal - 0.55) / 0.45);
    const focus = Math.round(st.focus);
    const lit = new Set(focus >= 1 ? [focus - 1] : steps[now]!.lines);
    lineEls.forEach(({ row, badge }, li) => {
      ctx.wr.style(row, "opacity", fix(clamp01(showSql * lines.length - li)));
      ctx.wr.cls(row, "is-now", lit.has(li));
      const f = first[li]!;
      ctx.wr.style(badge, "opacity", f >= 0 && now >= f ? "1" : "0");
      ctx.wr.cls(badge, "is-now", f >= 0 && lit.has(li));
    });
    grids.forEach((g, gi) => {
      const A = states[i]!.get(gi);
      const B = states[j]!.get(gi);
      // A hidden grid still gets its whole state written (from the first step that shows it): no frame depends on
      // the frames before it.
      const near = (now === i ? A : B) ?? A ?? B ?? home[gi];
      // A grid that leaves fades out in the first half of the move, one that arrives in the second: never both at once.
      const op = A && B ? 1 : A ? clamp01(1 - 2 * k) : B ? clamp01(2 * k - 1) : 0;
      ctx.wr.style(g.el, "opacity", fix(op * showTables));
      if (!near) return;
      const x = A && B ? lerp(A.x, B.x, k) : near.x;
      const y = A && B ? lerp(A.y, B.y, k) : near.y;
      ctx.wr.style(g.el, "transform", `translate(${px(x)},${px(y)})`);
      ctx.wr.style(g.el, "height", `${fix(near.h, 2)}em`);
      ctx.wr.cls(g.el, "is-res", steps[now]!.kind === "result" && near === states[now]!.get(gi));
      const colOp = near.colOp.map((c, ci) => (A && B ? lerp(A.colOp[ci]!, B.colOp[ci]!, k) : c));
      g.head.forEach((hc, ci) => {
        ctx.wr.style(hc, "opacity", fix(colOp[ci]!));
        ctx.wr.cls(hc, "is-lit", near.lit.has(ci));
        const arrow = near.sort.get(ci) ?? "";
        if (g.arrows[ci]!.textContent !== arrow) g.arrows[ci]!.textContent = arrow;
      });
      g.rows.forEach(({ row, cells }, ri) => {
        const a = A?.rows.get(ri);
        const b = B?.rows.get(ri);
        const opA = A ? a?.op ?? 0 : b?.op ?? 0;
        const opB = B ? b?.op ?? 0 : a?.op ?? 0;
        const yA = (a ?? b)?.y ?? 0;
        const yB = (b ?? a)?.y ?? 0;
        const r = (now === i ? a : b) ?? a ?? b;
        ctx.wr.style(row, "opacity", fix(lerp(opA, opB, k)));
        ctx.wr.style(row, "transform", `translateY(${px(lerp(yA, yB, k))})`);
        // The whole class list at once, so its order never depends on the frames before.
        ctx.wr.attr(row, "class", `pd-r${r?.out ? " is-out" : ""}${r && r.grp >= 0 ? ` pd-k${r.grp % 4}` : ""}`);
        cells.forEach((c, ci) => {
          ctx.wr.style(c, "opacity", fix(colOp[ci]!));
          ctx.wr.cls(c, "is-lit", near.lit.has(ci));
        });
      });
      ctx.wr.style(g.cut, "opacity", near.cut >= 0 ? "1" : "0");
      if (near.cut >= 0) ctx.wr.style(g.cut, "top", `${fix(HEAD + near.cut * ROW, 2)}em`);
    });
    for (const l of links) {
      const w = (l.step === i ? clamp01(1 - 2 * k) : 0) + (l.step === j && j !== i ? clamp01(2 * k - 1) : 0);
      ctx.wr.style(l.line, "opacity", fix(clamp01(w) * showTables));
    }
  };
};
