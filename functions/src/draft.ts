// "Draft with AI": a brief becomes a storyboard of animated scenes in every language, checked by the same
// validator as everything else. Problems go back to the model to fix (twice at most); a draft that still has
// errors is refused. Pure: the model call is passed in, so tests run it with a stand-in.
import type { Issue, Orient, Scene } from "@lessonstudio/spec";
import { check, newLesson, type Lesson } from "@lessonstudio/ops";
import { GALLERY } from "../../apps/studio/src/presets.ts";
import type { Generate, Turn, Usage } from "./gemini.ts";

export interface DraftRequest {
  topic: string;
  audience?: string;
  languages: { code: string; name: string }[];
  /** Target length of the whole lesson. */
  seconds: number;
  brand?: string;
  stage?: Orient;
  /** Anything else the author wants: points to cover, examples to use. */
  notes?: string;
}

const SIZES: Record<Orient, [number, number]> = { landscape: [1280, 720], portrait: [720, 1280], square: [1080, 1080] };
const LANG = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/;

/** The request as sent by a client: a clean request, or what is wrong with it. */
export function readRequest(raw: unknown): DraftRequest | string {
  const o = (raw ?? {}) as Record<string, unknown>;
  const topic = typeof o.topic === "string" ? o.topic.trim() : "";
  if (topic.length < 3 || topic.length > 600) return "Describe the topic in 3 to 600 characters.";
  const langs = Array.isArray(o.languages) ? o.languages : [];
  if (!langs.length || langs.length > 4) return "Pick between one and four languages.";
  const languages = langs.map((l) => ({ code: String((l as { code?: unknown }).code ?? ""), name: String((l as { name?: unknown }).name ?? "").slice(0, 40) }));
  if (languages.some((l) => !LANG.test(l.code)) || new Set(languages.map((l) => l.code)).size !== languages.length) return "Each language needs a different code such as en or ar.";
  const seconds = Number(o.seconds);
  if (!Number.isFinite(seconds) || seconds < 30 || seconds > 180) return "The length must be between 30 and 180 seconds.";
  const stage = o.stage === "portrait" || o.stage === "square" ? o.stage : "landscape";
  const r: DraftRequest = { topic, languages, seconds: Math.round(seconds), stage };
  if (typeof o.audience === "string" && o.audience.trim()) r.audience = o.audience.trim().slice(0, 300);
  if (typeof o.notes === "string" && o.notes.trim()) r.notes = o.notes.trim().slice(0, 2000);
  if (o.brand === "studio-dark" || o.brand === "darsi-light") r.brand = o.brand;
  return r;
}

/** Five gallery scenes in English and Arabic, as worked examples of the format. */
function examples(stage: Orient): string {
  const pick = ["title", "steps", "process", "quiz", "summary"];
  const scenes = pick.map((id, i) => GALLERY.find((g) => g.id === id)!.make({ id: `example-${i + 1}`, langs: ["en", "ar"], stage }));
  return JSON.stringify(scenes);
}

export function systemPrompt(guide: string, stage: Orient): string {
  const [w, h] = SIZES[stage];
  return `You write short animated lessons for Lesson Studio: teacher upskilling in AI, IoT and cyber security, for schools in developing countries. A lesson is a storyboard of scenes; the phone animates each scene while its narration is read.

${guide}

Answer with one JSON object and nothing else:
{"title": {<lang>: string}, "summary": {<lang>: string}, "scenes": [Scene, ...]}
Each Scene is {"id", "template", "narration": {<lang>: string}, "content", and optionally "cues", "check", "transition", "camera", "overlays"}, exactly as in the guide.

Rules:
- 4 to 7 scenes. Start with a "title-hook" scene and end with a "summary" scene. Include one quick check (a "quiz" scene, or a "check" on another scene).
- Mix templates; use one or two "canvas" scenes where a picture explains better than text. Canvas positions are pixels on a ${w}×${h} stage; keep every element inside it, and use at most 20 elements per scene.
- Every text and every narration has every requested language. Write each language naturally for a teacher, not word for word. Arabic is Modern Standard Arabic and never uses "·" (use "،").
- Narration: short spoken sentences, at most 60 words per scene per language.
- Cues and keyframe word anchors ({"word": {<lang>: ...}}) must name one word that is actually spoken in that scene's narration in that language, written as in the narration. Animate what the narration is talking about, when it says it.
- Security topics teach defence and awareness only, never how to attack. Example links use ".example" domains.
- Ids: lower case letters, digits and hyphens, unique in the lesson (scenes) or the scene (elements).

Worked examples of scenes, in English and Arabic:
${examples(stage)}`;
}

export function userPrompt(r: DraftRequest): string {
  const words = Math.round(r.seconds * 2.4);
  return [
    `Topic: ${r.topic}`,
    r.audience ? `Audience: ${r.audience}` : "Audience: school teachers who are new to the topic",
    `Languages: ${r.languages.map((l) => `${l.code} (${l.name})`).join(", ")}`,
    `Length: about ${r.seconds} seconds, so about ${words} narrated words in English in total`,
    `Stage: ${r.stage ?? "landscape"}`,
    r.notes ? `Notes from the author: ${r.notes}` : "",
  ].filter(Boolean).join("\n");
}

interface DraftJson { title: Record<string, string>; summary?: Record<string, string>; scenes: Scene[] }

export function parseDraft(text: string): DraftJson {
  const body = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  let j: unknown;
  try {
    j = JSON.parse(body);
  } catch (e) {
    throw new Error(`The answer is not valid JSON (${(e as Error).message}).`);
  }
  const d = j as Partial<DraftJson>;
  if (!d || typeof d !== "object" || !Array.isArray(d.scenes) || !d.scenes.length) throw new Error('The answer has no "scenes" list.');
  if (!d.title || typeof d.title !== "object") throw new Error('The answer has no "title" object.');
  return d as DraftJson;
}

export function slug(s: string): string {
  return s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "lesson";
}

/** The draft as a lesson owned by `uid`, with honest AI disclosure. */
export function toLesson(d: DraftJson, r: DraftRequest, id: string, uid: string, model: string): Lesson {
  const codes = r.languages.map((l) => l.code);
  const text = (o: Record<string, string> | undefined, fallback: string) =>
    Object.fromEntries(codes.map((c) => [c, typeof o?.[c] === "string" && o[c]!.trim() ? o[c]!.trim() : fallback]));
  const lesson = newLesson({
    id, title: text(d.title, r.topic.slice(0, 80)), summary: text(d.summary, r.topic.slice(0, 200)),
    languages: r.languages, brand: r.brand ?? "studio-dark", stage: r.stage ?? "landscape",
    createdBy: uid, tool: `Lesson Studio (drafted by ${model})`,
  });
  const seen = new Set<string>();
  lesson.scenes.scenes = d.scenes.map((s, i) => {
    let sid = typeof s.id === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(s.id) ? s.id : `scene-${i + 1}`;
    if (seen.has(sid)) sid = `scene-${i + 1}`;
    seen.add(sid);
    return { ...s, id: sid };
  });
  lesson.manifest.ai = { script: "ai", translation: codes.length > 1 ? "ai" : "none", narration: "none", visuals: "ai-assisted", avatar: "none" };
  return lesson;
}

// Warnings a draft must not keep: animations on words nobody says, scenes too long or too busy.
const MUST_FIX = new Set(["keyWordMissing", "cueWordMissing", "longScene", "tooManyElements", "busyScene", "longLesson"]);
const HINTS: Record<string, string> = {
  keyWordMissing: "a keyframe's word is not spoken in that scene's narration in that language; use a word that is",
  cueWordMissing: "a cue's word is not spoken in that scene's narration in that language; use a word that is",
  longScene: "the narration is longer than 70 words; shorten it",
  missingText: "a text is missing a language",
  missingNarration: "a scene has no narration in that language",
  badTarget: "the cue's target is not a part of that template or an element id",
};

/** The validator's errors, plus the warnings a draft must not keep. */
export function problems(l: Lesson): { errors: Issue[]; fix: Issue[]; warnings: Issue[] } {
  const r = check(l);
  return { errors: r.errors, fix: [...r.errors, ...r.warnings.filter((w) => MUST_FIX.has(w.code))], warnings: r.warnings };
}
const describe = (i: Issue): string => `- ${i.code} at ${i.path}${i.detail ? ` (${i.detail})` : ""}${HINTS[i.code] ? `: ${HINTS[i.code]}` : ""}`;

export class DraftFailed extends Error {}

export interface Drafted { lesson: Lesson; usage: Usage; attempts: number; warnings: Issue[] }

export async function draft(r: DraftRequest, o: { generate: Generate; guide: string; uid: string; id: string; model: string; maxRepairs?: number }): Promise<Drafted> {
  const system = systemPrompt(o.guide, r.stage ?? "landscape");
  const turns: Turn[] = [{ role: "user", text: userPrompt(r) }];
  const usage: Usage = { input: 0, output: 0 };
  const max = o.maxRepairs ?? 2;
  for (let attempt = 0; ; attempt++) {
    const out = await o.generate(system, turns);
    usage.input += out.usage.input;
    usage.output += out.usage.output;
    let issues: string;
    try {
      const lesson = toLesson(parseDraft(out.text), r, o.id, o.uid, o.model);
      const p = problems(lesson);
      if (!p.fix.length || (attempt >= max && !p.errors.length)) return { lesson, usage, attempts: attempt + 1, warnings: p.warnings };
      if (attempt >= max) throw new DraftFailed(`The draft still had ${p.errors.length} problems after ${attempt + 1} tries.`);
      issues = p.fix.slice(0, 40).map(describe).join("\n");
    } catch (e) {
      if (e instanceof DraftFailed) throw e;
      if (attempt >= max) throw new DraftFailed(`The model didn't return a usable lesson: ${(e as Error).message}`);
      issues = `- ${(e as Error).message}`;
    }
    turns.push({ role: "model", text: out.text }, { role: "user", text: `The lesson checker found these problems:\n${issues}\nFix them and answer with the whole corrected JSON object.` });
  }
}
