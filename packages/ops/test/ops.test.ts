import { describe, expect, it } from "vitest";
import Ajv from "ajv";
import type { LessonPackage, Scene } from "@lessonstudio/spec";
import {
  applyOps, check, clone, lessonDoc, lessonFromDocs, MemoryStore, newLesson, OP_SCHEMA, OpError, rebase, sceneDoc,
  StoreError, summarize, type Lesson, type Op,
} from "../src/index.ts";
import { loadExample } from "../../../scripts/lib/examples.mjs";

const brief = {
  id: "phishing-signs",
  title: { en: "Three signs of phishing", ar: "ثلاث علامات للتصيّد" },
  languages: [{ code: "en", name: "English" }, { code: "ar", name: "العربية" }],
  createdBy: "test",
};
const fromExample = (id: string): Lesson => {
  const { pkg } = loadExample(id) as { pkg: LessonPackage };
  return { manifest: pkg.manifest, scenes: pkg.scenes };
};

const canvasScene: Scene = {
  id: "signs",
  template: "canvas",
  narration: { en: "Look at the sender first.", ar: "انظر إلى المرسل أولًا." },
  content: { elements: [{ id: "box", type: "shape", shape: "rect", x: 100, y: 100, w: 300, h: 200, stroke: "accent" }] },
};

/** A long, mixed batch: every kind of operation. */
const MANY: Op[] = [
  { op: "setMeta", title: { en: "Phishing: three signs", ar: "التصيّد: ثلاث علامات" }, stage: "portrait" },
  { op: "addScene", scene: canvasScene },
  { op: "addElement", scene: "signs", element: { id: "t", type: "text", x: 120, y: 330, text: { en: "Sender", ar: "المرسل" } } },
  { op: "animate", scene: "signs", element: "t", preset: "rise", at: { word: { en: "sender", ar: "المرسل" } } },
  { op: "animate", scene: "signs", element: "box", preset: "draw", at: 0.2 },
  { op: "setKeyframe", scene: "signs", element: "box", prop: "scale", key: { at: 2, value: 1.1 } },
  { op: "updateElement", scene: "signs", element: "box", props: { stroke: "danger", radius: 18 } },
  { op: "addCue", scene: "signs", cue: { word: { en: "sender", ar: "المرسل" }, action: "pulse", target: "box" } },
  { op: "set", scene: "intro", path: "/content/hook", value: { en: "Stop before you tap.", ar: "توقف قبل أن تضغط." } },
  { op: "setNarration", scene: "intro", lang: "en", text: "Three signs of phishing. Stop before you tap." },
  { op: "setNarration", scene: "intro", lang: "ar", text: "ثلاث علامات للتصيّد. توقف قبل أن تضغط." },
  { op: "addElement", scene: "intro", element: { id: "warn", type: "icon", icon: "warning", x: 1100, y: 60, w: 100, h: 100 } },
  { op: "animate", scene: "intro", element: "warn", preset: "pop", at: { word: { en: "stop", ar: "توقف" } } },
  { op: "setCamera", scene: "signs", tracks: [{ prop: "scale", keys: [{ at: 0, value: 1 }, { at: 1.5, value: 1.15 }] }] },
  { op: "duplicateScene", scene: "signs", id: "signs-2" },
  { op: "moveScene", scene: "signs-2", to: 0 },
  { op: "removeScene", scene: "signs-2" },
  { op: "addLanguage", code: "fr", name: "Français" },
  { op: "removeLanguage", code: "fr" },
];

describe("operations", () => {
  it("a new lesson is valid from the start", () => {
    const r = check(newLesson(brief, "2026-10-27"));
    expect(r.errors).toEqual([]);
  });

  it("every batch can be undone exactly", () => {
    const start = newLesson(brief, "2026-10-27");
    const done = applyOps(start, MANY);
    expect(done.lesson.scenes.scenes.map((s) => s.id)).toEqual(["intro", "signs"]);
    expect(applyOps(done.lesson, done.inverse).lesson).toEqual(start);
    // One at a time, undone in reverse, also comes back.
    let l = start;
    const undo: Op[][] = [];
    for (const op of MANY) {
      const r = applyOps(l, [op]);
      undo.push(r.inverse);
      l = r.lesson;
    }
    for (const inv of undo.reverse()) l = applyOps(l, inv).lesson;
    expect(l).toEqual(start);
  });

  it("the edited lesson passes every check in both languages, word anchors included", () => {
    const l = applyOps(newLesson(brief, "2026-10-27"), MANY.slice(0, MANY.findIndex((o) => o.op === "duplicateScene"))).lesson;
    const r = check(l);
    expect(r.errors).toEqual([]);
    expect(r.warnings.filter((w) => w.code === "keyWordMissing" || w.code === "cueWordMissing")).toEqual([]);
  });

  it("applies a batch whole or not at all", () => {
    const start = newLesson(brief, "2026-10-27");
    const before = clone(start);
    let err: unknown;
    try {
      applyOps(start, [MANY[1]!, { op: "addElement", scene: "nope", element: { id: "x", type: "icon", icon: "key", x: 0, y: 0 } }]);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(OpError);
    expect((err as OpError).index).toBe(1);
    expect((err as Error).message).toMatch(/No scene "nope"/);
    expect(start).toEqual(before);
  });

  it("refuses edits that would break a lesson's structure", () => {
    const l = applyOps(newLesson(brief, "2026-10-27"), [MANY[1]!]).lesson;
    const bad: [Op, RegExp][] = [
      [{ op: "set", scene: "intro", path: "/id", value: "x" }, /can't be edited/],
      [{ op: "set", scene: "intro", path: "/content/__proto__/x", value: 1 }, /not allowed/],
      [{ op: "addElement", scene: "signs", element: { id: "box", type: "icon", icon: "key", x: 0, y: 0 } }, /already has an element "box"/],
      [{ op: "updateElement", scene: "signs", element: "box", props: { type: "text" } }, /can't change/],
      [{ op: "animate", scene: "signs", element: "box", preset: "type", at: 0 }, /works on text, code and charts/],
      [{ op: "removeLanguage", code: "en" }, /default language/],
      [{ op: "addScene", scene: { ...canvasScene } }, /already a scene "signs"/],
    ];
    for (const [op, msg] of bad) expect(() => applyOps(l, [op])).toThrow(msg);
  });

  it("adds elements to a template scene as overlays, and into groups", () => {
    const l = applyOps(newLesson(brief, "2026-10-27"), [
      { op: "addElement", scene: "intro", element: { id: "g", type: "group", x: 0, y: 0, children: [] } },
      { op: "addElement", scene: "intro", parent: "g", element: { id: "k", type: "icon", icon: "key", x: 10, y: 10 } },
    ]).lesson;
    const intro = l.scenes.scenes[0]!;
    expect(intro.overlays?.[0]?.type).toBe("group");
    expect(intro.overlays?.[0]?.type === "group" && intro.overlays[0].children[0]?.id).toBe("k");
  });

  it("rebases local edits onto a newer lesson, dropping those that no longer fit", () => {
    const base = applyOps(newLesson(brief, "2026-10-27"), [MANY[1]!]).lesson;
    const remote = applyOps(base, [{ op: "removeScene", scene: "signs" }]).lesson;
    const r = rebase(remote, [
      [{ op: "setNarration", scene: "intro", lang: "en", text: "New intro." }],
      [{ op: "updateElement", scene: "signs", element: "box", props: { fill: "accent" } }],
    ]);
    expect(r.kept.length).toBe(1);
    expect(r.dropped[0]!.error).toMatch(/No scene "signs"/);
    expect(r.lesson.scenes.scenes[0]!.narration.en).toBe("New intro.");
  });

  it("summarises a lesson for an AI", () => {
    const s = summarize(fromExample("how-ai-learns"));
    expect(s.scenes.map((x) => x.template)).toEqual(["title-hook", "canvas", "canvas", "summary"]);
    expect(s.scenes[1]!.elements!.find((e) => e.id === "signal")!.animated).toEqual(["opacity", "x", "y"]);
    expect(s.languages.map((l) => l.code)).toEqual(["en", "ar"]);
  });
});

describe("stored form", () => {
  it("round-trips through Firestore documents", () => {
    const l = fromExample("how-ai-learns");
    const doc = lessonDoc(l, { owner: "u1", members: ["u2"], rev: 3, createdAt: 1, now: 2, via: "studio" });
    expect(doc.members).toEqual(["u1", "u2"]);
    expect(doc.title).toBe("How an AI model learns");
    const scenes = Object.fromEntries(l.scenes.scenes.map((s) => [s.id, sceneDoc(s, 3)]));
    expect(lessonFromDocs(doc, scenes)).toEqual({ manifest: l.manifest, scenes: { ...l.scenes, version: "0.2" } });
  });
});

describe("memory store", () => {
  it("keeps lessons to their members, refuses stale edits and records history", async () => {
    const store = new MemoryStore(() => 1000);
    const me = { uid: "u1", via: "studio" };
    await store.create("p", newLesson(brief, "2026-10-27"), me);
    await expect(store.create("p", newLesson(brief), me)).rejects.toBeInstanceOf(StoreError);
    await expect(store.get("p", "stranger")).rejects.toMatchObject({ code: "forbidden" });
    const r = await store.apply("p", [MANY[1]!], { uid: "u1", via: "mcp:claude" }, 1);
    expect(r.rev).toBe(2);
    await expect(store.apply("p", [MANY[0]!], me, 1)).rejects.toMatchObject({ code: "conflict" });
    const [last] = await store.history("p", "u1");
    expect(last!.via).toBe("mcp:claude");
    const undone = await store.apply("p", JSON.parse(last!.inverse), me, 2);
    expect(undone.lesson.scenes.scenes.map((s) => s.id)).toEqual(["intro"]);
    expect((await store.list("u1"))[0]).toMatchObject({ id: "p", rev: 3, updatedVia: "studio" });
  });
});

describe("operation schema", () => {
  const validate = new Ajv({ strict: false }).compile(OP_SCHEMA);
  it("accepts every operation the tests use, and refuses unknown ones", () => {
    for (const op of MANY) {
      expect(validate(op), `${op.op}: ${JSON.stringify(validate.errors?.slice(0, 2))}`).toBe(true);
    }
    expect(validate({ op: "explode", scene: "x" })).toBe(false);
    expect(validate({ op: "animate", scene: "s", element: "e", preset: "spin", at: 0 })).toBe(false);
  });
});

describe("undo next to someone else's edits", () => {
  it("undoes only what it changed, keeping another person's edit to the same scene", () => {
    const base = applyOps(newLesson(brief, "2026-10-27"), [MANY[1]!]).lesson;
    // Mine: animate the box. Then someone else (an AI) adds an element and rewrites the narration of that scene.
    const mine = applyOps(base, [{ op: "animate", scene: "signs", element: "box", preset: "pop", at: 0.5 }]);
    const theirs = applyOps(mine.lesson, [
      { op: "addElement", scene: "signs", element: { id: "warn", type: "icon", icon: "warning", x: 10, y: 10 } },
      { op: "setNarration", scene: "signs", lang: "en", text: "Check the sender." },
    ]).lesson;
    const undone = applyOps(theirs, mine.inverse).lesson;
    const s = undone.scenes.scenes.find((x) => x.id === "signs")!;
    if (s.template !== "canvas") throw new Error("expected canvas");
    expect(s.content.elements.find((e) => e.id === "box")!.anim).toBeUndefined();
    expect(s.content.elements.map((e) => e.id)).toEqual(["box", "warn"]);
    expect(s.narration.en).toBe("Check the sender.");
  });

  it("puts a removed element back where it was, in its group", () => {
    const l = applyOps(newLesson(brief, "2026-10-27"), [
      MANY[1]!,
      { op: "addElement", scene: "signs", element: { id: "g", type: "group", x: 0, y: 0, children: [] } },
      { op: "addElement", scene: "signs", parent: "g", element: { id: "a", type: "icon", icon: "key", x: 0, y: 0 } },
      { op: "addElement", scene: "signs", parent: "g", element: { id: "b", type: "icon", icon: "lock", x: 0, y: 0 } },
    ]).lesson;
    const r = applyOps(l, [{ op: "removeElement", scene: "signs", element: "a" }]);
    expect(applyOps(r.lesson, r.inverse).lesson).toEqual(l);
  });
});
