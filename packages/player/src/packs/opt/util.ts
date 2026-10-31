import { h, rich, svg } from "../../dom.ts";
import { fix } from "../../motion.ts";
import type { Ctx } from "../../templates/types.ts";

/** A number on the stage: at most one decimal, a real minus sign. */
export const num = (v: number): string => String(Math.round(v * 10) / 10).replace("-", "−");
/** The step shown at frame f of n: rounded and clamped. */
export const step = (n: number, f: number): number => Math.max(0, Math.min(n - 1, Math.round(f)));
/** About how wide a text is (no measuring while playing): Latin bold ~0.6 em, Arabic ~0.55 em. */
export const est = (s: string, fs: number): number => [...s].reduce((w, ch) => w + (/[؀-ۿ]/.test(ch) ? 0.55 : /[0-9 .,]/.test(ch) ? 0.56 : 0.62), 0) * fs;

const said = new WeakMap<Element, string>();
/**
 * Writes a text into an element (bidi-safe, through rich()), only when it changes. It goes in one span, so a flex
 * container doesn't drop the spaces between its runs ("الحصة 4").
 */
export function put(el: Element, s: string, rtl: boolean): void {
  if (said.get(el) === s) return;
  said.set(el, s);
  el.replaceChildren(h("span", null, ...rich(s, rtl)));
}

/** An absolutely placed box in stage pixels. */
export function at(el: HTMLElement, x: number, y: number, w?: number, hh?: number): HTMLElement {
  const s = el.style;
  s.left = `${fix(x, 1)}px`;
  s.top = `${fix(y, 1)}px`;
  if (w !== undefined) s.width = `${fix(w, 1)}px`;
  if (hh !== undefined) s.height = `${fix(hh, 1)}px`;
  return el;
}

/** An SVG layer the size of the element, left to right. */
export const layer = (W: number, H: number): SVGElement => svg("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}`, direction: "ltr", className: "po-svg" });

/** A cross (✗) or a tick (✓) drawn as strokes, so no font needs the glyph. */
export function mark(kind: "x" | "ok", cls = ""): SVGElement {
  return svg("svg", { viewBox: "0 0 20 20", className: `po-mk ${cls}` }, svg("path", { d: kind === "x" ? "M4 4L16 16M16 4L4 16" : "M3 11L8 16L17 4" }));
}

/**
 * The notes and the running total: a strip under the drawing (one line) or a card beside it (`side`: the total big,
 * the note under it). Returns its element and a setter.
 */
export function panel(ctx: Ctx, side: boolean, hasTotal: boolean): { el: HTMLElement; set: (note: string, label: string, total: string) => void } {
  const rtl = ctx.dir === "rtl";
  const note = h("div", { className: "po-nt" });
  const tl = h("div", { className: "po-tl" });
  const tv = h("div", { className: "po-tv" });
  const total = h("div", { className: "po-tt" }, tl, tv);
  // Beside a drawing the card takes the height it needs, in the middle; under it, the strip is the card.
  const el = side
    ? h("div", { className: "po-pn is-side", dir: ctx.dir }, h("div", { className: "po-card" }, total, note))
    : h("div", { className: "po-pn po-card", dir: ctx.dir }, note, total);
  if (!hasTotal) total.style.display = "none";
  return {
    el,
    set(n, label, t) {
      put(note, n, rtl);
      put(tl, label, rtl);
      put(tv, t, rtl);
      ctx.wr.style(total, "opacity", t ? "1" : "0");
    },
  };
}

/** The notes strip's height: one line, or up to three in a narrow box (an upright stage). */
export const stripH = (W: number): number => (W < 900 ? 120 : 60);

/** Colours for groups 1–6 (exam slots, items, jobs): a tone and the text colour that reads on it. */
export const GROUP = ["accent", "ok", "accent2", "muted", "fg", "hi-fg"];
