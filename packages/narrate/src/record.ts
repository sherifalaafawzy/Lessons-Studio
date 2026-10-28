import type { Sentence, Word } from "@lessonstudio/spec";
import { splitSentences, splitWords } from "@lessonstudio/spec";
import { spreadWords } from "./align.ts";
import type { Pcm } from "./pcm.ts";

const FRAME = 0.02;
/** Gaps shorter than this inside speech are part of it (a breath, a stop consonant). */
const BRIDGE = 0.12;
/** Sounds shorter than this are clicks, not speech. */
const BLIP = 0.06;
const r3 = (x: number): number => Math.round(x * 1000) / 1000;

/** The stretches of a recording that have speech in them, in seconds: louder than the room by a margin. */
export function speechRuns(p: Pcm): [number, number][] {
  const n = Math.max(1, Math.round(FRAME * p.rate));
  const db: number[] = [];
  for (let i = 0; i < p.samples.length; i += n) {
    let sum = 0;
    const end = Math.min(p.samples.length, i + n);
    for (let j = i; j < end; j++) sum += p.samples[j]! * p.samples[j]!;
    db.push(10 * Math.log10(sum / Math.max(1, end - i) / (32768 * 32768) + 1e-12));
  }
  const sorted = [...db].sort((a, b) => a - b);
  const floor = sorted[Math.floor(sorted.length * 0.1)] ?? -120;
  const loud = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
  // Between the room's hum and the voice's loud parts, nearer the room: quiet syllables still count.
  const threshold = Math.max(floor + 8, Math.min(loud - 30, floor + (loud - floor) * 0.3));
  const runs: [number, number][] = [];
  let from = -1;
  db.forEach((d, i) => {
    if (d > threshold && from < 0) from = i;
    if (d <= threshold && from >= 0) { runs.push([from * FRAME, i * FRAME]); from = -1; }
  });
  if (from >= 0) runs.push([from * FRAME, db.length * FRAME]);
  const joined: [number, number][] = [];
  for (const run of runs) {
    const last = joined[joined.length - 1];
    if (last && run[0] - last[1] < BRIDGE) last[1] = run[1];
    else joined.push([run[0], run[1]]);
  }
  return joined.filter(([s, e]) => e - s >= BLIP).map(([s, e]) => [r3(s), r3(Math.min(e, p.samples.length / p.rate))]);
}

/**
 * Timings for a recording of a known script, without a speech recognizer: the sentences are placed at the longest
 * pauses (one fewer than there are sentences), and each sentence's words are spread over it by their letters. Returns
 * null when no speech was heard.
 */
export function timeRecording(p: Pcm, text: string): { words: Word[]; sentences: Sentence[]; seconds: number } | null {
  const runs = speechRuns(p);
  if (!runs.length) return null;
  const seconds = r3(p.samples.length / p.rate);
  const said = splitSentences(text).filter((s) => splitWords(s).length);
  if (!said.length) return { words: [], sentences: [], seconds };
  // The longest pauses between runs split the sentences, in the order they come.
  const gaps = runs.slice(1).map((r, i) => ({ i, len: r[0] - runs[i]![1] }));
  const cuts = gaps.sort((a, b) => b.len - a.len).slice(0, said.length - 1).map((g) => g.i).sort((a, b) => a - b);
  let spans: [number, number][] = [];
  let first = 0;
  for (const c of [...cuts, runs.length - 1]) {
    spans.push([runs[first]![0], runs[c]![1]]);
    first = c + 1;
  }
  // Fewer pauses than sentences: share the speech between the sentences by their letters instead.
  if (spans.length < said.length) {
    const from = runs[0]![0], to = runs[runs.length - 1]![1];
    const times = spreadWords(said, from, to);
    spans = times.map((w) => [w.s, w.e]);
  }
  const sentences: Sentence[] = [];
  const words: Word[] = [];
  said.forEach((s, i) => {
    const [a, b] = spans[i]!;
    sentences.push({ text: s, start: r3(a), end: r3(b) });
    words.push(...spreadWords(splitWords(s), a, b));
  });
  return { words, sentences, seconds };
}
