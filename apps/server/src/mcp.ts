import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import * as z from "zod/v4";
import { fromJsonSchema, McpServer, ResourceTemplate, type CallToolResult } from "@modelcontextprotocol/server";
import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import type { Lang, Orient, Scene, TemplateId, Text, TimingFile } from "@lessonstudio/spec";
import { estimateTiming, pick, TEMPLATES } from "@lessonstudio/spec";
import {
  check, newLesson, OpError, OPS_SCHEMA, PRESETS, StoreError, summarize, toPackage,
  type Actor, type Lesson, type LessonStore, type Op, type Preset,
} from "@lessonstudio/ops";
import { ttsCost, DEFAULT_MODEL } from "@lessonstudio/narrate";
import { ROOT, type Config } from "./config.ts";
import { previewHtml } from "./preview/html.ts";
import { renderFrame } from "./render.ts";

const GUIDE = readFileSync(fileURLToPath(new URL("./guide.md", import.meta.url)), "utf8");
const PREVIEW_URI = "ui://lessonstudio/preview.html";

const INSTRUCTIONS =
  "Lesson Studio builds short animated explainer lessons (tech, AI, cyber security) that play on old phones. " +
  "Read the resource lessonstudio://guide before building, and lessonstudio://examples/how-ai-learns for a complete example. " +
  "Every lesson needs narration and text in each of its languages; animations can be tied to spoken words.";

const ok = (data: unknown, extra: Partial<CallToolResult> = {}): CallToolResult => ({
  content: [{ type: "text", text: typeof data === "string" ? data : JSON.stringify(data) }],
  ...extra,
});
const fail = (message: string): CallToolResult => ({ content: [{ type: "text", text: message }], isError: true });

const textSchema = z.union([z.string(), z.record(z.string(), z.string())]).describe('One string for every language, or {"en": "...", "ar": "..."}');
const lessonId = z.string().describe("The lesson's id (from list_lessons or create_lesson)");

export interface Deps {
  store: LessonStore;
  config: Config;
}

/** One MCP server instance for one caller: every tool acts as `actor`, who must be a member of the lessons it touches. */
export function buildServer({ store, config }: Deps, actor: Actor): McpServer {
  const server = new McpServer({ name: "lessonstudio", title: "Lesson Studio", version: "0.1.0" }, { instructions: INSTRUCTIONS });
  const studioLink = (id: string): string | undefined => (config.studioUrl ? `${config.studioUrl}/lessons/${id}` : undefined);

  /** Loads a lesson and runs `fn`; store errors become readable tool errors. */
  async function run(fn: () => Promise<CallToolResult>): Promise<CallToolResult> {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof StoreError || e instanceof OpError) return fail(e.message);
      return fail(`Something went wrong: ${(e as Error).message}`);
    }
  }
  const checks = (lesson: Lesson, timings: Record<Lang, TimingFile | undefined>) => {
    const r = check(lesson, timings);
    const fmt = (i: { code: string; path: string; detail?: string }) => `${i.code} at ${i.path}${i.detail ? ` (${i.detail})` : ""}`;
    return { errors: r.errors.slice(0, 30).map(fmt), warnings: r.warnings.slice(0, 30).map(fmt), more: Math.max(0, r.errors.length - 30) + Math.max(0, r.warnings.length - 30) };
  };
  async function apply(id: string, ops: Op[], expectRev?: number) {
    const r = await store.apply(id, ops, actor, expectRev);
    const loaded = await store.get(id, actor.uid);
    return { rev: r.rev, ...checks(r.lesson, loaded.timings) };
  }

  /* ---------- lessons ---------- */

  server.registerTool("list_lessons", {
    title: "List lessons",
    description: "The lessons you can open, newest first.",
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, () => run(async () => ok(await store.list(actor.uid))));

  server.registerTool("create_lesson", {
    title: "Create a lesson",
    description: "Starts a lesson with a title scene. Give every language it will have (e.g. English and Arabic). Returns its id.",
    inputSchema: z.object({
      title: textSchema,
      languages: z.array(z.object({ code: z.string().describe("e.g. en, ar, fr"), name: z.string().describe("The language's own name, e.g. العربية") })).min(1),
      id: z.string().regex(/^[a-z0-9][a-z0-9-]{1,63}$/).optional().describe("Lower case, digits and hyphens; made from the title if absent"),
      defaultLang: z.string().optional(),
      summary: textSchema.optional(),
      topic: z.string().optional(),
      level: z.number().int().min(1).max(12).optional(),
      brand: z.enum(["studio-dark", "darsi-light"]).optional(),
      stage: z.enum(["landscape", "portrait", "square"]).optional().describe("The shape canvas scenes are designed for"),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  }, (a) => run(async () => {
    const def = a.defaultLang ?? a.languages[0]!.code;
    const base = (a.id ?? pick(a.title as Text, def).toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48)) || "lesson";
    const taken = new Set((await store.list(actor.uid)).map((l) => l.id));
    let id = base.length >= 2 ? base : `lesson-${base}`;
    for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
    const lesson = newLesson({
      id, title: a.title as Text, languages: a.languages, defaultLang: def, createdBy: actor.uid, tool: `Lesson Studio (${actor.via})`,
      ...(a.summary ? { summary: a.summary as Text } : {}), ...(a.topic ? { topic: a.topic } : {}), ...(a.level ? { level: a.level } : {}),
      ...(a.brand ? { brand: a.brand } : {}), ...(a.stage ? { stage: a.stage as Orient } : {}),
    });
    lesson.manifest.ai = { script: "ai", translation: a.languages.length > 1 ? "ai" : "none", narration: "none", visuals: "ai", avatar: "none" };
    const made = await store.create(id, lesson, actor);
    return ok({ id, rev: made.rev, studio: studioLink(id), next: "Add scenes with add_scene or edit_lesson, then validate_lesson." });
  }));

  server.registerTool("get_lesson", {
    title: "Get a lesson",
    description: "A lesson's summary (scenes, narration, elements), or with full: true its whole JSON {manifest, scenes}. Also its rev, for edit_lesson's expectRev.",
    inputSchema: z.object({ lesson: lessonId, full: z.boolean().optional() }),
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, (a) => run(async () => {
    const l = await store.get(a.lesson, actor.uid);
    return ok({ rev: l.rev, ...(a.full ? { lesson: l.lesson } : { summary: summarize(l.lesson, l.timings) }), studio: studioLink(a.lesson) });
  }));

  server.registerTool("edit_lesson", {
    title: "Edit a lesson",
    description:
      "Applies a batch of operations (all or nothing; undo with the undo tool). Operations: addScene, removeScene, moveScene, duplicateScene, " +
      "replaceScene, setNarration, set/insert/remove (JSON Pointer inside a scene), addCue, addElement, updateElement, removeElement, moveElement, " +
      "setKeyframe, removeKeyframe, setTrack, animate, setCamera, setMeta, addLanguage, removeLanguage. Returns the checks after the edit.",
    inputSchema: fromJsonSchema<{ lesson: string; ops: Op[]; expectRev?: number }>({
      type: "object",
      required: ["lesson", "ops"],
      additionalProperties: false,
      properties: {
        lesson: { type: "string", description: "The lesson's id" },
        ops: OPS_SCHEMA,
        expectRev: { type: "integer", description: "Refuse the edit if the lesson changed since this rev" },
      },
    } as never),
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  }, (a) => run(async () => ok(await apply(a.lesson, a.ops, a.expectRev))));

  server.registerTool("add_scene", {
    title: "Add a scene",
    description: `Adds a scene. Templates: ${TEMPLATES.join(", ")} (see lessonstudio://guide for each content shape). Narration is needed in every language of the lesson.`,
    inputSchema: z.object({
      lesson: lessonId,
      template: z.enum(TEMPLATES as unknown as [TemplateId, ...TemplateId[]]),
      id: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/).optional(),
      narration: z.record(z.string(), z.string()).describe('What is said, per language: {"en": "...", "ar": "..."}'),
      content: z.record(z.string(), z.unknown()).describe("The template's content"),
      cues: z.array(z.record(z.string(), z.unknown())).optional(),
      check: z.record(z.string(), z.unknown()).optional().describe("A quick quiz shown when the scene ends (needed by the quiz template)"),
      overlays: z.array(z.record(z.string(), z.unknown())).optional(),
      transition: z.object({ type: z.enum(["cut", "fade", "slide", "wipe", "zoom"]), dur: z.number().min(0).max(3).optional() }).optional(),
      at: z.number().int().min(0).optional().describe("Where to insert; default the end"),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  }, (a) => run(async () => {
    const l = await store.get(a.lesson, actor.uid);
    const ids = new Set(l.lesson.scenes.scenes.map((s) => s.id));
    let id = a.id ?? `s${l.lesson.scenes.scenes.length + 1}`;
    for (let n = 2; !a.id && ids.has(id); n++) id = `s${l.lesson.scenes.scenes.length + n}`;
    const scene = { id, template: a.template, narration: a.narration, content: a.content } as unknown as Scene;
    for (const k of ["cues", "check", "overlays", "transition"] as const) if (a[k] !== undefined) (scene as unknown as Record<string, unknown>)[k] = a[k];
    const op: Op = a.at === undefined ? { op: "addScene", scene } : { op: "addScene", scene, at: a.at };
    return ok({ scene: id, ...(await apply(a.lesson, [op])) });
  }));

  server.registerTool("animate_element", {
    title: "Animate an element",
    description: `Adds a ready-made animation to a free element, starting at a time or when a word is spoken (in every language). Presets: ${Object.entries(PRESETS).map(([k, v]) => `${k} (${v.about})`).join("; ")}.`,
    inputSchema: z.object({
      lesson: lessonId,
      scene: z.string(),
      element: z.string(),
      preset: z.enum(Object.keys(PRESETS) as [Preset, ...Preset[]]),
      at: z.union([z.number().min(0), z.record(z.string(), z.string())]).describe('Seconds into the scene, or the word per language: {"en": "passes", "ar": "تمر"}'),
      offset: z.number().min(-10).max(10).optional().describe("Seconds after the word"),
      dur: z.number().min(0).max(10).optional(),
      to: z.object({ x: z.number().optional(), y: z.number().optional() }).optional().describe("For move-to"),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  }, (a) => run(async () => {
    const at = typeof a.at === "number" ? a.at : { word: a.at, ...(a.offset !== undefined ? { offset: a.offset } : {}) };
    const op = { op: "animate", scene: a.scene, element: a.element, preset: a.preset, at, ...(a.dur !== undefined ? { dur: a.dur } : {}), ...(a.to ? { to: a.to } : {}) } as Op;
    return ok(await apply(a.lesson, [op]));
  }));

  server.registerTool("undo", {
    title: "Undo",
    description: "Undoes your last edits to a lesson (only while nobody else has edited it since).",
    inputSchema: z.object({ lesson: lessonId, steps: z.number().int().min(1).max(20).optional() }),
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  }, (a) => run(async () => {
    const steps = a.steps ?? 1;
    const hist = await store.history(a.lesson, actor.uid, steps);
    if (hist.length < steps) return fail(`There are only ${hist.length} edits to undo.`);
    const others = hist.find((h) => h.via !== actor.via || h.uid !== actor.uid);
    if (others) return fail(`The lesson was edited since by ${others.via}; open it in the studio to undo that change.`);
    let rev = hist[0]!.rev;
    for (const h of hist) rev = (await store.apply(a.lesson, JSON.parse(h.inverse) as Op[], actor, rev)).rev;
    const l = await store.get(a.lesson, actor.uid);
    return ok({ undone: steps, rev, ...checks(l.lesson, l.timings) });
  }));

  server.registerTool("validate_lesson", {
    title: "Check a lesson",
    description: "Every check: errors make a lesson unplayable or wrong; warnings point at missing words for animations, budgets for old phones, and more.",
    inputSchema: z.object({ lesson: lessonId }),
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, (a) => run(async () => {
    const l = await store.get(a.lesson, actor.uid);
    return ok({ rev: l.rev, ...checks(l.lesson, l.timings) });
  }));

  server.registerTool("estimate_cost", {
    title: "Estimate narration cost and size",
    description: "Seconds of speech, the Gemini TTS cost (batch and instant) and the download size per language.",
    inputSchema: z.object({ lesson: lessonId }),
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, (a) => run(async () => {
    const { lesson } = await store.get(a.lesson, actor.uid);
    const json = gzipSync(JSON.stringify(lesson.scenes)).length;
    return ok(lesson.manifest.languages.map((l) => {
      const t = estimateTiming(lesson.scenes.scenes, l.code);
      const speech = t.scenes.reduce((x, s) => x + s.sentences.reduce((y, se) => y + se.end - se.start, 0), 0);
      const chars = lesson.scenes.scenes.reduce((x, s) => x + (s.narration[l.code]?.length ?? 0), 0);
      const model = l.voice?.model ?? DEFAULT_MODEL;
      return {
        lang: l.code, seconds: Math.round(t.duration), speechSeconds: Math.round(speech), model,
        costBatchUSD: ttsCost(model, speech, chars, true), costNowUSD: ttsCost(model, speech, chars, false),
        downloadKB: Math.round((json + t.duration * 2000 + 2048) / 1024), note: "download: lesson files plus Opus narration at 16 kbit/s",
      };
    }));
  }));

  server.registerTool("render_frame", {
    title: "Render a frame",
    description: "A picture of the lesson at one moment, drawn by the real player, to check layout and animation. Default: near the end of the scene, when everything is in.",
    inputSchema: z.object({
      lesson: lessonId,
      scene: z.string().optional().describe("A scene id; default the first"),
      at: z.number().min(0).optional().describe("Seconds into the scene"),
      lang: z.string().optional(),
      orient: z.enum(["landscape", "portrait", "square"]).optional(),
    }),
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, (a) => run(async () => {
    const l = await store.get(a.lesson, actor.uid);
    const lang = a.lang ?? l.lesson.manifest.defaultLang;
    if (!l.lesson.manifest.languages.some((x) => x.code === lang)) return fail(`The lesson has no language "${lang}".`);
    const pkg = toPackage(l.lesson, l.timings);
    const i = a.scene ? l.lesson.scenes.scenes.findIndex((s) => s.id === a.scene) : 0;
    if (i < 0) return fail(`No scene "${a.scene}".`);
    const st = pkg.timing[lang]!.scenes[i]!;
    const t = Math.min(st.end - 0.02, st.start + (a.at ?? Math.max(0, st.end - st.start - 0.3)));
    const png = await renderFrame(pkg, { lang, t, orient: (a.orient ?? l.lesson.manifest.stage ?? "landscape") as Orient }, config.chromiumPath);
    return {
      content: [
        { type: "image", data: png.toString("base64"), mimeType: "image/png" },
        { type: "text", text: `Scene "${st.id}" at ${(t - st.start).toFixed(2)} s of ${(st.end - st.start).toFixed(2)} s, ${lang}.` },
      ],
    };
  }));

  registerAppTool(server, "preview_lesson", {
    title: "Preview a lesson",
    description: "Plays the lesson in the chat with the real player (where the client supports MCP Apps), in one of its languages.",
    inputSchema: z.object({ lesson: lessonId, lang: z.string().optional() }),
    annotations: { readOnlyHint: true, openWorldHint: false },
    _meta: { ui: { resourceUri: PREVIEW_URI } },
  }, (a) => run(async () => {
    const l = await store.get(a.lesson, actor.uid);
    const lang = a.lang ?? l.lesson.manifest.defaultLang;
    const pkg = toPackage(l.lesson, l.timings);
    const studio = studioLink(a.lesson);
    return ok(`Playing "${pick(l.lesson.manifest.title, lang)}" (${lang}, ${Math.round(pkg.timing[lang]?.duration ?? 0)} s).${studio ? ` Studio: ${studio}` : ""}`, {
      structuredContent: { package: pkg, lang, ...(studio ? { studio } : {}) },
    });
  }));

  registerAppResource(server, "Lesson preview", PREVIEW_URI, { description: "Plays a lesson with the Lesson Studio player" }, async () => ({
    contents: [{ uri: PREVIEW_URI, mimeType: RESOURCE_MIME_TYPE, text: await previewHtml() }],
  }));

  /* ---------- resources ---------- */

  server.registerResource("guide", "lessonstudio://guide", { title: "How to build a lesson", mimeType: "text/markdown" }, async (uri) => ({
    contents: [{ uri: uri.href, mimeType: "text/markdown", text: GUIDE }],
  }));
  server.registerResource("ops-schema", "lessonstudio://ops-schema", { title: "Operation schema (JSON Schema)", mimeType: "application/json" }, async (uri) => ({
    contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(OPS_SCHEMA) }],
  }));
  server.registerResource("example", "lessonstudio://examples/how-ai-learns", { title: "Example: a canvas lesson in English and Arabic", mimeType: "application/json" }, async (uri) => {
    const dir = join(ROOT, "examples", "how-ai-learns");
    const read = (f: string) => JSON.parse(readFileSync(join(dir, f), "utf8"));
    return { contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify({ manifest: read("manifest.json"), scenes: read("scenes.json") }) }] };
  });
  server.registerResource("lesson", new ResourceTemplate("lessonstudio://lessons/{id}", {
    list: async () => ({ resources: (await store.list(actor.uid)).map((l) => ({ uri: `lessonstudio://lessons/${l.id}`, name: l.title, mimeType: "application/json" })) }),
  }), { title: "A lesson's JSON", mimeType: "application/json" }, async (uri, vars) => {
    const l = await store.get(String(vars.id), actor.uid);
    return { contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(l.lesson) }] };
  });

  /* ---------- prompts ---------- */

  server.registerPrompt("storyboard_lesson", {
    title: "Build a lesson",
    description: "Plans and builds a short animated lesson on a topic.",
    argsSchema: z.object({
      topic: z.string(),
      audience: z.string().optional(),
      languages: z.string().optional().describe('e.g. "en,ar"'),
      seconds: z.string().optional(),
    }),
  }, (a) => ({
    messages: [{
      role: "user",
      content: {
        type: "text",
        text:
          `Build a Lesson Studio lesson about: ${a.topic}.\n` +
          `Audience: ${a.audience ?? "teachers and adult learners, no prior knowledge"}. Languages: ${a.languages ?? "en,ar"}. Length: about ${a.seconds ?? "60"} seconds.\n` +
          "First read lessonstudio://guide. Plan 4 to 7 scenes (a hook, the idea, how it works, an example, a quick check, a summary), " +
          "then create_lesson and add the scenes. Animate with word anchors so motion follows the narration in every language. " +
          "Run validate_lesson until there are no errors, look at a few scenes with render_frame, then preview_lesson.",
      },
    }],
  }));

  server.registerPrompt("translate_lesson", {
    title: "Translate a lesson",
    description: "Adds a language to a lesson: narration, every text, and the words animations are tied to.",
    argsSchema: z.object({ lesson: z.string(), lang: z.string(), name: z.string().describe("The language's own name") }),
  }, (a) => ({
    messages: [{
      role: "user",
      content: {
        type: "text",
        text:
          `Translate the Lesson Studio lesson "${a.lesson}" into ${a.name} (${a.lang}). Read lessonstudio://guide first. ` +
          `Use edit_lesson: addLanguage, then setNarration for every scene and a "${a.lang}" version of every text, and add the ${a.lang} word ` +
          "to every cue and keyframe word anchor, choosing the word the translation actually says at that moment. Validate until clean.",
      },
    }],
  }));

  return server;
}
