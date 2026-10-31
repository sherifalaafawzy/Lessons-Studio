import type { Element } from "@lessonstudio/spec";
import { h, svg } from "../../dom.ts";
import { clamp01, fix } from "../../motion.ts";
import type { KitRenderer } from "../../templates/types.ts";
import { at, est, layer, mark, num, panel, put, stripH } from "./util.ts";

type T = Extract<Element, { type: "searchtree" }>;

/**
 * A search tree growing in the order the search visits it (backtracking, branch and bound). Each node shows a partial
 * choice and its bound; the branch taken is written on its line; pruned nodes are greyed with ✗, dead ends crossed in
 * danger, and the best plan so far is lit. `frame` k shows steps 0 … k (the next one fades in between frames) with step
 * k as the current one and its note; `reveal` brings the steps in the same order; `focus` rings step n. Mirrored in
 * right-to-left languages (the first branch on the reading side) unless `fixed`.
 */
export const searchtree: KitRenderer = (el, box, ctx) => {
  const e = el as T;
  const W = e.w ?? 1000;
  const H = e.h ?? 460;
  const rtl = ctx.dir === "rtl";
  const flip = ctx.mirror && !e.fixed;
  const S = e.steps;
  const n = S.length;
  const kids: number[][] = S.map(() => []);
  const depth: number[] = [];
  S.forEach((s, i) => { depth[i] = i ? depth[s.p]! + 1 : 0; if (i) kids[s.p]!.push(i); });
  // Leaves take the slots in turn; a parent sits over the middle of its children.
  const xs: number[] = new Array<number>(n).fill(0);
  let slots = 0;
  const place = (i: number): void => {
    if (!kids[i]!.length) { xs[i] = slots++ + 0.5; return; }
    kids[i]!.forEach(place);
    xs[i] = (xs[kids[i]![0]!]! + xs[kids[i]![kids[i]!.length - 1]!]!) / 2;
  };
  if (n) place(0);
  const levels = Math.max(...depth) + 1;
  const hasPanel = S.some((s) => s.note || s.best);
  const avail = H - (hasPanel ? stripH(W) + 12 : 0);
  const nh = 52;
  const gap = Math.min(96, (avail - levels * nh) / Math.max(1, levels - 1));
  const top = (avail - levels * nh - (levels - 1) * gap) / 2;
  const sw = W / Math.max(1, slots);
  const text = (i: number): string => `${ctx.t(S[i]!.label)}${S[i]!.sub ? ` ${ctx.t(S[i]!.sub)}` : ""}`;
  const nw = Math.min(240, sw - 12, Math.max(100, ...S.map((_, i) => est(text(i), 32) + (S[i]!.mark ? 56 : 30))));
  const X = (i: number): number => (flip ? W - xs[i]! * sw : xs[i]! * sw);
  const Y = (i: number): number => top + depth[i]! * (nh + gap);

  const root = h("div", { className: "po po-t" });
  const s = layer(W, H);
  root.append(s);
  const lines = S.map((st, i) => {
    if (!i) return null;
    const l = svg("line", { x1: fix(X(st.p), 1), y1: fix(Y(st.p) + nh, 1), x2: fix(X(i), 1), y2: fix(Y(i), 1), className: "po-tln" });
    s.append(l);
    return l;
  });
  const edges = S.map((st, i) => {
    if (!i || !st.edge) return null;
    const mx = (X(st.p) + X(i)) / 2, my = (Y(st.p) + nh + Y(i)) / 2;
    const d = at(h("div", { className: `po-te ${X(i) < X(st.p) - 1 ? "is-l" : X(i) > X(st.p) + 1 ? "is-r" : ""}`, dir: ctx.dir }), mx, my);
    put(d, ctx.t(st.edge), rtl);
    root.append(d);
    return d;
  });
  const nodes = S.map((st, i) => {
    const lb = h("span", null);
    put(lb, ctx.t(st.label), rtl);
    // A value and its bound ("42 ≤ 68") read left to right like maths; a node with words follows the language.
    const d = h("div", { className: "po-tn", dir: /[؀-ۿ]/.test(text(i)) ? ctx.dir : "ltr" }, lb);
    if (st.sub) { const b = h("span", { className: "po-tb" }); put(b, ctx.t(st.sub), rtl); d.append(b); }
    if (st.mark === "x" || st.mark === "d") d.append(mark("x"));
    if (st.mark === "l") d.append(mark("ok"));
    at(d, X(i) - nw / 2, Y(i), nw, nh);
    root.append(d);
    return d;
  });
  const pn = hasPanel ? panel(ctx, false, S.some((x) => x.best)) : null;
  if (pn) root.append(at(pn.el, 0, H - stripH(W), W, stripH(W)));
  box.append(root);

  return (st) => {
    const f = Math.max(0, Math.min(n - 1, st.frame));
    const cur = Math.round(f);
    const rv = st.reveal * n;
    const focus = Math.round(st.focus);
    let best = -1;
    for (let i = 0; i <= cur; i++) if (S[i]!.best) best = i;
    nodes.forEach((d, i) => {
      const o = fix(Math.min(clamp01(f - i + 1), clamp01(rv - i)));
      const m = S[i]!.mark;
      ctx.wr.style(d, "opacity", o);
      ctx.wr.attr(d, "class", `po-tn${m ? ` s-${m}` : ""}${i === cur ? " is-now" : ""}${i === best ? " is-best" : ""}${focus === i + 1 ? " is-on" : ""}`);
      if (lines[i]) ctx.wr.style(lines[i]!, "opacity", o);
      if (lines[i]) ctx.wr.cls(lines[i]!, "is-x", m === "x" || m === "d");
      if (edges[i]) ctx.wr.style(edges[i]!, "opacity", o);
    });
    if (pn) pn.set(ctx.t(S[cur]?.note), ctx.t(e.totalLabel), best >= 0 ? num(S[best]!.val ?? 0) : "");
  };
};
