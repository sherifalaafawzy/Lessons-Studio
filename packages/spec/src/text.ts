import type { Dir, Lang, Text } from "./types.ts";

const RTL = new Set(["ar", "fa", "ur", "he", "ps", "sd", "ug", "yi", "dv", "ckb"]);

/** Direction of a language code when the manifest doesn't say. */
export function dirOf(lang: Lang): Dir {
  return RTL.has(lang.split("-")[0]!.toLowerCase()) ? "rtl" : "ltr";
}

/** The text in `lang`, else in `fallback`, else "". */
export function pick(t: Text | undefined, lang: Lang, fallback?: Lang): string {
  if (t === undefined) return "";
  if (typeof t === "string") return t;
  const v = t[lang];
  if (typeof v === "string" && v !== "") return v;
  return fallback ? t[fallback] ?? "" : "";
}

/** True when `t` has non-empty text for `lang` (a plain string counts for every language). */
export function hasText(t: Text | undefined, lang: Lang): boolean {
  if (t === undefined) return false;
  if (typeof t === "string") return t.trim() !== "";
  const v = t[lang];
  return typeof v === "string" && v.trim() !== "";
}

const ARABIC = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;
export const hasArabic = (s: string): boolean => ARABIC.test(s);

// Harakat, superscript alef, Quranic marks and tatweel.
const MARKS = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g;
const PUNCT = /[\p{P}\p{S}]/gu;

/** A word reduced for matching: lower case, no punctuation, no Arabic diacritics, one form of alef, yaa and taa marbuta. */
export function normalizeWord(w: string): string {
  return w
    .normalize("NFC")
    .toLowerCase()
    .replace(MARKS, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(PUNCT, "");
}

export function splitWords(s: string): string[] {
  return s.trim().split(/\s+/).filter(Boolean);
}

const STOPS = new Set([".", "!", "?", "؟", "…"]);

/** Sentences end at . ! ? ؟ … followed by a space or the end. "2.5" and "example.com" stay whole. */
export function splitSentences(text: string): string[] {
  const s = text.replace(/\s+/g, " ").trim();
  const out: string[] = [];
  let from = 0;
  for (let i = 0; i < s.length; i++) {
    if (!STOPS.has(s[i]!)) continue;
    let j = i;
    while (j + 1 < s.length && (STOPS.has(s[j + 1]!) || s[j + 1] === "\"" || s[j + 1] === "”" || s[j + 1] === "»")) j++;
    if (j + 1 === s.length || s[j + 1] === " ") {
      out.push(s.slice(from, j + 1).trim());
      from = j + 2;
      i = j;
    }
  }
  if (from < s.length) out.push(s.slice(from).trim());
  return out.filter(Boolean);
}
