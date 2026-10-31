// The science elements in the studio (equations, plots, networks, architecture diagrams, tables): ready-made elements
// for the Add menus, sized to the stage, and the pure helpers behind the inspector's forms. Numbers and points are
// edited as text; every helper here returns props for one updateElement, so undo and sync work as for any edit.
import type { AnimProp, ArchElement, Element, MathElement, NetElement, PlotElement, PlotSeries, TableElement, Text, Tone } from "@lessonstudio/spec";
import { SCIENCE_LIMITS, compileExpr, packOf, parseTex, pick } from "@lessonstudio/spec";
import { ARCH_PRESETS, archPreset, descentPlot, lossPlot, trainNet, trainingNet, trainingPlot, tx, type ArchPreset, type Trained } from "@lessonstudio/ops";
import type { Key } from "./i18n.ts";

export const SCIENCE = ["math", "plot", "net", "arch", "table"] as const;
export const isScience = (el: Element): boolean => (SCIENCE as readonly string[]).includes(el.type);
export const ITEM_ID = /^[A-Za-z0-9_-]{1,40}$/;

/* ---------- numbers and points as text ---------- */

/** "1, 2.5, -3" (spaces, commas or the Arabic comma between) → numbers; null if any part isn't one. */
export function parseNums(s: string): number[] | null {
  const parts = s.replace(/[−–]/g, "-").split(/[\s,،]+/).filter(Boolean);
  const n = parts.map(Number);
  return n.every(Number.isFinite) ? n : null;
}

/** Lists of numbers separated by ";" or new lines: "a, b; a, b" (a plot's parameters per frame, a map's rows). */
export function parseRows(s: string): number[][] | null {
  const rows = s.split(/[;؛\n]+/).map((r) => r.trim()).filter(Boolean);
  const out: number[][] = [];
  for (const r of rows) {
    const n = parseNums(r);
    if (!n || !n.length) return null;
    out.push(n);
  }
  return out;
}

/** "x, y; x, y" (or one point per line) → points; null when one isn't two numbers. */
export function parsePoints(s: string): [number, number][] | null {
  const rows = parseRows(s);
  if (!rows || rows.some((r) => r.length !== 2)) return null;
  return rows.map((r) => [r[0]!, r[1]!]);
}

export const numsText = (n: readonly number[] | undefined): string => (n ?? []).join(", ");
export const rowsText = (r: readonly (readonly number[])[] | undefined): string => (r ?? []).map((x) => x.join(", ")).join("; ");
export const pointsText = (p: readonly (readonly [number, number])[] | undefined): string => (p ?? []).map(([x, y]) => `${x}, ${y}`).join("; ");

/* ---------- equations and expressions ---------- */

export interface Problem { message: string; at?: number }

/** What is wrong with an equation, and where (from 0), or null when the player can draw it. */
export function texProblem(src: string): Problem | null {
  try { parseTex(src); return null; } catch (e) { return { message: (e as Error).message, at: (e as { at?: number }).at }; }
}

/** An equation's \g parts and \w words, or null when it doesn't parse. */
export function texInfo(src: string): { groups: number[]; words: string[] } | null {
  try { const p = parseTex(src); return { groups: p.groups, words: p.words }; } catch { return null; }
}

/** What is wrong with a plot expression (y as a function of x and a–d), and where, or null. */
export function exprProblem(src: string): Problem | null {
  try { compileExpr(src); return null; } catch (e) { return { message: (e as Error).message, at: (e as { at?: number }).at }; }
}

/** An equation's sources, by language ("" for one source in every language). */
export function texSources(el: MathElement): Record<string, string> {
  return typeof el.tex === "string" ? { "": el.tex } : { ...(el.tex as Record<string, string>) };
}

/**
 * The props for a new equation source: the words it names that `words` lacks get the key itself in every language,
 * as a placeholder to translate, so the equation never names a word that isn't there.
 */
export function withTex(el: MathElement, tex: MathElement["tex"], langs: string[]): Record<string, unknown> {
  const words = { ...(el.words ?? {}) };
  let added = false;
  const sources = typeof tex === "string" ? [tex] : Object.values(tex as Record<string, string>);
  for (const src of sources) {
    for (const k of texInfo(src)?.words ?? []) {
      if (!(k in words)) { words[k] = Object.fromEntries(langs.map((l) => [l, k])); added = true; }
    }
  }
  return added ? { tex, words } : { tex };
}

/* ---------- networks ---------- */

/** Why a layer list can't be a network, as a message key, or null. */
export function layersProblem(layers: number[] | null): Key | null {
  if (!layers || layers.length < 2 || layers.length > SCIENCE_LIMITS.layers) return "netLayersCount";
  if (!layers.every((n) => Number.isInteger(n) && n >= 1 && n <= SCIENCE_LIMITS.perLayer)) return "netLayersSize";
  const neurons = layers.reduce((a, b) => a + b, 0);
  const lines = layers.slice(1).reduce((a, n, k) => a + n * layers[k]!, 0);
  if (neurons > SCIENCE_LIMITS.neurons || lines > SCIENCE_LIMITS.synapses) return "netTooBig";
  return null;
}

/**
 * The props for new layers: the input and output names follow the new counts, and trained weights and activations
 * (whose shapes no longer fit) are dropped, so the network draws its sample pattern until it is trained again.
 */
export function withLayers(el: NetElement, layers: number[]): Record<string, unknown> {
  const same = (a: number[]) => a.length === el.layers.length && a.every((n, i) => n === el.layers[i]);
  const props: Record<string, unknown> = { layers };
  if (same(layers)) return props;
  if (el.weights) props.weights = null;
  if (el.acts) props.acts = null;
  if (el.frame !== undefined) props.frame = null;
  const lb = el.labels;
  if (lb) {
    const fit = (list: Text[] | undefined, n: number, make: (i: number) => Text): Text[] | undefined =>
      list ? Array.from({ length: n }, (_, i) => list[i] ?? make(i)) : undefined;
    const sub = (i: number): string => String(i + 1).replace(/\d/g, (d) => "₀₁₂₃₄₅₆₇₈₉"[Number(d)]!);
    const next = {
      ...(lb.in ? { in: fit(lb.in, layers[0]!, (i) => `x${sub(i)}`) } : {}),
      ...(lb.out ? { out: fit(lb.out, layers[layers.length - 1]!, (i) => `y${sub(i)}`) } : {}),
      ...(lb.layers ? { layers: fit(lb.layers, layers.length, (i) => String(i + 1)) } : {}),
    };
    props.labels = Object.keys(next).length ? next : null;
  }
  return props;
}

/* ---------- architecture diagrams ---------- */

type ArchParts = Pick<ArchElement, "blocks" | "edges"> & { groups?: ArchElement["groups"] };

/** Renames a block; its arrows and groups follow. */
export function renameBlock(el: ArchElement, from: string, to: string): ArchParts {
  const r = (id: string): string => (id === from ? to : id);
  return {
    blocks: el.blocks.map((b) => (b.id === from ? { ...b, id: to } : b)),
    edges: el.edges.map((e) => ({ ...e, from: r(e.from), to: r(e.to) })),
    ...(el.groups ? { groups: el.groups.map((g) => ({ ...g, blocks: g.blocks.map(r) })) } : {}),
  };
}

/** Removes a block with its arrows; groups lose it, and a group left empty goes. */
export function removeBlock(el: ArchElement, id: string): ArchParts {
  const groups = (el.groups ?? []).map((g) => ({ ...g, blocks: g.blocks.filter((b) => b !== id) })).filter((g) => g.blocks.length);
  return {
    blocks: el.blocks.filter((b) => b.id !== id),
    edges: el.edges.filter((e) => e.from !== id && e.to !== id),
    groups: groups.length ? groups : undefined,
  };
}

/** Puts a block in a group, or takes it out; a block is in one group at most. */
export function toggleMember(el: ArchElement, group: string, block: string): NonNullable<ArchElement["groups"]> {
  return (el.groups ?? []).map((g) => {
    if (g.id === group) return { ...g, blocks: g.blocks.includes(block) ? g.blocks.filter((b) => b !== block) : [...g.blocks, block] };
    return { ...g, blocks: g.blocks.filter((b) => b !== block) };
  });
}

/** archPreset, with a name for blocks it leaves unnamed (the "+" of a residual block), so every text is there. */
export function archFrom(name: ArchPreset, box: { id: string; x: number; y: number; w: number; h: number }, langs: string[]): ArchElement {
  const a = archPreset(name, box, langs);
  a.blocks = a.blocks.map((b) => {
    const empty = typeof b.label === "string" ? !b.label : Object.values(b.label).every((v) => !v);
    return empty ? { ...b, label: b.kind === "add" ? tx("Add", "جمع", langs) : b.kind === "concat" ? tx("Join", "دمج", langs) : tx("Block", "كتلة", langs) } : b;
  });
  return a;
}

/* ---------- tables ---------- */

/** A cell from its text per language: one string (a number when it is one) when every language says the same. */
export function cellFrom(v: Record<string, string>, langs: string[]): string | number | Text {
  const vals = langs.map((l) => (v[l] ?? "").trim());
  if (vals.every((x) => x === vals[0])) {
    const one = vals[0] ?? "";
    return /^-?\d+(\.\d+)?$/.test(one) ? Number(one) : one;
  }
  return Object.fromEntries(langs.map((l, i) => [l, vals[i]!]));
}

export function removeColumn(el: TableElement, k: number): Pick<TableElement, "cols" | "rows"> & { ltr: number[] | null } {
  const ltr = (el.ltr ?? []).filter((i) => i !== k).map((i) => (i > k ? i - 1 : i));
  return { cols: el.cols.filter((_, i) => i !== k), rows: el.rows.map((r) => r.filter((_, i) => i !== k)), ltr: ltr.length ? ltr : null };
}

export function swapColumns(el: TableElement, a: number, b: number): Pick<TableElement, "cols" | "rows"> & { ltr: number[] | null } {
  const sw = <X>(list: X[]): X[] => { const c = [...list]; [c[a], c[b]] = [c[b]!, c[a]!]; return c; };
  const ltr = (el.ltr ?? []).map((i) => (i === a ? b : i === b ? a : i)).sort((x, y) => x - y);
  return { cols: sw(el.cols), rows: el.rows.map(sw), ltr: ltr.length ? ltr : null };
}

/* ---------- plots ---------- */

export const SERIES_KINDS: PlotSeries["kind"][] = ["fn", "line", "area", "dots", "marker", "hline", "vline", "heat"];

/** A new series of a kind, inside the plot's ranges, keeping the colour, dashes and label of the one it replaces. */
export function seriesOf(kind: PlotSeries["kind"], el: PlotElement, keep?: PlotSeries): PlotSeries {
  const [x0, x1] = el.xr;
  const [y0, y1] = el.yr;
  const r = (v: number): number => Math.round(v * 100) / 100;
  const pts = (n: number): [number, number][] => Array.from({ length: n }, (_, i) => [r(x0 + ((i + 1) * (x1 - x0)) / (n + 1)), r(y0 + ((i + 1) * (y1 - y0)) / (n + 1))]);
  const k = (keep ?? {}) as { tone?: Tone; dash?: boolean; label?: Text };
  const extra = { ...(k.tone ? { tone: k.tone } : {}), ...(k.label ? { label: k.label } : {}) };
  const dash = k.dash ? { dash: true } : {};
  switch (kind) {
    case "fn": return { kind, fn: "x", tone: "accent", ...extra, ...dash };
    case "line": case "area": case "dots": return { kind, pts: pts(5), ...extra, ...dash };
    case "marker": return { kind, pts: pts(4), trail: true, ...extra };
    case "hline": return { kind, at: r((y0 + y1) / 2), ...extra, ...dash };
    case "vline": return { kind, at: r((x0 + x1) / 2), ...extra, ...dash };
    case "heat": return { kind, grid: [[0, 1], [1, 0]] };
  }
}

/* ---------- animation ---------- */

/** The properties an element's keyframes may animate (the validator's rules). */
export function usableProps(el: Element): AnimProp[] {
  const out: AnimProp[] = ["opacity", "x", "y", "scale", "rotate"];
  // A technology pack's elements may use all four (what each means is in the pack's docs).
  if (packOf(el.type) && !isScience(el)) return [...out, "reveal", "frame", "focus", "pass"];
  if (["line", "path", "shape"].includes(el.type)) out.push("draw");
  if (["text", "code", "chart", ...SCIENCE].includes(el.type)) out.push("reveal");
  if (el.type === "plot" || el.type === "net") out.push("frame");
  if (isScience(el)) out.push("focus");
  if (el.type === "net" || el.type === "arch") out.push("pass");
  return out;
}

/** The parts `focus` lights up, in order (focus n is the n-th; 0 is none), named in a language ("" when unnamed). */
export function focusParts(el: Element, lang: string): string[] {
  switch (el.type) {
    case "math": {
      const src = typeof el.tex === "string" ? el.tex : pick(el.tex as Text, lang);
      const g = texInfo(src)?.groups ?? [];
      return g.length ? g.map((n) => `\\g{${n}}`) : ["="];
    }
    case "plot": return el.series.map((s) => ("label" in s && s.label ? pick(s.label, lang) : s.kind === "fn" ? `y = ${s.fn}` : s.kind));
    case "net": return el.layers.map((_, i) => (el.labels?.layers?.[i] ? pick(el.labels.layers[i]!, lang) : ""));
    case "arch": return el.blocks.map((b) => pick(b.label, lang) || b.id);
    case "table": return el.rows.map((r) => { const c = r[0]; return typeof c === "number" ? String(c) : c === undefined ? "" : pick(c, lang); });
    default: return [];
  }
}

/* ---------- ready-made elements, sized to the stage ---------- */

export interface Room { w: number; h: number; langs: string[] }

let trained: Trained | null = null;
export const TRAIN_LAYERS = [2, 4, 4, 1];
/** One real training run (seeded, so always the same), made the first time it's needed: a circle of points. */
export function trainingRun(): Trained {
  return (trained ??= trainNet({ layers: TRAIN_LAYERS, data: "circle", epochs: 300, lr: 0.6, frames: 12, sample: [0.2, 0.3] }));
}

/** The room under a scene's title, clear of the captions at the bottom: where a new science element goes. */
export function area(r: Pick<Room, "w" | "h">): { x: number; y: number; w: number; h: number } {
  const m = 60;
  const tall = r.h > r.w;
  const top = tall ? 180 : 150;
  const bottom = tall ? 210 : r.h === r.w ? 120 : 60;
  return { x: m, y: top, w: r.w - 2 * m, h: r.h - top - bottom };
}

/** Two boxes side by side (or one above the other on a tall stage). */
export function pair(r: Pick<Room, "w" | "h">, gap = 40): [{ x: number; y: number; w: number; h: number }, { x: number; y: number; w: number; h: number }] {
  const a = area(r);
  if (r.h > r.w) {
    const hh = Math.round((a.h - gap) / 2);
    return [{ ...a, h: hh }, { ...a, y: a.y + hh + gap, h: hh }];
  }
  const ww = Math.round((a.w - gap) / 2);
  return [{ ...a, w: ww }, { ...a, x: a.x + ww + gap, w: ww }];
}

/** Which way a diagram flows on this stage: across a wide one, down a tall one (and a square one, for long chains). */
export function archFlow(r: Pick<Room, "w" | "h">, blocks: number): ArchElement["flow"] {
  if (r.h > r.w) return "down";
  if (r.h === r.w && blocks >= 6) return "down";
  return undefined;
}

export function archElement(name: ArchPreset, id: string, r: Room, box = area(r)): ArchElement {
  const a = archFrom(name, { id, ...box }, r.langs);
  const flow = archFlow(r, a.blocks.length);
  return flow ? { ...a, flow } : a;
}

export const NEURON_TEX = "\\g{4}{y} = \\g{3}{\\sigma}\\left(\\g{1}{w_1 x_1 + w_2 x_2} \\g{2}{+ \\c{accent}{b}}\\right)";

export function equationElement(id: string, r: Room): MathElement {
  const a = area(r);
  const h = Math.min(180, Math.round(a.h * 0.4));
  return { id, type: "math", x: a.x, y: a.y + Math.round((a.h - h) / 3), w: a.w, h, size: r.w < 800 ? 52 : 64, tex: NEURON_TEX };
}

export function functionPlot(id: string, r: Room): PlotElement {
  const a = area(r);
  const T = (en: string, ar: string): Text => tx(en, ar, r.langs);
  return {
    id, type: "plot", ...a, xr: [-4, 4], yr: [-1.2, 1.5], xTicks: [-4, -2, 0, 2, 4], yTicks: [-1, 0, 1], grid: true,
    xLabel: T("Input", "المدخل"), yLabel: T("Output", "المخرج"),
    series: [
      { kind: "fn", fn: "sigmoid(x)", tone: "accent", label: T("sigmoid", "السيجمويد") },
      { kind: "fn", fn: "tanh(x)", tone: "ok", label: T("tanh", "الظل الزائدي") },
      { kind: "fn", fn: "relu(x)/3", tone: "danger", label: T("ReLU ÷ 3", "ReLU ÷ 3") },
    ],
  };
}

/** A network trained for real: its decision map (the trained one shows; "train" plays the rounds) and its loss. */
export function trainingPair(ids: [string, string], r: Room): [PlotElement, PlotElement] {
  const run = trainingRun();
  const [a, b] = pair(r);
  // The map is square: the points live in a square.
  const side = Math.min(a.w, a.h);
  const map = { ...trainingPlot(run, { id: ids[0], x: a.x + Math.round((a.w - side) / 2), y: a.y + Math.round((a.h - side) / 2), w: side, h: side }), frame: run.heat.length - 1 };
  return [map, lossPlot(run, { id: ids[1], ...b }, r.langs)];
}

export function networkElement(id: string, r: Room): NetElement {
  const run = trainingRun();
  return { ...trainingNet(run, TRAIN_LAYERS, { id, ...area(r) }, r.langs), frame: run.weights.length - 1 };
}

export function descentElement(id: string, r: Room): PlotElement {
  const p = descentPlot("(x-2)^2/2 + 0.5", -1.5, 0.35, 11, { id, ...area(r), xr: [-2, 5], yr: [0, 7] }, r.langs);
  return { ...p, frame: 11 };
}

export function tableElement(id: string, r: Room): TableElement {
  const a = area(r);
  const T = (en: string, ar: string): Text => tx(en, ar, r.langs);
  const w = Math.min(a.w, 800);
  return {
    id, type: "table", x: a.x + Math.round((a.w - w) / 2), y: a.y, w, h: Math.min(a.h, 360), size: 32,
    cols: [T("Model", "النموذج"), T("Accuracy", "الدقة")],
    rows: [[T("Small network", "شبكة صغيرة"), "81%"], [T("Bigger network", "شبكة أكبر"), "93%"], [T("Trained longer", "تدريب أطول"), "96%"]],
    ltr: [1],
  };
}

export interface ScienceKind {
  key: string;
  label: Key;
  /** The ids it needs, from base names. */
  ids: string[];
  make: (r: Room, ids: string[]) => Element[];
}

/** Everything the Add menus offer for science, in the order shown. */
export const SCIENCE_KINDS: ScienceKind[] = [
  { key: "math", label: "sciEquation", ids: ["equation"], make: (r, [a]) => [equationElement(a!, r)] },
  { key: "plot", label: "sciPlot", ids: ["plot"], make: (r, [a]) => [functionPlot(a!, r)] },
  { key: "training", label: "sciTraining", ids: ["map", "loss"], make: (r, [a, b]) => trainingPair([a!, b!], r) },
  { key: "net", label: "sciNet", ids: ["network"], make: (r, [a]) => [networkElement(a!, r)] },
  { key: "descent", label: "sciDescent", ids: ["descent"], make: (r, [a]) => [descentElement(a!, r)] },
  { key: "table", label: "sciTable", ids: ["table"], make: (r, [a]) => [tableElement(a!, r)] },
  ...ARCH_PRESETS.map((name): ScienceKind => ({ key: `arch-${name}`, label: `arch_${name}` as Key, ids: [name], make: (r, [a]) => [archElement(name, a!, r)] })),
];
