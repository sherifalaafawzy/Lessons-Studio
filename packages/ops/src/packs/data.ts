/**
 * Data pack: content computed when a lesson is made (never on the phone), and ready-made elements and scenes with
 * labels in English and Arabic. Seeded, so the same call always gives the same lesson.
 *
 * - Queries really run: `queryStages` loads sql.js (a dev dependency, in Node) and runs each step of the query as its
 *   own SQL, so every row the learner watches is one the database returned.
 * - Spreadsheets: `sheetEval` evaluates the formulas (SUM, AVERAGE, COUNT, MIN, MAX, IF… and cell references),
 *   `sheetFill` copies one down a column, `cleanSheet` finds typos, blanks and repeated rows.
 * - Pipelines: `pipelineFrames` plans each record's route, the retries and the counters.
 * - ERDs: `erdTable`, `erdSchema` (school, library, attendance, market).
 * - `DATASETS` and `setupSql`: small school datasets (students, results, marks, attendance, rainfall, prices, books,
 *   loans), and `dataWords` for the pupils' names in Arabic.
 */
import type { Element, Key, Orient, Scene, Text, Track, When } from "@lessonstudio/spec";
import { tx } from "../science.ts";

type ErdElement = Extract<Element, { type: "erd" }>;
type QueryElement = Extract<Element, { type: "query" }>;
type PipelineElement = Extract<Element, { type: "pipeline" }>;
type SheetElement = Extract<Element, { type: "sheet" }>;
type ErdTable = ErdElement["tables"][number];
type ErdColumn = ErdTable["cols"][number];
type QueryStep = QueryElement["steps"][number];
type QueryView = QueryStep["views"][number];
type PipeStage = PipelineElement["stages"][number];
type PipeRecord = PipelineElement["records"][number];
type SheetCell = SheetElement["cells"][string];
type SheetIssue = NonNullable<SheetElement["issues"]>[number];
export type DataValue = string | number | null;
export interface Box { id: string; x: number; y: number; w: number; h: number }

const r2 = (v: number): number => Math.round(v * 100) / 100;
const range = (n: number): number[] => Array.from({ length: n }, (_, i) => i);

/* ---------- small school datasets ---------- */

export interface Dataset { cols: string[]; rows: DataValue[][] }

/** Small tables about a school and its town, for queries, sheets and pipelines. Names are the Darsi cast's and their classmates'. */
export const DATASETS: Record<string, Dataset> = {
  students: { cols: ["id", "name", "class"], rows: [[1, "Amina", "5A"], [2, "Joseph", "5B"], [3, "Salma", "5A"], [4, "Musa", "5B"], [5, "Omar", "5B"]] },
  results: { cols: ["name", "class", "mark"], rows: [["Amina", "5A", 78], ["Joseph", "5B", 45], ["Salma", "5A", 91], ["Musa", "5B", 62], ["Farah", "5A", 55], ["Omar", "5B", 38], ["Laila", "5B", 84]] },
  marks: { cols: ["student_id", "subject", "mark"], rows: [[3, "Maths", 91], [1, "Maths", 78], [4, "Maths", 62], [2, "Maths", 45], [1, "Science", 84]] },
  attendance: { cols: ["student_id", "day", "present"], rows: [[1, "Mon", 1], [2, "Mon", 1], [3, "Mon", 0], [1, "Tue", 1], [2, "Tue", 0], [3, "Tue", 1], [1, "Wed", 1], [2, "Wed", 1], [3, "Wed", 1]] },
  rainfall: { cols: ["month", "mm"], rows: [["Jan", 12], ["Feb", 8], ["Mar", 30], ["Apr", 64], ["May", 110], ["Jun", 152]] },
  prices: { cols: ["market", "item", "price"], rows: [["North", "Rice", 40], ["North", "Beans", 35], ["South", "Rice", 38], ["South", "Beans", 37], ["East", "Rice", 42], ["East", "Beans", 33]] },
  books: { cols: ["id", "title", "author"], rows: [[1, "Things Fall Apart", "Achebe"], [2, "Season of Migration", "Salih"], [3, "Half of a Yellow Sun", "Adichie"], [4, "The Cairo Trilogy", "Mahfouz"]] },
  loans: { cols: ["book_id", "member", "days"], rows: [[1, "Amina", 7], [3, "Joseph", 14], [1, "Salma", 10], [4, "Musa", 21], [2, "Farah", 5]] },
};

const sqlValue = (v: DataValue): string => (v === null ? "NULL" : typeof v === "number" ? String(v) : `'${v.replace(/'/g, "''")}'`);

/** CREATE TABLE and INSERT for some of DATASETS (or your own tables), for `queryStages`. */
export function setupSql(names: string[], own: Record<string, Dataset> = {}): string {
  return names.map((n) => {
    const d = own[n] ?? DATASETS[n];
    if (!d) throw new Error(`setupSql: no dataset "${n}"`);
    const type = (k: number): string => (d.rows.every((r) => typeof r[k] === "number" || r[k] === null) ? (d.rows.every((r) => r[k] === null || Number.isInteger(r[k])) ? "INTEGER" : "REAL") : "TEXT");
    return `CREATE TABLE ${n} (${d.cols.map((c, k) => `${c} ${type(k)}`).join(", ")});\n` +
      (d.rows.length ? `INSERT INTO ${n} VALUES ${d.rows.map((r) => `(${r.map(sqlValue).join(", ")})`).join(", ")};\n` : "");
  }).join("");
}

/** The pupils' names in the datasets, in Arabic letters for Arabic lessons (for `words`). */
export function dataWords(langs: string[] = ["en", "ar"]): Record<string, Text> {
  const ar: Record<string, string> = { Amina: "أمينة", Joseph: "جوزيف", Salma: "سلمى", Musa: "موسى", Farah: "فرح", Omar: "عمر", Laila: "ليلى", Okafor: "أوكافور" };
  return Object.fromEntries(Object.entries(ar).map(([en, a]) => [en, tx(en, a, langs)]));
}

/* ---------- erd ---------- */

/** Columns from a short spec: "id INT pk, name TEXT, class_id INT fk". */
export function erdCols(spec: string): ErdColumn[] {
  return spec.split(",").map((part) => {
    const [name, ...rest] = part.trim().split(/\s+/);
    const keys = rest.filter((w) => /^(pk|fk)$/i.test(w)).map((w) => w.toLowerCase());
    const type = rest.filter((w) => !/^(pk|fk)$/i.test(w)).join(" ");
    const key = keys.includes("pk") && keys.includes("fk") ? "pkfk" : keys.includes("pk") ? "pk" : keys.includes("fk") ? "fk" : undefined;
    return { name: name!, ...(type ? { type } : {}), ...(key ? { key } : {}) } as ErdColumn;
  });
}

export function erdTable(name: string, cols: string, label?: Text): ErdTable {
  return { name, ...(label ? { label } : {}), cols: erdCols(cols) };
}

export type ErdSchema = "school" | "library" | "attendance" | "market";
export const ERD_SCHEMAS: ErdSchema[] = ["school", "library", "attendance", "market"];

/** A ready-made database: its tables (with their names in the lesson's languages) and how they link. */
export function erdSchema(name: ErdSchema, box: Box, langs: string[] = ["en", "ar"]): ErdElement {
  const T = (en: string, ar: string): Text => tx(en, ar, langs);
  const has = T("has", "لديه");
  const s: Record<ErdSchema, Pick<ErdElement, "tables" | "rels">> = {
    school: {
      tables: [
        erdTable("students", "id INT pk, name TEXT, class TEXT", T("Students", "الطلاب")),
        erdTable("marks", "id INT pk, student_id INT fk, subject_id INT fk, mark INT", T("Marks", "الدرجات")),
        erdTable("subjects", "id INT pk, name TEXT", T("Subjects", "المواد")),
      ],
      rels: [{ from: "students", to: "marks", kind: "1-n", via: "student_id", label: has }, { from: "subjects", to: "marks", kind: "1-n", via: "subject_id" }],
    },
    library: {
      tables: [
        erdTable("members", "id INT pk, name TEXT, class TEXT", T("Members", "الأعضاء")),
        erdTable("loans", "id INT pk, member_id INT fk, book_id INT fk, due DATE", T("Loans", "الإعارات")),
        erdTable("books", "id INT pk, title TEXT, author TEXT", T("Books", "الكتب")),
      ],
      rels: [{ from: "members", to: "loans", kind: "1-n", via: "member_id", label: T("borrows", "يستعير") }, { from: "books", to: "loans", kind: "1-n", via: "book_id" }],
    },
    attendance: {
      tables: [
        erdTable("classes", "id INT pk, name TEXT, teacher TEXT", T("Classes", "الفصول")),
        erdTable("students", "id INT pk, name TEXT, class_id INT fk", T("Students", "الطلاب")),
        erdTable("attendance", "student_id INT pk fk, day DATE pk, present BOOL", T("Attendance", "الحضور")),
      ],
      rels: [{ from: "classes", to: "students", kind: "1-n", via: "class_id", label: has }, { from: "students", to: "attendance", kind: "1-n", via: "student_id" }],
    },
    market: {
      tables: [
        erdTable("markets", "id INT pk, name TEXT, town TEXT", T("Markets", "الأسواق")),
        erdTable("prices", "market_id INT fk, item_id INT fk, day DATE, price REAL", T("Prices", "الأسعار")),
        erdTable("items", "id INT pk, name TEXT, unit TEXT", T("Items", "السلع")),
      ],
      rels: [{ from: "markets", to: "prices", kind: "1-n", via: "market_id" }, { from: "items", to: "prices", kind: "1-n", via: "item_id" }],
    },
  };
  return { ...box, type: "erd", ...s[name] };
}

/* ---------- query: run a query step by step in sql.js ---------- */

export interface SqlStatement { getColumnNames(): string[]; step(): boolean; get(): unknown[]; free(): void }
export interface SqlDatabase { run(sql: string): unknown; prepare(sql: string): SqlStatement; close(): void }
/** The sql.js module (initSqlJs's result). */
export interface SqlEngine { Database: new () => SqlDatabase }

let engine: Promise<SqlEngine> | null = null;
/**
 * sql.js, loaded in Node from node_modules (a dev dependency: authoring only, never the player). Anywhere else, load
 * it yourself and use queryStagesWith.
 */
export function loadSql(): Promise<SqlEngine> {
  return (engine ??= (async () => {
    // Node's own modules through getBuiltinModule, so bundlers for the browser never see them.
    const node = (globalThis as { process?: { getBuiltinModule?: (id: string) => unknown } }).process?.getBuiltinModule;
    if (!node) throw new Error("loadSql runs in Node; elsewhere load sql.js yourself and call queryStagesWith");
    const { createRequire } = node("node:module") as { createRequire: (u: string) => { (id: string): unknown; resolve(id: string): string } };
    const { readFileSync } = node("node:fs") as { readFileSync: (p: string) => Uint8Array };
    const { dirname, join } = node("node:path") as { dirname: (p: string) => string; join: (...p: string[]) => string };
    const require = createRequire(import.meta.url);
    const main = require.resolve("sql.js");
    const init = require(main) as (o: { wasmBinary: Uint8Array }) => Promise<SqlEngine>;
    return init({ wasmBinary: readFileSync(join(dirname(main), "sql-wasm.wasm")) });
  })());
}

export type QueryData = Pick<QueryElement, "sql" | "grids" | "steps">;

type ClauseKind = "select" | "from" | "join" | "where" | "group" | "having" | "order" | "limit";
interface Clause { kind: ClauseKind; start: number; end: number; head: number; left?: boolean }
const KW = /^(select|from|where|group\s+by|having|order\s+by|limit|offset|union|except|intersect|(?:(?:inner|left|cross)\s+(?:outer\s+)?)?join)\b/i;
const AGG = /\b(count|sum|avg|min|max|total|group_concat)\s*\(/i;
const NOT_ALIAS = /^(end|asc|desc|and|or|not|null|then|else)$/i;

/** The query's clauses at the top level (outside brackets and quotes). */
function clauses(sql: string): Clause[] {
  const out: Clause[] = [];
  let depth = 0;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i]!;
    if (ch === "'" || ch === '"') {
      const j = sql.indexOf(ch, i + 1);
      if (j < 0) throw new Error(`queryStages: a quote isn't closed in: ${sql}`);
      i = j;
      continue;
    }
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (depth || /[\w.]/.test(sql[i - 1] ?? " ") || !/[a-z]/i.test(ch)) continue;
    const m = KW.exec(sql.slice(i));
    if (!m) continue;
    const word = m[1]!.toLowerCase().replace(/\s+/g, " ");
    if (["union", "except", "intersect"].includes(word)) throw new Error(`queryStages: ${word.toUpperCase()} isn't drawn; show each SELECT on its own`);
    if (word !== "offset") out.push({ kind: (word.endsWith("join") ? "join" : word.split(" ")[0]) as ClauseKind, start: i, end: sql.length, head: i + m[0].length, ...(word.startsWith("left") ? { left: true } : {}) });
    i += m[0].length - 1;
  }
  out.forEach((c, k) => { c.end = out[k + 1]?.start ?? sql.length; });
  return out;
}

/** Splits at top-level commas. */
function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote = "";
  let last = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (quote) { if (ch === quote) quote = ""; continue; }
    if (ch === "'" || ch === '"') quote = ch;
    else if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (ch === "," && !depth) { out.push(s.slice(last, i).trim()); last = i + 1; }
  }
  out.push(s.slice(last).trim());
  return out.filter(Boolean);
}

/** "students s", "students AS s" or "students". */
function tableRef(s: string): { name: string; alias: string } {
  const m = /^([A-Za-z_]\w*)(?:\s+(?:AS\s+)?([A-Za-z_]\w*))?$/i.exec(s.trim());
  if (!m) throw new Error(`queryStages: a table, then maybe its short name, is all FROM and JOIN can hold here (not "${s.trim()}")`);
  return { name: m[1]!, alias: m[2] ?? m[1]! };
}

const norm = (s: string): string => s.toLowerCase().replace(/\s+/g, "").replace(/\b[a-z_]\w*\./g, "");

/** The columns (of `meta`) a piece of SQL names. */
function colsUsed(body: string, meta: { alias: string; name: string }[]): number[] {
  const clean = body.replace(/'[^']*'/g, "''");
  const out = new Set<number>();
  for (const m of clean.matchAll(/([A-Za-z_]\w*)(?:\s*\.\s*([A-Za-z_]\w*))?/g)) {
    if (/^\s*\(/.test(clean.slice(m.index! + m[0].length))) continue; // a function
    const [alias, name] = m[2] ? [m[1]!.toLowerCase(), m[2].toLowerCase()] : [null, m[1]!.toLowerCase()];
    meta.forEach((c, i) => { if (c.name.toLowerCase() === name && (alias === null || c.alias.toLowerCase() === alias)) out.add(i); });
  }
  return [...out].sort((a, b) => a - b);
}

function val(v: unknown): DataValue {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isInteger(v) ? v : r2(v);
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "string") return v;
  return "[blob]";
}

function runOn(db: SqlDatabase, sql: string): { cols: string[]; rows: DataValue[][] } {
  let st: SqlStatement;
  try {
    st = db.prepare(sql);
  } catch (e) {
    throw new Error(`queryStages: SQLite says "${e instanceof Error ? e.message : String(e)}" for: ${sql.replace(/\s+/g, " ")}`);
  }
  const cols = st.getColumnNames();
  const rows: DataValue[][] = [];
  while (st.step()) rows.push(st.get().map(val));
  st.free();
  return { cols, rows };
}

/** One clause per line, for a query written on one line. */
function formatSql(sql: string): string {
  if (sql.includes("\n")) return sql;
  return clauses(sql).map((c) => sql.slice(c.start, c.end).trim()).join("\n");
}

/**
 * Runs a query step by step, in the order the database does it, with sql.js: the source tables, the rows a JOIN
 * matches, the rows WHERE keeps, the groups, the picked columns, DISTINCT, the sort, the LIMIT and the result. Each
 * step is run as SQL of its own (with the rows' rowids to follow them), and the result is checked against the query
 * run whole. A query on one line is set one clause per line. Supports one table or two joined (INNER or LEFT), WHERE,
 * GROUP BY, HAVING, aggregates, DISTINCT, ORDER BY, LIMIT and OFFSET; subqueries inside a clause run but aren't drawn.
 */
export function queryStagesWith(SQL: SqlEngine, query: string, setup: string): QueryData {
  const text = formatSql(query.trim().replace(/;\s*$/, ""));
  const cl = clauses(text);
  const all = (k: ClauseKind): Clause[] => cl.filter((c) => c.kind === k);
  for (const k of ["select", "from", "where", "group", "having", "order", "limit"] as const) if (all(k).length > 1) throw new Error(`queryStages: one ${k.toUpperCase()} only`);
  const [sel] = all("select");
  const [from] = all("from");
  if (!sel || !from || cl[0] !== sel) throw new Error("queryStages: the query starts with SELECT … FROM");
  const joins = all("join");
  if (joins.length > 1) throw new Error("queryStages: at most one JOIN is drawn");
  const join = joins[0];
  const [where] = all("where");
  const [group] = all("group");
  const [having] = all("having");
  const [order] = all("order");
  const [limit] = all("limit");
  const body = (c: Clause | undefined): string => (c ? text.slice(c.head, c.end).trim() : "");
  const full = (c: Clause | undefined): string => (c ? text.slice(c.start, c.end).trim() : "");
  const lineOf = (pos: number): number => text.slice(0, pos).split("\n").length - 1;
  const lines = (c: Clause): number[] => {
    let e = c.end;
    while (e > c.start && /\s/.test(text[e - 1]!)) e--;
    return range(lineOf(e - 1) - lineOf(c.start) + 1).map((k) => k + lineOf(c.start));
  };

  let selBody = body(sel);
  const distinct = /^distinct\b/i.test(selBody);
  selBody = selBody.replace(/^(distinct|all)\s+/i, "");
  let on = "";
  const refs = [tableRef(body(from))];
  if (join) {
    const m = /^([\s\S]*?)\s+ON\s+([\s\S]+)$/i.exec(body(join));
    if (!m) throw new Error("queryStages: JOIN needs ON …");
    refs.push(tableRef(m[1]!));
    on = m[2]!;
  }
  const fromText = text.slice(from.start, (join ?? from).end).trim();
  const db = new SQL.Database();
  try {
    db.run(setup);
    const srcs = refs.map((r) => {
      const t = runOn(db, `SELECT rowid AS __r, * FROM ${r.name} ORDER BY rowid`);
      if (t.rows.length > 12) throw new Error(`queryStages: ${r.name} has ${t.rows.length} rows; at most 12 can be drawn`);
      return { ...r, cols: t.cols.slice(1), rows: t.rows.map((x) => x.slice(1)), ids: t.rows.map((x) => x[0]) };
    });
    const grids: QueryData["grids"] = srcs.map((s) => ({ name: s.name, cols: s.cols, rows: s.rows }));
    const idSel = srcs.map((s, k) => `${s.alias}.rowid AS __i${k}`).join(", ");
    const keyOf = (r: DataValue[]): string => r.map(String).join(",");
    const pairs = (tail: string): DataValue[][] => runOn(db, `SELECT ${idSel} ${fromText} ${tail}`).rows;

    // The working table: the source table, or the rows the join makes.
    const meta = srcs.flatMap((s) => s.cols.map((name) => ({ alias: s.alias, name })));
    const wPairs = pairs("");
    const wKeys = wPairs.map(keyOf);
    let W = 0;
    const steps: QueryStep[] = [{ kind: "from", lines: lines(from), views: [{ g: 0, rows: range(srcs[0]!.rows.length) }] }];
    if (join) {
      const at = (k: number, id: DataValue): number => srcs[k]!.ids.indexOf(id);
      const links = wPairs.filter((p) => p[1] !== null).map((p) => [at(0, p[0]!), at(1, p[1]!)] as [number, number]);
      const usedA = new Set(links.map((l) => l[0]));
      const usedB = new Set(links.map((l) => l[1]));
      const side = (k: number): QueryView => {
        const n = srcs[k]!.rows.length;
        const lit = colsUsed(on, srcs[k]!.cols.map((name) => ({ alias: srcs[k]!.alias, name })));
        const out = range(n).filter((r) => !(k ? usedB : usedA).has(r) && !(k === 0 && join.left));
        return { g: k, rows: range(n), ...(lit.length ? { lit } : {}), ...(out.length ? { out } : {}) };
      };
      steps.push({ kind: "join", lines: lines(join), views: [side(0), side(1)], links });
      if (wPairs.length > 12) throw new Error(`queryStages: the join makes ${wPairs.length} rows; at most 12 can be drawn`);
      const names = meta.map((c) => c.name);
      grids.push({
        cols: meta.map((c) => (names.filter((n) => n === c.name).length > 1 ? `${c.alias}.${c.name}` : c.name)),
        split: srcs[0]!.cols.length,
        rows: wPairs.map((p) => srcs.flatMap((s, k) => (p[k] === null ? s.cols.map(() => null) : s.rows[s.ids.indexOf(p[k]!)]!))),
      });
      W = grids.length - 1;
      steps.push({ kind: "join", lines: lines(join), views: [{ g: W, rows: range(wPairs.length) }] });
    }
    let cur = range(wKeys.length);
    if (where) {
      const keep = new Set(pairs(full(where)).map(keyOf));
      const out = cur.filter((r) => !keep.has(wKeys[r]!));
      const lit = colsUsed(body(where), meta);
      steps.push({ kind: "where", lines: lines(where), views: [{ g: W, rows: cur, ...(out.length ? { out } : {}), ...(lit.length ? { lit } : {}) }] });
      cur = cur.filter((r) => keep.has(wKeys[r]!));
    }

    // Groups: which rows go together, in the order the database gives the groups.
    const gExprs = group ? splitTop(body(group)) : [];
    const aggregate = !group && AGG.test(selBody);
    let gOrder: string[] = [];
    let groupOf: number[] | undefined;
    if (group) {
      const memb = new Map(runOn(db, `SELECT ${idSel}, ${gExprs.join(", ")} ${fromText} ${full(where)}`).rows.map((r) => [keyOf(r.slice(0, srcs.length)), JSON.stringify(r.slice(srcs.length))]));
      gOrder = runOn(db, `SELECT ${gExprs.join(", ")} ${fromText} ${full(where)} ${full(group)}`).rows.map((r) => JSON.stringify(r));
      const gi = (r: number): number => gOrder.indexOf(memb.get(wKeys[r]!)!);
      cur = [...cur].sort((a, b) => gi(a) - gi(b) || a - b);
      groupOf = cur.map(gi);
      const lit = colsUsed(body(group), meta);
      steps.push({ kind: "group", lines: lines(group), views: [{ g: W, rows: cur, groups: groupOf, ...(lit.length ? { lit } : {}) }] });
      if (having) {
        const keep = new Set(runOn(db, `SELECT ${gExprs.join(", ")} ${fromText} ${full(where)} ${full(group)} ${full(having)}`).rows.map((r) => JSON.stringify(r)));
        const fails = new Set(gOrder.map((k, i) => (keep.has(k) ? -1 : i)).filter((i) => i >= 0));
        const out = cur.filter((_, j) => fails.has(groupOf![j]!));
        const hl = colsUsed(body(having), meta);
        steps.push({ kind: "having", lines: lines(having), views: [{ g: W, rows: cur, groups: groupOf, ...(out.length ? { out } : {}), ...(hl.length ? { lit: hl } : {}) }] });
        const kept = cur.map((_, j) => !fails.has(groupOf![j]!));
        cur = cur.filter((_, j) => kept[j]);
        groupOf = groupOf.filter((_, j) => kept[j]);
      }
    } else if (aggregate) groupOf = cur.map(() => 0);

    // SELECT: first the columns it uses, lit on the working table; then the rows it makes.
    const items = selBody === "*" ? [] : splitTop(selBody).map((it) => {
      const m = /^([\s\S]*?[\w)'"\]])\s+(?:AS\s+)?([A-Za-z_]\w*)$/i.exec(it);
      return m && !NOT_ALIAS.test(m[2]!) ? { expr: m[1]!, alias: m[2]! } : { expr: it, alias: "" };
    });
    if (selBody !== "*") {
      const lit = colsUsed(selBody, meta);
      const dim = range(meta.length).filter((c) => !lit.includes(c));
      steps.push({ kind: "select", lines: lines(sel), views: [{ g: W, rows: cur, ...(groupOf ? { groups: groupOf } : {}), ...(lit.length ? { lit } : {}), ...(dim.length ? { dim } : {}) }] });
    }
    // ORDER BY terms: a picked column, or one more column (hidden once sorted) when it sorts by something not picked.
    const terms = order ? splitTop(body(order)).map((t) => {
      const m = /^([\s\S]*?)(?:\s+(ASC|DESC))?$/i.exec(t)!;
      return { expr: m[1]!.trim(), dir: (m[2] ?? "asc").toLowerCase() as "asc" | "desc" };
    }) : [];
    const extras: string[] = [];
    const termCol: (number | string)[] = terms.map((t) => {
      if (/^\d+$/.test(t.expr)) return Number(t.expr) - 1;
      const i = items.findIndex((it) => norm(it.alias) === norm(t.expr) || norm(it.expr) === norm(t.expr));
      if (i >= 0) return i;
      if (selBody === "*") { const j = meta.findIndex((c) => norm(c.name) === norm(t.expr)); if (j >= 0) return j; }
      extras.push(t.expr);
      return `x${extras.length - 1}`;
    });
    const idPart = group ? gExprs.map((g, i) => `, ${g} AS __g${i}`).join("") : aggregate ? "" : srcs.map((s, k) => `, ${s.alias}.rowid AS __i${k}`).join("");
    const idCount = group ? gExprs.length : aggregate ? 0 : srcs.length;
    const base = `SELECT ${selBody}${extras.map((x, i) => `, ${x} AS __x${i}`).join("")}${idPart} ${fromText} ${full(where)} ${full(group)} ${full(having)}`;
    const pre = runOn(db, base);
    const nSel = pre.cols.length - extras.length - idCount;
    const ident = (r: DataValue[]): string => (aggregate ? "all" : group ? JSON.stringify(r.slice(pre.cols.length - idCount)) : keyOf(r.slice(pre.cols.length - idCount)));
    const rIds = pre.rows.map(ident);
    if (pre.rows.length > 12) throw new Error(`queryStages: the query makes ${pre.rows.length} rows before LIMIT; at most 12 can be drawn`);
    grids.push({ cols: [...pre.cols.slice(0, nSel), ...extras], rows: pre.rows.map((r) => r.slice(0, nSel + extras.length)) });
    const R = grids.length - 1;
    const hide = extras.map((_, i) => nSel + i);
    const rGroups = group ? rIds.map((k) => gOrder.indexOf(k)) : aggregate ? rIds.map(() => 0) : undefined;
    const H = hide.length ? { hide } : {};
    let rows = range(pre.rows.length);
    const groupsFor = (rs: number[]): { groups?: number[] } => (rGroups ? { groups: rs.map((r) => rGroups[r]!) } : {});
    steps.push({ kind: "select", lines: lines(sel), views: [{ g: R, rows, ...groupsFor(rows), ...H }] });
    if (distinct) {
      const seen = new Set<string>();
      const out = rows.filter((r) => { const k = JSON.stringify(pre.rows[r]!.slice(0, nSel)); if (seen.has(k)) return true; seen.add(k); return false; });
      steps.push({ kind: "distinct", lines: lines(sel), views: [{ g: R, rows, ...(out.length ? { out } : {}), ...groupsFor(rows), ...H }] });
      rows = rows.filter((r) => !out.includes(r));
    }
    let sort: [number, "asc" | "desc"][] | undefined;
    if (order) {
      const keep = new Set(rows);
      const sorted = runOn(db, `${base} ${full(order)}`).rows.map((r) => rIds.indexOf(ident(r))).filter((r, i, a) => keep.has(r) && a.indexOf(r) === i);
      sort = terms.map((t, i) => [typeof termCol[i] === "number" ? termCol[i] as number : nSel + Number(String(termCol[i]).slice(1)), t.dir]);
      steps.push({ kind: "order", lines: lines(order), views: [{ g: R, rows: sorted, sort, lit: [...new Set(sort.map((s) => s[0]))], ...groupsFor(sorted) }] });
      rows = sorted;
    }
    const S = sort ? { sort } : {};
    if (limit) {
      const m = /^(\d+)(?:\s*,\s*(\d+)|\s+OFFSET\s+(\d+))?$/i.exec(body(limit));
      if (!m) throw new Error("queryStages: LIMIT n [OFFSET m] with plain numbers");
      const [off, n] = m[2] !== undefined ? [Number(m[1]), Number(m[2])] : [Number(m[3] ?? 0), Number(m[1])];
      const out = rows.filter((_, j) => j < off || j >= off + n);
      steps.push({ kind: "limit", lines: lines(limit), views: [{ g: R, rows, ...(out.length ? { out } : {}), ...(off === 0 && n < rows.length ? { cut: n } : {}), ...H, ...S }] });
      rows = rows.slice(off, off + n);
    }
    steps.push({ kind: "result", lines: [], views: [{ g: R, rows, ...H, ...S }] });

    // The steps must add up to the query, run whole.
    const truth = runOn(db, text);
    const got = rows.map((r) => pre.rows[r]!.slice(0, nSel));
    if (JSON.stringify(truth.cols) !== JSON.stringify(pre.cols.slice(0, nSel)) || JSON.stringify(truth.rows) !== JSON.stringify(got)) {
      throw new Error(`queryStages: the steps give ${JSON.stringify(got)} but the query gives ${JSON.stringify(truth.rows)}; simplify the query`);
    }
    if (steps.length > 12) throw new Error(`queryStages: ${steps.length} steps; at most 12`);
    return { sql: text, grids, steps };
  } finally {
    db.close();
  }
}

/** queryStagesWith, with sql.js loaded in Node (loadSql). */
export async function queryStages(query: string, setup: string): Promise<QueryData> {
  return queryStagesWith(await loadSql(), query, setup);
}

/** A query element from computed stages. */
export function queryElement(box: Box, data: QueryData, o: { words?: Record<string, Text>; layout?: "side" | "top"; size?: number } = {}): QueryElement {
  return { ...box, type: "query", ...data, ...(o.words ? { words: o.words } : {}), ...(o.layout ? { layout: o.layout } : {}), ...(o.size ? { size: o.size } : {}) };
}

/** The frame of a query's first step of a kind ("where", "group"…), or -1. */
export const queryFrame = (q: Pick<QueryElement, "steps">, kind: QueryStep["kind"]): number => q.steps.findIndex((s) => s.kind === kind);

/* ---------- pipeline ---------- */

export interface PipelinePlan {
  stages: PipeStage[];
  /** Arrows by stage id; default: a chain, in order. */
  edges?: [string, string][];
  /** How many records flow (at most 24). */
  records: number;
  /** Stream: one leaves the source each `gap` frames; batch: all at once, together. */
  mode?: "batch" | "stream";
  gap?: number;
  /** Records (from 0) that are bad: caught at the check. */
  bad?: number[];
  /** The stage that catches them (default: the first "check" stage, else the second stage). */
  check?: string;
  /** What happens to a bad record: sent back to the stage before for fixing, or set aside in a tray. */
  fix?: "retry" | "aside";
}

/**
 * Each record's route through the pipeline, frame by frame: one frame per hop along an arrow and one frame of rest at
 * each stage, so every arrival lands on a whole frame. A branch sends records down its arrows in turn. A bad record is
 * caught half a frame after it reaches the check; it is set aside (into the tray, a frame later) or retried (back to
 * the stage before, fixed there, then on again). The counters count each record once per stage.
 */
export function pipelineFrames(p: PipelinePlan): { edges: [string, string][]; records: PipeRecord[]; frames: number[][] } {
  const n = p.stages.length;
  const ids = p.stages.map((s) => s.id);
  const edges = p.edges ?? ids.slice(1).map((id, i) => [ids[i]!, id] as [string, string]);
  const outs = ids.map((id) => edges.filter((e) => e[0] === id).map((e) => ids.indexOf(e[1])));
  const sources = ids.map((_, i) => i).filter((i) => !edges.some((e) => e[1] === ids[i]));
  if (!sources.length) throw new Error("pipelineFrames: no stage to start from (every stage has an arrow in)");
  if (p.records > 24) throw new Error("pipelineFrames: at most 24 records");
  const checkAt = p.check !== undefined ? ids.indexOf(p.check) : Math.max(1, p.stages.findIndex((s) => s.kind === "check"));
  if (checkAt < 0) throw new Error(`pipelineFrames: no stage "${p.check}"`);
  const bad = new Set(p.bad ?? []);
  const gap = p.gap ?? 1;
  const records: PipeRecord[] = range(p.records).map((i) => {
    const src = sources[i % sources.length]!;
    const path: PipeRecord["path"] = [[0, src]];
    const rec: PipeRecord = { path };
    const at = (t: number, s: number, aside = false): void => {
      const last = path[path.length - 1]!;
      if (last[0] === t && last[1] === s && !aside) return;
      path.push(aside ? [t, s, 1] : [t, s]);
    };
    let t = p.mode === "stream" ? i * gap : 0;
    at(t, src);
    let s = src;
    let caught = false;
    for (let hops = 0; outs[s]!.length && hops < 12; hops++) {
      const next = outs[s]![i % outs[s]!.length]!;
      at(++t, next);
      if (bad.has(i) && next === checkAt && !caught) {
        caught = true;
        rec.bad = t + 0.5;
        at(++t, next);
        if (p.fix !== "retry") { at(++t, next, true); return rec; }
        at(++t, s);
        rec.ok = t + 0.5;
        at(++t, s);
        at(++t, next);
      }
      if (outs[next]!.length) at(++t, next);
      s = next;
    }
    return rec;
  });
  const end = Math.ceil(Math.max(0, ...records.map((r) => r.path[r.path.length - 1]![0])));
  const first = records.map((r) => range(n).map((s) => r.path.find((w) => w[1] === s && w.length === 2)?.[0] ?? Infinity));
  const tray = records.map((r) => r.path.find((w) => w.length === 3)?.[0] ?? Infinity);
  const frames = range(end + 1).map((k) => [...range(n).map((s) => first.filter((f) => f[s]! <= k).length), tray.filter((f) => f <= k).length]);
  return { edges, records, frames };
}

/**
 * A pipeline element, its records' routes planned. Still (no `frame` or `pass` track, or once a `pass` ends) it shows
 * the finished run.
 */
export function pipeline(box: Box, plan: PipelinePlan, o: { aside?: Text; counts?: boolean; size?: number } = {}): PipelineElement {
  const { edges, records, frames } = pipelineFrames(plan);
  return {
    ...box, type: "pipeline", stages: plan.stages, edges, records, frames, frame: frames.length - 1, ...(plan.mode ? { mode: plan.mode } : {}),
    ...(o.aside ? { aside: o.aside } : {}), ...(o.counts === false ? { counts: false } : {}), ...(o.size ? { size: o.size } : {}),
  };
}

/** The last frame of a pipeline's run. */
export const pipelineEnd = (el: Pick<PipelineElement, "frames">): number => el.frames.length - 1;

/* ---------- sheet: formulas evaluated when the lesson is made ---------- */

export type Cells = Record<string, SheetCell>;
/** "B4" from column and row, from 0. */
export const addr = (col: number, row: number): string => String.fromCharCode(65 + col) + (row + 1);
const parseAddr = (a: string): [number, number] => {
  const m = /^\$?([A-Z])\$?(\d+)$/.exec(a);
  if (!m) throw new Error(`not a cell: ${a}`);
  return [m[1]!.charCodeAt(0) - 65, Number(m[2]) - 1];
};

type FVal = number | string | boolean | null;
type Tok = { k: "num" | "str" | "ref" | "fn" | "op" | "bool"; v: string };

function tokens(f: string): Tok[] {
  const out: Tok[] = [];
  const re = /\s*(?:(\d+(?:\.\d+)?)|"([^"]*)"|(\$?[A-Z]\$?\d+(?::\$?[A-Z]\$?\d+)?)|([A-Z][A-Z0-9]*)\s*(?=\()|(TRUE|FALSE)\b|(<=|>=|<>|[-+*/^&=<>(),;]))/gy;
  let m: RegExpExecArray | null;
  let pos = 0;
  const src = f.replace(/^=/, "");
  while (pos < src.length && (m = re.exec(src))) {
    pos = re.lastIndex;
    if (m[1] !== undefined) out.push({ k: "num", v: m[1] });
    else if (m[2] !== undefined) out.push({ k: "str", v: m[2] });
    else if (m[3] !== undefined) out.push({ k: "ref", v: m[3] });
    else if (m[4] !== undefined) out.push({ k: "fn", v: m[4] });
    else if (m[5] !== undefined) out.push({ k: "bool", v: m[5] });
    else out.push({ k: "op", v: m[6]! });
  }
  if (src.slice(pos).trim()) throw new Error(`can't read "${src.slice(pos)}"`);
  return out;
}

const isErr = (v: unknown): v is string => typeof v === "string" && v.startsWith("#");
const toNum = (v: FVal): number | string => {
  if (typeof v === "string") return v.startsWith("#") ? v : v.trim() === "" ? 0 : Number.isFinite(Number(v)) ? Number(v) : "#VALUE!";
  return v === null ? 0 : typeof v === "boolean" ? (v ? 1 : 0) : v;
};
const show = (v: FVal): string => (v === null ? "" : typeof v === "boolean" ? (v ? "TRUE" : "FALSE") : String(v));

function compare(a: FVal, op: string, b: FVal): FVal {
  if (isErr(a)) return a;
  if (isErr(b)) return b;
  const both = typeof a === "number" && typeof b === "number";
  const x = both ? a : show(a).toLowerCase();
  const y = both ? b : show(b).toLowerCase();
  switch (op) {
    case "=": return x === y;
    case "<>": return x !== y;
    case "<": return x < y;
    case ">": return x > y;
    case "<=": return x <= y;
    default: return x >= y;
  }
}

/** A COUNTIF criterion: ">=50", "<>Pass", "Pass", 3. */
function criterion(c: FVal): (v: FVal) => boolean {
  if (typeof c === "number") return (v) => v === c;
  const m = /^(<=|>=|<>|<|>|=)?(.*)$/.exec(show(c))!;
  const op = m[1] ?? "=";
  const rhs: FVal = m[2] !== "" && Number.isFinite(Number(m[2])) ? Number(m[2]) : m[2]!;
  return (v) => (typeof rhs === "number" && typeof v !== "number" ? false : compare(v, op, rhs) === true);
}

function call(name: string, args: (FVal | FVal[])[]): FVal {
  const flat = args.flatMap((a) => (Array.isArray(a) ? a : [a]));
  const err = flat.find(isErr);
  const nums = (): number[] => args.flatMap((a) => (Array.isArray(a) ? a.filter((v): v is number => typeof v === "number") : [toNum(a)].filter((v): v is number => typeof v === "number")));
  const arg = (k: number): FVal => { const a = args[k]; return Array.isArray(a) ? (a.length === 1 ? a[0]! : "#VALUE!") : a ?? null; };
  const list = (k: number): FVal[] => { const a = args[k]; return Array.isArray(a) ? a : a === undefined ? [] : [a]; };
  switch (name) {
    case "SUM": return err ?? nums().reduce((s, v) => s + v, 0);
    case "AVERAGE": { if (err) return err; const n = nums(); return n.length ? n.reduce((s, v) => s + v, 0) / n.length : "#DIV/0!"; }
    case "COUNT": return flat.filter((v) => typeof v === "number").length;
    case "COUNTA": return flat.filter((v) => v !== null && v !== "").length;
    case "MIN": return err ?? (nums().length ? Math.min(...nums()) : 0);
    case "MAX": return err ?? (nums().length ? Math.max(...nums()) : 0);
    case "IF": { const c = arg(0); if (isErr(c)) return c; return (typeof c === "boolean" ? c : toNum(c) !== 0) ? arg(1) : args.length > 2 ? arg(2) : false; }
    case "AND": return err ?? flat.every((v) => toNum(v) !== 0);
    case "OR": return err ?? flat.some((v) => toNum(v) !== 0);
    case "NOT": return err ?? toNum(arg(0)) === 0;
    case "ROUND": { const x = toNum(arg(0)); const d = toNum(arg(1)); if (isErr(x)) return x; if (isErr(d)) return d; return Math.round(x * 10 ** d) / 10 ** d; }
    case "ABS": { const x = toNum(arg(0)); return isErr(x) ? x : Math.abs(x); }
    case "COUNTIF": { const ok = criterion(arg(1)); return list(0).filter(ok).length; }
    case "SUMIF": {
      const ok = criterion(arg(1));
      const test = list(0);
      const add = args[2] === undefined ? test : list(2);
      return test.reduce<number>((s, v, k) => (ok(v) && typeof add[k] === "number" ? s + (add[k] as number) : s), 0);
    }
    case "TRIM": return show(arg(0)).trim().replace(/\s+/g, " ");
    case "UPPER": return show(arg(0)).toUpperCase();
    case "LOWER": return show(arg(0)).toLowerCase();
    case "LEN": return show(arg(0)).length;
    default: return "#NAME?";
  }
}

/** Evaluates one formula; `get` reads a cell's value. Ranges become lists inside functions. */
export function evalFormula(f: string, get: (a: string) => FVal): FVal {
  const ts = tokens(f);
  let i = 0;
  type V = FVal | FVal[];
  const peek = (): string | undefined => ts[i]?.v;
  const take = (v?: string): Tok => {
    const t = ts[i++];
    if (!t || (v !== undefined && t.v !== v)) throw new Error(`expected ${v ?? "more"} in ${f}`);
    return t;
  };
  const cells = (ref: string): FVal[] => {
    const [a, b = a] = ref.split(":") as [string, string?];
    const [c1, r1] = parseAddr(a);
    const [c2, rr] = parseAddr(b);
    const out: FVal[] = [];
    for (let r = Math.min(r1, rr); r <= Math.max(r1, rr); r++) for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c++) out.push(get(addr(c, r)));
    return out;
  };
  const one = (v: V): FVal => (Array.isArray(v) ? (v.length === 1 ? v[0]! : "#VALUE!") : v);
  const num = (v: V): number | string => toNum(one(v));
  const arith = (a: V, op: string, b: V): FVal => {
    const x = num(a);
    const y = num(b);
    if (isErr(x)) return x;
    if (isErr(y)) return y;
    return op === "+" ? x + y : op === "-" ? x - y : op === "*" ? x * y : op === "^" ? x ** y : y === 0 ? "#DIV/0!" : x / y;
  };
  const primary = (): V => {
    const t = take();
    if (t.k === "num") return Number(t.v);
    if (t.k === "str") return t.v;
    if (t.k === "bool") return t.v === "TRUE";
    if (t.k === "ref") return t.v.includes(":") ? cells(t.v) : get(t.v.replace(/\$/g, ""));
    if (t.k === "fn") {
      take("(");
      const args: V[] = [];
      if (peek() !== ")") { args.push(cmp()); while (peek() === "," || peek() === ";") { take(); args.push(cmp()); } }
      take(")");
      return call(t.v, args);
    }
    if (t.v === "(") { const v = cmp(); take(")"); return v; }
    if (t.v === "-") return arith(0, "-", primary());
    if (t.v === "+") return primary();
    throw new Error(`unexpected ${t.v} in ${f}`);
  };
  const level = (next: () => V, ops: string[]): (() => V) => () => {
    let a = next();
    while (ops.includes(peek() ?? "")) { const op = take().v; a = arith(a, op, next()); }
    return a;
  };
  const pow = level(primary, ["^"]);
  const mul = level(pow, ["*", "/"]);
  const add = level(mul, ["+", "-"]);
  const cat = (): V => {
    let a = add();
    while (peek() === "&") { take(); const x = one(a); const b = one(add()); a = isErr(x) ? x : isErr(b) ? b : `${show(x)}${show(b)}`; }
    return a;
  };
  function cmp(): V {
    const a = cat();
    const op = peek();
    if (!op || !["=", "<>", "<", ">", "<=", ">="].includes(op)) return a;
    take();
    return compare(one(a), op, one(cat()));
  }
  const v = one(cmp());
  if (i < ts.length) throw new Error(`unexpected ${ts[i]!.v} in ${f}`);
  return v;
}

/** A copy of the cells with every formula's value worked out (`v`), rounded to two decimals. */
export function sheetEval(cells: Cells): Cells {
  const out: Cells = JSON.parse(JSON.stringify(cells));
  const done = new Map<string, FVal>();
  const busy = new Set<string>();
  const get = (a: string): FVal => {
    if (done.has(a)) return done.get(a)!;
    const c = out[a];
    if (!c) return null;
    if (!c.f) return c.v ?? (typeof c.t === "string" ? c.t : c.t ? Object.values(c.t)[0]! : null);
    if (busy.has(a)) return "#REF!";
    busy.add(a);
    let v: FVal;
    try { v = evalFormula(c.f, get); } catch { v = "#NAME?"; }
    busy.delete(a);
    if (typeof v === "number") v = r2(v);
    done.set(a, v);
    return v;
  };
  for (const [a, c] of Object.entries(out)) if (c.f) { const v = get(a); c.v = typeof v === "boolean" ? (v ? "TRUE" : "FALSE") : v; }
  return out;
}

/** A formula with its relative references moved by columns and rows (absolute ones, with $, stay). */
export function shiftFormula(f: string, dc: number, dr: number): string {
  return f.split(/("[^"]*")/).map((part, i) => (i % 2 ? part : part.replace(/(^|[^A-Z$])(\$?)([A-Z])(\$?)(\d+)(?![\d(])/g,
    (_, pre: string, cAbs: string, col: string, rAbs: string, row: string) =>
      `${pre}${cAbs}${cAbs ? col : String.fromCharCode(col.charCodeAt(0) + dc)}${rAbs}${rAbs ? row : Number(row) + dr}`))).join("");
}

/**
 * Fills a formula down (or across) from one cell to another, as dragging the fill handle does: each copy's
 * references move with it, and copy k appears at frame `at + (k − 1) · step`. Returns the cells (evaluated) and the
 * selection frame by frame (the source cell, then each copy as it appears).
 */
export function sheetFill(cells: Cells, from: string, to: string, o: { at?: number; step?: number } = {}): { cells: Cells; frames: string[] } {
  const src = cells[from];
  if (!src?.f) throw new Error(`sheetFill: ${from} has no formula`);
  const [c0, r0] = parseAddr(from);
  const [c1, r1] = parseAddr(to);
  if (c0 !== c1 && r0 !== r1) throw new Error("sheetFill: fill down a column or across a row");
  const at = o.at ?? 1;
  const step = o.step ?? 1;
  const out: Cells = { ...cells };
  const frames: string[] = range(Math.max(1, at)).map(() => from);
  const n = Math.max(Math.abs(c1 - c0), Math.abs(r1 - r0));
  for (let k = 1; k <= n; k++) {
    const dc = Math.sign(c1 - c0) * k;
    const dr = Math.sign(r1 - r0) * k;
    const a = addr(c0 + dc, r0 + dr);
    const when = at + (k - 1) * step;
    out[a] = { ...(cells[a] ?? {}), f: shiftFormula(src.f, dc, dr), ...(when > 0 ? { at: when } : {}), ...(src.b ? { b: true } : {}) };
    while (frames.length < when) frames.push(frames[frames.length - 1]!);
    frames[when] = a;
  }
  return { cells: sheetEval(out), frames };
}

/** Cells from rows of values (row 1 first): text per language, numbers, null for blank; formulas by address. */
export function sheetCells(rows: (DataValue | Text)[][], formulas: Record<string, string> = {}, o: { boldFirst?: boolean } = {}): Cells {
  const cells: Cells = {};
  rows.forEach((r, ri) => r.forEach((v, ci) => {
    if (v === null || v === "") return;
    const c: SheetCell = typeof v === "object" ? { t: v } : { v };
    if (ri === 0 && o.boldFirst !== false) c.b = true;
    cells[addr(ci, ri)] = c;
  }));
  for (const [a, f] of Object.entries(formulas)) cells[a] = { ...(cells[a] ?? {}), f };
  return sheetEval(cells);
}

/** Levenshtein distance, for typos. */
function distance(a: string, b: string): number {
  const d = range(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0]!;
    d[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const t = d[j]!;
      d[j] = Math.min(d[j]! + 1, d[j - 1]! + 1, prev + (a[i - 1]!.toLowerCase() === b[j - 1]!.toLowerCase() ? 0 : 1));
      prev = t;
    }
  }
  return d[b.length]!;
}

/**
 * Finds what needs cleaning in the data rows (row 2 down, row 1 being headers): blanks, values that aren't in a
 * column's `known` list (a typo is fixed to the nearest known value, two letters off at most), and rows typed twice
 * (struck out). Fixes come one per frame from `at` (default 1), down the rows; the selection visits each. Blanks and
 * unknown values stay marked: a person has to find the real value.
 */
export function cleanSheet(cells: Cells, size: { cols: number; rows: number }, o: { known?: Record<string, string[]>; at?: number; labels?: Partial<Record<SheetIssue["kind"], Text>> } = {}): { cells: Cells; issues: SheetIssue[]; frames: (string | null)[] } {
  const out: Cells = JSON.parse(JSON.stringify(cells));
  const issues: SheetIssue[] = [];
  const frames: (string | null)[] = [null];
  let at = o.at ?? 1;
  const label = (k: SheetIssue["kind"]): { label?: Text } => (o.labels?.[k] ? { label: o.labels[k] } : {});
  const fix = (cell: string): number => {
    while (frames.length < at) frames.push(frames[frames.length - 1] ?? null);
    frames[at] = cell;
    return at++;
  };
  const seen = new Set<string>();
  for (let r = 1; r < size.rows; r++) {
    const vals = range(size.cols).map((c) => out[addr(c, r)]?.v ?? null);
    if (vals.every((v) => v === null)) continue;
    const key = JSON.stringify(vals);
    if (seen.has(key)) {
      const when = fix(addr(0, r));
      for (let c = 0; c < size.cols; c++) if (out[addr(c, r)]) out[addr(c, r)]!.out = when;
      issues.push({ cells: `${addr(0, r)}:${addr(size.cols - 1, r)}`, kind: "dup", ...label("dup"), fixed: when });
      continue;
    }
    seen.add(key);
    for (let c = 0; c < size.cols; c++) {
      const a = addr(c, r);
      const v = vals[c];
      if (v === null) { issues.push({ cells: a, kind: "blank", ...label("blank") }); continue; }
      const known = o.known?.[String.fromCharCode(65 + c)];
      if (!known || typeof v !== "string" || known.includes(v)) continue;
      const best = [...known].sort((x, y) => distance(v, x) - distance(v, y))[0];
      if (best !== undefined && distance(v, best) <= 2) {
        const when = fix(a);
        out[a]!.to = { at: when, v: best };
        issues.push({ cells: a, kind: "typo", ...label("typo"), fixed: when });
      } else issues.push({ cells: a, kind: "bad", ...label("bad") });
    }
  }
  return { cells: out, issues, frames };
}

/** A sheet element. */
export function sheet(box: Box, cells: Cells, o: { cols: number; rows: number; frames?: (string | null)[]; issues?: SheetIssue[]; words?: Record<string, Text>; widths?: number[]; bar?: boolean; size?: number }): SheetElement {
  return {
    ...box, type: "sheet", cols: o.cols, rows: o.rows, cells,
    ...(o.frames ? { frames: o.frames } : {}), ...(o.issues?.length ? { issues: o.issues } : {}), ...(o.words ? { words: o.words } : {}),
    ...(o.widths ? { widths: o.widths } : {}), ...(o.bar === false ? { bar: false } : {}), ...(o.size ? { size: o.size } : {}),
  };
}

/* ---------- ready-made elements ---------- */

/** A rain-gauge pipeline: collect, check, clean, save; record 3 is bad (below zero). */
export function etlPipeline(box: Box, langs: string[] = ["en", "ar"], o: { mode?: "batch" | "stream"; fix?: "retry" | "aside"; records?: number } = {}): PipelineElement {
  const T = (en: string, ar: string): Text => tx(en, ar, langs);
  return pipeline(box, {
    stages: [
      { id: "collect", label: T("Collect", "جمع"), icon: "wifi", kind: "source" },
      { id: "check", label: T("Check", "فحص"), icon: "shield", kind: "check" },
      { id: "clean", label: T("Clean", "تنظيف"), icon: "spark" },
      { id: "save", label: T("Save", "حفظ"), icon: "data", kind: "store" },
    ],
    records: o.records ?? 8, mode: o.mode ?? "stream", bad: [3], fix: o.fix ?? "aside",
  }, o.fix === "retry" ? {} : { aside: T("Set aside", "جانبًا") });
}

/** Term marks with an average formula filled down; `last` is the fill's last frame. */
export function marksSheet(box: Box, langs: string[] = ["en", "ar"]): { el: SheetElement; last: number } {
  const T = (en: string, ar: string): Text => tx(en, ar, langs);
  const base = sheetCells([
    [T("Name", "الاسم"), T("Term 1", "الفصل 1"), T("Term 2", "الفصل 2"), T("Average", "المتوسط")],
    ["Amina", 78, 84, null], ["Joseph", 45, 61, null], ["Salma", 91, 88, null], ["Musa", 62, 57, null], ["Farah", 55, 70, null],
  ], { D2: "=AVERAGE(B2:C2)" });
  const { cells, frames } = sheetFill(base, "D2", "D6", { at: 1 });
  return { el: sheet(box, cells, { cols: 4, rows: 6, frames, words: dataWords(langs) }), last: frames.length - 1 };
}

/** Market prices with a typo, a blank and a repeated row, cleaned; `fixes` are the frames of the two fixes. */
export function pricesSheet(box: Box, langs: string[] = ["en", "ar"]): { el: SheetElement; fixes: number[] } {
  const T = (en: string, ar: string): Text => tx(en, ar, langs);
  const raw = sheetCells([
    [T("Market", "السوق"), T("Item", "السلعة"), T("Price", "السعر")],
    ["North", "Rice", 40], ["North", "Tomatos", 25], ["South", "Beans", null], ["South", "Rice", 38], ["South", "Rice", 38], ["East", "Beans", 33],
  ]);
  const { cells, issues, frames } = cleanSheet(raw, { cols: 3, rows: 7 }, {
    known: { A: ["North", "South", "East"], B: ["Rice", "Beans", "Tomatoes", "Onions"] },
    labels: { typo: T("Typo", "خطأ إملائي"), blank: T("Blank", "خانة فارغة"), dup: T("Typed twice", "مكرر") },
  });
  const words: Record<string, Text> = {
    North: T("North", "الشمال"), South: T("South", "الجنوب"), East: T("East", "الشرق"),
    Rice: T("Rice", "أرز"), Beans: T("Beans", "فول"), Tomatoes: T("Tomatoes", "طماطم"), Tomatos: T("Tomatos", "طمامط"),
  };
  return { el: sheet(box, cells, { cols: 3, rows: 7, frames, issues, words }), fixes: issues.filter((i) => i.fixed !== undefined).map((i) => i.fixed!) };
}

/**
 * The preset queries, computed by `queryStages(PRESET_SQL[k], setupSql(PRESET_SETUP[k]))` and kept here so presets
 * work in the browser without sql.js. A test recomputes them and fails if they drift.
 */
export const PRESET_SQL = {
  top: "SELECT name, mark\nFROM results\nWHERE mark >= 50\nORDER BY mark DESC\nLIMIT 3",
  avg: "SELECT class, AVG(mark)\nFROM students\nJOIN marks ON student_id = id\nGROUP BY class",
};
export const PRESET_SETUP: Record<keyof typeof PRESET_SQL, string[]> = { top: ["results"], avg: ["students", "marks"] };
export const PRESET_QUERIES: Record<keyof typeof PRESET_SQL, QueryData> = {
  top: {"sql":"SELECT name, mark\nFROM results\nWHERE mark >= 50\nORDER BY mark DESC\nLIMIT 3","grids":[{"name":"results","cols":["name","class","mark"],"rows":[["Amina","5A",78],["Joseph","5B",45],["Salma","5A",91],["Musa","5B",62],["Farah","5A",55],["Omar","5B",38],["Laila","5B",84]]},{"cols":["name","mark"],"rows":[["Amina",78],["Salma",91],["Musa",62],["Farah",55],["Laila",84]]}],"steps":[{"kind":"from","lines":[1],"views":[{"g":0,"rows":[0,1,2,3,4,5,6]}]},{"kind":"where","lines":[2],"views":[{"g":0,"rows":[0,1,2,3,4,5,6],"out":[1,5],"lit":[2]}]},{"kind":"select","lines":[0],"views":[{"g":0,"rows":[0,2,3,4,6],"lit":[0,2],"dim":[1]}]},{"kind":"select","lines":[0],"views":[{"g":1,"rows":[0,1,2,3,4]}]},{"kind":"order","lines":[3],"views":[{"g":1,"rows":[1,4,0,2,3],"sort":[[1,"desc"]],"lit":[1]}]},{"kind":"limit","lines":[4],"views":[{"g":1,"rows":[1,4,0,2,3],"out":[2,3],"cut":3,"sort":[[1,"desc"]]}]},{"kind":"result","lines":[],"views":[{"g":1,"rows":[1,4,0],"sort":[[1,"desc"]]}]}]},
  avg: {"sql":"SELECT class, AVG(mark)\nFROM students\nJOIN marks ON student_id = id\nGROUP BY class","grids":[{"name":"students","cols":["id","name","class"],"rows":[[1,"Amina","5A"],[2,"Joseph","5B"],[3,"Salma","5A"],[4,"Musa","5B"],[5,"Omar","5B"]]},{"name":"marks","cols":["student_id","subject","mark"],"rows":[[3,"Maths",91],[1,"Maths",78],[4,"Maths",62],[2,"Maths",45],[1,"Science",84]]},{"cols":["id","name","class","student_id","subject","mark"],"split":3,"rows":[[1,"Amina","5A",1,"Maths",78],[1,"Amina","5A",1,"Science",84],[2,"Joseph","5B",2,"Maths",45],[3,"Salma","5A",3,"Maths",91],[4,"Musa","5B",4,"Maths",62]]},{"cols":["class","AVG(mark)"],"rows":[["5A",84.33],["5B",53.5]]}],"steps":[{"kind":"from","lines":[1],"views":[{"g":0,"rows":[0,1,2,3,4]}]},{"kind":"join","lines":[2],"views":[{"g":0,"rows":[0,1,2,3,4],"lit":[0],"out":[4]},{"g":1,"rows":[0,1,2,3,4],"lit":[0]}],"links":[[0,1],[0,4],[1,3],[2,0],[3,2]]},{"kind":"join","lines":[2],"views":[{"g":2,"rows":[0,1,2,3,4]}]},{"kind":"group","lines":[3],"views":[{"g":2,"rows":[0,1,3,2,4],"groups":[0,0,0,1,1],"lit":[2]}]},{"kind":"select","lines":[0],"views":[{"g":2,"rows":[0,1,3,2,4],"groups":[0,0,0,1,1],"lit":[2,5],"dim":[0,1,3,4]}]},{"kind":"select","lines":[0],"views":[{"g":3,"rows":[0,1],"groups":[0,1]}]},{"kind":"result","lines":[],"views":[{"g":3,"rows":[0,1]}]}]},
};

/** A sensible element of each of the pack's types, for "Add a pack element". */
export function element(type: string, langs: string[] = ["en", "ar"], box: Box = { id: type, x: 60, y: 150, w: 1160, h: 530 }): Element {
  switch (type) {
    case "erd": return erdSchema("school", box, langs);
    case "query": return queryElement(box, PRESET_QUERIES.top, { words: dataWords(langs) });
    case "pipeline": return etlPipeline(box, langs);
    case "sheet": return marksSheet(box, langs).el;
    default: throw new Error(`the data pack has no ${type}`);
  }
}

/* ---------- presets: gallery scenes ---------- */

const STAGES: Record<Orient, [number, number]> = { landscape: [1280, 720], portrait: [720, 1280], square: [1080, 1080] };

/** The headline and the body box of a scene on a stage. */
function layout(stage: Orient): { head: { x: number; y: number; w: number; size: number }; body: (id: string) => Box } {
  const [W, H] = STAGES[stage];
  const m = stage === "portrait" ? 40 : 50;
  const top = stage === "portrait" ? 230 : 140;
  return {
    head: { x: m, y: stage === "portrait" ? 100 : 44, w: W - 2 * m, size: 46 },
    body: (id) => ({ id, x: m, y: top, w: W - 2 * m, h: H - top - (stage === "portrait" ? 170 : 30) }),
  };
}

const word = (w: Text, offset = 0, occurrence = 1): When => ({ word: w, ...(occurrence > 1 ? { occurrence } : {}), ...(offset ? { offset } : {}) });

/** Brings `n` parts in, part k between its word and 0.6 s later. */
function partsOn(words: Text[]): Track {
  const n = words.length;
  const keys: Key[] = [{ at: 0, value: 0 }];
  words.forEach((w, k) => keys.push({ at: word(w), value: k / n, ease: "linear" }, { at: word(w, 0.6), value: (k + 1) / n, ease: "out" }));
  return { prop: "reveal", keys };
}

/** The value jumps at each moment. */
const stepsOn = (prop: "focus" | "frame", at: [When, number][]): Track => ({ prop, keys: at.map(([w, v]) => ({ at: w, value: v, ease: "step" as const })) });

/** Moves smoothly to each value, arriving on its moment, from 0 at `first`. */
const movesOn = (prop: "frame", first: When, at: [When, number][]): Track => ({ prop, keys: [{ at: first, value: 0 }, ...at.map(([w, v]) => ({ at: w, value: v, ease: "in-out" as const }))] });

const fadeIn = (at: When = 0, dur = 1): Track => ({ prop: "reveal", keys: [{ at, value: 0 }, { at: typeof at === "number" ? at + dur : { ...at, offset: (at.offset ?? 0) + dur }, value: 1, ease: "out" }] });

function canvas(id: string, narration: Text, head: Text, stage: Orient, els: Element[]): Scene {
  const L = layout(stage);
  return {
    id, template: "canvas", narration: narration as Record<string, string>,
    content: { elements: [{ id: "h", type: "text", x: L.head.x, y: L.head.y, w: L.head.w, size: L.head.size, weight: 800, text: head }, ...els] },
  };
}

/** Gallery scenes for the studio: an id, a name per language, and a scene laid out for the stage. */
export function presets(langs: string[] = ["en", "ar"], stage: Orient = "landscape"): { id: string; name: Text; scene: Scene }[] {
  const T = (en: string, ar: string): Text => tx(en, ar, langs);
  const L = layout(stage);
  const out: { id: string; name: Text; scene: Scene }[] = [];
  const add = (id: string, name: Text, narration: Text, head: Text, els: Element[]): void => { out.push({ id, name, scene: canvas(id, narration, head, stage, els) }); };
  const top = stage === "portrait" ? { layout: "top" as const } : {};

  // An ERD: the tables come in as they are named, then each relationship lights.
  const erd = erdSchema("school", L.body("erd"), langs);
  erd.anim = [
    partsOn([T("students", "الطلاب"), T("marks", "درجاتهم"), T("subjects", "المواد")]),
    stepsOn("focus", [[word(T("many", "كثيرة")), 4], [word(T("points", "تشير")), 5]]),
  ];
  add("erd-school", T("Tables and how they link", "الجداول وكيف ترتبط"), T(
    "A school keeps its students in one table, their marks in a second, and the subjects in a third. One student has many marks, and each mark points to its subject.",
    "تحفظ المدرسة الطلاب في جدول، ودرجاتهم في جدول ثانٍ، والمواد في جدول ثالث. للطالب الواحد درجات كثيرة، وكل درجة تشير إلى مادتها.",
  ), T("A school database", "قاعدة بيانات مدرسة"), [erd]);

  // A query: WHERE, SELECT, ORDER BY and LIMIT, each on the word that names it.
  const qt = PRESET_QUERIES.top;
  const q1 = queryElement(L.body("q"), qt, { words: dataWords(langs), ...top });
  const read = word(T("table", "الجدول"), 0.4);
  q1.anim = [
    fadeIn(0, 1.2),
    movesOn("frame", read, [[word("WHERE", 0.2), queryFrame(qt, "where")], [word("SELECT", 0.2), queryFrame(qt, "select")], [word("SELECT", 1.4), queryFrame(qt, "select") + 1],
      [word("ORDER", 0.2), queryFrame(qt, "order")], [word("LIMIT", 0.2), queryFrame(qt, "limit")], [word(T("three", "ثلاث"), 0.5), queryFrame(qt, "result")]]),
  ];
  add("query-top", T("A query, step by step", "استعلام خطوة بخطوة"), T(
    "The database reads the table first. WHERE keeps the marks of fifty or more. SELECT picks the name and the mark. ORDER BY puts the highest first, and LIMIT keeps the top three.",
    "تقرأ قاعدة البيانات الجدول أولًا. يُبقي WHERE الدرجات من خمسين فأكثر. ويختار SELECT الاسم والدرجة. ثم يضع ORDER BY الأعلى أولًا، ويُبقي LIMIT أعلى ثلاث.",
  ), T("The top three", "أعلى ثلاث درجات"), [q1]);

  // A join and a group: the rows of two tables meet, then gather by class.
  const qa = PRESET_QUERIES.avg;
  const q2 = queryElement(L.body("q"), qa, { words: dataWords(langs), ...top });
  q2.anim = [
    fadeIn(0, 1.2),
    movesOn("frame", word(T("students.", "الطلاب."), 0.3), [[word("JOIN", 0.2), queryFrame(qa, "join")], [word("JOIN", 1.9), queryFrame(qa, "join") + 1],
      [word("GROUP", 0.2), queryFrame(qa, "group")], [word(T("average", "متوسط")), queryFrame(qa, "select")], [word(T("average", "متوسط"), 1.4), queryFrame(qa, "select") + 1],
      [word(T("class.", "فصل."), 0.4, 2), queryFrame(qa, "result")]]),
  ];
  add("query-join", T("Join and group", "الربط والتجميع"), T(
    "Start with the students. JOIN matches each mark to its student. GROUP BY gathers the rows by class, and the average is worked out for each class.",
    "نبدأ بجدول الطلاب. يطابق JOIN كل درجة مع طالبها. ثم يجمع GROUP BY الصفوف حسب الفصل، ويُحسب متوسط كل فصل.",
  ), T("Average mark per class", "متوسط الدرجات لكل فصل"), [q2]);

  // A pipeline: readings flow one by one; the check catches a bad one and sets it aside.
  const p = etlPipeline(L.body("p"), langs);
  p.anim = [
    fadeIn(0, 1),
    { prop: "frame", keys: [{ at: word(T("one", "واحدة")), value: 0 }, { at: word(T("saved.", "ويُحفظ."), 0.8), value: pipelineEnd(p), ease: "linear" }] },
    stepsOn("focus", [[0, 0], [word(T("check", "الفحص")), 2], [word(T("rest", "الباقي")), 0]]),
  ];
  add("pipeline-etl", T("A data pipeline", "خط بيانات"), T(
    "Rain readings arrive one by one. The check catches a reading below zero and sets it aside. The rest are cleaned and saved.",
    "تصل قراءات المطر واحدة تلو الأخرى. يكتشف الفحص قراءة أقل من الصفر ويضعها جانبًا. أما الباقي فيُنظَّف ويُحفظ.",
  ), T("From gauge to database", "من المقياس إلى قاعدة البيانات"), [p]);

  // A spreadsheet: one formula, filled down.
  const m = marksSheet(L.body("s"), langs);
  m.el.anim = [
    fadeIn(0, 1),
    { prop: "frame", keys: [{ at: word(T("fill", "اسحبها")), value: 0 }, { at: word(T("average.", "المتوسطات."), 0.6), value: m.last, ease: "linear" }] },
  ];
  add("sheet-fill", T("A formula, filled down", "معادلة تُسحب إلى الأسفل"), T(
    "Type the formula once, in the first row. Then fill it down, and the sheet works out every average.",
    "اكتب المعادلة مرة واحدة في الصف الأول. ثم اسحبها إلى الأسفل، فيحسب الجدول كل المتوسطات.",
  ), T("Every average in one move", "كل المتوسطات بحركة واحدة"), [m.el]);

  // A spreadsheet cleaned: a typo, a blank and a repeated row.
  const c = pricesSheet(L.body("s"), langs);
  const fix = T("fix", "نصحح");
  const drop = T("remove", "ونحذف");
  c.el.anim = [
    fadeIn(0, 1),
    stepsOn("focus", [[0, 0], [word(T("typo", "إملائي")), 1], [word(T("blank", "فارغ")), 2], [word(T("twice.", "مرتين.")), 3], [word(fix), 0]]),
    { prop: "frame", keys: [{ at: word(fix), value: 0 }, { at: word(fix, 0.6), value: c.fixes[0]! }, { at: word(drop), value: c.fixes[0]! }, { at: word(drop, 0.6), value: c.fixes[1]! }] },
  ];
  add("sheet-clean", T("Cleaning data", "تنظيف البيانات"), T(
    "Before we count anything, we clean the data. Here is a typo, a blank price, and a row typed twice. We fix the typo and remove the repeated row.",
    "قبل أن نحسب أي شيء، ننظف البيانات. هنا خطأ إملائي، وسعر فارغ، وصف مكتوب مرتين. نصحح الخطأ ونحذف الصف المكرر.",
  ), T("Clean before you count", "نظّف قبل أن تحسب"), [c.el]);
  return out;
}
