// The studio's science helpers: numbers and points as text, equation and expression checks, the edits that keep a
// diagram, a network or a table valid, and the ready-made elements of the Add menus, valid in every stage shape.
import { describe, expect, it } from "vitest";
import type { ArchElement, Element, MathElement, NetElement, Orient, TableElement } from "@lessonstudio/spec";
import { applyOps, check, newLesson, presetKeys, type Lesson } from "@lessonstudio/ops";
import {
  SCIENCE_KINDS, archFrom, cellFrom, exprProblem, focusParts, layersProblem, parseNums, parsePoints, parseRows, pointsText,
  removeBlock, removeColumn, renameBlock, rowsText, seriesOf, swapColumns, texProblem, toggleMember, usableProps, withLayers, withTex,
} from "../src/science.ts";

const SIZE: Record<Orient, [number, number]> = { landscape: [1280, 720], portrait: [720, 1280], square: [1080, 1080] };
const lessonWith = (langs: string[], stage: Orient, elements: Element[]): Lesson => {
  const l = newLesson({ id: "science", title: Object.fromEntries(langs.map((c) => [c, "Science"])), languages: langs.map((code) => ({ code, name: code === "ar" ? "العربية" : code })), stage, createdBy: "u" }, "2026-10-28");
  l.scenes.scenes = [{ id: "s", template: "canvas", narration: Object.fromEntries(langs.map((c) => [c, "A short scene."])), content: { elements } }];
  return l;
};

describe("numbers and points as text", () => {
  it("reads numbers with commas, spaces, the Arabic comma and the minus sign", () => {
    expect(parseNums("1, 2.5 -3")).toEqual([1, 2.5, -3]);
    expect(parseNums("1، −2")).toEqual([1, -2]);
    expect(parseNums("1, x")).toBeNull();
    expect(parseRows("1, 0; 2, -1\n3")).toEqual([[1, 0], [2, -1], [3]]);
    expect(parseRows("1, ; ;")).toEqual([[1]]);
    expect(parsePoints("0, 1; 1, 2")).toEqual([[0, 1], [1, 2]]);
    expect(parsePoints("0, 1, 2")).toBeNull();
    expect(pointsText([[0, 1], [1.5, -2]])).toBe("0, 1; 1.5, -2");
    expect(rowsText([[1, 0], [2]])).toBe("1, 0; 2");
  });

  it("says what is wrong with an equation or an expression, and where", () => {
    expect(texProblem("\\frac{a}{b}")).toBeNull();
    const bad = texProblem("x = \\frac{a}{b");
    expect(bad?.message).toMatch(/without its/);
    expect(typeof bad?.at).toBe("number");
    expect(texProblem("\\nope")?.at).toBe(0);
    expect(exprProblem("sigmoid(a*x) + b")).toBeNull();
    expect(exprProblem("x +")?.message).toBeTruthy();
    expect(exprProblem("foo(x)")?.at).toBe(0);
  });
});

describe("edits that keep an element valid", () => {
  it("gives an equation's new \\w words a placeholder in each language", () => {
    const el: MathElement = { id: "m", type: "math", x: 0, y: 0, w: 400, h: 100, tex: "y", words: { a: "A" } };
    expect(withTex(el, "\\w{a} + \\w{loss}", ["en", "ar"])).toEqual({ tex: "\\w{a} + \\w{loss}", words: { a: "A", loss: { en: "loss", ar: "loss" } } });
    expect(withTex(el, "\\w{a}", ["en"])).toEqual({ tex: "\\w{a}" });
  });

  it("checks layer lists and drops what no longer fits the new layers", () => {
    expect(layersProblem([2, 4, 1])).toBeNull();
    expect(layersProblem([3])).toBe("netLayersCount");
    expect(layersProblem([2, 11])).toBe("netLayersSize");
    expect(layersProblem([10, 10, 10, 10, 10])).toBe("netTooBig");
    const el: NetElement = { id: "n", type: "net", x: 0, y: 0, w: 400, h: 300, layers: [2, 1], weights: [[[[1], [1]]]], acts: [[[1, 1], [1]]], frame: 0, labels: { in: ["a", "b"], out: ["y"] } };
    expect(withLayers(el, [2, 1])).toEqual({ layers: [2, 1] });
    expect(withLayers(el, [3, 2, 2])).toEqual({ layers: [3, 2, 2], weights: null, acts: null, frame: null, labels: { in: ["a", "b", "x₃"], out: ["y", "y₂"] } });
  });

  it("renames and removes diagram blocks with their arrows and groups", () => {
    const el = archFrom("transformer", { id: "a", x: 0, y: 0, w: 900, h: 400 }, ["en"]);
    const r = renameBlock(el, "att", "attention");
    expect(r.blocks.some((b) => b.id === "attention")).toBe(true);
    expect(r.edges.some((e) => e.from === "attention")).toBe(true);
    expect(r.groups![0]!.blocks).toContain("attention");
    const gone = removeBlock(el, "n1");
    expect(gone.edges.some((e) => e.from === "n1" || e.to === "n1")).toBe(false);
    expect(gone.groups![0]!.blocks).not.toContain("n1");
    const one: ArchElement = { ...el, groups: [{ id: "g", blocks: ["att"] }] };
    expect(removeBlock(one, "att").groups).toBeUndefined();
    const two: ArchElement = { ...el, groups: [{ id: "g", blocks: ["att"] }, { id: "h", blocks: [] }] };
    expect(toggleMember(two, "h", "att")).toEqual([{ id: "g", blocks: [] }, { id: "h", blocks: ["att"] }]);
  });

  it("names the blocks a ready-made diagram leaves unnamed", () => {
    const l = lessonWith(["en", "ar"], "landscape", [archFrom("resnet", { id: "a", x: 40, y: 150, w: 1200, h: 470 }, ["en", "ar"])]);
    expect(check(l).errors).toEqual([]);
  });

  it("keeps a table's cells and left-to-right columns in step", () => {
    const el: TableElement = { id: "t", type: "table", x: 0, y: 0, w: 600, h: 300, cols: ["A", "B", "C"], rows: [[1, 2, 3]], ltr: [0, 2] };
    expect(removeColumn(el, 1)).toEqual({ cols: ["A", "C"], rows: [[1, 3]], ltr: [0, 1] });
    expect(removeColumn({ ...el, ltr: [1] }, 1).ltr).toBeNull();
    expect(swapColumns(el, 0, 1)).toEqual({ cols: ["B", "A", "C"], rows: [[2, 1, 3]], ltr: [1, 2] });
    expect(cellFrom({ en: "12", ar: "12" }, ["en", "ar"])).toBe(12);
    expect(cellFrom({ en: "97%", ar: "97%" }, ["en", "ar"])).toBe("97%");
    expect(cellFrom({ en: "cat", ar: "قطة" }, ["en", "ar"])).toEqual({ en: "cat", ar: "قطة" });
  });

  it("makes a new series of any kind inside the plot", () => {
    const plot = SCIENCE_KINDS.find((k) => k.key === "plot")!.make({ w: 1280, h: 720, langs: ["en"] }, ["p"])[0]!;
    if (plot.type !== "plot") throw new Error("plot");
    for (const kind of ["fn", "line", "area", "dots", "marker", "hline", "vline", "heat"] as const) {
      const l = lessonWith(["en"], "landscape", [{ ...plot, series: [seriesOf(kind, plot, { kind: "fn", fn: "x", tone: "ok", label: "keep" })] }]);
      expect(check(l).errors, kind).toEqual([]);
    }
  });
});

describe("the Add menus' science elements", () => {
  for (const stage of ["landscape", "portrait", "square"] as const) {
    for (const langs of [["en", "ar"], ["ar"], ["en", "ar", "fr"]]) {
      it(`validate cleanly and stay on the stage: ${stage}, ${langs.join("+")}`, () => {
        const [w, h] = SIZE[stage];
        for (const k of SCIENCE_KINDS) {
          const els = k.make({ w, h, langs }, k.ids);
          const r = check(lessonWith(langs, stage, els));
          expect(r.errors, k.key).toEqual([]);
          expect(r.warnings, k.key).toEqual([]);
          for (const el of els) {
            expect(el.x >= 0 && el.y >= 0 && el.x + (el.w ?? 0) <= w && el.y + (el.h ?? 0) <= h, `${k.key} ${stage}`).toBe(true);
          }
        }
      });
    }
  }

  it("offer the animations that apply to them", () => {
    const els = Object.fromEntries(SCIENCE_KINDS.map((k) => [k.key, k.make({ w: 1280, h: 720, langs: ["en"] }, k.ids)[0]!]));
    const works = (el: Element, p: Parameters<typeof presetKeys>[1]): boolean => { try { presetKeys(el, p, 0); return true; } catch { return false; } };
    expect(works(els.net!, "train") && works(els.net!, "forward") && works(els["arch-cnn"]!, "backward") && works(els.descent!, "train")).toBe(true);
    expect(works(els.math!, "train") || works(els.table!, "forward")).toBe(false);
    expect(usableProps(els.net!)).toEqual(expect.arrayContaining(["frame", "focus", "pass", "reveal"]));
    expect(usableProps(els.table!)).not.toContain("pass");
    expect(usableProps({ id: "x", type: "text", x: 0, y: 0, text: "x" })).not.toContain("focus");
    expect(focusParts(els.math!, "en")).toEqual(["\\g{1}", "\\g{2}", "\\g{3}", "\\g{4}"]);
    expect(focusParts(els["arch-mlp"]!, "en")[0]).toBe("Input");
    expect(focusParts(els.table!, "en")).toHaveLength(3);
  });

  it("are added, and undone, with the operations", () => {
    const l = lessonWith(["en", "ar"], "landscape", []);
    const els = SCIENCE_KINDS.find((k) => k.key === "training")!.make({ w: 1280, h: 720, langs: ["en", "ar"] }, ["map", "loss"]);
    const done = applyOps(l, els.map((element) => ({ op: "addElement", scene: "s", element })));
    const s = done.lesson.scenes.scenes[0]!;
    expect(s.template === "canvas" && s.content.elements.map((e) => e.id)).toEqual(["map", "loss"]);
    const ed = applyOps(done.lesson, [{ op: "updateElement", scene: "s", element: "map", props: { frame: 3, grid: true } }]);
    expect(applyOps(ed.lesson, ed.inverse).lesson).toEqual(done.lesson);
    expect(applyOps(done.lesson, done.inverse).lesson).toEqual(l);
  });
});
