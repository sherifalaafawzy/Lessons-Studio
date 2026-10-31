import { h, rich } from "../../dom.ts";
import { fix } from "../../motion.ts";
import type { KitRenderer } from "../../templates/types.ts";
import { BORDER, CH, LH, PAD_Y, between, clamp, codeLine, codeSize, codeWidth, place, smooth, type TraceElement, type TraceStep } from "./util.ts";

/** A row of the variables panel: a frame's heading, a variable, or the value a line returns. */
interface Row { k: "h" | "v" | "l" | "r"; a: string; b: string; ch: boolean }

/** Panel text: 32 px, the least a phone can read on the 1280-wide stage. */
const FS = 32;
const ROW = Math.round(FS * 1.5);
const OUT_LH = Math.round(FS * 1.35);
const HEAD = Math.round(FS * 1.4);
const PANEL_PAD = 2 * (BORDER + 8);
const GAP = 24;

/**
 * A program running line by line. The code card (always left to right) lights the line that ran; beside it (below it
 * in a tall box) the variables panel shows the program's variables after that line, with a function's own frame on
 * top while one runs, and the changed values marked; the console shows what has been printed. `frame` k is steps[k];
 * the light glides on to the next line over the last part of each frame. The panels swap sides in right-to-left
 * languages unless `fixed`; the code and the variables stay left to right. Everything is as tall as it needs to be
 * (at most the box), from the top of the box.
 */
export const trace: KitRenderer = (el, box, ctx) => {
  const e = el as TraceElement;
  const W = e.w ?? 1100;
  const H = e.h ?? 420;
  const lines = e.code.replace(/\n+$/, "").split("\n");
  const steps = e.steps.length ? e.steps : [{ line: 1 } as TraceStep];
  const output = e.output ?? "";
  const rtl = ctx.dir === "rtl";

  // Every step's rows, worked out once: globals in the order they first appear, a running function's frame on top.
  const order: string[] = [];
  for (const s of steps) for (const k of Object.keys(s.vars ?? {})) if (!order.includes(k)) order.push(k);
  const scope = (s: TraceStep | undefined): string => (s ? `${s.call ?? s.fn ?? ""}|${s.depth ?? 0}` : "");
  const table: Row[][] = steps.map((s, i) => {
    const prev = steps[i - 1];
    const same = !!prev && scope(prev) === scope(s);
    const out: Row[] = [];
    if (s.locals || s.call || s.fn) {
      out.push({ k: "h", a: s.call ?? `${s.fn}()`, b: "", ch: !same });
      for (const [k, v] of Object.entries(s.locals ?? {})) out.push({ k: "l", a: k, b: v, ch: !same || prev?.locals?.[k] !== v });
      if (s.ret !== undefined) out.push({ k: "r", a: "return", b: s.ret, ch: true });
    }
    for (const k of order) {
      const v = s.vars?.[k];
      if (v !== undefined) out.push({ k: "v", a: k, b: v, ch: prev?.vars?.[k] !== v });
    }
    return out;
  });

  const wantV = table.some((r) => r.length);
  const panels = e.panels ?? [...(wantV ? ["vars"] : []), ...(output || e.error ? ["out"] : [])];
  const showV = panels.includes("vars");
  const showO = panels.includes("out");
  const side = showV || showO;
  const wide = W >= H * 1.25;
  const flip = ctx.mirror && !e.fixed;
  const outLabel = e.labels?.out ? ctx.t(e.labels.out) : undefined;
  const varLabel = e.labels?.vars ? ctx.t(e.labels.vars) : undefined;
  const head = (t: string | undefined): number => (t ? HEAD : 0);
  const outAll = output.replace(/\n$/, "").split("\n").concat(e.error ? [e.error] : []);
  const outLines = output || e.error ? outAll.length : 1;
  const rowsNeed = Math.max(1, ...table.map((r) => r.length));
  // How wide the panels would like to be: the longest "name = value" row, or the longest printed line.
  const sideNeed = Math.max(
    showV ? Math.max(0, ...table.flat().map((r) => r.a.length + 2 + r.b.length)) * CH * FS + 64 : 0,
    showO ? Math.max(0, ...outAll.map((l) => l.length)) * CH * FS + 40 : 0,
    varLabel ? varLabel.length * 0.6 * FS + 40 : 0,
  );

  // The code card: as big as fits up to 42 px; beside the panels it leaves them the room they ask for, within limits.
  const cw = !side || !wide ? W : clamp(Math.min(W - GAP - sideNeed, codeWidth(lines, Math.min(e.size ?? 42, 42))), W * 0.42, W * 0.66);
  const codeH = (s: number): number => Math.ceil(lines.length * Math.round(s * LH) + 2 * (PAD_Y + BORDER));
  const vNeed = showV ? head(varLabel) + PANEL_PAD + rowsNeed * ROW : 0;
  const oNeed = showO ? head(outLabel) + PANEL_PAD + Math.min(4, outLines) * OUT_LH : 0;
  const stackNeed = vNeed + oNeed + (showV && showO ? 16 : 0);
  const room = side && !wide ? Math.max(H * 0.4, H - GAP - stackNeed) : H;
  const size = e.size ?? codeSize(lines, cw, room, 42);
  const lh = Math.round(size * LH);
  const ch = side && wide ? Math.min(H, Math.max(codeH(size), stackNeed)) : Math.min(room, codeH(size));
  const digits = String(lines.length).length;
  const card = h("div", { className: "pc-code pc-abs", dir: "ltr" });
  place(card, flip && wide && side ? W - cw : 0, 0, cw, ch);
  card.style.fontSize = `${size}px`;
  card.style.lineHeight = `${lh}px`;
  const bar = h("div", { className: "pc-bar" });
  bar.style.height = `${lh}px`;
  card.append(bar);
  const rows = lines.map((l, i) => { const r = codeLine(i + 1, l, e.lang, digits); card.append(r.row); return r; });
  box.append(card);

  // The panels: variables over output (beside the code, as tall as it), or under the code one after the other.
  const sx = wide ? (flip ? 0 : cw + GAP) : 0;
  const sw = wide ? W - cw - GAP : W;
  const sy = wide ? 0 : ch + GAP;
  const sh = wide ? ch : Math.min(H - ch - GAP, stackNeed);
  const oh = !showO ? 0 : showV ? Math.min(Math.max(oNeed, sh * 0.3), sh * 0.45, oNeed) : sh;
  const vh = !showV ? 0 : sh - (showO ? oh + 16 : 0);
  const panel = (y: number, ph: number, label: string | undefined, cls: string): HTMLElement => {
    const p = h("div", { className: `pc-panel pc-abs ${cls}` });
    place(p, sx, sy + y, sw, ph);
    if (label) p.append(h("div", { className: "pc-head", dir: ctx.dir }, ...rich(label, rtl)));
    box.append(p);
    return p;
  };
  const vp = showV ? panel(0, vh, varLabel, "pc-vars") : null;
  const op = showO ? panel(showV ? vh + 16 : 0, oh, outLabel, "pc-out") : null;
  const nv = vp ? Math.max(1, Math.floor((vh - head(varLabel) - PANEL_PAD) / ROW)) : 0;
  const no = op ? Math.max(1, Math.floor((oh - head(outLabel) - PANEL_PAD) / OUT_LH)) : 0;
  const vrows = Array.from({ length: nv }, () => {
    const n = h("span", { className: "pc-vn" });
    const v = h("span", { className: "pc-vv" });
    const r = h("div", { className: "pc-vr", dir: "ltr" }, n, v);
    r.style.height = `${ROW}px`;
    vp!.append(r);
    return { r, n, v };
  });
  const orows = Array.from({ length: no }, () => { const r = h("div", { className: "pc-ol", dir: "ltr" }); op!.append(r); return r; });

  let shown = -1;
  const show = (si: number): void => {
    if (si === shown) return; // what follows depends on the step alone: skip rewriting the same step
    shown = si;
    const s = steps[si]!;
    const list = table[si]!;
    // More rows than fit: keep the frame and the first globals, and say how many more there are.
    const fit = list.length > nv ? [...list.slice(0, nv - 1), { k: "v", a: "…", b: `+${list.length - nv + 1}`, ch: false } as Row] : list;
    vrows.forEach((x, i) => {
      const r = fit[i];
      ctx.wr.style(x.r, "visibility", r ? "visible" : "hidden");
      if (!r) return;
      if (x.n.textContent !== r.a) x.n.textContent = r.a;
      if (x.v.textContent !== r.b) x.v.textContent = r.b;
      ctx.wr.cls(x.r, "is-h", r.k === "h");
      ctx.wr.cls(x.r, "is-l", r.k === "l" || r.k === "r" || r.k === "h");
      ctx.wr.cls(x.r, "is-r", r.k === "r");
      ctx.wr.cls(x.r, "is-new", r.ch && r.k !== "h");
      ctx.wr.cls(x.r, "pc-d", r.k === "h" && (s.depth ?? 0) > 1);
    });
    if (op) {
      const before = si ? steps[si - 1]!.out ?? 0 : 0;
      const upto = s.out ?? 0;
      const text = output.slice(0, upto);
      const all = text ? text.replace(/\n$/, "").split("\n") : [];
      const out: { t: string; err?: boolean; fresh?: boolean }[] = all.map((t, i) => ({ t, fresh: upto > before && i === all.length - 1 }));
      if (s.err && e.error) out.push({ t: e.error, err: true, fresh: true });
      const tail = out.slice(-no);
      orows.forEach((r, i) => {
        const l = tail[i];
        const t = l ? l.t || " " : "";
        if (r.textContent !== t) r.textContent = t;
        ctx.wr.cls(r, "is-err", !!l?.err);
        ctx.wr.cls(r, "is-new", !!l?.fresh);
      });
    }
  };

  return (st) => {
    const n = lines.length;
    const parts = n + (side ? 1 : 0);
    rows.forEach((r, i) => ctx.wr.style(r.row, "opacity", fix(clamp(st.reveal * parts - i))));
    const pOp = fix(clamp(st.reveal * parts - n));
    if (vp) ctx.wr.style(vp, "opacity", pOp);
    if (op) ctx.wr.style(op, "opacity", pOp);
    // The step: the light moves on over the last 40% of a frame, then the panels show the new step.
    const [i, j, k] = between(steps.length, st.frame);
    const g = smooth((k - 0.6) / 0.4);
    const si = g >= 1 ? j : i;
    const y = (steps[i]!.line - 1 + (steps[j]!.line - steps[i]!.line) * g) * lh;
    ctx.wr.style(bar, "transform", `translateY(${fix(PAD_Y + y, 1)}px)`);
    ctx.wr.style(bar, "opacity", fix(clamp(st.reveal * parts - (steps[si]!.line - 1))));
    ctx.wr.cls(bar, "is-err", !!steps[si]!.err);
    const focus = Math.round(st.focus);
    rows.forEach((r, q) => {
      ctx.wr.cls(r.no, "is-on", q === steps[si]!.line - 1);
      ctx.wr.cls(r.row, "is-focus", focus === q + 1);
    });
    show(si);
  };
};
