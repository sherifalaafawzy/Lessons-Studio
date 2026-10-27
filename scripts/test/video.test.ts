import { describe, expect, it } from "vitest";
import type { TimingFile } from "../../packages/spec/src/index.ts";
import { captionsFor, lessonTime, videoTime } from "../video/mp4.ts";

const holds = [{ at: 10, dur: 4 }, { at: 30, dur: 4 }];

describe("MP4 clock with holds at quick checks", () => {
  it("plays the lesson as is until the first check", () => {
    expect(lessonTime(0, holds)).toBe(0);
    expect(lessonTime(9.5, holds)).toBe(9.5);
  });

  it("holds the check's last frame, then carries on", () => {
    expect(lessonTime(10, holds)).toBeCloseTo(9.96);
    expect(lessonTime(13.9, holds)).toBeCloseTo(9.96);
    expect(lessonTime(14, holds)).toBe(10);
    expect(lessonTime(20, holds)).toBe(16);
    expect(lessonTime(38.5, holds)).toBe(30.5);
  });

  it("maps lesson time to video time the other way", () => {
    expect(videoTime(5, holds)).toBe(5);
    expect(videoTime(12, holds)).toBe(16);
    expect(videoTime(31, holds)).toBe(39);
    for (const t of [1, 11, 29, 33]) expect(lessonTime(videoTime(t, holds), holds)).toBeCloseTo(t);
  });

  it("moves captions after a hold later by the hold", () => {
    const timing: TimingFile = {
      version: "0.1", lang: "ar-EG", source: "estimated", duration: 14,
      scenes: [
        { id: "a", start: 0, end: 10, sentences: [{ text: "أول جملة.", start: 0, end: 9 }], words: [{ w: "أول", s: 0, e: 4 }, { w: "جملة.", s: 4, e: 9 }] },
        { id: "b", start: 10, end: 14, sentences: [{ text: "تاني.", start: 10, end: 13 }], words: [{ w: "تاني.", s: 10, e: 13 }] },
      ],
    };
    const vtt = captionsFor(timing, "rtl", [{ at: 10, dur: 4 }]);
    expect(vtt.startsWith("WEBVTT")).toBe(true);
    expect(vtt).toContain("00:00:00.000 --> ");
    expect(vtt).toContain("00:00:14.000 --> 00:00:17.000");
    expect(vtt).toContain("‏تاني.");
  });
});
