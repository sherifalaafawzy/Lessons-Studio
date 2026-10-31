import { describe, expect, it } from "vitest";
import { validatePackage, type Element, type LessonPackage } from "../../src/index.ts";
import { cellAt } from "../../src/packs/data/check.ts";

const pkg = (elements: Element[]): LessonPackage => ({
  manifest: {
    spec: "lesson-package", version: "0.2", id: "data", rev: 1, title: { en: "Data", ar: "بيانات" }, defaultLang: "en",
    languages: [
      { code: "en", dir: "ltr", name: "English", duration: 5, timing: "timing/en.json" },
      { code: "ar", dir: "rtl", name: "العربية", duration: 5, timing: "timing/ar.json" },
    ],
    assets: [], licence: { content: "CC-BY-4.0" }, provenance: { origin: "human" },
  } as never,
  scenes: { version: "0.2", scenes: [{ id: "s1", template: "canvas", narration: { en: "One table.", ar: "جدول واحد." }, content: { elements } }] },
  timing: {},
} as never);
const issues = (els: Element[]) => validatePackage(pkg(els)).errors.filter((e) => e.path.includes("elements"));
const codes = (els: Element[]) => issues(els).map((e) => e.code);
const box = { x: 0, y: 0, w: 1000, h: 500 };
const T = (en: string, ar: string) => ({ en, ar });

const erd: Element = {
  id: "erd", type: "erd", ...box,
  tables: [
    { name: "students", label: T("Students", "الطلاب"), cols: [{ name: "id", type: "INT", key: "pk" }, { name: "name", type: "TEXT" }] },
    { name: "marks", cols: [{ name: "student_id", key: "fk" }, { name: "mark" }] },
  ],
  rels: [{ from: "students", to: "marks", kind: "1-n", via: "student_id", label: T("has", "لديه") }],
  anim: [{ prop: "reveal", keys: [{ at: 0, value: 0 }, { at: 1, value: 1 }] }, { prop: "focus", keys: [{ at: 1, value: 3, ease: "step" }] }],
};
const query: Element = {
  id: "q", type: "query", ...box, sql: "SELECT name\nFROM t\nWHERE mark > 5",
  grids: [{ name: "t", cols: ["name", "mark"], rows: [["Amina", 9], ["Joseph", 4]] }, { cols: ["name"], rows: [["Amina"]] }],
  steps: [
    { kind: "from", lines: [1], views: [{ g: 0, rows: [0, 1] }] },
    { kind: "where", lines: [2], views: [{ g: 0, rows: [0, 1], out: [1], lit: [1] }] },
    { kind: "select", lines: [0], views: [{ g: 1, rows: [0] }] },
    { kind: "result", lines: [], views: [{ g: 1, rows: [0] }] },
  ],
  words: { Amina: T("Amina", "أمينة") },
  anim: [{ prop: "frame", keys: [{ at: 0, value: 0 }, { at: 2, value: 3 }] }],
};
const pipeline: Element = {
  id: "p", type: "pipeline", ...box,
  stages: [{ id: "in", label: T("Collect", "جمع"), icon: "wifi", kind: "source" }, { id: "chk", label: T("Check", "فحص"), kind: "check" }, { id: "db", label: T("Save", "حفظ"), kind: "store" }],
  edges: [["in", "chk"], ["chk", "db"]],
  records: [{ path: [[0, 0], [1, 1], [2, 1], [3, 2]] }, { path: [[0, 0], [1, 1], [2, 1], [3, 1, 1]], bad: 1.5 }],
  frames: [[2, 0, 0, 0], [2, 2, 0, 0], [2, 2, 0, 0], [2, 2, 1, 1]],
  aside: T("Set aside", "جانبًا"),
  anim: [{ prop: "pass", keys: [{ at: 0, value: 0 }, { at: 2, value: 1 }] }],
};
const sheet: Element = {
  id: "s", type: "sheet", ...box, cols: 3, rows: 3,
  cells: { A1: { t: T("Name", "الاسم"), b: true }, B1: { t: T("Mark", "الدرجة") }, A2: { v: "Amina" }, B2: { v: 9 }, B3: { f: "=SUM(B2:B2)", v: 9, at: 1 }, C2: { v: "Cario", to: { at: 1, v: "Cairo" } } },
  frames: ["B2", "B3"], issues: [{ cells: "C2", kind: "typo", label: T("Typo", "خطأ إملائي"), fixed: 1 }],
};

describe("the data pack's elements in a package", () => {
  it("accepts a good ERD, query, pipeline and sheet", () => {
    expect(issues([erd, query, pipeline, sheet])).toEqual([]);
    expect(validatePackage(pkg([erd, query, pipeline, sheet])).warnings.filter((w) => w.path.includes("elements"))).toEqual([]);
  });

  it("names what's wrong in an ERD", () => {
    const e = erd as Extract<Element, { type: "erd" }>;
    expect(codes([{ ...e, tables: [...e.tables, { name: "students", cols: [{ name: "x" }] }] }])).toEqual(["dupId"]);
    expect(codes([{ ...e, tables: [{ name: "my table", cols: [] }] }])).toContain("badId");
    expect(codes([{ ...e, tables: [{ name: "t", cols: [] }] }])).toContain("badCount");
    expect(codes([{ ...e, rels: [{ from: "students", to: "nowhere", kind: "1-n" }] }])).toEqual(["badRel"]);
    expect(codes([{ ...e, rels: [{ from: "students", to: "marks", kind: "1-n", via: "nope" }] }])).toEqual(["badRel"]);
    expect(codes([{ ...e, rels: [{ from: "students", to: "marks", kind: "many" as never }] }])).toEqual(["badRel"]);
    expect(codes([{ ...e, tables: [{ name: "t", label: { en: "T" }, cols: [{ name: "a", key: "pk" }] }], rels: [] }])).toEqual(["missingText"]);
  });

  it("names what's wrong in a query", () => {
    const q = query as Extract<Element, { type: "query" }>;
    expect(codes([{ ...q, sql: "" }])).toContain("badSql");
    expect(codes([{ ...q, sql: "SELECT " + "x, ".repeat(30) + "y\nFROM t\nWHERE a" }])).toEqual(["badSql"]);
    expect(codes([{ ...q, grids: [{ cols: ["a", "b"], rows: [["x"]] }, q.grids[1]!] }])).toContain("badRow");
    expect(codes([{ ...q, steps: [{ kind: "from", lines: [9], views: [{ g: 0, rows: [0] }] }] }])).toEqual(["badStep"]);
    expect(codes([{ ...q, steps: [{ kind: "from", lines: [0], views: [{ g: 5, rows: [0] }] }] }])).toEqual(["badView"]);
    expect(codes([{ ...q, steps: [{ kind: "from", lines: [0], views: [{ g: 0, rows: [0, 0] }] }] }])).toEqual(["badView"]);
    expect(codes([{ ...q, steps: [{ kind: "where", lines: [2], views: [{ g: 0, rows: [0], out: [1] }] }] }])).toEqual(["badView"]);
    expect(codes([{ ...q, steps: [{ kind: "join", lines: [1], views: [{ g: 0, rows: [0, 1] }, { g: 1, rows: [0] }], links: [[0, 3]] }] }])).toEqual(["badLinks"]);
    expect(codes([{ ...q, steps: [{ kind: "sort" as never, lines: [0], views: [{ g: 0, rows: [] }] }] }])).toEqual(["badStep"]);
    expect(codes([{ ...q, grids: [{ ...q.grids[0]!, split: 2 }, q.grids[1]!] }])).toEqual(["badGrid"]);
  });

  it("names what's wrong in a pipeline", () => {
    const p = pipeline as Extract<Element, { type: "pipeline" }>;
    expect(codes([{ ...p, edges: [["in", "chk"], ["chk", "db"], ["db", "in"]] }])).toEqual(["pipeCycle"]);
    expect(codes([{ ...p, edges: [["in", "chk"], ["chk", "db"], ["in", "nope"]] }])).toEqual(["badEdge"]);
    expect(codes([{ ...p, records: [{ path: [[0, 0], [1, 2]] }] }])).toEqual(["badPoints"]);
    expect(codes([{ ...p, records: [{ path: [[2, 0], [1, 1]] }] }])).toEqual(["badPoints"]);
    expect(codes([{ ...p, frames: [[1, 2]] }])).toEqual(["badFrames"]);
    expect(codes([{ ...p, stages: [p.stages[0]!, { ...p.stages[1]!, icon: "rocket" as never }, p.stages[2]!] }])).toEqual(["badIcon"]);
    expect(codes([{ ...p, stages: [p.stages[0]!, { ...p.stages[1]!, id: "in" }, p.stages[2]!] }])).toContain("dupId");
  });

  it("names what's wrong in a sheet", () => {
    const s = sheet as Extract<Element, { type: "sheet" }>;
    expect(codes([{ ...s, cells: { ...s.cells, D9: { v: 1 } } }])).toEqual(["badCell"]);
    expect(codes([{ ...s, cells: { A1: { f: "SUM(A2)" } } }])).toEqual(["badFormula"]);
    expect(codes([{ ...s, frames: ["B2", "Z1"] }])).toEqual(["badFrames"]);
    expect(codes([{ ...s, issues: [{ cells: "A1:D1", kind: "dup" }] }])).toEqual(["badRange"]);
    expect(codes([{ ...s, issues: [{ cells: "A1", kind: "oops" as never }] }])).toEqual(["badIssue"]);
    expect(codes([{ ...s, cols: 9 }])).toContain("badCount");
    expect(codes([{ ...s, widths: [100] }])).toEqual(["badWidths"]);
  });

  it("checks the Text in every lesson language, and rejects · in Arabic", () => {
    const p = pipeline as Extract<Element, { type: "pipeline" }>;
    expect(codes([{ ...p, aside: { en: "Set aside" } }])).toEqual(["missingText"]);
    expect(validatePackage(pkg([{ ...p, aside: T("Set aside", "جانبًا · هنا") }])).errors.length).toBeGreaterThan(0);
  });

  it("reads spreadsheet addresses", () => {
    expect(cellAt("A1")).toEqual([0, 0]);
    expect(cellAt("H12")).toEqual([7, 11]);
    expect(cellAt("I1")).toBeNull();
    expect(cellAt("A0")).toBeNull();
  });
});
