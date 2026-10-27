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
  volume: string;
  mute: string;
  fullscreen: string;
  settings: string;
  captionSize: string;
  sizes: [string, string, string];
  captionBg: string;
  /** "{n}" right out of "{m}" quick checks. */
  score: string;
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
  volume: "Volume",
  mute: "Mute",
  fullscreen: "Full screen",
  settings: "Settings",
  captionSize: "Caption size",
  sizes: ["Small", "Medium", "Large"],
  captionBg: "Caption background",
  score: "{n} of {m} quick checks right",
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
  volume: "مستوى الصوت",
  mute: "كتم الصوت",
  fullscreen: "ملء الشاشة",
  settings: "الإعدادات",
  captionSize: "حجم الترجمة",
  sizes: ["صغير", "متوسط", "كبير"],
  captionBg: "خلفية الترجمة",
  score: "{n} من {m} أسئلة سريعة صحيحة",
};

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
