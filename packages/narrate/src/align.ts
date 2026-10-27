import type { Word } from "@lessonstudio/spec";
import { normalizeWord } from "@lessonstudio/spec";

/** A word with times, as an aligner or speech recognizer reports it. Seconds from the clip's start. */
export interface Heard {
  w: string;
  s: number;
  e: number;
  /** The aligner's confidence, 0–1. */
  p?: number;
}

export interface Aligned {
  words: Word[];
  /** Share of the script's letters that found the same letter in what was heard (1 = all). */
  matched: number;
}

const r3 = (x: number): number => Math.round(x * 1000) / 1000;
/** Letters only: aligners report words with their leading space. */
const letters = (w: string): string => normalizeWord(w).replace(/\s+/g, "");
/** Shortest a word may last, so every word can light up in the captions. */
const MIN_WORD = 0.04;

/** Letter-weighted times for words between `from` and `to`, when nothing better is known. */
export function spreadWords(words: string[], from: number, to: number): Word[] {
  const weights = words.map((w) => 1 + Math.max(1, letters(w).length));
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  let t = from;
  return words.map((w, i) => {
    const d = ((to - from) * weights[i]!) / total;
    const out = { w, s: r3(t), e: r3(t + d) };
    t += d;
    return out;
  });
}

/**
 * Times for the script's words from the words heard in the audio.
 *
 * Matching is letter by letter (an edit-distance alignment of the two letter strings), so it copes
 * when the two sides split words differently ("e-mail" / "email", Arabic clitics) or when a few
 * words were misheard. Script words with no letters matched get times spread between their neighbours.
 */
export function alignWords(script: string[], heard: Heard[], duration: number): Aligned {
  // Script letters, each tagged with its word.
  const sc: { ch: string; word: number }[] = [];
  script.forEach((w, i) => { for (const ch of letters(w)) sc.push({ ch, word: i }); });
  // Heard letters, each with the slice of its word's time it covers.
  const hc: { ch: string; s: number; e: number }[] = [];
  for (const h of heard) {
    const ls = [...letters(h.w)];
    const d = Math.max(0, h.e - h.s) / Math.max(1, ls.length);
    ls.forEach((ch, k) => hc.push({ ch, s: h.s + d * k, e: h.s + d * (k + 1) }));
  }

  // Edit distance with a backtrace. Sentences are short (a few hundred letters), so n×m is small.
  const n = sc.length;
  const m = hc.length;
  const cost = new Uint16Array((n + 1) * (m + 1));
  const at = (i: number, j: number): number => i * (m + 1) + j;
  for (let i = 0; i <= n; i++) cost[at(i, 0)] = i;
  for (let j = 0; j <= m; j++) cost[at(0, j)] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const sub = cost[at(i - 1, j - 1)]! + (sc[i - 1]!.ch === hc[j - 1]!.ch ? 0 : 1);
      cost[at(i, j)] = Math.min(sub, cost[at(i - 1, j)]! + 1, cost[at(i, j - 1)]! + 1);
    }
  }
  const first = new Array<number>(script.length).fill(Infinity);
  const last = new Array<number>(script.length).fill(-Infinity);
  let same = 0;
  // On a tie, leave the later letter unmatched: what was heard then belongs to the earlier words.
  for (let i = n, j = m; i > 0 && j > 0; ) {
    const here = cost[at(i, j)]!;
    if (here === cost[at(i - 1, j)]! + 1) i--;
    else if (here === cost[at(i, j - 1)]! + 1) j--;
    else {
      const k = sc[i - 1]!.word;
      first[k] = Math.min(first[k]!, hc[j - 1]!.s);
      last[k] = Math.max(last[k]!, hc[j - 1]!.e);
      if (sc[i - 1]!.ch === hc[j - 1]!.ch) same++;
      i--;
      j--;
    }
  }

  // Fill words nothing matched, between the words around them.
  const words: Word[] = script.map((w, i) => ({ w, s: first[i]!, e: last[i]! }));
  for (let i = 0; i < words.length; ) {
    if (Number.isFinite(words[i]!.s)) { i++; continue; }
    let j = i;
    while (j < words.length && !Number.isFinite(words[j]!.s)) j++;
    const from = i > 0 ? words[i - 1]!.e : 0;
    const to = j < words.length ? words[j]!.s : duration;
    spreadWords(script.slice(i, j), from, Math.max(from, to)).forEach((x, k) => { words[i + k] = x; });
    i = j;
  }

  // In order, inside the clip, never shorter than MIN_WORD.
  let prev = 0;
  for (const w of words) {
    w.s = Math.min(Math.max(w.s, prev), duration);
    w.e = Math.min(Math.max(w.e, w.s + MIN_WORD), duration);
    prev = w.s;
  }
  for (let i = 0; i + 1 < words.length; i++) if (words[i]!.e > words[i + 1]!.s) words[i]!.e = Math.max(words[i]!.s, words[i + 1]!.s);
  for (const w of words) { w.s = r3(w.s); w.e = r3(w.e); }
  return { words, matched: n ? same / n : 1 };
}

/** How alike two texts are, letter by letter (0–1): a check that the voice read what the script says. */
export function similarity(a: string, b: string): number {
  const x = [...letters(a)];
  const y = [...letters(b)];
  if (!x.length && !y.length) return 1;
  let row = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i++) {
    const next = [i];
    for (let j = 1; j <= y.length; j++) next[j] = Math.min(row[j - 1]! + (x[i - 1] === y[j - 1] ? 0 : 1), row[j]! + 1, next[j - 1]! + 1);
    row = next;
  }
  return 1 - row[y.length]! / Math.max(x.length, y.length);
}
