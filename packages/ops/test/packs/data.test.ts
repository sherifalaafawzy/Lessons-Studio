import { describe, expect, it } from "vitest";
import type { Element, Orient } from "@lessonstudio/spec";
import { check, newLesson, packs, type Lesson } from "../../src/index.ts";
import {
  DATASETS, PRESET_QUERIES, PRESET_SETUP, PRESET_SQL, addr, cleanSheet, element, erdCols, erdSchema, evalFormula, loadSql, pipelineFrames, presets,
  queryFrame, queryStages, setupSql, sheetCells, sheetEval, sheetFill, shiftFormula,
} from "../../src/packs/data.ts";

const NAMES: Record<string, string> = { en: "English", ar: "العربية", fr: "Français" };
const lessonWith = (langs: string[], stage: Orient): Lesson =>
  newLesson({ id: "data-pack", title: Object.fromEntries(langs.map((l) => [l, "Data"])), languages: langs.map((code) => ({ code, name: NAMES[code]! })), stage, createdBy: "u" }, "2026-10-29");
const run = async (sql: string, data: string[]) => queryStages(sql, setupSql(data));
const kinds = (q: { steps: { kind: string }[] }) => q.steps.map((s) => s.kind);

describe("queries, run step by step in sql.js", () => {
  it("filters, picks, sorts and cuts, in the order the database works", async () => {
    const q = await run("SELECT name, mark FROM results WHERE mark >= 50 ORDER BY mark DESC LIMIT 3", ["results"]);
    expect(q.sql.split("\n")).toEqual(["SELECT name, mark", "FROM results", "WHERE mark >= 50", "ORDER BY mark DESC", "LIMIT 3"]);
    expect(kinds(q)).toEqual(["from", "where", "select", "select", "order", "limit", "result"]);
    const where = q.steps[1]!.views[0]!;
    expect(where.out!.map((r) => q.grids[0]!.rows[r]![0])).toEqual(["Joseph", "Omar"]);
    expect(where.lit).toEqual([2]);
    expect(q.steps[2]!.views[0]).toMatchObject({ lit: [0, 2], dim: [1] });
    const R = q.grids[q.steps[6]!.views[0]!.g]!;
    expect(q.steps[6]!.views[0]!.rows.map((r) => R.rows[r])).toEqual([["Salma", 91], ["Laila", 84], ["Amina", 78]]);
    expect(q.steps[4]!.views[0]!.sort).toEqual([[1, "desc"]]);
    expect(q.steps[5]!.views[0]).toMatchObject({ cut: 3, out: q.steps[5]!.views[0]!.rows.slice(3) });
    expect(q.steps.map((s) => s.lines)).toEqual([[1], [2], [0], [0], [3], [4], []]);
  });

  it("joins two tables, links the matching rows, groups, and keeps the groups HAVING keeps", async () => {
    const q = await run("SELECT class, AVG(mark)\nFROM students\nJOIN marks ON student_id = id\nGROUP BY class\nHAVING AVG(mark) >= 60", ["students", "marks"]);
    expect(kinds(q)).toEqual(["from", "join", "join", "group", "having", "select", "select", "result"]);
    const join = q.steps[1]!;
    expect(join.views.map((v) => v.g)).toEqual([0, 1]);
    // Omar has no marks: an inner join drops him.
    expect(join.views[0]!.out!.map((r) => q.grids[0]!.rows[r]![1])).toEqual(["Omar"]);
    for (const [a, b] of join.links!) expect(q.grids[0]!.rows[a]![0]).toBe(q.grids[1]!.rows[b]![0]);
    expect(join.links).toHaveLength(DATASETS.marks!.rows.length);
    const W = q.grids[2]!;
    expect(W.cols).toEqual(["id", "name", "class", "student_id", "subject", "mark"]);
    expect(W.split).toBe(3);
    const group = q.steps[3]!.views[0]!;
    expect(group.rows.map((r) => W.rows[r]![2])).toEqual(["5A", "5A", "5A", "5B", "5B"]);
    expect(group.groups).toEqual([0, 0, 0, 1, 1]);
    expect(q.steps[4]!.views[0]!.out!.map((r) => W.rows[r]![2])).toEqual(["5B", "5B"]);
    const R = q.grids[q.steps[7]!.views[0]!.g]!;
    expect(R.cols).toEqual(["class", "AVG(mark)"]);
    expect(q.steps[7]!.views[0]!.rows.map((r) => R.rows[r])).toEqual([["5A", 84.33]]);
  });

  it("removes repeats with DISTINCT, keeps a sort column it doesn't pick, and knows OFFSET", async () => {
    const d = await run("SELECT DISTINCT class FROM results WHERE mark < 60", ["results"]);
    expect(kinds(d)).toEqual(["from", "where", "select", "select", "distinct", "result"]);
    const R = d.grids[d.grids.length - 1]!;
    expect(d.steps[5]!.views[0]!.rows.map((r) => R.rows[r]![0])).toEqual(["5B", "5A"]);
    const s = await run("SELECT name FROM results ORDER BY mark DESC LIMIT 2 OFFSET 1", ["results"]);
    const RS = s.grids[s.grids.length - 1]!;
    expect(RS.cols).toEqual(["name", "mark"]);
    const order = s.steps[queryFrame(s, "order")]!.views[0]!;
    expect(order.sort).toEqual([[1, "desc"]]);
    expect(s.steps[queryFrame(s, "result")]!.views[0]).toMatchObject({ hide: [1] });
    expect(s.steps[queryFrame(s, "result")]!.views[0]!.rows.map((r) => RS.rows[r]![0])).toEqual(["Laila", "Amina"]);
    const all = await run("SELECT COUNT(*) AS n FROM results WHERE mark >= 50", ["results"]);
    const RA = all.grids[all.grids.length - 1]!;
    expect(RA.rows).toEqual([[5]]);
  });

  it("refuses what it can't draw, saying why", async () => {
    await expect(run("SELECT name FROM results UNION SELECT name FROM students", ["results", "students"])).rejects.toThrow(/UNION/);
    await expect(run("SELECT * FROM students JOIN marks ON student_id = id JOIN results ON 1", ["students", "marks", "results"])).rejects.toThrow(/one JOIN/);
    await expect(run("SELECT nope FROM results", ["results"])).rejects.toThrow(/SQLite says/);
    await expect(run("SELECT * FROM students, marks", ["students", "marks"])).rejects.toThrow(/FROM and JOIN/);
  });

  it("keeps the preset queries the same as sql.js computes them", async () => {
    for (const k of Object.keys(PRESET_SQL) as (keyof typeof PRESET_SQL)[]) {
      expect(PRESET_QUERIES[k], k).toEqual(await queryStages(PRESET_SQL[k], setupSql(PRESET_SETUP[k])));
    }
  });

  it("loads sql.js once", async () => {
    expect(await loadSql()).toBe(await loadSql());
  });
});

describe("spreadsheets", () => {
  const cells = sheetCells([
    ["Name", "T1", "T2", "Avg", "Result"],
    ["Amina", 78, 84, null, null],
    ["Joseph", 45, 51, null, null],
  ], { D2: "=AVERAGE(B2:C2)", E2: '=IF(D2>=50,"Pass","Fail")', D4: "=SUM(B2:C3)", E4: '=COUNTIF(B2:C3,">=50")' });

  it("evaluates formulas: functions, references, ranges, IF and COUNTIF", () => {
    expect(cells.D2!.v).toBe(81);
    expect(cells.E2!.v).toBe("Pass");
    expect(cells.D4!.v).toBe(258);
    expect(cells.E4!.v).toBe(3);
    const get = (a: string) => ({ A1: 2, A2: 3, B1: "x" } as Record<string, number | string>)[a] ?? null;
    expect(evalFormula("=A1^2+A2*2-1", get)).toBe(9);
    expect(evalFormula("=(A1+A2)/0", get)).toBe("#DIV/0!");
    expect(evalFormula("=MAX(A1:A2)&\" points\"", get)).toBe("3 points");
    expect(evalFormula("=ROUND(10/3,1)", get)).toBe(3.3);
    expect(evalFormula("=NOPE(1)", get)).toBe("#NAME?");
    expect(sheetEval({ A1: { f: "=A2" }, A2: { f: "=A1" } }).A1!.v).toBe("#REF!");
  });

  it("fills a formula down, moving its references, one cell per frame", () => {
    expect(shiftFormula("=AVERAGE(B2:C2)+$A$1+\"B2\"", 0, 2)).toBe("=AVERAGE(B4:C4)+$A$1+\"B2\"");
    const { cells: out, frames } = sheetFill(cells, "D2", "D3");
    expect(out.D3).toMatchObject({ f: "=AVERAGE(B3:C3)", v: 48, at: 1 });
    expect(frames).toEqual(["D2", "D3"]);
  });

  it("finds typos, blanks and repeated rows, and fixes them frame by frame", () => {
    const raw = sheetCells([["Item", "Price"], ["Rice", 40], ["Tomatos", 25], ["Beans", null], ["Rice", 40], ["Yam", 9]]);
    const { cells: out, issues, frames } = cleanSheet(raw, { cols: 2, rows: 6 }, { known: { A: ["Rice", "Beans", "Tomatoes"] } });
    expect(issues.map((i) => [i.kind, i.cells, i.fixed])).toEqual([["typo", "A3", 1], ["blank", "B4", undefined], ["dup", "A5:B5", 2], ["bad", "A6", undefined]]);
    expect(out.A3!.to).toEqual({ at: 1, v: "Tomatoes" });
    expect(out.A5!.out).toBe(2);
    expect(frames).toEqual([null, "A3", "A5"]);
    expect(addr(7, 11)).toBe("H12");
  });
});

describe("pipelines", () => {
  const stages = [{ id: "a", label: "A", kind: "source" as const }, { id: "b", label: "B", kind: "check" as const }, { id: "c", label: "C" }];

  it("streams records one after another, every arrival on a whole frame, and counts them", () => {
    const { records, frames, edges } = pipelineFrames({ stages, records: 3, mode: "stream" });
    expect(edges).toEqual([["a", "b"], ["b", "c"]]);
    expect(records[1]!.path).toEqual([[0, 0], [1, 0], [2, 1], [3, 1], [4, 2]]);
    for (const r of records) for (const w of r.path) expect(Number.isInteger(w[0])).toBe(true);
    expect(frames[0]).toEqual([3, 0, 0, 0]);
    expect(frames[frames.length - 1]).toEqual([3, 3, 3, 0]);
  });

  it("moves a batch together; sets a bad record aside, or sends it back to be fixed", () => {
    const aside = pipelineFrames({ stages, records: 4, mode: "batch", bad: [2], fix: "aside" });
    expect(aside.records[0]!.path.map((w) => w[0])).toEqual(aside.records[1]!.path.map((w) => w[0]));
    expect(aside.records[2]).toMatchObject({ bad: 1.5 });
    expect(aside.records[2]!.path[aside.records[2]!.path.length - 1]).toEqual([3, 1, 1]);
    expect(aside.frames[aside.frames.length - 1]).toEqual([4, 4, 3, 1]);
    const retry = pipelineFrames({ stages, records: 2, mode: "batch", bad: [1], fix: "retry" });
    const r = retry.records[1]!;
    expect(r.path.map((w) => w[1])).toEqual([0, 1, 1, 0, 0, 1, 1, 2]);
    expect(r.ok! > r.bad!).toBe(true);
    expect(retry.frames[retry.frames.length - 1]).toEqual([2, 2, 2, 0]);
  });
});

describe("builders, elements and presets", () => {
  it("reads column specs", () => {
    expect(erdCols("id INT pk, member_id INT fk, day DATE pk fk, note")).toEqual([
      { name: "id", type: "INT", key: "pk" }, { name: "member_id", type: "INT", key: "fk" }, { name: "day", type: "DATE", key: "pkfk" }, { name: "note" },
    ]);
    const s = erdSchema("library", { id: "e", x: 0, y: 0, w: 900, h: 400 }, ["en", "ar"]);
    expect(s.tables.map((t) => t.name)).toEqual(["members", "loans", "books"]);
  });

  it("offers an element of every type that validates", () => {
    for (const type of ["erd", "query", "pipeline", "sheet"]) {
      const l = lessonWith(["en", "ar"], "landscape");
      l.scenes.scenes = [{ id: "s", template: "canvas", narration: { en: "Look.", ar: "انظر." }, content: { elements: [element(type, ["en", "ar"]) as Element] } }];
      const r = check(l);
      expect(r.errors, type).toEqual([]);
      expect(r.warnings, type).toEqual([]);
    }
    expect(() => element("chart")).toThrow();
  });

  for (const stage of ["landscape", "portrait", "square"] as const) {
    for (const langs of [["en", "ar"], ["ar"], ["en", "ar", "fr"]]) {
      it(`has gallery scenes that validate cleanly: ${stage}, ${langs.join("+")}`, () => {
        const list = presets(langs, stage);
        expect(list.map((p) => p.id)).toEqual(["erd-school", "query-top", "query-join", "pipeline-etl", "sheet-fill", "sheet-clean"]);
        for (const p of list) {
          const l = lessonWith(langs, stage);
          l.scenes.scenes = [{ ...p.scene, id: "s" }];
          const r = check(l);
          expect(r.errors, p.id).toEqual([]);
          expect(r.warnings, p.id).toEqual([]);
          expect(JSON.stringify(p.scene)).not.toContain("·");
        }
      });
    }
  }

  it("is reachable as packs.data", () => {
    expect(packs.data.presets).toBe(presets);
  });
});
