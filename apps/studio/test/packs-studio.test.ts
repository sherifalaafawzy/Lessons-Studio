// The studio's generic handling of technology packs, with a stand-in pack (the real ones land on their own): the
// gallery hides packs without scenes, a pack's scene goes in under a new id, an element of each type comes from the
// presets without its animation, and the JSON form's helpers (parse, the changed fields, the checks for one element).
import { describe, expect, it, vi } from "vitest";
import type { Element, Scene } from "@lessonstudio/spec";
import { applyOps, newLesson, type Lesson } from "@lessonstudio/ops";

const scene = (id: string, el: Record<string, unknown>): Scene => ({
  id, template: "canvas", narration: { en: "Watch the trace.", ar: "راقب التتبع." },
  content: { elements: [{ id: "h", type: "text", x: 80, y: 50, w: 1120, size: 48, text: { en: "Trace", ar: "تتبع" } }, el as never] },
});
let throws = false;
vi.mock("@lessonstudio/ops", async (orig) => {
  const real = await orig<typeof import("@lessonstudio/ops")>();
  return {
    ...real,
    // Only the stand-in pack has scenes here (the real packs' scenes are checked in packs.test.ts).
    packs: {
      ...Object.fromEntries(Object.keys(real.packs).map((id) => [id, { presets: () => [] }])),
      code: { presets: (langs: string[]) => (throws ? (() => { throw new Error("half written"); })() : [
        { id: "loop", name: { en: "A loop", ar: "حلقة" }, scene: scene("loop", { id: "t", type: "trace", x: 100, y: 150, w: 900, h: 400, anim: [{ prop: "frame", keys: [{ at: 0, value: 0 }] }], langs }) },
        { id: "sort", name: { en: "Sorting", ar: "الترتيب" }, scene: scene("sort", { id: "a", type: "array", x: 100, y: 150, w: 900, h: 400 }) },
      ]) },
    },
  };
});

const { packGallery, packElements, presetByKey, presetKey, presetScene, parseFields, jsonErrorAt, fieldProps, ownFields, withFields, elementIssues } = await import("../src/packs.ts");

describe("technology packs in the studio", () => {
  it("lists only the packs that have scenes, and finds a scene by its key", () => {
    const g = packGallery(["en", "ar"]);
    expect(g.map((x) => x.pack)).toEqual(["code"]);
    expect(g[0]!.presets.map((p) => presetKey(p))).toEqual(["pack:code/loop", "pack:code/sort"]);
    expect(presetByKey("pack:code/sort", ["en", "ar"])?.id).toBe("sort");
    expect(presetByKey("pack:nope/sort", ["en", "ar"])).toBeUndefined();
    expect(presetByKey("sort", ["en", "ar"])).toBeUndefined();
  });

  it("a pack whose presets throw shows none, and the studio carries on", () => {
    throws = true;
    expect(packGallery(["fr"])).toEqual([]);
    throws = false;
  });

  it("puts a pack scene in under a new id, leaving the preset as it was", () => {
    const p = packGallery(["en", "ar"])[0]!.presets[0]!;
    const s = presetScene(p, "loop-2");
    expect(s.id).toBe("loop-2");
    expect(p.scene.id).toBe("loop");
  });

  it("offers one element of each type its scenes use, without the scene's animation", () => {
    const els = packElements(["en", "ar"]);
    expect(els.map((x) => [x.pack, x.type])).toEqual([["code", "trace"], ["code", "array"]]);
    expect("anim" in els[0]!.element).toBe(false);
    expect(packGallery(["en", "ar"])[0]!.presets[0]!.scene.template === "canvas").toBe(true);
  });
});

describe("the JSON form's helpers", () => {
  const table: Element = { id: "t", type: "table", x: 40, y: 150, w: 800, h: 300, cols: ["A", "B"], rows: [[1, 2]], tone: "accent", anim: [{ prop: "reveal", keys: [{ at: 0, value: 0 }, { at: 1, value: 1 }] }] };

  it("leaves out the place, size and animation, and reads them back", () => {
    expect(ownFields(table)).toEqual({ cols: ["A", "B"], rows: [[1, 2]], tone: "accent" });
    const back = withFields(table, { cols: ["A"], rows: [[1]] });
    expect([back.id, back.type, back.x, back.w, back.anim?.length]).toEqual(["t", "table", 40, 800, 1]);
  });

  it("says where JSON goes wrong, and refuses what isn't one object of own fields", () => {
    const bad = parseFields('{\n  "cols": ["A",]\n}');
    expect(bad).toEqual({ problem: { kind: "json", message: "Unexpected token ']'", at: 17 } });
    expect(jsonErrorAt('{"a" 1}')).toBe(5);
    expect(jsonErrorAt('{"a": 1')).toBe(7);
    expect(jsonErrorAt('{"a": "x\\q"}')).toBe(9);
    expect(jsonErrorAt('{"a": [1, 2.5e3, true, null, "\\u0041"]}')).toBe(-1);
    expect(jsonErrorAt("{} x")).toBe(3);
    expect("problem" in parseFields("[1]") && (parseFields("[1]") as { problem: { kind: string } }).problem.kind).toBe("object");
    expect(parseFields('{"x": 3, "cols": []}')).toEqual({ problem: { kind: "place", keys: ["x"] } });
    expect(parseFields('{"cols": []}')).toEqual({ value: { cols: [] } });
  });

  it("changes only what changed, and removes what was taken out", () => {
    expect(fieldProps(table, { cols: ["A", "B"], rows: [[1, 3]] })).toEqual({ rows: [[1, 3]], tone: null });
  });

  it("checks one element as typed, at paths inside it, on a copy of the lesson", () => {
    const l: Lesson = newLesson({ id: "json-form", title: { en: "J", ar: "J" }, languages: [{ code: "en", name: "English" }, { code: "ar", name: "العربية" }], createdBy: "u" }, "2026-10-28");
    l.scenes.scenes = [scene("s1", table as never)];
    expect(elementIssues(l, "s1", table).filter((i) => i.bad)).toEqual([]);
    const wrong = withFields(table, { cols: ["A", "B"], rows: [[1, 2, 3]] });
    const found = elementIssues(l, "s1", table, wrong);
    expect(found.map((i) => [i.code, i.rel, i.bad])).toContainEqual(["badRow", "rows[0]", true]);
    // The lesson itself is untouched; the change goes in with the operations, and undoes.
    const done = applyOps(l, [{ op: "updateElement", scene: "s1", element: "t", props: fieldProps(table, { cols: ["A", "B"], rows: [[5, 6]] }) }]);
    expect(applyOps(done.lesson, done.inverse).lesson).toEqual(l);
    expect(l.scenes.scenes[0]!.template === "canvas" && (l.scenes.scenes[0]!.content.elements[1] as { rows: unknown }).rows).toEqual([[1, 2]]);
  });
});
