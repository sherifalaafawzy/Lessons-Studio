import { computed, signal } from "@preact/signals";
import type { Element, Lang, Scene, TimingFile } from "@lessonstudio/spec";
import { estimateTiming, walkElements } from "@lessonstudio/spec";
import { check, type Op } from "@lessonstudio/ops";
import { db } from "./fb.ts";
import { say, user } from "./state.ts";
import { LessonSync, type SyncState } from "./sync.ts";
import { t } from "./i18n.ts";

/** The open lesson and what the editor is looking at. One editor at a time. */
export const sync = signal<LessonSync | null>(null);
export const state = signal<SyncState | null>(null);
export const lesson = computed(() => state.value?.lesson ?? null);
/** The language whose text and narration are shown on the stage. */
export const lang = signal<Lang>("en");
export const sceneId = signal<string | null>(null);
export const elementId = signal<string | null>(null);
/** The template part selected on the stage (see partPath), or null. */
export const partId = signal<string | null>(null);
// One selection at a time: another scene clears it, and selecting an element replaces a part.
sceneId.subscribe(() => { partId.value = null; });
elementId.subscribe((v) => { if (v) partId.value = null; });
/** Seconds into the selected scene. */
export const playhead = signal(0);
export const orient = signal<"landscape" | "portrait" | "square">("landscape");

let stop: (() => void) | null = null;

export function openLesson(id: string): void {
  closeLesson();
  const uid = user.value?.uid;
  if (!uid) return;
  const s = new LessonSync(db, id, { uid, via: "studio" }).start();
  sync.value = s;
  stop = s.subscribe((x) => {
    state.value = x;
    const l = x.lesson;
    if (!l) return;
    if (!l.manifest.languages.some((g) => g.code === lang.value)) lang.value = l.manifest.defaultLang;
    if (!sceneId.value || !l.scenes.scenes.some((sc) => sc.id === sceneId.value)) sceneId.value = l.scenes.scenes[0]?.id ?? null;
    if (elementId.value && !findElement(currentScene.value, elementId.value)) elementId.value = null;
    if (x.dropped) say(x.dropped, true);
  });
  orient.value = "landscape";
}

export function closeLesson(): void {
  stop?.();
  stop = null;
  sync.value?.stop();
  sync.value = null;
  state.value = null;
  sceneId.value = null;
  elementId.value = null;
  playhead.value = 0;
}

/** Applies an edit; a refused one becomes a message. Returns true when it applied. */
export function edit(ops: Op[]): boolean {
  const err = sync.value?.edit(ops);
  if (err) {
    say(`${t("cantDo")}: ${err}`, true);
    return false;
  }
  return true;
}

export const currentScene = computed<Scene | null>(() => lesson.value?.scenes.scenes.find((s) => s.id === sceneId.value) ?? null);
export const sceneIndex = computed(() => lesson.value?.scenes.scenes.findIndex((s) => s.id === sceneId.value) ?? -1);

export function findElement(scene: Scene | null, id: string | null): Element | null {
  if (!scene || !id) return null;
  let found: Element | null = null;
  walkElements(scene, (el) => { if (el.id === id) found = el; });
  return found;
}
export const currentElement = computed(() => findElement(currentScene.value, elementId.value));

/** Timings for each language: measured ones once narration exists, else estimated from the text. */
export const timings = computed<Record<Lang, TimingFile>>(() => {
  const l = lesson.value;
  if (!l) return {};
  return Object.fromEntries(l.manifest.languages.map((g) => [g.code, estimateTiming(l.scenes.scenes, g.code)]));
});

/** The selected scene's timing in the stage language. */
export const sceneTiming = computed(() => {
  const i = sceneIndex.value;
  return i >= 0 ? timings.value[lang.value]?.scenes[i] ?? null : null;
});

export const report = computed(() => (lesson.value ? check(lesson.value) : null));

/** A free id for a new scene or element, from a base name. */
export function freeId(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const clean = base.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30) || "item";
  if (!used.has(clean)) return clean;
  for (let n = 2; ; n++) if (!used.has(`${clean}-${n}`)) return `${clean}-${n}`;
}

export function elementIds(scene: Scene | null): string[] {
  const ids: string[] = [];
  if (scene) walkElements(scene, (el) => ids.push(el.id));
  return ids;
}
