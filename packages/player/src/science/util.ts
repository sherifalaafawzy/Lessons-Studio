import type { Tone } from "@lessonstudio/spec";

/** Western digits to Arabic-Indic, with the Arabic decimal separator (Arabic school notation). */
export const arabicDigits = (s: string): string => s.replace(/[0-9]/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)]!).replace(/\./g, "٫");

/** A number for an axis or a cell: at most three decimals, no trailing zeros, a real minus sign. */
export function num(v: number): string {
  if (!Number.isFinite(v)) return "";
  const r = Math.round(v * 1000) / 1000;
  const s = Math.abs(r) >= 1e5 ? r.toExponential(1) : String(r);
  return s.replace("-", "−");
}

/** About five round ticks between lo and hi. */
export function niceTicks(lo: number, hi: number, n = 5): number[] {
  const span = hi - lo;
  if (!(span > 0)) return [lo];
  const raw = span / n;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= n + 0.5) ?? 10 * mag;
  const out: number[] = [];
  for (let t = Math.ceil(lo / step - 1e-9) * step; t <= hi + 1e-9; t += step) out.push(Math.round(t / step) * step);
  return out;
}

export const toneVar = (t: Tone | undefined, fallback = "fg"): string => `var(--ls-${t === "surface" ? "card" : t ?? fallback})`;

/** Colours for classes 0–3 and for series in turn. */
export const CLASS_TONES: Tone[] = ["accent", "ok", "danger", "accent2"];
export const SERIES_TONES: Tone[] = ["accent", "ok", "danger", "accent2", "fg"];

/** Linear blend of two equal-length number lists. */
export function blend(a: readonly number[], b: readonly number[], k: number): number[] {
  return a.map((v, i) => v + ((b[i] ?? v) - v) * k);
}

/** The frames either side of `frame` and how far between them it is. */
export function between(count: number, frame: number): [number, number, number] {
  if (count <= 1) return [0, 0, 0];
  const f = Math.min(count - 1, Math.max(0, frame));
  const i = Math.floor(f);
  return [i, Math.min(count - 1, i + 1), f - i];
}

