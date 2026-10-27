import type { CueAction, Lang, Scene, SceneTiming, When } from "./types.ts";
import { normalizeWord, pick, splitWords } from "./text.ts";

export interface ResolvedCue {
  action: CueAction;
  target: string;
  /** Seconds from the start of the lesson. */
  at: number;
  /** False when the cue's word wasn't found; it then fires at the scene's start. */
  found: boolean;
}

/** A spoken word matches a cue word when equal, or when it only adds up to 3 letters (Arabic clitics, plurals). */
function matches(word: string, cue: string): boolean {
  if (word === cue) return true;
  if (cue.length < 3 || word.length - cue.length > 3) return false;
  return word.startsWith(cue) || word.endsWith(cue);
}

/** When the n-th occurrence of a word or short phrase starts, in seconds from the lesson's start; null if never spoken. */
export function findWord(timing: SceneTiming, phrase: string, occurrence = 1): number | null {
  const want = splitWords(phrase).map(normalizeWord).filter(Boolean);
  if (!want.length) return null;
  const words = timing.words.map((w) => normalizeWord(w.w));
  let left = occurrence;
  for (let i = 0; i + want.length <= words.length; i++) {
    if (want.every((p, k) => matches(words[i + k]!, p)) && --left === 0) return timing.words[i]!.s;
  }
  return null;
}

/** Cue times for one scene in one language, from that language's word timings. */
export function resolveCues(scene: Scene, timing: SceneTiming, lang: Lang): ResolvedCue[] {
  return (scene.cues ?? []).map((c) => {
    if (typeof c.at === "number") {
      return { action: c.action, target: c.target, at: Math.min(timing.start + c.at, timing.end), found: true };
    }
    const at = findWord(timing, pick(c.word, lang), c.occurrence ?? 1);
    return { action: c.action, target: c.target, at: at ?? timing.start, found: at !== null };
  });
}

/**
 * A keyframe's time in seconds from the scene's start. A word anchor follows that language's narration,
 * so one animation stays in sync in every language. A word that isn't spoken falls back to the scene's start.
 */
export function resolveWhen(when: When, timing: SceneTiming, lang: Lang): { at: number; found: boolean } {
  const dur = timing.end - timing.start;
  if (typeof when === "number") return { at: Math.min(Math.max(0, when), dur), found: true };
  const at = findWord(timing, pick(when.word, lang), when.occurrence ?? 1);
  const t = (at === null ? 0 : at - timing.start) + (when.offset ?? 0);
  return { at: Math.min(Math.max(0, t), dur), found: at !== null };
}
