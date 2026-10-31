import type { Tone } from "@lessonstudio/spec";
import { svg } from "../../dom.ts";
import { clamp01, fix } from "../../motion.ts";
import type { KitRenderer } from "../../templates/types.ts";
import { sideAnchor } from "./topology.ts";
import { baseSize, est, fit, label, onTone, smooth, tv, type Layers } from "./util.ts";

/** Layer colours, top first: the seven OSI layers keep TCP/IP's colours for the layers they share. */
const TONES: Tone[] = ["accent", "accent2", "ok", "muted", "fg", "line", "danger"];
const OSI: Tone[] = ["accent", "accent", "accent", "accent2", "ok", "muted", "fg"];

/**
 * A protocol stack for the sender and the receiver, and the message between them: it goes down the sender's layers
 * gaining a header at each (encapsulation), crosses the link, and climbs the receiver's layers losing them. The
 * stacks stand side by side (in a tall box, the receiver's under the sender's) and mirror in right-to-left languages;
 * the headers read left to right, outermost first, as on the wire.
 */
export const layers: KitRenderer = (el, box, ctx) => {
  const e = el as Layers;
  const W = e.w ?? 1100;
  const H = e.h ?? 500;
  const flip = ctx.mirror && !e.fixed;
  const fs = baseSize(ctx, e.size);
  const fn = Math.round(fs * 0.94);
  const Ls = e.layers;
  const L = Ls.length;
  const single = !!e.single;
  const tall = !single && H > W * 1.25;
  const tones = Ls.map((l, i) => l.tone ?? (L === 7 ? OSI : TONES)[i]!);
  const X = (x: number, w = 0): number => (flip ? W - x - w : x);

  // The message's chips: each layer's header, then the payload.
  const heads = Ls.map((l) => (l.header ? ctx.t(l.header) : ""));
  const pay = ctx.t(e.payload);
  const cw = heads.map((t) => (t ? est(t, fn) + 22 : 0));
  const pw = est(pay, fn) + 26;
  const full = cw.reduce((a, w) => a + (w ? w + 6 : 0), 0) + pw;
  const names = Ls.map((l) => ctx.t(l.name));
  // The stacks give up width before the message shrinks: its text must stay readable.
  const nameW = Math.max(...names.map((s) => est(s, fs))) + 48;
  const want = Math.min(nameW, tall ? W - 66 - full : (W - (single ? 32 : 56) - full) / (single ? 1 : 2));

  // Geometry per side: where its stack is (before mirroring), its rows, and the message's column.
  const capH = e.sender || e.receiver ? fs * 1.25 + 10 : 0;
  const nSides = single ? 1 : 2;
  let stackW: number, rowH: number, pktX: number, midW: number, linkY = 0;
  const stackX: number[] = [];
  const top: number[] = [];
  if (tall) {
    const half = (H - 24) / 2;
    stackW = Math.max(W * 0.3, Math.min(W * 0.5, want));
    stackX.push(30, 30);
    top.push(capH, half + 24 + capH);
    rowH = (half - capH) / L;
    midW = W - 30 - stackW - 28;
    pktX = 30 + stackW + 24 + midW / 2;
  } else {
    const linkH = single ? 0 : fs * 1.25 + 40;
    stackW = Math.max(W * 0.15, Math.min(W * 0.32, want));
    stackX.push(0);
    if (!single) stackX.push(W - stackW);
    top.push(capH, capH);
    rowH = (H - capH - linkH) / L;
    midW = single ? W - stackW - 24 : W - 2 * stackW - 48;
    pktX = single ? stackW + 24 + midW / 2 : W / 2;
    linkY = capH + rowH * L + 18;
  }
  const gap = Math.min(12, rowH * 0.14);
  const ch = Math.min(fn * 1.5, rowH - gap - 6);
  const sc = Math.min(1, (midW - 8) / full);
  const cx = X(pktX);
  const rowY = (side: number, i: number): number => top[side]! + rowH * (i + 0.5);

  const root = svg("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}`, className: "ls-el-svg pn", direction: "ltr" });
  const back = svg("g");
  const front = svg("g");
  root.append(back, front);

  // The stacks: a box per layer with its colour stripe, its name and what it looks after.
  const showNote = rowH - gap >= (fs + fn) * 1.08 + 10;
  const left = !flip;
  const caps: SVGElement[] = [];
  const boxes = stackX.slice(0, nSides).map((sx, side) => {
    const x = X(sx, stackW);
    const cap = side === 0 ? e.sender : e.receiver;
    if (cap) {
      const c = fit(ctx.t(cap), fs, stackW, 1, fn);
      const t = label(c.lines, x + stackW / 2, top[side]! - capH + fs * 0.95, c.size, "", ctx);
      caps.push(t);
      back.append(t);
    }
    return Ls.map((l, i) => {
      const g = svg("g", { className: "pn-ly" });
      const y = top[side]! + rowH * i + gap / 2;
      const h = rowH - gap;
      g.append(svg("rect", { x: fix(x, 1), y: fix(y, 1), width: fix(stackW, 1), height: fix(h, 1), rx: 12, className: "pn-c" }));
      const stripe = svg("rect", { x: fix(left ? x + 3 : x + stackW - 15, 1), y: fix(y + 3, 1), width: 12, height: fix(h - 6, 1), rx: 6 });
      stripe.style.fill = tv(tones[i]);
      g.append(stripe);
      const tx = left ? x + 26 : x + stackW - 26;
      const nm = fit(names[i]!, fs, stackW - 40, 1, fn);
      // A note that doesn't fit its box is left out rather than spilling over.
      let note = showNote && l.note ? fit(ctx.t(l.note), fn, stackW - 40, 1, fn) : undefined;
      if (note && est(note.lines[0]!, fn) > stackW - 34) note = undefined;
      const cy = y + h / 2;
      g.append(label(nm.lines, tx, note ? cy - 4 : cy + nm.size * 0.35, nm.size, "", ctx, sideAnchor(left, ctx)));
      if (note) g.append(label(note.lines, tx, cy + fn * 1.0, fn, "pn-m", ctx, sideAnchor(left, ctx)));
      back.append(g);
      return g;
    });
  });

  // The link: under the stacks and across, or (tall) down their outer side.
  let link: SVGElement | undefined;
  const ends = stackX.map((sx) => X(sx, stackW) + stackW / 2);
  if (!single) {
    link = svg("g", { className: "pn-lk" });
    let d: string;
    if (tall) {
      const ox = X(8);
      const ex = X(30);
      d = `M${fix(ex, 1)} ${fix(rowY(0, L - 1), 1)}H${fix(ox, 1)}V${fix(rowY(1, L - 1), 1)}H${fix(ex, 1)}`;
    } else {
      const yb = top[0]! + rowH * L - gap / 2;
      d = `M${fix(ends[0]!, 1)} ${fix(yb, 1)}V${fix(linkY, 1)}H${fix(ends[1]!, 1)}V${fix(yb, 1)}`;
      if (e.link) link.append(label([ctx.t(e.link)], W / 2, linkY + fn * 1.05 + 6, fn, "pn-m pn-h", ctx));
    }
    link.insertBefore(svg("path", { d, className: "pn-l" }), link.firstChild);
    back.append(link);
  }

  // A pointer from the layer at work to the message.
  const ptr = svg("line", { className: "pn-ptr", x1: 0, y1: 0, x2: 0, y2: 0 });
  front.append(ptr);

  // The message: chips in a group that moves; each chip scales in and out from its own left edge.
  const pkt = svg("g", { className: "pn-pkt" });
  const chip = (text: string, w: number, tone: Tone | undefined, pay: boolean): SVGElement => {
    const g = svg("g", { className: pay ? "pn-ch is-pay" : "pn-ch" });
    const r = svg("rect", { x: 0, y: fix(-ch / 2, 1), width: fix(w, 1), height: fix(ch, 1), rx: 10 });
    if (!pay) r.style.fill = tv(tone);
    const t = label([text], w / 2, fn * 0.35, fn, "", ctx, "middle", !pay);
    if (!pay) t.style.fill = onTone(tone);
    g.append(r, t);
    pkt.append(g);
    return g;
  };
  const chips = heads.map((t, i) => (t ? chip(t, cw[i]!, tones[i], false) : undefined));
  const payChip = chip(pay, pw, undefined, true);
  front.append(pkt);
  box.append(root);

  const last = single ? L - 1 : 2 * L - 1;
  return (s) => {
    const N = L + nSides;
    const R = s.reveal * N;
    const focus = Math.round(s.focus);
    // The trip: `pass` 0 → 1 there, 1 → 2 the answer back (the stacks swap roles); else `frame`.
    const rev = s.pass > 1 && !single;
    const f = Math.min(last, Math.max(0, s.pass >= 0 ? (rev ? Math.min(2, s.pass) - 1 : s.pass) * last : s.frame));
    const from = rev ? 1 : 0;
    const to = 1 - from;
    // Where it is: on the sending side, crossing, or on the receiving side, and at which layer.
    let x = cx;
    let y: number;
    let side = from;
    let at: number;
    if (f <= L - 1 || single) {
      const i = Math.max(0, Math.min(L - 2, Math.floor(f)));
      y = rowY(from, i) + (rowY(from, i + 1) - rowY(from, i)) * smooth(Math.min(1, f - i));
      at = Math.round(f);
    } else if (f < L) {
      const c = f - (L - 1);
      const lo = rowY(from, L - 1);
      const hi = rowY(to, L - 1);
      if (tall) y = lo + (hi - lo) * smooth(c);
      else {
        const xs = ends[from]!;
        const xr = ends[to]!;
        if (c < 0.25) { const k = smooth(c / 0.25); x = cx + (xs - cx) * k; y = lo + (linkY - lo) * k; }
        else if (c < 0.75) { x = xs + (xr - xs) * smooth((c - 0.25) / 0.5); y = linkY; }
        else { const k = smooth((c - 0.75) / 0.25); x = xr + (cx - xr) * k; y = linkY + (hi - linkY) * k; }
      }
      at = -1;
    } else {
      const g = f - L;
      const i = Math.max(1, L - 1 - Math.floor(g));
      y = rowY(to, i) + (rowY(to, i - 1) - rowY(to, i)) * smooth(g - (L - 1 - i));
      side = to;
      at = L - 1 - Math.round(g);
    }
    // Headers: each comes in as the message reaches its layer on the way down, and goes as it leaves it on the way up.
    const op = Ls.map((_, i) => Math.min(clamp01((f - i + 0.5) * 2), f >= L && !single ? 1 - clamp01((f - (2 * L - 1 - i)) * 2) : 1));
    let total = pw;
    chips.forEach((c, i) => { if (c) total += (cw[i]! + 6) * op[i]!; });
    let cur = -total / 2;
    for (let i = L - 1; i >= 0; i--) {
      const c = chips[i];
      if (!c) continue;
      ctx.wr.style(c, "transform", `translate(${fix(cur, 1)}px,0px) scale(${fix(op[i]!)},1)`);
      ctx.wr.style(c, "opacity", fix(op[i]!));
      ctx.wr.cls(c, "is-on", at === i);
      cur += (cw[i]! + 6) * op[i]!;
    }
    ctx.wr.style(payChip, "transform", `translate(${fix(cur, 1)}px,0px)`);
    ctx.wr.cls(payChip, "is-on", !single && side === to && f >= last - 0.001);
    ctx.wr.style(pkt, "transform", `translate(${fix(x, 1)}px,${fix(y, 1)}px) scale(${fix(sc)})`);
    const shown = clamp01(R - L - (nSides - 1));
    ctx.wr.style(pkt, "opacity", fix(shown));

    for (const c of caps) ctx.wr.style(c, "opacity", fix(clamp01(R)));
    boxes.forEach((col, sd) => col.forEach((g, i) => {
      ctx.wr.style(g, "opacity", fix(clamp01(R - i)));
      ctx.wr.cls(g, "is-on", focus === i + 1);
      ctx.wr.cls(g, "is-act", shown > 0 && sd === side && at === i);
    }));
    if (link) {
      ctx.wr.style(link, "opacity", fix(clamp01(R - L)));
      ctx.wr.cls(link, "is-act", shown > 0 && at < 0);
    }
    // The pointer: from the working layer's box to the message, while the message is beside it.
    const near = at >= 0 ? 1 - Math.min(1, Math.abs(f - Math.round(f)) * 3) : 0;
    const bx = X(stackX[side]!, stackW);
    const inner = bx + stackW / 2 < x ? bx + stackW + 4 : bx - 4;
    const edge = x + (inner < x ? -1 : 1) * ((total * sc) / 2 + 6);
    const len = inner < x ? edge - inner : inner - edge;
    ctx.wr.style(ptr, "opacity", fix(len > 14 ? near * shown : 0));
    ctx.wr.attr(ptr, "x1", fix(inner, 1)); ctx.wr.attr(ptr, "x2", fix(edge, 1));
    ctx.wr.attr(ptr, "y1", fix(y, 1)); ctx.wr.attr(ptr, "y2", fix(y, 1));
  };
};
