import { describe, expect, it } from "vitest";
import { compileExpr, parseTex, validatePackage, type Element, type LessonPackage, type MNode } from "../src/index.ts";

/** The tree as compact text, to compare shapes. */
const show = (n: MNode): string => {
  switch (n.t) {
    case "row": return `[${n.c.map(show).join(" ")}]`;
    case "i": case "n": case "x": return n.v;
    case "o": return n.v;
    case "w": return `w:${n.k}`;
    case "frac": return `frac(${show(n.a)},${show(n.b)})`;
    case "s": return `${show(n.b)}${n.sub ? `_${show(n.sub)}` : ""}${n.sup ? `^${show(n.sup)}` : ""}`;
    case "sqrt": return `sqrt(${show(n.a)})`;
    case "big": return `${n.v}${n.sub ? `_${show(n.sub)}` : ""}${n.sup ? `^${show(n.sup)}` : ""}`;
    case "acc": return `${n.v}(${show(n.a)})`;
    case "bf": return `bf(${show(n.a)})`;
    case "fence": return `${n.l}${show(n.a)}${n.r}`;
    case "mat": return `mat${n.l}${n.rows.map((r) => r.map(show).join("&")).join("\\\\")}${n.r}`;
    case "g": return `g${n.n}(${show(n.a)})`;
    case "c": return `${n.tone}(${show(n.a)})`;
    case "sp": return "␣";
  }
};

describe("TeX subset", () => {
  it("parses a neuron, a loss and a softmax", () => {
    expect(show(parseTex("y = \\sigma(w_1 x_1 + w_2 x_2 + b)").root)).toBe("[y = σ ( w_1 x_1 + w_2 x_2 + b )]");
    expect(show(parseTex("L = \\frac{1}{n}\\sum_{i=1}^{n} (y_i - \\hat{y}_i)^2").root)).toBe("[L = frac(1,n) ∑_[i = 1]^n ( y_i − hat(y)_i )^2]");
    expect(show(parseTex("\\operatorname{softmax}(z)_i = \\frac{e^{z_i}}{\\sum_j e^{z_j}}").root)).toBe("[softmax ( z )_i = frac(e^z_i,[∑_j e^z_j])]");
  });

  it("knows matrices, fences, accents, bold vectors and limits under max", () => {
    expect(show(parseTex("\\mathbf{W}\\begin{bmatrix} x_1 \\\\ x_2 \\end{bmatrix}").root)).toBe("[bf(W) mat[x_1\\\\x_2]]");
    expect(show(parseTex("\\left( \\frac{a}{b} \\right)").root)).toBe("(frac(a,b))");
    expect(show(parseTex("\\max_{x} f(x)").root)).toBe("[max_x f ( x )]");
    expect(show(parseTex("\\vec{v} \\cdot \\vec{u} \\le 1").root)).toBe("[vec(v) ⋅ vec(u) ≤ 1]");
    expect(show(parseTex("\\sqrt{x^2 + 1}").root)).toBe("sqrt([x^2 + 1])");
  });

  it("marks parts, colours and words", () => {
    const p = parseTex("\\g{1}{\\c{accent}{w}} \\g{2}{x} + \\g{3}{b} = \\w{out}");
    expect(p.groups).toEqual([1, 2, 3]);
    expect(p.words).toEqual(["out"]);
    expect(p.tones).toEqual(["accent"]);
  });

  it("refuses what it can't draw, with the place", () => {
    for (const bad of ["\\frac{1}", "x^", "{x", "\\unknown", "a^b^c", "\\g{0}{x}", "\\c{pink}{x}", "\\begin{bmatrix} 1 \\end{pmatrix}", "\\left( x", "x & y", "\\text{\\alpha}"]) {
      expect(() => parseTex(bad), bad).toThrow();
    }
    expect(() => parseTex("x".repeat(401))).toThrow(/400/);
  });
});

describe("plot expressions", () => {
  it("computes functions of x and the parameters", () => {
    expect(compileExpr("a*x + b")(2, [3, 1])).toBe(7);
    expect(compileExpr("1/(1+exp(-x))")(0, [])).toBe(0.5);
    expect(compileExpr("max(0, x) - relu(x)")(-2, [])).toBe(0);
    expect(compileExpr("-x^2")(3, [])).toBe(-9);
    expect(compileExpr("(x-2)^2 + 1")(2, [])).toBe(1);
    expect(compileExpr("2*pi")(0, [])).toBeCloseTo(6.2832, 4);
  });
  it("refuses anything else", () => {
    for (const bad of ["", "x +", "alert(1)", "x;y", "max(1)", "sin x", "constructor"]) expect(() => compileExpr(bad), bad).toThrow();
  });
});

describe("science elements in a package", () => {
  const pkg = (elements: Element[]): LessonPackage => ({
    manifest: {
      spec: "lesson-package", version: "0.2", id: "sci", rev: 1, title: { en: "Sci", ar: "علوم" }, defaultLang: "en",
      languages: [
        { code: "en", dir: "ltr", name: "English", duration: 5, timing: "timing/en.json" },
        { code: "ar", dir: "rtl", name: "العربية", duration: 5, timing: "timing/ar.json" },
      ],
      assets: [], licence: { content: "CC-BY-4.0" }, provenance: { origin: "human" },
    } as never,
    scenes: { version: "0.2", scenes: [{ id: "s1", template: "canvas", narration: { en: "One neuron.", ar: "خلية واحدة." }, content: { elements } }] },
    timing: {},
  } as never);
  const codes = (els: Element[]) => validatePackage(pkg(els)).errors.filter((e) => e.path.includes("elements")).map((e) => e.code);

  it("accepts a good equation, plot, network, diagram and table", () => {
    const els: Element[] = [
      { id: "eq", type: "math", x: 0, y: 0, w: 600, h: 120, tex: "\\g{1}{y} = \\g{2}{w x + b}", anim: [{ prop: "reveal", keys: [{ at: 0, value: 0 }, { at: 2, value: 1 }] }] },
      { id: "pl", type: "plot", x: 0, y: 0, w: 600, h: 400, xr: [0, 10], yr: [0, 1], series: [{ kind: "fn", fn: "a*x", params: [[0.1], [0.05]] }, { kind: "marker", pts: [[1, 1], [2, 0.5]] }], anim: [{ prop: "frame", keys: [{ at: 0, value: 0 }, { at: 2, value: 1 }] }] },
      { id: "nt", type: "net", x: 0, y: 0, w: 600, h: 400, layers: [2, 3, 1], acts: [[[0, 1], [0.2, 0.5, 1], [0.7]]], anim: [{ prop: "pass", keys: [{ at: 0, value: 0 }, { at: 2, value: 2 }] }] },
      { id: "ar", type: "arch", x: 0, y: 0, w: 600, h: 400, blocks: [{ id: "in", kind: "input", label: { en: "Text", ar: "نص" } }, { id: "at", kind: "attn", label: { en: "Attention", ar: "الانتباه" } }], edges: [{ from: "in", to: "at" }, { from: "in", to: "at", skip: true }] },
      { id: "tb", type: "table", x: 0, y: 0, w: 600, h: 300, cols: [{ en: "Name", ar: "الاسم" }, { en: "Mark", ar: "الدرجة" }], rows: [["Amina", 9]] },
    ];
    expect(codes(els)).toEqual([]);
  });

  it("names what's wrong", () => {
    expect(codes([{ id: "eq", type: "math", x: 0, y: 0, w: 600, h: 120, tex: "\\frac{1}" }])).toEqual(["badTex"]);
    expect(codes([{ id: "eq", type: "math", x: 0, y: 0, w: 600, h: 120, tex: "\\w{loss}" }])).toEqual(["texWord"]);
    expect(codes([{ id: "eq", type: "math", x: 0, y: 0, w: 600, h: 120, tex: { en: "\\g{1}{x}", ar: "س" } }])).toEqual(["texParts"]);
    expect(codes([{ id: "pl", type: "plot", x: 0, y: 0, w: 600, h: 400, xr: [1, 0], yr: [0, 1], series: [{ kind: "fn", fn: "x +" }] }])).toEqual(["badRange", "badFn"]);
    expect(codes([{ id: "nt", type: "net", x: 0, y: 0, w: 600, h: 400, layers: [2, 3], weights: [[[[1, 2, 3]]]] }])).toEqual(["badWeights"]);
    expect(codes([{ id: "nt", type: "net", x: 0, y: 0, w: 600, h: 400, layers: [10, 10, 10, 10, 10] }])).toContain("tooManyNeurons");
    expect(codes([{ id: "ar", type: "arch", x: 0, y: 0, w: 600, h: 400, blocks: [{ id: "a", kind: "dense", label: { en: "A", ar: "أ" } }, { id: "b", kind: "dense", label: { en: "B", ar: "ب" } }], edges: [{ from: "a", to: "b" }, { from: "b", to: "a" }] }])).toEqual(["archCycle"]);
    expect(codes([{ id: "tx", type: "text", x: 0, y: 0, text: { en: "x", ar: "س" }, anim: [{ prop: "pass", keys: [{ at: 0, value: 1 }] }] }])).toEqual(["badProp"]);
  });
});
