/**
 * Validation of the optimization pack's elements (graph, schedule, knapsack, lp, searchtree). Limits keep them light
 * (about 300 DOM nodes per element at most) and readable on a phone.
 */
import type { PackCheck, PackCheckCtx } from "../types.ts";

export const OPT_LIMITS = {
  nodes: 16, edges: 40, frames: 60, colours: 6,
  rows: 8, cols: 8, items: 30,
  bagItems: 8, tableCols: 21,
  cons: 6, lattice: 150,
  treeNodes: 31, depth: 5,
};

type O = Record<string, unknown>;
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isObj = (v: unknown): v is O => typeof v === "object" && v !== null && !Array.isArray(v);
const isInt = (v: unknown, lo: number, hi: number): boolean => Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi;
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const isPair = (v: unknown, a: number, b: number): boolean => Array.isArray(v) && v.length === 2 && isInt(v[0], 0, a - 1) && isInt(v[1], 0, b - 1);

export const check: PackCheck = (el, q, c) => {
  if (el.w === undefined || el.h === undefined) c.err("badBox", q, "w and h");
  const e = el as O;
  const tone = (v: unknown, k: string): void => { if (v !== undefined && !c.tones.includes(v as string)) c.err("badTone", `${q}.${k}`); };
  /** The frames list: an array of objects, at most OPT_LIMITS.frames; returns them. */
  const frames = (): O[] => {
    if (e.frames === undefined) return [];
    if (!Array.isArray(e.frames) || !e.frames.length || e.frames.length > OPT_LIMITS.frames) { c.err("badFrames", `${q}.frames`, `1–${OPT_LIMITS.frames}`); return []; }
    e.frames.forEach((f, i) => { if (!isObj(f)) c.err("badFrame", `${q}.frames[${i}]`, "each frame is an object"); else c.text(f.note as never, `${q}.frames[${i}].note`, false); });
    return e.frames.filter(isObj);
  };
  /** A string of one state letter per part. */
  const states = (v: unknown, n: number, ok: string, at: string): void => {
    if (v === undefined) return;
    if (typeof v !== "string" || v.length !== n || [...v].some((ch) => !ok.includes(ch))) c.err("badStates", at, `${n} of "${ok}"`);
  };
  const stepCount = (n: number): void => {
    if (e.frame !== undefined && !(isNum(e.frame) && e.frame >= 0 && e.frame <= Math.max(0, n - 1))) c.err("badFrame", `${q}.frame`, `0–${Math.max(0, n - 1)}`);
  };
  switch (el.type) {
    case "graph": checkGraph(e, q, c, frames, states, stepCount); break;
    case "schedule": checkSchedule(e, q, c, frames, states, stepCount, tone); break;
    case "knapsack": checkKnapsack(e, q, c, frames, states, stepCount); break;
    case "lp": checkLp(e, q, c, frames, stepCount, tone); break;
    case "searchtree": checkTree(e, q, c); break;
  }
};

type Frames = () => O[];
type States = (v: unknown, n: number, ok: string, at: string) => void;
type Steps = (n: number) => void;

function checkGraph(e: O, q: string, c: PackCheckCtx, frames: Frames, states: States, steps: Steps): void {
  const nodes = arr(e.nodes);
  if (!nodes.length || nodes.length > OPT_LIMITS.nodes) c.err("badCount", `${q}.nodes`, `1–${OPT_LIMITS.nodes}`);
  const n = nodes.length;
  nodes.forEach((v, i) => {
    const vq = `${q}.nodes[${i}]`;
    if (!isObj(v) || !isNum(v.x) || !isNum(v.y)) return c.err("badNode", vq, "x and y");
    c.text(v.label as never, `${vq}.label`, false);
    if (v.at !== undefined && !["t", "b", "l", "r"].includes(v.at as string)) c.err("badNode", `${vq}.at`, "t, b, l or r");
    if (v.shape !== undefined && v.shape !== "circle" && v.shape !== "square") c.err("badNode", `${vq}.shape`, "circle or square");
  });
  const edges = arr(e.edges);
  if (edges.length > OPT_LIMITS.edges) c.err("badCount", `${q}.edges`, `0–${OPT_LIMITS.edges}`);
  if (e.edges !== undefined && !Array.isArray(e.edges)) c.err("badEdge", `${q}.edges`, "a list of edges");
  const seen = new Set<string>();
  edges.forEach((g, i) => {
    const gq = `${q}.edges[${i}]`;
    if (!isObj(g) || !isInt(g.a, 0, n - 1) || !isInt(g.b, 0, n - 1) || g.a === g.b) return c.err("badEdge", gq, "a and b: two different node indexes");
    const key = `${Math.min(g.a as number, g.b as number)}-${Math.max(g.a as number, g.b as number)}`;
    if (seen.has(key)) c.warn("dupEdge", gq, key);
    seen.add(key);
    if (g.w !== undefined && !isNum(g.w)) c.err("badEdge", `${gq}.w`, "a number");
    if (g.curve !== undefined && !(isNum(g.curve) && Math.abs(g.curve) <= 0.5)) c.err("badEdge", `${gq}.curve`, "−0.5 to 0.5");
    if (g.pos !== undefined && !(isNum(g.pos) && g.pos >= 0.1 && g.pos <= 0.9)) c.err("badEdge", `${gq}.pos`, "0.1 to 0.9");
  });
  const list = frames();
  list.forEach((f, i) => {
    const fq = `${q}.frames[${i}]`;
    states(f.nodes, n, ".fcvp", `${fq}.nodes`);
    states(f.edges, edges.length, ".ctpxo-", `${fq}.edges`);
    if (f.vals !== undefined && (!Array.isArray(f.vals) || f.vals.length !== n || !f.vals.every((v) => v === null || isNum(v) || (typeof v === "string" && v.length <= 4)))) c.err("badVals", `${fq}.vals`, `${n} numbers, short words or null`);
    if (f.colours !== undefined && (!Array.isArray(f.colours) || f.colours.length !== n || !f.colours.every((v) => isInt(v, 0, OPT_LIMITS.colours)))) c.err("badColours", `${fq}.colours`, `${n} of 0–${OPT_LIMITS.colours}`);
    if (f.path !== undefined && (!Array.isArray(f.path) || f.path.length > 4 * OPT_LIMITS.nodes || !f.path.every((v) => isInt(v, 0, n - 1)))) c.err("badPath", `${fq}.path`, "node indexes in order");
    for (const k of ["cut", "added"] as const) if (f[k] !== undefined && (!Array.isArray(f[k]) || (f[k] as unknown[]).length > 8 || !(f[k] as unknown[]).every((p) => isPair(p, n, n)))) c.err("badPath", `${fq}.${k}`, "pairs of node indexes");
    if (f.total !== undefined && !isNum(f.total)) c.err("badTotal", `${fq}.total`, "a number");
  });
  steps(list.length);
  if (e.fit !== undefined && e.fit !== "keep" && e.fit !== "fill") c.err("badFit", `${q}.fit`, "keep or fill");
  c.text(e.totalLabel as never, `${q}.totalLabel`, false);
  c.text(e.unit as never, `${q}.unit`, false);
}

function checkSchedule(e: O, q: string, c: PackCheckCtx, frames: Frames, states: States, steps: Steps, tone: (v: unknown, k: string) => void): void {
  const gantt = e.kind === "gantt";
  if (e.kind !== undefined && e.kind !== "grid" && !gantt) c.err("badKind", `${q}.kind`, "grid or gantt");
  const rows = arr(e.rows);
  if (!rows.length || rows.length > OPT_LIMITS.rows) c.err("badCount", `${q}.rows`, `1–${OPT_LIMITS.rows}`);
  rows.forEach((r, i) => c.text(r as never, `${q}.rows[${i}]`));
  const cols = arr(e.cols);
  const R = rows.length;
  const C = cols.length;
  let t0 = 0, t1 = 1;
  if (gantt) {
    const s = e.span;
    if (!Array.isArray(s) || s.length !== 2 || !isNum(s[0]) || !isNum(s[1]) || s[0] >= s[1]) c.err("badRange", `${q}.span`, "[from, to], from < to");
    else [t0, t1] = s as [number, number];
    if (e.ticks !== undefined && (!Array.isArray(e.ticks) || e.ticks.length > 13 || !e.ticks.every(isNum))) c.err("badTicks", `${q}.ticks`, "at most 13 numbers");
    c.text(e.unit as never, `${q}.unit`, false);
  } else {
    if (!C || C > OPT_LIMITS.cols) c.err("badCount", `${q}.cols`, `1–${OPT_LIMITS.cols}`);
    cols.forEach((t, i) => c.text(t as never, `${q}.cols[${i}]`));
  }
  const items = arr(e.items);
  if (!items.length || items.length > OPT_LIMITS.items) c.err("badCount", `${q}.items`, `1–${OPT_LIMITS.items}`);
  const inSpan = (v: unknown): boolean => isNum(v) && v >= t0 && v <= t1;
  items.forEach((it, i) => {
    const iq = `${q}.items[${i}]`;
    if (!isObj(it) || !isInt(it.row, 0, R - 1)) return c.err("badItem", iq, "row");
    c.text(it.label as never, `${iq}.label`);
    c.text(it.sub as never, `${iq}.sub`, false);
    tone(it.tone, `items[${i}].tone`);
    if (gantt) {
      if (!isNum(it.len) || it.len <= 0) c.err("badItem", `${iq}.len`, "a length above 0");
      if (it.at !== undefined && !inSpan(it.at)) c.err("badItem", `${iq}.at`, "inside span");
    } else if (it.col !== undefined && !isInt(it.col, 0, C - 1)) c.err("badItem", `${iq}.col`, "a column index");
  });
  const cells = (v: unknown, at: string): void => {
    if (v !== undefined && (!Array.isArray(v) || v.length > R * Math.max(1, C) || !v.every((p) => isPair(p, R, C)))) c.err("badCells", at, "[row, col] pairs");
  };
  if (!gantt) cells(e.blocked, `${q}.blocked`);
  const list = frames();
  list.forEach((f, i) => {
    const fq = `${q}.frames[${i}]`;
    if (f.at !== undefined) {
      if (!Array.isArray(f.at) || f.at.length !== items.length) c.err("badPlaces", `${fq}.at`, `${items.length} places`);
      else f.at.forEach((p, j) => { if (p !== null && !(gantt ? inSpan(p) : isPair(p, R, C))) c.err("badPlaces", `${fq}.at[${j}]`, gantt ? "a start time in span, or null" : "[row, col] or null"); });
    }
    states(f.state, items.length, ".ngfx", `${fq}.state`);
    if (!gantt) { cells(f.opts, `${fq}.opts`); cells(f.bad, `${fq}.bad`); }
    if (f.total !== undefined && !isNum(f.total)) c.err("badTotal", `${fq}.total`, "a number");
  });
  steps(list.length);
  c.text(e.totalLabel as never, `${q}.totalLabel`, false);
}

function checkKnapsack(e: O, q: string, c: PackCheckCtx, frames: Frames, states: States, steps: Steps): void {
  const items = arr(e.items);
  if (!items.length || items.length > OPT_LIMITS.bagItems) c.err("badCount", `${q}.items`, `1–${OPT_LIMITS.bagItems}`);
  items.forEach((it, i) => {
    const iq = `${q}.items[${i}]`;
    if (!isObj(it) || !isNum(it.w) || it.w <= 0 || !isNum(it.v) || it.v < 0) return c.err("badItem", iq, "w > 0 and v ≥ 0");
    c.text(it.label as never, `${iq}.label`);
  });
  if (!isNum(e.cap) || e.cap <= 0) c.err("badCap", `${q}.cap`, "the limit, a number above 0");
  for (const k of ["unit", "vunit", "perLabel"]) c.text(e[k] as never, `${q}.${k}`, false);
  if (e.per !== undefined && !(isNum(e.per) && e.per > 0)) c.err("badPer", `${q}.per`, "a number above 0");
  if (e.show !== undefined && e.show !== "bag" && e.show !== "table") c.err("badShow", `${q}.show`, "bag or table");
  const step = e.step ?? 1;
  if (!isNum(step) || step <= 0) c.err("badStep", `${q}.step`, "the width of a table column, above 0");
  let rows = 0, cols = 0;
  if (e.table !== undefined || e.show === "table") {
    const t = arr(e.table);
    rows = items.length + 1;
    cols = isNum(e.cap) && isNum(step) && step > 0 ? Math.floor(e.cap / step) + 1 : 0;
    if (cols > OPT_LIMITS.tableCols) c.err("badTable", `${q}.table`, `at most ${OPT_LIMITS.tableCols} columns (cap ÷ step + 1)`);
    if (t.length !== rows || !t.every((r) => Array.isArray(r) && r.length === cols && r.every(isNum))) c.err("badTable", `${q}.table`, `${rows} rows of ${cols} numbers`);
  }
  const list = frames();
  list.forEach((f, i) => {
    const fq = `${q}.frames[${i}]`;
    states(f.in, items.length, ".icnx", `${fq}.in`);
    if (f.fill !== undefined && !isInt(f.fill, 0, rows * cols)) c.err("badFill", `${fq}.fill`, `0–${rows * cols} cells`);
    if (f.trace !== undefined && (!Array.isArray(f.trace) || !f.trace.every((p) => isPair(p, rows, cols)))) c.err("badCells", `${fq}.trace`, "[row, col] pairs in the table");
  });
  steps(list.length);
}

function checkLp(e: O, q: string, c: PackCheckCtx, frames: Frames, steps: Steps, tone: (v: unknown, k: string) => void): void {
  for (const k of ["xr", "yr"]) {
    const r = e[k];
    if (!Array.isArray(r) || r.length !== 2 || !isNum(r[0]) || !isNum(r[1]) || r[0] >= r[1]) c.err("badRange", `${q}.${k}`, "[from, to], from < to");
  }
  c.text(e.xLabel as never, `${q}.xLabel`, false);
  c.text(e.yLabel as never, `${q}.yLabel`, false);
  if (e.vars !== undefined && (!Array.isArray(e.vars) || e.vars.length !== 2 || !e.vars.every((v) => typeof v === "string" && /^[A-Za-z][A-Za-z0-9₀-₉]{0,3}$/.test(v)))) c.err("badVars", `${q}.vars`, "two short names");
  const cons = arr(e.cons);
  if (!cons.length || cons.length > OPT_LIMITS.cons) c.err("badCount", `${q}.cons`, `1–${OPT_LIMITS.cons}`);
  cons.forEach((k, i) => {
    const kq = `${q}.cons[${i}]`;
    if (!isObj(k) || !isNum(k.a) || !isNum(k.b) || !isNum(k.c) || (k.a === 0 && k.b === 0)) return c.err("badConstraint", kq, "a·x + b·y ≤ c, a or b not 0");
    if (k.op !== undefined && k.op !== "<=" && k.op !== ">=") c.err("badConstraint", `${kq}.op`, "<= or >=");
    if (k.at !== undefined && !(isNum(k.at) && k.at >= 0 && k.at <= 1)) c.err("badConstraint", `${kq}.at`, "0–1");
    c.text(k.label as never, `${kq}.label`, false);
    tone(k.tone, `cons[${i}].tone`);
  });
  if (e.obj !== undefined && (!isObj(e.obj) || !isNum(e.obj.a) || !isNum(e.obj.b) || (e.obj.a === 0 && e.obj.b === 0))) c.err("badObjective", `${q}.obj`, "{ a, b }, a or b not 0");
  else if (isObj(e.obj)) c.text(e.obj.label as never, `${q}.obj.label`, false);
  const list = frames();
  list.forEach((f, i) => { if (!isNum(f.level)) c.err("badLevel", `${q}.frames[${i}].level`, "the level of the goal line, a number"); });
  if (list.length && e.obj === undefined) c.err("badObjective", `${q}.obj`, "frames slide the goal line: give obj");
  steps(list.length);
  if (e.ints) {
    const xr = e.xr as number[], yr = e.yr as number[];
    const dots = Array.isArray(xr) && Array.isArray(yr) ? (Math.floor(xr[1]!) - Math.ceil(xr[0]!) + 1) * (Math.floor(yr[1]!) - Math.ceil(yr[0]!) + 1) : 0;
    if (dots > OPT_LIMITS.lattice) c.err("tooManyDots", `${q}.ints`, `${dots} whole-number points in the ranges (at most ${OPT_LIMITS.lattice})`);
  }
}

function checkTree(e: O, q: string, c: PackCheckCtx): void {
  const nodes = arr(e.steps);
  if (!nodes.length || nodes.length > OPT_LIMITS.treeNodes) c.err("badCount", `${q}.steps`, `1–${OPT_LIMITS.treeNodes}`);
  const depth: number[] = [];
  nodes.forEach((v, i) => {
    const vq = `${q}.steps[${i}]`;
    if (!isObj(v)) return c.err("badNode", vq, "a step is an object");
    if (i === 0 ? v.p !== -1 : !isInt(v.p, 0, i - 1)) c.err("badParent", `${vq}.p`, i === 0 ? "the root's parent is −1" : "an earlier node");
    depth[i] = i === 0 ? 0 : (depth[v.p as number] ?? 0) + 1;
    if (depth[i]! > OPT_LIMITS.depth) c.err("tooDeep", vq, `at most ${OPT_LIMITS.depth} levels below the root`);
    c.text(v.label as never, `${vq}.label`);
    c.text(v.sub as never, `${vq}.sub`, false);
    c.text(v.edge as never, `${vq}.edge`, false);
    c.text(v.note as never, `${vq}.note`, false);
    if (v.mark !== undefined && !["x", "d", "l"].includes(v.mark as string)) c.err("badMark", `${vq}.mark`, "x, d or l");
    if (v.val !== undefined && !isNum(v.val)) c.err("badVal", `${vq}.val`, "a number");
    if (v.best && !isNum(v.val)) c.err("badVal", `${vq}.val`, "a best node needs its value");
  });
  if (e.frame !== undefined && !(isNum(e.frame) && e.frame >= 0 && e.frame <= Math.max(0, nodes.length - 1))) c.err("badFrame", `${q}.frame`, "a step index");
  c.text(e.totalLabel as never, `${q}.totalLabel`, false);
}
