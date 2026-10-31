import type { Element } from "@lessonstudio/spec";
import { h } from "../../dom.ts";
import { clamp01, fix } from "../../motion.ts";
import type { KitRenderer } from "../../templates/types.ts";
import { at, est, GROUP, mark, num, panel, put, step, stripH } from "./util.ts";

type K = Extract<Element, { type: "knapsack" }>;

/**
 * A knapsack. "bag": the items as rows (weight, value, value per weight), the bag as a bar that fills from the bottom
 * with its limit, and the totals; the layout follows the language, numbers stay left to right. "table": the dynamic
 * programming table (always left to right, like a matrix), filled cell by cell with the two cells each one is read
 * from, then the best load read back. `frame`: the step (between frames the bar's blocks grow and the cells fill);
 * `focus` rings the n-th item; `reveal` brings the rows in.
 */
export const knapsack: KitRenderer = (el, box, ctx) => {
  const e = el as K;
  const W = e.w ?? 1000;
  const H = e.h ?? 420;
  const rtl = ctx.dir === "rtl";
  const fr = e.frames ?? [];
  const hasNotes = fr.some((f) => f.note);
  const CH = H - (hasNotes ? stripH(W) + 12 : 0);
  const n = e.items.length;
  const root = h("div", { className: "po po-bg" });
  const pn = hasNotes ? panel(ctx, false, false) : null;
  if (pn) root.append(at(pn.el, 0, H - stripH(W), W, stripH(W)));
  const unit = ctx.t(e.unit);
  box.append(root);
  return e.show === "table" ? table(e, root, ctx, W, CH, pn) : bag(e, root, ctx, W, CH, pn, unit, rtl, n);
};

type Pn = ReturnType<typeof panel> | null;
type Ctx = Parameters<KitRenderer>[2];
type Paint = ReturnType<KitRenderer>;

function bag(e: K, root: HTMLElement, ctx: Ctx, W: number, CH: number, pn: Pn, unit: string, rtl: boolean, n: number): Paint {
  const fr = e.frames ?? [];
  const vunit = ctx.t(e.vunit);
  const per = e.per;
  // Columns: the items list, the bag, the totals (mirrored in right-to-left languages).
  const totW = Math.min(270, W * 0.25);
  const barW = 120;
  const X = (x: number, w: number): number => (rtl ? W - x - w : x);
  // A number column is as wide as its numbers or its header's longest word; a longer header wraps to two lines.
  const word = (s: string): number => Math.max(...s.split(" ").map((x) => est(x, 32)));
  const cols: { head: string; vals: string[] }[] = [
    { head: unit, vals: e.items.map((it) => num(it.w)) },
    { head: vunit, vals: e.items.map((it) => num(it.v)) },
    ...(per ? [{ head: ctx.t(e.perLabel) || `/ ${num(per)}`, vals: e.items.map((it) => num((it.v / it.w) * per)) }] : []),
  ];
  const widths = cols.map((c) => Math.max(word(c.head), est(c.head, 32) / 2, ...c.vals.map((v) => est(v, 34))) + 26);
  // When the list doesn't fit beside the bag (an upright or square stage): the list on top, the bag and totals under it.
  const need = 80 + Math.max(...e.items.map((it) => est(ctx.t(it.label), 34))) + widths.reduce((a, b) => a + b, 0);
  const narrow = W - totW - barW - 60 < need;
  const listW = narrow ? W : W - totW - barW - 60;
  const listH = narrow ? CH * 0.56 : CH;
  const headH = cols.some((c, j) => est(c.head, 32) + 20 > widths[j]!) ? 84 : 48;
  const rowH = Math.min(60, (listH - headH) / n);
  const cell = (s: string, w: number | null, cls: string): HTMLElement => {
    const d = h("div", { className: cls, dir: ctx.dir });
    if (w !== null) d.style.width = `${fix(w, 1)}px`;
    put(d, s, rtl);
    return d;
  };
  const head = at(h("div", { className: "po-kh", dir: ctx.dir }, h("div", { className: "po-ks" }), cell("", null, "po-kn"), ...cols.map((c, j) => cell(c.head, widths[j]!, "po-kv"))), X(0, listW), 0, listW, headH);
  root.append(head);
  const rows = e.items.map((it, i) => {
    const sw = h("div", { className: "po-ks" }, mark("ok", "po-ok"), mark("x", "po-no"));
    sw.style.setProperty("--po-t", `var(--ls-${GROUP[i % GROUP.length]})`);
    const r = at(h("div", { className: "po-kr", dir: ctx.dir }, sw, cell(ctx.t(it.label), null, "po-kn"), ...cols.map((c, j) => cell(c.vals[i]!, widths[j]!, "po-kv"))), X(0, listW), headH + i * rowH, listW, rowH - 6);
    root.append(r);
    return r;
  });

  // The bag: blocks stacked from the bottom, in item order, each as tall as its weight.
  const max = Math.max(e.cap, ...fr.map((f) => e.items.reduce((s, it, i) => s + ("in".includes(f.in?.[i] ?? ".") ? it.w : 0), 0)));
  const top = narrow ? listH + 56 : 50;
  const barH = CH - top - 6;
  const k = barH / max;
  const bx = X(narrow ? 40 : listW + 30, barW);
  const bar = at(h("div", { className: "po-bag" }), bx, top + barH - e.cap * k, barW, e.cap * k);
  const capL = at(h("div", { className: "po-cap", dir: ctx.dir }), bx + barW / 2, top + barH - e.cap * k - 44);
  put(capL, `${num(e.cap)} ${unit}`, rtl);
  root.append(bar, capL);
  const blocks = e.items.map((it, i) => {
    const b = at(h("div", { className: "po-blk" }), bx + 6, top + barH - it.w * k, barW - 12, it.w * k);
    b.style.setProperty("--po-t", `var(--ls-${GROUP[i % GROUP.length]})`);
    b.style.setProperty("--po-on", `var(--ls-${i % GROUP.length === 0 || i % GROUP.length === 2 ? "on-accent" : "bg"})`);
    if (it.w * k >= 42) b.textContent = num(it.w);
    root.append(b);
    return b;
  });
  const tot = at(h("div", { className: "po-kt", dir: ctx.dir }, h("div", { className: "po-kw" }), h("div", { className: "po-kp" })), X(narrow ? barW + 90 : listW + barW + 60, narrow ? W - barW - 90 : totW), top, narrow ? W - barW - 90 : totW, barH);
  root.append(tot);
  const [tw, tp] = [tot.firstChild as HTMLElement, tot.lastChild as HTMLElement];
  const inBag = (f: number, i: number): boolean => "in".includes(fr[f]?.in?.[i] ?? ".");
  const stack = (f: number): number[] => { let s = 0; return e.items.map((it, i) => { const o = s; if (inBag(f, i)) s += it.w; return o; }); };

  return (st) => {
    const nf = fr.length;
    const f = nf ? Math.max(0, Math.min(nf - 1, st.frame)) : 0;
    const k0 = Math.floor(f), k1 = Math.min(Math.max(0, nf - 1), k0 + 1), t = f - k0;
    const ki = nf ? step(nf, f) : 0;
    const s0 = stack(k0), s1 = stack(k1);
    const shown = st.reveal * (n + 1);
    const focus = Math.round(st.focus);
    ctx.wr.style(head, "opacity", fix(clamp01(shown)));
    let weight = 0, value = 0;
    rows.forEach((r, i) => {
      const s = fr[ki]?.in?.[i] ?? ".";
      ctx.wr.attr(r, "class", `po-kr s-${s}${focus === i + 1 ? " is-on" : ""}`);
      ctx.wr.style(r, "opacity", fix(clamp01(shown - i - 1)));
      if ("in".includes(s)) { weight += e.items[i]!.w; value += e.items[i]!.v; }
      // A block grows in (or shrinks out) between frames, and slides when one under it leaves.
      const a = inBag(k0, i) ? 1 : 0, b = inBag(k1, i) ? 1 : 0;
      const g = a + (b - a) * t;
      const off = (inBag(k0, i) ? s0[i]! : s1[i]!) + ((inBag(k1, i) ? s1[i]! : s0[i]!) - (inBag(k0, i) ? s0[i]! : s1[i]!)) * t;
      ctx.wr.style(blocks[i]!, "transform", `translateY(${fix(-off * k, 1)}px) scaleY(${fix(g, 3)})`);
      ctx.wr.style(blocks[i]!, "opacity", g > 0.001 ? "1" : "0");
      ctx.wr.cls(blocks[i]!, "is-on", focus === i + 1);
    });
    const over = weight > e.cap;
    ctx.wr.cls(bar, "is-over", over);
    ctx.wr.cls(tw, "is-over", over);
    put(tw, `${num(weight)} ${unit}`, ctx.dir === "rtl");
    put(tp, `${num(value)} ${ctx.t(e.vunit)}`, ctx.dir === "rtl");
    if (pn) pn.set(ctx.t(fr[ki]?.note), "", "");
  };
}

function table(e: K, root: HTMLElement, ctx: Ctx, W: number, CH: number, pn: Pn): Paint {
  const fr = e.frames ?? [];
  const rtl = ctx.dir === "rtl";
  const t = e.table ?? [];
  const step0 = e.step ?? 1;
  const C = t[0]?.length ?? 0;
  const R = t.length;
  root.setAttribute("dir", "ltr");
  const names = ["—", ...e.items.map((it) => ctx.t(it.label))];
  // Too narrow for the names and the full capacities (an upright stage): the rows are numbered, the names listed above
  // the table, and the columns count steps ("× 100").
  const wide = Math.min(320, Math.max(...names.map((s, i) => est(s, 32) + (i ? est(num(e.items[i - 1]!.w), 32) : 0))) + 44);
  const narrow = (W - wide) / C < 64;
  const lw = narrow ? est(`×${num(step0)}`, 32) + 24 : wide;
  const cw = (W - lw) / C;
  const keyH = narrow ? 44 * Math.ceil(e.items.length / 2) + 12 : 0;
  const rh = Math.min(58, (CH - keyH) / (R + 1));
  const top = keyH + (CH - keyH - rh * (R + 1)) / 2;
  if (narrow) {
    e.items.forEach((it, i) => {
      const k = at(h("div", { className: "po-th po-tr", dir: ctx.dir }), (rtl ? 1 - (i % 2) : i % 2) * (W / 2), Math.floor(i / 2) * 44, W / 2, 44);
      put(k, `${i + 1}  ${ctx.t(it.label)}`, rtl);
      const w = h("span", { className: "po-tw" });
      w.textContent = num(it.w);
      k.append(w);
      root.append(k);
    });
  }
  const corner = at(h("div", { className: "po-th po-tc", dir: narrow ? "ltr" : ctx.dir }), 0, top, lw, rh);
  put(corner, narrow ? `×${num(step0)}` : ctx.t(e.unit), rtl);
  root.append(corner);
  const heads = Array.from({ length: C }, (_, c) => {
    const d = at(h("div", { className: "po-th" }), lw + c * cw, top, cw, rh);
    d.textContent = num(narrow ? c : c * step0);
    root.append(d);
    return d;
  });
  const labels = names.map((s, r) => {
    const d = at(h("div", { className: "po-th po-tr", dir: ctx.dir }), 0, top + (r + 1) * rh, lw, rh);
    put(d, narrow && r ? String(r) : s, rtl);
    if (r && !narrow) { const w = h("span", { className: "po-tw" }); w.textContent = num(e.items[r - 1]!.w); d.append(w); }
    root.append(d);
    return d;
  });
  const cells = t.map((row, r) => row.map((v, c) => {
    const d = at(h("div", { className: "po-td" }), lw + c * cw + 2, top + (r + 1) * rh + 2, cw - 4, rh - 4);
    d.textContent = num(v);
    root.append(d);
    return d;
  }));
  const fillOf = (k: number): number => fr[k]?.fill ?? 0;
  return (st) => {
    const nf = fr.length;
    const f = nf ? Math.max(0, Math.min(nf - 1, st.frame)) : 0;
    const k0 = Math.floor(f), k1 = Math.min(Math.max(0, nf - 1), k0 + 1);
    const fill = nf ? fillOf(k0) + (fillOf(k1) - fillOf(k0)) * (f - k0) : R * C;
    const ki = nf ? step(nf, f) : 0;
    const shown = st.reveal * (R + 1);
    const trace = new Set((fr[ki]?.trace ?? []).map(([r, c]) => r * C + c));
    // The cell being filled now, and the two it is read from: the one above (leave the item) and the one above and to
    // the left by the item's weight (take it).
    const now = fill < R * C && fill % 1 > 1e-6 ? Math.floor(fill) : -1;
    const nr = Math.floor(now / C), nc = now % C;
    const wcols = nr >= 1 ? Math.round(e.items[nr - 1]!.w / step0) : 0;
    const from = now >= C ? new Set([now - C, ...(nc >= wcols ? [now - C - wcols] : [])]) : new Set<number>();
    ctx.wr.style(corner, "opacity", fix(clamp01(shown)));
    heads.forEach((d) => ctx.wr.style(d, "opacity", fix(clamp01(shown))));
    labels.forEach((d, r) => ctx.wr.style(d, "opacity", fix(clamp01(shown - r - 1))));
    const focus = Math.round(st.focus);
    cells.forEach((row, r) => row.forEach((d, c) => {
      const i = r * C + c;
      ctx.wr.style(d, "opacity", fix(Math.min(i === now ? 1 : clamp01(fill - i), clamp01(shown - r - 1))));
      ctx.wr.attr(d, "class", `po-td${i === now ? " is-now" : ""}${from.has(i) ? " is-from" : ""}${trace.has(i) ? " is-tr" : ""}${focus >= 1 && focus === r ? " is-on" : ""}`);
    }));
    if (pn) pn.set(ctx.t(fr[ki]?.note), "", "");
  };
}
