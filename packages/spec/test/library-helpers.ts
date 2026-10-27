import { castPath, isIcon, isLibPath, needsLibraryIcon, validatePackage, type LessonPackage } from "../src/index.ts";

export { castPath, isIcon, isLibPath, needsLibraryIcon };

/** The error codes for a one-scene canvas lesson with one library image and one icon. */
export function newLibraryCheck(src: string, iconName: string): string[] {
  const pkg: LessonPackage = {
    manifest: {
      spec: "lesson-package", version: "0.2", id: "lib-test", rev: 1, title: "Library", defaultLang: "en",
      languages: [{ code: "en", dir: "ltr", name: "English", duration: 3, timing: "timing/en.json" }],
      provenance: { createdAt: "2026-10-27", createdBy: "t", tool: "test" },
      ai: { script: "human", translation: "none", narration: "none", visuals: "human", avatar: "none" },
    },
    scenes: { version: "0.2", scenes: [{ id: "s", template: "canvas", narration: { en: "Hello there." }, content: { elements: [
      { id: "who", type: "image", src, x: 0, y: 0, w: 200, h: 200 },
      { id: "ic", type: "icon", icon: iconName as never, x: 300, y: 0, w: 80, h: 80 },
    ] } }] },
    timing: { en: { version: "0.1", lang: "en", source: "manual", duration: 3, scenes: [{ id: "s", start: 0, end: 3, sentences: [], words: [{ w: "Hello", s: 0.3, e: 0.7 }, { w: "there.", s: 0.8, e: 1.2 }] }] } },
  };
  return validatePackage(pkg).errors.map((e) => e.code);
}
