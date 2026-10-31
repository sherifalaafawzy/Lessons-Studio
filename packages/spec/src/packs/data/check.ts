/**
 * Validation of the data pack's elements (erd, query, pipeline, sheet). Limits keep them light: old phones draw every
 * cell, row and dot, and a learner must be able to read them on a 360 px screen.
 */
import type { PackCheck, PackCheckCtx } from "../types.ts";

export const DATA_LIMITS = {
  tables: 6, columns: 8, rels: 8,
  grids: 6, gridRows: 12, gridCols: 8, steps: 12, sqlLines: 10, sqlLine: 60,
  stages: 8, records: 24, waypoints: 40, frames: 80,
  sheetCols: 8, sheetRows: 12,
};
const CORE_ICONS = ["user", "page", "bot", "server", "data", "lock", "shield", "phone", "mail", "link", "warning", "key", "cloud", "chip", "wifi", "check", "cross", "spark"];
const NAME = /^[A-Za-z_][A-Za-z0-9_]{0,39}$/;
const ITEM_ID = /^[A-Za-z0-9_-]{1,40}$/;
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isInt = (v: unknown, lo: number, hi = Infinity): v is number => Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const isStr = (v: unknown, max = 60): v is string => typeof v === "string" && v.length > 0 && v.length <= max && !/[\n\r]/.test(v);
const isValue = (v: unknown): boolean => v === null || isNum(v) || (typeof v === "string" && v.length <= 60);
const VALUE = "text (at most 60 characters), a number or null";

/** A spreadsheet address ("B4") as [column, row] from 0, or null. */
export function cellAt(a: string): [number, number] | null {
  const m = /^([A-H])([1-9][0-9]?)$/.exec(a);
  return m ? [m[1]!.charCodeAt(0) - 65, Number(m[2]) - 1] : null;
}

type Tone = (v: unknown, at: string) => void;
type Count = (v: unknown, at: string, lo: number, hi: number) => unknown[];

export const check: PackCheck = (el, q, c) => {
  const e = el as Record<string, unknown>;
  const tone: Tone = (v, at) => { if (v !== undefined && !c.tones.includes(v as string)) c.err("badTone", at, String(v)); };
  const count: Count = (v, at, lo, hi) => {
    if (!Array.isArray(v) || v.length < lo || v.length > hi) c.err("badCount", at, `${lo}–${hi}`);
    return arr(v);
  };
  if (e.size !== undefined && !(isNum(e.size) && e.size >= 16 && e.size <= 80)) c.err("badSize", `${q}.size`, "a text size from 16 to 80 stage pixels");
  if (e.frame !== undefined && !(isNum(e.frame) && e.frame >= 0)) c.err("badFrame", `${q}.frame`, "a frame from 0");
  if (e.words !== undefined) {
    if (!isObj(e.words)) c.err("badWords", `${q}.words`, "an object: value → text per language");
    else for (const [k, v] of Object.entries(e.words)) c.text(v as never, `${q}.words.${k}`);
  }
  if (el.type === "erd") erd(e, q, c, tone, count);
  else if (el.type === "query") query(e, q, c, count);
  else if (el.type === "pipeline") pipeline(e, q, c, tone, count);
  else if (el.type === "sheet") sheet(e, q, c, count);
};

function erd(e: Record<string, unknown>, q: string, c: PackCheckCtx, tone: Tone, count: Count): void {
  const names = new Map<string, Set<string>>();
  count(e.tables, `${q}.tables`, 1, DATA_LIMITS.tables).forEach((t, i) => {
    const tq = `${q}.tables[${i}]`;
    if (!isObj(t)) return c.err("badTable", tq, "a table: { name, cols }");
    if (typeof t.name !== "string" || !NAME.test(t.name)) c.err("badId", `${tq}.name`, "a database name: a letter or _, then letters, digits and _");
    else if (names.has(t.name)) c.err("dupId", `${tq}.name`, t.name);
    const cols = new Set<string>();
    if (typeof t.name === "string") names.set(t.name, cols);
    c.text(t.label as never, `${tq}.label`, false);
    tone(t.tone, `${tq}.tone`);
    count(t.cols, `${tq}.cols`, 1, DATA_LIMITS.columns).forEach((col, j) => {
      const cq = `${tq}.cols[${j}]`;
      if (!isObj(col) || !isStr(col.name, 40)) return c.err("badColumn", cq, "a column: { name (at most 40 characters), type, key }");
      cols.add(col.name);
      if (col.type !== undefined && !isStr(col.type, 16)) c.err("badColumn", `${cq}.type`, "a type of at most 16 characters");
      if (col.key !== undefined && !["pk", "fk", "pkfk"].includes(col.key as string)) c.err("badColumn", `${cq}.key`, "pk, fk or pkfk");
    });
  });
  if (e.rels !== undefined) count(e.rels, `${q}.rels`, 0, DATA_LIMITS.rels).forEach((r, i) => {
    const rq = `${q}.rels[${i}]`;
    if (!isObj(r) || !names.has(r.from as string) || !names.has(r.to as string) || r.from === r.to) return c.err("badRel", rq, "from and to name two different tables");
    if (!["1-1", "1-n", "n-n"].includes(r.kind as string)) c.err("badRel", `${rq}.kind`, "1-1, 1-n or n-n");
    if (r.via !== undefined && !names.get(r.to as string)!.has(r.via as string)) c.err("badRel", `${rq}.via`, `not a column of ${String(r.to)}`);
    c.text(r.label as never, `${rq}.label`, false);
  });
  if (e.types !== undefined && typeof e.types !== "boolean") c.err("badTypes", `${q}.types`, "true or false");
}

function query(e: Record<string, unknown>, q: string, c: PackCheckCtx, count: Count): void {
  const lines = typeof e.sql === "string" ? e.sql.split("\n") : [];
  if (!lines.join("").trim()) c.err("badSql", `${q}.sql`, "the query's SQL");
  else if (lines.length > DATA_LIMITS.sqlLines) c.err("badSql", `${q}.sql`, `at most ${DATA_LIMITS.sqlLines} lines`);
  else lines.forEach((l, i) => { if (l.length > DATA_LIMITS.sqlLine) c.err("badSql", `${q}.sql`, `line ${i + 1} is over ${DATA_LIMITS.sqlLine} characters`); });
  const grids = count(e.grids, `${q}.grids`, 1, DATA_LIMITS.grids).map((g, i) => {
    const gq = `${q}.grids[${i}]`;
    if (!isObj(g)) { c.err("badGrid", gq, "a table: { cols, rows }"); return { cols: 0, rows: 0 }; }
    if (g.name !== undefined && !isStr(g.name, 40)) c.err("badGrid", `${gq}.name`, "a name of at most 40 characters");
    const cols = count(g.cols, `${gq}.cols`, 1, DATA_LIMITS.gridCols);
    if (g.split !== undefined && !isInt(g.split, 1, cols.length - 1)) c.err("badGrid", `${gq}.split`, "a column number inside the grid, from 1");
    cols.forEach((n, j) => { if (!isStr(n, 40)) c.err("badColumn", `${gq}.cols[${j}]`, "a column name of at most 40 characters"); });
    const rows = count(g.rows, `${gq}.rows`, 0, DATA_LIMITS.gridRows);
    rows.forEach((r, j) => {
      if (!Array.isArray(r) || r.length !== cols.length) return c.err("badRow", `${gq}.rows[${j}]`, `${cols.length} values`);
      r.forEach((v, k) => { if (!isValue(v)) c.err("badValue", `${gq}.rows[${j}][${k}]`, VALUE); });
    });
    return { cols: cols.length, rows: rows.length };
  });
  const KINDS = ["from", "join", "where", "group", "having", "select", "distinct", "order", "limit", "result"];
  count(e.steps, `${q}.steps`, 1, DATA_LIMITS.steps).forEach((s, i) => {
    const sq = `${q}.steps[${i}]`;
    if (!isObj(s)) return c.err("badStep", sq, "a step: { kind, lines, views }");
    if (!KINDS.includes(s.kind as string)) c.err("badStep", `${sq}.kind`, KINDS.join(", "));
    if (!Array.isArray(s.lines) || !s.lines.every((l) => isInt(l, 0, lines.length - 1))) c.err("badStep", `${sq}.lines`, "line numbers of the SQL, from 0");
    const views = count(s.views, `${sq}.views`, 1, 2);
    const shown = views.map((v, j): Set<number> | null => {
      const vq = `${sq}.views[${j}]`;
      if (!isObj(v) || !isInt(v.g, 0, grids.length - 1)) { c.err("badView", `${vq}.g`, "one of the grids, from 0"); return null; }
      const g = grids[v.g]!;
      const set = new Set<number>();
      if (!Array.isArray(v.rows) || !v.rows.every((r) => isInt(r, 0, g.rows - 1) && !set.has(r) && !!set.add(r))) c.err("badView", `${vq}.rows`, "rows of its grid, each once");
      if (v.out !== undefined && !(Array.isArray(v.out) && v.out.every((r) => set.has(r as number)))) c.err("badView", `${vq}.out`, "rows the view shows");
      if (v.groups !== undefined && !(Array.isArray(v.groups) && v.groups.length === set.size && v.groups.every((n) => isInt(n, 0, 99)))) c.err("badView", `${vq}.groups`, "one group number (0–99) per row");
      for (const k of ["lit", "dim", "hide"]) if (v[k] !== undefined && !(Array.isArray(v[k]) && arr(v[k]).every((n) => isInt(n, 0, g.cols - 1)))) c.err("badView", `${vq}.${k}`, "column numbers of its grid, from 0");
      if (v.sort !== undefined && !(Array.isArray(v.sort) && v.sort.every((x) => Array.isArray(x) && isInt(x[0], 0, g.cols - 1) && (x[1] === "asc" || x[1] === "desc")))) c.err("badView", `${vq}.sort`, "[column, \"asc\" or \"desc\"] pairs");
      if (v.cut !== undefined && !isInt(v.cut, 0)) c.err("badView", `${vq}.cut`, "a row count from 0");
      return set;
    });
    if (s.links !== undefined) {
      if (views.length !== 2) c.err("badLinks", `${sq}.links`, "links join the rows of two views");
      else if (!(Array.isArray(s.links) && s.links.every((l) => Array.isArray(l) && l.length === 2 && shown[0]?.has(l[0]) && shown[1]?.has(l[1])))) c.err("badLinks", `${sq}.links`, "[row of the first view, row of the second]");
    }
  });
  if (e.layout !== undefined && e.layout !== "side" && e.layout !== "top") c.err("badLayout", `${q}.layout`, "side or top");
}

function pipeline(e: Record<string, unknown>, q: string, c: PackCheckCtx, tone: Tone, count: Count): void {
  const ids = new Map<string, number>();
  const stages = count(e.stages, `${q}.stages`, 2, DATA_LIMITS.stages);
  stages.forEach((s, i) => {
    const sq = `${q}.stages[${i}]`;
    if (!isObj(s)) return c.err("badStage", sq, "a stage: { id, label }");
    if (typeof s.id !== "string" || !ITEM_ID.test(s.id)) c.err("badId", `${sq}.id`);
    else if (ids.has(s.id)) c.err("dupId", `${sq}.id`, s.id);
    else ids.set(s.id, i);
    c.text(s.label as never, `${sq}.label`);
    if (s.icon !== undefined && !CORE_ICONS.includes(s.icon as string)) c.err("badIcon", `${sq}.icon`, `one of the player's own icons: ${CORE_ICONS.join(", ")}`);
    if (s.kind !== undefined && !["source", "step", "check", "store"].includes(s.kind as string)) c.err("badKind", `${sq}.kind`, "source, step, check or store");
    tone(s.tone, `${sq}.tone`);
  });
  const next = stages.map(() => [] as number[]);
  const linked = new Set<string>();
  count(e.edges, `${q}.edges`, 1, 16).forEach((ed, i) => {
    const a = Array.isArray(ed) ? ids.get(ed[0]) : undefined;
    const b = Array.isArray(ed) ? ids.get(ed[1]) : undefined;
    if (a === undefined || b === undefined || a === b) return c.err("badEdge", `${q}.edges[${i}]`, "[from, to]: two stage ids");
    next[a]!.push(b);
    linked.add(`${a}>${b}`).add(`${b}>${a}`);
  });
  // No loops: a record that comes back is a retry, drawn as a hop back along the same arrow.
  const state = stages.map(() => 0);
  const loops = (n: number): boolean => {
    if (state[n] === 1) return true;
    if (state[n] === 2) return false;
    state[n] = 1;
    const r = next[n]!.some(loops);
    state[n] = 2;
    return r;
  };
  if (stages.some((_, n) => loops(n))) c.err("pipeCycle", `${q}.edges`, "the arrows must not loop: a retry is a hop back along an arrow");
  count(e.records, `${q}.records`, 0, DATA_LIMITS.records).forEach((r, i) => {
    const rq = `${q}.records[${i}]`;
    if (!isObj(r)) return c.err("badRecord", rq, "a record: { path }");
    let last: unknown[] | null = null;
    count(r.path, `${rq}.path`, 1, DATA_LIMITS.waypoints).forEach((w, j) => {
      const ok = Array.isArray(w) && (w.length === 2 || (w.length === 3 && w[2] === 1)) && isNum(w[0]) && w[0] >= 0 && isInt(w[1], 0, stages.length - 1);
      if (!ok) return c.err("badPoints", `${rq}.path[${j}]`, "[frame, stage] or [frame, stage, 1]");
      if (last) {
        if ((w[0] as number) < (last[0] as number)) c.err("badPoints", `${rq}.path[${j}]`, "frames go forward");
        if (last[1] !== w[1] && !linked.has(`${last[1]}>${w[1]}`)) c.err("badPoints", `${rq}.path[${j}]`, "a hop needs an arrow between its two stages");
      }
      last = w as unknown[];
    });
    for (const k of ["bad", "ok"]) if (r[k] !== undefined && !(isNum(r[k]) && (r[k] as number) >= 0)) c.err("badRecord", `${rq}.${k}`, "a frame from 0");
  });
  const frames = count(e.frames, `${q}.frames`, 1, DATA_LIMITS.frames);
  if (!frames.every((f) => Array.isArray(f) && f.length === stages.length + 1 && f.every((n) => isInt(n, 0, DATA_LIMITS.records)))) c.err("badFrames", `${q}.frames`, `per frame, ${stages.length + 1} counts (each stage, then the tray)`);
  c.text(e.aside as never, `${q}.aside`, false);
  if (e.mode !== undefined && e.mode !== "batch" && e.mode !== "stream") c.err("badMode", `${q}.mode`, "batch or stream");
  if (e.counts !== undefined && typeof e.counts !== "boolean") c.err("badCounts", `${q}.counts`, "true or false");
}

function sheet(e: Record<string, unknown>, q: string, c: PackCheckCtx, count: Count): void {
  const cols = e.cols;
  const rows = e.rows;
  if (!isInt(cols, 1, DATA_LIMITS.sheetCols)) c.err("badCount", `${q}.cols`, `1–${DATA_LIMITS.sheetCols}`);
  if (!isInt(rows, 1, DATA_LIMITS.sheetRows)) c.err("badCount", `${q}.rows`, `1–${DATA_LIMITS.sheetRows}`);
  const inside = (a: unknown): boolean => {
    const p = typeof a === "string" ? cellAt(a) : null;
    return !!p && p[0] < (cols as number) && p[1] < (rows as number);
  };
  const range = (s: unknown): boolean => typeof s === "string" && s.split(":").length <= 2 && s.split(":").every(inside);
  const frameAt = (v: unknown, at: string): void => { if (v !== undefined && !(isNum(v) && v >= 0)) c.err("badFrame", at, "a frame from 0"); };
  if (!isObj(e.cells)) c.err("badCells", `${q}.cells`, "an object of cells by address (A1…)");
  else for (const [a, cell] of Object.entries(e.cells)) {
    const cq = `${q}.cells.${a}`;
    if (!inside(a)) { c.err("badCell", cq, "an address inside the sheet (A1…)"); continue; }
    if (!isObj(cell)) { c.err("badCell", cq, "a cell: { v, t, f, at, to, out, b }"); continue; }
    if (cell.v !== undefined && !isValue(cell.v)) c.err("badValue", `${cq}.v`, VALUE);
    c.text(cell.t as never, `${cq}.t`, false);
    if (cell.f !== undefined && !(typeof cell.f === "string" && cell.f.startsWith("=") && cell.f.length <= 80)) c.err("badFormula", `${cq}.f`, "a formula: starts with =, at most 80 characters");
    frameAt(cell.at, `${cq}.at`);
    frameAt(cell.out, `${cq}.out`);
    if (cell.to !== undefined) {
      if (!isObj(cell.to) || !isNum(cell.to.at) || cell.to.at < 0) c.err("badCell", `${cq}.to`, "{ at, v or t }");
      else {
        if (cell.to.v !== undefined && !isValue(cell.to.v)) c.err("badValue", `${cq}.to.v`, VALUE);
        c.text(cell.to.t as never, `${cq}.to.t`, false);
      }
    }
    if (cell.b !== undefined && typeof cell.b !== "boolean") c.err("badCell", `${cq}.b`, "true or false");
  }
  if (e.widths !== undefined && !(Array.isArray(e.widths) && e.widths.length === cols && e.widths.every((w) => isNum(w) && w >= 40 && w <= 600))) c.err("badWidths", `${q}.widths`, "one width per column, 40–600 stage pixels");
  if (e.frames !== undefined) count(e.frames, `${q}.frames`, 1, DATA_LIMITS.frames).forEach((a, i) => { if (a !== null && !inside(a)) c.err("badFrames", `${q}.frames[${i}]`, "a cell inside the sheet, or null"); });
  if (e.issues !== undefined) count(e.issues, `${q}.issues`, 0, 8).forEach((s, i) => {
    const iq = `${q}.issues[${i}]`;
    if (!isObj(s)) return c.err("badIssue", iq, "an issue: { cells, kind }");
    if (!range(s.cells)) c.err("badRange", `${iq}.cells`, "a cell or a range (A2:C2) inside the sheet");
    if (!["typo", "blank", "dup", "bad"].includes(s.kind as string)) c.err("badIssue", `${iq}.kind`, "typo, blank, dup or bad");
    c.text(s.label as never, `${iq}.label`, false);
    frameAt(s.fixed, `${iq}.fixed`);
  });
  if (e.bar !== undefined && typeof e.bar !== "boolean") c.err("badBar", `${q}.bar`, "true or false");
}
