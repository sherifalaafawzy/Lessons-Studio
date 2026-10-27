import { PRESETS } from "./presets.ts";

/**
 * JSON Schema of an operation, for tools that take operations (the MCP server's edit_lesson).
 * Scenes and elements are described loosely here; the format guide has them in full, and every
 * edit is checked against the full rules when it's applied.
 */
const text = {
  description: 'Text per language, e.g. {"en": "Web page", "ar": "صفحة ويب"}, or one string for every language (names, code).',
  anyOf: [{ type: "string" }, { type: "object", additionalProperties: { type: "string" } }],
};
const when = {
  description: 'Seconds from the scene start, or the moment a word is spoken in each language: {"word": {"en": "trusts", "ar": "تثق"}, "offset": 0.2}.',
  anyOf: [
    { type: "number", minimum: 0 },
    {
      type: "object", required: ["word"], additionalProperties: false,
      properties: { word: text, occurrence: { type: "integer", minimum: 1 }, offset: { type: "number" } },
    },
  ],
};
const prop = { enum: ["x", "y", "scale", "rotate", "opacity", "draw", "reveal"] };
const key = {
  type: "object", required: ["at", "value"], additionalProperties: false,
  properties: { at: when, value: { type: "number" }, ease: { enum: ["linear", "in", "out", "in-out", "back", "step"] } },
};
const scene = { type: "object", description: "A whole scene: {id, template, narration, content, cues?, check?, overlays?, transition?, camera?}. See the format guide." };
const element = { type: "object", description: "A free element: {id, type, x, y, w?, h?, ...}. Types: text, shape, line, path, icon, image, code, chart, group. See the format guide." };
const sceneId = { type: "string", description: "The scene's id" };

const op = (name: string, description: string, props: Record<string, unknown>, required: string[]) => ({
  type: "object",
  description,
  required: ["op", ...required],
  additionalProperties: false,
  properties: { op: { const: name }, ...props },
});

export const OP_SCHEMA = {
  oneOf: [
    op("setMeta", "Change the lesson's title, summary, brand, stage shape, level, topic or default language.", {
      title: text, summary: text, brand: { type: "string" }, stage: { enum: ["landscape", "portrait", "square"] },
      level: { type: "integer", minimum: 1, maximum: 12 }, topic: { type: "string" }, defaultLang: { type: "string" },
    }, []),
    op("addLanguage", "Add a language. Then give every scene narration in it, and every text a version in it.", {
      code: { type: "string" }, name: { type: "string", description: "The language's own name, e.g. العربية" }, dir: { enum: ["ltr", "rtl"] },
    }, ["code", "name"]),
    op("removeLanguage", "Remove a language and its narration.", { code: { type: "string" } }, ["code"]),
    op("addScene", "Add a scene (at an index, default the end).", { scene, at: { type: "integer", minimum: 0 } }, ["scene"]),
    op("removeScene", "Remove a scene.", { scene: sceneId }, ["scene"]),
    op("moveScene", "Move a scene to an index.", { scene: sceneId, to: { type: "integer", minimum: 0 } }, ["scene", "to"]),
    op("duplicateScene", "Copy a scene under a new id.", { scene: sceneId, id: { type: "string" }, at: { type: "integer", minimum: 0 } }, ["scene", "id"]),
    op("replaceScene", "Replace a whole scene (same id).", { scene: sceneId, value: scene }, ["scene", "value"]),
    op("setNarration", "Set what is spoken in a scene, in one language.", { scene: sceneId, lang: { type: "string" }, text: { type: "string" } }, ["scene", "lang", "text"]),
    op("set", 'Set any value inside a scene by JSON Pointer, e.g. "/content/title/ar" or "/transition".', { scene: sceneId, path: { type: "string" }, value: {} }, ["scene", "path", "value"]),
    op("insert", 'Insert into an array inside a scene ("/content/steps/1", or "/cues/-" to append).', { scene: sceneId, path: { type: "string" }, value: {} }, ["scene", "path", "value"]),
    op("remove", "Remove a value inside a scene by JSON Pointer.", { scene: sceneId, path: { type: "string" } }, ["scene", "path"]),
    op("addCue", 'Make something happen when a word is spoken: {"word": {...}, "action": "highlight"|"pulse"|"reveal"|"move", "target": "<id>"}.', { scene: sceneId, cue: { type: "object" } }, ["scene", "cue"]),
    op("addElement", "Add a free element. In a canvas scene it joins the scene's elements; in any other template it's an overlay.", {
      scene: sceneId, element, at: { type: "integer", minimum: 0 }, parent: { type: "string", description: "A group's id" }, overlay: { type: "boolean" },
    }, ["scene", "element"]),
    op("updateElement", "Change an element's properties (null removes one).", { scene: sceneId, element: { type: "string" }, props: { type: "object" } }, ["scene", "element", "props"]),
    op("removeElement", "Remove an element.", { scene: sceneId, element: { type: "string" } }, ["scene", "element"]),
    op("moveElement", "Change an element's place in its list (drawing order).", { scene: sceneId, element: { type: "string" }, to: { type: "integer", minimum: 0 } }, ["scene", "element", "to"]),
    op("setKeyframe", "Add or replace one keyframe.", { scene: sceneId, element: { type: "string" }, prop, key }, ["scene", "element", "prop", "key"]),
    op("removeKeyframe", "Remove the keyframe at a time.", { scene: sceneId, element: { type: "string" }, prop, at: when }, ["scene", "element", "prop", "at"]),
    op("setTrack", "Replace all keyframes of one property (null removes the track).", {
      scene: sceneId, element: { type: "string" }, prop, keys: { anyOf: [{ type: "array", items: key }, { type: "null" }] },
    }, ["scene", "element", "prop", "keys"]),
    op("animate", `Add a ready-made animation: ${Object.entries(PRESETS).map(([k, v]) => `"${k}" (${v.about})`).join(", ")}.`, {
      scene: sceneId, element: { type: "string" }, preset: { enum: Object.keys(PRESETS) }, at: when,
      dur: { type: "number", minimum: 0, maximum: 10 },
      to: { type: "object", properties: { x: { type: "number" }, y: { type: "number" } }, additionalProperties: false },
    }, ["scene", "element", "preset", "at"]),
    op("setCamera", 'Pan and zoom a scene: tracks for "x", "y" (the stage point at the centre) and "scale".', {
      scene: sceneId, tracks: { anyOf: [{ type: "array", items: { type: "object", required: ["prop", "keys"], properties: { prop: { enum: ["x", "y", "scale"] }, keys: { type: "array", items: key } } } }, { type: "null" }] },
    }, ["scene", "tracks"]),
  ],
};

export const OPS_SCHEMA = { type: "array", minItems: 1, maxItems: 200, items: OP_SCHEMA };
