import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { castPath, splitSentences, walkElements, type Scene } from "../../packages/spec/src/index.ts";
import { check } from "../../packages/ops/src/index.ts";
import { AR, ORDER, build, convert, loadArabic, loadDesign, loadStory } from "../darsi/convert.ts";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));

describe("Darsi storyboards to lessons", () => {
  const lesson = build("CY-1-1-2");
  const scenes = lesson.scenes.scenes;
  const byId = (id: string): Scene => scenes.find((s) => s.id === id)!;

  it("makes one scene per storyboard scene, in English and Egyptian Arabic", () => {
    expect(scenes).toHaveLength(loadStory("CY-1-1-2").video.scenes.length);
    expect(lesson.manifest.languages.map((l) => [l.code, l.dir])).toEqual([["en", "ltr"], [AR, "rtl"]]);
    expect(lesson.manifest.brand).toBe("darsi-light");
    for (const s of scenes) expect(Object.keys(s.narration)).toEqual(["en", AR]);
  });

  it("turns beats into templates", () => {
    expect(byId("s02").template).toBe("title-hook");
    expect(byId("s05").template).toBe("steps");
    expect(byId("s12").template).toBe("summary");
    expect(byId("s01").template).toBe("canvas");
  });

  it("asks each checkpoint as a quick check with the right answer", () => {
    const story = loadStory("CY-1-1-2");
    for (const cp of story.video.checkpoints!) {
      const s = scenes[cp.after_scene - 1]!;
      expect(s.template).toBe("quiz");
      const right = cp.options.findIndex((o) => o.correct);
      expect(s.check!.answer).toBe("abcde"[right]);
      expect(s.check!.options).toHaveLength(cp.options.length);
    }
  });

  it("puts the speaking cast member on the stage, from the shared library", () => {
    const srcs: string[] = [];
    walkElements(byId("s01"), (el) => { if (el.type === "image") srcs.push(el.src); });
    expect(srcs).toEqual([castPath("salma", "talking")]);
  });

  it("anchors every animation to a word said in each language", () => {
    const anchors = (s: Scene): unknown[] => {
      const out: unknown[] = [];
      walkElements(s, (el) => { for (const tr of el.anim ?? []) for (const k of tr.keys) out.push(k.at); });
      for (const c of s.cues ?? []) out.push(c);
      return out;
    };
    const words = anchors(byId("s04")).filter((a) => typeof a === "object" && a && "word" in a) as { word: Record<string, string> }[];
    expect(words.length).toBeGreaterThan(5);
    for (const w of words) expect(Object.keys(w.word)).toEqual(["en", AR]);
  });

  it("refuses an Arabic scene with different sentence breaks", () => {
    const ar = loadArabic("CY-1-1-2")!;
    const broken = { ...ar, scenes: { ...ar.scenes, "4": { ...ar.scenes["4"]!, narration: "جملة واحدة بس." } } };
    expect(() => convert(loadStory("CY-1-1-2"), broken, loadDesign("CY-1-1-2"))).toThrow(/sentences/);
  });

  it("refuses unknown icons and missing Arabic in a design", () => {
    const story = loadStory("CY-1-1-2");
    const ar = loadArabic("CY-1-1-2")!;
    expect(() => convert(story, ar, { scenes: { "3": { cards: [{ icon: "unicorn", text: { en: "x", [AR]: "س" } }] } } })).toThrow(/unknown icon/);
    expect(() => convert(story, ar, { scenes: { "3": { cards: [{ icon: "phone", text: { en: "x" } }] } } })).toThrow(/no ar-EG/);
  });
});

describe("all 12 Darsi lessons", () => {
  for (const id of ORDER) {
    it(`${id} converts and validates cleanly`, () => {
      const lesson = build(id);
      const r = check(lesson);
      expect(r.errors).toEqual([]);
      // Over 150 s is expected: the Darsi videos are 3 to 4 minutes.
      expect(r.warnings.filter((w) => w.code !== "longLesson")).toEqual([]);
      for (const s of lesson.scenes.scenes) {
        const ar = s.narration[AR];
        if (ar) {
          expect(ar).not.toContain("·");
          expect(splitSentences(ar)).toHaveLength(splitSentences(s.narration.en!).length);
        }
      }
    });

    it(`${id}'s generated files are up to date`, () => {
      const dir = join(ROOT, "content", "darsi", "lessons", id.toLowerCase());
      expect(existsSync(join(dir, "scenes.json"))).toBe(true);
      const lesson = build(id);
      expect(JSON.parse(readFileSync(join(dir, "scenes.json"), "utf8"))).toEqual(JSON.parse(JSON.stringify(lesson.scenes)));
      expect(JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")).languages.map((l: { code: string }) => l.code))
        .toEqual(lesson.manifest.languages.map((l) => l.code));
    });
  }
});
