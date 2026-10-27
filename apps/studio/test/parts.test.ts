// Template parts on the stage map to the right text in the scene, and typing changes one language only.
import { describe, expect, it } from "vitest";
import type { Scene } from "@lessonstudio/spec";
import { getAt } from "@lessonstudio/ops";
import { GALLERY } from "../src/presets.ts";
import { elementPath, partPath, setText } from "../src/parts.ts";
import { partElementId } from "../src/convert.ts";

const make = (id: string): Scene => GALLERY.find((g) => g.id === id)!.make({ id: "s", langs: ["en", "ar"], stage: "landscape" });

describe("partPath", () => {
  it("finds every kind of part", () => {
    const cases: [string, string, string | null][] = [
      ["title", "title", "/content/title"], ["title", "hook", "/content/hook"], ["title", "kicker", "/content/kicker"], ["title", "step:0", null],
      ["steps", "step:2", "/content/steps/2"], ["steps", "step:3", null], ["steps", "title", "/content/title"],
      ["summary", "point:1", "/content/points/1"], ["summary", "takeaway", "/content/takeaway"],
      ["pipeline", "node:model", "/content/nodes/1/label"], ["pipeline", "node:nope", null], ["pipeline", "edge:0", "/content/edges/0/label"],
      ["sms", "from", "/content/from"], ["sms", "line:1", "/content/lines/1"], ["sms", "link", "/content/link"], ["sms", "flag:rush", "/content/flags/1/label"],
      ["email", "subject", "/content/subject"],
      ["quiz", "prompt", "/check/prompt"], ["quiz", "option:rushed", "/check/options/1/text"], ["quiz", "title", "/content/title"],
      ["big-number", "title", null],
    ];
    for (const [preset, part, want] of cases) expect(partPath(make(preset), part), `${preset} ${part}`).toBe(want);
    // Every path points at text that exists (or optional text that may be added).
    for (const [preset, part, want] of cases) if (want) expect(getAt(make(preset), want), `${preset} ${part}`).toBeDefined();
  });

  it("finds free elements in canvas scenes, overlays and groups", () => {
    const s = make("compare");
    expect(elementPath(s, "strong-ex")).toBe("/content/elements/8");
    const t = make("title");
    t.overlays = [{ id: "g", type: "group", x: 0, y: 0, children: [{ id: "inner", type: "text", x: 0, y: 0, text: "Hi" }] }];
    expect(elementPath(t, "inner")).toBe("/overlays/0/children/0");
    expect(elementPath(t, "missing")).toBeNull();
  });
});

describe("setText", () => {
  it("changes one language and keeps the others", () => {
    expect(setText({ en: "Old", ar: "قديم" }, "ar", "جديد", ["en", "ar"])).toEqual({ en: "Old", ar: "جديد" });
    expect(setText("Same", "en", "New", ["en", "ar"])).toEqual({ en: "New", ar: "Same" });
    expect(setText(undefined, "en", "New", ["en", "ar"])).toEqual({ en: "New", ar: "New" });
  });
});

describe("convert to canvas", () => {
  it("names elements after the template's cue targets", () => {
    expect(["step:0", "point:2", "line:0", "edge:1", "node:model", "flag:rush", "option:a", "title"].map(partElementId))
      .toEqual(["1", "3", "line-1", "edge-2", "model", "rush", "a", "title"]);
  });
});
