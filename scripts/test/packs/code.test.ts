// The programming pack's storyboard bodies: programs recorded in MicroPython at conversion, timed to sentences, and
// valid elements; a wrong spec names its scene.
import { describe, expect, it } from "vitest";
import { validatePackage, type Element, type LessonPackage } from "../../../packages/spec/src/index.ts";
import { bodies } from "../../darsi/packs/code.ts";
import type { AText, BodyCtx } from "../../darsi/packs/types.ts";

// Sentence k starts at 4k seconds; texts are { en, "ar-EG" } (a string for both).
const c: BodyCtx = {
  at: (k, o = 0) => Math.round((k * 4 + o) * 1000) / 1000,
  n: 4,
  T: (t: AText, what: string) => {
    if (typeof t === "string") return { en: t, "ar-EG": t };
    if (!t.en || !t["ar-EG"]) throw new Error(`${what}: needs en and ar-EG`);
    return { en: t.en, "ar-EG": t["ar-EG"] };
  },
  langs: ["en", "ar-EG"],
  box: { x: 90, y: 210, w: 1100, h: 400 },
  where: "test scene 2",
};
const pkg = (elements: Element[]): LessonPackage => ({
  manifest: {
    spec: "lesson-package", version: "0.2", id: "code", rev: 1, title: { en: "Code", "ar-EG": "كود" }, defaultLang: "en",
    languages: [
      { code: "en", dir: "ltr", name: "English", duration: 16, timing: "timing/en.json" },
      { code: "ar-EG", dir: "rtl", name: "مصري", duration: 16, timing: "timing/ar-EG.json" },
    ],
    assets: [], licence: { content: "CC-BY-4.0" }, provenance: { origin: "human" },
  } as never,
  scenes: { version: "0.2", scenes: [{ id: "s1", template: "canvas", narration: { en: "One. Two. Three. Four.", "ar-EG": "واحد. اتنين. تلاتة. أربعة." }, content: { elements } }] },
  timing: {},
} as never);
const problems = (els: Element[]) => validatePackage(pkg(els)).errors.filter((e) => e.path.includes("elements"));
const track = (el: Element, prop: string) => el.anim?.find((t) => t.prop === prop);
const pairs = (el: Element, prop: string) => track(el, prop)!.keys.map((k) => [k.at, k.value]);

describe("programming pack storyboard bodies", () => {
  it("records a program and plays its steps over the sentences", () => {
    const [el] = bodies.trace!({ code: "total = 0\nfor m in [7, 5]:\n    total = total + m\nprint(total)", play: [1, 3], focus: [{ s: 2, line: 3 }] }, c);
    const t = el as Extract<Element, { type: "trace" }>;
    expect(t.type).toBe("trace");
    expect(t.steps.map((s) => s.line)).toEqual([1, 2, 3, 2, 3, 2, 4]);
    expect(t.output).toBe("12\n");
    expect(pairs(el!, "frame")).toEqual([[4, 0], [14.5, 6]]);
    expect(pairs(el!, "focus")).toEqual([[8, 3]]);
    expect(problems([el!])).toEqual([]);
  });

  it("pins steps to sentences, and wants an error only when it is the point", () => {
    const [el] = bodies.trace!({ code: "x = 1\ny = x + 1", at: [[0, 0], [2, 1]] }, c);
    expect(pairs(el!, "frame")).toEqual([[0, 0], [8, 1]]);
    expect(() => bodies.trace!({ code: "print(1 / 0)" }, c)).toThrow(/test scene 2: the program stopped with ZeroDivisionError/);
    const [bad] = bodies.trace!({ code: "print(1 / 0)", error: true }, c);
    expect((bad as Extract<Element, { type: "trace" }>).error).toMatch(/ZeroDivisionError/);
    expect(() => bodies.trace!({ code: "while True:\n    pass" }, c)).toThrow(/runs too long/);
    expect(() => bodies.trace!({ code: "x = '" + "a".repeat(50) + "'" }, c)).toThrow(/at most 10 and 40/);
    expect(() => bodies.trace!({ code: "x = 1", at: [[0, 4]] }, c)).toThrow(/there are 1/);
    expect(() => bodies.trace!({ code: "x = 1", play: [2, 9] }, c)).toThrow(/sentence of this scene/);
  });

  it("builds a flowchart with yes and no, and runs the token along its path", () => {
    const [el] = bodies.flowchart!({
      nodes: [
        { id: "s", kind: "start", text: { en: "Start", "ar-EG": "ابدأ" } }, { id: "t", kind: "decision", text: "n > 0?" },
        { id: "d", kind: "process", text: "n = n - 1" }, { id: "e", kind: "end", text: { en: "End", "ar-EG": "النهاية" } },
      ],
      edges: [["s", "t"], ["t", "d", "yes"], ["d", "t"], ["t", "e", "no"]],
      path: ["s", "t", "d", "t", "e"], at: [[0, 0], [1, 2], [3, 4]],
    }, c);
    const f = el as Extract<Element, { type: "flowchart" }>;
    expect(f.edges[1]!.label).toEqual({ "en": "Yes", "ar-EG": "نعم" });
    expect(pairs(el!, "pass")).toEqual([[0, 0], [4, 0.5], [12, 1]]);
    expect(problems([el!])).toEqual([]);
    expect(() => bodies.flowchart!({ nodes: [{ id: "a", kind: "oval" }], edges: [] }, c)).toThrow(/test scene 2: flowchart node 1/);
  });

  it("sorts and searches arrays frame by frame", () => {
    const [sort] = bodies.array!({ values: [4, 2, 3, 1], sort: "bubble", view: "bars", play: [0, 2] }, c);
    const a = sort as Extract<Element, { type: "array" }>;
    expect(a.frames!.length).toBeGreaterThan(5);
    expect(a.counters).toHaveLength(2);
    expect(pairs(sort!, "frame")).toEqual([[0, 0], [12, a.frames!.length - 1]]);
    const [find] = bodies.array!({ values: [1, 3, 5, 7, 9], search: { kind: "binary", target: 7 }, index: true, counters: false }, c);
    const b = find as Extract<Element, { type: "array" }>;
    expect(b.counters).toBeUndefined();
    expect(b.frames!.at(-1)!.found).toBe(3);
    expect(problems([sort!])).toEqual([]);
    expect(problems([{ ...find!, id: "find" }])).toEqual([]);
    expect(() => bodies.array!({ values: [3, 1], search: { kind: "binary", target: 1 } }, c)).toThrow(/sorted/);
    expect(() => bodies.array!({ values: [1, 2], sort: "bogo" }, c)).toThrow(/"sort" is bubble/);
  });

  it("draws call trees, ready-made or recorded from a program", () => {
    const [fib] = bodies.calltree!({ fn: "fib", n: 4, repeats: true, play: [1, 3], focus: [{ s: 3, call: 6 }] }, c);
    const t = fib as Extract<Element, { type: "calltree" }>;
    expect(t.calls).toHaveLength(9);
    expect(pairs(fib!, "frame")).toEqual([[4, 0], [14.5, 17]]);
    const [rec] = bodies.calltree!({ code: "def f(n):\n    return 1 if n < 2 else f(n - 1) + f(n - 2)\n\nf(3)" }, c);
    const r = rec as Extract<Element, { type: "calltree" }>;
    expect(r.calls.map((k) => k.label)).toEqual(["f(3)", "f(2)", "f(1)", "f(0)", "f(1)"]);
    expect(r.calls[0]!.ret).toBe("3");
    expect(problems([fib!])).toEqual([]);
    expect(problems([{ ...rec!, id: "rec" }])).toEqual([]);
    expect(() => bodies.calltree!({ fn: "fib", n: 6 }, c)).toThrow(/25 calls/);
  });

  it("swaps a bug for its fix on its sentence, with what each prints", () => {
    const [el] = bodies.codediff!({ before: "for i in range(1, 3):\n    print(i)", after: "for i in range(1, 4):\n    print(i)", fix: 2, run: true, focus: [{ s: 1, line: 1 }] }, c);
    const d = el as Extract<Element, { type: "codediff" }>;
    expect(d.output).toEqual({ before: "1\n2", after: "1\n2\n3" });
    expect(pairs(el!, "frame")).toEqual([[8, 0], [9, 1]]);
    expect(problems([el!])).toEqual([]);
    expect(() => bodies.codediff!({ before: "a", after: "b" }, c)).toThrow(/"fix" must be a sentence/);
  });
});
