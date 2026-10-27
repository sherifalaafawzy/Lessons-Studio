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
 */
export type AnimProp = "x" | "y" | "scale" | "rotate" | "opacity" | "draw" | "reveal";

export interface Track {
  prop: AnimProp;
  keys: Key[];
}

export type ElementType = "text" | "shape" | "line" | "path" | "icon" | "image" | "code" | "chart" | "group";

interface ElementBase {
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

export type Element =
  | TextElement | ShapeElement | LineElement | PathElement | IconElement
  | ImageElement | CodeElement | ChartElement | GroupElement;

/** Free layout: elements on the design stage (manifest.stage), animated by keyframes. Targets: element ids. */
export interface CanvasContent {
  elements: Element[];
}

export type IconName =
  | "user" | "page" | "bot" | "server" | "data" | "lock" | "shield" | "phone" | "mail" | "link"
  | "warning" | "key" | "cloud" | "chip" | "wifi" | "check" | "cross" | "spark";

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
  manifest: Manifest;
  scenes: ScenesFile;
  /** Loaded timing files, by language. */
  timing: Record<Lang, TimingFile>;
}
