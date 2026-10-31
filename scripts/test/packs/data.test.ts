import { describe, expect, it } from "vitest";
import { walkElements, type Element } from "../../../packages/spec/src/index.ts";
import { check } from "../../../packages/ops/src/index.ts";
import { AR, convert, type Arabic, type LessonDesign, type Story } from "../../darsi/convert.ts";
import { bodies } from "../../darsi/packs/data.ts";

/** A storyboard of explain scenes, one per design, in English and Egyptian Arabic. */
function lesson(designs: Record<string, unknown>[], narration: [string, string][]) {
  const story: Story = {
    id: "DATA-1-1-9", track: "data", level: 1, unit: { number: 1, title: "Data basics" }, lesson: { number: 9, title: "Data, step by step" },
    video: { title: "Data", cast: ["Narrator"], scenes: designs.map((_, i) => ({ n: i + 1, beat: "Explain", voice: "Narrator", on_screen_text: "Data", narration: narration[i]![0] })) },
  };
  const ar: Arabic = {
    title: "البيانات خطوة بخطوة", checkpoints: [],
    scenes: Object.fromEntries(designs.map((_, i) => [String(i + 1), { narration: narration[i]![1], on_screen_text: "بيانات" }])),
  };
  const design: LessonDesign = { scenes: Object.fromEntries(designs.map((d, i) => [String(i + 1), d as never])) };
  return convert(story, ar, design);
}
const typed = (l: ReturnType<typeof lesson>, type: string): Element[] => {
  const out: Element[] = [];
  for (const s of l.scenes.scenes) walkElements(s, (el) => { if (el.type === type) out.push(el); });
  return out;
};

const ERD = { erd: { schema: "library", focus: [{ table: "loans", s: 1 }, { rel: "members>loans", s: 2 }], in: [0, 0, 1] } };
const QUERY = { query: { sql: "SELECT name, mark FROM results WHERE mark >= 50 ORDER BY mark DESC", data: ["results"], words: "names", at: { where: 1, order: 2 } } };
const PIPE = {
  pipeline: {
    stages: [
      { id: "collect", label: { en: "Collect", [AR]: "جمع" }, icon: "wifi", kind: "source" },
      { id: "check", label: { en: "Check", [AR]: "فحص" }, kind: "check" },
      { id: "save", label: { en: "Save", [AR]: "حفظ" }, kind: "store" },
    ],
    records: 6, mode: "stream", bad: [2], fix: "aside", aside: { en: "Set aside", [AR]: "على جنب" }, frames: [1, 2], focus: [{ stage: "check", s: 1 }],
  },
};
const FILL = {
  sheet: {
    rows: [[{ en: "Name", [AR]: "الاسم" }, { en: "Mark", [AR]: "الدرجة" }, { en: "Double", [AR]: "الضعف" }], ["Amina", 7, null], ["Joseph", 9, null], ["Salma", 8, null]],
    formulas: { C2: "=B2*2" }, fill: { from: "C2", to: "C4", frames: [1, 2] }, words: "names",
  },
};
const CLEAN = {
  sheet: {
    rows: [[{ en: "Item", [AR]: "الصنف" }, { en: "Price", [AR]: "السعر" }], ["Rice", 40], ["Ryce", 38], ["Beans", null], ["Rice", 40]],
    clean: { known: { A: ["Rice", "Beans"] }, labels: true, frames: [1, 2] }, focus: [{ issue: 1, s: 1 }, { issue: 3, s: 2 }],
  },
};
const SAY: [string, string] = [
  "First we look at the tables. Then we watch the rows change. Finally we read what is left.",
  "الأول نبص على الجداول. وبعدين نتفرج على الصفوف وهي بتتغير. وفي الآخر نقرا اللي فاضل.",
];

describe("data pack bodies in Darsi storyboards", () => {
  it("are all here", () => {
    expect(Object.keys(bodies).sort()).toEqual(["erd", "pipeline", "query", "sheet"]);
  });

  it("make lessons that validate cleanly in English and Egyptian Arabic", () => {
    const l = lesson([ERD, QUERY, PIPE, FILL, CLEAN], [SAY, SAY, SAY, SAY, SAY]);
    const r = check(l);
    expect(r.errors).toEqual([]);
    expect(r.warnings.filter((w) => !["longLesson"].includes(w.code))).toEqual([]);
    for (const t of ["erd", "query", "pipeline", "sheet"]) expect(typed(l, t).length, t).toBeGreaterThan(0);
  });

  it("time an ERD's tables and focus to the sentences", () => {
    const [erd] = typed(lesson([ERD], [SAY]), "erd") as Extract<Element, { type: "erd" }>[];
    expect(erd!.tables.map((t) => t.name)).toEqual(["members", "loans", "books"]);
    const reveal = erd!.anim!.find((t) => t.prop === "reveal")!;
    expect(reveal.keys.at(-1)!.value).toBe(1);
    expect(erd!.anim!.find((t) => t.prop === "focus")!.keys.map((k) => k.value)).toEqual([0, 2, 4]);
  });

  it("run the query in sql.js and bring each named step on its sentence", () => {
    const [q] = typed(lesson([QUERY], [SAY]), "query") as Extract<Element, { type: "query" }>[];
    expect(q!.steps.map((s) => s.kind)).toEqual(["from", "where", "select", "select", "order", "result"]);
    expect(q!.words!.Amina).toEqual({ en: "Amina", [AR]: "أمينة" });
    const frame = q!.anim!.find((t) => t.prop === "frame")!;
    expect(frame.keys.map((k) => k.value)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("plan the pipeline's run and play it over the sentences", () => {
    const [p] = typed(lesson([PIPE], [SAY]), "pipeline") as Extract<Element, { type: "pipeline" }>[];
    expect(p!.records).toHaveLength(6);
    expect(p!.frames.at(-1)!.at(-1)).toBe(1);
    expect(p!.anim!.find((t) => t.prop === "frame")!.keys.at(-1)!.value).toBe(p!.frames.length - 1);
  });

  it("fill formulas down and clean sheets", () => {
    const [fill, clean] = typed(lesson([FILL, CLEAN], [SAY, SAY]), "sheet") as Extract<Element, { type: "sheet" }>[];
    expect(fill!.cells.C4).toMatchObject({ f: "=B4*2", v: 16, at: 2 });
    expect(fill!.frames).toEqual(["C2", "C3", "C4"]);
    expect(clean!.issues!.map((i) => i.kind)).toEqual(["typo", "blank", "dup"]);
    expect(clean!.cells.A3!.to).toEqual({ at: 1, v: "Rice" });
    expect(clean!.issues![0]!.label).toEqual({ en: "Typo", [AR]: "خطأ إملائي" });
  });

  it("say where a spec is wrong", () => {
    expect(() => lesson([{ query: { sql: "SELECT nope FROM results", data: ["results"] } }], [SAY])).toThrow(/DATA-1-1-9 scene 1: queryStages: SQLite says/);
    expect(() => lesson([{ query: { ...QUERY.query, at: { group: 1 } } }], [SAY])).toThrow(/scene 1: query at: this query has no group step/);
    expect(() => lesson([{ erd: { schema: "zoo" } }], [SAY])).toThrow(/scene 1: erd schema/);
    expect(() => lesson([{ erd: { ...ERD.erd, focus: [{ table: "pets", s: 1 }] } }], [SAY])).toThrow(/a table that isn't there: pets/);
    expect(() => lesson([{ pipeline: { ...PIPE.pipeline, focus: [{ stage: "nope", s: 1 }] } }], [SAY])).toThrow(/pipeline focus/);
    expect(() => lesson([{ sheet: { ...CLEAN.sheet, focus: [{ issue: 9, s: 1 }] } }], [SAY])).toThrow(/sheet focus/);
    expect(() => lesson([{ sheet: { rows: [["a"]], fill: { from: "A1", to: "A3" } } }], [SAY])).toThrow(/has no formula/);
  });
});
