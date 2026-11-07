// The optimization pack's design.json bodies: each builds a valid element timed to the scene's sentences, takes a
// school problem or its own data, and names the scene when a spec is wrong. One real storyboard converts cleanly.
import { describe, expect, it } from "vitest";
import { walkElements, type Element, type Scene, type Text } from "../../../packages/spec/src/index.ts";
import { check } from "../../../packages/ops/src/index.ts";
import { AR, convert, loadArabic, loadDesign, loadStory } from "../../darsi/convert.ts";
import { bodies } from "../../darsi/packs/opt.ts";
import type { AText, BodyCtx } from "../../darsi/packs/types.ts";

const ctx = (n = 4): BodyCtx => ({
  at: (k, o = 0) => Math.round((1 + k * 3 + o) * 1000) / 1000,
  n,
  T: (t: AText, what: string): Text => {
    if (typeof t === "string") return t;
    if (!t.en || !t[AR]) throw new Error(`test scene: ${what} has no ${t.en ? AR : "en"}`);
    return { en: t.en, [AR]: t[AR] };
  },
  langs: ["en", AR],
  box: { x: 90, y: 210, w: 1100, h: 400 },
  where: "test scene 3",
});
const one = (type: string, spec: unknown, n = 4): Element => {
  const els = bodies[type]!(spec, ctx(n));
  expect(els).toHaveLength(1);
  return els[0]!;
};
const track = (el: Element, prop: string) => el.anim?.find((t) => t.prop === prop);

describe("optimization bodies", () => {
  it("has a body for each element type", () => {
    expect(Object.keys(bodies).sort()).toEqual(["graph", "knapsack", "lp", "schedule", "searchtree"]);
  });

  it("times a graph to its sentences: in on s, the steps over frames, a bus, a focus", () => {
    const el = one("graph", { map: "shortest", algo: "dijkstra", s: 0, frames: [1, 2], bus: 3, focus: [{ node: "tala", s: 1 }] });
    expect(el.type).toBe("graph");
    expect(el).toMatchObject({ x: 90, y: 200, w: 1100, h: 430 });
    const fr = track(el, "frame")!;
    expect(fr.keys.map((k) => [k.at, k.value])).toEqual([[4, 0], [10, 9]]);
    expect(track(el, "focus")!.keys[0]).toMatchObject({ at: 4, value: 2 });
    expect(track(el, "pass")!.keys.map((k) => k.value)).toEqual([-1, 0, 1, -1]);
    // The flooded bridge, Kruskal, the bus route and the exam slots.
    const flooded = one("graph", { closed: [["kesi", "mina"]] }) as Extract<Element, { type: "graph" }>;
    expect(flooded.frames!.at(-1)!.total).toBe(14);
    expect((one("graph", { algo: "kruskal" }) as Extract<Element, { type: "graph" }>).frames!.at(-1)!.total).toBe(25);
    expect((one("graph", { map: "bus", algo: "route" }) as Extract<Element, { type: "graph" }>).frames!.at(-1)!.total).toBe(28.6);
    expect((one("graph", { map: "exams", algo: "greedy" }) as Extract<Element, { type: "graph" }>).frames!.at(-1)!.total).toBe(4);
  });

  it("takes a map of its own, with names in both languages", () => {
    const el = one("graph", {
      map: { nodes: [{ id: "a", x: 0, y: 0, text: { en: "Market", [AR]: "السوق" } }, { id: "b", x: 4, y: 1, text: { en: "Well", [AR]: "البير" } }, { id: "c", x: 2, y: 3, text: { en: "School", [AR]: "المدرسة" }, square: true }],
        edges: [["a", "b", 4], ["b", "c", 3], ["a", "c", 6]] },
      algo: "dijkstra", from: "a", to: "c", unit: { en: "min", [AR]: "دقيقة" },
    }) as Extract<Element, { type: "graph" }>;
    expect(el.frames!.at(-1)!.total).toBe(6);
    expect((el.frames!.at(-1)!.note as Record<string, string>)[AR]).toBe("السوق ← المدرسة");
    expect((el.frames![1]!.note as Record<string, string>).en).toContain("0 min");
  });

  it("builds the timetable, the printing, the truck (bag and table), the garden and the tree", () => {
    const tt = one("schedule", { kind: "timetable", rules: ["huda", "test", "art"], frames: [1, 3] }) as Extract<Element, { type: "schedule" }>;
    expect(tt.items).toHaveLength(12);
    expect(track(tt, "frame")!.keys.at(-1)!.value).toBe(tt.frames!.length - 1);
    expect((one("schedule", { kind: "printing" }) as Extract<Element, { type: "schedule" }>).kind).toBe("gantt");
    expect((one("knapsack", {}) as Extract<Element, { type: "knapsack" }>).frames!.at(-1)!.in).toBe(".nn...");
    expect((one("knapsack", { show: "table" }) as Extract<Element, { type: "knapsack" }>).table![6]![10]).toBe(65);
    const lp = one("lp", { limits: [0, 1, 2], region: 3, slide: [3, 3] }, 4);
    expect(track(lp, "reveal")!.keys.map((k) => k.value)).toEqual([0, 0.2, 0.2, 0.4, 0.4, 0.6, 0.6, 1]);
    expect(track(lp, "frame")).toBeDefined();
    const tree = one("searchtree", { frames: [0, 2] }, 3) as Extract<Element, { type: "searchtree" }>;
    expect(tree.steps).toHaveLength(11);
    expect(tree.frame).toBe(0);
  });

  it("takes a knapsack and a linear program of their own", () => {
    const k = one("knapsack", { items: [{ text: { en: "Rice", [AR]: "رز" }, w: 3, v: 6 }, { text: { en: "Beans", [AR]: "فول" }, w: 2, v: 5 }, { text: { en: "Eggs", [AR]: "بيض" }, w: 2, v: 4 }], cap: 4, show: "table" }) as Extract<Element, { type: "knapsack" }>;
    expect(k.table!.at(-1)!.at(-1)).toBe(9);
    const lp = one("lp", { cons: [{ a: 1, b: 1, c: 4, text: { en: "Time", [AR]: "الوقت" } }], obj: { a: 2, b: 3, text: { en: "Fun", [AR]: "المتعة" } }, x: { en: "Games", [AR]: "ألعاب" }, y: { en: "Songs", [AR]: "أغاني" } }) as Extract<Element, { type: "lp" }>;
    expect(lp.frames!.at(-1)!.level).toBe(12);
  });

  it("names the scene when a spec is wrong", () => {
    const bad: [string, unknown, RegExp][] = [
      ["graph", "shortest", /needs an object/],
      ["graph", { map: "moon" }, /map must be/],
      ["graph", { s: 9 }, /sentence number/],
      ["graph", { frames: [3, 1] }, /from ≤ to/],
      ["graph", { closed: [["home", "school"]] }, /no road/],
      ["graph", { focus: [{ node: "paris", s: 0 }] }, /no node paris/],
      ["graph", { map: { nodes: [{ id: "a", x: 0, y: 0 }], edges: [["a", "z", 1]] } }, /isn't there/],
      ["schedule", { kind: "pie" }, /timetable or printing/],
      ["schedule", { rules: ["holiday"] }, /no rule "holiday"/],
      ["knapsack", { items: [{ w: 1 }], cap: 3 }, /needs text, w and v/],
      ["knapsack", { items: [{ text: "x", w: 1, v: 1 }], cap: 300, show: "table" }, /at most 21 columns/],
      ["lp", { cons: [{ a: 1, b: 1, c: 2, op: ">=" }, { a: 1, b: 1, c: 1 }], obj: { a: 1, b: 1 } }, /no plan keeps/],
      ["lp", { limits: [0] }, /one sentence for each/],
      ["searchtree", { loads: 6 }, /2 to 4/],
    ];
    for (const [type, spec, re] of bad) expect(() => bodies[type]!(spec, ctx()), `${type} ${JSON.stringify(spec)}`).toThrow(new RegExp(`test scene 3: .*${re.source}`));
  });

  it("converts a real Optimization storyboard with every body, cleanly, in English and Egyptian Arabic", () => {
    const story = loadStory("OPT-1-1-2");
    const ar = loadArabic("OPT-1-1-2");
    const design = loadDesign("OPT-1-1-2");
    const out = convert(story, ar, { scenes: { ...design.scenes,
      "3": { graph: { map: "shortest", algo: "dijkstra", frames: [1, 2], bus: 2 } },
      "4": { schedule: { kind: "timetable", rules: ["huda", "test", "art"], frames: [1, 3] } },
      "5": { knapsack: { show: "bag", frames: [1, 3] } },
      "6": { lp: { limits: [0, 1, 2], region: 3, slide: [3, 3] } },
      "7": { searchtree: { frames: [0, 2] } },
    } });
    const r = check(out);
    expect(r.errors).toEqual([]);
    expect(r.warnings.filter((w) => w.code !== "longLesson")).toEqual([]);
    const types = (i: number): string[] => { const t: string[] = []; walkElements(out.scenes.scenes[i]! as Scene, (el) => t.push(el.type)); return t; };
    expect(types(2)).toContain("graph");
    expect(types(3)).toContain("schedule");
    expect(types(4)).toContain("knapsack");
    expect(types(5)).toContain("lp");
    expect(types(6)).toContain("searchtree");
    // Pack bodies take the width: no cast member beside them; Egyptian Arabic notes for ar-EG.
    for (const i of [2, 3, 4, 5, 6]) expect(types(i)).not.toContain("image");
    const g = out.scenes.scenes[2]!.content as { elements: Element[] };
    const graph = g.elements.find((e) => e.type === "graph") as Extract<Element, { type: "graph" }>;
    expect((graph.frames![2]!.note as Record<string, string>)[AR]).toMatch(/^نثبّت (\S+): .*، ونشوف طرق \1$/);
  });
});
