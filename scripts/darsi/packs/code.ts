/**
 * design.json bodies for the programming pack (docs/packs/code.md lists them): `trace`, `flowchart`, `array`,
 * `calltree` and `codediff`, timed to the scene's sentences (counted from 0). Programs are run for real when the lesson
 * is converted: MicroPython loads once, when this module is imported, so the bodies can record runs at once.
 */
import type { Element, When } from "../../../packages/spec/src/index.ts";
import {
  arrayElement, callTree, calltreeElement, codediffElement, flowchart, passAt, preparePython, recordTraceSync, searchFrames, sortFrames, traceCalls,
  traceElement, yesNo, type ArrayFrame, type CallNode, type FlowEdge, type FlowNode, type Recorded, type SortAlgorithm,
} from "../../../packages/ops/src/packs/code.ts";
import type { AText, BodyBuilder, BodyCtx } from "./types.ts";

let pythonProblem = "";
try {
  await preparePython();
} catch (e) {
  pythonProblem = e instanceof Error ? e.message : String(e);
}

type Track = NonNullable<Element["anim"]>[number];
const keys = (prop: Track["prop"], list: [When, number][], ease: "in-out" | "linear" | "step" = "in-out"): Track =>
  ({ prop, keys: list.map(([at, value], i) => ({ at, value, ...(i ? { ease } : {}) })) });
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const fail = (c: BodyCtx, what: string): never => { throw new Error(`${c.where}: ${what}`); };
const sentence = (c: BodyCtx, k: unknown, what: string): number => {
  if (!Number.isInteger(k) || (k as number) < 0 || (k as number) >= c.n) fail(c, `${what} must be a sentence of this scene, 0–${c.n - 1} (got ${JSON.stringify(k)})`);
  return k as number;
};
/** The moment just after sentence b ends: the next one's start, or a little after the last one starts. */
const after = (c: BodyCtx, b: number): When => (b + 1 < c.n ? c.at(b + 1) : c.at(b, 2.5));
/** A frame track: `at` pins frames to sentences ([[sentence, frame], …]); else `play` [a, b] runs them all from a to b. */
function frameTrack(c: BodyCtx, spec: Record<string, unknown>, last: number, s0: number, prop: Track["prop"] = "frame", map: (k: number) => number = (k) => k): Track {
  if (spec.at !== undefined) {
    if (!Array.isArray(spec.at) || !spec.at.length) fail(c, `"at" is a list of [sentence, ${prop === "pass" ? "path index" : "step"}] pairs`);
    return keys(prop, (spec.at as unknown[]).map((p) => {
      if (!Array.isArray(p) || p.length !== 2) return fail(c, `"at" has pairs [sentence, ${prop === "pass" ? "path index" : "step"}]`);
      const k = p[1];
      if (!Number.isInteger(k) || (k as number) < 0 || (k as number) > last) fail(c, `"at" points at ${JSON.stringify(k)}; there are ${last + 1} (0–${last})`);
      return [c.at(sentence(c, p[0], `"at"`)), map(k as number)] as [When, number];
    }));
  }
  const play = spec.play ?? [s0, c.n - 1];
  if (!Array.isArray(play) || play.length !== 2) fail(c, `"play" is [first sentence, last sentence]`);
  const a = sentence(c, (play as unknown[])[0], `"play"`);
  const b = sentence(c, (play as unknown[])[1], `"play"`);
  if (b < a) fail(c, `"play" ends before it starts`);
  return keys(prop, [[c.at(a), map(0)], [after(c, b), map(last)]], "linear");
}
const comesIn = (c: BodyCtx, s0: number): Track => keys("reveal", [[c.at(s0), 0], [c.at(s0, 1), 1]], "linear");
const focusTrack = (c: BodyCtx, list: unknown, key: string, count: number): Track | null => {
  if (list === undefined) return null;
  if (!Array.isArray(list) || !list.length) fail(c, `"focus" is a list of { "s": sentence, "${key}": n }`);
  return keys("focus", (list as unknown[]).map((f) => {
    if (!isObj(f)) return fail(c, `"focus" items are { "s": sentence, "${key}": n }`);
    const n = f[key];
    if (!Number.isInteger(n) || (n as number) < 0 || (n as number) > count) fail(c, `"focus" ${key} must be 1–${count} (0 lights nothing)`);
    return [c.at(sentence(c, f.s, `"focus"`)), n as number] as [When, number];
  }), "step");
};
const box = (c: BodyCtx, id: string, h?: number): { id: string; x: number; y: number; w: number; h: number } =>
  ({ id, x: c.box.x, y: c.box.y - 10, w: c.box.w, h: Math.min(h ?? c.box.h + 20, c.box.h + 20) });

/** A program run in MicroPython, checked for what a video can show. */
function run(c: BodyCtx, code: unknown, inputs: unknown, errorOk: boolean, maxLines = 10, maxCols = 40): Recorded {
  if (pythonProblem) fail(c, `MicroPython didn't load, so the program can't be recorded: ${pythonProblem}`);
  if (typeof code !== "string" || !code.trim()) fail(c, `"code" is the program, with "\\n" between lines and 4 spaces per indent`);
  const lines = (code as string).replace(/\n+$/, "").split("\n");
  const longest = Math.max(...lines.map((l) => l.length));
  if (lines.length > maxLines || longest > maxCols) {
    fail(c, `the code is ${lines.length} lines, the longest ${longest} characters (at most ${maxLines} and ${maxCols}, so it reads at 32 px on a phone)`);
  }
  if (inputs !== undefined && (!Array.isArray(inputs) || !inputs.every((x) => typeof x === "string"))) fail(c, `"inputs" are the answers to input(), as strings`);
  const rec = recordTraceSync(code as string, { inputs: inputs as string[] | undefined, maxSteps: 80 });
  if (rec.cut) fail(c, `the program runs too long to show (more than 80 steps): use a shorter list or fewer turns`);
  if (rec.error && !errorOk) fail(c, `the program stopped with ${rec.error}; set "error": true if that is the point`);
  return rec;
}

export const bodies: Record<string, BodyBuilder> = {
  /**
   * { "trace": { "code": "…", "inputs": ["7"], "play": [1, 3] | "at": [[1, 0], [2, 4]], "focus": [{ "s": 1, "line": 2 }],
   *   "error": true, "s": 0 } }: the program recorded in MicroPython, its steps played from sentence a to b (or pinned
   * to sentences with "at": [sentence, step]); "focus" rings a line.
   */
  trace(spec, c) {
    if (!isObj(spec)) return fail(c, `"trace" is { "code": "…" }`);
    const rec = run(c, spec.code, spec.inputs, spec.error === true);
    const s0 = spec.s === undefined ? 0 : sentence(c, spec.s, `"s"`);
    const el = traceElement(box(c, "trace"), spec.code as string, rec, { langs: c.langs });
    const lines = (spec.code as string).split("\n").length;
    const tracks = [comesIn(c, s0), frameTrack(c, spec, rec.steps.length - 1, s0)];
    const f = focusTrack(c, spec.focus, "line", lines);
    if (f) tracks.push(f);
    return [{ ...el, anim: tracks }];
  },

  /**
   * { "flowchart": { "nodes": [{ "id": "test", "kind": "decision", "text": "n > 0?" }, …],
   *   "edges": [["start", "read"], ["test", "show", "yes"], ["test", "end", "no"]], "path": ["start", …],
   *   "play": [1, 3] | "at": [[1, 2], [2, 5]], "focus": [{ "s": 0, "node": 3 }], "s": 0 } }: kinds start, end, process,
   * decision, io; a decision's first arrow goes down, its second to the side; an arrow back up is a loop. The token
   * runs along "path" (sentence pairs in "at" pin a path index to a sentence).
   */
  flowchart(spec, c) {
    if (!isObj(spec) || !Array.isArray(spec.nodes) || !Array.isArray(spec.edges)) return fail(c, `"flowchart" is { "nodes": […], "edges": […] }`);
    const KINDS = ["start", "end", "process", "decision", "io"];
    const nodes: FlowNode[] = (spec.nodes as unknown[]).map((n, i) => {
      if (!isObj(n) || typeof n.id !== "string" || !KINDS.includes(n.kind as string)) return fail(c, `flowchart node ${i + 1} needs an id and a kind (${KINDS.join(", ")})`);
      return { id: n.id, kind: n.kind as FlowNode["kind"], label: typeof n.text === "string" ? n.text : c.T(n.text as AText, `flowchart node ${n.id}`) };
    });
    const { yes, no } = yesNo(c.langs);
    const edges: FlowEdge[] = (spec.edges as unknown[]).map((e, i) => {
      if (!Array.isArray(e) || e.length < 2 || typeof e[0] !== "string" || typeof e[1] !== "string") return fail(c, `flowchart arrow ${i + 1} is ["from", "to"] or ["from", "to", "yes" | "no" | {…}]`);
      const lab = e[2] === "yes" ? yes : e[2] === "no" ? no : e[2] === undefined ? undefined : c.T(e[2] as AText, `flowchart arrow ${e[0]}-${e[1]}`);
      return { from: e[0], to: e[1], ...(lab ? { label: lab } : {}) };
    });
    const path = spec.path === undefined ? undefined : (spec.path as string[]);
    if (path !== undefined && (!Array.isArray(path) || path.length < 2 || !path.every((p) => typeof p === "string"))) fail(c, `"path" is the node ids the token visits, in order`);
    const s0 = spec.s === undefined ? 0 : sentence(c, spec.s, `"s"`);
    const el = flowchart(box(c, "flow"), nodes, edges, path ? { path } : {});
    const tracks = [comesIn(c, s0)];
    if (path) tracks.push(frameTrack(c, spec, path.length - 1, s0, "pass", (k) => passAt(path, k)));
    const f = focusTrack(c, spec.focus, "node", nodes.length);
    if (f) tracks.push(f);
    return [{ ...el, anim: tracks }];
  },

  /**
   * { "array": { "values": [5, 3, 8, 1], "sort": "bubble" | "selection" | "insertion" | "merge" | "quick"
   *   | "search": { "kind": "binary" | "linear", "target": 23 }, "view": "bars", "index": true, "counters": false,
   *   "play": [1, 3] | "at": [[1, 0], [2, 6]], "s": 0 } }: every compare and move of the sort (or every look of the
   * search), played from sentence a to b. Without a sort or search, just the values.
   */
  array(spec, c) {
    if (!isObj(spec) || !Array.isArray(spec.values) || !spec.values.length) return fail(c, `"array" is { "values": [numbers] }`);
    const values = spec.values as unknown[];
    const view = spec.view === "bars" ? "bars" : "boxes";
    if (values.length > (view === "bars" ? 12 : 10)) fail(c, `${values.length} values; a body shows at most ${view === "bars" ? 12 : 10} (${view}) at 32 px`);
    let frames: ArrayFrame[] | undefined;
    let counters: ReturnType<typeof sortFrames>["counters"] | undefined;
    if (spec.sort !== undefined || spec.search !== undefined) {
      if (!values.every((v) => typeof v === "number")) fail(c, `sorting and searching need numbers`);
      const nums = values as number[];
      if (spec.sort !== undefined) {
        if (!["bubble", "selection", "insertion", "merge", "quick"].includes(spec.sort as string)) fail(c, `"sort" is bubble, selection, insertion, merge or quick`);
        ({ frames, counters } = sortFrames(spec.sort as SortAlgorithm, nums, c.langs));
      } else {
        const s = spec.search;
        if (!isObj(s) || (s.kind !== "binary" && s.kind !== "linear") || typeof s.target !== "number") return fail(c, `"search" is { "kind": "binary" | "linear", "target": number }`);
        try { ({ frames, counters } = searchFrames(s.kind, nums, s.target, c.langs)); } catch (e) { fail(c, e instanceof Error ? e.message : String(e)); }
      }
      if (frames!.length > 60) fail(c, `the ${spec.sort ?? "search"} takes ${frames!.length} frames; use fewer values so each one can be followed`);
    } else if (!values.every((v) => typeof v === "number" || (typeof v === "string" && v.length <= 6))) fail(c, `values are numbers or short text`);
    const s0 = spec.s === undefined ? 0 : sentence(c, spec.s, `"s"`);
    const el = arrayElement(box(c, "array", 360), values as (number | string)[], {
      ...(frames ? { frames } : {}), ...(counters && spec.counters !== false ? { counters } : {}), view, index: spec.index === true,
    });
    const tracks = [comesIn(c, s0)];
    if (frames) tracks.push(frameTrack(c, spec, frames.length - 1, s0));
    return [{ ...el, anim: tracks }];
  },

  /**
   * { "calltree": { "fn": "fib" | "factorial" | "hanoi", "n": 4, "repeats": true } } or { "calltree": { "code": "…" } }
   * (the calls a program makes, recorded in MicroPython; the first call is the root), with "play": [a, b] | "at":
   * [[sentence, step], …] (a step is a call starting or returning) and "focus": [{ "s": 2, "call": 3 }].
   */
  calltree(spec, c) {
    if (!isObj(spec)) return fail(c, `"calltree" is { "fn": "fib", "n": 4 } or { "code": "…" }`);
    let calls: CallNode[];
    if (spec.code !== undefined) {
      const rec = run(c, spec.code, spec.inputs, false, 12, 48);
      calls = traceCalls(rec);
      if (!calls.length) fail(c, `the program makes no function calls`);
      if (spec.repeats) { const seen = new Set<string>(); for (const k of calls) { if (seen.has(k.label)) k.tone = "accent2"; seen.add(k.label); } }
    } else {
      if (!["fib", "factorial", "hanoi"].includes(spec.fn as string) || !Number.isInteger(spec.n) || (spec.n as number) < 1) return fail(c, `"fn" is fib, factorial or hanoi, and "n" a whole number`);
      calls = callTree(spec.fn as "fib" | "factorial" | "hanoi", spec.n as number, { repeats: spec.repeats === true }).calls;
    }
    if (calls.length > 15) fail(c, `${calls.length} calls; a body shows at most 15 at 32 px (fib(4), factorial(6), hanoi(3))`);
    const s0 = spec.s === undefined ? 0 : sentence(c, spec.s, `"s"`);
    const el = calltreeElement(box(c, "tree"), calls);
    const tracks = [frameTrack(c, spec, el.steps!.length - 1, s0)];
    const f = focusTrack(c, spec.focus, "call", calls.length);
    if (f) tracks.push(f);
    return [{ ...el, anim: tracks }];
  },

  /**
   * { "codediff": { "before": "…", "after": "…", "fix": 2, "run": true | "output": { "before": "10", "after": "15" },
   *   "focus": [{ "s": 1, "line": 2 }], "labels": { "before": {…}, "after": {…} } } }: the bug, then the fix swapping in
   * on sentence "fix"; "run" records what each version prints (or the error it stops with).
   */
  codediff(spec, c) {
    if (!isObj(spec) || typeof spec.before !== "string" || typeof spec.after !== "string") return fail(c, `"codediff" is { "before": "…", "after": "…", "fix": sentence }`);
    for (const k of ["before", "after"] as const) {
      const lines = (spec[k] as string).split("\n");
      const longest = Math.max(...lines.map((l) => l.length));
      if (lines.length > 8 || longest > 48) fail(c, `"${k}" is ${lines.length} lines, the longest ${longest} characters (at most 8 and 48)`);
    }
    let output: { before?: string; after?: string } | undefined;
    if (spec.run === true) {
      const said = (r: Recorded): string => (r.error ?? r.output.replace(/\n$/, "").split("\n").slice(-3).join("\n")).slice(0, 200);
      output = { before: said(run(c, spec.before, spec.inputs, true, 8, 48)), after: said(run(c, spec.after, spec.inputs, true, 8, 48)) };
    } else if (spec.output !== undefined) {
      if (!isObj(spec.output)) fail(c, `"output" is { "before": "…", "after": "…" }`);
      output = spec.output as { before?: string; after?: string };
    }
    const fix = sentence(c, spec.fix, `"fix"`);
    const el = codediffElement(box(c, "diff"), spec.before, spec.after, { langs: c.langs, ...(output ? { output } : {}) });
    if (isObj(spec.labels)) {
      el.labels = {
        ...(spec.labels.before ? { before: c.T(spec.labels.before as AText, "codediff label") } : { before: el.labels!.before! }),
        ...(spec.labels.after ? { after: c.T(spec.labels.after as AText, "codediff label") } : { after: el.labels!.after! }),
      };
    }
    const tracks = [comesIn(c, 0), keys("frame", [[c.at(fix), 0], [c.at(fix, 1), 1]])];
    const f = focusTrack(c, spec.focus, "line", Math.max(spec.before.split("\n").length, spec.after.split("\n").length));
    if (f) tracks.push(f);
    return [{ ...el, anim: tracks }];
  },
};

