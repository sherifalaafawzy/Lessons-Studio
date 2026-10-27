import type { Dir, Lang, LessonPackage, NarrationVoice, Orient, Report, Text, TimingFile } from "@lessonstudio/spec";
import { dirOf, estimateTiming, pick, validatePackage, walkElements } from "@lessonstudio/spec";
import { clone } from "./apply.ts";
import type { Lesson } from "./types.ts";

export interface Brief {
  /** Lower case, digits and hyphens. */
  id: string;
  title: Text;
  languages: { code: Lang; name: string; dir?: Dir }[];
  defaultLang?: Lang;
  summary?: Text;
  topic?: string;
  level?: number;
  brand?: string;
  stage?: Orient;
  voice?: NarrationVoice;
  createdBy: string;
  tool?: string;
}

/** A new lesson with one title scene, ready to edit. */
export function newLesson(b: Brief, today = new Date().toISOString().slice(0, 10)): Lesson {
  if (!b.languages.length) throw new Error("A lesson needs at least one language");
  const def = b.defaultLang ?? b.languages[0]!.code;
  const titleIn = (l: Lang): string => pick(b.title, l, def);
  return {
    manifest: {
      spec: "lesson-package",
      version: "0.2",
      id: b.id,
      rev: 1,
      title: b.title,
      ...(b.summary ? { summary: b.summary } : {}),
      ...(b.topic ? { topic: b.topic } : {}),
      ...(b.level ? { level: b.level } : {}),
      defaultLang: def,
      languages: b.languages.map((l) => ({
        code: l.code, dir: l.dir ?? dirOf(l.code), name: l.name, duration: 1,
        timing: `timing/${l.code}.json`, captions: `captions/${l.code}.vtt`, quality: "draft" as const,
        ...(b.voice ? { voice: b.voice } : {}),
      })),
      brand: b.brand ?? "studio-dark",
      stage: b.stage ?? "landscape",
      provenance: { createdAt: today, createdBy: b.createdBy, tool: b.tool ?? "Lesson Studio" },
      ai: { script: "human", translation: "none", narration: "none", visuals: "human", avatar: "none" },
    },
    scenes: {
      version: "0.2",
      scenes: [{
        id: "intro",
        template: "title-hook",
        narration: Object.fromEntries(b.languages.map((l) => [l.code, `${titleIn(l.code)}.`])),
        content: { title: b.title },
      }],
    },
  };
}

/**
 * The lesson as a playable package. Languages without measured timings get estimated ones, and each
 * language's duration follows its timing.
 */
export function toPackage(lesson: Lesson, timings: Record<Lang, TimingFile | undefined> = {}, base?: string): LessonPackage {
  const manifest = clone(lesson.manifest);
  manifest.version = "0.2";
  const timing: Record<Lang, TimingFile> = {};
  for (const l of manifest.languages) {
    const t = timings[l.code] ?? estimateTiming(lesson.scenes.scenes, l.code);
    timing[l.code] = t;
    l.duration = t.duration;
  }
  const pkg: LessonPackage = { manifest, scenes: { ...clone(lesson.scenes), version: "0.2" }, timing };
  if (base) pkg.base = base;
  return pkg;
}

/** Every check for the lesson as it stands (estimated timings where there's no narration yet). */
export function check(lesson: Lesson, timings: Record<Lang, TimingFile | undefined> = {}): Report {
  return validatePackage(toPackage(lesson, timings));
}

/** A short view of a lesson for an AI or a list: scenes, what they say and what's in them. */
export function summarize(lesson: Lesson, timings: Record<Lang, TimingFile | undefined> = {}) {
  const m = lesson.manifest;
  const pkg = toPackage(lesson, timings);
  return {
    id: m.id,
    title: m.title,
    languages: m.languages.map((l) => ({ code: l.code, dir: l.dir, seconds: pkg.timing[l.code]!.duration, timing: pkg.timing[l.code]!.source, audio: !!l.audio })),
    stage: m.stage ?? "landscape",
    brand: m.brand ?? "studio-dark",
    scenes: lesson.scenes.scenes.map((s, i) => {
      const elements: { id: string; type: string; text?: string; animated?: string[] }[] = [];
      walkElements(s, (el) => {
        const e: { id: string; type: string; text?: string; animated?: string[] } = { id: el.id, type: el.type };
        if (el.type === "text") e.text = pick(el.text, m.defaultLang);
        if (el.anim?.length) e.animated = el.anim.map((a) => a.prop);
        elements.push(e);
      });
      return {
        id: s.id,
        template: s.template,
        seconds: Math.round((pkg.timing[m.defaultLang]!.scenes[i]!.end - pkg.timing[m.defaultLang]!.scenes[i]!.start) * 10) / 10,
        narration: s.narration,
        ...(elements.length ? { elements } : {}),
        ...(s.cues?.length ? { cues: s.cues.length } : {}),
        ...(s.check ? { check: s.check.id } : {}),
        ...(s.transition ? { transition: s.transition.type } : {}),
        ...(s.camera?.length ? { camera: true } : {}),
      };
    }),
  };
}
