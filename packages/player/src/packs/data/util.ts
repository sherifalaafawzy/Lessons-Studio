/** Helpers shared by the data pack's renderers. */
import type { Text } from "@lessonstudio/spec";
import { h, rich } from "../../dom.ts";
import type { Ctx } from "../../templates/types.ts";

export type Value = string | number | null;

/** Smoothstep: starts and ends gently. */
export const smooth = (k: number): number => k * k * (3 - 2 * k);
export const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;

/** The steps either side of `f` (clamped to 0 … n − 1) and how far between them it is. */
export function between(n: number, f: number): [number, number, number] {
  const x = Math.min(n - 1, Math.max(0, f));
  const i = Math.floor(x);
  return [i, Math.min(n - 1, i + 1), x - i];
}

/** A number for a cell: at most two decimals, a real minus sign. */
export const num = (v: number): string => String(Math.round(v * 100) / 100).replace("-", "−");

/** A value as shown in the lesson's language: numbers formatted, text through `words`. */
export function shown(v: Value | undefined, words: Record<string, Text> | undefined, ctx: Ctx): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return num(v);
  const w = words?.[v];
  return w !== undefined ? ctx.t(w) : v;
}

/** A value's nodes: numbers left to right in their own <bdi>, text through rich(). */
export const valueNodes = (v: Value | undefined, s: string, rtl: boolean): Node[] => (typeof v === "number" ? [h("bdi", { dir: "ltr" }, s)] : rich(s, rtl));

/** About how wide a text is, in em: estimated from its letters, so nothing is measured while playing. */
export function ems(s: string, mono = false): number {
  if (mono) return s.length * 0.6;
  let w = 0;
  for (const ch of s) {
    w += /[؀-ۿ]/.test(ch) ? 0.6 : /[ijlI.,'|!:;]/.test(ch) ? 0.3 : /[ftr ()]/.test(ch) ? 0.38 : /[mwMW]/.test(ch) ? 0.86 : /[A-Z0-9%]/.test(ch) ? 0.66 : 0.57;
  }
  return w * 1.04;
}

export const toneVar = (t: string | undefined, fallback = "fg"): string => `var(--ls-${t === "surface" ? "card" : t ?? fallback})`;

/** Sets an element's text when it changed (what shows depends only on the last call). */
export function setText(el: Element, s: string): void {
  if (el.textContent !== s) el.textContent = s;
}

export const px = (v: number): string => `${Math.round(v * 10) / 10}px`;
