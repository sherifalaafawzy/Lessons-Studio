import type {
  Element, LanguageTrack, Lang, LessonPackage, Manifest, Scene, SceneTiming, ScenesFile, Text, TimingFile, Track, When,
} from "./types.ts";
import { dirOf, hasArabic, hasText, splitWords } from "./text.ts";
import { isIcon, isLibPath } from "./library.ts";
import { resolveCues, resolveWhen } from "./cues.ts";
import { walkElements } from "./elements.ts";

export interface Issue {
  code: string;
  /** Where, e.g. "scenes[2].content.nodes[1].label". */
  path: string;
  detail?: string;
}

export interface Report {
  ok: boolean;
  errors: Issue[];
  warnings: Issue[];
}

type Add = (code: string, path: string, detail?: string) => void;

export const TEMPLATES = ["title-hook", "steps", "flow", "message-mock", "quiz", "summary", "canvas"] as const;
export const TONES = ["fg", "muted", "accent", "accent2", "danger", "ok", "surface", "bg", "line"] as const;
export const EASES = ["linear", "in", "out", "in-out", "back", "step"] as const;
export const ANIM_PROPS = ["x", "y", "scale", "rotate", "opacity", "draw", "reveal"] as const;
export const ELEMENT_TYPES = ["text", "shape", "line", "path", "icon", "image", "code", "chart", "group"] as const;

/** Limits that keep lessons light on old phones and weak connections (PLAN.md §9). Over them is a warning. */
export const BUDGETS = {
  /** Kilobytes one language downloads: its audio and every shared asset. */
  lessonKB: 300,
  /** Elements in one scene (overlays and group children included); maxElements is the hard limit. */
  sceneElements: 40,
  maxElements: 80,
  imageKB: 120,
  /** Tracks animating at the same moment. */
  tracks: 12,
};

export const ICONS = [
  "user", "page", "bot", "server", "data", "lock", "shield", "phone", "mail", "link",
  "warning", "key", "cloud", "chip", "wifi", "check", "cross", "spark",
] as const;

const PKG_ID = /^[a-z0-9][a-z0-9-]{1,63}$/;
const ITEM_ID = /^[A-Za-z0-9_-]{1,40}$/;
const LANG = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;
const SHA = /^[0-9a-f]{64}$/;
const DATE = /^\d{4}-\d{2}-\d{2}/;
const ORIGINS = ["human", "ai-assisted", "ai"];
const EPS = 1e-3;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const arr = <T>(v: T[] | undefined): T[] => (Array.isArray(v) ? v : []);

/** A package path: relative, no "..", no scheme, no backslash. */
export function relPathOk(p: unknown): boolean {
  return (
    typeof p === "string" && p.length > 0 && p.length <= 200 &&
    !/^[a-z][a-z0-9+.-]*:/i.test(p) && !p.startsWith("/") && !p.includes("\\") && !p.split("/").includes("..")
  );
}

/** What a scene's cues may point at. */
export function targetsOf(scene: Scene): Set<string> {
  const t = new Set<string>(["title"]);
  const c = scene.content as unknown as Record<string, unknown>;
  switch (scene.template) {
    case "title-hook": t.add("kicker"); t.add("hook"); break;
    case "steps": arr(scene.content.steps).forEach((_, i) => t.add(String(i + 1))); break;
    case "summary": arr(scene.content.points).forEach((_, i) => t.add(String(i + 1))); t.add("takeaway"); break;
    case "flow":
      arr(scene.content.nodes).forEach((n) => t.add(n.id));
      arr(scene.content.edges).forEach((e) => t.add(`${e.from}>${e.to}`));
      break;
    case "message-mock": t.add("from"); if (c.link) t.add("link"); arr(scene.content.flags).forEach((f) => t.add(f.id)); break;
    case "quiz": t.add("prompt"); arr(scene.check?.options).forEach((o) => t.add(o.id)); break;
  }
  walkElements(scene, (el) => { if (el && typeof el.id === "string") t.add(el.id); });
  return t;
}

/** Checks a text: present when required, in every language, and never "·" in Arabic (it reads as a zero). */
function text(v: Text | undefined, path: string, langs: Lang[], err: Add, warn: Add, required = true): void {
  if (v === undefined || v === null) {
    if (required) err("missingText", path);
    return;
  }
  if (typeof v === "string") {
    if (!v.trim()) err("emptyText", path);
    if (hasArabic(v) && v.includes("·")) err("middleDot", path);
    return;
  }
  if (!isObj(v)) return err("badText", path);
  for (const l of langs) if (!hasText(v, l)) err("missingText", path, l);
  for (const [l, s] of Object.entries(v)) {
    if (typeof s !== "string") err("badText", `${path}.${l}`);
    else if ((dirOf(l) === "rtl" || hasArabic(s)) && s.includes("·")) err("middleDot", `${path}.${l}`);
    if (!langs.includes(l)) warn("extraLang", path, l);
  }
}

function validateManifest(m: Manifest, err: Add, warn: Add): Lang[] {
  if (!isObj(m)) { err("badManifest", "manifest"); return []; }
  if (m.spec !== "lesson-package" || (m.version !== "0.1" && m.version !== "0.2")) err("version", "manifest.version", String(m.version));
  if (m.stage !== undefined && !["landscape", "portrait", "square"].includes(m.stage)) err("badStage", "manifest.stage");
  if (typeof m.id !== "string" || !PKG_ID.test(m.id)) err("badId", "manifest.id");
  if (!Number.isInteger(m.rev) || m.rev < 1) err("badRev", "manifest.rev");

  const langs: Lang[] = [];
  const tracks = arr(m.languages);
  if (!tracks.length) err("noLanguages", "manifest.languages");
  tracks.forEach((l: LanguageTrack, i) => {
    const p = `manifest.languages[${i}]`;
    if (typeof l.code !== "string" || !LANG.test(l.code)) return err("badLang", `${p}.code`);
    if (langs.includes(l.code)) err("dupLang", `${p}.code`, l.code);
    langs.push(l.code);
    if (l.dir !== "ltr" && l.dir !== "rtl") err("badDir", `${p}.dir`);
    else if (l.dir !== dirOf(l.code)) warn("unusualDir", `${p}.dir`, l.code);
    if (!isStr(l.name)) err("missingText", `${p}.name`);
    if (!isNum(l.duration) || l.duration <= 0 || l.duration > 600) err("badDuration", `${p}.duration`);
    else if (l.duration > 150) warn("longLesson", `${p}.duration`, String(l.duration));
    if (!relPathOk(l.timing)) err("badPath", `${p}.timing`);
    for (const k of ["audio", "audioFallback", "captions"] as const) if (l[k] !== undefined && !relPathOk(l[k])) err("badPath", `${p}.${k}`);
    if (l.quality !== undefined && !["reviewed", "machine", "draft"].includes(l.quality)) err("badQuality", `${p}.quality`);
    const voiceOk = (v: unknown, q: string): void => {
      if (!isObj(v) || !isStr(v.provider) || !isStr(v.name)) err("badVoice", q);
      else if ((v.model !== undefined && !isStr(v.model)) || (v.style !== undefined && (!isStr(v.style) || v.style.length > 300))) err("badVoice", q);
    };
    if (l.voice !== undefined) voiceOk(l.voice, `${p}.voice`);
    if (l.voices !== undefined) {
      if (!isObj(l.voices)) err("badVoice", `${p}.voices`);
      else for (const [who, v] of Object.entries(l.voices)) {
        if (!ITEM_ID.test(who)) err("badVoice", `${p}.voices`, who);
        else voiceOk(v, `${p}.voices.${who}`);
      }
    }
  });
  if (!langs.includes(m.defaultLang)) err("badDefaultLang", "manifest.defaultLang");

  text(m.title, "manifest.title", langs, err, warn);
  text(m.summary, "manifest.summary", langs, err, warn, false);
  if (m.level !== undefined && (!Number.isInteger(m.level) || m.level < 1 || m.level > 12)) err("badLevel", "manifest.level");
  if (m.brand !== undefined && (typeof m.brand !== "string" || !PKG_ID.test(m.brand))) err("badBrand", "manifest.brand");
  if (m.poster !== undefined && !relPathOk(m.poster)) err("badPath", "manifest.poster");

  const seen = new Set<string>();
  arr(m.assets).forEach((a, i) => {
    const p = `manifest.assets[${i}]`;
    if (!relPathOk(a.path)) err("badPath", `${p}.path`);
    else if (seen.has(a.path)) err("dupAsset", `${p}.path`, a.path);
    seen.add(a.path);
    if (!isStr(a.type)) err("badAsset", `${p}.type`);
    if (!Number.isInteger(a.bytes) || a.bytes < 0) err("badAsset", `${p}.bytes`);
    if (typeof a.sha256 !== "string" || !SHA.test(a.sha256)) err("badAsset", `${p}.sha256`);
  });
  arr(m.licences).forEach((l, i) => {
    if (!relPathOk(l.path)) err("badPath", `manifest.licences[${i}].path`);
    if (!isStr(l.licence)) err("missingText", `manifest.licences[${i}].licence`);
  });

  const pv = m.provenance;
  if (!isObj(pv)) err("missingProvenance", "manifest.provenance");
  else {
    if (typeof pv.createdAt !== "string" || !DATE.test(pv.createdAt)) err("badDate", "manifest.provenance.createdAt");
    if (!isStr(pv.createdBy)) err("missingText", "manifest.provenance.createdBy");
    if (!isStr(pv.tool)) err("missingText", "manifest.provenance.tool");
    arr(pv.sources).forEach((s, i) => {
      if (!isStr(s.title)) err("missingText", `manifest.provenance.sources[${i}].title`);
      if (s.url !== undefined && !/^https:\/\/\S+$/.test(s.url)) err("badUrl", `manifest.provenance.sources[${i}].url`);
    });
  }
  const ai = m.ai;
  if (!isObj(ai)) err("missingDisclosure", "manifest.ai");
  else {
    if (!ORIGINS.includes(ai.script)) err("badDisclosure", "manifest.ai.script");
    if (![...ORIGINS, "none"].includes(ai.translation)) err("badDisclosure", "manifest.ai.translation");
    if (!["human", "synthetic", "none"].includes(ai.narration)) err("badDisclosure", "manifest.ai.narration");
    if (!ORIGINS.includes(ai.visuals)) err("badDisclosure", "manifest.ai.visuals");
    if (!["none", "stylised", "photo", "live"].includes(ai.avatar)) err("badDisclosure", "manifest.ai.avatar");
  }
  if (m.reviewed !== undefined && (!isStr(m.reviewed.by) || typeof m.reviewed.at !== "string" || !DATE.test(m.reviewed.at))) {
    err("badReviewed", "manifest.reviewed");
  }
  return langs;
}

function count(path: string, list: unknown[], min: number, max: number, err: Add): void {
  if (list.length < min || list.length > max) err("badCount", path, `${min}–${max}`);
}

function validateContent(s: Scene, p: string, langs: Lang[], err: Add, warn: Add): void {
  const T = (v: Text | undefined, q: string, req = true): void => text(v, `${p}.content.${q}`, langs, err, warn, req);
  if (!isObj(s.content as unknown)) return err("badContent", `${p}.content`);
  switch (s.template) {
    case "title-hook": {
      const c = s.content;
      T(c.title, "title"); T(c.kicker, "kicker", false); T(c.hook, "hook", false);
      if (c.icon !== undefined && !isIcon(c.icon)) err("badIcon", `${p}.content.icon`);
      break;
    }
    case "steps":
      T(s.content.title, "title", false);
      count(`${p}.content.steps`, arr(s.content.steps), 1, 8, err);
      arr(s.content.steps).forEach((x, i) => T(x, `steps[${i}]`));
      break;
    case "summary":
      T(s.content.title, "title", false); T(s.content.takeaway, "takeaway", false);
      count(`${p}.content.points`, arr(s.content.points), 1, 6, err);
      arr(s.content.points).forEach((x, i) => T(x, `points[${i}]`));
      break;
    case "flow": {
      const c = s.content;
      T(c.title, "title", false);
      const nodes = arr(c.nodes);
      const ids = new Set<string>();
      count(`${p}.content.nodes`, nodes, 2, 8, err);
      nodes.forEach((n, i) => {
        if (typeof n.id !== "string" || !ITEM_ID.test(n.id) || n.id.includes(">")) err("badId", `${p}.content.nodes[${i}].id`);
        else if (ids.has(n.id)) err("dupId", `${p}.content.nodes[${i}].id`, n.id);
        ids.add(n.id);
        T(n.label, `nodes[${i}].label`);
        if (n.icon !== undefined && !isIcon(n.icon)) err("badIcon", `${p}.content.nodes[${i}].icon`);
        if (n.tone !== undefined && !["neutral", "trusted", "system", "danger"].includes(n.tone)) err("badTone", `${p}.content.nodes[${i}].tone`);
      });
      const pairs = new Set<string>();
      count(`${p}.content.edges`, arr(c.edges), 1, 12, err);
      arr(c.edges).forEach((e, i) => {
        const q = `${p}.content.edges[${i}]`;
        if (!ids.has(e.from) || !ids.has(e.to)) err("badEdge", q, `${e.from}>${e.to}`);
        else if (e.from === e.to) err("badEdge", q, "self");
        if (pairs.has(`${e.from}>${e.to}`)) err("dupEdge", q);
        pairs.add(`${e.from}>${e.to}`);
        T(e.label, `edges[${i}].label`, false);
      });
      break;
    }
    case "message-mock": {
      const c = s.content;
      if (!["sms", "chat", "email"].includes(c.kind)) err("badKind", `${p}.content.kind`);
      T(c.from, "from"); T(c.subject, "subject", false); T(c.link, "link", false);
      count(`${p}.content.lines`, arr(c.lines), 1, 8, err);
      arr(c.lines).forEach((x, i) => T(x, `lines[${i}]`));
      const ids = new Set<string>();
      arr(c.flags).forEach((f, i) => {
        const q = `${p}.content.flags[${i}]`;
        if (typeof f.id !== "string" || !ITEM_ID.test(f.id)) err("badId", `${q}.id`);
        else if (ids.has(f.id) || ["from", "link", "title"].includes(f.id)) err("dupId", `${q}.id`, f.id);
        ids.add(f.id);
        const okLine = f.line === "from" || (f.line === "link" && c.link !== undefined) ||
          (Number.isInteger(f.line) && (f.line as number) >= 0 && (f.line as number) < arr(c.lines).length);
        if (!okLine) err("badLine", `${q}.line`);
        T(f.label, `flags[${i}].label`);
      });
      break;
    }
    case "quiz":
      T(s.content.title, "title", false);
      if (!s.check) err("quizNeedsCheck", p);
      break;
    case "canvas":
      if (!Array.isArray(s.content.elements)) err("badContent", `${p}.content.elements`);
      break;
  }
}

const inRange = (v: unknown, lo: number, hi: number): boolean => isNum(v) && v >= lo && v <= hi;
const PATH_D = /^[MmLlHhVvCcSsQqTtAaZz0-9.,eE+\s-]{1,4000}$/;

function validateWhen(w: When, q: string, langs: Lang[], err: Add, warn: Add): void {
  if (isNum(w)) { if (w < 0 || w > 600) err("badKeyTime", q); return; }
  if (!isObj(w)) return err("badKeyTime", q);
  text(w.word, `${q}.word`, langs, err, warn);
  if (w.occurrence !== undefined && (!Number.isInteger(w.occurrence) || w.occurrence < 1)) err("badOccurrence", `${q}.occurrence`);
  if (w.offset !== undefined && !inRange(w.offset, -10, 10)) err("badKeyTime", `${q}.offset`);
}

function validateTracks(tracks: Track[] | undefined, q: string, langs: Lang[], err: Add, warn: Add, type?: Element["type"]): void {
  if (tracks === undefined) return;
  if (!Array.isArray(tracks)) return err("badTrack", q);
  const seen = new Set<string>();
  tracks.forEach((tr, i) => {
    const tq = `${q}[${i}]`;
    if (!isObj(tr) || !(ANIM_PROPS as readonly string[]).includes(tr.prop)) return err("badProp", `${tq}.prop`, String(tr?.prop));
    if (seen.has(tr.prop)) err("dupTrack", `${tq}.prop`, tr.prop);
    seen.add(tr.prop);
    if (tr.prop === "draw" && type && !["line", "path", "shape"].includes(type)) err("badProp", `${tq}.prop`, `draw on ${type}`);
    if (tr.prop === "reveal" && type && !["text", "code", "chart"].includes(type)) err("badProp", `${tq}.prop`, `reveal on ${type}`);
    const keys = arr(tr.keys);
    if (!keys.length || keys.length > 50) err("badCount", `${tq}.keys`, "1–50");
    keys.forEach((k, j) => {
      const kq = `${tq}.keys[${j}]`;
      if (!isObj(k)) return err("badKey", kq);
      validateWhen(k.at, `${kq}.at`, langs, err, warn);
      if (!isNum(k.value) || Math.abs(k.value) > 1e5) err("badKey", `${kq}.value`);
      if (k.ease !== undefined && !(EASES as readonly string[]).includes(k.ease)) err("badEase", `${kq}.ease`);
    });
  });
}

function validateElements(list: Element[] | undefined, p: string, langs: Lang[], ids: Set<string>, err: Add, warn: Add, depth = 0): number {
  if (list === undefined) return 0;
  if (!Array.isArray(list)) { err("badElements", p); return 0; }
  let n = 0;
  list.forEach((el, i) => {
    const q = `${p}[${i}]`;
    n++;
    if (!isObj(el)) return err("badElement", q);
    if (typeof el.id !== "string" || !ITEM_ID.test(el.id) || el.id.includes(">")) err("badId", `${q}.id`);
    else if (ids.has(el.id)) err("dupId", `${q}.id`, el.id);
    ids.add(el.id);
    if (!(ELEMENT_TYPES as readonly string[]).includes(el.type)) return err("badElementType", `${q}.type`, String(el.type));
    if (!inRange(el.x, -4000, 8000) || !inRange(el.y, -4000, 8000)) err("badBox", q);
    for (const k of ["w", "h"] as const) if (el[k] !== undefined && !inRange(el[k], 0, 8000)) err("badBox", `${q}.${k}`);
    if (el.rotate !== undefined && !inRange(el.rotate, -3600, 3600)) err("badBox", `${q}.rotate`);
    if (el.scale !== undefined && !inRange(el.scale, 0, 20)) err("badBox", `${q}.scale`);
    if (el.opacity !== undefined && !inRange(el.opacity, 0, 1)) err("badBox", `${q}.opacity`);
    if (el.fixed !== undefined && typeof el.fixed !== "boolean") err("badFixed", `${q}.fixed`);
    const tone = (v: unknown, k: string): void => { if (v !== undefined && !(TONES as readonly string[]).includes(v as string)) err("badTone", `${q}.${k}`); };
    tone(el.tone, "tone");
    switch (el.type) {
      case "text":
        text(el.text, `${q}.text`, langs, err, warn);
        if (el.size !== undefined && !inRange(el.size, 8, 300)) err("badSize", `${q}.size`);
        if (el.weight !== undefined && ![400, 600, 700, 800].includes(el.weight)) err("badWeight", `${q}.weight`);
        if (el.align !== undefined && !["start", "center", "end"].includes(el.align)) err("badAlign", `${q}.align`);
        break;
      case "shape":
        if (!["rect", "ellipse", "pill"].includes(el.shape)) err("badShape", `${q}.shape`);
        tone(el.fill, "fill"); tone(el.stroke, "stroke");
        if (el.w === undefined || el.h === undefined) err("badBox", q, "w and h");
        break;
      case "line":
        if (!inRange(el.x2, -4000, 8000) || !inRange(el.y2, -4000, 8000)) err("badBox", `${q}.x2`);
        if (el.arrow !== undefined && !["none", "end", "both"].includes(el.arrow)) err("badArrow", `${q}.arrow`);
        break;
      case "path":
        if (typeof el.d !== "string" || !PATH_D.test(el.d)) err("badPath", `${q}.d`);
        tone(el.fill, "fill");
        if (el.w === undefined || el.h === undefined) err("badBox", q, "w and h");
        break;
      case "icon":
        if (!isIcon(el.icon)) err("badIcon", `${q}.icon`);
        break;
      case "image":
        if (!relPathOk(el.src)) err("badPath", `${q}.src`);
        else if (el.src.startsWith("@lib/") && !isLibPath(el.src)) err("badLibPath", `${q}.src`, el.src);
        if (el.small !== undefined && (!relPathOk(el.small) || (el.small.startsWith("@lib/") && !isLibPath(el.small)))) err("badPath", `${q}.small`);
        text(el.alt, `${q}.alt`, langs, err, warn, false);
        if (el.fit !== undefined && !["cover", "contain"].includes(el.fit)) err("badFit", `${q}.fit`);
        if (el.w === undefined || el.h === undefined) err("badBox", q, "w and h");
        break;
      case "code":
        if (typeof el.code !== "string" || el.code.length > 4000) err("badCode", `${q}.code`);
        arr(el.highlight).forEach((l, j) => { if (!Number.isInteger(l) || l < 1) err("badCode", `${q}.highlight[${j}]`); });
        break;
      case "chart":
        if (!["bar", "line"].includes(el.kind)) err("badChart", `${q}.kind`);
        if (!Array.isArray(el.data) || !el.data.length || el.data.length > 24 || !el.data.every(isNum)) err("badChart", `${q}.data`);
        arr(el.labels).forEach((l, j) => text(l, `${q}.labels[${j}]`, langs, err, warn));
        if (el.w === undefined || el.h === undefined) err("badBox", q, "w and h");
        break;
      case "group":
        if (depth >= 3) err("deepGroup", q);
        else n += validateElements(el.children, `${q}.children`, langs, ids, err, warn, depth + 1);
        break;
    }
    validateTracks(el.anim, `${q}.anim`, langs, err, warn, el.type);
  });
  return n;
}

function validateScenes(f: ScenesFile, langs: Lang[], err: Add, warn: Add): void {
  if (!isObj(f) || (f.version !== "0.1" && f.version !== "0.2")) err("version", "scenes.version");
  const scenes = arr(f?.scenes);
  count("scenes.scenes", scenes, 1, 30, err);
  const ids = new Set<string>();
  const checks = new Set<string>();
  scenes.forEach((s, i) => {
    const p = `scenes[${i}]`;
    if (typeof s.id !== "string" || !ITEM_ID.test(s.id)) err("badId", `${p}.id`);
    else if (ids.has(s.id)) err("dupId", `${p}.id`, s.id);
    ids.add(s.id);
    if (!(TEMPLATES as readonly string[]).includes(s.template)) return err("badTemplate", `${p}.template`, String(s.template));
    if (!isObj(s.narration)) err("missingNarration", `${p}.narration`);
    else for (const l of langs) {
      if (!hasText(s.narration, l)) err("missingNarration", `${p}.narration`, l);
      else if ((s.narration[l] ?? "").split(/\s+/).length > 70) warn("longScene", `${p}.narration`, l);
    }
    if (isObj(s.narration)) text(s.narration, `${p}.narration`, langs, () => {}, warn);
    if (s.speaker !== undefined && (typeof s.speaker !== "string" || !ITEM_ID.test(s.speaker))) err("badSpeaker", `${p}.speaker`);
    for (const [l, v] of Object.entries(s.narration ?? {})) {
      if (typeof v === "string" && (dirOf(l) === "rtl" || hasArabic(v)) && v.includes("·")) err("middleDot", `${p}.narration.${l}`);
    }
    validateContent(s, p, langs, err, warn);

    // Free elements: canvas content, overlays and group children share one id space per scene.
    const elIds = new Set<string>();
    const n = (s.template === "canvas" ? validateElements(s.content.elements, `${p}.content.elements`, langs, elIds, err, warn) : 0) +
      validateElements(s.overlays, `${p}.overlays`, langs, elIds, err, warn);
    if (n > BUDGETS.maxElements) err("tooManyElements", p, String(n));
    else if (n > BUDGETS.sceneElements) warn("tooManyElements", p, String(n));
    if (s.transition !== undefined) {
      if (!isObj(s.transition) || !["cut", "fade", "slide", "wipe", "zoom"].includes(s.transition.type)) err("badTransition", `${p}.transition`);
      else if (s.transition.dur !== undefined && !inRange(s.transition.dur, 0, 3)) err("badTransition", `${p}.transition.dur`);
    }
    validateTracks(s.camera, `${p}.camera`, langs, err, warn);
    arr(s.camera).forEach((tr, i) => { if (!["x", "y", "scale"].includes(tr?.prop)) err("badProp", `${p}.camera[${i}].prop`); });
    if (s.background !== undefined && !(TONES as readonly string[]).includes(s.background)) err("badTone", `${p}.background`);
    if (s.mirror !== undefined && typeof s.mirror !== "boolean") err("badMirror", `${p}.mirror`);

    const targets = targetsOf(s);
    arr(s.cues).forEach((c, j) => {
      const q = `${p}.cues[${j}]`;
      if (!["highlight", "pulse", "reveal", "move"].includes(c.action)) err("badAction", `${q}.action`);
      if ((c.word === undefined) === (c.at === undefined)) err("cueWhen", q);
      if (c.at !== undefined && (!isNum(c.at) || c.at < 0)) err("badCueTime", `${q}.at`);
      if (c.word !== undefined) text(c.word, `${q}.word`, langs, err, warn);
      if (c.occurrence !== undefined && (!Number.isInteger(c.occurrence) || c.occurrence < 1)) err("badOccurrence", `${q}.occurrence`);
      if (!targets.has(c.target)) err("cueTarget", `${q}.target`, c.target);
      else if (c.action === "move" && !(s.template === "flow" && c.target.includes(">"))) err("cueMove", `${q}.target`, c.target);
    });

    if (s.check !== undefined) {
      const c = s.check;
      const q = `${p}.check`;
      if (c.type !== "single-choice") err("badCheck", `${q}.type`);
      if (typeof c.id !== "string" || !ITEM_ID.test(c.id)) err("badId", `${q}.id`);
      else if (checks.has(c.id)) err("dupId", `${q}.id`, c.id);
      checks.add(c.id);
      text(c.prompt, `${q}.prompt`, langs, err, warn);
      text(c.explain, `${q}.explain`, langs, err, warn, false);
      const opts = arr(c.options);
      count(`${q}.options`, opts, 2, 5, err);
      const oids = new Set<string>();
      opts.forEach((o, j) => {
        if (typeof o.id !== "string" || !ITEM_ID.test(o.id)) err("badId", `${q}.options[${j}].id`);
        else if (oids.has(o.id)) err("dupId", `${q}.options[${j}].id`, o.id);
        oids.add(o.id);
        text(o.text, `${q}.options[${j}].text`, langs, err, warn);
      });
      if (!oids.has(c.answer)) err("badAnswer", `${q}.answer`);
    }
  });
}

function validateTiming(t: TimingFile, scenes: Scene[], l: LanguageTrack, err: Add, warn: Add): void {
  const p = `timing.${l.code}`;
  if (!isObj(t) || t.version !== "0.1") return err("version", `${p}.version`);
  if (t.lang !== l.code) err("timingLang", `${p}.lang`);
  if (!["estimated", "tts", "aligned", "manual"].includes(t.source)) err("badSource", `${p}.source`);
  else if (t.source === "estimated" && (l.audio || l.audioFallback)) warn("estimatedWithAudio", `${p}.source`);
  if (!isNum(t.duration) || Math.abs(t.duration - l.duration) > 0.05) err("durationMismatch", `${p}.duration`, `${t.duration} vs ${l.duration}`);
  const ts = arr(t.scenes);
  if (ts.length !== scenes.length || ts.some((s, i) => s.id !== scenes[i]?.id)) return err("timingScenes", `${p}.scenes`);
  let prev = 0;
  ts.forEach((s, i) => {
    const q = `${p}.scenes[${i}]`;
    if (!isNum(s.start) || !isNum(s.end) || s.end <= s.start) return err("badTimes", q);
    if (s.start < prev - EPS) err("timingOrder", q);
    prev = s.end;
    let last = s.start;
    arr(s.words).forEach((w, j) => {
      if (!isStr(w.w) || !isNum(w.s) || !isNum(w.e) || w.e < w.s || w.s < last - EPS || w.s < s.start - EPS || w.e > s.end + EPS) {
        err("wordTimes", `${q}.words[${j}]`);
      }
      last = isNum(w.s) ? w.s : last;
    });
    arr(s.sentences).forEach((se, j) => {
      if (!isStr(se.text) || !isNum(se.start) || !isNum(se.end) || se.end < se.start || se.start < s.start - EPS || se.end > s.end + EPS) {
        err("sentenceTimes", `${q}.sentences[${j}]`);
      }
    });
    if (s.mouth !== undefined && !/^[0-2]*$/.test(s.mouth)) err("badMouth", `${q}.mouth`);
    const scene = scenes[i]!;
    // The words must be the narration's words: if the script changed after the timings (or audio) were made, cues and captions are wrong.
    const said = arr(s.words).map((w) => w.w).join(" ");
    if (isObj(scene.narration) && said !== splitWords(scene.narration[l.code] ?? "").join(" ")) {
      err("timingStale", `${q}.words`, l.code);
    }
    resolveCues(scene, s, l.code).forEach((c, j) => {
      if (!c.found) warn("cueWordMissing", `scenes[${i}].cues[${j}]`, l.code);
    });
    checkKeyframes(scene, s, l.code, `scenes[${i}]`, warn);
  });
  if (prev > t.duration + EPS) err("timingOrder", `${p}.duration`);
}

/** Keyframe words that aren't spoken, and scenes with too much moving at once, for one language. */
function checkKeyframes(scene: Scene, st: SceneTiming, lang: Lang, p: string, warn: Add): void {
  const spans: [number, number][] = [];
  const look = (tracks: Track[] | undefined, q: string): void => {
    arr(tracks).forEach((tr, i) => {
      const times = arr(tr?.keys).map((k, j) => {
        const r = resolveWhen(k.at, st, lang);
        if (!r.found) warn("keyWordMissing", `${q}[${i}].keys[${j}]`, lang);
        return r.at;
      });
      if (times.length > 1) spans.push([Math.min(...times), Math.max(...times)]);
    });
  };
  walkElements(scene, (el, path) => look(el.anim, `${p}.${path}.anim`));
  look(scene.camera, `${p}.camera`);
  // The most tracks animating at one moment: sweep the span edges in time order (ends before starts at a tie).
  const edges = spans.flatMap(([a, b]) => [[a, 1], [b, -1]] as [number, number][]).sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  let now = 0;
  let most = 0;
  for (const [, d] of edges) most = Math.max(most, (now += d));
  if (most > BUDGETS.tracks) warn("busyScene", p, `${lang}: ${most} tracks at once`);
}

/** Downloads per language against the budget, from the sizes the manifest lists. */
function checkBudgets(m: Manifest, warn: Add): void {
  const assets = arr(m.assets);
  assets.forEach((a, i) => {
    if (typeof a.type === "string" && a.type.startsWith("image/") && isNum(a.bytes) && a.bytes > BUDGETS.imageKB * 1024) {
      warn("bigImage", `manifest.assets[${i}]`, `${Math.round(a.bytes / 1024)} KB`);
    }
  });
  const audioOf = new Map<string, string>();
  for (const l of arr(m.languages)) for (const k of [l.audio, l.audioFallback]) if (k) audioOf.set(k, l.code);
  for (const l of arr(m.languages)) {
    // A language downloads its own Opus track (the fallback only on browsers without Opus) and every shared asset.
    const bytes = assets.filter((a) => (audioOf.has(a.path) ? a.path === l.audio : true)).reduce((x, a) => x + (isNum(a.bytes) ? a.bytes : 0), 0);
    if (bytes > BUDGETS.lessonKB * 1024) warn("heavyLesson", `manifest.languages.${l.code}`, `${Math.round(bytes / 1024)} KB`);
  }
}

/** Every rule for a whole package. Errors make it unplayable or wrong; warnings are worth a look. */
export function validatePackage(pkg: LessonPackage): Report {
  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  const err: Add = (code, path, detail) => { errors.push(detail === undefined ? { code, path } : { code, path, detail }); };
  const warn: Add = (code, path, detail) => { warnings.push(detail === undefined ? { code, path } : { code, path, detail }); };
  const langs = validateManifest(pkg.manifest, err, warn);
  if (isObj(pkg.manifest)) checkBudgets(pkg.manifest, warn);
  validateScenes(pkg.scenes, langs, err, warn);
  const scenes = arr(pkg.scenes?.scenes);
  // A speaker the cast doesn't voice is read by the narrator: say so where the language lists voices.
  for (const l of arr(pkg.manifest?.languages)) {
    if (!isObj(l.voices)) continue;
    scenes.forEach((s, i) => { if (typeof s.speaker === "string" && !(s.speaker in l.voices!)) warn("noVoice", `scenes[${i}].speaker`, `${s.speaker} (${l.code})`); });
  }
  if (!errors.some((e) => e.path.startsWith("scenes") && (e.code === "badId" || e.code === "dupId" || e.code === "badTemplate"))) {
    for (const l of arr(pkg.manifest?.languages)) {
      const t = pkg.timing?.[l.code];
      if (!t) err("timingMissing", `timing.${l.code}`);
      else validateTiming(t, scenes, l, err, warn);
    }
  }
  return { ok: errors.length === 0, errors, warnings };
}
