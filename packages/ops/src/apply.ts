import type { AnimProp, Element, Key, Manifest, Scene, Track, When } from "@lessonstudio/spec";
import { dirOf, walkElements } from "@lessonstudio/spec";
import { getAt, insertAt, parsePointer, removeAt, setAt } from "./pointer.ts";
import { presetKeys } from "./presets.ts";
import { OpError, type Lesson, type Op } from "./types.ts";

/** Deep copy of plain JSON data (no structuredClone, so older WebViews work too). */
export const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
const ID = /^[A-Za-z0-9_-]{1,40}$/;

export interface Applied {
  lesson: Lesson;
  /** Applying these to `lesson` gives back the lesson before the batch. */
  inverse: Op[];
  /** What changed, so a store writes only that. */
  scenes: Set<string>;
  manifest: boolean;
  order: boolean;
}

interface Touched { scenes: Set<string>; manifest: boolean; order: boolean }

/** Applies a batch of operations to a copy of the lesson. A failing operation throws an OpError and nothing changes. */
export function applyOps(lesson: Lesson, ops: Op[]): Applied {
  const next = clone(lesson);
  const inverse: Op[] = [];
  const touched: Touched = { scenes: new Set(), manifest: false, order: false };
  ops.forEach((op, i) => {
    try {
      inverse.unshift(...applyOne(next, op, touched));
    } catch (e) {
      throw new OpError(i, (e as Error).message);
    }
  });
  return { lesson: next, inverse, ...touched };
}

function sceneIndex(l: Lesson, id: string): number {
  const i = l.scenes.scenes.findIndex((s) => s.id === id);
  if (i < 0) throw new Error(`No scene "${id}"`);
  return i;
}

interface Found {
  list: Element[];
  index: number;
  el: Element;
  /** The group it sits in, if any. */
  parent?: string;
  /** In the scene's overlays (rather than a canvas scene's own elements). */
  overlay: boolean;
}

/** Finds an element anywhere in a scene: its list, its place in it, and its group. */
function findElement(scene: Scene, id: string): Found {
  let found: Found | null = null;
  const look = (list: Element[] | undefined, overlay: boolean, parent?: string): void => {
    (list ?? []).forEach((el, index) => {
      if (found) return;
      if (el.id === id) found = { list: list!, index, el, overlay, ...(parent ? { parent } : {}) };
      else if (el.type === "group") look(el.children, overlay, el.id);
    });
  };
  if (scene.template === "canvas") look(scene.content.elements, false);
  look(scene.overlays, true);
  if (!found) throw new Error(`No element "${id}" in scene "${scene.id}"`);
  return found;
}

/** The undo for changing some of an element's keyframe tracks: put each touched track back as it was. */
function tracksBack(sceneId: string, el: Element, props: AnimProp[]): Op[] {
  return [...new Set(props)].map((prop) => {
    const old = el.anim?.find((t) => t.prop === prop);
    return { op: "setTrack", scene: sceneId, element: el.id, prop, keys: old ? clone(old.keys) : null } as Op;
  });
}

function elementIds(scene: Scene): Set<string> {
  const ids = new Set<string>();
  walkElements(scene, (el) => ids.add(el.id));
  return ids;
}

function setKey(el: Element, prop: AnimProp, key: Key): void {
  el.anim ??= [];
  let tr = el.anim.find((t) => t.prop === prop);
  if (!tr) el.anim.push((tr = { prop, keys: [] }));
  const i = tr.keys.findIndex((k) => same(k.at, key.at));
  if (i >= 0) tr.keys[i] = key;
  else tr.keys.push(key);
}

function tidy(el: Element): void {
  if (el.anim) {
    el.anim = el.anim.filter((t) => t.keys.length);
    if (!el.anim.length) delete el.anim;
  }
}

function applyOne(l: Lesson, op: Op, touched: Touched): Op[] {
  const scenes = l.scenes.scenes;
  /** Edits one scene in place; its undo puts the old copy back. */
  /**
   * Edits one scene in place. `fn` returns the precise undo (only what it changed), so undoing after someone
   * else edited the same scene keeps their change; without one, the undo puts the whole old scene back.
   */
  const inScene = (id: string, fn: (s: Scene) => Op[] | void): Op[] => {
    const i = sceneIndex(l, id);
    const old = clone(scenes[i]!);
    const undo = fn(scenes[i]!);
    if (scenes[i]!.id !== id) throw new Error("A scene's id can't change here; use replaceScene");
    touched.scenes.add(id);
    return undo ?? [{ op: "replaceScene", scene: id, value: old }];
  };
  const inManifest = (fn: (m: Manifest) => void): Op[] => {
    const old = clone(l.manifest);
    fn(l.manifest);
    touched.manifest = true;
    return [{ op: "replaceManifest", value: old }];
  };
  const whole = (fn: () => void): Op[] => {
    const old = clone(l);
    fn();
    touched.manifest = true;
    touched.order = true;
    for (const s of scenes) touched.scenes.add(s.id);
    return [{ op: "restore", lesson: old }];
  };
  const guardPath = (path: string): void => {
    const first = parsePointer(path)[0];
    if (first === "id" || first === "template") throw new Error(`"/${first}" can't be edited with a path; use replaceScene`);
  };

  switch (op.op) {
    /* ---------- lesson ---------- */
    case "setMeta":
      return inManifest((m) => {
        for (const k of ["title", "summary", "brand", "stage", "level", "topic"] as const) {
          if (op[k] !== undefined) (m as unknown as Record<string, unknown>)[k] = op[k];
        }
        if (op.defaultLang !== undefined) {
          if (!m.languages.some((x) => x.code === op.defaultLang)) throw new Error(`No language "${op.defaultLang}" in the lesson`);
          m.defaultLang = op.defaultLang;
        }
      });
    case "addLanguage":
      return inManifest((m) => {
        if (m.languages.some((x) => x.code === op.code)) throw new Error(`The lesson already has "${op.code}"`);
        const track: Manifest["languages"][number] = {
          code: op.code, dir: op.dir ?? dirOf(op.code), name: op.name, duration: 1,
          timing: `timing/${op.code}.json`, captions: `captions/${op.code}.vtt`, quality: op.quality ?? "draft",
        };
        if (op.voice) track.voice = op.voice;
        m.languages.push(track);
      });
    case "removeLanguage":
      return whole(() => {
        const m = l.manifest;
        if (m.defaultLang === op.code) throw new Error("The default language can't be removed; set another first");
        if (!m.languages.some((x) => x.code === op.code)) throw new Error(`No language "${op.code}"`);
        m.languages = m.languages.filter((x) => x.code !== op.code);
        for (const s of scenes) delete s.narration[op.code];
      });
    case "attachAsset":
      return inManifest((m) => {
        m.assets = (m.assets ?? []).filter((a) => a.path !== op.asset.path);
        m.assets.push(op.asset);
      });
    case "detachAsset":
      return inManifest((m) => {
        if (!(m.assets ?? []).some((a) => a.path === op.path)) throw new Error(`No asset "${op.path}"`);
        m.assets = m.assets!.filter((a) => a.path !== op.path);
      });
    case "replaceManifest":
      return inManifest((m) => {
        for (const k of Object.keys(m)) delete (m as unknown as Record<string, unknown>)[k];
        Object.assign(m, clone(op.value));
      });
    case "restore":
      return whole(() => {
        const v = clone(op.lesson);
        l.manifest = v.manifest;
        l.scenes = v.scenes;
      });

    /* ---------- scenes ---------- */
    case "addScene": {
      if (!op.scene || typeof op.scene.id !== "string" || !ID.test(op.scene.id)) throw new Error("A scene needs an id: letters, digits, - and _");
      if (scenes.some((s) => s.id === op.scene.id)) throw new Error(`There is already a scene "${op.scene.id}"`);
      const at = Math.max(0, Math.min(op.at ?? scenes.length, scenes.length));
      scenes.splice(at, 0, clone(op.scene));
      touched.order = true;
      touched.scenes.add(op.scene.id);
      return [{ op: "removeScene", scene: op.scene.id }];
    }
    case "removeScene": {
      const i = sceneIndex(l, op.scene);
      const [old] = scenes.splice(i, 1);
      touched.order = true;
      touched.scenes.add(op.scene);
      return [{ op: "addScene", scene: old!, at: i }];
    }
    case "moveScene": {
      const i = sceneIndex(l, op.scene);
      const [s] = scenes.splice(i, 1);
      scenes.splice(Math.max(0, Math.min(op.to, scenes.length)), 0, s!);
      touched.order = true;
      return [{ op: "moveScene", scene: op.scene, to: i }];
    }
    case "duplicateScene": {
      const i = sceneIndex(l, op.scene);
      if (!ID.test(op.id) || scenes.some((s) => s.id === op.id)) throw new Error(`"${op.id}" can't be the new scene's id`);
      const copy = clone(scenes[i]!);
      copy.id = op.id;
      if (copy.check) copy.check.id = `${copy.check.id}-${op.id}`.slice(0, 40);
      scenes.splice(Math.max(0, Math.min(op.at ?? i + 1, scenes.length)), 0, copy);
      touched.order = true;
      touched.scenes.add(op.id);
      return [{ op: "removeScene", scene: op.id }];
    }
    case "replaceScene": {
      const i = sceneIndex(l, op.scene);
      if (op.value?.id !== op.scene) throw new Error("replaceScene keeps the scene's id");
      const old = scenes[i]!;
      scenes[i] = clone(op.value);
      touched.scenes.add(op.scene);
      return [{ op: "replaceScene", scene: op.scene, value: old }];
    }
    case "setNarration":
      if (!l.manifest.languages.some((x) => x.code === op.lang)) throw new Error(`No language "${op.lang}"; add it first`);
      return inScene(op.scene, (s) => {
        const old = s.narration[op.lang];
        s.narration[op.lang] = op.text;
        return [old === undefined ? { op: "remove", scene: s.id, path: `/narration/${op.lang}` } : { op: "setNarration", scene: s.id, lang: op.lang, text: old }];
      });

    /* ---------- paths ---------- */
    case "set":
      guardPath(op.path);
      if (op.value === undefined) throw new Error("set needs a value; use remove to delete");
      return inScene(op.scene, (s) => {
        const old = getAt(s, op.path);
        setAt(s, op.path, clone(op.value));
        return [old === undefined ? { op: "remove", scene: s.id, path: op.path } : { op: "set", scene: s.id, path: op.path, value: clone(old) }];
      });
    case "insert":
      guardPath(op.path);
      return inScene(op.scene, (s) => {
        const parts = parsePointer(op.path);
        const parent = getAt(s, parts.length > 1 ? `/${parts.slice(0, -1).map((x) => x.replace(/~/g, "~0").replace(/\//g, "~1")).join("/")}` : "");
        const last = parts[parts.length - 1]!;
        const at = Array.isArray(parent) && last === "-" ? String(parent.length) : last;
        insertAt(s, op.path, clone(op.value));
        const base = op.path.slice(0, op.path.lastIndexOf("/"));
        return [{ op: "remove", scene: s.id, path: `${base}/${at}` }];
      });
    case "remove":
      guardPath(op.path);
      return inScene(op.scene, (s) => {
        const old = getAt(s, op.path);
        removeAt(s, op.path);
        return [{ op: "insert", scene: s.id, path: op.path, value: clone(old) }];
      });
    case "addCue":
      return inScene(op.scene, (s) => {
        const had = !!s.cues;
        (s.cues ??= []).push(clone(op.cue));
        return [{ op: "remove", scene: s.id, path: had ? `/cues/${s.cues.length - 1}` : "/cues" }];
      });

    /* ---------- elements ---------- */
    case "addElement":
      return inScene(op.scene, (s) => {
        const el = clone(op.element);
        if (!el || typeof el.id !== "string" || !ID.test(el.id)) throw new Error("An element needs an id: letters, digits, - and _");
        if (elementIds(s).has(el.id)) throw new Error(`Scene "${s.id}" already has an element "${el.id}"`);
        let list: Element[];
        if (op.parent) {
          const g = findElement(s, op.parent).el;
          if (g.type !== "group") throw new Error(`"${op.parent}" is not a group`);
          list = g.children;
        } else if (s.template === "canvas" && !op.overlay) list = s.content.elements;
        else list = s.overlays ??= [];
        list.splice(Math.max(0, Math.min(op.at ?? list.length, list.length)), 0, el);
        return [{ op: "removeElement", scene: s.id, element: el.id }];
      });
    case "updateElement":
      return inScene(op.scene, (s) => {
        const { el } = findElement(s, op.element);
        const rec = el as unknown as Record<string, unknown>;
        const back: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(op.props)) {
          if (k === "id" || k === "type") throw new Error(`An element's ${k} can't change; remove it and add a new one`);
          back[k] = k in rec ? clone(rec[k]) : null;
          if (v === null) delete rec[k];
          else rec[k] = clone(v);
        }
        return [{ op: "updateElement", scene: s.id, element: el.id, props: back }];
      });
    case "removeElement":
      return inScene(op.scene, (s) => {
        const f = findElement(s, op.element);
        f.list.splice(f.index, 1);
        if (f.overlay && !f.parent && s.overlays?.length === 0) delete s.overlays;
        return [{ op: "addElement", scene: s.id, element: clone(f.el), at: f.index, ...(f.parent ? { parent: f.parent } : {}), ...(f.overlay ? { overlay: true } : {}) }];
      });
    case "moveElement":
      return inScene(op.scene, (s) => {
        const f = findElement(s, op.element);
        f.list.splice(f.index, 1);
        f.list.splice(Math.max(0, Math.min(op.to, f.list.length)), 0, f.el);
        return [{ op: "moveElement", scene: s.id, element: f.el.id, to: f.index }];
      });

    /* ---------- keyframes ---------- */
    case "setKeyframe":
      return inScene(op.scene, (s) => {
        const { el } = findElement(s, op.element);
        const undo = tracksBack(s.id, el, [op.prop]);
        setKey(el, op.prop, clone(op.key));
        return undo;
      });
    case "removeKeyframe":
      return inScene(op.scene, (s) => {
        const { el } = findElement(s, op.element);
        const undo = tracksBack(s.id, el, [op.prop]);
        const tr = el.anim?.find((t) => t.prop === op.prop);
        const before = tr?.keys.length ?? 0;
        if (tr) tr.keys = tr.keys.filter((k) => !same(k.at, op.at as When));
        if (!tr || tr.keys.length === before) throw new Error(`No ${op.prop} keyframe at that time on "${op.element}"`);
        tidy(el);
        return undo;
      });
    case "setTrack":
      return inScene(op.scene, (s) => {
        const { el } = findElement(s, op.element);
        const undo = tracksBack(s.id, el, [op.prop]);
        el.anim = (el.anim ?? []).filter((t) => t.prop !== op.prop);
        if (op.keys) el.anim.push({ prop: op.prop, keys: clone(op.keys) });
        tidy(el);
        return undo;
      });
    case "animate":
      return inScene(op.scene, (s) => {
        const { el } = findElement(s, op.element);
        const add = presetKeys(el, op.preset, op.at, op.dur, op.to);
        const undo = tracksBack(s.id, el, add.map((tr) => tr.prop));
        for (const tr of add) for (const k of tr.keys) setKey(el, tr.prop, k);
        return undo;
      });
    case "setCamera":
      return inScene(op.scene, (s) => {
        const old = s.camera ? clone(s.camera) : null;
        if (op.tracks && op.tracks.length) s.camera = clone(op.tracks) as Track[];
        else delete s.camera;
        return [{ op: "setCamera", scene: s.id, tracks: old }];
      });
  }
  throw new Error(`Unknown operation "${(op as { op?: string }).op}"`);
}

/** Re-applies local batches on top of a newer lesson. Batches that no longer apply are dropped and reported. */
export function rebase(base: Lesson, batches: Op[][]): { lesson: Lesson; kept: Op[][]; dropped: { ops: Op[]; error: string }[] } {
  let lesson = base;
  const kept: Op[][] = [];
  const dropped: { ops: Op[]; error: string }[] = [];
  for (const ops of batches) {
    try {
      lesson = applyOps(lesson, ops).lesson;
      kept.push(ops);
    } catch (e) {
      dropped.push({ ops, error: (e as Error).message });
    }
  }
  return { lesson, kept, dropped };
}
