import { svg } from "../../dom.ts";
import { clamp01, fix } from "../../motion.ts";
import type { KitRenderer } from "../../templates/types.ts";
import { baseSize, est, fit, glyph, label, tv, type Packet } from "./util.ts";

/**
 * A packet's fields as a row of boxes, left to right as on the wire in every language: each header's name over its
 * fields, the field's name and value inside, its size under it. `frame` 0 → 1 encrypts the secret fields (HTTPS); with
 * `watch`, an eye marks what anyone on the way can read and a lock what they can't. Rows wrap when the box is narrow.
 */
export const packet: KitRenderer = (el, box, ctx) => {
  const e = el as Packet;
  const W = e.w ?? 1100;
  const H = e.h ?? 360;
  const base = baseSize(ctx, e.size);
  const fields = e.fields;
  const groups = e.groups ?? [];
  const values = fields.map((f) => ctx.t(f.value));
  const ciphers = fields.map((f, i) => f.cipher ?? "#".repeat(Math.min(12, Math.max(4, values[i]!.length))));
  const names = fields.map((f) => ctx.t(f.name));
  const hasSize = fields.some((f) => f.size);
  const watch = !!e.watch;
  const gap = 8;

  // Sizes: the largest text (down to 0.94 of the base) whose rows fit the height.
  const lay = (fs: number) => {
    const fn = Math.round(fs * 0.94);
    const ws = fields.map((f, i) => Math.max(est(names[i]!, fn), est(values[i]!, fs), f.secret ? est(ciphers[i]!, fs) : 0, f.size ? est(f.size, fn) : 0, (96 * fs) / 34) + 28);
    // Rows: fill each as far as it goes, breaking between groups where one ends close by.
    const owner = fields.map(() => -1);
    let k = 0;
    groups.forEach((g, gi) => { for (let j = 0; j < g.span && k < fields.length; j++) owner[k++] = gi; });
    const rows: number[][] = [[]];
    let used = 0;
    fields.forEach((_, i) => {
      const row = rows[rows.length - 1]!;
      if (row.length && used + ws[i]! > W) { rows.push([]); used = 0; }
      rows[rows.length - 1]!.push(i);
      used += ws[i]! + gap;
    });
    const boxH = 14 + fn * 1.15 + fs * 1.2 + 12;
    const gl = groups.length ? fn * 1.25 + 14 : 0;
    const below = (hasSize ? fn * 1.2 : 0) + (watch ? fs * 1.3 : 0) + 8;
    const rowH = gl + boxH + below;
    return { fs, fn, ws, rows, owner, boxH, gl, rowH, total: rows.length * rowH + (rows.length - 1) * 16 };
  };
  let L = lay(base);
  for (let fs = base - 1; L.total > H && fs >= base * 0.94; fs--) L = lay(fs);
  const { fs, fn } = L;

  const root = svg("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}`, className: "ls-el-svg pn", direction: "ltr" });
  const top0 = Math.max(0, (H - L.total) / 2);
  const place: { x: number; y: number }[] = [];
  L.rows.forEach((row, r) => {
    const width = row.reduce((a, i) => a + L.ws[i]! + gap, -gap);
    let x = (W - width) / 2;
    for (const i of row) { place[i] = { x, y: top0 + r * (L.rowH + 16) + L.gl }; x += L.ws[i]! + gap; }
  });

  // Group names over their fields (a bracket in the group's colour), per row.
  const gEls: { g: SVGElement; first: number }[] = [];
  groups.forEach((gr, gi) => {
    const mine = fields.map((_, i) => i).filter((i) => L.owner[i] === gi);
    for (const row of L.rows) {
      const here = mine.filter((i) => row.includes(i));
      if (!here.length) continue;
      const x1 = place[here[0]!]!.x;
      const x2 = place[here[here.length - 1]!]!.x + L.ws[here[here.length - 1]!]!;
      const y = place[here[0]!]!.y - 8;
      const g = svg("g", { className: "pn-gr" });
      g.style.color = tv(gr.tone, "accent");
      g.append(svg("path", { d: `M${fix(x1 + 4, 1)} ${fix(y, 1)}v-8H${fix(x2 - 4, 1)}v8` }));
      const t = fit(ctx.t(gr.label), fn, x2 - x1, 1, fn);
      g.append(label(t.lines, (x1 + x2) / 2, y - 16, t.size, "pn-h", ctx));
      root.append(g);
      gEls.push({ g, first: here[0]! });
    }
  });

  // Fields: name and value in the box; the cipher over the value; size and marks under it.
  const cells = fields.map((f, i) => {
    const { x, y } = place[i]!;
    const w = L.ws[i]!;
    const g = svg("g", { className: "pn-f" });
    if (f.tone) g.style.color = tv(f.tone);
    g.append(svg("rect", { x: fix(x, 1), y: fix(y, 1), width: fix(w, 1), height: fix(L.boxH, 1), rx: 10, className: "pn-c" }));
    const nm = fit(names[i]!, fn, w - 16, 1, fn);
    g.append(label(nm.lines, x + w / 2, y + 12 + fn * 0.92, nm.size, "pn-m", ctx));
    const vy = y + 14 + fn * 1.15 + fs * 0.95;
    const plain = label([values[i]!], x + w / 2, vy, fs, "pn-v", ctx, "middle", true);
    g.append(plain);
    let well: SVGElement | undefined;
    let enc: SVGElement | undefined;
    if (f.secret) {
      well = svg("rect", { x: fix(x + 6, 1), y: fix(vy - fs * 1.0, 1), width: fix(w - 12, 1), height: fix(fs * 1.35, 1), rx: 8, className: "pn-well" });
      enc = label([ciphers[i]!], x + w / 2, vy, fs, "pn-enc", ctx, "middle", true);
      g.insertBefore(well, plain);
      g.append(enc);
    }
    let by = y + L.boxH + 6;
    if (f.size) { g.append(label([f.size], x + w / 2, by + fn * 0.92, fn, "pn-m", ctx, "middle", true)); by += fn * 1.2; }
    let eye: SVGElement | undefined;
    let lock: SVGElement | undefined;
    if (watch) {
      const gs = fs * 1.05;
      eye = glyph("eye", x + w / 2, by + gs / 2 + 4, gs);
      eye.setAttribute("class", "pn-gl pn-eye");
      g.append(eye);
      if (f.secret) { lock = glyph("lock", x + w / 2, by + gs / 2 + 4, gs); lock.setAttribute("class", "pn-gl pn-lock"); g.append(lock); }
    }
    root.append(g);
    return { g, plain, well, enc, eye, lock };
  });
  box.append(root);

  const n = fields.length;
  return (s) => {
    const k = clamp01(s.frame);
    const focus = Math.round(s.focus);
    cells.forEach((c, i) => {
      ctx.wr.style(c.g, "opacity", fix(clamp01(s.reveal * n - i)));
      ctx.wr.cls(c.g, "is-on", focus === i + 1);
      if (c.enc) {
        ctx.wr.style(c.plain, "opacity", fix(1 - k));
        ctx.wr.style(c.enc, "opacity", fix(k));
        ctx.wr.style(c.well!, "opacity", fix(k));
      }
      if (c.eye) ctx.wr.style(c.eye, "opacity", fix(c.lock ? 1 - k : 1));
      if (c.lock) ctx.wr.style(c.lock, "opacity", fix(k));
    });
    for (const g of gEls) ctx.wr.style(g.g, "opacity", fix(clamp01(s.reveal * n - g.first)));
  };
};
