import type { Element } from "@lessonstudio/spec";
import { h } from "../../dom.ts";
import { clamp01, fix } from "../../motion.ts";
import type { KitRenderer } from "../../templates/types.ts";
import { at, est, num, panel, put, step, stripH } from "./util.ts";

type S = Extract<Element, { type: "schedule" }>;
type Place = { x: number; y: number } | null;

/**
 * A timetable grid (rows × columns, in the lesson's direction: Arabic days and periods run right to left) or a Gantt
 * chart (rows × time; time always left to right). Items move between places as a solver works: `frame` blends their
 * places (they slide, fade in and out) and rounds their states; `focus` rings the n-th item; `reveal` brings the rows
 * in from the top.
 */
export const schedule: KitRenderer = (el, box, ctx) => {
  const e = el as S;
  const W = e.w ?? 1000;
  const H = e.h ?? 420;
  const rtl = ctx.dir === "rtl";
  const gantt = e.kind === "gantt";
  const flip = rtl && !gantt;
  const fr = e.frames ?? [];
  const hasTotal = fr.some((f) => f.total !== undefined);
  const hasPanel = hasTotal || fr.some((f) => f.note);
  const R = e.rows.length;
  const C = e.cols?.length ?? 1;
  const lw = Math.min(260, Math.max(96, ...e.rows.map((t) => est(ctx.t(t), 34) + 34)));
  const hh = gantt ? 0 : 56;
  const axis = gantt ? 52 : 0;
  const bottom = hasPanel ? stripH(W) + 12 : 0;
  const rh = (H - hh - axis - bottom) / R;
  const cw = (W - lw) / C;
  const [t0, t1] = e.span ?? [0, 1];
  const tw = W - lw - 16;
  const T = (t: number): number => lw + ((t - t0) / (t1 - t0)) * tw;
  const colX = (c: number): number => (flip ? W - lw - (c + 1) * cw : lw + c * cw);
  const rowY = (r: number): number => hh + r * rh;

  const root = h("div", { className: `po po-s${gantt ? " is-gantt" : ""}`, dir: gantt ? "ltr" : ctx.dir });
  const rowsEls: HTMLElement[][] = Array.from({ length: R }, () => []);
  const head: HTMLElement[] = [];
  e.rows.forEach((t, r) => {
    const d = at(h("div", { className: "po-rl", dir: ctx.dir }), flip ? W - lw : 0, rowY(r), lw, rh);
    put(d, ctx.t(t), rtl);
    root.append(d);
    rowsEls[r]!.push(d);
  });
  const cells: HTMLElement[][] = [];
  if (gantt) {
    e.rows.forEach((_, r) => {
      const lane = at(h("div", { className: "po-c" }), lw, rowY(r), tw, rh);
      root.append(lane);
      rowsEls[r]!.push(lane);
    });
    const most = Math.max(2, Math.floor(tw / (est(num(t1), 32) + 26)));
    const stepT = [1, 2, 5, 10, 20, 50, 100, 200, 500].find((k) => (t1 - t0) / k <= most) ?? (t1 - t0) / most;
    const ticks = e.ticks ?? Array.from({ length: Math.floor((t1 - t0) / stepT) + 1 }, (_, i) => t0 + i * stepT);
    for (const t of ticks) {
      const d = at(h("div", { className: "po-tk" }), T(t), H - bottom - axis + 6);
      d.textContent = num(t);
      root.append(d);
      head.push(d);
    }
    if (e.unit) {
      const u = at(h("div", { className: "po-tu", dir: ctx.dir }), lw - 34, H - bottom - axis + 6);
      put(u, ctx.t(e.unit), rtl);
      root.append(u);
      head.push(u);
    }
  } else {
    (e.cols ?? []).forEach((t, c) => {
      const d = at(h("div", { className: "po-h", dir: ctx.dir }), colX(c), 0, cw, hh);
      put(d, ctx.t(t), rtl);
      root.append(d);
      head.push(d);
    });
    const blocked = new Set((e.blocked ?? []).map(([r, c]) => `${r},${c}`));
    for (let r = 0; r < R; r++) {
      cells.push([]);
      for (let c = 0; c < C; c++) {
        const d = at(h("div", { className: `po-c${blocked.has(`${r},${c}`) ? " is-blk" : ""}` }), colX(c) + 3, rowY(r) + 3, cw - 6, rh - 6);
        root.append(d);
        cells[r]!.push(d);
        rowsEls[r]!.push(d);
      }
    }
  }
  // The end of the last job (Gantt): a line that moves as the schedule changes.
  const end = gantt ? at(h("div", { className: "po-end" }), 0, 0, 4, H - bottom - axis) : null;

  // Items: placed at 0,0 and moved by transform.
  const span = t1 - t0;
  const items = e.items.map((it) => {
    const w = gantt ? Math.max(8, ((it.len ?? 1) / span) * tw - 4) : cw - 18;
    const hgt = gantt ? rh - 18 : rh - 18;
    const label = h("div", { className: "po-it", dir: ctx.dir });
    // A Gantt bar too short for its name keeps only its colour.
    const name = ctx.t(it.label);
    if (!gantt || est(name, 32) + 12 <= w) put(label, name, rtl);
    const d = at(h("div", { className: "po-i", dir: ctx.dir }, label), 0, 0, w, hgt);
    if (it.sub && !gantt) { const s = h("div", { className: "po-is", dir: ctx.dir }); put(s, ctx.t(it.sub), rtl); d.append(s); }
    const tone = it.tone ?? "accent";
    d.style.setProperty("--po-t", `var(--ls-${tone})`);
    d.style.setProperty("--po-on", `var(--ls-${tone === "accent" || tone === "accent2" ? "on-accent" : "bg"})`);
    return d;
  });
  if (end) root.append(end);
  root.append(...items);

  // Where each item is at frame k (stage pixels), with a nudge for items sharing a cell or overlapping in time.
  const places = (k: number): Place[] => {
    const f = fr[k];
    const out: Place[] = [];
    const starts: number[] = [];
    const seen = new Map<string, number>();
    e.items.forEach((it, i) => {
      const p = f?.at ? f.at[i] : gantt ? it.at : it.col !== undefined ? [it.row, it.col] : null;
      if (p === null || p === undefined) { out.push(null); return; }
      let x: number, y: number;
      if (gantt) {
        const t = (starts[i] = p as number);
        const len = it.len ?? 1;
        x = T(t) + 2; y = rowY(it.row) + 9;
        // An item overlapping an earlier one in the same row (a clash) is drawn a little lower.
        if (e.items.some((o, j) => j < i && o.row === it.row && out[j] && starts[j]! < t + len - 1e-9 && t < starts[j]! + (o.len ?? 1) - 1e-9)) y += 14;
      } else {
        const [r, c] = p as [number, number];
        const key = `${r},${c}`;
        const n = seen.get(key) ?? 0;
        seen.set(key, n + 1);
        x = colX(c) + 9 + (flip ? -1 : 1) * n * 16; y = rowY(r) + 9 + n * 16;
      }
      out.push({ x, y });
    });
    return out;
  };
  const cache = new Map<number, Place[]>();
  const placesAt = (k: number): Place[] => { let p = cache.get(k); if (!p) cache.set(k, (p = places(k))); return p; };
  const pn = hasPanel ? panel(ctx, false, hasTotal) : null;
  if (pn) root.append(at(pn.el, 0, H - stripH(W), W, stripH(W)));
  box.append(root);

  return (st) => {
    const n = fr.length;
    const f = n ? Math.max(0, Math.min(n - 1, st.frame)) : 0;
    const k0 = Math.floor(f), k1 = Math.min(Math.max(0, n - 1), k0 + 1), t = f - k0;
    const ki = n ? step(n, f) : 0;
    const p0 = placesAt(k0), p1 = placesAt(k1);
    const cur = fr[ki];
    const rows = st.reveal * (R + 1);
    const focus = Math.round(st.focus);
    head.forEach((d) => ctx.wr.style(d, "opacity", fix(clamp01(rows))));
    rowsEls.forEach((list, r) => list.forEach((d) => ctx.wr.style(d, "opacity", fix(clamp01(rows - r - 1)))));
    let last = -Infinity;
    items.forEach((d, i) => {
      const a = p0[i], b = p1[i];
      const p = a && b ? { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t } : a ?? b;
      const o = (a ? 1 - t : 0) + (b ? t : 0);
      const row = e.items[i]!.row;
      ctx.wr.style(d, "opacity", fix(clamp01(o) * clamp01(rows - row - 1)));
      if (p) ctx.wr.style(d, "transform", `translate(${fix(p.x, 1)}px,${fix(p.y, 1)}px)`);
      ctx.wr.attr(d, "class", `po-i s-${cur?.state?.[i] ?? "."}${focus === i + 1 ? " is-on" : ""}`);
      if (gantt && p && o > 0.5) last = Math.max(last, p.x - 2 + ((e.items[i]!.len ?? 1) / span) * tw);
    });
    if (end) {
      ctx.wr.style(end, "opacity", last > -Infinity ? "1" : "0");
      if (last > -Infinity) ctx.wr.style(end, "transform", `translate(${fix(last, 1)}px,0)`);
    }
    if (cells.length) {
      const opts = new Set((cur?.opts ?? []).map(([r, c]) => `${r},${c}`));
      const bad = new Set((cur?.bad ?? []).map(([r, c]) => `${r},${c}`));
      cells.forEach((row, r) => row.forEach((d, c) => {
        ctx.wr.cls(d, "is-opt", opts.has(`${r},${c}`));
        ctx.wr.cls(d, "is-bad", bad.has(`${r},${c}`));
      }));
    }
    if (pn) pn.set(ctx.t(cur?.note), ctx.t(e.totalLabel), cur?.total === undefined ? "" : `${num(cur.total)}${gantt && e.unit ? ` ${ctx.t(e.unit)}` : ""}`);
  };
};
