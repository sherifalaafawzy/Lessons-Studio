// The 12 Darsi tutorial videos as Lesson Studio lessons: each storyboard scene becomes a designed, animated scene.
//   node scripts/darsi/convert.ts            all lessons
//   node scripts/darsi/convert.ts CY-1-1-2   one lesson (--en leaves the Arabic out)
// Inputs, per lesson:
//   content/darsi/source/<ID>.json      the pack's storyboard (English)
//   content/darsi/<id>/ar-EG.json       the Egyptian Arabic (same sentence breaks as the English)
//   content/darsi/<id>/design.json      what each scene shows: lists, cards, steps, a message, a flow, a comparison...
// Output: content/darsi/lessons/<id>/{manifest,scenes}.json. Everything is regenerated from the inputs, so tuning goes
// into design.json, never into the output.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { CastMember, Check, Cue, Element, FlowNode, IconName, Lang, Mood, Scene, Text, TimingFile, Tone, When } from "../../packages/spec/src/index.ts";
import { MARK_PATH, castPath, estimateTiming, findWord, isIcon, normalizeWord, splitSentences, splitWords } from "../../packages/spec/src/index.ts";
import { check, newLesson, presetKeys, toPackage, type Lesson, type Preset } from "../../packages/ops/src/index.ts";
import { DEFAULT_MODEL } from "../../packages/narrate/src/index.ts";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const DIR = join(ROOT, "content", "darsi");
export const AR = "ar-EG";
/** Validator notes every Darsi video gets because of its length (see the command line below). */
export const EXPECTED = new Set(["longLesson", "heavyLesson"]);
export const ORDER = ["AI-1-1-1", "AI-1-1-2", "AI-1-1-3", "AI-1-1-4", "CY-1-1-1", "CY-1-1-2", "CY-1-1-3", "CY-1-1-4", "IOT-1-2-1", "IOT-1-2-2", "IOT-1-2-3", "IOT-1-2-4"];

/* ---------- inputs ---------- */

export interface Story {
  id: string;
  track: "ai" | "cyber" | "iot";
  level: number;
  unit: { number: number; title: string };
  lesson: { number: number; title: string; subtitle?: string };
  video: {
    title: string;
    cast: string[];
    scenes: { n: number; beat: string; voice: string; on_screen_text: string; narration: string; icons?: string[] | null }[];
    checkpoints?: { after_scene: number; prompt: string; options: { text: string; correct: boolean }[]; feedback_correct: string; feedback_wrong: string }[];
  };
}
export interface Arabic {
  title: string;
  subtitle?: string;
  /** The course's title in Egyptian Arabic. Storyboards written after the three packs give it, and their title card then
   *  names the course (story.unit.title) instead of the pack-era track name. */
  unit?: string;
  scenes: Record<string, { narration: string; on_screen_text?: string }>;
  checkpoints: { prompt: string; options: string[]; feedback_correct: string; feedback_wrong?: string }[];
}

/** Text as authored: one string for every language, or one per language ({"en": ..., "ar-EG": ...}). */
export type AText = string | Record<string, string>;
/** Something shown on screen. It arrives as sentence `s` (0-based) of the scene's narration starts, plus `o` seconds
 *  (for an item named late in a long sentence); without `s`, as the English sentence that names it starts, else in order. */
export interface Item { icon?: string; text: AText; s?: number; o?: number; tone?: "ok" | "danger" | "accent" | "muted" }
export interface Column { title: AText; icon?: string; tone?: "ok" | "danger" | "accent"; s?: number; items: Item[] }

/** What a scene shows (design.json). One body: cards, list, steps, message, flow, compare, big or chart. */
export interface Design {
  layout?: "title" | "hook" | "quiz" | "recap" | "canvas";
  /** The line at the top; default the storyboard's on-screen text. null: none. */
  headline?: AText | null;
  /** A cast member beside the body (default: whoever speaks); null: nobody. */
  who?: CastMember | null;
  mood?: Mood;
  /** A big icon on the empty side of a list (when nobody is shown there). */
  aside?: string;
  /** The hook's speech bubble (default: the first sentence, when a cast member speaks). */
  quote?: AText;
  cards?: Item[];
  /** Arrows from each card to the next (a chain of events). */
  arrows?: boolean;
  list?: Item[];
  steps?: Item[];
  message?: {
    kind: "sms" | "chat" | "email"; from: AText; time?: string; subject?: AText; lines: AText[]; link?: string;
    flags?: { line: number | "from" | "link"; text: AText; s?: number }[];
  };
  flow?: { nodes: { id: string; icon?: string; text: AText; tone?: FlowNode["tone"]; s?: number }[]; edges: [string, string][] };
  compare?: { left: Column; right: Column };
  big?: { value: AText; label?: AText; icon?: string; s?: number };
  chart?: { kind: "bar" | "line"; data: number[]; labels?: AText[]; max?: number; unit?: AText; s?: number };
  /** Recap: the points (default: the on-screen text split on "·") and a closing line. */
  points?: Item[];
  takeaway?: AText;
  /** A scene made by hand (its narration still comes from the storyboard and the translation). */
  scene?: Omit<Scene, "id" | "narration">;
}
export interface LessonDesign { scenes: Record<string, Design> }

const TRACK: Record<Story["track"], { name: Record<string, string>; icon: IconName }> = {
  ai: { name: { en: "AI basics", [AR]: "أساسيات الذكاء الاصطناعي" }, icon: "bot" },
  cyber: { name: { en: "Cyber safety", [AR]: "الأمان الرقمي" }, icon: "shield" },
  iot: { name: { en: "Sensors and IoT", [AR]: "الحساسات وإنترنت الأشياء" }, icon: "chip" },
};
const CAST_KEYS: CastMember[] = ["amina", "okafor", "salma", "joseph", "farah"];

/** Who voices whom, from Gemini TTS's prebuilt voices, with how each person speaks (from the packs' writer guide).
 *  `npm run narrate` adds each language's own hint (Egyptian Arabic for ar-EG); the Arabic is a dub, so no accents. */
const NARRATOR = { name: "Sulafat", style: "The Darsi narrator: warm, friendly and clear, a teacher talking to fellow teachers. Steady pace." };
const CAST_VOICES: Record<CastMember, { name: string; en: string; ar: string }> = {
  amina: {
    name: "Aoede",
    en: "Amina, a practical and curious primary teacher from northern Nigeria, with a light Nigerian English accent. Warm and natural.",
    ar: "Amina, a practical and curious primary teacher. Warm and natural.",
  },
  okafor: {
    name: "Puck",
    en: "Mr Okafor, an enthusiastic Grade 8 science teacher from Nigeria, with a light Nigerian English accent. Upbeat.",
    ar: "Mr Okafor, an enthusiastic science teacher. Upbeat.",
  },
  salma: {
    name: "Kore",
    en: "Ms Salma, a careful, sceptical maths teacher with a dry sense of humour and a light Arabic accent.",
    ar: "Ms Salma, a careful, sceptical maths teacher with a dry sense of humour.",
  },
  joseph: {
    name: "Sadaltager",
    en: "Mr Joseph, a calm computer studies teacher from Kenya, with a light Kenyan English accent: the colleague others ask for tech help.",
    ar: "Mr Joseph, a calm computer studies teacher: the colleague others ask for tech help.",
  },
  farah: {
    name: "Erinome",
    en: "Dr Farah, a thoughtful university lecturer in education from Bangladesh, with a light Bangladeshi English accent. Clear.",
    ar: "Dr Farah, a thoughtful university lecturer in education. Clear.",
  },
};
const castOf = (voice: string): CastMember | null => CAST_KEYS.find((k) => voice.toLowerCase().includes(k)) ?? null;
const STOP_WORDS = new Set("the and that this with from your you for are was were have has not but they them their what when then than into about just like will can its our out who how why one two all any".split(" "));

/* ---------- timing ---------- */

const clean = (w: string): string => w.replace(/^[“”"«»'‘’(\[]+|[“”"«»'‘’.,،;؛:!?؟…)\]]+$/g, "");
const round = (n: number): number => Math.round(n * 100) / 100;

function timingOf(narration: string, lang: Lang) {
  return estimateTiming([{ id: "x", template: "canvas", narration: { [lang]: narration }, content: { elements: [] } }], lang).scenes[0]!;
}

/** A scene's narration in every language, sentence by sentence, for anchoring animations to what is said. */
class Narration {
  readonly sentences: Record<Lang, string[]> = {};
  readonly n: number;
  readonly langs: Lang[];
  private readonly st: Record<Lang, ReturnType<typeof timingOf>> = {};
  constructor(langs: Lang[], text: Record<Lang, string>, where: string) {
    this.langs = langs;
    for (const l of langs) {
      this.sentences[l] = splitSentences(text[l]!);
      this.st[l] = timingOf(text[l]!, l);
    }
    this.n = this.sentences.en!.length;
    for (const l of langs) {
      if (this.sentences[l]!.length !== this.n) {
        throw new Error(`${where}: ${l} has ${this.sentences[l]!.length} sentences, English has ${this.n} (keep the same sentence breaks)`);
      }
    }
  }
  /** A word from sentence k of language l that is said exactly once in the scene. */
  private unique(l: Lang, k: number): string | null {
    for (const raw of splitWords(this.sentences[l]![k] ?? "")) {
      const w = clean(raw);
      if (normalizeWord(w).length < 3) continue;
      if (findWord(this.st[l]!, w, 1) !== null && findWord(this.st[l]!, w, 2) === null) return w;
    }
    return null;
  }
  /** The moment sentence k starts being said, in every language (each on its own word), plus an offset. */
  at(k: number, offset = 0): When {
    const kk = Math.max(0, Math.min(Math.round(k), this.n - 1));
    const word: Record<string, string> = {};
    for (const l of this.langs) {
      const w = this.unique(l, kk);
      if (!w) return kk > 0 ? this.at(kk - 1, offset + 1.5) : round(0.3 + offset);
      word[l] = w;
    }
    return offset ? { word, offset: round(offset) } : { word };
  }
  /** The first English sentence (from `from` on) that names any of these words, else `fallback`. */
  find(words: string[], fallback: number, from = 0): number {
    const keys = words.map((w) => normalizeWord(clean(w))).filter((w) => w.length >= 4 && !STOP_WORDS.has(w));
    if (!keys.length) return fallback;
    for (let k = from; k < this.n; k++) {
      const ws = splitWords(this.sentences.en![k]!).map((w) => normalizeWord(clean(w)));
      const hit = ws.some((w) => keys.some((key) => w === key || (w.startsWith(key.slice(0, Math.max(4, key.length - 2))) && Math.abs(w.length - key.length) <= 3)));
      if (hit) return k;
    }
    return fallback;
  }
}

const anim = <E extends Element>(el: E, preset: Preset, at: When, dur?: number): E => ({ ...el, anim: presetKeys(el, preset, at, dur) });
const shift = (w: When, by: number): When => (typeof w === "number" ? round(w + by) : { ...w, offset: round((w.offset ?? 0) + by) });
const enOf = (t: AText): string => (typeof t === "string" ? t : t.en ?? "");

/* ---------- the converter ---------- */

export function convert(story: Story, ar: Arabic | null, design: LessonDesign = { scenes: {} }, nextTitle?: Text): Lesson {
  const langs: Lang[] = ar ? ["en", AR] : ["en"];
  const tx = (en: string, arText: string | undefined, what: string): Text => {
    if (!ar) return { en };
    if (!arText) throw new Error(`${story.id}: no Egyptian Arabic for ${what}`);
    return { en, [AR]: arText };
  };
  /** Authored text, for this lesson's languages only. */
  const T: TFn = (t, what) => {
    if (typeof t === "string") return t;
    const out: Record<string, string> = {};
    for (const l of langs) {
      if (!t[l]) throw new Error(`${story.id}: no ${l} for ${what}`);
      out[l] = t[l]!;
    }
    return out;
  };
  const icon: IconFn = (name, where) => {
    if (name === undefined) return undefined;
    if (!isIcon(name)) throw new Error(`${where}: unknown icon "${name}"`);
    return name as IconName;
  };

  const v = story.video;
  const mainCast = v.cast.map(castOf).find((c): c is CastMember => !!c) ?? "salma";
  const tn = TRACK[story.track].name;

  const lesson = newLesson({
    id: story.id.toLowerCase(),
    title: tx(story.lesson.title, ar?.title, "the title"),
    ...(story.lesson.subtitle ? { summary: tx(story.lesson.subtitle, ar?.subtitle, "the subtitle") } : {}),
    languages: [{ code: "en", name: "English" }, ...(ar ? [{ code: AR, name: "العربية المصرية" }] : [])],
    brand: "darsi-light",
    stage: "landscape",
    topic: story.track,
    level: story.level,
    createdBy: "Darsi course pack",
    tool: `Lesson Studio (from the ${story.unit.title} pack storyboard)`,
  });
  lesson.manifest.ai = { script: "ai-assisted", translation: ar ? "ai" : "none", narration: "none", visuals: "ai-assisted", avatar: "none" };
  if (ar) lesson.manifest.languages[1]!.quality = "machine";
  lesson.manifest.provenance.sources = [{ title: `Darsi course pack ${story.id.split("-").slice(0, 3).join("-")}: ${story.unit.title}` }];
  // The narrator and the cast members who speak in this lesson, per language.
  const speakers = [...new Set(v.scenes.map((s) => castOf(s.voice)).filter((c): c is CastMember => !!c))];
  for (const track of lesson.manifest.languages) {
    const en = track.code === "en";
    track.voice = { provider: "gemini", model: DEFAULT_MODEL, ...NARRATOR };
    track.voices = Object.fromEntries(speakers.map((who) => [who, { provider: "gemini", model: DEFAULT_MODEL, name: CAST_VOICES[who].name, style: en ? CAST_VOICES[who].en : CAST_VOICES[who].ar }]));
  }

  const scenes: Scene[] = [];
  for (const s of v.scenes) {
    const where = `${story.id} scene ${s.n}`;
    const sa = ar?.scenes[String(s.n)];
    if (ar && !sa) throw new Error(`${where}: no Egyptian Arabic`);
    const narration: Record<Lang, string> = { en: s.narration, ...(sa ? { [AR]: sa.narration } : {}) };
    const d: Design = design.scenes[String(s.n)] ?? {};
    const sid = `s${String(s.n).padStart(2, "0")}`;
    const speaker = castOf(s.voice);
    if (d.scene) {
      scenes.push({ ...(d.scene as Scene), id: sid, narration, ...(speaker ? { speaker } : {}) } as Scene);
      continue;
    }
    const N = new Narration(langs, narration, where);
    const cp = v.checkpoints?.find((c) => c.after_scene === s.n);
    const cpi = cp ? v.checkpoints!.indexOf(cp) : -1;
    const layout = d.layout ?? (
      s.beat === "Title" ? "title"
        : s.beat.startsWith("Checkpoint") && cp ? "quiz"
        : s.beat === "Recap" ? "recap"
        : s.beat === "Hook" ? "hook"
        : "canvas");
    const ost = s.on_screen_text ? tx(s.on_screen_text, sa?.on_screen_text, `scene ${s.n} on-screen text`) : null;
    const headline: Text | null = d.headline === null ? null : d.headline !== undefined ? T(d.headline, `${where} headline`) : ost;

    /** When each item arrives: its own sentence, the sentence that names it, or spread in order. Items on the same
     *  sentence follow each other 0.5 s apart, and no item comes before the one listed above it. */
    const anchors = (items: { s?: number; o?: number; text: AText }[]): When[] => {
      const taken = new Map<number, number>();
      let last = 0;
      return items.map((it, i) => {
        const spread = Math.min(N.n - 1, Math.round(((i + 1) * N.n) / (items.length + 1)));
        const k = it.s ?? Math.max(last, N.find(splitWords(enOf(it.text)), Math.max(last, spread), last));
        last = k;
        const nth = taken.get(k) ?? 0;
        taken.set(k, nth + 1);
        return N.at(k, it.o ?? nth * 0.5);
      });
    };
    const reveal = (target: string, at: When): Cue => (typeof at === "number"
      ? { at, action: "reveal", target }
      : { word: at.word, ...(at.offset ? { offset: at.offset } : {}), action: "reveal", target }) as Cue;

    let scene: Scene;
    if (layout === "title") {
      scene = {
        id: sid, template: "title-hook", narration, transition: { type: "zoom" },
        content: {
          kicker: ar?.unit ? tx(story.unit.title, ar.unit, "the course title") : tx(tn.en!, tn[AR], "the track"), title: lesson.manifest.title,
          ...(lesson.manifest.summary ? { hook: lesson.manifest.summary } : {}), icon: TRACK[story.track].icon,
        },
        overlays: [anim({ id: "mark", type: "image", src: MARK_PATH, x: 56, y: 40, w: 70, h: 72, fit: "contain" }, "pop", 0.2)],
      };
    } else if (layout === "quiz") {
      const a = ar?.checkpoints[cpi];
      const q: Check = {
        type: "single-choice", id: `${sid}-check`,
        prompt: tx(cp!.prompt, a?.prompt, `checkpoint ${cpi + 1}`),
        options: cp!.options.map((o, i) => ({ id: "abcde"[i]!, text: tx(o.text, a?.options[i], `checkpoint ${cpi + 1} option ${i + 1}`) })),
        answer: "abcde"[cp!.options.findIndex((o) => o.correct)]!,
        explain: tx(cp!.feedback_correct, a?.feedback_correct, `checkpoint ${cpi + 1} feedback`),
      };
      scene = { id: sid, template: "quiz", narration, transition: { type: "slide" }, content: { ...(headline ? { title: headline } : {}) }, check: q };
    } else if (layout === "recap") {
      const items: Item[] = d.points ?? (() => {
        const pe = s.on_screen_text.split(/\s*[·•|]\s*/).filter(Boolean);
        const pa = (sa?.on_screen_text ?? "").split(/\s*[،·•|]\s*/).filter(Boolean);
        if (ar && pa.length !== pe.length) throw new Error(`${where}: the recap's Arabic on-screen text needs ${pe.length} points split with "،"`);
        return pe.map((p, i): Item => ({ text: ar ? { en: p, [AR]: pa[i]! } : { en: p } }));
      })();
      const at = anchors(items);
      scene = {
        id: sid, template: "summary", narration,
        content: {
          title: tx("Remember", "افتكر", "the recap title"),
          points: items.map((p, i) => T(p.text, `${where} point ${i + 1}`)),
          ...(d.takeaway ? { takeaway: T(d.takeaway, `${where} takeaway`) } : {}),
        },
        cues: [...items.map((_, i) => reveal(String(i + 1), at[i]!)), ...(d.takeaway ? [reveal("takeaway", N.at(N.n - 1))] : [])],
      };
    } else if (d.steps) {
      const at = anchors(d.steps);
      scene = {
        id: sid, template: "steps", narration,
        content: { ...(headline ? { title: headline } : {}), steps: d.steps.map((it, i) => T(it.text, `${where} step ${i + 1}`)) },
        cues: d.steps.map((_, i) => reveal(String(i + 1), at[i]!)),
      };
    } else if (d.message) {
      const m = d.message;
      const flags = m.flags ?? [];
      const at = anchors(flags);
      scene = {
        id: sid, template: "message-mock", narration,
        content: {
          kind: m.kind, from: T(m.from, `${where} sender`), ...(m.time ? { time: m.time } : {}),
          ...(m.subject ? { subject: T(m.subject, `${where} subject`) } : {}),
          lines: m.lines.map((l, i) => T(l, `${where} line ${i + 1}`)),
          ...(m.link ? { link: m.link } : {}),
          flags: flags.map((f, i) => ({ id: `f${i + 1}`, line: f.line, label: T(f.text, `${where} flag ${i + 1}`) })),
        },
        cues: flags.map((_, i) => reveal(`f${i + 1}`, at[i]!)),
      };
    } else if (d.flow) {
      const f = d.flow;
      const at = anchors(f.nodes);
      scene = {
        id: sid, template: "flow", narration,
        content: {
          ...(headline ? { title: headline } : {}),
          nodes: f.nodes.map((nd) => ({ id: nd.id, label: T(nd.text, `${where} node ${nd.id}`), ...(nd.icon ? { icon: icon(nd.icon, where)! } : {}), ...(nd.tone ? { tone: nd.tone } : {}) })),
          edges: f.edges.map(([from, to]) => ({ from, to })),
        },
        cues: f.nodes.map((nd, i) => reveal(nd.id, at[i]!)),
      };
    } else {
      // A canvas scene: a headline (or the speaker's words in a bubble), a body, and maybe a cast member.
      const tryIt = s.beat.startsWith("Try it");
      const who: CastMember | null = d.who !== undefined ? d.who : layout === "hook" || tryIt ? (speaker ?? mainCast) : speaker;
      const mood: Mood = d.mood ?? (layout === "hook" && !speaker ? "curious" : s.beat === "Reveal" || s.beat.startsWith("Try it") ? "happy" : speaker ? "talking" : "smile");
      const els: Element[] = [];
      const aside = !who && d.list ? icon(d.aside, where) : undefined;
      const right = who ? 800 : aside ? 860 : 1190;
      let top = 70;
      const quote = d.quote ?? (layout === "hook" && speaker ? Object.fromEntries(langs.map((l) => [l, N.sentences[l]![0]!])) : undefined);
      if (quote) {
        els.push(
          anim({ id: "bubble", type: "shape", shape: "rect", x: 90, y: 70, w: right - 90, h: 200, fill: "surface", stroke: "line", strokeWidth: 3, radius: 28 }, "pop", N.at(0), 0.45),
          anim({ id: "quote", type: "text", x: 124, y: 100, w: right - 158, size: 34, weight: 700, text: T(quote, `${where} quote`) }, "type", shift(N.at(0), 0.2), 1.4),
        );
        top = 300;
      } else if (headline) {
        const ok = s.beat === "Reveal";
        if (ok) els.push(anim({ id: "badge", type: "icon", icon: "circlecheck", x: 90, y: 60, w: 72, h: 72, tone: "ok" }, "pop", N.at(0), 0.45));
        els.push(anim({ id: "headline", type: "text", x: ok ? 186 : 90, y: 66, w: right - (ok ? 186 : 90), size: 48, weight: 800, text: headline }, "rise", N.at(0)));
        top = 210;
      }
      const body: Box = { x: 90, y: top, w: right - 90, h: 610 - top };
      if (d.list) els.push(...listEls(d.list, anchors(d.list), body, T, icon, where));
      else if (d.compare) els.push(...compareEls(d.compare, N, anchors, body, T, icon, where));
      else if (d.big) els.push(...bigEls(d.big, N.at(d.big.s ?? 0, d.big.s === undefined ? 0.4 : 0), body, T, icon, where));
      else if (d.chart) els.push(...chartEls(d.chart, N.at(d.chart.s ?? Math.min(1, N.n - 1)), body, T, where));
      else {
        const cards: Item[] = d.cards ?? (s.icons ?? []).filter((i) => isIcon(i)).slice(0, 4).map((i, k) => ({ icon: i, text: "", s: N.find(KEYWORDS[i] ?? [i], Math.min(k + 1, N.n - 1)) }));
        els.push(...cardEls(cards, anchors(cards), body, T, icon, where, d.arrows));
      }
      if (aside) {
        els.push(
          anim({ id: "aside", type: "shape", shape: "ellipse", x: 900, y: 220, w: 300, h: 300, fill: "surface", stroke: "line", strokeWidth: 3 }, "pop", N.at(0), 0.5),
          anim({ id: "asideicon", type: "icon", icon: aside, x: 975, y: 295, w: 150, h: 150, tone: "accent" }, "pop", shift(N.at(0), 0.1), 0.5),
        );
      }
      if (tryIt && nextTitle) {
        els.push(anim({ id: "next", type: "text", x: 90, y: 610, w: right - 90, size: 28, weight: 700, tone: "accent", text: nextTitle }, "rise", N.at(N.n - 1, 1)));
      }
      if (who) els.push(anim({ id: "who", type: "image", src: castPath(who, mood), x: 840, y: 290, w: 400, h: 410, fit: "contain" }, "rise", N.at(0), 0.6));
      scene = { id: sid, template: "canvas", narration, transition: { type: layout === "hook" ? "cut" : "fade" }, content: { elements: els } };
    }
    if (speaker) scene.speaker = speaker;
    scenes.push(scene);
  }
  lesson.scenes.scenes = scenes;
  return lesson;
}

/* ---------- canvas bodies ---------- */

type Box = { x: number; y: number; w: number; h: number };
type TFn = (t: AText, what: string) => Text;
type IconFn = (name: string | undefined, where: string) => IconName | undefined;
const toneOf = (t: Item["tone"]): Tone => (t === "ok" ? "ok" : t === "danger" ? "danger" : t === "muted" ? "muted" : "accent");
/** A card's or tile's outline: the item's colour, or the plain line for the default and for grey. */
const strokeOf = (t: Item["tone"]): Tone => (t && t !== "muted" ? toneOf(t) : "line");

/** Rows of icon and text, each arriving on its sentence. */
function listEls(items: Item[], at: When[], b: Box, T: TFn, icon: IconFn, where: string): Element[] {
  const row = Math.min(104, b.h / items.length);
  const size = Math.round(Math.min(38, row * 0.44));
  const tile = Math.round(Math.min(72, row - 16));
  return items.flatMap((it, i) => {
    const y = Math.round(b.y + i * row);
    const ic = icon(it.icon, where);
    const out: Element[] = [];
    if (ic) {
      out.push(
        anim({ id: `tile${i + 1}`, type: "shape", shape: "rect", x: b.x, y, w: tile, h: tile, fill: "surface", stroke: strokeOf(it.tone), strokeWidth: 3, radius: 18 }, "pop", at[i]!, 0.4),
        anim({ id: `icon${i + 1}`, type: "icon", icon: ic, x: b.x + Math.round(tile * 0.2), y: y + Math.round(tile * 0.2), w: Math.round(tile * 0.6), h: Math.round(tile * 0.6), tone: toneOf(it.tone) }, "pop", at[i]!, 0.45),
      );
    }
    const x = ic ? b.x + tile + 26 : b.x;
    out.push(anim({ id: `text${i + 1}`, type: "text", x, y: y + Math.max(0, Math.round((tile - size * 1.3) / 2)), w: b.x + b.w - x, size, weight: 700, text: T(it.text, `${where} item ${i + 1}`) }, "rise", at[i]!, 0.45));
    return out;
  });
}

/** Icon cards in a row, with a label under each icon. */
function cardEls(items: Item[], at: When[], b: Box, T: TFn, icon: IconFn, where: string, arrows = false): Element[] {
  const n = items.length;
  if (!n) return [];
  const gap = arrows ? 64 : 28;
  const w = Math.round(Math.min(250, (b.w - gap * (n - 1)) / n));
  const labelled = items.some((it) => enOf(it.text));
  const h = labelled ? Math.round(w * 1.08) : w;
  const x0 = b.x + (b.w - (n * w + (n - 1) * gap)) / 2;
  const y = Math.round(b.y + Math.max(0, (b.h - h) / 2) * 0.6);
  return items.flatMap((it, i) => {
    const x = Math.round(x0 + i * (w + gap));
    const ic = icon(it.icon, where);
    const iw = Math.round(w * (labelled ? 0.4 : 0.46));
    const out: Element[] = [
      anim({ id: `card${i + 1}`, type: "shape", shape: "rect", x, y, w, h, fill: "surface", stroke: strokeOf(it.tone), strokeWidth: 3, radius: 24 }, "pop", at[i]!, 0.45),
    ];
    if (ic) out.push(anim({ id: `icon${i + 1}`, type: "icon", icon: ic, x: x + Math.round((w - iw) / 2), y: y + Math.round(labelled ? h * 0.12 : (h - iw) / 2), w: iw, h: iw, tone: toneOf(it.tone) }, "pop", at[i]!, 0.5));
    if (arrows && i > 0) out.push(anim({ id: `arrow${i}`, type: "line", x: x - gap + 10, y: y + Math.round(h / 2), x2: x - 10, y2: y + Math.round(h / 2), arrow: "end", strokeWidth: 4, tone: "muted" }, "draw", shift(at[i]!, -0.3), 0.3));
    if (labelled) out.push(anim({ id: `label${i + 1}`, type: "text", x: x + 12, y: y + Math.round(h * 0.58), w: w - 24, size: w < 200 ? 24 : 27, weight: 700, align: "center", text: T(it.text, `${where} card ${i + 1}`) }, "fade-in", shift(at[i]!, 0.15), 0.4));
    return out;
  });
}

/** Two columns side by side (yes and no, before and after), each item arriving on its sentence. */
function compareEls(c: { left: Column; right: Column }, N: Narration, anchors: (items: Item[]) => When[], b: Box, T: TFn, icon: IconFn, where: string): Element[] {
  const gap = 40;
  const w = Math.round((b.w - gap) / 2);
  const out: Element[] = [];
  ([["l", c.left, b.x], ["r", c.right, b.x + w + gap]] as const).forEach(([k, col, x]) => {
    const head = col.s !== undefined ? N.at(col.s) : anchors([{ text: col.title }])[0]!;
    const tone = toneOf(col.tone);
    const ic = icon(col.icon, where);
    out.push(anim({ id: `${k}card`, type: "shape", shape: "rect", x, y: b.y, w, h: b.h, fill: "surface", stroke: tone, strokeWidth: 4, radius: 26 }, "pop", head, 0.4));
    if (ic) out.push(anim({ id: `${k}icon`, type: "icon", icon: ic, x: x + 28, y: b.y + 26, w: 56, h: 56, tone }, "pop", head, 0.45));
    out.push(anim({ id: `${k}title`, type: "text", x: x + (ic ? 100 : 28), y: b.y + 34, w: w - (ic ? 128 : 56), size: 34, weight: 800, tone, text: T(col.title, `${where} column title`) }, "fade-in", head, 0.4));
    const at = anchors(col.items);
    const row = Math.min(86, (b.h - 120) / Math.max(1, col.items.length));
    col.items.forEach((it, i) => {
      const y = Math.round(b.y + 112 + i * row);
      const iic = icon(it.icon, where);
      if (iic) out.push(anim({ id: `${k}i${i + 1}`, type: "icon", icon: iic, x: x + 30, y: y + 2, w: 38, h: 38, tone: it.tone ? toneOf(it.tone) : tone }, "pop", at[i]!, 0.4));
      out.push(anim({ id: `${k}t${i + 1}`, type: "text", x: x + (iic ? 84 : 30), y, w: w - (iic ? 108 : 60), size: 30, weight: 600, text: T(it.text, `${where} column item ${i + 1}`) }, "rise", at[i]!, 0.4));
    });
  });
  return out;
}

/** One big number or word, with a label. */
function bigEls(g: NonNullable<Design["big"]>, at: When, b: Box, T: TFn, icon: IconFn, where: string): Element[] {
  const out: Element[] = [];
  const ic = icon(g.icon, where);
  let y = b.y + 10;
  if (ic) {
    out.push(anim({ id: "bigicon", type: "icon", icon: ic, x: b.x + Math.round(b.w / 2) - 50, y, w: 100, h: 100, tone: "accent" }, "pop", at, 0.45));
    y += 120;
  }
  out.push(anim({ id: "big", type: "text", x: b.x, y, w: b.w, size: 120, weight: 800, align: "center", tone: "accent", text: T(g.value, `${where} big value`) }, "grow", shift(at, 0.15), 0.5));
  if (g.label) out.push(anim({ id: "biglabel", type: "text", x: b.x, y: y + 160, w: b.w, size: 36, weight: 700, align: "center", tone: "muted", text: T(g.label, `${where} big label`) }, "rise", shift(at, 0.4), 0.45));
  return out;
}

/** A bar or line chart that draws itself, with each bar's value over it. */
function chartEls(c: NonNullable<Design["chart"]>, at: When, b: Box, T: TFn, where: string): Element[] {
  const w = Math.min(b.w, 900);
  const x = b.x + Math.round((b.w - w) / 2);
  const h = Math.min(b.h - 40, 340);
  const y = b.y + 40;
  const dur = round(Math.min(3, 0.6 + c.data.length * 0.3));
  const out: Element[] = [
    anim({ id: "chart", type: "chart", kind: c.kind, x, y, w, h, data: c.data, ...(c.max ? { max: c.max } : {}), ...(c.labels ? { labels: c.labels.map((l, i) => T(l, `${where} chart label ${i + 1}`)) } : {}), tone: "accent" }, "type", at, dur),
  ];
  if (c.kind === "bar") {
    // Bar i finishes growing at about (i * 0.6 + 1) / (n * 0.6 + 0.4) of the reveal (the player's own stagger).
    const n = c.data.length;
    const max = c.max ?? Math.max(...c.data);
    const plotH = h - (c.labels ? 40 : 0) - 8;
    const step = w / n;
    c.data.forEach((val, i) => {
      const top = y + plotH - (val / max) * plotH;
      out.push(anim({ id: `val${i + 1}`, type: "text", x: Math.round(x + step * i), y: Math.round(top - 38), w: Math.round(step), size: 26, weight: 700, align: "center", fixed: true, text: String(val) }, "fade-in", shift(at, round(dur * Math.min(1, (i * 0.6 + 1) / (n * 0.6 + 0.4)))), 0.3));
    });
  }
  if (c.unit) out.push(anim({ id: "unit", type: "text", x, y: y - 40, w, size: 24, weight: 600, tone: "muted", text: T(c.unit, `${where} chart unit`) }, "fade-in", at, 0.4));
  return out;
}

/** Words that tell which sentence a storyboard icon belongs to, for scenes without a design. */
const KEYWORDS: Record<string, string[]> = {
  phone: ["phone", "call", "text"], chat: ["chat", "message", "reply"], banknote: ["salary", "money", "bank", "pay"], mail: ["email", "mail"],
  warning: ["warning", "danger", "threat", "scam"], clock: ["urgent", "fast", "today", "hours", "time"], key: ["password", "code", "key"],
  lock: ["lock", "locked"], package: ["prize", "gift", "delivery"], hand: ["stop", "hand"], circlecheck: ["check", "correct", "safe"],
  school: ["school", "class", "classroom"], users: ["group", "pupils", "colleagues", "people"], flag: ["report", "flag"], file: ["file", "document"],
};

/* ---------- files and the command line ---------- */

const readJson = <J>(p: string): J | null => (existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")) as J) : null);
export const loadStory = (id: string): Story => readJson<Story>(join(DIR, "source", `${id.toUpperCase()}.json`))!;
export const loadArabic = (id: string): Arabic | null => readJson<Arabic>(join(DIR, id.toLowerCase(), `${AR}.json`));
export const loadDesign = (id: string): LessonDesign => readJson<LessonDesign>(join(DIR, id.toLowerCase(), "design.json")) ?? { scenes: {} };

/** Carries narration over from the lesson already written in `out`: each narrated language's audio, its assets, and
 *  its measured timing (returned, for the checks). */
export function keepNarration(lesson: Lesson, out: string): Record<string, TimingFile> {
  const old = readJson<Lesson["manifest"]>(join(out, "manifest.json"));
  const timings: Record<string, TimingFile> = {};
  if (!old) return timings;
  for (const track of lesson.manifest.languages) {
    const was = old.languages.find((l) => l.code === track.code);
    if (!was?.audio || !existsSync(join(out, was.audio)) || !existsSync(join(out, track.timing))) continue;
    timings[track.code] = JSON.parse(readFileSync(join(out, track.timing), "utf8")) as TimingFile;
    track.audio = was.audio;
    if (was.audioFallback) track.audioFallback = was.audioFallback;
    track.duration = was.duration;
    for (const a of old.assets ?? []) {
      if (a.path === was.audio || a.path === was.audioFallback) (lesson.manifest.assets ??= []).push(a);
    }
  }
  if (Object.keys(timings).length) lesson.manifest.ai.narration = "synthetic";
  return timings;
}

/** Converts one lesson from its files; `english` leaves the Arabic out even when it exists. */
export function build(id: string, english = false): Lesson {
  const ID = id.toUpperCase();
  const ar = english ? null : loadArabic(ID);
  const nextId = ORDER[ORDER.indexOf(ID) + 1];
  const next = nextId && nextId.slice(0, -2) === ID.slice(0, -2) ? loadStory(nextId) : null;
  const nextAr = next ? loadArabic(next.id) : null;
  const nextTitle: Text | undefined = !next ? undefined
    : !ar ? { en: `Next: ${next.lesson.title}` }
    : nextAr ? { en: `Next: ${next.lesson.title}`, [AR]: `الدرس الجاي: ${nextAr.title}` }
    : undefined;
  return convert(loadStory(ID), ar, loadDesign(ID), nextTitle);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const english = args.includes("--en");
  const ids = args.filter((a) => !a.startsWith("--")).map((x) => x.toUpperCase());
  let bad = 0;
  for (const id of ids.length ? ids : ORDER) {
    try {
      const lesson = build(id, english);
      const out = join(DIR, "lessons", id.toLowerCase());
      // Narration made by `npm run narrate` stays (audio, measured timings); the checks then use those timings, so
      // narration that no longer matches its text shows up as "timingStale" and needs narrating again.
      const timings = keepNarration(lesson, out);
      const r = check(lesson, timings);
      mkdirSync(out, { recursive: true });
      writeFileSync(join(out, "manifest.json"), `${JSON.stringify(lesson.manifest, null, 1)}\n`);
      writeFileSync(join(out, "scenes.json"), `${JSON.stringify(lesson.scenes, null, 1)}\n`);
      const words = lesson.scenes.scenes.reduce((n, s) => n + splitWords(s.narration.en ?? "").length, 0);
      // Expected for the Darsi videos, which are 3 to 4 minutes by design: "longLesson" (over 150 s) and, once
      // narrated, "heavyLesson" (3 minutes of Opus is about 330 KB, over the 300 KB meant for a 90-second lesson).
      const issues = [...r.errors, ...r.warnings.filter((w) => !EXPECTED.has(w.code))];
      const pkg = toPackage(lesson, timings);
      const secs = lesson.manifest.languages.map((l) => `${l.code} ${Math.round(pkg.timing[l.code]!.duration)} s${timings[l.code] ? ` (${timings[l.code]!.source})` : ""}`);
      console.log(`${id}: ${lesson.scenes.scenes.length} scenes, ${words} words, ${secs.join(" + ")}, ${r.errors.length} errors, ${issues.length - r.errors.length} warnings`);
      for (const e of issues.slice(0, 12)) console.log(`   ${e.code} ${e.path}${e.detail ? ` (${e.detail})` : ""}`);
      if (issues.length) bad++;
    } catch (e) {
      console.log(`${id}: ${(e as Error).message}`);
      bad++;
    }
  }
  process.exit(bad ? 1 : 0);
}
