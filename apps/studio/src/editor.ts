import { computed, signal } from "@preact/signals";
import type { Element, Lang, Scene, TimingFile } from "@lessonstudio/spec";
import type { Player } from "@lessonstudio/player";
import { estimateTiming, walkElements } from "@lessonstudio/spec";
import { check, type Op } from "@lessonstudio/ops";
import { db } from "./fb.ts";
import { say, user } from "./state.ts";
import { LessonSync, type SyncState } from "./sync.ts";
import { t } from "./i18n.ts";

/** The open lesson and what the editor is looking at. One editor at a time. */
export const sync = signal<LessonSync | null>(null);
/** The open lesson's id (its Firestore document). */
export const lessonId = signal<string | null>(null);
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
  lessonId.value = id;
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
  lessonId.value = null;
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

/* ---------- the editor's workspace: playback, canvas view, panels ---------- */

/** The stage's player (Stage.tsx owns it); the transport and timeline drive it through this. */
export const stagePlayer = signal<Player | null>(null);
export const playing = signal(false);
/** Canvas zoom: "fit" fills the pasteboard; a number is screen pixels per design pixel. */
export const zoom = signal<"fit" | number>("fit");
export const guides = signal({ safe: false, center: false, thirds: false });
/** Playback repeats the selected scene. */
export const loopScene = signal(false);
export const rate = signal(1);
export type LeftTab = "scenes" | "add" | "layers";
export type RightTab = "design" | "animate" | "scene" | "lesson";
export const leftTab = signal<LeftTab | null>("scenes");
export const rightTab = signal<RightTab>("scene");
// A part or an element picked on the stage shows its properties.
partId.subscribe((v) => { if (v) rightTab.value = "design"; });
elementId.subscribe((v) => { if (v && rightTab.value !== "animate") rightTab.value = "design"; });

const remembered = (key: string, fallback: number): number => {
  try { const v = Number(localStorage.getItem(key)); return v > 0 ? v : fallback; } catch { return fallback; }
};
/** The timeline dock's height in pixels, kept between visits. */
export const dockHeight = signal(remembered("ls-dock", 230));
dockHeight.subscribe((v) => { try { localStorage.setItem("ls-dock", String(Math.round(v))); } catch { /* private mode */ } });

/** Seconds from the lesson's start to the playhead, in the stage language. */
export const lessonTime = computed(() => (sceneTiming.value?.start ?? 0) + playhead.value);

/** Moves the playhead to a time in the lesson: the scene under it becomes the selected one. */
export function seekLesson(t: number): void {
  const tm = timings.value[lang.value];
  const l = lesson.value;
  if (!tm || !l) return;
  const at = Math.max(0, Math.min(tm.duration - 0.01, t));
  const i = Math.max(0, tm.scenes.findIndex((s) => at >= s.start && at < s.end));
  const id = l.scenes.scenes[i]?.id;
  stagePlayer.value?.pause();
  if (id && id !== sceneId.value) { sceneId.value = id; elementId.value = null; }
  playhead.value = Math.max(0, at - tm.scenes[i]!.start);
}

/** Play or pause from the playhead. */
export function togglePlay(): void {
  const p = stagePlayer.value;
  if (!p) return;
  if (p.playing) { p.pause(); return; }
  p.setRate(rate.value);
  p.seek(lessonTime.value);
  void p.play();
}
/** Screen pixels per design pixel on the canvas right now (the transport shows it as a percentage). */
export const viewScale = signal(1);

/** Selects a scene and shows it at its end, with everything in place: the useful frame for laying it out. */
export function selectScene(id: string): void {
  const i = lesson.value?.scenes.scenes.findIndex((s) => s.id === id) ?? -1;
  const st = timings.value[lang.value]?.scenes[i];
  sceneId.value = id;
  elementId.value = null;
  playhead.value = st ? Math.max(0, st.end - st.start - 0.05) : 0;
}

/** Adds a scene (after the selected one, or at `at`) and selects it. Returns its id, or null when refused. */
export function insertScene(base: string, make: (id: string) => Scene, at?: number): string | null {
  const scenes = lesson.value?.scenes.scenes ?? [];
  const id = freeId(base, scenes.map((s) => s.id));
  const where = at ?? (Math.max(0, scenes.findIndex((s) => s.id === sceneId.value) + 1) || scenes.length);
  if (!edit([{ op: "addScene", scene: make(id), at: where }])) return null;
  selectScene(id);
  return id;
}
