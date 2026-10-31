/** Small pieces the programming pack's renderers share: frames, easing, code colouring and the code card's fit. */
import type { PackElement, Tone } from "@lessonstudio/spec/core";
import { h } from "../../dom.ts";

export type TraceElement = Extract<PackElement, { type: "trace" }>;
export type TraceStep = TraceElement["steps"][number];
export type FlowchartElement = Extract<PackElement, { type: "flowchart" }>;
export type ArrayElement = Extract<PackElement, { type: "array" }>;
export type ArrayFrame = NonNullable<ArrayElement["frames"]>[number];
export type CalltreeElement = Extract<PackElement, { type: "calltree" }>;
export type CodediffElement = Extract<PackElement, { type: "codediff" }>;

/** Hebrew and Arabic letters: text without any (a label like "m >= 50?") is code, and keeps its own order. */
export const RTL = /[\u{590}-\u{8ff}]/u;

export const clamp =(x: number, lo = 0, hi = 1): number => (x < lo ? lo : x > hi ? hi : x);
/** Smoothstep: eases a 0–1 blend in and out. */
export const smooth = (x: number): number => { const t = clamp(x); return t * t * (3 - 2 * t); };
export const toneVar = (t: Tone | undefined, fallback: string): string => `var(--ls-${t === "surface" ? "card" : t ?? fallback})`;

/** The frames either side of `frame` and how far between them it is. */
export function between(count: number, frame: number): [number, number, number] {
  if (count <= 1) return [0, 0, 0];
  const f = clamp(frame, 0, count - 1);
  const i = Math.min(count - 2, Math.floor(f + 1e-9));
  return [i, i + 1, f - i];
}

/** Monospace: a character is about this share of the font size wide (Droid/Noto Sans Mono, Menlo, Consolas). */
export const CH = 0.61;
/** A line of code is this many font sizes tall. */
export const LH = 1.4;
/** The code card's padding and border, in pixels. */
export const PAD_X = 14;
export const PAD_Y = 12;
export const BORDER = 3;

/** The largest code size (up to `max`) at which `lines` fit a card of w × h, line numbers included. */
export function codeSize(lines: readonly string[], w: number, h: number, max: number): number {
  const longest = Math.max(1, ...lines.map((l) => l.length));
  const digits = String(lines.length).length;
  const byW = (w - 2 * (PAD_X + BORDER)) / ((longest + digits + 1) * CH);
  const byH = (h - 2 * (PAD_Y + BORDER)) / (lines.length * LH);
  return Math.max(12, Math.floor(Math.min(max, byW, byH)));
}
/** How wide a code card must be for `lines` at `size`. */
export const codeWidth = (lines: readonly string[], size: number): number =>
  Math.ceil((Math.max(1, ...lines.map((l) => l.length)) + String(lines.length).length + 1) * CH * size + 2 * (PAD_X + BORDER) + 2);

const PY_KW = new Set("False None True and as assert break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield".split(" "));
const PY_FN = new Set("print len range input int str float list dict set tuple sum min max abs sorted enumerate zip type round bool".split(" "));
const SQL_KW = new Set(("SELECT FROM WHERE AND OR NOT INSERT INTO VALUES UPDATE SET DELETE CREATE TABLE JOIN INNER LEFT RIGHT OUTER ON GROUP BY " +
  "ORDER HAVING LIMIT AS DISTINCT NULL IS IN LIKE BETWEEN DESC ASC PRIMARY KEY INTEGER TEXT REAL COUNT SUM AVG MIN MAX CASE WHEN THEN ELSE END " +
  "UNION ALL EXISTS DROP ALTER ADD").split(" "));
const PY = /(#.*$)|([rbfuRBFU]{0,2}(?:'(?:\\.|[^'\\])*'?|"(?:\\.|[^"\\])*"?))|(\b\d+(?:\.\d+)?\b)|([A-Za-z_]\w*)/g;
const SQL = /(--.*$)|('(?:[^']|'')*'?)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_]\w*)/g;

/** One line of code as text nodes and coloured spans: comments, strings, numbers, keywords, built-in functions. */
export function colour(line: string, lang: string | undefined): Node[] {
  if (lang === "plain" || !line) return [document.createTextNode(line || " ")];
  const sql = lang === "sql";
  const re = new RegExp(sql ? SQL : PY);
  const out: Node[] = [];
  let last = 0;
  for (const m of line.matchAll(re)) {
    const word = m[4];
    const cls = m[1] ? "pc-c" : m[2] ? "pc-s" : m[3] ? "pc-n"
      : word && (sql ? SQL_KW.has(word.toUpperCase()) : PY_KW.has(word)) ? "pc-k" : word && !sql && PY_FN.has(word) ? "pc-f" : "";
    if (!cls) continue;
    if (m.index! > last) out.push(document.createTextNode(line.slice(last, m.index)));
    out.push(h("span", { className: cls }, m[0]));
    last = m.index! + m[0].length;
  }
  if (last < line.length) out.push(document.createTextNode(line.slice(last)));
  return out;
}

/** A code card's line: its number in the gutter and the coloured text. */
export function codeLine(n: number | string, text: string, lang: string | undefined, digits: number): { row: HTMLElement; no: HTMLElement } {
  const no = h("span", { className: "pc-no" }, String(n));
  no.style.width = `${digits * CH + 0.4}em`;
  const row = h("div", { className: "pc-ln" }, no, h("span", { className: "pc-tx" }, ...colour(text, lang)));
  return { row, no };
}

/** A box placed at x, y, w, h (stage pixels inside the element). */
export function place(el: HTMLElement, x: number, y: number, w: number, hh: number): HTMLElement {
  el.style.cssText += `;left:${Math.round(x)}px;top:${Math.round(y)}px;width:${Math.round(w)}px;height:${Math.round(hh)}px`;
  return el;
}
