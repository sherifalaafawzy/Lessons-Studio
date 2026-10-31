import { h, rich } from "../../dom.ts";
import { fix } from "../../motion.ts";
import type { KitRenderer } from "../../templates/types.ts";
import { CH, RTL, between, clamp, smooth, type ArrayElement, type ArrayFrame } from "./util.ts";

const POINTERS = ["lo", "mid", "hi", "pivot"] as const;

/**
 * Values in a row, as boxes or bars. Items keep their identity: between two frames each item slides from its slot to
 * its new one (a moving right arcs over, one moving left under, so a swap reads as two items crossing). The marks of
 * the frame being moved to colour the items: compared, just moved, finished, the pivot, found; a search's range
 * fades the slots outside it, and lo, mid and hi point at their slots from below. A note and the counters sit on top.
 * Never mirrored: numbers stay left to right.
 */
export const array: KitRenderer = (el, box, ctx) => {
  const e = el as ArrayElement;
  const W = e.w ?? 1000;
  const H = e.h ?? 360;
  const vals = e.values;
  const n = vals.length;
  const bars = e.view === "bars";
  const rtl = ctx.dir === "rtl";
  // Each frame's order, filled in from the frame before.
  const raw: ArrayFrame[] = e.frames?.length ? e.frames : [{}];
  const orders: number[][] = [];
  raw.forEach((f, i) => orders.push(f.order ?? orders[i - 1] ?? vals.map((_, k) => k)));
  const slotOf = orders.map((o) => { const s = new Array<number>(n); o.forEach((item, slot) => { s[item] = slot; }); return s; });

  const fs = 32;
  const hasTop = raw.some((f) => f.note !== undefined) || !!e.counters?.length;
  const named: string[] = [];
  for (const f of raw) for (const k of Object.keys(f.ptr ?? {})) if (!named.includes(k)) named.push(k);
  const ptrs = [...POINTERS.filter((p) => raw.some((f) => f[p] !== undefined)), ...named];
  const topH = hasTop ? Math.round(fs * 1.6) : 0;
  const ptrH = ptrs.length ? Math.round(fs * 1.75) : 0;
  const idxH = e.index ? Math.round(fs * 1.35) : 0;
  const areaY = topH + 8;
  const areaH = H - areaY - idxH - ptrH - 4;
  const sw = W / n;
  const chars = Math.max(1, ...vals.map((v) => String(v).length));
  const b = Math.min(sw * 0.84, bars ? sw * 0.7 : areaH * 0.8, bars ? 90 : 124);
  const size = e.size ?? Math.max(16, Math.floor(Math.min(44, bars ? sw * 0.86 / (chars * CH) : Math.min(b * 0.46, (b - 14) / (chars * CH)))));
  const vmax = Math.max(1e-9, ...vals.map((v) => (typeof v === "number" ? v : 0)));
  const labH = bars ? Math.round(size * 1.3) : 0;
  const slotX = (s: number): number => s * sw + sw / 2;
  const by = areaY + (areaH - b) / 2;
  const lift = bars ? 0 : Math.min(b * 0.62, areaH * 0.5);

  const root = h("div", { className: "pc-arr", dir: "ltr" });
  root.style.width = `${W}px`;
  root.style.height = `${H}px`;
  const tall = vals.map((v) => Math.max(4, (typeof v === "number" ? v / vmax : 0) * (areaH - labH)) + labH);
  const items = vals.map((v, q) => {
    const it = h("div", { className: bars ? "pc-it pc-bar2" : "pc-it pc-box" });
    if (bars) {
      const bh = tall[q]! - labH;
      it.style.cssText = `width:${fix(b, 1)}px;height:${fix(bh + labH, 1)}px;font-size:${size}px`;
      const fill = h("div", { className: "pc-fill" });
      fill.style.height = `${fix(bh, 1)}px`;
      it.append(h("span", { className: "pc-bv" }, String(v)), fill);
    } else {
      it.style.cssText = `width:${fix(b, 1)}px;height:${fix(b, 1)}px;font-size:${size}px;line-height:${fix(b - 6, 1)}px`;
      it.append(String(v));
    }
    root.append(it);
    return it;
  });
  if (e.index) {
    for (let s = 0; s < n; s++) {
      const t = h("div", { className: "pc-ix pc-abs" }, String(s));
      t.style.cssText += `;left:${fix(s * sw, 1)}px;top:${fix(areaY + areaH + 2, 1)}px;width:${fix(sw, 1)}px`;
      root.append(t);
    }
  }
  const pointers = ptrs.map((p) => {
    const t = h("div", { className: p === "pivot" ? "pc-ptr pc-abs pc-p-pivot" : "pc-ptr pc-abs" }, p);
    t.style.top = `${fix(areaY + areaH + idxH + 4, 1)}px`;
    root.append(t);
    return { p, t };
  });
  const bar = hasTop ? h("div", { className: "pc-atop pc-abs", dir: ctx.dir }) : null;
  const note = h("span", { className: "pc-note" });
  const counts = (e.counters ?? []).map((c) => {
    const v = h("b", null);
    const s = h("span", { className: "pc-cnt" }, ...rich(`${ctx.t(c)}: `, rtl), v);
    return { s, v };
  });
  if (bar) {
    bar.style.height = `${topH}px`;
    bar.append(note, h("span", { className: "pc-cnts" }, ...counts.map((c) => c.s)));
    root.append(bar);
  }
  box.append(root);

  let noted = -1;
  return (st) => {
    const [i, j0, k0] = between(raw.length, st.frame);
    // The frame being moved to: its marks show as the items move; the move takes the first 70% of the frame.
    const j = k0 > 0 ? j0 : i;
    const g = smooth(k0 / 0.7);
    const f = raw[j]!;
    const shown = (q: number): number => clamp(st.reveal * n - q);
    const inRange = (s: number): boolean => f.lo === undefined || f.hi === undefined || (s >= f.lo && s <= f.hi);
    const has = (list: number[] | undefined, s: number): boolean => !!list && list.includes(s);
    const focus = Math.round(st.focus);
    items.forEach((it, q) => {
      const a = slotOf[i]![q]!;
      const z = slotOf[j]![q]!;
      const x = slotX(a) + (slotX(z) - slotX(a)) * g - b / 2;
      const y = (bars ? areaY + areaH - tall[q]! : by) + (a === z ? 0 : (z > a ? -1 : 1) * lift * Math.sin(Math.PI * g));
      ctx.wr.style(it, "transform", `translate(${fix(x, 1)}px,${fix(y, 1)}px)`);
      ctx.wr.style(it, "opacity", fix(shown(z) * (inRange(z) ? 1 : 0.32)));
      ctx.wr.cls(it, "is-cmp", has(f.compare, z));
      ctx.wr.cls(it, "is-swap", has(f.swap, z));
      ctx.wr.cls(it, "is-done", has(f.done, z));
      ctx.wr.cls(it, "is-piv", f.pivot === z);
      ctx.wr.cls(it, "is-found", f.found === z);
      ctx.wr.cls(it, "is-focus", focus === z + 1);
    });
    // Pointers glide between their slots; pointers on one slot become one label, "lo=mid=hi", as the code would say.
    const at = (fr: ArrayFrame, p: string): number | undefined => ((POINTERS as readonly string[]).includes(p) ? fr[p as (typeof POINTERS)[number]] : fr.ptr?.[p]);
    pointers.forEach(({ p, t }) => {
      const za = at(raw[i]!, p);
      const zb = at(f, p);
      const z = zb ?? za;
      const twins = zb === undefined ? [] : pointers.filter((o) => at(f, o.p) === zb);
      const lead = !twins.length || twins[0]!.p === p;
      ctx.wr.style(t, "opacity", zb === undefined || !lead ? "0" : fix(clamp(st.reveal * 2 - 1)));
      const label = lead && twins.length > 1 ? twins.map((o) => o.p).join("=") : p;
      if (t.textContent !== label) t.textContent = label;
      if (z === undefined) return;
      const from = za ?? z;
      ctx.wr.style(t, "transform", `translate(${fix(slotX(from) + (slotX(z) - slotX(from)) * g, 1)}px,0) translateX(-50%)`);
    });
    if (bar) {
      if (noted !== j) {
        noted = j;
        const text = f.note !== undefined ? ctx.t(f.note) : "";
        // A note with no right-to-left letters is code ("a[3] = 17 < 23"): it keeps its own order.
        const code = !RTL.test(text);
        note.setAttribute("dir", code ? "ltr" : ctx.dir);
        note.replaceChildren(...(code ? [text] : rich(text, rtl)));
        counts.forEach((c, q) => { const v = String(f.count?.[q] ?? 0); if (c.v.textContent !== v) c.v.textContent = v; });
      }
      ctx.wr.style(bar, "opacity", fix(clamp(st.reveal * 2 - 1)));
    }
  };
};
