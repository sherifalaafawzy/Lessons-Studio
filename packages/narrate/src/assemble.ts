import type { Lang, SceneTiming, Sentence, TimingFile, Word } from "@lessonstudio/spec";
import type { Pcm } from "./pcm.ts";

/** One voiced sentence, trimmed, with its words timed from the start of the clip. */
export interface Clip {
  text: string;
  pcm: Pcm;
  words: Word[];
}

export interface Gaps {
  /** Silence before a scene's first sentence. */
  lead: number;
  /** Silence between sentences. */
  sentence: number;
  /** Silence after a scene's last sentence. */
  tail: number;
  /** The shortest a scene can be. */
  minScene: number;
}

export const GAPS: Gaps = { lead: 0.35, sentence: 0.45, tail: 0.7, minScene: 2.5 };

const r3 = (x: number): number => Math.round(x * 1000) / 1000;

/**
 * The lesson's narration track and its timings, from the clips of every scene.
 * Times are counted in samples, so they never drift from the audio.
 */
export function assemble(
  scenes: { id: string; clips: Clip[] }[],
  lang: Lang,
  source: TimingFile["source"],
  gaps: Gaps = GAPS,
): { timing: TimingFile; pcm: Pcm } {
  const rate = scenes.flatMap((s) => s.clips)[0]?.pcm.rate ?? 24000;
  const n = (sec: number): number => Math.round(sec * rate);
  const placed: { at: number; samples: Int16Array }[] = [];
  const out: SceneTiming[] = [];
  let cursor = 0;
  for (const scene of scenes) {
    const start = cursor;
    let c = start + n(gaps.lead);
    const sentences: Sentence[] = [];
    const words: Word[] = [];
    scene.clips.forEach((clip, i) => {
      if (clip.pcm.rate !== rate) throw new Error(`Clips must share one sample rate (${clip.pcm.rate} vs ${rate})`);
      if (i > 0) c += n(gaps.sentence);
      const t0 = c / rate;
      const len = clip.pcm.samples.length;
      const t1 = (c + len) / rate;
      placed.push({ at: c, samples: clip.pcm.samples });
      for (const w of clip.words) words.push({ w: w.w, s: r3(Math.min(t0 + w.s, t1)), e: r3(Math.min(t0 + w.e, t1)) });
      sentences.push({ text: clip.text, start: r3(t0), end: r3((c + len) / rate) });
      c += len;
    });
    const end = Math.max(c + n(gaps.tail), start + n(gaps.minScene));
    out.push({ id: scene.id, start: r3(start / rate), end: r3(end / rate), sentences, words });
    cursor = end;
  }
  const samples = new Int16Array(cursor);
  for (const p of placed) samples.set(p.samples, p.at);
  return {
    timing: { version: "0.1", lang, source, duration: r3(cursor / rate), scenes: out },
    pcm: { rate, samples },
  };
}
