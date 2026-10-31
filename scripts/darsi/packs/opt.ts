/**
 * design.json bodies for the optimization pack (docs/packs/opt.md lists them): `graph`, `schedule`, `knapsack`, `lp`,
 * `searchtree`. Each draws one element over the whole body, timed to the scene's sentences (counted from 0):
 *   "s": the sentence it comes in on; "frames": [a, b] plays the steps from sentence a to the end of sentence b.
 * The school problems are the track's own (the shortest way, the bus route, exam slots, the timetable, the printing,
 * the truck, the garden), with the same numbers as Darsi's Labs; a graph, a knapsack and an lp can also take their own.
 */
import type { Element, Text, Track, When } from "../../../packages/spec/src/index.ts";
import {
  busRoute, colourFrames, dijkstraFrames, EXAMS, examSlots, gardenLp, knapsackDP, knapsackGreedy, kruskalFrames, lp2d, lpLevels,
  pavedRoads, printingGantt, routeFrames, shortestWay, SHORTEST, timetableGrid, truckBag, truckTable, truckTree, TRUCK_CAP, branchAndBound,
  type Box, type GraphEdge, type GraphElement, type GraphNode, type KnapsackElement, type LpElement, type Load,
} from "../../../packages/ops/src/packs/opt.ts";
import type { AText, BodyBuilder, BodyCtx } from "./types.ts";

type O = Record<string, unknown>;
const isObj = (v: unknown): v is O => typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const fail = (c: BodyCtx, what: string): never => { throw new Error(`${c.where}: ${what}`); };
const spec = (v: unknown, c: BodyCtx, name: string): O => (isObj(v) ? v : fail(c, `the ${name} body needs an object`));
const sentence = (v: unknown, c: BodyCtx, what: string): number => {
  if (v === undefined) return 0;
  if (!Number.isInteger(v) || (v as number) < 0 || (v as number) >= c.n) fail(c, `${what} must be a sentence number from 0 to ${c.n - 1}`);
  return v as number;
};
/** The body's box: the whole body, a little taller (as the science bodies). */
const area = (c: BodyCtx, id: string): Box => ({ id, x: c.box.x, y: c.box.y - 10, w: c.box.w, h: c.box.h + 30 });

/** A property running from a to b between two moments. */
const ramp = (prop: Track["prop"], from: When, to: When, a: number, b: number): Track => ({ prop, keys: [{ at: from, value: a }, { at: to, value: b, ease: "linear" }] });
/** Comes in on sentence s. */
const comeIn = (c: BodyCtx, s: number): Track => ramp("reveal", c.at(s, s ? 0 : 0.3), c.at(s, (s ? 0 : 0.3) + 1.2), 0, 1);
/** Plays steps 0 … last from the start of sentence a to the end of sentence b (the next sentence's start, or 2.5 s after the last one starts). */
function play(c: BodyCtx, fr: unknown, s0: number, last: number): Track {
  const [a, b] = Array.isArray(fr) && fr.length === 2 ? fr.map((v, i) => sentence(v, c, `frames[${i}]`)) as [number, number] : [s0, c.n - 1];
  if (b < a) fail(c, "frames: [from, to] with from ≤ to");
  return ramp("frame", c.at(a), b + 1 < c.n ? c.at(b + 1) : c.at(b, 2.5), 0, Math.max(1, last));
}
/** Lights parts on sentences: [{ <key>: index or id, s }]. */
function lights(c: BodyCtx, list: unknown, find: (x: unknown) => number): Track | null {
  if (list === undefined) return null;
  if (!Array.isArray(list)) fail(c, "focus must be a list of { …, s }");
  const keys = (list as unknown[]).map((f, i) => {
    if (!isObj(f)) fail(c, `focus[${i}] must be an object`);
    return { at: c.at(sentence((f as O).s, c, `focus[${i}].s`)), value: find(f), ease: "step" as const };
  });
  return { prop: "focus", keys };
}
const tracks = <E extends Element>(el: E, ...t: (Track | null)[]): E => ({ ...el, anim: t.filter((x): x is Track => !!x) });
const text = (c: BodyCtx, t: unknown, what: string): Text => c.T(t as AText, what);

/* ---------- graph ---------- */

/** A custom map: nodes { id, x, y, text, at, square } and edges [from id, to id, length]. */
function customMap(g: O, c: BodyCtx): { nodes: GraphNode[]; edges: GraphEdge[]; ids: string[] } {
  if (!Array.isArray(g.nodes) || !g.nodes.length) fail(c, "a graph's own map needs nodes");
  const ids: string[] = [];
  const nodes = (g.nodes as unknown[]).map((v, i) => {
    if (!isObj(v) || typeof v.id !== "string" || !isNum(v.x) || !isNum(v.y)) return fail(c, `graph node ${i + 1} needs id, x and y`);
    ids.push(v.id);
    return { x: v.x, y: v.y, ...(v.text !== undefined ? { label: text(c, v.text, `graph node ${v.id}`) } : {}), ...(v.at ? { at: v.at as GraphNode["at"] } : {}), ...(v.square ? { shape: "square" as const } : {}) };
  });
  const edges = (Array.isArray(g.edges) ? g.edges : []).map((e: unknown, i: number) => {
    if (!Array.isArray(e) || e.length < 2) return fail(c, `graph edge ${i + 1} must be [from, to, length]`);
    const a = ids.indexOf(String(e[0])), b = ids.indexOf(String(e[1]));
    if (a < 0 || b < 0) fail(c, `graph edge ${i + 1} names a node that isn't there`);
    return { a, b, ...(isNum(e[2]) ? { w: e[2] } : {}) };
  });
  return { nodes, edges, ids };
}

const graph: BodyBuilder = (raw, c) => {
  const g = spec(raw, c, "graph");
  const s = sentence(g.s, c, "s");
  const algo = g.algo ?? "dijkstra";
  const map = g.map ?? "shortest";
  let el: GraphElement;
  let ids: string[];
  if (map === "shortest") {
    ids = SHORTEST.nodes.map((n) => n.name.en.toLowerCase());
    const closed = Array.isArray(g.closed) ? (g.closed as unknown[]).map((p) => {
      const [a, b] = Array.isArray(p) ? p.map((x) => ids.indexOf(String(x).toLowerCase())) : [-1, -1];
      const k = SHORTEST.roads.findIndex(([x, y]) => (x === a && y === b) || (x === b && y === a));
      return k >= 0 ? k : fail(c, `closed: no road between ${JSON.stringify(p)}`);
    }) : [];
    if (algo === "kruskal") el = pavedRoads(area(c, "graph"), c.langs);
    else {
      el = shortestWay(area(c, "graph"), c.langs);
      if (algo === "dijkstra") el.frames = dijkstraFrames(el.nodes, el.edges!, ids.indexOf(String(g.from ?? "home")), ids.indexOf(String(g.to ?? "school")), c.langs, { closed }).frames;
      else if (algo === "none") delete el.frames;
      else fail(c, `the shortest-way map takes algo dijkstra, kruskal or none, not ${String(algo)}`);
    }
  } else if (map === "bus") {
    if (algo !== "route" && algo !== "dijkstra") fail(c, "the bus map plays the route (nearest neighbour, then 2-opt)");
    el = busRoute(area(c, "graph"), c.langs);
    ids = el.nodes.map((_, i) => (i ? String(i) : "school"));
  } else if (map === "exams") {
    if (algo !== "colour" && algo !== "dsatur" && algo !== "greedy" && algo !== "dijkstra") fail(c, "the exams map takes algo dsatur or greedy (colouring)");
    el = examSlots(area(c, "graph"), c.langs, algo === "greedy" ? "greedy" : "dsatur");
    ids = EXAMS.names.map((n) => n.en.toLowerCase());
  } else if (isObj(map)) {
    const m = customMap(map, c);
    ids = m.ids;
    el = { ...area(c, "graph"), type: "graph", nodes: m.nodes, edges: m.edges, fit: map.fit === "keep" ? "keep" : "fill" };
    const at = (k: string, d: number): number => { const i = ids.indexOf(String(g[k] ?? ids[d])); return i >= 0 ? i : fail(c, `${k}: no node ${String(g[k])}`); };
    // A unit for the notes and the total ({ en, ar-EG }); km by default.
    const u = isObj(g.unit) && typeof g.unit.en === "string" ? { en: g.unit.en, ar: String(g.unit[arOf(c)] ?? g.unit.en), eg: String(g.unit[arOf(c)] ?? g.unit.en) } : undefined;
    if (u) el.unit = text(c, g.unit, "graph unit");
    if (algo === "dijkstra") el.frames = dijkstraFrames(m.nodes, m.edges, at("from", 0), at("to", ids.length - 1), c.langs, u ? { unit: u } : {}).frames;
    else if (algo === "kruskal") el.frames = kruskalFrames(m.nodes, m.edges, c.langs, u ? { unit: u } : {}).frames;
    else if (algo === "dsatur" || algo === "greedy") el.frames = colourFrames(m.nodes, m.edges, c.langs, { method: algo }).frames;
    else if (algo === "route") {
      const r = routeFrames(m.nodes, c.langs);
      el = { ...el, edges: [], frames: r.frames };
    } else if (algo !== "none") fail(c, `unknown graph algo ${String(algo)}`);
    if (algo === "dijkstra") el = { ...el, totalLabel: c.T({ en: "Shortest way", [arOf(c)]: "أقصر طريق" }, "graph total") };
  } else return fail(c, `graph map must be shortest, bus, exams or { nodes, edges }, not ${JSON.stringify(map)}`);
  const n = el.frames?.length ?? 0;
  const focus = lights(c, g.focus, (f) => {
    const i = ids.indexOf(String((f as O).node).toLowerCase());
    return i >= 0 ? i + 1 : fail(c, `focus: no node ${String((f as O).node)}`);
  });
  let bus: Track | null = null;
  if (g.bus !== undefined) {
    const b = sentence(g.bus, c, "bus");
    bus = { prop: "pass", keys: [{ at: 0, value: -1 }, { at: c.at(b), value: 0, ease: "step" }, { at: c.at(b, 2), value: 1, ease: "linear" }, { at: c.at(b, 2.3), value: -1, ease: "step" }] };
  }
  return [tracks(el, comeIn(c, s), n > 1 ? play(c, g.frames, s, n - 1) : null, focus, bus)];
};
const arOf = (c: BodyCtx): string => c.langs.find((l) => l.startsWith("ar")) ?? "ar-EG";

/* ---------- schedule ---------- */

const schedule: BodyBuilder = (raw, c) => {
  const g = spec(raw, c, "schedule");
  const s = sentence(g.s, c, "s");
  const kind = g.kind ?? "timetable";
  let el;
  if (kind === "timetable") {
    const rules = Array.isArray(g.rules) ? (g.rules as unknown[]).map(String) : ["huda", "test"];
    try { el = timetableGrid(area(c, "schedule"), c.langs, rules); } catch (e) { return fail(c, (e as Error).message); }
  } else if (kind === "printing") el = printingGantt(area(c, "schedule"), c.langs);
  else return fail(c, `schedule kind must be timetable or printing, not ${String(kind)}`);
  const n = el.frames?.length ?? 0;
  const focus = lights(c, g.focus, (f) => {
    const i = (f as O).item;
    return Number.isInteger(i) && (i as number) >= 1 && (i as number) <= el.items.length ? (i as number) : fail(c, `focus: item must be 1 to ${el.items.length}`);
  });
  return [tracks(el, comeIn(c, s), n > 1 ? play(c, g.frames, s, n - 1) : null, focus)];
};

/* ---------- knapsack ---------- */

const knapsack: BodyBuilder = (raw, c) => {
  const g = spec(raw, c, "knapsack");
  const s = sentence(g.s, c, "s");
  const show = g.show ?? "bag";
  let el: KnapsackElement;
  if (g.items === undefined) el = show === "table" ? truckTable(area(c, "knapsack"), c.langs) : truckBag(area(c, "knapsack"), c.langs, { best: g.best !== false });
  else {
    if (!Array.isArray(g.items) || !g.items.length || g.items.length > 8) fail(c, "knapsack items: 1 to 8 of { text, w, v }");
    const items: Load[] = (g.items as unknown[]).map((it, i) => (isObj(it) && isNum(it.w) && isNum(it.v) ? { label: text(c, it.text, `knapsack item ${i + 1}`), w: it.w, v: it.v } : fail(c, `knapsack item ${i + 1} needs text, w and v`)));
    const cap = isNum(g.cap) ? g.cap : fail(c, "knapsack cap: the limit");
    const unit = g.unit !== undefined ? text(c, g.unit, "knapsack unit") : undefined;
    const vunit = g.vunit !== undefined ? text(c, g.vunit, "knapsack vunit") : undefined;
    const base = { ...area(c, "knapsack"), type: "knapsack" as const, items, cap, ...(unit ? { unit } : {}), ...(vunit ? { vunit } : {}) };
    if (show === "table") {
      const step = isNum(g.step) ? g.step : 1;
      if (Math.floor(cap / step) + 1 > 21) fail(c, "knapsack table: at most 21 columns (cap ÷ step + 1)");
      const run = knapsackDP(items, cap, step, c.langs);
      el = { ...base, show: "table", step, table: run.table, frames: run.frames };
    } else el = { ...base, frames: knapsackGreedy(items, cap, c.langs, { best: g.best !== false }).frames };
  }
  const n = el.frames?.length ?? 0;
  const focus = lights(c, g.focus, (f) => {
    const i = (f as O).item;
    return Number.isInteger(i) && (i as number) >= 1 && (i as number) <= el.items.length ? (i as number) : fail(c, `focus: item must be 1 to ${el.items.length}`);
  });
  return [tracks(el, comeIn(c, s), n > 1 ? play(c, g.frames, s, n - 1) : null, focus)];
};

/* ---------- lp ---------- */

const lp: BodyBuilder = (raw, c) => {
  const g = spec(raw, c, "lp");
  let el: LpElement;
  if (g.cons === undefined) {
    const prices = Array.isArray(g.prices) && g.prices.length === 2 && g.prices.every(isNum) ? (g.prices as [number, number]) : undefined;
    el = gardenLp(area(c, "lp"), c.langs, { ...(prices ? { prices } : {}), ints: !!g.ints, values: !!g.values });
  } else {
    if (!Array.isArray(g.cons) || !g.cons.length || g.cons.length > 6) fail(c, "lp cons: 1 to 6 of { a, b, c, text }");
    const cons = (g.cons as unknown[]).map((k, i) => (isObj(k) && isNum(k.a) && isNum(k.b) && isNum(k.c)
      ? { a: k.a, b: k.b, c: k.c, ...(k.op === ">=" ? { op: ">=" as const } : {}), ...(k.text !== undefined ? { label: text(c, k.text, `lp limit ${i + 1}`) } : {}) }
      : fail(c, `lp limit ${i + 1} needs a, b and c`)));
    const o = isObj(g.obj) && isNum(g.obj.a) && isNum(g.obj.b) ? g.obj : fail(c, "lp obj: { a, b, text }");
    const obj = { a: o.a as number, b: o.b as number, ...(o.min ? { min: true } : {}), ...(o.text !== undefined ? { label: text(c, o.text, "lp goal") } : {}) };
    const run = lp2d(cons, obj) ?? fail(c, "lp: no plan keeps every limit");
    const range = (k: string, d: [number, number]): [number, number] => (Array.isArray(g[k]) && (g[k] as unknown[]).length === 2 ? (g[k] as [number, number]) : d);
    const top = Math.max(...run.corners.flat()) * 1.3 || 10;
    el = {
      ...area(c, "lp"), type: "lp", xr: range("xr", [0, Math.ceil(top)]), yr: range("yr", [0, Math.ceil(top)]), cons, obj,
      ...(g.x !== undefined ? { xLabel: text(c, g.x, "lp x label") } : {}), ...(g.y !== undefined ? { yLabel: text(c, g.y, "lp y label") } : {}),
      frames: lpLevels(obj.min ? run.value * 2 : 0, run.value, 4).map((level) => ({ level })), ...(g.ints ? { ints: true } : {}), ...(g.values ? { values: true } : {}),
    };
  }
  // The limits come in on their sentences (default all on s), then the region and its corners.
  const n = el.cons.length;
  const s = sentence(g.s, c, "s");
  const when = Array.isArray(g.limits) ? (g.limits as unknown[]).map((v, i) => sentence(v, c, `limits[${i}]`)) : el.cons.map(() => s);
  if (when.length !== n) fail(c, `limits: one sentence for each of the ${n} limits`);
  const region = sentence(g.region ?? when[n - 1], c, "region");
  const keys = when.flatMap((k, i) => [{ at: c.at(k, i && when[i - 1] === k ? i * 0.8 : 0), value: i / (n + 2) }, { at: c.at(k, (i && when[i - 1] === k ? i * 0.8 : 0) + 0.6), value: (i + 1) / (n + 2), ease: "linear" as const }]);
  keys.push({ at: c.at(region, region === when[n - 1] ? n * 0.8 : 0), value: n / (n + 2) }, { at: c.at(region, (region === when[n - 1] ? n * 0.8 : 0) + 1.2), value: 1, ease: "linear" });
  const slide = Array.isArray(g.slide) ? play(c, g.slide, 0, (el.frames?.length ?? 1) - 1) : null;
  return [tracks(el, { prop: "reveal", keys }, slide)];
};

/* ---------- searchtree ---------- */

const searchtree: BodyBuilder = (raw, c) => {
  const g = spec(raw, c, "searchtree");
  const s = sentence(g.s, c, "s");
  let el;
  if (g.items === undefined) {
    const k = isNum(g.loads) ? g.loads : 3;
    if (k < 2 || k > 4) fail(c, "searchtree loads: 2 to 4 of the truck's loads (a tree small enough to read)");
    el = truckTree(area(c, "searchtree"), c.langs, k);
  } else {
    if (!Array.isArray(g.items) || g.items.length < 2 || g.items.length > 4) fail(c, "searchtree items: 2 to 4 of { text, short, w, v }");
    const items = (g.items as unknown[]).map((it, i) => (isObj(it) && isNum(it.w) && isNum(it.v) ? { label: text(c, it.text, `searchtree item ${i + 1}`), w: it.w, v: it.v, short: text(c, it.short ?? it.text, `searchtree item ${i + 1} short`) } : fail(c, `searchtree item ${i + 1} needs text, w and v`)));
    const run = branchAndBound(items, isNum(g.cap) ? g.cap : TRUCK_CAP, c.langs, { short: items.map((it) => it.short) });
    el = { ...area(c, "searchtree"), type: "searchtree" as const, steps: run.steps, totalLabel: c.T({ en: "Best so far", [arOf(c)]: "أحسن حاجة لحد دلوقتي" }, "searchtree total") };
  }
  const n = el.steps.length;
  return [tracks({ ...el, frame: 0 }, play(c, g.frames, s, n - 1))];
};

export const bodies: Record<string, BodyBuilder> = { graph, schedule, knapsack, lp, searchtree };
