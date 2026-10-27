import type { Lang, Scene, SceneTiming, Sentence, TimingFile, Word } from "./types.ts";
import { normalizeWord, splitSentences, splitWords } from "./text.ts";

export interface EstimateOptions {
  /** Seconds per letter. Defaults: en 0.054 (≈155 words a minute), ar 0.071 (≈135), others 0.06. */
  perLetter?: number;
  /** Seconds every word costs on top of its letters. */
  perWord?: number;
  /** Pause after a comma, semicolon or colon. */
  comma?: number;
  /** Pause between sentences. */
  sentence?: number;
  /** Silence before the first word and after the last word of a scene. */
  lead?: number;
  tail?: number;
  /** The shortest a scene can be. */
  minScene?: number;
}

const PER_LETTER: Record<string, number> = { en: 0.054, ar: 0.071 };
const r = (x: number): number => Math.round(x * 1000) / 1000;

/**
 * Timings from the narration text alone, for packages that have no audio yet.
 * Deterministic: the same scenes always give the same file. Real narration replaces it
 * with "tts" or "aligned" timings (PLAN.md Appendix C).
 */
export function estimateTiming(scenes: Scene[], lang: Lang, o: EstimateOptions = {}): TimingFile {
  const perLetter = o.perLetter ?? PER_LETTER[lang.split("-")[0]!] ?? 0.06;
  const perWord = o.perWord ?? 0.12;
  const comma = o.comma ?? 0.18;
  const gap = o.sentence ?? 0.38;
  const lead = o.lead ?? 0.35;
  const tail = o.tail ?? 0.6;
  const minScene = o.minScene ?? 2.5;

  let t = 0;
  const out: SceneTiming[] = [];
  for (const scene of scenes) {
    const start = t;
    let c = start + lead;
    const sentences: Sentence[] = [];
    const words: Word[] = [];
    splitSentences(scene.narration[lang] ?? "").forEach((text, i) => {
      if (i > 0) c += gap;
      const from = c;
      for (const w of splitWords(text)) {
        const d = perWord + perLetter * Math.max(1, normalizeWord(w).length);
        words.push({ w, s: r(c), e: r(c + d) });
        c += d;
        if (/[,،;؛:]$/.test(w)) c += comma;
      }
      sentences.push({ text, start: r(from), end: r(c) });
    });
    const end = Math.max(c + tail, start + minScene);
    out.push({ id: scene.id, start: r(start), end: r(end), sentences, words });
    t = end;
  }
  return { version: "0.1", lang, source: "estimated", duration: r(t), scenes: out };
}
