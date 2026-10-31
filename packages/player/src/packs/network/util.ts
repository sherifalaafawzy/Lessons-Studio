/**
 * What the network pack's renderers share: device glyphs, text that fits (estimated from letter widths, so nothing is
 * measured while playing), labels in SVG that read right in right-to-left languages, and tones.
 */
import type { PackElement, Tone } from "@lessonstudio/spec";
import { ltrRuns } from "../../bidi.ts";
import { svg } from "../../dom.ts";
import { icon } from "../../icons.ts";
import { fix } from "../../motion.ts";
import type { Ctx } from "../../templates/types.ts";

export type Topology = Extract<PackElement, { type: "topology" }>;
export type Sequence = Extract<PackElement, { type: "sequence" }>;
export type Layers = Extract<PackElement, { type: "layers" }>;
export type Packet = Extract<PackElement, { type: "packet" }>;
export type NetGlyph = Topology["devices"][number]["kind"];

/** 24 px glyphs, 2 px round strokes, like the player's own icons; the rest come from icons.ts. */
const PATHS: Partial<Record<NetGlyph, string[]>> = {
  laptop: ["M4 5h16v10H4z", "M2 19h20", "M4 15l-2 4", "M20 15l2 4"],
  desktop: ["M3 4h18v12H3z", "M12 16v4", "M8 20h8"],
  router: ["M3 13h18v7H3z", "M7 16.5h.01", "M11 16.5h.01", "M6 13V8", "M18 13V8", "M15 5a4 4 0 0 1 6 0"],
  switch: ["M2 8h20v9H2z", "M5.5 12.5h2", "M11 12.5h2", "M16.5 12.5h2"],
  tower: ["M12 9v12", "M8 21l4-12 4 12", "M9.3 17h5.4", "M8.5 5.5a5 5 0 0 0 0 7", "M15.5 5.5a5 5 0 0 1 0 7", "M5.8 2.8a8.5 8.5 0 0 0 0 12.4", "M18.2 2.8a8.5 8.5 0 0 1 0 12.4"],
  sensor: ["M7 13h10v8H7z", "M10 17h4", "M9.5 9.5a3.5 3.5 0 0 1 5 0", "M7 7a7 7 0 0 1 10 0"],
  gateway: ["M3 12h18v8H3z", "M7 16h.01", "M11 16h.01", "M15 16h3", "M12 12V3", "M9 6l3-3 3 3"],
  satellite: ["M12 8.5l3.5 3.5-3.5 3.5-3.5-3.5z", "M5.5 2.5l3 3-3 3-3-3z", "M18.5 15.5l3 3-3 3-3-3z", "M7 7l2.5 2.5", "M14.5 14.5L17 17", "M14.5 9.5L18 6", "M18 3a3 3 0 0 1 3 3"],
  tool: ["M14.5 3.5a5 5 0 0 0-5.6 6.9L3.5 15.8a1.9 1.9 0 0 0 2.7 2.7l5.4-5.4a5 5 0 0 0 6.9-5.6l-2.8 2.8-2.6-.4-.4-2.6z"],
  globe: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z", "M3 12h18", "M12 3c3 3.5 3 14.5 0 18", "M12 3c-3 3.5-3 14.5 0 18"],
  browser: ["M3 5h18v14H3z", "M3 9h18", "M6 7h.01", "M9 7h.01"],
  eye: ["M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z", "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"],
};
const CORE: Partial<Record<NetGlyph, Parameters<typeof icon>[0]>> = {
  phone: "phone", server: "server", cloud: "cloud", user: "user", bot: "bot", database: "data", lock: "lock", shield: "shield",
};

/** A glyph centred on (cx, cy), `size` pixels square. */
export function glyph(kind: NetGlyph, cx: number, cy: number, size: number): SVGElement {
  const core = CORE[kind];
  const g = core ? icon(core, size, "pn-gl") : svg("svg", { viewBox: "0 0 24 24", width: fix(size, 1), height: fix(size, 1), className: "pn-gl" }, ...(PATHS[kind] ?? []).map((d) => svg("path", { d })));
  g.setAttribute("x", fix(cx - size / 2, 1));
  g.setAttribute("y", fix(cy - size / 2, 1));
  return g;
}

/** Label size from the design stage: 34 px on a 1280-wide stage, never under 24 (a 720-wide stage). */
export const baseSize = (ctx: Ctx, size: number | undefined): number => size ?? Math.round((34 * Math.max(ctx.design.W, 904)) / 1280);

/** Roughly how wide a text is at `size` (bold), from its letters. */
export function est(s: string, size: number): number {
  let w = 0;
  for (const ch of s) {
    const c = ch.charCodeAt(0);
    w += c === 32 ? 0.28 : c >= 0x600 && c <= 0x6ff ? 0.5 : c >= 48 && c <= 57 ? 0.6 : c >= 65 && c <= 90 ? 0.68 : c < 128 ? 0.56 : 0.62;
  }
  return w * size * 1.04;
}

const RTL = /[\u0590-\u08ff\ufb1d-\ufdff\ufe70-\ufefc]/;

/** Left-to-right runs, joined when only a degree sign, spaces or an operator part them: "24 °C" (bidi.ts stops at "°"). */
function runsOf(s: string): [number, number][] {
  const runs: [number, number][] = [];
  for (const r of ltrRuns(s)) {
    const prev = runs[runs.length - 1];
    if (prev && /^[\s°=+×–-]*$/.test(s.slice(prev[1], r[0]))) prev[1] = r[1];
    else runs.push([r[0], r[1]]);
  }
  return runs;
}

/** The words a text may break between: in right-to-left text, never inside a left-to-right run ("24 °C" stays whole). */
function tokens(s: string): string[] {
  if (!RTL.test(s)) return s.split(/\s+/).filter(Boolean);
  const runs = runsOf(s);
  const out: string[] = [];
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (/\s/.test(ch) && !runs.some(([a, b]) => i > a && i < b)) { if (cur) out.push(cur); cur = ""; }
    else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

/** Breaks a text into at most `max` lines of `width`, shrinking it (down to `min`) until it fits. */
export function fit(s: string, size: number, width: number, max = 2, min = size): { lines: string[]; size: number } {
  const words = tokens(s);
  let best: { lines: string[]; size: number } = { lines: [s], size };
  for (let z = size; z >= min - 0.01; z -= 2) {
    const lines: string[] = [];
    for (const w of words) {
      const last = lines[lines.length - 1];
      if (last !== undefined && est(`${last} ${w}`, z) <= width) lines[lines.length - 1] = `${last} ${w}`;
      else lines.push(w);
    }
    best = { lines, size: z };
    if (lines.length <= max && lines.every((l) => est(l, z) <= width)) return best;
  }
  // Still too long: the last size, its lines joined down to `max`.
  if (best.lines.length > max) best.lines = [...best.lines.slice(0, max - 1), best.lines.slice(max - 1).join(" ")];
  return best;
}

/**
 * Left-to-right runs (Latin words, numbers, codes) isolated with LRI … PDI, so they keep their order in a
 * right-to-left SVG text: SVG has no <bdi>.
 */
export function iso(s: string, rtl: boolean): string {
  if (!rtl) return s;
  const runs = runsOf(s);
  let out = "";
  let last = 0;
  for (const [a, b] of runs) { out += `${s.slice(last, a)}\u2066${s.slice(a, b)}\u2069`; last = b; }
  return out + s.slice(last);
}


/**
 * A text of one or more lines; (x, y) is the first line's baseline. `anchor` is logical: in right-to-left text
 * "start" is its right end. `ltr` keeps a value (an address, a port) left to right in every language.
 */
export function label(lines: string[], x: number, y: number, size: number, cls: string, ctx: Ctx, anchor: "start" | "middle" | "end" = "middle", ltr = false): SVGElement {
  // Right to left only for text with right-to-left letters: an address, a code or "25 °C" reads left to right anywhere.
  const rtl = ctx.dir === "rtl" && !ltr && lines.some((l) => RTL.test(l));
  const t = svg("text", { x: fix(x, 1), y: fix(y, 1), "font-size": fix(size, 1), className: cls, "text-anchor": anchor, direction: rtl ? "rtl" : "ltr" });
  if (lines.length === 1) t.textContent = iso(lines[0]!, rtl);
  else lines.forEach((l, i) => {
    const s = svg("tspan", { x: fix(x, 1), dy: i ? fix(size * 1.15, 1) : 0 });
    s.textContent = iso(l, rtl);
    t.append(s);
  });
  return t;
}

/** A tone's colour; `card` for surface. */
export const tv = (t: Tone | undefined, fallback = "fg"): string => `var(--ls-${t === "surface" ? "card" : t ?? fallback})`;
/** Text on a tone's fill that reads in both brands: dark on the bright tones, the background on the dark ones. */
export const onTone = (t: Tone | undefined): string =>
  t === "accent" || t === "accent2" ? "var(--ls-on-accent)" : t === "surface" || t === "bg" ? "var(--ls-fg)" : "var(--ls-bg)";

/** An arrowhead at (x, y) pointing along `ang` (radians). */
export function head(x: number, y: number, ang: number, s = 16): string {
  return [[x, y], [x - s * Math.cos(ang - 0.45), y - s * Math.sin(ang - 0.45)], [x - s * Math.cos(ang + 0.45), y - s * Math.sin(ang + 0.45)]]
    .map((q) => q.map((v) => fix(v, 1)).join(",")).join(" ");
}

/** Slow at both ends: a packet pauses at each device. */
export const smooth = (k: number): number => k * k * (3 - 2 * k);
