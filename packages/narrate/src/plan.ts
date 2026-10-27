import type { Lang, NarrationVoice, Scene } from "@lessonstudio/spec";
import { splitSentences } from "@lessonstudio/spec";
import { DEFAULT_MODEL } from "./gemini.ts";

/** One sentence to voice. Sentences are voiced one per request, so their start and end times are exact. */
export interface Line {
  scene: number;
  sceneId: string;
  index: number;
  text: string;
  /** The scene's speaker (a key of the language's `voices`); absent for the narrator. */
  speaker?: string;
  /** No letters or digits (a dramatic "…"): a short silence, never sent to a voice, which would invent words for it. */
  pause?: boolean;
}

/** Whether a sentence is only punctuation, so a pause rather than something to say. */
export const isPause = (text: string): boolean => !/[\p{L}\p{N}]/u.test(text);

/** The sentences of each scene, in order: the same split the timings and captions use. */
export function linesOf(scenes: Scene[], lang: Lang): Line[][] {
  return scenes.map((s, i) => splitSentences(s.narration[lang] ?? "").map((text, index) => ({
    scene: i, sceneId: s.id, index, text, ...(s.speaker ? { speaker: s.speaker } : {}), ...(isPause(text) ? { pause: true } : {}),
  })));
}

/** Style hints per language (the full code first, then its base language), added to the voice's own style. */
const LANG_STYLE: Record<string, string> = {
  ar: "Modern Standard Arabic (fusha).",
  "ar-EG": "Egyptian Arabic (Masri), as people speak it in Cairo: natural and friendly, not formal.",
};

/** The voice for a language: the manifest's, with the defaults filled in. */
export function voiceFor(lang: Lang, v: Partial<NarrationVoice> | undefined, defaults: NarrationVoice): NarrationVoice {
  const out: NarrationVoice = {
    provider: v?.provider ?? defaults.provider,
    model: v?.model ?? defaults.model ?? DEFAULT_MODEL,
    name: v?.name ?? defaults.name,
  };
  const style = [LANG_STYLE[lang] ?? LANG_STYLE[lang.split("-")[0]!], v?.style ?? defaults.style].filter(Boolean).join(" ");
  if (style) out.style = style;
  return out;
}

/** The cache key of a voiced sentence: the same text in the same voice and settings is voiced once (PLAN.md §8). */
export async function lineKey(v: NarrationVoice, lang: Lang, text: string): Promise<string> {
  const data = new TextEncoder().encode(JSON.stringify(["tts-1", v.provider, v.model ?? "", v.name, v.style ?? "", lang, text]));
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
  return Array.from(hash.slice(0, 16), (b) => b.toString(16).padStart(2, "0")).join("");
}
