/**
 * Programming pack: the element types `trace`, `flowchart`, `array`, `calltree`, `codediff` (docs/packs/code.md).
 * Each interface extends PackElementBase and has `type` set to one of them. Everything an element shows is data
 * computed when the lesson is made (packages/ops/src/packs/code.ts records traces with real MicroPython, runs the
 * sorts and searches, builds call trees); the phone only draws.
 */
import type { Text, Tone } from "../../types.ts";
import type { PackElementBase } from "../base.ts";

/** How code is coloured: Python, SQL, or plain (pseudocode). Code is always set left to right. */
export type CodeLang = "python" | "sql" | "plain";

/** One step of a program run: the line that ran and how things stood after it. */
export interface TraceStep {
  /** The line that ran (from 1). */
  line: number;
  /** The function it is in (omitted at the top level), and the call as written: "fib(3)". */
  fn?: string;
  call?: string;
  /** How many calls deep (0, or omitted, at the top level). */
  depth?: number;
  /** The program's own (global) variables after the line ran: name → value as Python writes it ("[3, 5]", "'Ada'"). */
  vars?: Record<string, string>;
  /** Inside a function: its parameters and local variables after the line ran. */
  locals?: Record<string, string>;
  /** How many characters of the element's `output` are printed by then. */
  out?: number;
  /** A line that returns: the value it gives back. */
  ret?: string;
  /** The program stopped with `error` on this line. */
  err?: boolean;
}

/**
 * A program running line by line: the code (always left to right, lightly coloured), the line that runs lit, a
 * variables panel (values changing, the changed one marked) and an output console. `frame` is the step: frame k shows
 * `steps[k]` (from 0; fractions glide the light on to the next line). Steps are recorded when the lesson is made
 * (`recordTrace` in ops, real MicroPython) or written by hand (pseudocode). `focus` rings the n-th line of code.
 */
export interface TraceElement extends PackElementBase {
  type: "trace";
  code: string;
  lang?: CodeLang;
  steps: TraceStep[];
  /** Everything the program printed; each step says how much of it is out by then. */
  output?: string;
  /** The error the program stopped with ("ZeroDivisionError: divide by zero"), shown once its step is reached. */
  error?: string;
  /** Panel headings in the lesson's languages. */
  labels?: { vars?: Text; out?: Text };
  /** Which panels to show beside the code (default: variables when a step has any, output when there is any). */
  panels?: ("vars" | "out")[];
  /** Code font size in stage pixels (default: as big as fits, at most 40). */
  size?: number;
  /** The step shown when no `frame` track moves it (default 0, the first step). */
  frame?: number;
}

export type FlowKind = "start" | "end" | "process" | "decision" | "io";

export interface FlowNode {
  /** /^[A-Za-z0-9_-]{1,40}$/, unique in the element. */
  id: string;
  /** start and end: rounded ends; process: a box; decision: a diamond (yes and no ways out); io: input or output. */
  kind: FlowKind;
  label: Text;
  tone?: Tone;
}

/** An arrow. A decision's first arrow goes straight down, its second to the side; an arrow back up is a loop. */
export interface FlowEdge {
  from: string;
  to: string;
  /** "Yes", "No" (per language). */
  label?: Text;
}

/**
 * A flowchart laid out top to bottom: start and end, steps, decisions with yes and no, input and output, and loops
 * (arrows back up, drawn round the side). `reveal` brings the shapes in node by node, `focus` lights the n-th node, and
 * `pass` (0 → 1) moves a token along `path`, a run through the chart, one hop at a time. Mirrors in right-to-left
 * languages unless `fixed`.
 */
export interface FlowchartElement extends PackElementBase {
  type: "flowchart";
  nodes: FlowNode[];
  edges: FlowEdge[];
  /** A run through the chart: node ids in the order the token visits them (loops repeat ids). */
  path?: string[];
  /** Label font size in stage pixels (default 32). */
  size?: number;
}

/** One moment of an array algorithm. Slots count from 0, left to right. */
export interface ArrayFrame {
  /** Which item (index into `values`) is in each slot; omitted: as in the frame before (first frame: in order). */
  order?: number[];
  /** Slots being compared. */
  compare?: number[];
  /** Slots whose items just moved (a swap, an insertion). */
  swap?: number[];
  /** Slots in their final place. */
  done?: number[];
  pivot?: number;
  /** A search's range and middle; slots outside lo…hi fade. */
  lo?: number;
  mid?: number;
  hi?: number;
  /** The slot where the search found its target. */
  found?: number;
  /** Other pointers, named as in the code ({ "i": 0, "j": 3 }), shown under their slots like lo, mid and hi. */
  ptr?: Record<string, number>;
  /** What happens, in a few words or code ("5 > 2", "a[4] = 23 < 37"). */
  note?: Text;
  /** The counters' values (in `counters` order). */
  count?: number[];
}

/**
 * Values in a row, as boxes or bars, for sorting and searching. Items keep their identity, so a swap is two items
 * moving (between frames, positions blend); each frame marks compares, swaps, finished slots, a pivot, a search range
 * and its middle. Index labels and counters (comparisons, swaps) are optional. Never mirrored: numbers stay left to
 * right.
 */
export interface ArrayElement extends PackElementBase {
  type: "array";
  values: (number | string)[];
  frames?: ArrayFrame[];
  /** Boxes with the values (default), or bars as tall as the values (numbers ≥ 0). */
  view?: "boxes" | "bars";
  /** Show each slot's index under it. */
  index?: boolean;
  /** Names of the counters (per language); their values are in each frame's `count`. */
  counters?: Text[];
  /** Value font size in stage pixels (default: as big as fits, at most 44). */
  size?: number;
  frame?: number;
}

/** One call in a call tree. */
export interface CallNode {
  /** The call as written: "fib(3)", "hanoi(2, A, C)". */
  label: string;
  /** The call it was made from (an earlier index); omitted for the first call. */
  parent?: number;
  /** What it returns ("2", "A→C"); omitted: it shows no value. */
  ret?: string;
  tone?: Tone;
}

/**
 * Recursion as a tree that grows as the calls are made, in call order, with return values coming back up. `frame` k
 * shows the run after `steps[k]` (from 0: the first call has started); without a `frame` track the whole tree shows,
 * every call returned. `reveal` brings calls in, in call order; `focus` lights the n-th call; the call running now is
 * marked. Mirrors in right-to-left languages unless `fixed`; the calls themselves stay left to right.
 */
export interface CalltreeElement extends PackElementBase {
  type: "calltree";
  /** In the order they are called; each call's children are the calls it makes. */
  calls: CallNode[];
  /**
   * The run, one event per frame: i + 1 when call i starts, −(i + 1) when it returns. A call starts after its parent
   * and returns after its children (`callSteps` in ops writes it). Omitted: every call, depth first.
   */
  steps?: number[];
  /** Label font size in stage pixels (default: as big as fits, at most 36). */
  size?: number;
  frame?: number;
}

/**
 * A bug and its fix in one code card: `before` with the changed lines marked as the bug (danger), then, as `frame`
 * goes 0 → 1, those lines swap in place for the fix (ok). The lines the two share stay. Optional output under the
 * code swaps too ("prints 0" → "prints 15"). Always left to right.
 */
export interface CodediffElement extends PackElementBase {
  type: "codediff";
  before: string;
  after: string;
  lang?: CodeLang;
  /** Headings over the card (per language): "The bug", "The fix". */
  labels?: { before?: Text; after?: Text };
  /** What each version prints (or the error it stops with). */
  output?: { before?: string; after?: string };
  /** Code font size in stage pixels (default: as big as fits, at most 40). */
  size?: number;
  frame?: number;
}

export type CodePackElement = TraceElement | FlowchartElement | ArrayElement | CalltreeElement | CodediffElement;
export type { PackElementBase };
