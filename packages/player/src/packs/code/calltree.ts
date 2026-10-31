import { h, svg } from "../../dom.ts";
import { fix } from "../../motion.ts";
import type { KitRenderer } from "../../templates/types.ts";
import { CH, clamp, smooth, toneVar, type CalltreeElement } from "./util.ts";

/** The run of a call tree, depth first: i + 1 when call i starts, −(i + 1) when it returns. */
export function callSteps(calls: readonly { parent?: number }[]): number[] {
  const out: number[] = [];
  const stack: number[] = [];
  calls.forEach((c, i) => {
    const p = i ? c.parent ?? 0 : -1;
    while (stack.length && stack[stack.length - 1] !== p) out.push(-(stack.pop()! + 1));
    out.push(i + 1);
    stack.push(i);
  });
  while (stack.length) out.push(-(stack.pop()! + 1));
  return out;
}

/**
 * Recursion as a tree: the first call at the top, each call's calls under it in the order they are made (leaves
 * evenly spaced, parents over their children). As `frame` moves through `steps`, calls appear as they are made, the
 * running one is marked and the ones waiting for it are outlined; a returning call sends its value up to its parent
 * (a chip that travels the line), then keeps it in a badge. Mirrored in right-to-left languages unless `fixed`; the
 * calls stay left to right.
 */
export const calltree: KitRenderer = (el, box, ctx) => {
  const e = el as CalltreeElement;
  const W = e.w ?? 1000;
  const H = e.h ?? 420;
  const C = e.calls;
  const n = C.length;
  const par = C.map((c, i) => (i ? c.parent ?? 0 : -1));
  const kids = C.map(() => [] as number[]);
  par.forEach((p, i) => { if (p >= 0) kids[p]!.push(i); });
  const depth = par.map(() => 0);
  par.forEach((p, i) => { if (p >= 0) depth[i] = depth[p]! + 1; });
  // Leaves get the next place; a parent sits over the middle of its children.
  const xu = new Array<number>(n).fill(0);
  let leaf = 0;
  const lay = (i: number): void => {
    if (!kids[i]!.length) { xu[i] = leaf++; return; }
    for (const c of kids[i]!) lay(c);
    xu[i] = (xu[kids[i]![0]!]! + xu[kids[i]![kids[i]!.length - 1]!]!) / 2;
  };
  lay(0);
  const rows = Math.max(...depth) + 1;
  const slot = W / Math.max(1, leaf);
  const rh = H / rows;
  const chars = Math.max(...C.map((c) => c.label.length));
  const s = e.size ?? Math.max(16, Math.floor(Math.min(36, (Math.min(slot * 0.92, 320) - 22) / (chars * CH), rh * 0.48)));
  const nw = Math.min(slot * 0.92, chars * CH * s + 24);
  const nh = Math.min(rh * 0.7, s * 1.6);
  const flip = ctx.mirror && !e.fixed;
  const cx = (i: number): number => { const x = (xu[i]! + 0.5) * slot; return flip ? W - x : x; };
  const cy = (i: number): number => (depth[i]! + 0.5) * rh;

  const root = h("div", { className: "pc-tree" });
  root.style.width = `${W}px`;
  root.style.height = `${H}px`;
  const art = svg("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}`, className: "ls-el-svg pc-abs", direction: "ltr" });
  root.append(art);
  const lines = C.map((_, i) => {
    if (par[i]! < 0) return null;
    const p = par[i]!;
    const l = svg("line", { x1: fix(cx(p), 1), y1: fix(cy(p) + nh / 2, 1), x2: fix(cx(i), 1), y2: fix(cy(i) - nh / 2, 1), className: "pc-ce" });
    art.append(l);
    return l;
  });
  const nodes = C.map((c, i) => {
    const d = h("div", { className: "pc-call pc-abs", dir: "ltr" }, c.label);
    d.style.cssText += `;left:${fix(cx(i) - nw / 2, 1)}px;top:${fix(cy(i) - nh / 2, 1)}px;width:${fix(nw, 1)}px;height:${fix(nh, 1)}px;font-size:${s}px;line-height:${fix(nh - 6, 1)}px`;
    // A tone colours the call (repeated work, say), under the marks of the running and waiting calls.
    if (c.tone) d.style.setProperty("--pc-bg", toneVar(c.tone, "card"));
    let badge: HTMLElement | null = null;
    if (c.ret !== undefined) {
      badge = h("span", { className: "pc-ret" }, c.ret);
      badge.style.fontSize = `${s}px`;
      d.append(badge);
    }
    root.append(d);
    return { d, badge };
  });
  const chip = h("div", { className: "pc-chip pc-abs", dir: "ltr" });
  chip.style.fontSize = `${s}px`;
  root.append(chip);
  box.append(root);

  const steps = e.steps?.length ? e.steps : callSteps(C);
  const startAt = new Array<number>(n).fill(Infinity);
  const endAt = new Array<number>(n).fill(Infinity);
  steps.forEach((v, q) => { if (v > 0) startAt[v - 1] = q; else endAt[-v - 1] = q; });
  // Without a frame track the whole run shows; otherwise frame k is the run after steps[k].
  const whole = e.frame === undefined && !(e.anim ?? []).some((t) => t.prop === "frame");

  return (st) => {
    const f = whole ? steps.length - 1 : clamp(st.frame, 0, steps.length - 1);
    const done = Math.floor(f + 1e-9);
    const k = f - done;
    const next = k > 0 ? steps[done + 1] : undefined;
    const focus = Math.round(st.focus);
    let now = -1;
    for (let i = 0; i < n; i++) if (startAt[i]! <= done && endAt[i]! > done) now = i;
    nodes.forEach(({ d, badge }, i) => {
      const coming = next === i + 1;
      const vis = clamp(st.reveal * n - i) * (startAt[i]! <= done ? 1 : coming ? smooth(k * 2) : 0);
      ctx.wr.style(d, "opacity", fix(vis));
      ctx.wr.style(d, "transform", coming && k < 0.5 ? `scale(${fix(0.7 + 0.6 * k)})` : "none");
      const back = endAt[i]! <= done;
      ctx.wr.cls(d, "is-open", startAt[i]! <= done && !back);
      ctx.wr.cls(d, "is-now", now === i);
      ctx.wr.cls(d, "is-done", back);
      ctx.wr.cls(d, "is-focus", focus === i + 1);
      if (badge) ctx.wr.style(badge, "opacity", back ? "1" : "0");
      const l = lines[i];
      if (l) {
        ctx.wr.style(l, "opacity", fix(vis));
        ctx.wr.cls(l, "is-ret", back);
      }
    });
    // A value on its way up: from the returning call to the one that made it.
    const r = next !== undefined && next < 0 ? -next - 1 : -1;
    const up = r >= 0 && par[r]! >= 0 && C[r]!.ret !== undefined;
    ctx.wr.style(chip, "opacity", up ? fix(clamp(Math.min(k, 1 - k) * 6) * clamp(st.reveal * n - r)) : "0");
    if (up) {
      if (chip.textContent !== C[r]!.ret) chip.textContent = C[r]!.ret!;
      const g = smooth(k);
      const p = par[r]!;
      const x = cx(r) + (cx(p) - cx(r)) * g;
      const y = cy(r) - nh * 0.5 + (cy(p) + nh * 0.5 - (cy(r) - nh * 0.5)) * g;
      ctx.wr.style(chip, "transform", `translate(${fix(x, 1)}px,${fix(y, 1)}px) translate(-50%,-50%)`);
    }
  };
};
