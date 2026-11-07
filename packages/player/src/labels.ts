import type { AiDisclosure } from "@lessonstudio/spec";

export interface Labels {
  play: string;
  pause: string;
  seek: string;
  speed: string;
  captions: string;
  transcript: string;
  check: string;
  correct: string;
  wrong: string;
  next: string;
  replay: string;
  done: string;
  ai: string;
  aiParts: { script: string; translation: string; voice: string };
  /** Option letters for quiz answers. */
  letters: string[];
  /** Joins list items. Arabic uses "،", never "·". */
  sep: string;
  chapters: string;
  /** The next scene, as on a video player's next button. */
  nextScene: string;
  volume: string;
  mute: string;
  unmute: string;
  fullscreen: string;
  /** Which language's captions (and narration) to play. */
  captionLang: string;
  settings: string;
  captionSize: string;
  sizes: [string, string, string];
  captionBg: string;
  /** "{n}" right out of "{m}" quick checks; the player writes the numbers in the lesson language's digits. */
  score: string;
  /** What a screen reader says for the progress line: "{t}" (where it is) of "{d}" (the length), in the lesson's digits. */
  position: string;
}

const EN: Labels = {
  play: "Play",
  pause: "Pause",
  seek: "Lesson position",
  speed: "Speed",
  captions: "Captions",
  transcript: "Transcript",
  check: "Quick check",
  correct: "Correct",
  wrong: "Not quite",
  next: "Continue",
  replay: "Watch again",
  done: "Lesson complete",
  ai: "Made with AI help",
  aiParts: { script: "script", translation: "translation", voice: "voice" },
  letters: ["A", "B", "C", "D", "E"],
  sep: ", ",
  chapters: "Chapters",
  nextScene: "Next scene",
  volume: "Volume",
  mute: "Mute",
  unmute: "Unmute",
  fullscreen: "Full screen",
  captionLang: "Caption language",
  settings: "Settings",
  captionSize: "Caption size",
  sizes: ["Small", "Medium", "Large"],
  captionBg: "Caption background",
  score: "{n} of {m} quick checks right",
  position: "{t} of {d}",
};

const AR: Labels = {
  play: "تشغيل",
  pause: "إيقاف مؤقت",
  seek: "موضع الدرس",
  speed: "السرعة",
  captions: "الترجمة",
  transcript: "النص الكامل",
  check: "سؤال سريع",
  correct: "إجابة صحيحة",
  wrong: "ليس تمامًا",
  next: "متابعة",
  replay: "شاهد مرة أخرى",
  done: "اكتمل الدرس",
  ai: "أُعدّ بمساعدة الذكاء الاصطناعي",
  aiParts: { script: "النص", translation: "الترجمة", voice: "الصوت" },
  letters: ["أ", "ب", "ج", "د", "هـ"],
  sep: "، ",
  chapters: "الفصول",
  nextScene: "المشهد التالي",
  volume: "مستوى الصوت",
  mute: "كتم الصوت",
  unmute: "إلغاء الكتم",
  fullscreen: "ملء الشاشة",
  captionLang: "لغة الترجمة",
  settings: "الإعدادات",
  captionSize: "حجم الترجمة",
  sizes: ["صغير", "متوسط", "كبير"],
  captionBg: "خلفية الترجمة",
  // No counted noun, so no plural to agree with the numbers.
  score: "الإجابات الصحيحة: {n} من {m}",
  position: "{t} من {d}",
};

/**
 * A quick check's explanation without the verdict it opens with. The explanations say "Not quite — …", "Correct: …",
 * «صح — …» or «مش بالظبط: …», under the player's own verdict line, so learners read the verdict twice, and an answer
 * without its own wrong-answer explanation read "Not quite" over "Correct — …". The player gives the verdict; the
 * explanation keeps the reason. An English reason then starts with a capital, unless it starts with code
 * ("range(3) gives…", "json.loads…", "p = …") or a one-letter name ("y got a copy").
 */
const VERDICT =
  /^\s*(?:correct|right|yes|exactly|not quite|wrong|صح|صحيح|مظبوط|بالظبط|أيوه|أيوة|مش بالظبط|مش صح|غلط|لأ|إجابة صحيحة|ليس تمامًا)\s*[—–:!.]\s*/iu;
export function withoutVerdict(s: string): string {
  const m = VERDICT.exec(s);
  const rest = m ? s.slice(m[0].length) : "";
  if (!m || !rest.trim()) return s;
  const w = /^[a-z][a-z’'-]*/.exec(rest)?.[0];
  if (!w || (w.length < 2 && w !== "a")) return rest;
  const after = rest.slice(w.length);
  if (after && !/^[\s,;:!?]/.test(after)) return rest;
  if (/^\s*[=<>+\-−*/^%×÷≤≥≠≈←→]/.test(after)) return rest;
  return w[0]!.toUpperCase() + rest.slice(1);
}

export function labelsFor(lang: string, override?: Partial<Labels>): Labels {
  const base = lang.split("-")[0] === "ar" ? AR : EN;
  return override ? { ...base, ...override } : base;
}

/** Which parts were made with AI, for the disclosure badge. Empty when none were. */
export function aiParts(ai: AiDisclosure, l: Labels): string[] {
  const out: string[] = [];
  if (ai.script !== "human") out.push(l.aiParts.script);
  if (ai.translation === "ai" || ai.translation === "ai-assisted") out.push(l.aiParts.translation);
  if (ai.narration === "synthetic") out.push(l.aiParts.voice);
  return out;
}
