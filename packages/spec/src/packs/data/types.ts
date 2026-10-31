/**
 * Data pack: the element types `erd`, `query`, `pipeline`, `sheet` (docs/packs/data.md).
 * Each interface extends PackElementBase and has `type` set to one of them. Everything a learner watches is computed
 * when the lesson is made (packages/ops/src/packs/data.ts: the query really runs in sql.js, the formulas are
 * evaluated, the records' routes are planned); the phone only draws it.
 */
import type { CoreIcon, Text, Tone } from "../../types.ts";
import type { PackElementBase } from "../base.ts";

/** A value in a table or a spreadsheet cell: text as stored, a number, or empty (null). */
export type DataValue = string | number | null;

/* ---------- erd: an entity-relationship diagram ---------- */

export interface ErdColumn {
  /** The column's name, as in the database (left to right in every language). */
  name: string;
  /** Its type ("INT", "TEXT", "DATE"). */
  type?: string;
  /** A primary key, a foreign key, or both. */
  key?: "pk" | "fk" | "pkfk";
}

export interface ErdTable {
  /** The table's name, as in the database: /^[A-Za-z_][A-Za-z0-9_]{0,39}$/, unique. Relationships name it. */
  name: string;
  /** What it holds, in the lesson's language ("Students", «الطلاب»), under the name. */
  label?: Text;
  cols: ErdColumn[];
  tone?: Tone;
}

/** How many rows of each table meet: one to one, one to many (from is the "one" side), many to many. */
export type ErdKind = "1-1" | "1-n" | "n-n";

export interface ErdRel {
  from: string;
  to: string;
  kind: ErdKind;
  /** The foreign key in `to` that points at `from` (the line meets that column). */
  via?: string;
  /** A verb on the line ("has", «لديه»). */
  label?: Text;
}

/**
 * Tables with their columns (keys marked, types beside them) and relationships with crow's feet, laid out
 * automatically from the first table along its relationships. `reveal` brings the tables in one by one (each line once
 * both its tables are in), `focus` lights table n (in `tables` order), then relationship n − tables. Table positions
 * mirror in right-to-left languages unless `fixed`; names and types stay left to right.
 */
export interface ErdElement extends PackElementBase {
  type: "erd";
  tables: ErdTable[];
  rels?: ErdRel[];
  /** Show the columns' types (default: when any column has one). */
  types?: boolean;
  /** Text size in stage pixels (default 32; smaller when the tables wouldn't fit). */
  size?: number;
}

/* ---------- query: a SQL query, step by step ---------- */

/** A table the query reads or makes: the source tables, the rows they make together, the result. */
export interface QueryGrid {
  name?: string;
  cols: string[];
  rows: DataValue[][];
  /** In the rows a join makes, the first column that comes from the second table (a line marks the seam). */
  split?: number;
}

/** What one grid shows in a step. */
export interface QueryView {
  /** The grid (index into `grids`). */
  g: number;
  /** Its rows on screen, top to bottom (others are hidden). */
  rows: number[];
  /** Rows (of `rows`) this step throws away: they fade and are struck out. */
  out?: number[];
  /** The group of each row in `rows` (GROUP BY): groups stand apart, each with its colour. */
  groups?: number[];
  /** Columns this step uses (lit), columns not picked (dimmed), columns gone (hidden). */
  lit?: number[];
  dim?: number[];
  hide?: number[];
  /** The sort: column and direction, in order. */
  sort?: [number, "asc" | "desc"][];
  /** The rows past this many are cut (LIMIT). */
  cut?: number;
}

export type QueryStepKind = "from" | "join" | "where" | "group" | "having" | "select" | "distinct" | "order" | "limit" | "result";

export interface QueryStep {
  kind: QueryStepKind;
  /** The SQL's lines this step runs (from 0), lit in the SQL. */
  lines: number[];
  /** One grid, or the two source tables of a join. */
  views: QueryView[];
  /** A join's matches: row of views[0]'s grid with row of views[1]'s grid. */
  links?: [number, number][];
}

/**
 * A SQL query, step by step, in the order the database runs it (FROM, JOIN, WHERE, GROUP BY, HAVING, SELECT,
 * DISTINCT, ORDER BY, LIMIT, then the result), each step lighting its clause in the SQL. Computed when the lesson is
 * made by running the query in sql.js (`queryStages` in ops). `frame` is the step (fractions move the rows between
 * steps), `reveal` writes the SQL line by line and then brings the tables in, `focus` lights SQL line n. The SQL and
 * the column names stay left to right; the tables' columns follow the lesson's language, and the layout mirrors
 * unless `fixed`.
 */
export interface QueryElement extends PackElementBase {
  type: "query";
  /** The SQL as shown, one clause per line. */
  sql: string;
  grids: QueryGrid[];
  steps: QueryStep[];
  /** How values are shown in each language ({ "Amina": { "en": "Amina", "ar": "أمينة" } }). */
  words?: Record<string, Text>;
  /** The SQL beside the tables (default in a wide box) or above them. */
  layout?: "side" | "top";
  /** Frame shown when no track moves it (default 0). */
  frame?: number;
  size?: number;
}

/* ---------- pipeline: records flowing through stages ---------- */

export interface PipeStage {
  /** /^[A-Za-z0-9_-]{1,40}$/, unique in the element. */
  id: string;
  label: Text;
  icon?: CoreIcon;
  /** "source" and "store" are drawn as data stores, "check" with a shield. */
  kind?: "source" | "step" | "check" | "store";
  tone?: Tone;
}

/** One waypoint: at `frame`, the record is at stage `stage` (or, with a third value 1, in that stage's set-aside tray). */
export type PipeWaypoint = [frame: number, stage: number] | [frame: number, stage: number, aside: 1];

export interface PipeRecord {
  /** Where the record is over time, in order of frame. Between waypoints it travels the arrow between the stages. */
  path: PipeWaypoint[];
  /** From this frame it shows as caught (danger). */
  bad?: number;
  /** From this frame it shows as fixed (ok). */
  ok?: number;
}

/**
 * A data pipeline: stages (extract, transform, load, or any DAG) with arrows, records flowing through as dots, a
 * counter on each stage, and a bad record caught at a check, then retried or set aside. The routes and counters are
 * planned when the lesson is made (`pipelineFrames` in ops). `frame` is the time (one hop along an arrow takes one
 * frame); `pass` from 0 to 1 plays the whole run instead; `reveal` brings the stages in along the flow; `focus` lights stage n. Mirrors in
 * right-to-left languages unless `fixed`.
 */
export interface PipelineElement extends PackElementBase {
  type: "pipeline";
  stages: PipeStage[];
  /** Arrows, [from, to] by stage id (no loops). */
  edges: [string, string][];
  records: PipeRecord[];
  /**
   * The counters, frame by frame: frames[k] has one count per stage (records that reached it by frame k), then the
   * set-aside tray's. A fractional frame shows the frame before it, so arrivals belong on whole frames.
   */
  frames: number[][];
  /** Batch: records travel together; stream: one after another (shown on the source). */
  mode?: "batch" | "stream";
  /** The set-aside tray's label ("Set aside", «جانبًا»). */
  aside?: Text;
  /** A counter on each stage (default true). */
  counts?: boolean;
  /** Frame shown when no track moves it (default 0). */
  frame?: number;
  size?: number;
}

/* ---------- sheet: a spreadsheet ---------- */

export interface SheetCell {
  /** The value shown (a formula's value is computed when the lesson is made). */
  v?: DataValue;
  /** Text per language instead of `v` (headers, labels). */
  t?: Text;
  /** A formula ("=SUM(B2:B6)"), shown in the formula bar when the cell is selected. */
  f?: string;
  /** The frame it appears at (a formula filling down); default 0. */
  at?: number;
  /** Its value changes at a frame: a typo corrected, a blank filled. */
  to?: { at: number; v?: DataValue; t?: Text };
  /** Struck out from this frame (a duplicate removed). */
  out?: number;
  /** Bold (headers, totals). */
  b?: boolean;
}

/** A problem in the data, outlined: a typo, a blank, a duplicate row, a wrong value. */
export interface SheetIssue {
  /** "B4", or a range "A5:C5". */
  cells: string;
  kind: "typo" | "blank" | "dup" | "bad";
  /** Shown beside it while it's lit. */
  label?: Text;
  /** From this frame it's fixed: the outline turns ok. */
  fixed?: number;
}

/**
 * A spreadsheet: column letters and row numbers, values and formulas, the selected cell and the formula bar. `frame`
 * moves through `frames` (the selected cell per frame) and shows the cells that appear (`at`), change (`to`) or go
 * (`out`) by then: a formula filling down, a column cleaned. `reveal` fills the rows in from the top, `focus` lights
 * issue n. Right-to-left lessons run right to left, as spreadsheets do there (column A on the right); numbers and
 * formulas stay left to right inside their cells.
 */
export interface SheetElement extends PackElementBase {
  type: "sheet";
  cols: number;
  rows: number;
  /** By address: "A1", "B2"… */
  cells: Record<string, SheetCell>;
  /** Column widths in stage pixels (else from what they hold). */
  widths?: number[];
  /** The selected cell, frame by frame (frame k selects frames[k], null for none; after the last, the last). */
  frames?: (string | null)[];
  issues?: SheetIssue[];
  /** The formula bar (default true). */
  bar?: boolean;
  /** How text values, and "…" text in formulas, are shown in each language. */
  words?: Record<string, Text>;
  /** Frame shown when no track moves it (default 0). */
  frame?: number;
  size?: number;
}

export type DataPackElement = ErdElement | QueryElement | PipelineElement | SheetElement;
export type { PackElementBase };
