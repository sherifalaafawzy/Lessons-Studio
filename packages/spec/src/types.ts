import type { PackElement } from "./packs/types.ts";
import type { PackType } from "./packs/registry.ts";
export type { PackElement, PackType };
import type { LibraryIcon } from "./library-icons.ts";
/**
 * Lesson Package v0.2. PLAN.md §6 describes the format; the JSON Schemas in ../schema mirror these types.
 * v0.2 adds the canvas template (free elements with keyframes), overlays, transitions, camera and images.
 * Every v0.1 package is a valid v0.2 package.
 */

export const SPEC_VERSION = "0.2";
export type SpecVersion = "0.1" | "0.2";

/** A BCP 47 language code, e.g. "en", "ar", "fr". */
export type Lang = string;
export type Dir = "ltr" | "rtl";

/** Text per language, e.g. { "en": "Web page", "ar": "صفحة ويب" }. A plain string is the same in every language (names, links, code). */
export type Text = string | Record<Lang, string>;

/* ---------- manifest.json ---------- */

export interface Manifest {
  spec: "lesson-package";
  version: SpecVersion;
  /** Lower case, digits and hyphens: /^[a-z0-9][a-z0-9-]{1,63}$/ */
  id: string;
  /** Bumped on every publish. */
  rev: number;
  title: Text;
  summary?: Text;
  topic?: string;
  level?: number;
  defaultLang: Lang;
  languages: LanguageTrack[];
  /** Brand kit id, e.g. "studio-dark" or "darsi-light". */
  brand?: string;
  /**
   * The shape canvas scenes are designed for (default "landscape", 1280×720; "portrait" 720×1280; "square" 1080×1080).
   * Templates adapt to any shape; a canvas scene played in another shape is scaled to fit.
   */
  stage?: Orient;
  /** Relative path of a first-frame preview image. */
  poster?: string;
  /** Content-addressed files the package ships (audio, images, fonts). */
  assets?: Asset[];
  licences?: Licence[];
  provenance: Provenance;
  ai: AiDisclosure;
  /** "Last reviewed" (PLAN.md §11): tech content ages fast. */
  reviewed?: { by: string; at: string };
}

export interface LanguageTrack {
  code: Lang;
  dir: Dir;
  /** The language's own name, e.g. "العربية". */
  name: string;
  /** Seconds; equals timing/<lang>.json `duration`. */
  duration: number;
  /** Relative path, e.g. "timing/ar.json". */
  timing: string;
  /** Relative path of the narration, e.g. "audio/ar.opus". Absent: the player runs a silent clock. */
  audio?: string;
  /** For browsers without Opus, e.g. "audio/ar.m4a". */
  audioFallback?: string;
  captions?: string;
  /** Per-language quality tier (PLAN.md §11). "machine" means not yet reviewed by a native speaker. */
  quality?: "reviewed" | "machine" | "draft";
  /** The voice that narrates (or will narrate) this language. `npm run narrate` reads it. */
  voice?: NarrationVoice;
  /** The cast's voices, by speaker: a scene with a `speaker` is voiced by `voices[speaker]`, any other by `voice`. */
  voices?: Record<string, NarrationVoice>;
}

export interface NarrationVoice {
  /** "gemini" for Gemini TTS, "human" for a recording. */
  provider: string;
  /** e.g. "gemini-3.8-flash-lite-tts". */
  model?: string;
  /** A prebuilt voice such as "Charon", or a designed voice id. */
  name: string;
  /** How to speak, e.g. "Clear, warm and calm. Steady pace." Sent as the TTS style, never read aloud. */
  style?: string;
}

export interface Asset {
  path: string;
  type: string;
  bytes: number;
  /** Lower-case hex SHA-256 of the file. */
  sha256: string;
}

export interface Licence {
  path: string;
  licence: string;
  source?: string;
  author?: string;
}

export interface Provenance {
  /** ISO date or date-time. */
  createdAt: string;
  createdBy: string;
  tool: string;
  sources?: { title: string; url?: string }[];
}

export type Origin = "human" | "ai-assisted" | "ai";

/** What was made with AI, shown to learners (PLAN.md §11). */
export interface AiDisclosure {
  script: Origin;
  translation: Origin | "none";
  narration: "human" | "synthetic" | "none";
  visuals: Origin;
  avatar: "none" | "stylised" | "photo" | "live";
}

/* ---------- scenes.json ---------- */

export interface ScenesFile {
  version: SpecVersion;
  scenes: Scene[];
}

export type Orient = "landscape" | "portrait" | "square";

export type TemplateId = "title-hook" | "steps" | "flow" | "message-mock" | "quiz" | "summary" | "canvas";

export type CueAction = "highlight" | "pulse" | "reveal" | "move";

/**
 * Something happens to `target` when a word is spoken, or `at` seconds into the scene.
 * `word` is matched against that language's word timings: one word or a short phrase, ignoring case,
 * punctuation and Arabic diacritics. `occurrence` picks the n-th match (default 1).
 */
export interface Cue {
  word?: Text;
  at?: number;
  occurrence?: number;
  action: CueAction;
  target: string;
}

export interface Check {
  type: "single-choice";
  id: string;
  prompt: Text;
  options: { id: string; text: Text }[];
  answer: string;
  explain?: Text;
}

interface SceneBase {
  /** /^[A-Za-z0-9_-]{1,40}$/, unique in the lesson. */
  id: string;
  /** What is spoken, per language. Every language in the manifest needs it. */
  narration: Record<Lang, string>;
  /** Who says it: a key of the language tracks' `voices` (a cast member). Absent: the narrator. */
  speaker?: string;
  cues?: Cue[];
  /** Asked when the scene ends. */
  check?: Check;
  /** Free elements drawn over the template (or over a canvas scene's own elements). */
  overlays?: Element[];
  /** How the scene comes in. Transform and opacity only, so old phones keep up. Default: a short fade. */
  transition?: Transition;
  /** Pans and zooms the whole scene: tracks for "x", "y" (stage pixels) and "scale". */
  camera?: Track[];
  background?: Tone;
  /** In right-to-left languages, canvas elements mirror left and right (default true). Elements can opt out with `fixed`. */
  mirror?: boolean;
}

export interface Transition {
  type: "cut" | "fade" | "slide" | "wipe" | "zoom";
  /** Seconds, default 0.4. */
  dur?: number;
}

/* ---------- free elements and keyframes (v0.2) ---------- */

/** Brand colours by role, so a brand kit re-themes every lesson. */
export type Tone = "fg" | "muted" | "accent" | "accent2" | "danger" | "ok" | "surface" | "bg" | "line";

export type Ease = "linear" | "in" | "out" | "in-out" | "back" | "step";

/**
 * When a keyframe happens: seconds from the scene's start, or the moment a word is spoken
 * (matched like cue words, per language), plus an optional offset in seconds.
 */
export type When = number | { word: Text; occurrence?: number; offset?: number };

export interface Key {
  at: When;
  value: number;
  /** The curve from the previous keyframe to this one. Default "in-out". */
  ease?: Ease;
}

/**
 * Animatable properties. x and y are stage pixels; scale is a factor; rotate is degrees; opacity, draw
 * (how much of a stroke is drawn) and reveal (how much text, code or chart is shown) run from 0 to 1.
 * The science elements (math, plot, net, arch, table) add three: `frame` picks a snapshot (training steps, from 0;
 * fractions blend two), `focus` highlights a part (from 1; 0 is none) and `pass` sends data through a network
 * (0 → 1 forward; 1 → 2 the error flowing back).
 */
export type AnimProp = "x" | "y" | "scale" | "rotate" | "opacity" | "draw" | "reveal" | "frame" | "focus" | "pass";

export interface Track {
  prop: AnimProp;
  keys: Key[];
}

export type ElementType = "text" | "shape" | "line" | "path" | "icon" | "image" | "code" | "chart" | "group" | PackType;
/** Elements the player draws with its science kit, loaded only by lessons that use them. */
export type ScienceType = "math" | "plot" | "net" | "arch" | "table";

export interface ElementBase {
  /** /^[A-Za-z0-9_-]{1,40}$/, unique in the scene (overlays and group children included). Cues can target it. */
  id: string;
  /** Top-left corner on the design stage, in pixels. */
  x: number;
  y: number;
  w?: number;
  h?: number;
  rotate?: number;
  scale?: number;
  opacity?: number;
  tone?: Tone;
  /** Keeps its place in right-to-left languages instead of mirroring. */
  fixed?: boolean;
  anim?: Track[];
}

export interface TextElement extends ElementBase {
  type: "text";
  text: Text;
  /** Font size in stage pixels, default 40. */
  size?: number;
  weight?: 400 | 600 | 700 | 800;
  align?: "start" | "center" | "end";
}

export interface ShapeElement extends ElementBase {
  type: "shape";
  shape: "rect" | "ellipse" | "pill";
  fill?: Tone;
  stroke?: Tone;
  strokeWidth?: number;
  radius?: number;
}

/** A straight line from (x, y) to (x2, y2), optionally with arrowheads. */
export interface LineElement extends ElementBase {
  type: "line";
  x2: number;
  y2: number;
  arrow?: "none" | "end" | "both";
  strokeWidth?: number;
  dash?: boolean;
}

/** An SVG path in the element's own box (0 0 w h). `draw` animates the stroke being drawn. */
export interface PathElement extends ElementBase {
  type: "path";
  d: string;
  fill?: Tone;
  strokeWidth?: number;
}

export interface IconElement extends ElementBase {
  type: "icon";
  icon: IconName;
}

export interface ImageElement extends ElementBase {
  type: "image";
  /** Relative path of a WebP (or PNG/JPEG) in the package. */
  src: string;
  /** A smaller copy (about 480 px) for low tiers and small screens. */
  small?: string;
  alt?: Text;
  fit?: "cover" | "contain";
}

export interface CodeElement extends ElementBase {
  type: "code";
  code: string;
  /** 1-based lines to highlight. */
  highlight?: number[];
  size?: number;
}

export interface ChartElement extends ElementBase {
  type: "chart";
  kind: "bar" | "line";
  data: number[];
  labels?: Text[];
  max?: number;
}

export interface GroupElement extends ElementBase {
  type: "group";
  children: Element[];
}

/* ---------- science elements (v0.3): maths, plots and networks, drawn by the player's science kit ---------- */

/**
 * An equation in a small TeX subset (`docs/science.md`): fractions, powers and indices, roots, sums, Greek letters,
 * accents, matrices, operator names. `\g{n}{…}` marks the n-th part to come in (reveal) or light up (focus);
 * `\c{tone}{…}` colours a part; `\w{key}` is a word from `words`, in the lesson's language. Equations are set left to
 * right in every language, like a textbook; `notation: "arabic"` sets them right to left with Arabic-Indic digits in
 * right-to-left languages (Arabic school notation: write that language's `tex` with Arabic letters).
 */
export interface MathElement extends ElementBase {
  type: "math";
  /** One TeX source, or one per language (each with the same \g parts). */
  tex: string | Text;
  words?: Record<string, Text>;
  /** Font size in stage pixels, default 48. */
  size?: number;
  align?: "start" | "center" | "end";
  notation?: "arabic";
}

/** A data series on a plot. Points are [x, y] in the plot's own units. */
export type PlotSeries =
  /** y = fn(x), an expression in x and the parameters a, b, c, d (`params`, one set per frame; frames blend). */
  | { kind: "fn"; fn: string; params?: number[][]; tone?: Tone; dash?: boolean; label?: Text }
  /**
   * Points joined by a line, an area under them, or dots. Classes colour dots (0 accent, 1 ok, 2 danger, 3 accent2):
   * `cls` for good, or `clsFrames`, one list per frame (points changing group as a model learns).
   */
  | { kind: "line" | "area" | "dots"; pts?: [number, number][]; frames?: [number, number][][]; cls?: number[]; clsFrames?: number[][]; tone?: Tone; dash?: boolean; label?: Text }
  /** A grid of cells over the whole plot (rows from the top): class ids (0–3) or, with `scale`, values from 0 to 1. */
  | { kind: "heat"; grid?: number[][]; frames?: number[][][]; scale?: boolean }
  /** A level line across the plot (a threshold, a target). */
  | { kind: "hline" | "vline"; at: number; tone?: Tone; dash?: boolean; label?: Text }
  /** One moving point, one position per frame, with its path so far (gradient descent rolling downhill). */
  | { kind: "marker"; pts: [number, number][]; trail?: boolean; tone?: Tone; label?: Text };

/** A plot with axes: functions, training curves, scattered classes and decision regions. Always left to right. */
export interface PlotElement extends ElementBase {
  type: "plot";
  /** The axes' ranges: [min, max]. */
  xr: [number, number];
  yr: [number, number];
  xLabel?: Text;
  yLabel?: Text;
  xTicks?: number[];
  yTicks?: number[];
  grid?: boolean;
  series: PlotSeries[];
  /** The frame shown when no `frame` track moves it (default 0). */
  frame?: number;
}

/**
 * A neural network, neuron by neuron: `layers` counts the neurons per layer ([2, 4, 1]). Weights draw the lines
 * (thicker = stronger, accent positive, accent2 negative) and activations fill the neurons, one set per frame.
 * Mirrors in right-to-left languages unless `fixed`.
 */
export interface NetElement extends ElementBase {
  type: "net";
  layers: number[];
  /** weights[frame][layer][from][to], from neuron `from` of a layer to neuron `to` of the next. */
  weights?: number[][][][];
  /** acts[frame][layer][neuron], from −1 to 1 (drawn by their size, |a|). */
  acts?: number[][][];
  labels?: { in?: Text[]; out?: Text[]; layers?: Text[] };
  /** Write each neuron's activation inside it. */
  values?: boolean;
  frame?: number;
}

export type ArchKind =
  | "input" | "output" | "embed" | "dense" | "conv" | "pool" | "attn" | "norm" | "ffn" | "add" | "concat"
  | "softmax" | "act" | "rnn" | "store" | "tool" | "model" | "box";

export interface ArchBlock {
  /** /^[A-Za-z0-9_-]{1,40}$/, unique in the element. */
  id: string;
  kind: ArchKind;
  label: Text;
  /** A small line under the label: a shape ("28×28×1"), a count. */
  note?: Text;
  tone?: Tone;
}

/**
 * A model's architecture as blocks and arrows: an MLP, a CNN, an RNN, a transformer, an encoder and decoder, an
 * agent with tools. Laid out automatically along `flow`; `skip` arrows (residual connections) go around the blocks
 * between; a group with `repeat` gets a bracket and "× N". `reveal` brings blocks in along the flow, `focus` lights
 * the n-th block, and `pass` sends a packet through (backward after 1).
 */
export interface ArchElement extends ElementBase {
  type: "arch";
  blocks: ArchBlock[];
  edges: { from: string; to: string; label?: Text; skip?: boolean }[];
  groups?: { id: string; label?: Text; repeat?: number; blocks: string[] }[];
  /** Which way data flows: "right" (default; mirrored in right-to-left languages unless `fixed`), "down" or "up". */
  flow?: "right" | "down" | "up";
}

/** A table that fills row by row (`reveal`); `focus` lights the n-th row. Numbers and `ltr` columns stay left to right. */
export interface TableElement extends ElementBase {
  type: "table";
  cols: Text[];
  rows: (string | number | Text)[][];
  ltr?: number[];
  /** Font size in stage pixels, default 30. */
  size?: number;
}

export type ScienceElement = MathElement | PlotElement | NetElement | ArchElement | TableElement;

export type Element =
  | TextElement | ShapeElement | LineElement | PathElement | IconElement
  | ImageElement | CodeElement | ChartElement | GroupElement | ScienceElement | PackElement;

/** Free layout: elements on the design stage (manifest.stage), animated by keyframes. Targets: element ids. */
export interface CanvasContent {
  elements: Element[];
}

/** The player's own icons. */
export type CoreIcon =
  | "user" | "page" | "bot" | "server" | "data" | "lock" | "shield" | "phone" | "mail" | "link"
  | "warning" | "key" | "cloud" | "chip" | "wifi" | "check" | "cross" | "spark";
/** The player's own icons, and the shared library's (src/library.ts). */
export type IconName = CoreIcon | LibraryIcon;

/** Targets: "kicker", "title", "hook". */
export interface TitleHookContent {
  kicker?: Text;
  title: Text;
  hook?: Text;
  icon?: IconName;
}

/** Targets: "1"…"n" (the steps, 1-based), "title". */
export interface StepsContent {
  title?: Text;
  steps: Text[];
}

export interface FlowNode {
  id: string;
  label: Text;
  icon?: IconName;
  tone?: "neutral" | "trusted" | "system" | "danger";
}

export interface FlowEdge {
  from: string;
  to: string;
  label?: Text;
}

/** Targets: node ids, edges as "from>to", "title". `move` sends a packet along an edge. */
export interface FlowContent {
  title?: Text;
  nodes: FlowNode[];
  edges: FlowEdge[];
}

export interface MessageFlag {
  id: string;
  /** The line index it points at (0-based), or the sender or the link. */
  line: number | "from" | "link";
  label: Text;
}

/** Targets: flag ids, "from", "link". */
export interface MessageMockContent {
  kind: "sms" | "chat" | "email";
  from: Text;
  time?: string;
  subject?: Text;
  lines: Text[];
  link?: Text;
  flags?: MessageFlag[];
}

/** Shows the scene's `check`. Targets: "prompt" and the option ids. */
export interface QuizContent {
  title?: Text;
}

/** Targets: "1"…"n" (the points), "takeaway", "title". */
export interface SummaryContent {
  title?: Text;
  points: Text[];
  takeaway?: Text;
}

export type Scene =
  | (SceneBase & { template: "title-hook"; content: TitleHookContent })
  | (SceneBase & { template: "steps"; content: StepsContent })
  | (SceneBase & { template: "flow"; content: FlowContent })
  | (SceneBase & { template: "message-mock"; content: MessageMockContent })
  | (SceneBase & { template: "quiz"; content: QuizContent })
  | (SceneBase & { template: "summary"; content: SummaryContent })
  | (SceneBase & { template: "canvas"; content: CanvasContent });

/* ---------- timing/<lang>.json ---------- */

export interface Word {
  w: string;
  /** Start and end, in seconds from the start of the lesson. */
  s: number;
  e: number;
}

export interface Sentence {
  text: string;
  start: number;
  end: number;
}

export interface SceneTiming {
  id: string;
  start: number;
  end: number;
  sentences: Sentence[];
  words: Word[];
  /** Mouth openness for a vector presenter, one digit (0–2) per 1/12 s from `start`. Optional. */
  mouth?: string;
}

export interface TimingFile {
  version: "0.1";
  lang: Lang;
  /**
   * How the times were made.
   * - "estimated": from the text alone (estimateTiming), before any narration exists.
   * - "tts": sentence times measured from the narration; word times spread within each sentence.
   * - "aligned": word times measured against the narration by forced alignment.
   * - "manual": set by hand.
   */
  source: "estimated" | "tts" | "aligned" | "manual";
  duration: number;
  scenes: SceneTiming[];
}

/* ---------- a loaded package ---------- */

export interface LessonPackage {
  /** Where the files live, ending in "/". Relative paths in the manifest resolve against it. */
  base?: string;
  /** Where the shared library lives, ending in "/": "@lib/..." paths resolve against it (default: Lesson Studio's Hosting). */
  library?: string;
  /**
   * The address of each package file ("audio/en.opus" → its URL), for hosts where the files don't share a base, such
   * as Firebase Storage download links. Without it, paths resolve against `base`.
   */
  resolve?: (path: string) => string;
  manifest: Manifest;
  scenes: ScenesFile;
  /** Loaded timing files, by language. */
  timing: Record<Lang, TimingFile>;
}
