/**
 * design.json bodies for the data pack (docs/packs/data.md lists them): `erd`, `query`, `pipeline`, `sheet`, each timed
 * to the scene's sentences. The query really runs, in sql.js (loaded once, when the converter starts).
 */
import type { Element, Key, Text, Track, When } from "../../../packages/spec/src/index.ts";
import { shift, tx } from "../../../packages/ops/src/index.ts";
import {
  cleanSheet, dataWords, erdCols, erdSchema, loadSql, pipeline, pipelineEnd, queryElement, queryStagesWith, setupSql, sheet, sheetCells, sheetFill,
  ERD_SCHEMAS, type Cells, type DataValue, type Dataset, type ErdSchema,
} from "../../../packages/ops/src/packs/data.ts";
import type { AText, BodyBuilder, BodyCtx } from "./types.ts";

const SQL = await loadSql().catch(() => null);

type ErdElement = Extract<Element, { type: "erd" }>;
type QueryKind = Extract<Element, { type: "query" }>["steps"][number]["kind"];
type Stage = Extract<Element, { type: "pipeline" }>["stages"][number];

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const fail = (c: BodyCtx, what: string): never => { throw new Error(`${c.where}: ${what}`); };
/** Pack bodies take the full width, a little taller than the body box (as science bodies do). */
const area = (c: BodyCtx, id: string) => ({ id, x: c.box.x, y: c.box.y - 10, w: c.box.w, h: c.box.h + 30 });
const appear = (at: When, dur = 1.2): Track => ({ prop: "reveal", keys: [{ at, value: 0 }, { at: shift(at, dur), value: 1, ease: "out" }] });
const stepsAt = (prop: "focus", at: [When, number][]): Track => ({ prop, keys: [{ at: 0, value: 0, ease: "step" }, ...at.map(([w, v]) => ({ at: w, value: v, ease: "step" as const }))] });
/** Frames 0 → last, played from sentence a to the end of sentence b (`frames: [a, b]`). */
function play(c: BodyCtx, fr: unknown, last: number, s0: number): Track {
  const [a, b] = Array.isArray(fr) && fr.length === 2 && fr.every((x) => Number.isInteger(x)) ? fr as [number, number] : [s0, c.n - 1];
  const end = b + 1 < c.n ? c.at(b + 1) : c.at(b, 2.5);
  return { prop: "frame", keys: [{ at: c.at(a, 0.3), value: 0 }, { at: end, value: last, ease: "linear" }] };
}
const words = (c: BodyCtx, w: unknown, where: string): Record<string, Text> | undefined => {
  if (w === undefined) return undefined;
  if (w === "names") return dataWords(c.langs);
  if (!isObj(w)) return fail(c, `${where} words: "names" or { "value": { "en": …, "ar-EG": … } }`);
  return Object.fromEntries(Object.entries(w).map(([k, v]) => [k, c.T(v as AText, `${where} word ${k}`)]));
};

/**
 * `{ "erd": { "schema": "school" } }` (school, library, attendance, market), or your own:
 * `{ "erd": { "tables": [ { "name": "students", "label": {…}, "cols": "id INT pk, name TEXT" } ],
 *   "rels": [ { "from": "students", "to": "marks", "kind": "1-n", "via": "student_id", "label": {…} } ],
 *   "in": [0, 1, 2], "focus": [ { "table": "marks", "s": 2 }, { "rel": "students>marks", "s": 3 } ] } }`
 * The tables come in one by one from the first along its relationships, on the sentences in `in` (else all on `s`).
 */
const erd: BodyBuilder = (spec, c) => {
  if (!isObj(spec)) return fail(c, "erd: an object");
  let el: ErdElement;
  if (spec.schema !== undefined) {
    if (!ERD_SCHEMAS.includes(spec.schema as ErdSchema)) fail(c, `erd schema: one of ${ERD_SCHEMAS.join(", ")}`);
    el = erdSchema(spec.schema as ErdSchema, area(c, "erd"), c.langs);
  } else {
    if (!Array.isArray(spec.tables) || !spec.tables.length) return fail(c, "erd: tables, or a schema");
    el = {
      ...area(c, "erd"), type: "erd",
      tables: spec.tables.map((t: unknown, i: number) => {
        if (!isObj(t) || typeof t.name !== "string") return fail(c, `erd table ${i + 1}: { name, cols }`);
        const cols = typeof t.cols === "string" ? erdCols(t.cols) : Array.isArray(t.cols) ? t.cols as ErdElement["tables"][number]["cols"] : fail(c, `erd table ${t.name}: cols`);
        return { name: t.name, cols, ...(t.label ? { label: c.T(t.label as AText, `${c.where} erd table ${t.name}`) } : {}) };
      }),
      rels: (Array.isArray(spec.rels) ? spec.rels : []).map((r: unknown, i: number) => {
        if (!isObj(r)) return fail(c, `erd rel ${i + 1}: { from, to, kind }`);
        return { from: String(r.from), to: String(r.to), kind: (r.kind ?? "1-n") as "1-n", ...(r.via ? { via: String(r.via) } : {}), ...(r.label ? { label: c.T(r.label as AText, `${c.where} erd rel ${i + 1}`) } : {}) };
      }),
    };
  }
  if (typeof spec.types === "boolean") el.types = spec.types;
  const n = el.tables.length;
  const ins = Array.isArray(spec.in) ? spec.in as number[] : Array.from({ length: n }, () => (typeof spec.s === "number" ? spec.s : 0));
  // The k-th table to come in (in layout order) arrives on its sentence; tables on the same sentence come 0.7 s apart.
  const keys: Key[] = [{ at: 0, value: 0 }];
  ins.slice(0, n).forEach((s, k) => {
    const off = 0.2 + 0.7 * ins.slice(0, k).filter((x) => x === s).length;
    keys.push({ at: c.at(s, off), value: k / n, ease: "linear" }, { at: c.at(s, off + 0.6), value: (k + 1) / n, ease: "out" });
  });
  el.anim = [{ prop: "reveal", keys }];
  if (Array.isArray(spec.focus) && spec.focus.length) {
    el.anim.push(stepsAt("focus", spec.focus.map((f: unknown) => {
      if (!isObj(f) || typeof f.s !== "number") return fail(c, "erd focus: { table or rel, s }");
      if (f.table !== undefined) {
        const i = el.tables.findIndex((t) => t.name === f.table);
        if (i < 0) fail(c, `erd focus names a table that isn't there: ${String(f.table)}`);
        return [c.at(f.s), i + 1] as [When, number];
      }
      const rels = el.rels ?? [];
      const i = typeof f.rel === "number" ? f.rel : rels.findIndex((r) => `${r.from}>${r.to}` === f.rel);
      if (i < 0 || i >= rels.length) fail(c, `erd focus names a relationship that isn't there: ${String(f.rel)} (use "from>to" or its number from 0)`);
      return [c.at(f.s), n + i + 1] as [When, number];
    })));
  }
  return [el];
};

/**
 * `{ "query": { "sql": "SELECT name, mark FROM results WHERE mark >= 50", "data": ["results"],
 *   "at": { "where": 1, "select": 2, "result": 3 }, "words": "names" } }`
 * `data` names datasets (packages/ops DATASETS: students, results, marks, attendance, rainfall, prices, books, loans);
 * or give `tables` ({ "name": { "cols": [...], "rows": [[...]] } }) or `setup` (SQL). `at` brings the first step of each
 * kind on a sentence; the steps after it follow 1.4 s apart. The SQL is written on sentence `s` (default 0).
 */
const query: BodyBuilder = (spec, c) => {
  if (!isObj(spec) || typeof spec.sql !== "string") return fail(c, "query: { sql, data }");
  if (!SQL) return fail(c, "query: sql.js didn't load (npm install)");
  const own = isObj(spec.tables) ? spec.tables as Record<string, Dataset> : {};
  const setup = typeof spec.setup === "string" ? spec.setup : setupSql([...(Array.isArray(spec.data) ? spec.data as string[] : []), ...Object.keys(own)], own);
  let data;
  try {
    data = queryStagesWith(SQL, spec.sql, setup);
  } catch (e) {
    return fail(c, e instanceof Error ? e.message : String(e));
  }
  const w = words(c, spec.words, "query");
  const el = queryElement(area(c, "query"), data, { ...(w ? { words: w } : {}), ...(spec.layout === "top" || spec.layout === "side" ? { layout: spec.layout } : {}) });
  const s0 = typeof spec.s === "number" ? spec.s : 0;
  const kinds = [...new Set(data.steps.map((s) => s.kind))].filter((k) => k !== "from");
  // Without `at`: the kinds spread over the sentences after the first.
  const at: Record<string, number> = isObj(spec.at) ? spec.at as Record<string, number> : Object.fromEntries(kinds.map((k, i) => [k, Math.min(c.n - 1, s0 + 1 + Math.floor((i * Math.max(1, c.n - 1 - s0)) / kinds.length))]));
  for (const k of Object.keys(at)) if (!data.steps.some((s) => s.kind === k)) fail(c, `query at: this query has no ${k} step (it has ${kinds.join(", ")})`);
  // Each step's moment, as a sentence and seconds after it starts: a named kind on a later sentence starts there;
  // anything else (a step after a named one, or a kind named on the same sentence) follows 1.4 s after the one before.
  let ps = s0;
  let po = 1.2;
  const keys: Key[] = [{ at: c.at(ps, po), value: 0 }];
  data.steps.forEach((s, k) => {
    if (!k) return;
    const named = at[s.kind] !== undefined && data.steps.findIndex((x) => x.kind === s.kind) === k ? at[s.kind as QueryKind]! : -1;
    if (named > ps) { ps = named; po = 0.3; } else po += 1.4;
    keys.push({ at: c.at(ps, po), value: k, ease: "in-out" });
  });
  el.anim = [appear(c.at(s0)), { prop: "frame", keys }];
  return [el];
};

/**
 * `{ "pipeline": { "stages": [ { "id": "collect", "label": {…}, "icon": "wifi", "kind": "source" }, … ], "records": 8,
 *   "mode": "stream", "bad": [3], "fix": "aside", "aside": {…}, "frames": [1, 2], "focus": [ { "stage": "check", "s": 1 } ] } }`
 * `edges` ([["a", "b"], …]) default to a chain; `frames: [a, b]` plays the run from sentence a to the end of b.
 */
const pipe: BodyBuilder = (spec, c) => {
  if (!isObj(spec) || !Array.isArray(spec.stages)) return fail(c, "pipeline: { stages, records }");
  const stages: Stage[] = spec.stages.map((s: unknown, i: number) => {
    if (!isObj(s) || typeof s.id !== "string") return fail(c, `pipeline stage ${i + 1}: { id, label }`);
    return { id: s.id, label: c.T(s.label as AText, `${c.where} pipeline stage ${s.id}`), ...(s.icon ? { icon: s.icon as Stage["icon"] } : {}), ...(s.kind ? { kind: s.kind as Stage["kind"] } : {}) };
  });
  let el;
  try {
    el = pipeline(area(c, "pipeline"), {
      stages, records: typeof spec.records === "number" ? spec.records : 8,
      ...(Array.isArray(spec.edges) ? { edges: spec.edges as [string, string][] } : {}),
      ...(spec.mode === "batch" || spec.mode === "stream" ? { mode: spec.mode } : {}),
      ...(Array.isArray(spec.bad) ? { bad: spec.bad as number[] } : {}),
      ...(spec.fix === "retry" || spec.fix === "aside" ? { fix: spec.fix } : {}),
      ...(typeof spec.check === "string" ? { check: spec.check } : {}),
    }, spec.aside ? { aside: c.T(spec.aside as AText, `${c.where} pipeline aside`) } : {});
  } catch (e) {
    return fail(c, e instanceof Error ? e.message : String(e));
  }
  el.anim = [appear(c.at(0), 1), play(c, spec.frames, pipelineEnd(el), Math.min(1, c.n - 1))];
  if (Array.isArray(spec.focus) && spec.focus.length) {
    el.anim.push(stepsAt("focus", spec.focus.map((f: unknown) => {
      const i = isObj(f) ? stages.findIndex((s) => s.id === f.stage) : -1;
      if (!isObj(f) || i < 0 || typeof f.s !== "number") return fail(c, `pipeline focus: { stage (an id), s }`);
      return [c.at(f.s), i + 1] as [When, number];
    })));
  }
  return [el];
};

/**
 * `{ "sheet": { "rows": [[{ "en": "Name", "ar-EG": "الاسم" }, …], ["Amina", 78, 84, null]], "formulas": { "D2": "=AVERAGE(B2:C2)" },
 *   "fill": { "from": "D2", "to": "D6", "frames": [1, 2] } } }`, or cleaning:
 * `{ "sheet": { "rows": […], "clean": { "known": { "B": ["Rice", "Beans"] }, "labels": true, "frames": [2, 3] }, "focus": [ { "issue": 1, "s": 1 } ] } }`
 * Row 1 is the headers. `clean` finds blanks, typos (values not in a column's `known` list) and repeated rows, and
 * fixes the typos and strikes the repeats one by one over `frames`.
 */
const sheetBody: BodyBuilder = (spec, c) => {
  if (!isObj(spec) || !Array.isArray(spec.rows) || !spec.rows.length) return fail(c, "sheet: { rows }");
  const rows = (spec.rows as unknown[][]).map((r, i) => r.map((v, j) => (v === null || typeof v === "number" || typeof v === "string" ? v as DataValue : c.T(v as AText, `${c.where} sheet row ${i + 1} cell ${j + 1}`))));
  const size = { cols: Math.max(...rows.map((r) => r.length)), rows: rows.length };
  let cells: Cells = sheetCells(rows, isObj(spec.formulas) ? spec.formulas as Record<string, string> : {});
  let frames: (string | null)[] | undefined;
  let issues: ReturnType<typeof cleanSheet>["issues"] | undefined;
  let fr: unknown;
  try {
    if (isObj(spec.fill)) {
      const f = sheetFill(cells, String(spec.fill.from), String(spec.fill.to));
      cells = f.cells;
      frames = f.frames;
      fr = spec.fill.frames;
    } else if (isObj(spec.clean)) {
      const T = (en: string, ar: string): Text => tx(en, ar, c.langs);
      const k = cleanSheet(cells, size, {
        ...(isObj(spec.clean.known) ? { known: spec.clean.known as Record<string, string[]> } : {}),
        ...(spec.clean.labels ? { labels: { typo: T("Typo", "خطأ إملائي"), blank: T("Blank", "خانة فاضية"), dup: T("Typed twice", "متكرر"), bad: T("Check this", "راجعها") } } : {}),
      });
      cells = k.cells;
      frames = k.frames;
      issues = k.issues;
      fr = spec.clean.frames;
    }
  } catch (e) {
    return fail(c, e instanceof Error ? e.message : String(e));
  }
  const w = words(c, spec.words, "sheet");
  const el = sheet(area(c, "sheet"), cells, { ...size, ...(frames ? { frames } : {}), ...(issues ? { issues } : {}), ...(w ? { words: w } : {}), ...(Array.isArray(spec.widths) ? { widths: spec.widths as number[] } : {}) });
  el.anim = [appear(c.at(typeof spec.s === "number" ? spec.s : 0), 1)];
  if (frames && frames.length > 1) el.anim.push(play(c, fr, frames.length - 1, Math.min(1, c.n - 1)));
  if (Array.isArray(spec.focus) && spec.focus.length) {
    el.anim.push(stepsAt("focus", spec.focus.map((f: unknown) => {
      if (!isObj(f) || typeof f.s !== "number" || typeof f.issue !== "number" || !issues || f.issue < 1 || f.issue > issues.length) return fail(c, `sheet focus: { issue (from 1, of ${issues?.length ?? 0}), s }`);
      return [c.at(f.s), f.issue] as [When, number];
    })));
  }
  return [el];
};

export const bodies: Record<string, BodyBuilder> = { erd, query, pipeline: pipe, sheet: sheetBody };
