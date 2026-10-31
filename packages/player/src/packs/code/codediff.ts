import { h, rich } from "../../dom.ts";
import { fix } from "../../motion.ts";
import type { KitRenderer } from "../../templates/types.ts";
import { BORDER, LH, PAD_Y, clamp, codeLine, codeSize, codeWidth, place, smooth, type CodediffElement } from "./util.ts";

/** The lines of `a` and `b` matched up (longest common subsequence): shared lines, lines only in a, lines only in b. */
export function diffLines(a: readonly string[], b: readonly string[]): { t: string; ia: number; ib: number }[] {
  const n = a.length;
  const m = b.length;
  const L: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i]![j] = a[i] === b[j] ? L[i + 1]![j + 1]! + 1 : Math.max(L[i + 1]![j]!, L[i]![j + 1]!);
  const out: { t: string; ia: number; ib: number }[] = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) out.push({ t: a[i++]!, ia: i - 1, ib: j++ });
    else if (i < n && (j >= m || L[i + 1]![j]! >= L[i]![j + 1]!)) out.push({ t: a[i++]!, ia: i - 1, ib: -1 });
    else out.push({ t: b[j++]!, ia: -1, ib: j - 1 });
  }
  return out;
}

/**
 * A bug and its fix: one code card showing `before`, its changed lines marked in the danger colour; as `frame` goes
 * 0 → 1 they slide out and the fixed lines slide in, in the ok colour, while the shared lines move to their new
 * places. The heading and the output under the code swap with them. Always left to right.
 */
export const codediff: KitRenderer = (el, box, ctx) => {
  const e = el as CodediffElement;
  const W = e.w ?? 1000;
  const H = e.h ?? 400;
  const A = e.before.replace(/\n+$/, "").split("\n");
  const B = e.after.replace(/\n+$/, "").split("\n");
  const rows = diffLines(A, B);
  const n = Math.max(A.length, B.length);
  const fs = 32;
  const rtl = ctx.dir === "rtl";
  const headH = e.labels ? Math.round(fs * 1.5) : 0;
  const outs = e.output ?? {};
  const outN = Math.max(...[outs.before, outs.after].map((s) => (s ? s.split("\n").length : 0)));
  const outH = outN ? Math.round(outN * fs * 1.35 + 2 * (BORDER + 8)) : 0;
  const cardH = H - headH - (outH ? outH + 14 : 0);
  const longest = rows.reduce((a, r) => (r.t.length > a.length ? r.t : a), "");
  const fitLines = [longest, ...new Array<string>(n - 1).fill("")];
  const size = e.size ?? codeSize(fitLines, W, cardH, 42);
  const lh = Math.round(size * LH);
  // The card is as wide as its code (the slide in and out takes 40 px more), and never narrower than 60% of the box.
  const cw = Math.min(W, Math.max(W * 0.6, codeWidth(fitLines, size) + 40));
  const ch = Math.min(cardH, n * lh + 2 * (PAD_Y + BORDER));
  const digits = String(n).length;

  // Headings: the bug's, then the fix's, in the same place.
  const heads: HTMLElement[] = [];
  for (const [k, cls] of [["before", "pc-hb"], ["after", "pc-ha"]] as const) {
    const t = e.labels?.[k];
    if (!t) continue;
    const hd = h("div", { className: `pc-dh pc-abs ${cls}`, dir: ctx.dir }, ...rich(ctx.t(t), rtl));
    place(hd, 0, 0, W, headH);
    box.append(hd);
    heads.push(hd);
  }
  const card = h("div", { className: "pc-code pc-abs", dir: "ltr" });
  // The card keeps to the start of the box: the right in right-to-left lessons (unless fixed), under its heading.
  const cx = ctx.mirror && !e.fixed ? W - cw : 0;
  place(card, cx, headH, cw, ch);
  card.style.fontSize = `${size}px`;
  card.style.lineHeight = `${lh}px`;
  box.append(card);
  const lines = rows.map((r) => {
    const kind = r.ia < 0 ? "pc-add" : r.ib < 0 ? "pc-del" : "";
    const x = codeLine(r.ia >= 0 ? r.ia + 1 : r.ib + 1, r.t, e.lang, digits);
    x.row.className = `pc-ln pc-dl ${kind}`;
    x.row.style.top = `${PAD_Y + (r.ia >= 0 ? r.ia : r.ib) * lh}px`;
    card.append(x.row);
    return { ...x, r };
  });
  const out: HTMLElement[] = [];
  if (outH) {
    for (const [k, cls] of [["before", "is-err"], ["after", "is-ok"]] as const) {
      const t = outs[k];
      if (!t) continue;
      const o = h("div", { className: `pc-panel pc-out pc-abs pc-dout ${cls}`, dir: "ltr" }, ...t.split("\n").map((l) => h("div", { className: "pc-ol" }, l || " ")));
      place(o, cx, headH + ch + 14, cw, outH);
      o.dataset.k = k;
      box.append(o);
      out.push(o);
    }
  }

  return (s) => {
    const k = smooth(clamp(s.frame));
    const after = k >= 0.5;
    const total = rows.length + 1;
    const fade = (mine: boolean): number => (mine ? (after ? smooth((k - 0.5) * 2) : smooth((0.5 - k) * 2)) : 0);
    heads.forEach((hd) => ctx.wr.style(hd, "opacity", fix(clamp(s.reveal * total) * fade(hd.classList.contains("pc-ha") === after))));
    const focus = Math.round(s.focus);
    lines.forEach(({ row, no, r }, i) => {
      const vis = clamp(s.reveal * total - i - 1);
      let op = 1;
      let dx = 0;
      let dy = 0;
      if (r.ib < 0) { op = 1 - k; dx = -40 * k; }
      else if (r.ia < 0) { op = k; dx = 40 * (1 - k); }
      else dy = (r.ib - r.ia) * lh * k;
      ctx.wr.style(row, "opacity", fix(op * vis));
      ctx.wr.style(row, "transform", dx || dy ? `translate(${fix(dx, 1)}px,${fix(dy, 1)}px)` : "none");
      const num = String((after ? (r.ib >= 0 ? r.ib : r.ia) : (r.ia >= 0 ? r.ia : r.ib)) + 1);
      if (no.textContent !== num) no.textContent = num;
      const line = after ? r.ib : r.ia;
      ctx.wr.cls(row, "is-focus", line >= 0 && focus === line + 1);
    });
    for (const o of out) ctx.wr.style(o, "opacity", fix(clamp(s.reveal * total - rows.length) * fade((o.dataset.k === "after") === after)));
  };
};
