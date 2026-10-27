// Moving keyframes on the timeline: word anchors keep their word and change their offset, or take a new word in one language.
import { describe, expect, it } from "vitest";
import { dropWhen, shiftWhen } from "../src/timeline.ts";

const LANGS = ["en", "ar"];

describe("timeline", () => {
  it("shifts a time, or a word anchor's offset", () => {
    expect(shiftWhen(1.2, 0.5)).toBe(1.7);
    expect(shiftWhen(0.2, -1)).toBe(0);
    expect(shiftWhen({ word: { en: "opens", ar: "يفتح" } }, 0.25)).toEqual({ word: { en: "opens", ar: "يفتح" }, offset: 0.25 });
    expect(shiftWhen({ word: "x", offset: 0.25 }, -0.25)).toEqual({ word: "x" });
  });

  it("drops a time on a new time, snapped or not", () => {
    expect(dropWhen(1, 1, 2.345, null, "en", LANGS)).toBe(2.35);
    expect(dropWhen(1, 1, 3, { text: "opens", occurrence: 1 }, "en", LANGS)).toBe(3);
  });

  it("drops a word anchor on another word: this language changes, the others keep theirs", () => {
    const w = { word: { en: "link", ar: "الرابط" }, offset: 0.3 };
    expect(dropWhen(w, 2.3, 4, { text: "page", occurrence: 1 }, "en", LANGS)).toEqual({ word: { en: "page", ar: "الرابط" } });
    expect(dropWhen(w, 2.3, 4, { text: "الصفحة", occurrence: 2 }, "ar", LANGS)).toEqual({ word: { en: "link", ar: "الصفحة" }, occurrence: 2 });
    expect(dropWhen({ word: "same" }, 1, 2, { text: "other", occurrence: 1 }, "ar", LANGS)).toEqual({ word: { en: "same", ar: "other" } });
  });

  it("drops a word anchor between words: it keeps its word, with an offset from it", () => {
    const w = { word: { en: "link", ar: "الرابط" }, offset: 0.3 };
    // The word is said at 2.0 (resolved 2.3 minus the 0.3 offset); dropped at 2.8 is 0.8 after it.
    expect(dropWhen(w, 2.3, 2.8, null, "en", LANGS)).toEqual({ word: { en: "link", ar: "الرابط" }, offset: 0.8 });
    expect(dropWhen(w, 2.3, 2.0, null, "en", LANGS)).toEqual({ word: { en: "link", ar: "الرابط" } });
  });
});
