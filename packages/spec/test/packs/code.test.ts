// The programming pack's validation: well-formed elements pass, and each kind of mistake is named at its path.
import { describe, expect, it } from "vitest";
import { check, callSteps, MIN_TEXT } from "../../src/packs/code/check.ts";
import type { PackCheckCtx } from "../../src/packs/types.ts";
import { checkPackElement } from "../../src/packs/check.ts";

type Issue = [string, string, string?];
function run(el: Record<string, unknown>): { errors: Issue[]; warnings: Issue[] } {
  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  const c: PackCheckCtx = {
    langs: ["en", "ar"],
    err: (code, path, detail) => errors.push([code, path, detail]),
    warn: (code, path, detail) => warnings.push([code, path, detail]),
    text: (v, path, required = true) => { if (v === undefined) { if (required) errors.push(["missingText", path]); return; } if (typeof v !== "string" && (!v.en || !v.ar)) errors.push(["missingText", path]); },
    tones: ["fg", "muted", "accent", "accent2", "danger", "ok", "surface", "bg", "line"],
  };
  check({ x: 0, y: 0, w: 1000, h: 400, id: "e", ...el } as never, "el", c);
  return { errors, warnings };
}
const codes = (r: { errors: Issue[] }): string[] => r.errors.map((e) => `${e[0]} ${e[1]}`);
const T = { en: "Yes", ar: "نعم" };

const TRACE = {
  type: "trace", code: "x = 1\nprint(x)", output: "1\n", labels: { vars: { en: "Variables", ar: "المتغيرات" } },
  steps: [{ line: 1, vars: { x: "1" } }, { line: 2, vars: { x: "1" }, out: 2 }],
};
const FLOW = {
  type: "flowchart",
  nodes: [{ id: "s", kind: "start", label: T }, { id: "t", kind: "decision", label: "n > 0?" }, { id: "a", kind: "process", label: "n = n - 1" }, { id: "e", kind: "end", label: T }],
  edges: [{ from: "s", to: "t" }, { from: "t", to: "a", label: T }, { from: "a", to: "t" }, { from: "t", to: "e", label: T }],
  path: ["s", "t", "a", "t", "e"],
};
const ARRAY = {
  type: "array", values: [3, 1, 2], counters: [{ en: "swaps", ar: "التبديلات" }],
  frames: [{ count: [0] }, { compare: [0, 1], note: "3 > 1", count: [0] }, { order: [1, 0, 2], swap: [0, 1], count: [1] }, { lo: 0, mid: 1, hi: 2, ptr: { i: 0 }, count: [1] }],
};
const CALLS = { type: "calltree", calls: [{ label: "f(2)", ret: "2" }, { label: "f(1)", parent: 0, ret: "1" }, { label: "f(0)", parent: 0, ret: "1" }] };
const DIFF = { type: "codediff", before: "x = 1\nprint(x)", after: "x = 2\nprint(x)", output: { before: "1", after: "2" }, labels: { before: T, after: T } };

describe("programming pack validation", () => {
  it("passes well-formed elements of every type", () => {
    for (const el of [TRACE, FLOW, ARRAY, CALLS, { ...CALLS, steps: callSteps(CALLS.calls) }, DIFF]) {
      const r = run(el);
      expect(r.errors, el.type).toEqual([]);
      expect(r.warnings, el.type).toEqual([]);
    }
  });

  it("is reached through the shared pack validator", () => {
    const errs: string[] = [];
    checkPackElement({ ...TRACE, id: "t", x: 0, y: 0, w: 900, h: 400, steps: [{ line: 9 }] }, "q", {
      langs: ["en"], err: (code) => errs.push(code), warn: () => {}, text: () => {}, tones: [],
    });
    expect(errs).toEqual(["badStep"]);
  });

  it("names a trace's mistakes", () => {
    expect(codes(run({ ...TRACE, code: "" }))).toContain("badCode el.code");
    expect(codes(run({ ...TRACE, code: "\tx = 1" }))).toContain("badCode el.code");
    expect(codes(run({ ...TRACE, code: Array(20).fill("x = 1").join("\n") }))).toContain("badCode el.code");
    expect(codes(run({ ...TRACE, steps: [] }))).toEqual(["badCount el.steps"]);
    expect(codes(run({ ...TRACE, steps: [{ line: 3 }] }))).toEqual(["badStep el.steps[0].line"]);
    expect(codes(run({ ...TRACE, steps: [{ line: 1, out: 2 }, { line: 2, out: 1 }] }))).toEqual(["badStep el.steps[1].out"]);
    expect(codes(run({ ...TRACE, steps: [{ line: 1, out: 9 }] }))).toEqual(["badStep el.steps[0].out"]);
    expect(codes(run({ ...TRACE, steps: [{ line: 1, vars: { "2x": "1" } }] }))).toEqual(["badStep el.steps[0].vars.2x"]);
    expect(codes(run({ ...TRACE, steps: [{ line: 1, locals: { a: 1 } }] }))).toEqual(["badStep el.steps[0].locals.a"]);
    expect(codes(run({ ...TRACE, lang: "java" }))).toEqual(["badLang el.lang"]);
    expect(codes(run({ ...TRACE, panels: ["vars", "plot"] }))).toEqual(["badPanels el.panels"]);
    expect(codes(run({ ...TRACE, labels: { vars: { en: "Variables" } } }))).toEqual(["missingText el.labels.vars"]);
    expect(codes(run({ ...TRACE, frame: 2 }))).toEqual(["badFrame el.frame"]);
    expect(codes(run({ ...TRACE, tone: "pink" }))).toEqual(["badTone el.tone"]);
  });

  it("warns about text too small to read on a phone", () => {
    const r = run({ ...TRACE, size: 24 });
    expect(r.errors).toEqual([]);
    expect(r.warnings.map((w) => w[0])).toEqual(["smallText"]);
    expect(r.warnings[0]![2]).toContain(`${MIN_TEXT} px`);
  });

  it("names a flowchart's mistakes", () => {
    expect(codes(run({ ...FLOW, nodes: [...FLOW.nodes, { id: "s", kind: "start", label: T }] }))).toEqual(["dupId el.nodes[4].id"]);
    expect(codes(run({ ...FLOW, nodes: [{ id: "s", kind: "loop", label: T }], edges: [], path: undefined }))).toEqual(["badKind el.nodes[0].kind"]);
    expect(codes(run({ ...FLOW, edges: [...FLOW.edges, { from: "s", to: "nowhere" }] }))).toEqual(["badEdge el.edges[4]"]);
    expect(codes(run({ ...FLOW, edges: [...FLOW.edges, { from: "s", to: "e" }] }))).toEqual(["badEdge el.edges"]);
    expect(codes(run({ ...FLOW, edges: [...FLOW.edges, { from: "t", to: "s" }] }))).toEqual(["badEdge el.edges"]);
    expect(codes(run({ ...FLOW, path: ["s", "e"] }))).toEqual(["badPath el.path[1]"]);
    expect(codes(run({ ...FLOW, path: ["s", "x"] }))).toEqual(["badPath el.path[1]"]);
    expect(codes(run({ ...FLOW, nodes: [{ ...FLOW.nodes[0], label: { en: "Start" } }, ...FLOW.nodes.slice(1)] }))).toEqual(["missingText el.nodes[0].label"]);
  });

  it("names an array's mistakes", () => {
    expect(codes(run({ ...ARRAY, values: [], frames: [] }))).toEqual(["badCount el.values"]);
    expect(codes(run({ ...ARRAY, values: Array(17).fill(1), frames: [] }))).toEqual(["badCount el.values"]);
    expect(codes(run({ ...ARRAY, view: "bars", values: [1, -2, 3] }))).toEqual(["badValue el.values[1]"]);
    expect(codes(run({ ...ARRAY, view: "pie" }))).toEqual(["badView el.view"]);
    expect(codes(run({ ...ARRAY, frames: [{ order: [0, 0, 1], count: [0] }] }))).toEqual(["badOrder el.frames[0].order"]);
    expect(codes(run({ ...ARRAY, frames: [{ compare: [0, 3], count: [0] }] }))).toEqual(["badSlots el.frames[0].compare"]);
    expect(codes(run({ ...ARRAY, frames: [{ ptr: { lo: 1 }, count: [0] }] }))).toEqual(["badSlots el.frames[0].ptr"]);
    expect(codes(run({ ...ARRAY, frames: [{ ptr: { a: 0, b: 1, c: 2, d: 0 }, count: [0] }] }))).toEqual(["badSlots el.frames[0].ptr"]);
    expect(codes(run({ ...ARRAY, frames: [{ lo: 2, hi: 0, count: [0] }] }))).toEqual(["badRange el.frames[0].lo"]);
    expect(codes(run({ ...ARRAY, frames: [{ count: [0, 1] }] }))).toEqual(["badCount el.frames[0].count"]);
    expect(codes(run({ ...ARRAY, frame: 9 }))).toEqual(["badFrame el.frame"]);
  });

  it("names a call tree's mistakes, and knows a run from a muddle", () => {
    expect(callSteps(CALLS.calls)).toEqual([1, 2, -2, 3, -3, -1]);
    expect(callSteps([{}, { parent: 0 }, { parent: 1 }, { parent: 0 }])).toEqual([1, 2, 3, -3, -2, 4, -4, -1]);
    expect(codes(run({ ...CALLS, calls: [{ label: "f(1)", parent: 0 }] }))).toEqual(["badParent el.calls[0].parent"]);
    expect(codes(run({ ...CALLS, calls: [{ label: "f(1)" }, { label: "f(0)", parent: 1 }] }))).toEqual(["badParent el.calls[1].parent"]);
    expect(codes(run({ ...CALLS, calls: [{ label: "x".repeat(30) }] }))).toEqual(["badCall el.calls[0].label"]);
    expect(codes(run({ ...CALLS, steps: [1, 3, 2] }))).toEqual(["badSteps el.steps"]);
    expect(codes(run({ ...CALLS, steps: [1, -1, 2] }))).toEqual(["badSteps el.steps"]);
    expect(codes(run({ ...CALLS, steps: [1, 2, -1] }))).toEqual(["badSteps el.steps"]);
    expect(codes(run({ ...CALLS, steps: [1, 2, -2] }))).toEqual([]);
    expect(codes(run({ ...CALLS, steps: [1, 2, -2], frame: 3 }))).toEqual(["badFrame el.frame"]);
  });

  it("names a code diff's mistakes", () => {
    expect(codes(run({ ...DIFF, after: 7 }))).toEqual(["badCode el.after"]);
    expect(run({ ...DIFF, after: DIFF.before }).warnings.map((w) => w[0])).toEqual(["sameCode"]);
    expect(codes(run({ ...DIFF, output: { before: "1\n2\n3\n4" } }))).toEqual(["badOutput el.output.before"]);
    expect(codes(run({ ...DIFF, labels: { bug: T } }))).toEqual(["badLabels el.labels.bug"]);
    expect(codes(run({ ...DIFF, frame: 1.5 }))).toEqual(["badFrame el.frame"]);
  });
});
