import { describe, expect, it } from "vitest";
import { validatePackage, type LanguageTrack, type LessonPackage } from "../src/index.ts";

/** A one-scene lesson whose scene is said by `speaker`, with `voices` on its one language. */
function check(speaker: unknown, voices?: unknown) {
  const pkg: LessonPackage = {
    manifest: {
      spec: "lesson-package", version: "0.2", id: "voices-test", rev: 1, title: "Voices", defaultLang: "en",
      languages: [{
        code: "en", dir: "ltr", name: "English", duration: 3, timing: "timing/en.json",
        voice: { provider: "gemini", name: "Sulafat" }, ...(voices === undefined ? {} : { voices: voices as LanguageTrack["voices"] }),
      }],
      provenance: { createdAt: "2026-10-27", createdBy: "t", tool: "test" },
      ai: { script: "human", translation: "none", narration: "none", visuals: "human", avatar: "none" },
    },
    scenes: { version: "0.2", scenes: [{ id: "s", template: "canvas", ...(speaker === undefined ? {} : { speaker: speaker as string }), narration: { en: "Hello there." }, content: { elements: [] } }] },
    timing: { en: { version: "0.1", lang: "en", source: "manual", duration: 3, scenes: [{ id: "s", start: 0, end: 3, sentences: [], words: [{ w: "Hello", s: 0.3, e: 0.7 }, { w: "there.", s: 0.8, e: 1.2 }] }] } },
  };
  const r = validatePackage(pkg);
  return { errors: r.errors.map((e) => e.code), warnings: r.warnings.map((e) => e.code) };
}

describe("cast voices", () => {
  it("accepts a scene said by a cast member with a voice", () => {
    expect(check("salma", { salma: { provider: "gemini", name: "Kore", style: "Careful." } })).toEqual({ errors: [], warnings: [] });
  });

  it("says when a speaker has no voice, so the narrator would read it", () => {
    expect(check("salma", { okafor: { provider: "gemini", name: "Puck" } }).warnings).toEqual(["noVoice"]);
    // A lesson without cast voices is all narrator: nothing to say.
    expect(check("salma").warnings).toEqual([]);
  });

  it("refuses bad speakers and bad voices", () => {
    expect(check("Ms Salma!").errors).toContain("badSpeaker");
    expect(check(undefined, { salma: { name: "Kore" } }).errors).toContain("badVoice");
    expect(check(undefined, { "no way": { provider: "gemini", name: "Kore" } }).errors).toContain("badVoice");
  });
});
