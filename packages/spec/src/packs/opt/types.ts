/**
 * Optimization pack: the element types `graph`, `schedule`, `knapsack`, `lp`, `searchtree` (docs/packs/opt.md).
 * Each interface extends PackElementBase and has `type` set to one of them. Everything an element shows at a step is
 * stored in it (computed when the lesson is made, packages/ops/src/packs/opt.ts); the phone only draws.
 */
import type { Text, Tone } from "../../types.ts";
import type { PackElementBase } from "../base.ts";

/* ---------- graph: a weighted graph on a map, stepped through an algorithm ---------- */

/** A place. Positions are map units, y up (north), as on a map; the map is fitted to the box and never mirrored. */
export interface GraphNode {
  x: number;
  y: number;
  /** Its name, outside the dot (top, bottom, left or right; default bottom). */
  label?: Text;
  at?: "t" | "b" | "l" | "r";
  /** "square" for the school or the depot. */
  shape?: "circle" | "square";
}
/**
 * A road between nodes a and b (indexes), with its length or cost; `curve` bends it (a share of its length) and `pos`
 * moves its length along it (0–1, default 0.5), to keep labels apart.
 */
export interface GraphEdge { a: number; b: number; w?: number; curve?: number; pos?: number }
/**
 * One step of an algorithm. Node states, one letter per node: `.` idle, `f` waiting (on the frontier), `c` chosen now,
 * `v` done (settled, visited), `p` on the answer. Edge states, one per edge: `.` idle, `c` checked now, `t` taken (in
 * the tree), `p` on the answer, `x` refused or closed (dashed), `o` a clash, `-` dimmed.
 */
export interface GraphFrame {
  nodes?: string;
  edges?: string;
  /** A number or short word in each node (a tentative distance, "∞", a slot); null leaves it empty. */
  vals?: (number | string | null)[];
  /** Colour groups, one per node: 0 none, 1–6 (exam slots). */
  colours?: number[];
  /** A route or path drawn over the map (node indexes in order); `loop` closes it. `pass` drives a bus along it. */
  path?: number[];
  loop?: boolean;
  /** Pairs of nodes: roads being taken out (dashed, danger) and put in (ok), as in a 2-opt swap. */
  cut?: [number, number][];
  added?: [number, number][];
  /** The running total (a length, a cost, slots used) and what this step does, in the strip under the map. */
  total?: number;
  note?: Text;
}
export interface GraphElement extends PackElementBase {
  type: "graph";
  nodes: GraphNode[];
  edges?: GraphEdge[];
  /** Write each edge's `w` on it (default: yes, when edges have one). */
  weights?: boolean;
  /** "keep" (default): the map keeps its shape, for distances as the crow flies. "fill": stretched to the box, for road maps whose lengths are written on the roads. */
  fit?: "keep" | "fill";
  frames?: GraphFrame[];
  /** The step shown without a `frame` track (default 0). */
  frame?: number;
  /** The total's name and unit in the strip ("Route", "km"). */
  totalLabel?: Text;
  unit?: Text;
}

/* ---------- schedule: a timetable grid or a Gantt chart, filled as a solver works ---------- */

/** A lesson or a job. Grid: it ends at (row, col). Gantt: it runs on `row` from `at` for `len`. */
export interface ScheduleItem {
  label: Text;
  /** A second line (the teacher). */
  sub?: Text;
  row: number;
  col?: number;
  at?: number;
  len?: number;
  tone?: Tone;
}
/**
 * One step. `at` places each item: grid `[row, col]`, Gantt a start time; null takes it off. Item states, one letter
 * per item: `.` placed, `n` just placed, `g` a guess (dashed), `f` forced (only one place left), `x` a clash (danger).
 * `opts` tints the cells still possible for the item being decided, `bad` the cells that are not.
 */
export interface ScheduleFrame {
  at?: ([number, number] | number | null)[];
  state?: string;
  opts?: [number, number][];
  bad?: [number, number][];
  total?: number;
  note?: Text;
}
export interface ScheduleElement extends PackElementBase {
  type: "schedule";
  /** "grid" (default): rows × cols, in the lesson's direction. "gantt": rows × time, time always left to right. */
  kind?: "grid" | "gantt";
  rows: Text[];
  cols?: Text[];
  /** Gantt: the time axis, its ticks and unit. */
  span?: [number, number];
  ticks?: number[];
  unit?: Text;
  items: ScheduleItem[];
  /** Grid cells nobody may use (a teacher away, the lab busy): hatched. */
  blocked?: [number, number][];
  frames?: ScheduleFrame[];
  frame?: number;
  totalLabel?: Text;
}

/* ---------- knapsack: items, a bag with its limit, and the dynamic programming table ---------- */

export interface KnapsackItem { label: Text; w: number; v: number }
/**
 * One step. Bag: `in` has one letter per item: `.` out, `i` in the bag, `c` looked at now, `n` just put in, `x` won't
 * fit. Table: `fill` cells are filled, in reading order (fractions of a frame fill cell by cell); `trace` lights the
 * cells read back for the best load.
 */
export interface KnapsackFrame {
  in?: string;
  fill?: number;
  trace?: [number, number][];
  note?: Text;
}
export interface KnapsackElement extends PackElementBase {
  type: "knapsack";
  items: KnapsackItem[];
  /** The limit, in the items' weight unit. */
  cap: number;
  /** Weight and value units ("kg", "points"). */
  unit?: Text;
  vunit?: Text;
  /** Shows each item's value per this much weight ("7 per 100 kg"), the greedy rule's number. */
  per?: number;
  perLabel?: Text;
  /** "bag" (default): the items and the bag. "table": the dynamic programming table. */
  show?: "bag" | "table";
  /** table[k][c]: the best value with the first k items and room c × step (k = 0 … items, c = 0 … cap ÷ step). */
  table?: number[][];
  step?: number;
  frames?: KnapsackFrame[];
  frame?: number;
}

/* ---------- lp: a linear program in two variables ---------- */

/** a·x + b·y ≤ c (or ≥ with op). `label` names it ("Land"); `at` places the label along its line (0–1). */
export interface LpConstraint { a: number; b: number; c: number; op?: "<=" | ">="; label?: Text; at?: number; tone?: Tone }
/** One step: the goal line's level (blended between frames: the line slides). */
export interface LpFrame { level: number; note?: Text }
export interface LpElement extends PackElementBase {
  type: "lp";
  xr: [number, number];
  yr: [number, number];
  xLabel?: Text;
  yLabel?: Text;
  /** The variables' names (default x and y). */
  vars?: [string, string];
  cons: LpConstraint[];
  /** The goal a·x + b·y, made as large as possible (or as small, with min), and its name ("Profit"). */
  obj?: { a: number; b: number; min?: boolean; label?: Text };
  frames?: LpFrame[];
  frame?: number;
  /** Dots on the whole-number plans that fit. */
  ints?: boolean;
  /** The goal's value at every corner, not only the best. */
  values?: boolean;
}

/* ---------- searchtree: backtracking or branch and bound ---------- */

/**
 * A node of the tree, one per step of the search, in the order it is visited: `p` its parent (−1 for the root),
 * `label` the partial choice, `sub` its bound, `edge` the branch taken to reach it. Marks: `x` pruned (greyed, ✗), `d`
 * a dead end (✗), `l` a full plan. `best`: it becomes the best so far, worth `val`. `note` explains the step.
 */
export interface SearchStep {
  p: number;
  label: Text;
  sub?: Text;
  edge?: Text;
  mark?: "x" | "d" | "l";
  best?: boolean;
  val?: number;
  note?: Text;
}
export interface SearchTreeElement extends PackElementBase {
  type: "searchtree";
  steps: SearchStep[];
  /** The search so far: steps 0 … frame are shown, `frame` the current one (default 0, the root). */
  frame?: number;
  /** The best-so-far value's name in the strip ("Best so far"). */
  totalLabel?: Text;
}

export type OptPackElement = GraphElement | ScheduleElement | KnapsackElement | LpElement | SearchTreeElement;
export type { PackElementBase };
