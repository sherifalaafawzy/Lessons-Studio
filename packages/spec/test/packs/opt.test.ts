// The optimization pack's validator: every ready-made element passes, and each kind of mistake is named at its path.
import { describe, expect, it } from "vitest";
import { checkPackElement } from "../../src/packs/check.ts";
import { OPT_LIMITS } from "../../src/packs/opt/check.ts";
import type { PackCheckCtx } from "../../src/packs/types.ts";
import { packs } from "../../../ops/src/index.ts";

const TONES = ["fg", "muted", "accent", "accent2", "danger", "ok", "surface", "bg", "line"];
type Issue = { code: string; path: string; detail?: string };
function run(el: Record<string, unknown>, langs = ["en", "ar"]): { errors: Issue[]; warnings: Issue[] } {
  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  const c: PackCheckCtx = {
    langs, tones: TONES,
    err: (code, path, detail) => errors.push({ code, path, ...(detail ? { detail } : {}) }),
    warn: (code, path, detail) => warnings.push({ code, path, ...(detail ? { detail } : {}) }),
    text: (v, path, req = true) => {
      if (v === undefined) { if (req) errors.push({ code: "missingText", path }); return; }
      if (typeof v !== "string") for (const l of langs) if (typeof (v as Record<string, string>)[l] !== "string") errors.push({ code: "missingText", path, detail: l });
    },
  };
  checkPackElement(el as { type: string } & Record<string, unknown>, "el", c);
  return { errors, warnings };
}
const codes = (el: Record<string, unknown>): string[] => run(el).errors.map((e) => `${e.code} ${e.path}`);
const box = { id: "e", x: 0, y: 0, w: 1100, h: 430 };
const opt = packs.opt;

describe("optimization pack validation", () => {
  it("passes every ready-made element, in English and Arabic and in Arabic alone", () => {
    for (const langs of [["en", "ar"], ["ar"], ["en", "ar-EG"]]) {
      const els = [
        opt.shortestWay(box, langs), opt.shortestWay(box, langs, { flooded: true }), opt.pavedRoads(box, langs), opt.busRoute(box, langs),
        opt.examSlots(box, langs), opt.examSlots(box, langs, "greedy"), opt.timetableGrid(box, langs), opt.timetableGrid({ ...box, w: 600 }, langs),
        opt.printingGantt(box, langs), opt.truckBag(box, langs), opt.truckTable(box, langs), opt.truckTree(box, langs), opt.truckTree(box, langs, 4),
        opt.gardenLp(box, langs, { ints: true, values: true }),
        ...["graph", "schedule", "knapsack", "lp", "searchtree"].map((t) => opt.element(t, langs, box)),
      ];
      for (const el of els) expect(run(el as never, langs), `${el.type} ${el.id} ${langs.join("+")}`).toEqual({ errors: [], warnings: [] });
    }
  });

  it("names a graph's mistakes", () => {
    const g = opt.shortestWay(box, ["en", "ar"]);
    expect(codes({ ...g, nodes: [] })).toContain("badCount el.nodes");
    expect(codes({ ...g, edges: [{ a: 0, b: 0 }] })).toContain("badEdge el.edges[0]");
    expect(codes({ ...g, edges: [{ a: 0, b: 99 }] })).toContain("badEdge el.edges[0]");
    expect(run({ ...g, edges: [{ a: 0, b: 1 }, { a: 1, b: 0 }], frames: undefined }).warnings.map((w) => w.code)).toEqual(["dupEdge"]);
    expect(codes({ ...g, frames: [{ nodes: "fc" }] })).toContain("badStates el.frames[0].nodes");
    expect(codes({ ...g, frames: [{ edges: "z".repeat(14) }] })).toContain("badStates el.frames[0].edges");
    expect(codes({ ...g, frames: [{ vals: [1] }] })).toContain("badVals el.frames[0].vals");
    expect(codes({ ...g, frames: [{ colours: new Array(8).fill(7) }] })).toContain("badColours el.frames[0].colours");
    expect(codes({ ...g, frames: [{ path: [0, 42] }] })).toContain("badPath el.frames[0].path");
    expect(codes({ ...g, frames: [{ cut: [[0, 1, 2]] }] })).toContain("badPath el.frames[0].cut");
    expect(codes({ ...g, frames: Array.from({ length: OPT_LIMITS.frames + 1 }, () => ({})) })).toContain("badFrames el.frames");
    expect(codes({ ...g, frame: 99 })).toContain("badFrame el.frame");
    expect(codes({ ...g, fit: "squash" })).toContain("badFit el.fit");
    expect(codes({ ...g, nodes: [{ x: 0, y: 0, label: { en: "Home" } }] })).toContain("missingText el.nodes[0].label");
    expect(codes({ ...g, w: undefined })).toContain("badBox el");
  });

  it("names a schedule's mistakes", () => {
    const s = opt.timetableGrid(box, ["en", "ar"]);
    expect(codes({ ...s, cols: [] })).toContain("badCount el.cols");
    expect(codes({ ...s, items: [{ label: "x", row: 9 }] })).toContain("badItem el.items[0]");
    expect(codes({ ...s, frames: [{ at: [[0, 9]] }] })).toContain("badPlaces el.frames[0].at");
    expect(codes({ ...s, frames: [{ at: s.items.map(() => [5, 0]) }] })).toContain("badPlaces el.frames[0].at[0]");
    expect(codes({ ...s, frames: [{ state: "?".repeat(12) }] })).toContain("badStates el.frames[0].state");
    expect(codes({ ...s, blocked: [[0, 4]] })).toContain("badCells el.blocked");
    expect(codes({ ...s, items: [{ label: "x", row: 0, tone: "pink" }] })).toContain("badTone el.items[0].tone");
    const g = opt.printingGantt(box, ["en", "ar"]);
    expect(codes({ ...g, span: [5, 1] })).toContain("badRange el.span");
    expect(codes({ ...g, items: [{ label: "J", row: 0, len: 0 }], frames: undefined })).toContain("badItem el.items[0].len");
    expect(codes({ ...g, frames: [{ at: g.items.map(() => 999) }] })).toContain("badPlaces el.frames[0].at[0]");
  });

  it("names a knapsack's mistakes", () => {
    const k = opt.truckBag(box, ["en", "ar"]);
    expect(codes({ ...k, items: [] })).toContain("badCount el.items");
    expect(codes({ ...k, items: [{ label: "x", w: 0, v: 1 }], frames: undefined })).toContain("badItem el.items[0]");
    expect(codes({ ...k, cap: -1 })).toContain("badCap el.cap");
    expect(codes({ ...k, frames: [{ in: "zz" }] })).toContain("badStates el.frames[0].in");
    const t = opt.truckTable(box, ["en", "ar"]);
    expect(codes({ ...t, table: t.table!.slice(1) })).toContain("badTable el.table");
    expect(codes({ ...t, step: 10 })).toContain("badTable el.table");
    expect(codes({ ...t, frames: [{ fill: 1000 }] })).toContain("badFill el.frames[0].fill");
    expect(codes({ ...t, frames: [{ trace: [[9, 0]] }] })).toContain("badCells el.frames[0].trace");
  });

  it("names an lp's mistakes", () => {
    const l = opt.gardenLp(box, ["en", "ar"]);
    expect(codes({ ...l, xr: [3, 1] })).toContain("badRange el.xr");
    expect(codes({ ...l, cons: [{ a: 0, b: 0, c: 1 }] })).toContain("badConstraint el.cons[0]");
    expect(codes({ ...l, cons: [{ a: 1, b: 1, c: 1, op: "<" }] })).toContain("badConstraint el.cons[0].op");
    expect(codes({ ...l, obj: undefined })).toContain("badObjective el.obj");
    expect(codes({ ...l, frames: [{ level: "high" }] })).toContain("badLevel el.frames[0].level");
    expect(codes({ ...l, vars: ["x"] })).toContain("badVars el.vars");
    expect(codes({ ...l, ints: true, xr: [0, 100], yr: [0, 100] })).toContain("tooManyDots el.ints");
  });

  it("names a search tree's mistakes", () => {
    const t = opt.truckTree(box, ["en", "ar"]);
    expect(codes({ ...t, steps: [] })).toContain("badCount el.steps");
    expect(codes({ ...t, steps: [{ p: 0, label: "x" }] })).toContain("badParent el.steps[0].p");
    expect(codes({ ...t, steps: [{ p: -1, label: "r" }, { p: 3, label: "x" }] })).toContain("badParent el.steps[1].p");
    expect(codes({ ...t, steps: [{ p: -1, label: "r", mark: "?" }] })).toContain("badMark el.steps[0].mark");
    expect(codes({ ...t, steps: [{ p: -1, label: "r", best: true }] })).toContain("badVal el.steps[0].val");
    const deep = Array.from({ length: OPT_LIMITS.depth + 2 }, (_, i) => ({ p: i - 1, label: String(i) }));
    expect(codes({ ...t, steps: deep, frame: 0 })).toContain(`tooDeep el.steps[${OPT_LIMITS.depth + 1}]`);
    expect(codes({ ...t, frame: 99 })).toContain("badFrame el.frame");
  });

  it("gives every error a path inside the element", () => {
    const bad = [
      { ...opt.shortestWay(box, ["en"]), nodes: [{ x: "1" }] }, { ...opt.timetableGrid(box, ["en"]), rows: [] },
      { ...opt.truckBag(box, ["en"]), show: "pie" }, { ...opt.gardenLp(box, ["en"]), cons: [] }, { ...opt.truckTree(box, ["en"]), steps: [{}] },
    ];
    for (const el of bad) {
      const r = run(el as never, ["en"]);
      expect(r.errors.length, el.type).toBeGreaterThan(0);
      for (const e of r.errors) expect(e.path.startsWith("el"), `${e.code} ${e.path}`).toBe(true);
    }
  });
});
