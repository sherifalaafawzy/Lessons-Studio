/**
 * Validation of the programming pack's elements (trace, flowchart, array, calltree, codediff). The limits keep each
 * element readable on a phone (32 px text on the 1280 stage) and light to draw.
 */
import type { PackCheck, PackCheckCtx } from "../types.ts";
import type { ArrayElement, CalltreeElement, CodediffElement, FlowchartElement, TraceElement } from "./types.ts";

export const CODE_LIMITS = {
  /** Lines of code, and characters in a line (about 30 fit beside the variables at 32 px; 54 across the stage). */
  lines: 16, cols: 60,
  /** Steps of a trace, variables in a step, characters of a value, of the output, of an error. */
  steps: 300, vars: 12, value: 60, output: 4000, error: 200,
  /** Flowchart shapes and arrows, and the length of a run through it. */
  nodes: 14, edges: 20, path: 60,
  /** Array items (boxes, bars), frames, counters. */
  boxes: 16, bars: 32, frames: 300, counters: 3,
  /** Calls in a call tree, characters of a call and of a return value. */
  calls: 40, label: 24, ret: 16,
};
/** Text smaller than this (stage pixels on the 1280-wide stage) is too small to read on a phone. */
export const MIN_TEXT = 32;

const ITEM_ID = /^[A-Za-z0-9_-]{1,40}$/;
const LANGS = ["python", "sql", "plain"];
const KINDS = ["start", "end", "process", "decision", "io"];
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isInt = (v: unknown, lo: number, hi: number): v is number => Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const arr = <T>(v: T[] | undefined): T[] => (Array.isArray(v) ? v : []);

export const check: PackCheck = (el, q, c) => {
  const tone = (v: unknown, at: string): void => { if (v !== undefined && !c.tones.includes(v as string)) c.err("badTone", at); };
  tone(el.tone, `${q}.tone`);
  const size = (v: unknown, max: number): void => {
    if (v === undefined) return;
    if (!isNum(v) || v < 12 || v > max) c.err("badSize", `${q}.size`, `12–${max} px`);
    else if (v < MIN_TEXT) c.warn("smallText", `${q}.size`, `${v} px is too small to read on a phone: use at least ${MIN_TEXT} px`);
  };
  const frame = (v: unknown, n: number): void => {
    if (v !== undefined && !(isNum(v) && v >= 0 && v <= Math.max(0, n - 1))) c.err("badFrame", `${q}.frame`, `from 0 to ${Math.max(0, n - 1)}`);
  };
  switch (el.type) {
    case "trace": return trace(el as unknown as TraceElement, q, c, size, frame);
    case "flowchart": return flowchart(el as unknown as FlowchartElement, q, c, size, tone);
    case "array": return array(el as unknown as ArrayElement, q, c, size, frame);
    case "calltree": return calltree(el as unknown as CalltreeElement, q, c, size, frame, tone);
    case "codediff": return codediff(el as unknown as CodediffElement, q, c, size, frame);
  }
};

type Size = (v: unknown, max: number) => void;
type Frame = (v: unknown, n: number) => void;
type ToneCheck = (v: unknown, at: string) => void;

/** Code: a string of at most `lines` lines of `cols` characters, no tabs (4 spaces per indent). Returns its line count. */
function code(v: unknown, at: string, c: PackCheckCtx): number {
  if (typeof v !== "string" || !v.trim()) { c.err("badCode", at, "the code must be a string with at least one line"); return 0; }
  const lines = v.replace(/\n+$/, "").split("\n");
  if (lines.length > CODE_LIMITS.lines) c.err("badCode", at, `${lines.length} lines; at most ${CODE_LIMITS.lines}`);
  const long = lines.findIndex((l) => l.length > CODE_LIMITS.cols);
  if (long >= 0) c.err("badCode", at, `line ${long + 1} has ${lines[long]!.length} characters; at most ${CODE_LIMITS.cols}`);
  if (v.includes("\t")) c.err("badCode", at, "use 4 spaces for each indent, not tabs");
  return lines.length;
}
function lang(v: unknown, at: string, c: PackCheckCtx): void {
  if (v !== undefined && !LANGS.includes(v as string)) c.err("badLang", at, `the code's language is one of ${LANGS.join(", ")}`);
}
function labels(v: unknown, keys: string[], at: string, c: PackCheckCtx): void {
  if (v === undefined) return;
  if (!isObj(v)) return c.err("badLabels", at, `an object with ${keys.join(" and ")}`);
  for (const [k, t] of Object.entries(v)) {
    if (!keys.includes(k)) c.err("badLabels", `${at}.${k}`, `labels are ${keys.join(" and ")}`);
    else c.text(t as never, `${at}.${k}`);
  }
}
function vars(v: unknown, at: string, c: PackCheckCtx): void {
  if (v === undefined) return;
  if (!isObj(v)) return c.err("badStep", at, "variables are an object of name → value");
  const e = Object.entries(v);
  if (e.length > CODE_LIMITS.vars) c.err("badStep", at, `${e.length} variables; at most ${CODE_LIMITS.vars}`);
  for (const [k, x] of e) {
    if (!/^[A-Za-z_][A-Za-z0-9_]{0,23}$/.test(k)) c.err("badStep", `${at}.${k}`, "a variable's name is a Python name of at most 24 characters");
    if (typeof x !== "string" || x.length > CODE_LIMITS.value) c.err("badStep", `${at}.${k}`, `a value is text of at most ${CODE_LIMITS.value} characters`);
  }
}

function trace(e: TraceElement, q: string, c: PackCheckCtx, size: Size, frame: Frame): void {
  const n = code(e.code, `${q}.code`, c);
  lang(e.lang, `${q}.lang`, c);
  const steps = arr(e.steps);
  if (!Array.isArray(e.steps) || !steps.length || steps.length > CODE_LIMITS.steps) c.err("badCount", `${q}.steps`, `1–${CODE_LIMITS.steps}`);
  const output = typeof e.output === "string" ? e.output : "";
  if (e.output !== undefined && (typeof e.output !== "string" || e.output.length > CODE_LIMITS.output)) c.err("badOutput", `${q}.output`, `the output is text of at most ${CODE_LIMITS.output} characters`);
  if (e.error !== undefined && (typeof e.error !== "string" || !e.error.trim() || e.error.length > CODE_LIMITS.error)) c.err("badOutput", `${q}.error`, `the error is text of at most ${CODE_LIMITS.error} characters`);
  let out = 0;
  steps.forEach((s, i) => {
    const sq = `${q}.steps[${i}]`;
    if (!isObj(s)) return c.err("badStep", sq, "a step is an object with its line");
    if (!isInt(s.line, 1, Math.max(1, n))) c.err("badStep", `${sq}.line`, `a line of the code, from 1 to ${n}`);
    if (s.fn !== undefined && (typeof s.fn !== "string" || !/^[A-Za-z_]\w{0,39}$/.test(s.fn))) c.err("badStep", `${sq}.fn`, "a function's name");
    if (s.call !== undefined && (typeof s.call !== "string" || s.call.length > 40)) c.err("badStep", `${sq}.call`, "the call as written, at most 40 characters");
    if (s.depth !== undefined && !isInt(s.depth, 0, 60)) c.err("badStep", `${sq}.depth`, "how many calls deep: 0–60");
    vars(s.vars, `${sq}.vars`, c);
    vars(s.locals, `${sq}.locals`, c);
    if (s.out !== undefined) {
      if (!isInt(s.out, 0, output.length)) c.err("badStep", `${sq}.out`, `how much of the output is printed: 0–${output.length} characters`);
      else if (s.out < out) c.err("badStep", `${sq}.out`, "the output only grows: a step can't print less than the one before");
      else out = s.out;
    }
    if (s.ret !== undefined && (typeof s.ret !== "string" || s.ret.length > CODE_LIMITS.value)) c.err("badStep", `${sq}.ret`, `a return value is text of at most ${CODE_LIMITS.value} characters`);
    if (s.err !== undefined && typeof s.err !== "boolean") c.err("badStep", `${sq}.err`, "true when the program stops with its error on this step");
  });
  if (e.panels !== undefined && (!Array.isArray(e.panels) || !e.panels.every((p) => p === "vars" || p === "out"))) c.err("badPanels", `${q}.panels`, `panels are "vars" and "out"`);
  labels(e.labels, ["vars", "out"], `${q}.labels`, c);
  size(e.size, 60);
  frame(e.frame, steps.length);
}

function flowchart(e: FlowchartElement, q: string, c: PackCheckCtx, size: Size, tone: ToneCheck): void {
  const nodes = arr(e.nodes);
  if (!Array.isArray(e.nodes) || !nodes.length || nodes.length > CODE_LIMITS.nodes) c.err("badCount", `${q}.nodes`, `1–${CODE_LIMITS.nodes}`);
  const ids = new Set<string>();
  nodes.forEach((nd, i) => {
    const nq = `${q}.nodes[${i}]`;
    if (!isObj(nd)) return c.err("badNode", nq, "a node is an object with id, kind and label");
    if (typeof nd.id !== "string" || !ITEM_ID.test(nd.id)) c.err("badId", `${nq}.id`);
    else if (ids.has(nd.id)) c.err("dupId", `${nq}.id`, nd.id);
    else ids.add(nd.id);
    if (!KINDS.includes(nd.kind)) c.err("badKind", `${nq}.kind`, `one of ${KINDS.join(", ")}`);
    c.text(nd.label, `${nq}.label`);
    tone(nd.tone, `${nq}.tone`);
  });
  const edges = arr(e.edges);
  if (!Array.isArray(e.edges) || edges.length > CODE_LIMITS.edges) c.err("badCount", `${q}.edges`, `0–${CODE_LIMITS.edges}`);
  const has = new Set<string>();
  edges.forEach((ed, i) => {
    const eq = `${q}.edges[${i}]`;
    if (!isObj(ed) || !ids.has(ed.from) || !ids.has(ed.to) || ed.from === ed.to) return c.err("badEdge", eq, "an arrow joins two different nodes, by id");
    has.add(`${ed.from}>${ed.to}`);
    if (ed.label !== undefined) c.text(ed.label, `${eq}.label`);
  });
  const out = new Map<string, number>();
  for (const ed of edges) if (isObj(ed) && ids.has(ed.from) && ids.has(ed.to) && ed.from !== ed.to) out.set(ed.from, (out.get(ed.from) ?? 0) + 1);
  for (const nd of nodes) {
    if (!isObj(nd)) continue;
    const k = out.get(nd.id) ?? 0;
    if (nd.kind === "decision" ? k > 2 : k > 1) c.err("badEdge", `${q}.edges`, `${nd.id} has ${k} arrows out; a decision has at most 2 (yes and no), other shapes 1`);
  }
  if (e.path !== undefined) {
    const p = arr(e.path);
    if (!Array.isArray(e.path) || p.length < 2 || p.length > CODE_LIMITS.path) c.err("badPath", `${q}.path`, `a run through the chart: 2–${CODE_LIMITS.path} node ids`);
    p.forEach((id, i) => {
      if (!ids.has(id)) c.err("badPath", `${q}.path[${i}]`, `no node "${String(id)}"`);
      else if (i && !has.has(`${p[i - 1]}>${id}`)) c.err("badPath", `${q}.path[${i}]`, `no arrow from ${String(p[i - 1])} to ${id}`);
    });
  }
  size(e.size, 60);
}

function array(e: ArrayElement, q: string, c: PackCheckCtx, size: Size, frame: Frame): void {
  const bars = e.view === "bars";
  if (e.view !== undefined && e.view !== "boxes" && !bars) c.err("badView", `${q}.view`, `"boxes" or "bars"`);
  const vals = arr(e.values);
  const max = bars ? CODE_LIMITS.bars : CODE_LIMITS.boxes;
  if (!Array.isArray(e.values) || !vals.length || vals.length > max) c.err("badCount", `${q}.values`, `1–${max}${bars ? " bars" : " boxes"}`);
  vals.forEach((v, i) => {
    const ok = bars ? isNum(v) && v >= 0 : isNum(v) || (typeof v === "string" && v.length >= 1 && v.length <= 6);
    if (!ok) c.err("badValue", `${q}.values[${i}]`, bars ? "bars are numbers of 0 or more" : "a number, or text of 1–6 characters");
  });
  const n = vals.length;
  const nc = arr(e.counters).length;
  if (e.counters !== undefined && (!Array.isArray(e.counters) || nc > CODE_LIMITS.counters)) c.err("badCount", `${q}.counters`, `0–${CODE_LIMITS.counters}`);
  arr(e.counters).forEach((t, i) => c.text(t, `${q}.counters[${i}]`));
  const frames = arr(e.frames);
  if (e.frames !== undefined && (!Array.isArray(e.frames) || frames.length > CODE_LIMITS.frames)) c.err("badFrames", `${q}.frames`, `at most ${CODE_LIMITS.frames}`);
  const slot = (v: unknown): boolean => isInt(v, 0, n - 1);
  frames.forEach((f, i) => {
    const fq = `${q}.frames[${i}]`;
    if (!isObj(f)) return c.err("badFrames", fq, "a frame is an object");
    if (f.order !== undefined) {
      const o = f.order;
      if (!Array.isArray(o) || o.length !== n || !o.every(slot) || new Set(o).size !== n) c.err("badOrder", `${fq}.order`, `which item is in each slot: every index 0–${n - 1} once`);
    }
    for (const k of ["compare", "swap", "done"] as const) if (f[k] !== undefined && (!Array.isArray(f[k]) || !f[k]!.every(slot))) c.err("badSlots", `${fq}.${k}`, `slots from 0 to ${n - 1}`);
    for (const k of ["pivot", "lo", "mid", "hi", "found"] as const) if (f[k] !== undefined && !slot(f[k])) c.err("badSlots", `${fq}.${k}`, `a slot from 0 to ${n - 1}`);
    if (f.ptr !== undefined) {
      const e2 = isObj(f.ptr) ? Object.entries(f.ptr) : [];
      if (!isObj(f.ptr) || e2.length > 3 || !e2.every(([k, v]) => /^[A-Za-z_]\w{0,7}$/.test(k) && !["lo", "mid", "hi", "pivot"].includes(k) && slot(v))) {
        c.err("badSlots", `${fq}.ptr`, `up to 3 pointers named as in the code (at most 8 letters; lo, mid, hi and pivot have their own fields), each at a slot from 0 to ${n - 1}`);
      }
    }
    if (isNum(f.lo) && isNum(f.hi) && f.lo > f.hi + 1) c.err("badRange", `${fq}.lo`, "lo can pass hi by one at most (the search has ended)");
    if (f.note !== undefined) c.text(f.note as never, `${fq}.note`);
    if (f.count !== undefined && (!Array.isArray(f.count) || f.count.length !== nc || !f.count.every((v) => isInt(v, 0, 1e6)))) c.err("badCount", `${fq}.count`, `${nc} counter values, whole numbers`);
  });
  if (e.index !== undefined && typeof e.index !== "boolean") c.err("badIndex", `${q}.index`, "true to show each slot's index");
  size(e.size, 80);
  frame(e.frame, frames.length);
}

/** The run of a call tree, depth first: each call starts after its parent and returns after its children. */
export function callSteps(calls: readonly { parent?: number }[]): number[] {
  const out: number[] = [];
  const stack: number[] = [];
  calls.forEach((cl, i) => {
    const p = i ? cl.parent ?? 0 : -1;
    while (stack.length && stack[stack.length - 1] !== p) out.push(-(stack.pop()! + 1));
    out.push(i + 1);
    stack.push(i);
  });
  while (stack.length) out.push(-(stack.pop()! + 1));
  return out;
}

function calltree(e: CalltreeElement, q: string, c: PackCheckCtx, size: Size, frame: Frame, tone: ToneCheck): void {
  const calls = arr(e.calls);
  if (!Array.isArray(e.calls) || !calls.length || calls.length > CODE_LIMITS.calls) c.err("badCount", `${q}.calls`, `1–${CODE_LIMITS.calls}`);
  calls.forEach((cl, i) => {
    const cq = `${q}.calls[${i}]`;
    if (!isObj(cl)) return c.err("badCall", cq, "a call is an object with its label");
    if (typeof cl.label !== "string" || !cl.label.trim() || cl.label.length > CODE_LIMITS.label) c.err("badCall", `${cq}.label`, `the call as written, 1–${CODE_LIMITS.label} characters`);
    if (i === 0 && cl.parent !== undefined) c.err("badParent", `${cq}.parent`, "the first call is the one the tree starts from: it has no parent");
    if (i > 0 && !isInt(cl.parent, 0, i - 1)) c.err("badParent", `${cq}.parent`, `the call it was made from: an earlier call, 0–${i - 1}`);
    if (cl.ret !== undefined && (typeof cl.ret !== "string" || cl.ret.length > CODE_LIMITS.ret)) c.err("badCall", `${cq}.ret`, `a return value is text of at most ${CODE_LIMITS.ret} characters`);
    tone(cl.tone, `${cq}.tone`);
  });
  let n = 2 * calls.length;
  if (e.steps !== undefined) {
    const s = arr(e.steps);
    n = s.length;
    const started = new Set<number>();
    const done = new Set<number>();
    const open: number[] = [];
    let bad = "";
    if (!Array.isArray(e.steps) || !s.length || s.length > 2 * calls.length) bad = `1–${2 * calls.length} events`;
    for (const v of s) {
      if (bad) break;
      const i = Math.abs(v) - 1;
      if (!Number.isInteger(v) || v === 0 || i >= calls.length) bad = `${String(v)} is not a call: i + 1 starts call i, −(i + 1) returns it`;
      else if (v > 0) {
        const p = i ? calls[i]?.parent ?? 0 : -1;
        if (started.has(i)) bad = `call ${i} starts twice`;
        else if (i && open[open.length - 1] !== p) bad = `call ${i} starts while call ${p}, which makes it, isn't the one running`;
        else if (!i && started.size) bad = "call 0 starts first";
        else { started.add(i); open.push(i); }
      } else if (open[open.length - 1] !== i) bad = `call ${i} returns while ${open.length ? `call ${open[open.length - 1]}` : "nothing"} is running`;
      else { open.pop(); done.add(i); }
    }
    if (!bad && [...started].some((i, k) => i !== k)) bad = "calls start in their order";
    if (bad) c.err("badSteps", `${q}.steps`, bad);
  }
  size(e.size, 60);
  frame(e.frame, n);
}

function codediff(e: CodediffElement, q: string, c: PackCheckCtx, size: Size, frame: Frame): void {
  code(e.before, `${q}.before`, c);
  code(e.after, `${q}.after`, c);
  if (typeof e.before === "string" && e.before === e.after) c.warn("sameCode", `${q}.after`, "the fix is the same code as the bug");
  lang(e.lang, `${q}.lang`, c);
  labels(e.labels, ["before", "after"], `${q}.labels`, c);
  if (e.output !== undefined) {
    if (!isObj(e.output)) c.err("badOutput", `${q}.output`, "an object with before and after");
    else for (const k of ["before", "after"] as const) {
      const v = e.output[k];
      if (v !== undefined && (typeof v !== "string" || v.length > CODE_LIMITS.error || v.split("\n").length > 3)) c.err("badOutput", `${q}.output.${k}`, `what it prints: text of at most 3 lines and ${CODE_LIMITS.error} characters`);
    }
  }
  size(e.size, 60);
  frame(e.frame, 2);
}
