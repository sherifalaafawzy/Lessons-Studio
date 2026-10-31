import { describe, expect, it } from "vitest";
import { walkElements, type Element } from "../../../packages/spec/src/index.ts";
import { check } from "../../../packages/ops/src/index.ts";
import { AR, convert, loadArabic, loadDesign, loadStory, type LessonDesign } from "../../darsi/convert.ts";
import { bodies } from "../../darsi/packs/iot.ts";

const story = loadStory("IOT-2-1-1");
const ar = loadArabic("IOT-2-1-1")!;
const T = (en: string, arEG: string): Record<string, string> => ({ en, [AR]: arEG });
// The lesson's own design, with pack bodies in six of its scenes.
const design: LessonDesign = { scenes: {
  ...loadDesign("IOT-2-1-1").scenes,
  "3": { circuit: { preset: "torch", states: [{ closed: { sw: true } }, { s: 3 }], focus: [{ part: "bat", s: 1 }] } },
  "4": { pinout: { board: "pico", parts: [{ id: "led", kind: "led", pin: "GP15", res: "220 Ω", label: T("LED", "LED") }], states: [{}, { s: 2, pins: { GP15: 1 }, on: { led: 1 } }], focus: [{ pin: "GP15", s: 1 }] } },
  "5": { signal: { fn: "25 + 6*sin(x)", xr: [0, 6], yr: [15, 35], rate: 2, threshold: [30, 28], outLabel: T("fan", "المروحة"), unit: "°C", readout: "value", avg: 3, frames: [0, 2], focus: [{ layer: 2, s: 1 }, { layer: 4, s: 2 }] } },
  "6": { circuit: { preset: "led", states: [{}, { s: 1, closed: { sw: true } }] } },
  "9": { bits: { n: 8, values: [{ v: 1 }, { v: 65, s: 1, note: T("the letter A", "حرف A") }], sum: true, label: T("1 byte", "بايت واحد") } },
  "10": { gates: { inputs: [{ id: "a", label: "A" }, { id: "b", label: "B" }], gates: [{ id: "and", kind: "and", in: ["a", "b"] }], outputs: [{ id: "q", from: "and", label: T("lamp", "اللمبة") }], frames: [1, 3] } },
} };

describe("Darsi storyboards: the IoT pack's bodies", () => {
  const out = convert(story, ar, design);
  const els = (n: number): Element[] => { const list: Element[] = []; walkElements(out.scenes.scenes[n - 1]!, (e) => list.push(e)); return list; };
  const of = (n: number, type: string): Element => els(n).find((e) => e.type === type)!;
  const props = (e: Element): string[] => (e.anim ?? []).map((t) => t.prop);

  it("builds a circuit, a board, a signal, a register and gates that validate", () => {
    const r = check(out);
    expect(r.errors).toEqual([]);
    expect(r.warnings.filter((w) => !["longLesson", "heavyLesson"].includes(w.code))).toEqual([]);
    expect(props(of(3, "circuit"))).toEqual(["reveal", "frame", "focus", "pass"]);
    expect(props(of(4, "pinout"))).toEqual(["reveal", "frame", "focus", "pass"]);
    expect(props(of(5, "signal"))).toEqual(["reveal", "focus"]);
    expect(props(of(6, "circuit"))).toEqual(["reveal", "frame", "pass"]);
    expect(props(of(9, "bits"))).toEqual(["reveal", "frame"]);
    expect(props(of(10, "gates"))).toEqual(["reveal", "frame"]);
    // Pack bodies take the full width: no cast member beside them.
    for (const n of [3, 4, 5, 6, 9, 10]) expect(els(n).some((e) => e.type === "image"), `scene ${n}`).toBe(false);
  });

  it("solves the circuit for each state and times the states to sentences, in both languages", () => {
    const c = of(3, "circuit") as Extract<Element, { type: "circuit" }>;
    expect(c.frames!.map((f) => f.closed!.sw)).toEqual([1, 0]);
    expect(c.frames![0]!.on!.lamp).toBeGreaterThan(0.9);
    const frame = c.anim!.find((t) => t.prop === "frame")!;
    const at = frame.keys[0]!.at as { word: Record<string, string> };
    expect(Object.keys(at.word)).toEqual(["en", AR]);
    const led = of(6, "circuit") as Extract<Element, { type: "circuit" }>;
    expect(led.frames![1]!.values!.led).toBe("2.0 V, 10 mA");
  });

  it("samples and thresholds the signal, labels in Egyptian Arabic", () => {
    const s = of(5, "signal") as Extract<Element, { type: "signal" }>;
    expect(s.samples).toHaveLength(13);
    expect(s.out![0]).toEqual([0, 0]);
    expect(s.avg).toHaveLength(13);
    expect(s.outLabel).toEqual(T("fan", "المروحة"));
    const b = of(9, "bits") as Extract<Element, { type: "bits" }>;
    expect(b.frames).toEqual([1, 65]);
    expect(b.notes).toEqual([null, T("the letter A", "حرف A")]);
    const g = of(10, "gates") as Extract<Element, { type: "gates" }>;
    expect(g.frames).toHaveLength(4);
    expect(g.table).toBe(true);
  });

  it("names the scene when a spec is wrong", () => {
    const bad = (d: Record<string, unknown>): (() => unknown) => () => convert(story, ar, { scenes: { "3": d } });
    expect(bad({ circuit: { preset: "toaster" } })).toThrow(/scene 3.*circuit preset toaster/);
    expect(bad({ circuit: { preset: "led", states: [{}, { s: 9, closed: { sw: true } }] } })).toThrow(/scene 3.*sentence number from 0 to 3/);
    expect(bad({ circuit: { parts: [{ id: "b", kind: "battery", a: [0, 0], b: [0, 2] }, { id: "r", kind: "resistor", a: [2, 0], b: [2, 2] }], wires: [[[0, 0], [4, 0]], [[0, 2], [2, 2]], [[4, 0], [4, 2], [2, 2]]] } })).toThrow(/scene 3.*runs straight through/);
    expect(bad({ circuit: { preset: "led", focus: [{ part: "fan", s: 1 }] } })).toThrow(/scene 3.*not a part/);
    expect(bad({ signal: { fn: "sin(", xr: [0, 1], yr: [0, 1] } })).toThrow(/scene 3.*signal fn/);
    expect(bad({ bits: { values: [{ v: 300 }], n: 8 } })).toThrow(/scene 3.*9 bits/);
    expect(bad({ pinout: { parts: [] } })).toThrow(/scene 3.*board/);
  });

  it("has a body for every element type", () => {
    expect(Object.keys(bodies).sort()).toEqual(["bits", "circuit", "gates", "pinout", "signal"]);
  });
});
