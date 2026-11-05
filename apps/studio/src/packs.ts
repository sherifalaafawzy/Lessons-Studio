// The technology packs in the studio (docs/packs.md), handled generically so packs that land later show up by
// themselves: their gallery scenes (`packs.<id>.presets(langs)` in packages/ops), an element of each type to add, and
// the helpers behind the inspector's JSON form for any pack element (its own fields, checked live by the validator).
import type { Element, Issue, Orient, Scene, Text } from "@lessonstudio/spec";
import { PACKS, PACK_IDS, packsForTrack, walkElements, type PackId } from "@lessonstudio/spec";
import { check, clone, packs, type Lesson } from "@lessonstudio/ops";
import { GALLERY } from "./presets.ts";

/** The packs besides science (which has its own forms): code, data, iot, network, opt. */
export type TechPack = Exclude<PackId, "science">;
export const TECH_PACKS = PACK_IDS.filter((id): id is TechPack => id !== "science");

export interface PackPreset { pack: PackId; id: string; name: Text; scene: Scene }

type PresetFn = (langs: string[], stage?: Orient) => { id: string; name: Text; scene: Scene }[];
const presetFn = (id: TechPack): PresetFn | undefined => (packs as unknown as Record<string, { presets?: PresetFn } | undefined>)[id]?.presets;

const cache = new Map<string, PackPreset[]>();
/**
 * Every pack's gallery scenes for a lesson's languages, made once per languages and shape (a pack may compute a lot).
 * The stage shape is passed too, for packs that lay out for it. A pack whose presets throw shows none: one pack being
 * worked on never breaks the studio.
 */
export function packPresets(pack: TechPack, langs: string[], stage: Orient = "landscape"): PackPreset[] {
  const key = `${pack}|${langs.join(",")}|${stage}`;
  let list = cache.get(key);
  if (!list) {
    try {
      list = (presetFn(pack)?.(langs, stage) ?? []).map((p) => ({ pack, id: p.id, name: p.name, scene: p.scene }));
    } catch (e) {
      console.warn(`The ${pack} pack's presets failed:`, e);
      list = [];
    }
    cache.set(key, list);
  }
  return list;
}

/** Science scenes live with the other gallery scenes; here they join the packs so every picture is under a pack. */
function sciencePresets(langs: string[], stage: Orient): PackPreset[] {
  const key = `science|${langs.join(",")}|${stage}`;
  let list = cache.get(key);
  if (!list) {
    list = GALLERY.filter((g) => g.group === "science").map((g) => ({
      pack: "science" as const, id: g.id, name: g.name, scene: g.make({ id: g.id, langs, stage }),
    }));
    cache.set(key, list);
  }
  return list;
}

/**
 * Every pack's gallery scenes. Science is a pack too. When the lesson has a track, that track's packs come first
 * and the rest follow, so the pictures that belong to the lesson are the ones in front.
 */
export function packGallery(langs: string[], stage: Orient = "landscape", track?: string): { pack: PackId; presets: PackPreset[]; featured: boolean }[] {
  const groups = [
    { pack: "science" as const, presets: sciencePresets(langs, stage) },
    ...TECH_PACKS.map((pack) => ({ pack, presets: packPresets(pack, langs, stage) })),
  ].filter((g) => g.presets.length);
  const lead = new Set(packsForTrack(track));
  const featured = groups.filter((g) => lead.has(g.pack));
  const rest = groups.filter((g) => !lead.has(g.pack));
  return [...featured, ...rest].map((g) => ({ ...g, featured: lead.has(g.pack) }));
}

/** A preset's key for drag and drop and commands: "pack:<pack>/<id>". */
export const presetKey = (p: Pick<PackPreset, "pack" | "id">): string => `pack:${p.pack}/${p.id}`;
export function presetByKey(key: string, langs: string[], stage: Orient = "landscape"): PackPreset | undefined {
  const m = /^pack:([a-z]+)\/(.+)$/.exec(key);
  if (!m || !(PACK_IDS as string[]).includes(m[1]!)) return undefined;
  const pack = m[1] as PackId;
  const list = pack === "science" ? sciencePresets(langs, stage) : packPresets(pack as TechPack, langs, stage);
  return list.find((p) => p.id === m[2]);
}

/** A preset's scene under a new id (a copy, so the cached preset never changes). */
export function presetScene(p: PackPreset, id: string): Scene {
  const s = clone(p.scene);
  s.id = id;
  if (s.check) s.check.id = `${id}-q`.slice(0, 40);
  return s;
}

/**
 * One element of each pack type that some preset uses: the first such element in the pack's presets, without its
 * animation (its keyframes wait for words of the preset's own narration). Types no preset uses yet aren't offered.
 */
export function packElements(langs: string[], stage: Orient = "landscape"): { pack: TechPack; type: string; element: Element }[] {
  const out: { pack: TechPack; type: string; element: Element }[] = [];
  for (const pack of TECH_PACKS) {
    for (const type of PACKS[pack] as readonly string[]) {
      let found: Element | undefined;
      for (const p of packPresets(pack, langs, stage)) {
        walkElements(p.scene, (el) => { if (!found && el.type === type) found = el; });
        if (found) break;
      }
      if (found) {
        const el = clone(found) as Element & { anim?: unknown };
        delete el.anim;
        out.push({ pack, type, element: el });
      }
    }
  }
  return out;
}

/* ---------- an element's own fields as JSON ---------- */

/** What the inspector edits elsewhere (place, size, motion), so the JSON leaves it out. */
export const PLACE_KEYS = ["id", "type", "x", "y", "w", "h", "anim"] as const;
const PLACE = new Set<string>(PLACE_KEYS);

/** An element's own fields: everything but its id, type, place, size and animation. */
export function ownFields(el: Element): Record<string, unknown> {
  return Object.fromEntries(Object.entries(el).filter(([k]) => !PLACE.has(k)));
}
export const fieldsText = (el: Element): string => JSON.stringify(ownFields(el), null, 2);

export type FieldsProblem = { kind: "json"; message: string; at?: number } | { kind: "object" } | { kind: "place"; keys: string[] };

/**
 * Where JSON stops being JSON (from 0), by a strict scan: browsers' messages don't always say ("Unexpected token ']'"
 * for a trailing comma), so the form finds the place itself.
 */
export function jsonErrorAt(s: string): number {
  let i = 0;
  const ws = (): void => { while (i < s.length && " \t\n\r".includes(s[i]!)) i++; };
  const fail = (): never => { throw i; };
  const lit = (w: string): void => { if (s.startsWith(w, i)) i += w.length; else fail(); };
  const str = (): void => {
    if (s[i] !== '"') fail();
    i++;
    while (i < s.length && s[i] !== '"') {
      if (s[i] === "\\") { i++; if (s[i] === "u") { if (!/^[0-9a-fA-F]{4}$/.test(s.slice(i + 1, i + 5))) fail(); i += 4; } else if (!'"\\/bfnrt'.includes(s[i] ?? "")) fail(); }
      else if (s.charCodeAt(i) < 0x20) fail();
      i++;
    }
    if (s[i] !== '"') fail();
    i++;
  };
  const value = (): void => {
    ws();
    const c = s[i];
    if (c === "{") {
      i++; ws();
      if (s[i] === "}") { i++; return; }
      for (;;) { ws(); str(); ws(); if (s[i] !== ":") fail(); i++; value(); ws(); if (s[i] === ",") { i++; continue; } if (s[i] === "}") { i++; return; } fail(); }
    }
    if (c === "[") {
      i++; ws();
      if (s[i] === "]") { i++; return; }
      for (;;) { value(); ws(); if (s[i] === ",") { i++; continue; } if (s[i] === "]") { i++; return; } fail(); }
    }
    if (c === '"') return str();
    if (c === "t") return lit("true");
    if (c === "f") return lit("false");
    if (c === "n") return lit("null");
    const m = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/.exec(s.slice(i));
    if (!m) fail();
    i += m![0].length;
  };
  try { value(); ws(); return i < s.length ? i : -1; } catch (at) { return at as number; }
}

/** Reads the JSON of an element's own fields, or says what's wrong with it (and where, for a syntax error). */
export function parseFields(text: string): { value: Record<string, unknown> } | { problem: FieldsProblem } {
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch (e) {
    // "Unexpected token ']', "{…}" is not valid JSON": the message without the whole text, and the place from the scan.
    const message = (e as Error).message.replace(/^JSON\.parse: /, "").replace(/, "[\s\S]*" is not valid JSON$/, "").replace(/ in JSON at position \d+.*$/, "");
    const at = jsonErrorAt(text);
    return { problem: { kind: "json", message, ...(at >= 0 ? { at } : {}) } };
  }
  if (typeof v !== "object" || v === null || Array.isArray(v)) return { problem: { kind: "object" } };
  const place = Object.keys(v).filter((k) => PLACE.has(k));
  if (place.length) return { problem: { kind: "place", keys: place } };
  return { value: v as Record<string, unknown> };
}

/** The element with these own fields (keeping its id, type, place, size and animation). */
export function withFields(el: Element, fields: Record<string, unknown>): Element {
  const keep = Object.fromEntries(Object.entries(el).filter(([k]) => PLACE.has(k)));
  return { ...fields, ...keep } as unknown as Element;
}

/** The props for one updateElement: the fields that changed, and null for the ones taken away. */
export function fieldProps(el: Element, fields: Record<string, unknown>): Record<string, unknown> {
  const now = ownFields(el);
  const props: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) if (JSON.stringify(v) !== JSON.stringify(now[k])) props[k] = v;
  for (const k of Object.keys(now)) if (!(k in fields)) props[k] = null;
  return props;
}

export interface ElementIssue extends Issue { bad: boolean; /** The path inside the element ("" for the element itself). */ rel: string }

/**
 * The validator's findings for one element, as it is or as it would be with `candidate` in its place: a copy of the
 * lesson with only that scene, so a long lesson stays quick to check while typing.
 */
export function elementIssues(lesson: Lesson, sceneId: string, el: Element, candidate: Element = el): ElementIssue[] {
  const scene = lesson.scenes.scenes.find((s) => s.id === sceneId);
  if (!scene) return [];
  const copy = clone(scene);
  let where: string | null = null;
  walkElements(copy, (e, path) => {
    if (e.id !== el.id || where) return;
    where = path;
    for (const k of Object.keys(e)) delete (e as unknown as Record<string, unknown>)[k];
    Object.assign(e, clone(candidate));
  });
  if (!where) return [];
  const prefix = `scenes[0].${where}`;
  const r = check({ manifest: lesson.manifest, scenes: { ...lesson.scenes, scenes: [copy] } });
  const mine = (i: Issue): boolean => i.path === prefix || i.path.startsWith(`${prefix}.`) || i.path.startsWith(`${prefix}[`);
  const rel = (p: string): string => p.slice(prefix.length).replace(/^\./, "");
  return [
    ...r.errors.filter(mine).map((i) => ({ ...i, bad: true, rel: rel(i.path) })),
    ...r.warnings.filter(mine).map((i) => ({ ...i, bad: false, rel: rel(i.path) })),
  ];
}
