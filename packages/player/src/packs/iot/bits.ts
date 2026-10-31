import type { Element } from "@lessonstudio/spec";
import type { KitRenderer } from "../../templates/types.ts";
import { ARABIC, at, clamp01, F, fix, isolate, say, svg, text, tw } from "./common.ts";

type BitsElement = Extract<Element, { type: "bits" }>;
const SUP = "⁰¹²³⁴⁵⁶⁷⁸⁹";
const sup = (n: number): string => [...String(n)].map((d) => SUP[Number(d)]).join("");

/**
 * A register of bits, most significant first and left to right in every language. Place values sit above (powers of
 * two past 8 bits), the decimal value beside, the sum of the lit place values under it. Between frames, each bit that
 * changes flips over (it squashes to a line and opens with its new value).
 */
export const bits: KitRenderer = (el, box, ctx) => {
  const e = el as BitsElement;
  box.setAttribute("dir", "ltr");
  const W = e.w ?? 900;
  const H = e.h ?? 300;
  const rtl = ctx.dir === "rtl";
  const wr = ctx.wr;
  const n = e.n;
  const frames = e.frames.length ? e.frames : [0];
  const top = 2 ** n - 1;
  const dec = e.dec !== false;
  const places = e.places !== false;
  const big = 48;
  // A narrow box puts the decimal under the bits (the sum, when shown, already ends with it).
  const under = W < 800;
  const side = dec && !under ? tw(`= ${top}`, big) + 40 : 0;
  const gap = 12;
  const bw = Math.min(120, (W - side - 10) / n - gap);
  const bh = Math.min(bw * 1.15, H * 0.42);
  const label = e.label ? ctx.t(e.label) : "";
  const notes = e.notes?.some(Boolean);
  const rows = [label ? 50 : 0, places ? 46 : 0, bh + 14, e.sum || (under && dec) ? 54 : 0, notes ? 54 : 0];
  let y = (H - rows.reduce((a, b) => a + b, 0)) / 2;
  const x0 = (W - (n * (bw + gap) - gap + side)) / 2;
  const root = svg("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}`, className: "ls-el-svg pi", direction: "ltr" });
  if (label) text(root, x0 + (n * (bw + gap) - gap) / 2, y + 36, label, rtl);
  y += rows[0]!;
  const py = y + 34;
  y += rows[1]!;
  const cy = y + bh / 2;
  const cells = Array.from({ length: n }, (_, b) => {
    const x = x0 + b * (bw + gap);
    const g = svg("g", { className: "pi-bit" });
    g.append(svg("rect", { x: fix(x, 1), y: fix(y, 1), width: fix(bw, 1), height: fix(bh, 1), rx: 12, className: "pi-s pi-cell" }));
    const v = text(g, x + bw / 2, cy + Math.min(bw, bh) * 0.2, "0", false, "middle", Math.min(64, Math.max(F, bw * 0.55)), "pi-t pi-bv");
    const p = places ? text(root, x + bw / 2, py, n > 8 ? `2${sup(n - 1 - b)}` : String(2 ** (n - 1 - b)), false, "middle", F, "pi-t pi-m") : null;
    root.append(g);
    return { g, v, p };
  });
  const right = x0 + n * (bw + gap) - gap;
  const dv = dec && !under ? text(root, right + 24, cy + (e.hex ? 4 : 17), "", false, "left", big, "pi-t pi-v") : null;
  const hx = dec && e.hex && !under ? text(root, right + 24, cy + 46, "", false, "left", F, "pi-t pi-m") : null;
  y += rows[2]!;
  const sum = e.sum || (under && dec) ? text(root, x0 + (right - x0) / 2, y + 36, "", false, "middle", F, "pi-t pi-v") : null;
  y += rows[3]!;
  const note = notes ? text(root, x0 + (right - x0) / 2, y + 36, "", rtl) : null;
  box.append(root);

  return (st) => {
    const { a, b, k, n: near } = at(frames, st.frame);
    const va = a ?? 0, vb = b ?? 0, vn = near ?? 0;
    const shown = clamp01(st.reveal * (n + 1) - n);
    const focus = Math.round(st.focus);
    cells.forEach((c, i) => {
      const bit = n - 1 - i;
      const ba = (va >> bit) & 1, bb = (vb >> bit) & 1;
      const s = ba === bb ? 1 : Math.abs(Math.cos(Math.PI * k));
      const v = ba === bb || k < 0.5 ? ba : bb;
      say(c.v, String(v));
      wr.attr(c.g, "transform", s === 1 ? "" : `matrix(1 0 0 ${fix(s)} 0 ${fix(cy * (1 - s), 1)})`);
      wr.cls(c.g, "is-1", v === 1);
      wr.cls(c.g, "is-on", focus === i + 1);
      const o = fix(clamp01(st.reveal * (n + 1) - i));
      wr.style(c.g, "opacity", o);
      if (c.p) { wr.style(c.p, "opacity", o); wr.cls(c.p, "is-lit", ((vn >> bit) & 1) === 1 || focus === i + 1); }
    });
    for (const t of [dv, hx, sum, note]) if (t) wr.style(t, "opacity", fix(shown));
    if (dv) say(dv, `= ${vn}`);
    if (hx) say(hx, `0x${vn.toString(16).toUpperCase().padStart(Math.ceil(n / 4), "0")}`);
    if (sum) {
      const terms: string[] = [];
      for (let bit = n - 1; bit >= 0; bit--) if ((vn >> bit) & 1) terms.push(String(2 ** bit));
      say(sum, e.sum && terms.length > 1 ? `${terms.join(" + ")} = ${vn}` : e.sum ? `${vn}` : `= ${vn}`);
    }
    if (note) {
      const i = Math.min(frames.length - 1, Math.max(0, Math.round(st.frame)));
      const s = e.notes?.[i] ? ctx.t(e.notes[i]!) : "";
      const r = rtl && ARABIC.test(s);
      say(note, r ? isolate(s) : s);
      wr.attr(note, "direction", r ? "rtl" : "ltr");
    }
  };
};
