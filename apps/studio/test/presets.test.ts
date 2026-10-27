// Every gallery scene and the new-lesson scenes validate with no errors and no warnings, in each stage shape and language set.
import { describe, expect, it } from "vitest";
import type { Orient } from "@lessonstudio/spec";
import { check, newLesson, type Lesson } from "@lessonstudio/ops";
import { GALLERY, starterScenes } from "../src/presets.ts";
import { asNewLesson, parseLessonFile, newId } from "../src/examples.ts";

const NAMES: Record<string, string> = { en: "English", ar: "العربية", fr: "Français" };
const lessonWith = (langs: string[], stage: Orient): Lesson =>
  newLesson({ id: "presets", title: Object.fromEntries(langs.map((l) => [l, "Presets"])), languages: langs.map((code) => ({ code, name: NAMES[code]! })), stage, createdBy: "u" }, "2026-10-27");

describe("scene gallery", () => {
  it("has unique ids and English and Arabic names", () => {
    expect(new Set(GALLERY.map((p) => p.id)).size).toBe(GALLERY.length);
    expect(GALLERY.length).toBeGreaterThanOrEqual(12);
    for (const p of GALLERY) expect(p.name.en && p.name.ar).toBeTruthy();
  });

  for (const stage of ["landscape", "portrait", "square"] as const) {
    for (const langs of [["en", "ar"], ["ar"], ["en", "ar", "fr"]]) {
      it(`validates cleanly: ${stage}, ${langs.join("+")}`, () => {
        const l = lessonWith(langs, stage);
        l.scenes.scenes = GALLERY.map((p, i) => p.make({ id: `s${i}`, langs, stage }));
        expect(l.scenes.scenes.map((s, i) => [s.template, GALLERY[i]!.template])).toEqual(GALLERY.map((p) => [p.template, p.template]));
        const r = check(l);
        expect(r.errors).toEqual([]);
        expect(r.warnings).toEqual([]);
      });
    }
  }

  it("canvas elements stay on the stage", () => {
    for (const stage of ["landscape", "portrait", "square"] as const) {
      const [w, h] = { landscape: [1280, 720], portrait: [720, 1280], square: [1080, 1080] }[stage];
      for (const p of GALLERY.filter((g) => g.template === "canvas")) {
        const s = p.make({ id: "s", langs: ["en"], stage });
        if (s.template !== "canvas") continue;
        for (const el of s.content.elements) {
          expect(el.x, `${p.id} ${el.id} ${stage}`).toBeGreaterThanOrEqual(0);
          expect(el.y, `${p.id} ${el.id} ${stage}`).toBeGreaterThanOrEqual(0);
          expect(el.x + (el.w ?? 0), `${p.id} ${el.id} ${stage}`).toBeLessThanOrEqual(w);
          expect(el.y + (el.h ?? 0), `${p.id} ${el.id} ${stage}`).toBeLessThanOrEqual(h);
        }
      }
    }
  });
});

describe("new lessons", () => {
  it("start with a title, the idea and a summary, cleanly", () => {
    for (const langs of [["en", "ar"], ["en", "fr"]]) {
      const l = lessonWith(langs, "landscape");
      l.scenes.scenes = starterScenes({ langs, stage: "landscape" }, Object.fromEntries(langs.map((x) => [x, x === "ar" ? "الكسور" : "Fractions"])));
      expect(l.scenes.scenes.map((s) => s.template)).toEqual(["title-hook", "steps", "summary"]);
      const r = check(l);
      expect(r.errors).toEqual([]);
      expect(r.warnings).toEqual([]);
    }
  });
});

describe("lesson files and copies", () => {
  it("reads {manifest, scenes} and {lesson}, and refuses anything else", () => {
    const l = lessonWith(["en"], "landscape");
    expect(parseLessonFile(JSON.stringify(l)).manifest.id).toBe("presets");
    expect(parseLessonFile(JSON.stringify({ lesson: l })).manifest.id).toBe("presets");
    expect(() => parseLessonFile("nope")).toThrow("JSON");
    expect(() => parseLessonFile("{}")).toThrow("No lesson");
    const broken = structuredClone(l);
    (broken.scenes.scenes[0] as { template: string }).template = "nonsense";
    expect(() => parseLessonFile(JSON.stringify(broken))).toThrow("problems");
  });

  it("a copy gets a new id, rev 1, its owner, and no links to the original's files", () => {
    const l = lessonWith(["en", "ar"], "landscape");
    l.manifest.rev = 9;
    l.manifest.languages[0]!.audio = "audio/en.opus";
    l.manifest.ai.narration = "synthetic";
    const c = asNewLesson(l, "copy-1", "bob", "test");
    expect([c.manifest.id, c.manifest.rev, c.manifest.provenance.createdBy, c.manifest.languages[0]!.audio, c.manifest.ai.narration]).toEqual(["copy-1", 1, "bob", undefined, "none"]);
    expect(l.manifest.rev).toBe(9);
    expect(newId("Spot a phishing message!")).toMatch(/^spot-a-phishing-message-[a-z0-9]{4}$/);
    expect(newId("درس")).toMatch(/^lesson-[a-z0-9]{4}$/);
  });
});
