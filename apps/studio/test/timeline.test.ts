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

import { insertionIndex, moveTarget, ticksFor, timelinePps } from "../src/timeline.ts";

describe("lesson timeline layout", () => {
  it("fits the lesson, then zooms", () => {
    expect(timelinePps(900, 90, 1)).toBe(10);
    expect(timelinePps(900, 90, 4)).toBe(40);
    expect(timelinePps(900, 90, 0.5)).toBe(10);
  });
  it("keeps ruler labels readable", () => {
    expect(ticksFor(10)).toEqual({ step: 5, label: 10 });
    expect(ticksFor(100)).toEqual({ step: 0.5, label: 1 });
    expect(ticksFor(2)).toEqual({ step: 30, label: 60 });
  });
  it("drops scenes between clips", () => {
    const clips = [{ start: 0, end: 10 }, { start: 10, end: 20 }, { start: 20, end: 26 }];
    expect([2, 6, 14, 22, 25].map((t) => insertionIndex(t, clips))).toEqual([0, 1, 1, 2, 3]);
    expect(moveTarget(0, 3)).toBe(2);
    expect(moveTarget(2, 0)).toBe(0);
    expect(moveTarget(1, 1)).toBe(1);
  });
});
