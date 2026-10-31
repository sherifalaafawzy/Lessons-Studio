import { svg } from "../../dom.ts";
import { clamp01, fix } from "../../motion.ts";
import type { KitRenderer } from "../../templates/types.ts";
import { sideAnchor } from "./topology.ts";
import { baseSize, est, fit, glyph, head, label, onTone, tv, type Sequence } from "./util.ts";

/**
 * A sequence diagram: participants as columns with lifelines, messages as numbered arrows that travel from the sender
 * to the receiver as they come in (answers dashed, encrypted ones with a lock), a step a participant takes alone as a
 * loop, and notes across lifelines. Rows are sized once from the labels; the participants run right to left in
 * right-to-left languages unless `fixed`.
 */
export const sequence: KitRenderer = (el, box, ctx) => {
  const e = el as Sequence;
  const W = e.w ?? 1000;
  const H = e.h ?? 560;
  const flip = ctx.mirror && !e.fixed;
  const ps = e.participants;
  const P = ps.length;
  const idx = new Map(ps.map((p, i) => [p.id, i]));
  const colW = W / P;
  const cx = ps.map((_, i) => { const x = colW * (i + 0.5); return flip ? W - x : x; });
  const numbers = e.numbers !== false;
  const base = baseSize(ctx, e.size);
  const notes = [...(e.notes ?? [])].sort((a, b) => a.after - b.after);

  // The rows in order: each message, with the notes after the messages they follow.
  type Row = { kind: "msg"; m: number } | { kind: "note"; n: number };
  const rows: Row[] = [];
  let ni = 0;
  for (let m = 0; m <= e.messages.length; m++) {
    while (ni < notes.length && notes[ni]!.after === m) rows.push({ kind: "note", n: ni++ });
    if (m < e.messages.length) rows.push({ kind: "msg", m });
  }

  // Sizes: shrink the text (down to 0.94 of the base) until the header and the rows fit the height.
  // A label may run past the arrow's end (one label per row): up to a column beyond it, inside the box.
  const r0 = numbers ? base * 0.66 : 0;
  const gapOf = (m: number): number => {
    const msg = e.messages[m]!;
    return Math.abs(cx[idx.get(msg.from)!]! - cx[idx.get(msg.to)!]!);
  };
  const span = (m: number): number => {
    const d = gapOf(m);
    return d < 1 ? colW * 0.95 - Math.min(colW * 0.3, 90) : Math.min(W - 40, d + colW - 2 * r0 - 20);
  };
  const lay = (fs: number) => {
    const g = Math.min((46 * fs) / 34, colW * 0.36);
    const heads = ps.map((p) => fit(ctx.t(p.label), fs, colW - 28, 2, fs));
    const headH = 12 + g + 8 + Math.max(...heads.map((x) => x.lines.length)) * fs * 1.15 + 6;
    const texts = rows.map((r) => r.kind === "msg"
      ? fit(ctx.t(e.messages[r.m]!.label), fs, span(r.m) - (e.messages[r.m]!.lock ? fs : 0), 2, fs)
      : fit(ctx.t(notes[r.n]!.text), fs, noteW(r.n) - 28, 2, fs));
    const need = texts.map((t, k) => {
      const r = rows[k]!;
      const lines = t.lines.length * fs * 1.15;
      return r.kind === "note" ? lines + 26 : lines + fs * 0.45 + 12;
    });
    return { g, heads, headH, texts, need, total: headH + 12 + need.reduce((a, b) => a + b, 0) };
  };
  const noteW = (n: number): number => {
    const o = notes[n]!.over.map((id) => cx[idx.get(id)!]!);
    return o.length > 1 ? Math.abs(o[0]! - o[1]!) + colW * 0.8 : Math.min(W, colW * 1.6);
  };
  let fs = base;
  let L = lay(fs);
  while (L.total > H && fs > base * 0.94 + 0.5) { fs -= 1; L = lay(fs); }
  // Still too tall: the rows close up so the diagram stays in its box.
  if (L.total > H) {
    const k = Math.max(0.5, (H - L.headH - 12) / (L.total - L.headH - 12));
    L.need = L.need.map((v) => v * k);
    L.total = H;
  }
  // Spare height spreads over the rows (up to a line each); the rest stays under them.
  const spare = Math.max(0, H - L.total);
  const extra = rows.length ? Math.min(fs, spare / rows.length) : 0;

  const root = svg("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}`, className: "ls-el-svg pn", direction: "ltr" });
  const lifeL = svg("g");
  const rowL = svg("g");
  const headL = svg("g");
  root.append(lifeL, rowL, headL);

  // Participants: a card with the glyph and the name; a dashed lifeline down from it.
  const heads = ps.map((p, i) => {
    const g = svg("g", { className: "pn-p" });
    if (p.tone) g.style.color = tv(p.tone);
    const t = L.heads[i]!;
    const w = Math.min(colW - 12, Math.max(L.g, ...t.lines.map((l) => est(l, t.size))) + 36);
    g.append(svg("rect", { x: fix(cx[i]! - w / 2, 1), y: 2, width: fix(w, 1), height: fix(L.headH - 4, 1), rx: 16, className: "pn-c" }));
    g.append(glyph(p.glyph ?? "user", cx[i]!, 12 + L.g / 2, L.g));
    g.append(label(t.lines, cx[i]!, 12 + L.g + 6 + t.size * 0.92, t.size, "", ctx));
    headL.append(g);
    const life = svg("line", { x1: fix(cx[i]!, 1), y1: fix(L.headH, 1), x2: fix(cx[i]!, 1), y2: fix(H - 4, 1), className: "pn-life" });
    lifeL.append(life);
    return { g, life };
  });

  // Rows.
  let y = L.headH + 12;
  let num = 0;
  const drawn = rows.map((r, k) => {
    const h = L.need[k]! + extra;
    const t = L.texts[k]!;
    const g = svg("g");
    rowL.append(g);
    if (r.kind === "note") {
      const nt = notes[r.n]!;
      const o = nt.over.map((id) => cx[idx.get(id)!]!);
      const mid = (Math.min(...o) + Math.max(...o)) / 2;
      const w = Math.min(W - 4, Math.max(noteW(r.n), Math.max(...t.lines.map((l) => est(l, t.size))) + 36));
      const top = y + (h - L.need[k]! + 8) / 2;
      const nh = t.lines.length * t.size * 1.15 + 18;
      const nx = Math.min(W - 2 - w, Math.max(2, mid - w / 2));
      const rect = svg("rect", { x: fix(nx, 1), y: fix(top, 1), width: fix(w, 1), height: fix(nh, 1), rx: 12, className: "pn-note" });
      rect.style.fill = tv(nt.tone, "accent2");
      const tt = label(t.lines, nx + w / 2, top + 9 + t.size * 0.92, t.size, "", ctx);
      tt.style.fill = onTone(nt.tone ?? "accent2");
      g.append(rect, tt);
      y += h;
      return { kind: "note" as const, g };
    }
    const msg = e.messages[r.m]!;
    num++;
    const a = idx.get(msg.from)!;
    const b = idx.get(msg.to)!;
    const x1 = cx[a]!;
    const x2 = cx[b]!;
    const ay = y + h - 10;
    const tone = msg.tone ?? "fg";
    g.setAttribute("class", `pn-msg${msg.reply ? " is-reply" : ""}`);
    g.style.color = tv(tone);
    const self = a === b;
    // A step taken alone loops out to the side with more room and back.
    const out = self ? ((a === P - 1) !== flip ? -1 : 1) : Math.sign(x2 - x1);
    const sx = numbers && !self ? x1 + out * r0 : x1;
    const loop = Math.min(colW * 0.3, 90);
    const line = self
      ? svg("path", { d: `M${fix(x1, 1)} ${fix(ay - fs * 0.9, 1)}h${fix(out * loop, 1)}v${fix(fs * 0.9, 1)}h${fix(-out * (loop - 14), 1)}`, className: "pn-ln" })
      : svg("line", { x1: fix(sx, 1), y1: fix(ay, 1), x2: fix(sx, 1), y2: fix(ay, 1), className: "pn-ln" });
    const tip = svg("polygon", { points: head(0, 0, out > 0 === !self ? 0 : Math.PI, 18), className: "pn-hd" });
    g.append(line, tip);
    const lines = t.lines;
    // Between the lifelines when it fits there; else from the sender's number on towards the receiver and past it.
    const lw = Math.max(...lines.map((l) => est(l, t.size))) + (msg.lock ? fs : 0);
    let mid = self ? x1 + out * (loop + 16) : (x1 + x2) / 2;
    if (!self && lw > Math.abs(x2 - x1) - 2 * r0 - 20) mid = Math.min(W - lw / 2 - 6, Math.max(lw / 2 + 6, x1 + out * (r0 + 10 + lw / 2)));
    const ly = (self ? ay - fs * 0.45 : ay - 12 - (lines.length - 1) * t.size * 1.15) - (self ? (lines.length - 1) * t.size * 0.57 : 0);
    const anchor = self ? sideAnchor(out < 0 ? false : true, ctx) : "middle";
    const text = label(lines, mid, self ? ly + t.size * 0.35 : ly, t.size, "pn-ml pn-h", ctx, anchor);
    g.append(text);
    if (msg.lock) {
      // The lock goes before the label's first word (its right in right-to-left text).
      const w = Math.max(...lines.map((l) => est(l, t.size)));
      const ls = fs * 0.9;
      const startLeft = ctx.dir !== "rtl";
      const lx = self ? (out > 0 === startLeft ? mid - ls / 2 - 6 : mid + ls / 2 + 6) : startLeft ? mid - w / 2 - ls / 2 - 8 : mid + w / 2 + ls / 2 + 8;
      g.append(glyph("lock", lx, self ? ly : ly - t.size * 0.35, ls));
    }
    let badge: SVGElement | undefined;
    if (numbers) {
      badge = svg("g", { className: "pn-n" },
        svg("circle", { cx: fix(x1, 1), cy: fix(self ? ay - fs * 0.9 : ay, 1), r: fix(r0, 1) }));
      const nt = svg("text", { x: fix(x1, 1), y: fix((self ? ay - fs * 0.9 : ay) + fs * 0.33, 1), "font-size": fix(fs * 0.94, 1), "text-anchor": "middle" });
      nt.textContent = String(num);
      badge.append(nt);
      g.append(badge);
    }
    y += h;
    return { kind: "msg" as const, g, line, tip, text, badge, sx, ex: x2, ay, self, out, n: num };
  });

  box.append(root);
  const N = 1 + rows.length;
  return (s) => {
    const R = s.reveal * N;
    const hp = fix(clamp01(R));
    for (const p of heads) { ctx.wr.style(p.g, "opacity", hp); ctx.wr.style(p.life, "opacity", hp); }
    const focus = Math.round(s.focus);
    drawn.forEach((d, k) => {
      const p = clamp01(R - 1 - k);
      if (d.kind === "note") { ctx.wr.style(d.g, "opacity", fix(p)); return; }
      ctx.wr.cls(d.g, "is-on", focus === d.n);
      ctx.wr.style(d.g, "opacity", p > 0 ? "1" : "0");
      if (d.badge) ctx.wr.style(d.badge, "opacity", fix(clamp01(p * 4)));
      ctx.wr.style(d.text, "opacity", fix(clamp01((p - 0.5) * 2.5)));
      // The arrow travels from the sender to the receiver.
      const k2 = clamp01((p - 0.1) / 0.6);
      if (d.self) {
        ctx.wr.style(d.line, "opacity", fix(k2));
        ctx.wr.style(d.tip, "transform", `translate(${fix(d.sx + d.out * 14, 1)}px,${fix(d.ay, 1)}px)`);
        ctx.wr.style(d.tip, "opacity", k2 >= 1 ? "1" : "0");
        return;
      }
      const x = d.sx + (d.ex - d.sx) * k2;
      ctx.wr.attr(d.line, "x2", fix(x, 1));
      ctx.wr.style(d.tip, "transform", `translate(${fix(x, 1)}px,${fix(d.ay, 1)}px)`);
      ctx.wr.style(d.tip, "opacity", k2 > 0.02 ? "1" : "0");
    });
  };
};
