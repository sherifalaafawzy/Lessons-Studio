import type { Manifest, ScenesFile } from "@lessonstudio/spec";
import { check, clone, type Lesson } from "@lessonstudio/ops";

// The repository's example lessons. Manifests are small and listed up front; scenes load when picked.
const manifests = import.meta.glob<Manifest>("../../../examples/*/manifest.json", { eager: true, import: "default" });
const scenes = import.meta.glob<ScenesFile>("../../../examples/*/scenes.json", { import: "default" });

export interface Example {
  id: string;
  manifest: Manifest;
  load: () => Promise<Lesson>;
}

export const EXAMPLES: Example[] = Object.entries(manifests).map(([path, manifest]) => ({
  id: path.split("/").slice(-2, -1)[0]!,
  manifest,
  load: async () => ({ manifest: clone(manifest), scenes: clone(await scenes[path.replace(/manifest\.json$/, "scenes.json")]!()) }),
}));

/**
 * A lesson made into a new one owned by `uid`: a new id, rev 1, and no links to files that only the original
 * package has (audio, assets), since a copy starts without them.
 */
export function asNewLesson(src: Lesson, id: string, uid: string, origin: string): Lesson {
  const l = clone(src);
  l.manifest.id = id;
  l.manifest.rev = 1;
  l.manifest.version = "0.2";
  l.scenes.version = "0.2";
  l.manifest.provenance = { ...l.manifest.provenance, createdAt: new Date().toISOString().slice(0, 10), createdBy: uid, tool: `Lesson Studio (${origin})` };
  delete l.manifest.assets;
  delete l.manifest.poster;
  for (const t of l.manifest.languages) {
    delete t.audio;
    delete t.audioFallback;
    t.timing = `timing/${t.code}.json`;
    t.captions = `captions/${t.code}.vtt`;
  }
  if (l.manifest.ai.narration === "synthetic") l.manifest.ai = { ...l.manifest.ai, narration: "none" };
  return l;
}

/** Reads a lesson file: {manifest, scenes}, or {lesson: {manifest, scenes}} as get_lesson returns. Errors are thrown as text. */
export function parseLessonFile(text: string): Lesson {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("This isn't a JSON file.");
  }
  const o = raw as { manifest?: Manifest; scenes?: ScenesFile; lesson?: Lesson };
  const l = o.lesson ?? (o.manifest && o.scenes ? { manifest: o.manifest, scenes: o.scenes } : null);
  if (!l?.manifest || !Array.isArray(l.scenes?.scenes)) throw new Error("No lesson in this file (it needs manifest and scenes).");
  const r = check(l);
  if (r.errors.length) throw new Error(`The lesson has ${r.errors.length} problems, e.g. ${r.errors.slice(0, 2).map((e) => `${e.code} at ${e.path}`).join("; ")}.`);
  return l;
}

/** A readable id from a title, plus 4 random letters so copies never clash. */
export function newId(base: string): string {
  const slug = base.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "lesson";
  return `${slug}-${Math.random().toString(36).slice(2, 6)}`;
}
