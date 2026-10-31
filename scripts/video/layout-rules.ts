// The rules of the layout check (layout-check.ts): box maths, overlap, the font size on a phone and the bidi patterns,
// as pure functions. The browser only measures; everything decided about those measurements is decided here.

export interface Rect { x: number; y: number; w: number; h: number }
export type Level = "error" | "warn";

export const LIMITS = {
  /** Stage pixels a box may go past the stage's edge before it counts (anti-aliasing, hard shadows, rounding). */
  offStage: 4,
  /** Layout pixels of overflow allowed (scroll sizes are whole pixels; a glyph may overhang its advance a little). */
  overflow: 2,
  /** Two texts overlap when the area they share is more than this share of the smaller one. */
  overlap: 0.15,
  /** The phone the font sizes are judged on: this many CSS pixels wide, showing the stage across its width. */
  phone: 360,
  /** Text under this many pixels on that phone is an error, under `fontWarn` a warning. */
  fontError: 9,
  fontWarn: 11,
  /** An equation shrunk below this scale to fit its box is too small. */
  mathScale: 0.6,
  /** How many of the smallest texts each scene reports. */
  fontsPerScene: 3,
  /** Below this opacity a box is invisible and ignored. */
  visible: 0.05,
  /** Both texts at least this opaque: an overlap is an error; otherwise (a cross-fade, an entrance) a warning. */
  opaque: 0.9,
} as const;

/* ---------- boxes ---------- */

export const area = (r: Rect): number => Math.max(0, r.w) * Math.max(0, r.h);

export function intersect(a: Rect, b: Rect): Rect | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  return x2 > x && y2 > y ? { x, y, w: x2 - x, h: y2 - y } : null;
}

export function union(rects: readonly Rect[]): Rect | null {
  if (!rects.length) return null;
  let x = Infinity, y = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const r of rects) {
    x = Math.min(x, r.x); y = Math.min(y, r.y);
    x2 = Math.max(x2, r.x + r.w); y2 = Math.max(y2, r.y + r.h);
  }
  return { x, y, w: x2 - x, h: y2 - y };
}

export interface Sides { left: number; right: number; top: number; bottom: number }

/** How far a box goes past each edge of the stage, or null when it stays within `tol` of every edge. */
export function beyond(box: Rect, stage: Rect, tol: number = LIMITS.offStage): Sides | null {
  const s: Sides = {
    left: Math.max(0, stage.x - box.x),
    right: Math.max(0, box.x + box.w - (stage.x + stage.w)),
    top: Math.max(0, stage.y - box.y),
    bottom: Math.max(0, box.y + box.h - (stage.y + stage.h)),
  };
  return Math.max(s.left, s.right, s.top, s.bottom) > tol ? s : null;
}

/** "22 px past the right edge", "40 px past the top and 12 px past the left edge". */
export function describeSides(s: Sides): string {
  const parts = (["left", "right", "top", "bottom"] as const).filter((k) => s[k] > 0).sort((a, b) => s[b] - s[a]).map((k) => `${Math.round(s[k])} px past the ${k}`);
  return `${parts.join(" and ")} edge`;
}

/**
 * A line box narrowed to one em tall around its middle. Range rects are as tall as the font's ascent plus descent,
 * which for Arabic fonts is far more than the letters: two lines of Arabic set close together would "overlap" by
 * their boxes and not by their letters.
 */
export function emBox(r: Rect, em: number): Rect {
  if (!(em > 0) || em >= r.h) return r;
  return { x: r.x, y: r.y + (r.h - em) / 2, w: r.w, h: em };
}

/**
 * The overlap of two texts, each a list of line boxes: the area they share over the area of the smaller one.
 * Lines of one text don't overlap each other, so the sums are areas.
 */
export function overlapShare(a: readonly Rect[], b: readonly Rect[]): number {
  const total = (rs: readonly Rect[]): number => rs.reduce((n, r) => n + area(r), 0);
  const small = Math.min(total(a), total(b));
  if (!(small > 0)) return 0;
  let shared = 0;
  for (const p of a) for (const q of b) { const i = intersect(p, q); if (i) shared += area(i); }
  return Math.min(1, shared / small);
}

/** One box holds the other in the page (a parent and its child): their overlap is the design, not a mistake. */
export function nested(a: readonly number[], b: readonly number[]): boolean {
  const [s, l] = a.length <= b.length ? [a, b] : [b, a];
  return s.every((v, i) => l[i] === v);
}

/* ---------- overflow ---------- */

/** What the page measured for a box that holds text: its own size, its scroll size, and how far its text pokes out. */
export interface OverflowMeasure {
  clientW: number; clientH: number; scrollW: number; scrollH: number;
  /** How far the text's lines reach past the box's padding edge on each side, in the box's own pixels. */
  ink: Sides;
}

/** How much the text overflows its box across and down, in the box's own (design) pixels; 0 within the tolerance. */
export function overflowOf(m: OverflowMeasure, tol: number = LIMITS.overflow): { dx: number; dy: number } {
  const dx = Math.max(m.scrollW - m.clientW, m.ink.left + m.ink.right);
  const dy = Math.max(m.scrollH - m.clientH, m.ink.top + m.ink.bottom);
  return { dx: dx > tol ? Math.round(dx) : 0, dy: dy > tol ? Math.round(dy) : 0 };
}

/* ---------- font size on a phone ---------- */

/** A size on the stage as it shows on the phone: the stage is scaled to the phone's width. */
export const phonePx = (stagePx: number, stageW: number, phone: number = LIMITS.phone): number => (stagePx * phone) / stageW;

export function fontLevel(px: number): Level | null {
  return px < LIMITS.fontError ? "error" : px < LIMITS.fontWarn ? "warn" : null;
}

/** The smallest stage size that passes on the phone ("32 px on a 1280 stage" for the 9 px error line). */
export const minDesignPx = (stageW: number, px: number = LIMITS.fontWarn, phone: number = LIMITS.phone): number => (px * stageW) / phone;

export interface SizedText { key: string; px: number }

/** The texts too small for the phone, smallest first: the first few, and how many more there are. */
export function smallest<T extends SizedText>(texts: readonly T[], stageW: number, n: number = LIMITS.fontsPerScene): { worst: (T & { phone: number; level: Level })[]; more: number } {
  const small = texts
    .map((t) => ({ ...t, phone: phonePx(t.px, stageW) }))
    .flatMap((t) => { const level = fontLevel(t.phone); return level ? [{ ...t, level }] : []; })
    .sort((a, b) => a.phone - b.phone);
  return { worst: small.slice(0, n), more: Math.max(0, small.length - n) };
}

/* ---------- bidi ---------- */

/** Arabic script: letters, its own digits and punctuation (Arabic comma, semicolon, question mark), presentation forms. */
const ARABIC = /[\u{600}-\u{6FF}\u{750}-\u{77F}\u{870}-\u{8FF}\u{FB50}-\u{FDFF}\u{FE70}-\u{FEFC}]/u;
const ARABIC_LETTER = /[\u{620}-\u{64A}\u{66E}-\u{6D3}\u{6D5}\u{6FA}-\u{6FC}\u{750}-\u{77F}\u{8A0}-\u{8C9}\u{FB50}-\u{FDFF}\u{FE70}-\u{FEFC}]/u;
const HEBREW = /[\u{590}-\u{5FF}]/u;
/** Invisible bidi controls: marks (LRM, RLM, ALM), embeddings and overrides, isolates (LRI, RLI, FSI, PDI). */
const CONTROL = /[\u{61C}\u{200B}-\u{200F}\u{202A}-\u{202E}\u{2066}-\u{2069}]/u;
const CONTROLS = /[\u{61C}\u{200B}-\u{200F}\u{202A}-\u{202E}\u{2066}-\u{2069}]/gu;
/** What separates the words of a mixed text: spaces and Arabic. */
const WORDS = /[^\s\u{600}-\u{6FF}\u{750}-\u{77F}\u{870}-\u{8FF}\u{FB50}-\u{FDFF}\u{FE70}-\u{FEFC}]+/gu;
/** A Latin letter or a European digit: what makes a run left to right. */
const CORE = /[A-Za-z0-9\u{C0}-\u{24F}]/u;
/** A word made only of operators (and invisible controls): it may sit between two parts of a formula ("x ≤ 10"). */
const OPS = /^[=<>≤≥≠≈±+\-−–×÷*\/→←↔⇒⇔^|&~\u{61C}\u{200B}-\u{200F}\u{202A}-\u{202E}\u{2066}-\u{2069}]+$/u;
const OPEN = "([{«“‘‹";
const CLOSE = ")]}»”’›";
const QUOTES = "\"'«»“”‘’‹›`";
/** Sentence punctuation after a run belongs to the right-to-left sentence around it, not to the run. */
const SENTENCE = ".,:;!?…";
/** A single number with a sign or a unit ("96%", "−3", "$5"): where the sign goes is a matter of convention. */
const NUMBER = /^(?:[+\-−±×÷≈~<>≤≥]\s?)?[$€£¥]?\d+(?:[.,]\d+)*\s?(?:[%‰$€£¥]|°[CF]?)?$/u;
/** Left arrows: Arabic writes "19 ← 18" where English has "19 → 18", so the arrow belongs to the right-to-left sentence. */
const LEFT = /[←⇐⟵↞]/u;

export const hasArabic = (s: string): boolean => ARABIC_LETTER.test(s);
const blank = (c: string): boolean => /\s/.test(c) || CONTROL.test(c);

/** The direction of the first strong letter: "ltr" for Latin (or any other left-to-right script), "rtl" for Arabic and Hebrew. */
export function firstStrong(s: string): "ltr" | "rtl" | null {
  for (const c of s) {
    if (!/\p{L}/u.test(c)) continue;
    return ARABIC.test(c) || HEBREW.test(c) ? "rtl" : "ltr";
  }
  return null;
}

/** A left-to-right run: where it is in the text, what it says (without invisible controls), and whether Arabic is around it. */
export interface Run { start: number; end: number; text: string; mixed: boolean }

/** Brackets opened minus brackets closed in s[from, to). */
function trimBalance(s: string, from: number, to: number): number {
  let n = 0;
  for (let i = from; i < to; i++) { if (OPEN.includes(s[i]!)) n++; else if (CLOSE.includes(s[i]!)) n--; }
  return n;
}

/** Takes off what belongs to the sentence around a run rather than to the run: quotes, a bracket pair round the whole, unpaired brackets, sentence punctuation. */
function trim(s: string, start: number, end: number, sentence: boolean): [number, number] {
  let a = start;
  let b = end;
  const balance = (from: number, to: number): number => trimBalance(s, from, to);
  // Whether the bracket at `from` closes at `to - 1`.
  const paired = (from: number, to: number): boolean => {
    let depth = 0;
    for (let i = from; i < to; i++) {
      if (OPEN.includes(s[i]!)) depth++;
      else if (CLOSE.includes(s[i]!)) { depth--; if (depth === 0) return i === to - 1; }
    }
    return false;
  };
  for (let changed = true; changed && b > a;) {
    changed = false;
    const first = s[a]!;
    const last = s[b - 1]!;
    if (blank(first)) { a++; changed = true; continue; }
    if (blank(last)) { b--; changed = true; continue; }
    if (QUOTES.includes(first) && !OPEN.includes(first)) { a++; changed = true; continue; }
    if (QUOTES.includes(last) && !CLOSE.includes(last)) { b--; changed = true; continue; }
    if (sentence && SENTENCE.includes(last)) { b--; changed = true; continue; }
    if (OPEN.includes(first) && paired(a, b)) { a++; b--; changed = true; continue; }
    if (CLOSE.includes(last) && balance(a, b) < 0) { b--; changed = true; continue; }
    if (OPEN.includes(first) && balance(a, b) > 0) { a++; changed = true; continue; }
    if (CLOSE.includes(first) || QUOTES.includes(first)) { a++; changed = true; continue; }
    if (OPEN.includes(last) || QUOTES.includes(last)) { b--; changed = true; continue; }
  }
  return [a, b];
}

/**
 * The left-to-right runs in a text: Latin words, numbers with their signs, codes and formulas ("Prompt injection",
 * "96–98%", "2-opt", "x ≤ 10", "[14, 74]", "check()"). Each paragraph (line) on its own, and a left arrow ends a run.
 * In a paragraph with Arabic (letters, or only its punctuation: "1، 2، 3" is an Arabic list), a run is the words
 * without Arabic between them (an operator may stand alone between two of its words); sentence punctuation at its end
 * and brackets or quotes around it are the sentence's, not the run's. A paragraph with no Arabic at all is one run,
 * punctuation and all.
 */
export function ltrRuns(s: string): Run[] {
  const out: Run[] = [];
  const push = (start: number, end: number, mixed: boolean): void => {
    const [a, b] = trim(s, start, end, mixed);
    const text = s.slice(a, b).replace(CONTROLS, "");
    if (text.length >= 2 && CORE.test(text)) out.push({ start: a, end: b, text, mixed });
  };
  let from = 0;
  for (const para of s.split("\n")) {
    const mixed = ARABIC.test(para.replace(CONTROLS, ""));
    let pieceAt = from;
    from += para.length + 1;
    for (const piece of para.split(LEFT)) {
      const at = pieceAt;
      pieceAt += piece.length + 1;
      if (!mixed) {
        if (CORE.test(piece)) push(at, at + piece.length, false);
        continue;
      }
      runsIn(piece, at);
    }
  }
  return out;

  function runsIn(para: string, at: number): void {
    const words: { start: number; end: number; kind: "core" | "op" | "punct" }[] = [];
    for (const m of para.matchAll(WORDS)) {
      const w = m[0];
      words.push({ start: at + m.index!, end: at + m.index! + w.length, kind: CORE.test(w) ? "core" : OPS.test(w) ? "op" : "punct" });
    }
    let group: typeof words = [];
    const flush = (): void => {
      while (group.length && group[0]!.kind === "op") group.shift();
      while (group.length && group[group.length - 1]!.kind === "op") group.pop();
      if (group.some((w) => w.kind === "core")) push(group[0]!.start, group[group.length - 1]!.end, true);
      group = [];
    };
    for (const w of words) {
      const prev = group[group.length - 1];
      // A word ending in sentence punctuation ends the run ("SMS: 140 بايت" is a label and a value in an Arabic
      // sentence), unless a bracket is open ("[14, 74]" is one thing).
      const ended = !!prev && SENTENCE.includes(s[prev.end - 1]!) && trimBalance(s, group[0]!.start, prev.end) <= 0;
      if (!prev || ended || !/^\s+$/.test(s.slice(prev.end, w.start))) flush();
      if (w.kind === "punct") { flush(); continue; }
      group.push(w);
    }
    flush();
  }
}

/** "1" for each character inside an isolate or embedding written into the text itself (LRI … PDI, LRE … PDF). */
export function controlIsolated(s: string): string {
  let depth = 0;
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const u = s.charCodeAt(i);
    if (u === 0x2069 || u === 0x202c) depth = Math.max(0, depth - 1);
    out += depth > 0 ? "1" : "0";
    if ((u >= 0x2066 && u <= 0x2068) || u === 0x202a || u === 0x202b || u === 0x202d || u === 0x202e) depth++;
  }
  return out;
}

/** Where a character was drawn: the middle of its box and its height, in stage pixels. */
export interface CharPos { x: number; y: number; h: number }

const sameLine = (a: CharPos, b: CharPos): boolean => Math.abs(a.y - b.y) < 0.5 * Math.min(a.h, b.h);

/** Whether a run's characters were drawn left to right, line by line (a run broken over two lines is checked per line). */
export function inOrder(run: Run, pos: readonly (CharPos | null)[], s: string, tol = 1): boolean {
  let prev: CharPos | null = null;
  for (let i = run.start; i < run.end; i++) {
    const p = pos[i];
    if (!p || blank(s[i]!)) continue;
    if (prev && sameLine(prev, p) && p.x < prev.x - tol) return false;
    prev = p;
  }
  return true;
}

/** Characters a right-to-left layout draws mirrored. */
const MIRROR: Record<string, string> = { "(": ")", ")": "(", "[": "]", "]": "[", "{": "}", "}": "{", "<": ">", ">": "<", "≤": "≥", "≥": "≤", "«": "»", "»": "«", "‹": "›", "›": "‹" };

/**
 * The run as it reads on the screen, left to right ("%98–96", "()check"); lines are joined with " / ". A bracket drawn
 * left of the character before it was laid out right to left, so it shows mirrored.
 */
export function onScreen(run: Run, pos: readonly (CharPos | null)[], s: string): string {
  const chars: { c: string; p: CharPos }[] = [];
  let prev: CharPos | null = null;
  for (let i = run.start; i < run.end; i++) {
    const p = pos[i];
    if (!p || s[i] === "\n" || CONTROL.test(s[i]!)) continue;
    const back = !!prev && sameLine(prev, p) && p.x < prev.x;
    chars.push({ c: back ? MIRROR[s[i]!] ?? s[i]! : s[i]!, p });
    if (!/\s/.test(s[i]!)) prev = p;
  }
  const lines: { c: string; p: CharPos }[][] = [];
  for (const ch of [...chars].sort((a, b) => a.p.y - b.p.y)) {
    const line = lines.find((l) => sameLine(l[0]!.p, ch.p));
    if (line) line.push(ch); else lines.push([ch]);
  }
  return lines.map((l) => l.sort((a, b) => a.p.x - b.p.x).map((ch) => ch.c).join("").replace(/\s+/g, " ").trim()).join(" / ");
}

export interface BidiProblem {
  level: Level;
  /**
   * "mixed": a run in Arabic text; "latin": a paragraph with no Arabic in a right-to-left block, laid out right to left;
   * "arrow": a left arrow laid out left to right, pointing back.
   */
  how: "mixed" | "latin" | "arrow";
  run: string;
  shown: string;
  /** Part of the run is in an isolate (<bdi>, an element with dir, or LRI … PDI) and part isn't. */
  split: boolean;
  /** The whole run is in an isolate (and still comes out wrong). */
  isolated: boolean;
  /** Only the sign or unit of a lone number moved ("96%" as "%96"): Arabic often writes it so; a warning. */
  number: boolean;
}

/**
 * The bidi mistakes in one text of a right-to-left block, found from where its characters were drawn: every
 * left-to-right run must read left to right on the screen. `iso` has "1" for each character inside an isolate in the
 * page (<bdi>, an element with dir); isolates written into the text (LRI … PDI) count too.
 */
export function bidiProblems(s: string, pos: readonly (CharPos | null)[], iso: string): BidiProblem[] {
  const out: BidiProblem[] = arrowProblems(s, pos);
  const inText = controlIsolated(s);
  for (const run of ltrRuns(s)) {
    if (inOrder(run, pos, s)) continue;
    const marks: boolean[] = [];
    for (let i = run.start; i < run.end; i++) if (!blank(s[i]!)) marks.push(iso[i] === "1" || inText[i] === "1");
    const number = NUMBER.test(run.text);
    out.push({
      level: number ? "warn" : "error", how: run.mixed ? "mixed" : "latin", run: run.text, shown: onScreen(run, pos, s),
      split: marks.includes(true) && marks.includes(false), isolated: marks.length > 0 && marks.every(Boolean), number,
    });
  }
  return out;
}

/**
 * A left arrow between two left-to-right words ("19 ← 18", Arabic for "19 → 18") must be laid out right to left, so
 * that it points from the first to the second as the line is read. Laid out left to right, it points back.
 */
export function arrowProblems(s: string, pos: readonly (CharPos | null)[]): BidiProblem[] {
  const out: BidiProblem[] = [];
  const seen = (i: number, step: 1 | -1): number => {
    for (let j = i + step; j >= 0 && j < s.length && s[j] !== "\n"; j += step) if (!blank(s[j]!)) return pos[j] && CORE.test(s[j]!) ? j : -1;
    return -1;
  };
  for (let i = 0; i < s.length; i++) {
    const p = pos[i];
    if (!p || !LEFT.test(s[i]!)) continue;
    const a = seen(i, -1);
    const b = seen(i, 1);
    if (a < 0 || b < 0) continue;
    const pa = pos[a]!, pb = pos[b]!;
    if (!sameLine(pa, p) || !sameLine(pb, p) || !(pa.x < p.x && p.x < pb.x)) continue;
    // The words either side, for the report.
    let from = a, to = b + 1;
    while (from > 0 && !/\s/.test(s[from - 1]!) && !ARABIC.test(s[from - 1]!)) from--;
    while (to < s.length && !/\s/.test(s[to]!) && !ARABIC.test(s[to]!)) to++;
    const run: Run = { start: from, end: to, text: s.slice(from, to).replace(CONTROLS, ""), mixed: true };
    out.push({ level: "error", how: "arrow", run: run.text, shown: onScreen(run, pos, s), split: false, isolated: false, number: false });
  }
  return out;
}

/** What to tell the author about a bidi mistake. */
export function bidiAdvice(p: BidiProblem): string {
  const what = `"${p.run}" reads "${p.shown}" on the screen`;
  if (p.how === "arrow") return `${what}: the arrow ← is laid out left to right, so it points back at the word before it; leave this run right to left`;
  if (p.number) return `${what}: the sign of a lone number moved; isolate it if it should read left to right`;
  if (p.how === "latin") return `${what}: text with no Arabic, laid out right to left (no dir); set dir="ltr" on it`;
  if (p.split) return `${what}: only part of it is isolated; isolate the whole run`;
  if (p.isolated) return `${what}: it is isolated but still laid out right to left; give the isolate dir="ltr"`;
  return `${what}: it isn't isolated; wrap it in <bdi dir="ltr"> (rich())`;
}

/* ---------- findings ---------- */

export type Kind = "offstage" | "overflow" | "overlap" | "font" | "bidi";

export interface Finding {
  level: Level;
  kind: Kind;
  /** The element (data-el), the template part (data-part), and what inside it (a block, a cell, a label). */
  el?: string;
  part?: string;
  sub?: string;
  /** For overlaps: the other text. */
  other?: { el?: string; part?: string; sub?: string };
  message: string;
  /** Moments in the scene (0.5, 0.97) it was seen at. */
  at: number[];
  /** How bad, for sorting and merging: pixels, a share, a font size. */
  amount: number;
  /** The text, shortened. */
  text?: string;
  /** Where on the stage (stage pixels): the box in question, and for an overlap the other one. */
  boxes?: Rect[];
  /** For font sizes: the smallest texts of the scene, smallest first, and how many more are under the warning line. */
  items?: SmallText[];
  more?: number;
}

/** A text too small for the phone: its CSS size, its drawn size on the stage, and its size on the phone. */
export interface SmallText { el?: string; part?: string; sub?: string; text: string; css: number; px: number; phone: number }

/** "headline", "part title", "cnn › block "Embedding"", "template .ls-num" (template text outside any part). */
export function nameOf(x: { el?: string; part?: string; sub?: string }): string {
  if (x.el === undefined && x.part === undefined) return x.sub ? `template ${x.sub}` : "scene";
  const base = x.el ?? `part ${x.part}`;
  return x.sub ? `${base} › ${x.sub}` : base;
}

const keyOf = (f: Finding): string => {
  const pair = [nameOf(f), f.other ? nameOf(f.other) : ""].sort().join("|");
  return `${f.kind}|${pair}|${f.kind === "bidi" ? f.message : ""}`;
};

/** The same finding seen at several moments, once: the worst level, the largest amount, every moment. */
export function merge(findings: readonly Finding[]): Finding[] {
  const by = new Map<string, Finding>();
  for (const f of findings) {
    const k = keyOf(f);
    const have = by.get(k);
    if (!have) { by.set(k, { ...f, at: [...f.at] }); continue; }
    const worse = f.level === "error" && have.level === "warn";
    const bigger = f.kind === "font" ? f.amount < have.amount : f.amount > have.amount;
    if (worse || (f.level === have.level && bigger)) Object.assign(have, { level: f.level, message: f.message, amount: f.amount, other: f.other, boxes: f.boxes });
    for (const t of f.at) if (!have.at.includes(t)) have.at.push(t);
    have.at.sort((a, b) => a - b);
  }
  const order: Kind[] = ["offstage", "overflow", "overlap", "bidi", "font"];
  return [...by.values()].sort((a, b) => (a.level === b.level ? 0 : a.level === "error" ? -1 : 1) || order.indexOf(a.kind) - order.indexOf(b.kind));
}

/* ---------- report ---------- */

export interface SceneResult { id: string; index: number; template: string; findings: Finding[] }
export interface LessonResult {
  id: string;
  lang: string;
  dir: "ltr" | "rtl";
  stage: { orient: string; W: number; H: number };
  timing: string;
  scenes: SceneResult[];
  errors: number;
  warnings: number;
  /** Set when the lesson couldn't be checked at all. */
  failed?: string;
}

/**
 * The template's own text sizes (parts and template text, not the lesson's elements) are the player's, the same in
 * every scene of that template: each is reported at the first scene that has it, with the others listed.
 */
export function onceForTemplates(scenes: SceneResult[]): void {
  const first = new Map<string, Finding>();
  for (const s of scenes) {
    s.findings = s.findings.filter((f) => {
      if (f.kind !== "font" || !f.items?.length || f.items.some((t) => t.el !== undefined)) return true;
      const k = `${s.template}|${f.items.map((t) => `${t.part?.split(":")[0] ?? t.sub}:${Math.round(t.css)}`).sort().join(",")}`;
      const have = first.get(k);
      if (!have) { first.set(k, f); return true; }
      const also = / \(the same in ([^)]*)\)$/;
      const m = have.message.match(also);
      have.message = m ? have.message.replace(also, ` (the same in ${m[1]}, ${s.id})`) : `${have.message} (the same in ${s.id})`;
      return false;
    });
  }
}

/** The font-size finding of a scene: its smallest texts in one line, the worst first. */
export function fontFinding(worst: readonly (SmallText & { level: Level })[], more: number, at: number): Finding | null {
  const w = worst[0];
  if (!w) return null;
  const items = worst.map((t) => {
    const name = nameOf(t);
    const said = t.text && !name.includes(t.text) ? `${name} "${t.text}"` : name;
    const drawn = Math.abs(t.px - t.css) > t.css * 0.05 ? `, drawn at ${Math.round(t.px)} px` : "";
    return `${said} ${Math.round(t.css)} px${drawn} → ${t.phone.toFixed(1)} px`;
  });
  return {
    level: worst.some((t) => t.level === "error") ? "error" : "warn", kind: "font",
    ...(w.el !== undefined ? { el: w.el } : {}), ...(w.part !== undefined ? { part: w.part } : {}), ...(w.sub !== undefined ? { sub: w.sub } : {}),
    message: `on a ${LIMITS.phone} px phone: ${items.join("; ")}` +
      (more ? `; and ${more} more under ${LIMITS.fontWarn} px` : ""),
    at: [at], amount: w.phone, text: w.text,
    items: worst.map(({ level: _l, ...t }) => ({ ...t, css: Math.round(t.css * 10) / 10, px: Math.round(t.px * 10) / 10, phone: Math.round(t.phone * 10) / 10 })),
    more,
  };
}

export function count(scenes: readonly SceneResult[]): { errors: number; warnings: number } {
  let errors = 0, warnings = 0;
  for (const s of scenes) for (const f of s.findings) { if (f.level === "error") errors++; else warnings++; }
  return { errors, warnings };
}

export function totals(lessons: readonly LessonResult[]): { errors: number; warnings: number; byKind: Record<string, { errors: number; warnings: number }>; failed: number } {
  const byKind: Record<string, { errors: number; warnings: number }> = {};
  let errors = 0, warnings = 0, failed = 0;
  for (const l of lessons) {
    if (l.failed) failed++;
    for (const s of l.scenes) for (const f of s.findings) {
      const k = (byKind[f.kind] ??= { errors: 0, warnings: 0 });
      if (f.level === "error") { errors++; k.errors++; } else { warnings++; k.warnings++; }
    }
  }
  return { errors, warnings, byKind, failed };
}

const plural = (n: number, w: string): string => `${n} ${w}${n === 1 ? "" : "s"}`;

/** The readable report for one lesson in one language. */
export function formatLesson(r: LessonResult): string {
  const head = `${r.id} ${r.lang} (${r.dir}, ${r.stage.orient} ${r.stage.W}×${r.stage.H}, ${r.timing} timing): ` +
    (r.failed ? `not checked: ${r.failed}` : r.errors || r.warnings ? `${plural(r.errors, "error")}, ${plural(r.warnings, "warning")}` : "clean");
  const lines = [head];
  for (const s of r.scenes) {
    if (!s.findings.length) continue;
    lines.push(`  ${s.id} (${s.template}, scene ${s.index + 1})`);
    for (const f of s.findings) {
      const at = f.at.length ? ` [at ${f.at.join(", ")}]` : "";
      lines.push(`    ${f.level === "error" ? "error" : "warn "} ${f.kind.padEnd(8)} ${f.message}${at}`);
    }
  }
  return lines.join("\n");
}

export function formatTotals(lessons: readonly LessonResult[]): string {
  const t = totals(lessons);
  const kinds = Object.entries(t.byKind).map(([k, v]) => `${k} ${v.errors}/${v.warnings}`).join(", ");
  return `${plural(lessons.length, "lesson language")} checked${t.failed ? ` (${t.failed} not checked)` : ""}: ` +
    `${plural(t.errors, "error")}, ${plural(t.warnings, "warning")}${kinds ? ` (errors/warnings: ${kinds})` : ""}`;
}
