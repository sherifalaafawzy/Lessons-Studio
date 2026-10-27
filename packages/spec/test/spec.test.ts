import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import {
  captionChunks, estimateTiming, normalizeWord, relPathOk, resolveCues, splitSentences, toVtt, validatePackage,
  type LessonPackage, type Scene,
} from "../src/index.ts";
import { EXAMPLES, exampleIds, loadExample } from "../../../scripts/lib/examples.mjs";

const ids: string[] = exampleIds();
const load = (id: string): LessonPackage => loadExample(id).pkg as LessonPackage;
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

describe("example packages", () => {
  it("there are examples to check", () => expect(ids.length).toBeGreaterThanOrEqual(2));

  it.each(ids)("%s validates with no errors and no warnings", (id) => {
    const r = validatePackage(load(id));
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  it.each(ids)("%s matches the JSON Schemas", (id) => {
    const ajv = new Ajv2020({ allErrors: true });
    const compiled = new Map<string, ReturnType<typeof ajv.compile>>();
    const schema = (n: string) => {
      if (!compiled.has(n)) {
        compiled.set(n, ajv.compile(JSON.parse(readFileSync(fileURLToPath(new URL(`../schema/${n}.schema.json`, import.meta.url)), "utf8"))));
      }
      return compiled.get(n)!;
    };
    const pkg = load(id);
    const check = (n: string, data: unknown) => {
      const v = schema(n);
      const ok = v(data);
      expect(v.errors ?? [], `${id} ${n}`).toEqual([]);
      expect(ok).toBe(true);
    };
    check("manifest", pkg.manifest);
    check("scenes", pkg.scenes);
    for (const t of Object.values(pkg.timing)) check("timing", t);
  });

  it.each(ids)("%s timing files are current (run `npm run timing`, or `npm run narrate` for narrated languages)", (id) => {
    const pkg = load(id);
    for (const l of pkg.manifest.languages) {
      if (pkg.timing[l.code]!.source === "estimated") expect(pkg.timing[l.code]).toEqual(estimateTiming(pkg.scenes.scenes, l.code));
      else expect(l.audio, `${id} ${l.code} has measured timings but no audio`).toBeTruthy();
      const vtt = readFileSync(join(EXAMPLES, id, l.captions!), "utf8");
      expect(vtt).toBe(toVtt(pkg.timing[l.code]!, l.dir));
    }
  });

  it("Arabic text never uses the middle dot", () => {
    for (const id of ids) {
      const raw = readFileSync(join(EXAMPLES, id, "scenes.json"), "utf8");
      for (const m of raw.matchAll(/"ar": "([^"]*)"/g)) expect(m[1]).not.toContain("·");
    }
  });
});

describe("text helpers", () => {
  it("normalizes Arabic for matching", () => {
    expect(normalizeWord("تُخفي")).toBe("تخفي");
    expect(normalizeWord("أإآ")).toBe("ااا");
    expect(normalizeWord("Files.")).toBe("files");
    expect(normalizeWord("«أوامر»،")).toBe("اوامر");
  });

  it("splits sentences but keeps numbers and links whole", () => {
    expect(splitSentences("It costs 2.5 dollars. Go to example.com now! Done?")).toEqual([
      "It costs 2.5 dollars.", "Go to example.com now!", "Done?",
    ]);
    expect(splitSentences("ما هذا؟ لا شيء.")).toEqual(["ما هذا؟", "لا شيء."]);
  });

  it("checks package paths", () => {
    expect(relPathOk("timing/ar.json")).toBe(true);
    for (const bad of ["../x.json", "/x.json", "https://x.org/a.json", "a\\b.json", "a/../../b", ""]) expect(relPathOk(bad)).toBe(false);
  });
});

describe("timing and captions", () => {
  const pkg = load("prompt-injection");
  const scenes = pkg.scenes.scenes;

  it("estimates the same timing every time, in order", () => {
    const a = estimateTiming(scenes, "ar");
    expect(estimateTiming(scenes, "ar")).toEqual(a);
    let last = 0;
    for (const s of a.scenes) {
      expect(s.start).toBeGreaterThanOrEqual(last - 1e-9);
      for (const w of s.words) {
        expect(w.s).toBeGreaterThanOrEqual(last - 1e-9);
        expect(w.e).toBeGreaterThan(w.s);
        last = w.s;
      }
      expect(s.end).toBeGreaterThan(s.start);
      last = s.end;
    }
    expect(a.duration).toBe(a.scenes.at(-1)!.end);
  });

  it("cuts captions into short lines without losing or reordering words", () => {
    for (const lang of ["en", "ar"]) {
      const t = estimateTiming(scenes, lang);
      const chunks = captionChunks(t, 42);
      for (const c of chunks) expect(c.text.length).toBeLessThanOrEqual(42);
      expect(chunks.flatMap((c) => c.words.map((w) => w.w))).toEqual(t.scenes.flatMap((s) => s.words.map((w) => w.w)));
      // A sentence cut into pieces never leaves one word alone.
      for (const sc of t.scenes) for (const se of sc.sentences) {
        const parts = chunks.filter((c) => c.start >= se.start - 1e-6 && c.end <= se.end + 1e-6);
        if (parts.length > 1) for (const p of parts) expect(p.words.length).toBeGreaterThan(1);
      }
    }
  });

  it("writes WebVTT, marking right-to-left lines", () => {
    const vtt = toVtt(estimateTiming(scenes, "ar"), "rtl");
    expect(vtt.startsWith("WEBVTT\n\n1\n00:00:00.350 --> ")).toBe(true);
    expect(vtt.split("\n").filter((l) => l.startsWith("‏")).length).toBe(captionChunks(estimateTiming(scenes, "ar")).length);
  });
});

describe("cues", () => {
  const pkg = load("prompt-injection");
  const scene = (id: string): Scene => pkg.scenes.scenes.find((s) => s.id === id)!;
  const timingOf = (lang: string, id: string) => estimateTiming(pkg.scenes.scenes, lang).scenes.find((s) => s.id === id)!;

  it("fires on the spoken word, ignoring diacritics and Arabic clitics", () => {
    const st = timingOf("ar", "how");
    const hides = resolveCues(scene("how"), st, "ar").find((c) => c.target === "page" && c.action === "highlight")!;
    expect(hides.found).toBe(true);
    expect(st.words.find((w) => w.s === hides.at)!.w).toBe("تُخفي");

    const d = timingOf("ar", "defend");
    const keep = resolveCues(scene("defend"), d, "ar").find((c) => c.target === "4")!;
    expect(d.words.find((w) => w.s === keep.at)!.w).toBe("واحتفظ");
  });

  it("matches phrases and falls back to the scene start when a word is missing", () => {
    const ph = load("phishing-message");
    const habit = ph.scenes.scenes.find((s) => s.id === "habit")!;
    const st = estimateTiming(ph.scenes.scenes, "ar").scenes.find((s) => s.id === "habit")!;
    const first = resolveCues(habit, st, "ar").find((c) => c.target === "1")!;
    const i = st.words.findIndex((w) => w.s === first.at);
    expect([st.words[i]!.w, st.words[i + 1]!.w]).toEqual(["لا", "تضغط"]);

    const broken = clone(habit);
    broken.cues = [{ word: { en: "zebra", ar: "حمار" }, action: "reveal", target: "1" }];
    const r = resolveCues(broken, st, "ar")[0]!;
    expect(r).toMatchObject({ found: false, at: st.start });
  });
});

describe("validator", () => {
  it("catches the mistakes an author is likely to make", () => {
    const pkg = clone(load("phishing-message"));
    const s = pkg.scenes.scenes[1]!;
    (s.narration as Record<string, string>).ar = "ابحث · عن العلامات.";
    s.cues!.push({ word: "x", action: "pulse", target: "nowhere" });
    if (s.template === "message-mock") s.content.flags![0]!.id = "link";
    delete (pkg.scenes.scenes[2]!.narration as Record<string, string>).en;
    pkg.manifest.languages[0]!.timing = "../timing.json";
    const codes = validatePackage(pkg).errors.map((e) => e.code);
    for (const c of ["middleDot", "cueTarget", "dupId", "missingNarration", "badPath"]) expect(codes).toContain(c);
  });

  it("reports a cue word that isn't spoken as a warning", () => {
    const pkg = clone(load("prompt-injection"));
    pkg.scenes.scenes[1]!.cues![0]!.word = { en: "teleport", ar: "انتقال" };
    const r = validatePackage(pkg);
    expect(r.errors).toEqual([]);
    expect(r.warnings.map((w) => w.code)).toEqual(["cueWordMissing", "cueWordMissing"]);
  });

  it("flags timings made for an older script, and audio with estimated timings", () => {
    const pkg = clone(load("prompt-injection"));
    (pkg.scenes.scenes[2]!.narration as Record<string, string>).en += " One more sentence.";
    pkg.manifest.languages[1]!.audio = "audio/ar.opus";
    pkg.timing.ar!.source = "estimated";
    const r = validatePackage(pkg);
    expect(r.errors.map((e) => `${e.code} ${e.path} ${e.detail}`)).toEqual(["timingStale timing.en.scenes[2].words en"]);
    expect(r.warnings.map((w) => w.code)).toEqual(["estimatedWithAudio"]);
  });

  it("checks the narration voice", () => {
    const pkg = clone(load("phishing-message"));
    pkg.manifest.languages[0]!.voice = { provider: "gemini", model: "gemini-3.8-flash-lite-tts", name: "Sulafat", style: "Warm." };
    expect(validatePackage(pkg).errors).toEqual([]);
    pkg.manifest.languages[0]!.voice = { provider: "gemini", name: "" };
    expect(validatePackage(pkg).errors.map((e) => e.code)).toEqual(["badVoice"]);
  });
});

describe("canvas and budgets (v0.2)", () => {
  it("checks elements, keyframes and transitions", () => {
    const pkg = clone(load("how-ai-learns"));
    const s = pkg.scenes.scenes[1]!;
    if (s.template !== "canvas") throw new Error("expected canvas");
    s.content.elements.push({ id: "title", type: "text", x: 0, y: 0, text: "dup" } as never);
    s.content.elements.push({ id: "bad", type: "icon", icon: "nope", x: 0, y: 0, anim: [{ prop: "draw", keys: [{ at: -1, value: 1, ease: "wobble" }] }] } as never);
    s.transition = { type: "spin" } as never;
    const codes = validatePackage(pkg).errors.map((e) => e.code);
    for (const c of ["dupId", "badIcon", "badProp", "badKeyTime", "badEase", "badTransition"]) expect(codes).toContain(c);
  });

  it("warns about a keyframe word that isn't spoken, and about too much at once", () => {
    const pkg = clone(load("how-ai-learns"));
    const s = pkg.scenes.scenes[1]!;
    if (s.template !== "canvas") throw new Error("expected canvas");
    s.content.elements[0]!.anim = [{ prop: "opacity", keys: [{ at: { word: { en: "zebra", ar: "حمار" } }, value: 1 }] }];
    for (let i = 0; i < 14; i++) {
      s.content.elements.push({ id: `b${i}`, type: "shape", shape: "rect", x: i * 10, y: 0, w: 10, h: 10, anim: [{ prop: "x", keys: [{ at: 0.5, value: 0 }, { at: 5, value: 100 }] }] });
    }
    const r = validatePackage(pkg);
    expect(r.errors).toEqual([]);
    expect(r.warnings.map((w) => w.code)).toEqual(expect.arrayContaining(["keyWordMissing", "busyScene"]));
  });

  it("warns when a language would download more than the budget", () => {
    const pkg = clone(load("how-ai-learns"));
    pkg.manifest.languages[0]!.audio = "audio/en.opus";
    pkg.manifest.assets = [
      { path: "audio/en.opus", type: "audio/ogg", bytes: 250 * 1024, sha256: "a".repeat(64) },
      { path: "img/net.webp", type: "image/webp", bytes: 140 * 1024, sha256: "b".repeat(64) },
    ];
    pkg.timing.en!.source = "aligned";
    const codes = validatePackage(pkg).warnings.map((w) => `${w.code} ${w.path}`);
    expect(codes).toContain("bigImage manifest.assets[1]");
    expect(codes).toContain("heavyLesson manifest.languages.en");
    expect(codes).not.toContain("heavyLesson manifest.languages.ar");
  });
});
