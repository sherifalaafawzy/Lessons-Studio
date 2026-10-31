import type { Element } from "@lessonstudio/spec";
import { h, rich } from "../../dom.ts";
import { clamp01, fix } from "../../motion.ts";
import type { KitRenderer } from "../../templates/types.ts";
import { between, ems, lerp, px, setText, shown, smooth, valueNodes, type Value } from "./util.ts";

type S = Extract<Element, { type: "sheet" }>;
type Cell = S["cells"][string];

const ROW = 1.45;
const HEAD = 1.2;
const NUM = 1.7;
const BAR = 1.5;

const at = (a: string): [number, number] => [a.charCodeAt(0) - 65, Number(a.slice(1)) - 1];

/**
 * A spreadsheet: column letters and row numbers, the formula bar (the selected cell's address and formula), values,
 * a selection that moves frame by frame (a formula filling down), cells that appear, change or are struck out, and
 * issues outlined (danger until fixed, then ok; lit with a label by `focus`). Right-to-left lessons run right to left,
 * column A on the right, as spreadsheets do there; numbers and formulas stay left to right inside their cells.
 */
export const sheet: KitRenderer = (el, box, ctx) => {
  const e = el as S;
  const W = e.w ?? 900;
  const H = e.h ?? 500;
  const rtl = ctx.dir === "rtl";
  const bar = e.bar !== false;
  const text = (v: Value | undefined, t: Cell["t"] | undefined): string => (t !== undefined ? ctx.t(t) : shown(v, e.words, ctx));

  // Column widths in em (or the given ones), then the text size that fits.
  const base = e.size ?? 42;
  const cellsIn = (col: number): Cell[] => Object.entries(e.cells).filter(([a]) => at(a)[0] === col).map(([, c]) => c);
  const wEm = Array.from({ length: e.cols }, (_, c) => (e.widths ? e.widths[c]! / base : Math.max(2.6, ...cellsIn(c).flatMap((x) => [text(x.v, x.t), x.to ? text(x.to.v ?? x.v, x.to.t ?? x.t) : ""].map((s) => ems(s) * (x.b || x.to ? 1.1 : 1) + 0.9)))));
  const totalEm = NUM + wEm.reduce((a, b) => a + b, 0);
  const heightEm = (bar ? BAR + 0.35 : 0) + HEAD + e.rows * ROW;
  // Issue labels go beside the sheet, at the end side, so they never cover a cell.
  const tagEm = Math.max(0, ...(e.issues ?? []).map((s) => (s.label ? ems(ctx.t(s.label)) * 0.875 * 1.08 + 1.4 : 0)));
  const size = Math.min(base, W / (totalEm + tagEm), H / heightEm);
  const start = (W - (totalEm + tagEm) * size) / 2;
  const left = rtl ? W - start - totalEm * size : start;
  const top = bar ? (BAR + 0.35) * size : 0;
  // Column c's left edge in stage pixels (column A on the right in right-to-left lessons).
  const xs: number[] = [];
  let x = NUM;
  for (let c = 0; c < e.cols; c++) { xs.push(x); x += wEm[c]!; }
  const colX = (c: number): number => left + (rtl ? (totalEm - xs[c]! - wEm[c]!) : xs[c]!) * size;
  const numX = left + (rtl ? totalEm - NUM : 0) * size;
  const rowY = (r: number): number => top + (HEAD + r * ROW) * size;
  const rect = (a: string, b = a): { x: number; y: number; w: number; h: number } => {
    const [c1, r1] = at(a);
    const [c2, r2] = at(b);
    const xA = Math.min(colX(Math.min(c1, c2)), colX(Math.max(c1, c2)));
    const xB = Math.max(colX(Math.min(c1, c2)) + wEm[Math.min(c1, c2)]! * size, colX(Math.max(c1, c2)) + wEm[Math.max(c1, c2)]! * size);
    return { x: xA, y: rowY(Math.min(r1, r2)), w: xB - xA, h: (Math.abs(r2 - r1) + 1) * ROW * size };
  };
  const place = (n: HTMLElement, r: { x: number; y: number; w: number; h: number }): void => { n.style.cssText += `;left:${px(r.x)};top:${px(r.y)};width:${px(r.w)};height:${px(r.h)}`; };

  const root = h("div", { className: "pd-s" });
  root.style.fontSize = px(size);

  // The formula bar: the address, fx, the formula (left to right).
  const nameBox = h("span", { className: "pd-nb", dir: "ltr" });
  const formula = h("span", { className: "pd-ff" });
  const barEl = h("div", { className: "pd-fb", dir: ctx.dir }, nameBox, h("span", { className: "pd-fx" }, "fx"), formula);
  if (bar) { place(barEl, { x: left, y: 0, w: totalEm * size, h: BAR * size }); root.append(barEl); }

  // Headers: the corner, the letters and the row numbers.
  const letters = Array.from({ length: e.cols }, (_, c) => {
    const n = h("div", { className: "pd-sh" }, String.fromCharCode(65 + c));
    place(n, { x: colX(c), y: top, w: wEm[c]! * size, h: HEAD * size });
    root.append(n);
    return n;
  });
  const corner = h("div", { className: "pd-sh" });
  place(corner, { x: numX, y: top, w: NUM * size, h: HEAD * size });
  root.append(corner);
  const numbers = Array.from({ length: e.rows }, (_, r) => {
    const n = h("div", { className: "pd-sh" }, String(r + 1));
    place(n, { x: numX, y: rowY(r), w: NUM * size, h: ROW * size });
    root.append(n);
    return n;
  });

  // Cells: every one of the grid (blank ones too, for the lines), with their value now and after a change.
  const cells: { el: HTMLElement; row: number; c?: Cell; now?: HTMLElement; next?: HTMLElement }[] = [];
  for (let r = 0; r < e.rows; r++) {
    for (let c = 0; c < e.cols; c++) {
      const a = String.fromCharCode(65 + c) + (r + 1);
      const cell = e.cells[a];
      const n = h("div", { className: "pd-sc" });
      place(n, { x: colX(c), y: rowY(r), w: wEm[c]! * size, h: ROW * size });
      const item: (typeof cells)[number] = { el: n, row: r, ...(cell ? { c: cell } : {}) };
      const span = (v: Value | undefined, t: Cell["t"] | undefined): HTMLElement => {
        // One inline span inside the flex box, so the spaces between words stay.
        const s = h("span", { className: `pd-v${typeof v === "number" ? " pd-num" : ""}` }, h("span", null, ...(t !== undefined ? rich(ctx.t(t), rtl) : valueNodes(v, shown(v, e.words, ctx), rtl))));
        n.append(s);
        return s;
      };
      if (cell) {
        if (cell.b) n.classList.add("is-b");
        item.now = span(cell.v, cell.t);
        if (cell.to) item.next = span(cell.to.v ?? cell.v, cell.to.t);
      }
      root.append(n);
      cells.push(item);
    }
  }

  // Issues, outlined, with their labels; the selection on top.
  const issues = (e.issues ?? []).map((s) => {
    const [a, b] = s.cells.split(":") as [string, string?];
    const r = rect(a, b);
    const o = h("div", { className: `pd-is pd-is-${s.kind}` });
    place(o, r);
    root.append(o);
    let tag: HTMLElement | null = null;
    if (s.label) {
      tag = h("div", { className: "pd-tag", dir: ctx.dir }, ...rich(ctx.t(s.label), rtl));
      // Beside the sheet, at its end side, level with the issue's first row.
      const edge = rtl ? W - left + 0.5 * size : left + (totalEm + 0.5) * size;
      tag.style.cssText += `;top:${px(r.y + (ROW * size) / 2 - 0.62 * size)};${rtl ? "right" : "left"}:${px(edge)}`;
      root.append(tag);
    }
    return { s, o, tag };
  });
  const sel = h("div", { className: "pd-sel", dir: ctx.dir }, h("span", { className: "pd-fh" }));
  root.append(sel);
  box.append(root);

  const frames = e.frames ?? [];
  const lit = (a: string | null | undefined): string => (a ? a : "");
  // A formula as shown in the lesson's language: its "…" text through `words`.
  const showFormula = (f: string): string => f.replace(/"([^"]*)"/g, (m, s: string) => (e.words?.[s] !== undefined ? `"${ctx.t(e.words[s]!)}"` : m));

  return (st) => {
    const t = Math.max(0, st.frame);
    const rows = e.rows + 1;
    const rowOp = (r: number): number => clamp01(st.reveal * rows - r);
    letters.forEach((n) => ctx.wr.style(n, "opacity", fix(rowOp(0))));
    ctx.wr.style(corner, "opacity", fix(rowOp(0)));
    if (bar) ctx.wr.style(barEl, "opacity", fix(rowOp(0)));
    numbers.forEach((n, r) => ctx.wr.style(n, "opacity", fix(rowOp(r + 1))));
    for (const it of cells) {
      ctx.wr.style(it.el, "opacity", fix(rowOp(it.row + 1)));
      const c = it.c;
      if (!c || !it.now) continue;
      const appear = clamp01(t - (c.at ?? 0) + 1);
      const change = c.to ? clamp01(t - c.to.at + 1) : 0;
      ctx.wr.style(it.now, "opacity", fix(appear * (1 - change)));
      if (it.next) ctx.wr.style(it.next, "opacity", fix(appear * change));
      // The whole class list at once, so its order never depends on the frames before.
      ctx.wr.attr(it.el, "class", `pd-sc${c.b ? " is-b" : ""}${c.out !== undefined && t >= c.out - 0.5 ? " is-out" : ""}${c.to && t >= c.to.at - 0.5 ? " is-new" : ""}`);
    }
    const focus = Math.round(st.focus);
    issues.forEach(({ s, o, tag }, k) => {
      ctx.wr.attr(o, "class", `pd-is pd-is-${s.kind}${s.fixed !== undefined && t >= s.fixed - 0.5 ? " is-fixed" : ""}${focus === k + 1 ? " is-on" : ""}`);
      ctx.wr.style(o, "opacity", fix(rowOp(at(s.cells.split(":")[0]!)[1] + 1)));
      if (tag) ctx.wr.style(tag, "opacity", focus === k + 1 ? "1" : "0");
    });
    // The selection: between this frame's cell and the next one's; the bar shows the nearer one.
    if (!frames.length) { ctx.wr.style(sel, "opacity", "0"); if (bar) { setText(nameBox, ""); setText(formula, ""); } return; }
    const [i, j, k0] = between(frames.length, t);
    const a = frames[i];
    const b = frames[j] ?? a;
    const near = lit(k0 < 0.5 ? a : b) || lit(a) || lit(b);
    ctx.wr.style(sel, "opacity", fix(near ? clamp01(st.reveal * 2 - 1) : 0));
    for (let c = 0; c < e.cols; c++) ctx.wr.cls(letters[c]!, "is-sel", !!near && at(near)[0] === c);
    numbers.forEach((n, r) => ctx.wr.cls(n, "is-sel", !!near && at(near)[1] === r));
    if (bar) {
      const cell = near ? e.cells[near] : undefined;
      setText(nameBox, near);
      const changed = !!cell?.to && t >= cell.to.at - 0.5;
      setText(formula, cell?.f ? showFormula(cell.f) : cell ? text(changed ? cell.to!.v ?? cell.v : cell.v, changed ? cell.to!.t ?? cell.t : cell.t) : "");
      ctx.wr.attr(formula, "dir", cell?.f || typeof cell?.v === "number" ? "ltr" : "auto");
      ctx.wr.cls(formula, "is-f", !!cell?.f);
    }
    if (!near) return;
    const ra = rect(lit(a) || near);
    const rb = rect(lit(b) || near);
    const q = smooth(k0);
    const rn = rect(near);
    ctx.wr.style(sel, "transform", `translate(${px(lerp(ra.x, rb.x, q))},${px(lerp(ra.y, rb.y, q))})`);
    ctx.wr.style(sel, "width", px(rn.w));
    ctx.wr.style(sel, "height", px(rn.h));
  };
};
