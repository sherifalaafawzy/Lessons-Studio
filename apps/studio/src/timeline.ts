// Timeline maths: where a keyframe lands when it is dragged (pure, so it is tested on its own).
import type { When } from "@lessonstudio/spec";

export const r2 = (x: number): number => Math.round(x * 100) / 100;

/** A time moved by dt seconds: a word anchor keeps its word and changes its offset. */
export function shiftWhen(w: When, dt: number): When {
  if (typeof w === "number") return r2(Math.max(0, w + dt));
  const offset = r2((w.offset ?? 0) + dt);
  const { offset: _o, ...rest } = w;
  return offset ? { ...rest, offset } : rest;
}

/**
 * Where a moment lands when dropped at local time `to`. On a word (within the snap distance) it anchors to that
 * word in this language and keeps the other languages' words; elsewhere a word anchor keeps its word and takes
 * an offset, and a plain time becomes the new time.
 */
export function dropWhen(w: When, resolvedAt: number, to: number, word: { text: string; occurrence: number } | null, lang: string, langs: string[]): When {
  if (typeof w === "number") return r2(Math.max(0, to));
  if (word) {
    const words: Record<string, string> = typeof w.word === "string" ? Object.fromEntries(langs.map((l) => [l, w.word as string])) : { ...w.word };
    words[lang] = word.text;
    return word.occurrence > 1 ? { word: words, occurrence: word.occurrence } : { word: words };
  }
  const wordAt = resolvedAt - (w.offset ?? 0);
  const offset = r2(Math.max(-10, Math.min(10, to - wordAt)));
  const { offset: _o, ...rest } = w;
  return offset ? { ...rest, offset } : rest;
}

/** Pixels per second: the whole lesson fits the width at zoom 1; zoom multiplies that. */
export function timelinePps(width: number, duration: number, zoom: number): number {
  return (Math.max(40, width) / Math.max(1, duration)) * Math.max(1, zoom);
}

/** Ruler ticks every `step` seconds, labelled every `label`: steps are chosen so labels stay at least 64 px apart. */
export function ticksFor(pps: number): { step: number; label: number } {
  const steps = [0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120];
  const label = steps.find((s) => s * pps >= 64) ?? 300;
  const step = steps.filter((s) => s < label && s * pps >= 10).at(-1) ?? label;
  return { step, label };
}

/** Where a scene dropped at time `at` goes: the index of the first scene whose middle is after it. */
export function insertionIndex(at: number, scenes: { start: number; end: number }[]): number {
  const i = scenes.findIndex((s) => at < (s.start + s.end) / 2);
  return i < 0 ? scenes.length : i;
}

/** moveScene's target index for a scene at `from` dropped before position `before` (0…n). */
export function moveTarget(from: number, before: number): number {
  return before > from ? before - 1 : before;
}
