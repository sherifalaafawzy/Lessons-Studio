// The programming pack's authoring side: real MicroPython traces, sorts and searches frame by frame, call trees,
// default elements and the gallery scenes.
import { describe, expect, it } from "vitest";
import { validatePackage, type Element, type LessonPackage } from "@lessonstudio/spec";
import { check, newLesson, type Lesson } from "../../src/index.ts";
import {
  AREA_CODE, AREA_RUN, SORTS, SUM_CODE, SUM_RUN, callSteps, callTree, element, instrument, presets, recordTrace, searchFrames, sortFrames, traceCalls,
  type ArrayFrame,
} from "../../src/packs/code.ts";

const lines = (rec: { steps: { line: number }[] }): number[] => rec.steps.map((s) => s.line);
const lessonWith = (els: Element[]): Lesson => {
  const l = newLesson({ id: "code-pack", title: { en: "Code", ar: "كود" }, languages: [{ code: "en", name: "English" }, { code: "ar", name: "العربية" }], createdBy: "u" }, "2026-10-29");
  l.scenes.scenes = [{ id: "s", template: "canvas", narration: { en: "One two three.", ar: "واحد اثنان ثلاثة." }, content: { elements: els } }];
  return l;
};

describe("instrumenting a program keeps its lines", () => {
  it("maps every line it adds to 0, and every line of the program to itself", () => {
    const code = "def f(a, b=2):\n    c = a + b\n    for i in range(2):\n        c += i\n    return c\n\nx = f(1)\nwhile x > 0:\n    x -= 2\nprint(x)";
    const { src, map } = instrument(code);
    const out = src.replace(/\n$/, "").split("\n");
    expect(map).toHaveLength(out.length + 1);
    out.forEach((l, i) => {
      const at = map[i + 1]!;
      if (at === 0) expect(l.trim()).toMatch(/^_ls_(set|tick)\(/);
      else if (l.trim().startsWith("@_ls_fn")) expect(code.split("\n")[at - 1]).toMatch(/^def /);
      else if (/^\s*(while True:|if not \()/.test(l)) expect(code.split("\n")[at - 1]).toMatch(/^while /);
      else expect(l).toBe(code.split("\n")[at - 1]);
    });
    expect(src).toContain("_ls_set({'a': a, 'b': b})");
    expect(src).toContain("_ls_set({'c': c})");
    expect(src).toContain("_ls_set({'i': i})");
  });
});

describe("recordTrace (MicroPython)", () => {
  it("records a loop line by line, with the variables after each line", async () => {
    const r = await recordTrace(SUM_CODE);
    expect(r).toEqual({ ...SUM_RUN, calls: [] });
    expect(lines(r)).toEqual([1, 2, 3, 4, 3, 4, 3, 4, 3, 5]);
    expect(r.steps.map((s) => s.vars!.total ?? "")).toEqual(["", "0", "0", "7", "7", "12", "12", "21", "21", "21"]);
  });

  it("records a function's own variables, what it returns, and goes back to the line that called it", async () => {
    const r = await recordTrace(AREA_CODE);
    expect({ steps: r.steps, output: r.output }).toEqual(AREA_RUN);
    expect(r.calls).toEqual([{ label: "area(4, 3)", parent: -1, ret: "12" }]);
  });

  it("tests a while loop's condition every time round", async () => {
    const r = await recordTrace("n = 3\nwhile n > 0:\n    n = n - 1\nprint('go')");
    expect(lines(r)).toEqual([1, 2, 3, 2, 3, 2, 3, 2, 4]);
    expect(r.output).toBe("go\n");
  });

  it("never lights a line that didn't run", async () => {
    const r = await recordTrace("for m in [40, 70]:\n    if m >= 50:\n        print(m)\nx = 1\nif x > 5:\n    print('big')");
    expect(lines(r)).toEqual([1, 2, 1, 2, 3, 1, 4, 5]);
  });

  it("records recursion as calls, and returns travelling back up", async () => {
    const r = await recordTrace("def fact(n):\n    if n <= 1:\n        return 1\n    return n * fact(n - 1)\n\nprint(fact(3))");
    expect(r.output).toBe("6\n");
    expect(r.calls.map((c) => [c.label, c.parent, c.ret])).toEqual([["fact(3)", -1, "6"], ["fact(2)", 0, "2"], ["fact(1)", 1, "1"]]);
    expect(Math.max(...r.steps.map((s) => s.depth ?? 0))).toBe(3);
    expect(r.steps.filter((s) => s.ret !== undefined).map((s) => s.ret)).toEqual(["1", "2", "6"]);
    expect(traceCalls(r)).toEqual([{ label: "fact(3)", ret: "6" }, { label: "fact(2)", parent: 0, ret: "2" }, { label: "fact(1)", parent: 1, ret: "1" }]);
  });

  it("keeps the error a program stops with, on its line", async () => {
    const r = await recordTrace("nums = [4, 0]\nfor n in nums:\n    print(8 // n)");
    expect(r.error).toMatch(/ZeroDivisionError/);
    expect(r.output).toBe("2\n");
    expect(r.steps.at(-1)).toMatchObject({ line: 3, err: true });
  });

  it("answers input() and prints the prompt with the answer", async () => {
    const r = await recordTrace("name = input('Name? ')\nprint('Hi ' + name)", { inputs: ["Ada"] });
    expect(r.output).toBe("Name? Ada\nHi Ada\n");
    expect(r.steps[0]!.vars).toEqual({ name: "'Ada'" });
  });

  it("stops a program that runs forever", async () => {
    const r = await recordTrace("i = 0\nwhile True:\n    i += 1", { maxSteps: 30 });
    expect(r.cut).toBe(true);
    expect(r.steps).toHaveLength(30);
  });

  it("gives the same steps every time", async () => {
    expect(await recordTrace(SUM_CODE)).toEqual(await recordTrace(SUM_CODE));
  });
});

/** The values in slot order at each frame. */
const replay = (values: number[], frames: ArrayFrame[]): number[][] => {
  let order = values.map((_, i) => i);
  return frames.map((f) => { order = f.order ?? order; return order.map((i) => values[i]!); });
};

describe("sorts and searches, frame by frame", () => {
  const values = [5, 3, 8, 1, 6, 2];
  for (const alg of SORTS) {
    it(`${alg} sort ends sorted, every frame a real order, the counters only growing`, () => {
      const { frames, counters } = sortFrames(alg, values);
      const states = replay(values, frames);
      expect(states[0]).toEqual(values);
      expect(states.at(-1)).toEqual([...values].sort((a, b) => a - b));
      expect(frames.at(-1)!.done).toEqual([0, 1, 2, 3, 4, 5]);
      expect(counters).toHaveLength(2);
      for (let k = 1; k < frames.length; k++) {
        expect(frames[k]!.count![0]).toBeGreaterThanOrEqual(frames[k - 1]!.count![0]!);
        expect(frames[k]!.count![1]).toBeGreaterThanOrEqual(frames[k - 1]!.count![1]!);
        if (frames[k]!.order) expect(new Set(frames[k]!.order).size).toBe(values.length);
      }
    });
  }

  it("counts what each sort really does", () => {
    expect(sortFrames("bubble", values).frames.at(-1)!.count).toEqual([15, 9]);
    expect(sortFrames("selection", values).frames.at(-1)!.count).toEqual([15, 3]);
    expect(sortFrames("bubble", [1, 2, 3]).frames.at(-1)!.count).toEqual([2, 0]);
  });

  it("binary search halves the range and finds its target", () => {
    const s = searchFrames("binary", [3, 8, 12, 17, 23, 31, 40], 23);
    expect(s.found).toBe(4);
    expect(s.frames.map((f) => f.note)).toEqual(["target = 23", "a[3] = 17 < 23", "lo = mid + 1", "a[5] = 31 > 23", "hi = mid - 1", "a[4] = 23 == 23", "return 4"]);
    expect(s.frames.at(-1)!.found).toBe(4);
    expect(searchFrames("binary", [1, 2, 3], 9).frames.at(-1)!.note).toBe("return -1");
    expect(() => searchFrames("binary", [3, 1], 1)).toThrow(/sorted/);
  });

  it("linear search looks at each slot in turn", () => {
    const s = searchFrames("linear", [4, 7, 1], 1);
    expect(s.found).toBe(2);
    expect(s.frames.filter((f) => f.compare).map((f) => f.ptr!.i)).toEqual([0, 1, 2]);
  });
});

describe("call trees", () => {
  it("knows fib, factorial and hanoi", () => {
    const fib = callTree("fib", 4, { repeats: true });
    expect(fib.calls).toHaveLength(9);
    expect(fib.calls[0]).toEqual({ label: "fib(4)", ret: "3" });
    expect(fib.calls.filter((c) => c.tone).map((c) => c.label)).toEqual(["fib(1)", "fib(2)", "fib(1)", "fib(0)"]);
    expect(fib.steps).toEqual(callSteps(fib.calls));
    expect(callTree("factorial", 4).calls.map((c) => c.ret)).toEqual(["24", "6", "2", "1"]);
    const h = callTree("hanoi", 3);
    expect(h.calls).toHaveLength(7);
    expect(h.calls[0]).toEqual({ label: "hanoi(3,A,C)", ret: "4" });
    expect(h.calls.map((c) => Number(c.ret)).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
});

describe("default elements and gallery scenes", () => {
  it("gives a valid element of every type", () => {
    for (const type of ["trace", "flowchart", "array", "calltree", "codediff"]) {
      const r = check(lessonWith([element(type, ["en", "ar"])]));
      expect(r.errors, type).toEqual([]);
      expect(r.warnings, type).toEqual([]);
    }
    expect(() => element("graph")).toThrow(/no element type/);
  });

  it("has a scene for every element type, in every stage shape", () => {
    for (const stage of ["landscape", "portrait", "square"] as const) {
      const types = new Set<string>();
      for (const p of presets(["en", "ar"], stage)) for (const el of (p.scene as { content: { elements: Element[] } }).content.elements) types.add(el.type);
      expect([...types].sort(), stage).toEqual(["array", "calltree", "codediff", "flowchart", "text", "trace"]);
    }
  });

  it("anchors every animation on a spoken word, in every language", () => {
    for (const p of presets(["en", "ar"])) {
      for (const el of (p.scene as { content: { elements: Element[] } }).content.elements) {
        for (const tr of el.anim ?? []) for (const k of tr.keys) expect(typeof k.at, `${p.id} ${tr.prop}`).toBe("object");
      }
      const pkg = { manifest: lessonWith([]).manifest, scenes: { version: "0.2", scenes: [p.scene] }, timing: {} } as unknown as LessonPackage;
      expect(validatePackage(pkg).errors.filter((e) => e.path.startsWith("scenes")), p.id).toEqual([]);
    }
  });
});
