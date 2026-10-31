import { describe, expect, it } from "vitest";
import { validatePackage, type Element, type LessonPackage } from "../../src/index.ts";
import { BOARDS, IOT_LIMITS } from "../../src/packs/iot/check.ts";

/** A one-scene lesson holding these elements, checked by the validator. */
function check(...elements: unknown[]): { errors: string[]; warnings: string[] } {
  const pkg = {
    manifest: {
      spec: "lesson-package", version: "0.2", id: "iot-check", rev: 1, title: { en: "IoT", ar: "IoT" }, defaultLang: "en",
      languages: [{ code: "en", dir: "ltr", name: "English", duration: 5, timing: "timing/en.json" }, { code: "ar", dir: "rtl", name: "العربية", duration: 5, timing: "timing/ar.json" }],
    },
    scenes: { version: "0.2", scenes: [{ id: "s", template: "canvas", narration: { en: "Hello there.", ar: "مرحبا بكم." }, content: { elements: elements as Element[] } }] },
    timing: Object.fromEntries(["en", "ar"].map((l) => [l, { lang: l, source: "estimated", duration: 5, scenes: [{ id: "s", start: 0, end: 5, sentences: [], words: [] }] }])),
  } as unknown as LessonPackage;
  const r = validatePackage(pkg);
  const at = (i: { code: string; path: string }): string => `${i.code} ${i.path.replace("scenes[0].content.elements", "el")}`;
  return { errors: r.errors.filter((e) => e.path.includes("elements")).map(at), warnings: r.warnings.filter((w) => w.path.includes("elements")).map(at) };
}
const T = (s: string): Record<string, string> => ({ en: s, ar: s });
const box = { x: 40, y: 140, w: 1000, h: 500 };
const led = {
  id: "c", type: "circuit", ...box,
  parts: [
    { id: "bat", kind: "battery", a: [0, 0], b: [0, 2], label: T("3 V"), value: 3 },
    { id: "sw", kind: "switch", a: [1, 0], b: [2, 0], label: T("switch") },
    { id: "led", kind: "led", a: [3, 0], b: [3, 2], color: "red", show: ["V", "I"] },
  ],
  wires: [[[0, 0], [1, 0]], [[2, 0], [3, 0]], [[3, 2], [0, 2]]],
  frames: [{ closed: { sw: 0 } }, { closed: { sw: 1 }, on: { led: 0.8 }, flow: [[10], [10], [10]], values: { led: "2.0 V, 10 mA" } }],
};

describe("IoT pack: validation", () => {
  it("accepts every element type, well formed", () => {
    const r = check(
      led,
      { id: "p", type: "pinout", ...box, board: "pico", pins: ["GP15", "GND"], parts: [{ id: "l", kind: "led", pin: "GP15", res: "220 Ω", label: T("LED") }], frames: [{ pins: { GP15: 1, LED: 1 }, on: { l: 1 } }] },
      { id: "m", type: "pinout", ...box, board: "microbit", frames: [{ pins: { A: 1 }, matrix: "0101011111111110111000100" }] },
      { id: "g", type: "signal", ...box, xr: [0, 10], yr: [0, 40], curve: [[0, 20], [10, 30]], samples: [[0, 20], [5, 25], [10, 30]], adc: { bits: 10 }, threshold: [30, 28], out: [[0, 0], [10, 1]], readout: "both", unit: "°C", xLabel: T("time") },
      { id: "q", type: "gates", ...box, inputs: [{ id: "a", label: T("A") }, { id: "b", label: T("B") }], gates: [{ id: "x", kind: "xor", in: ["a", "b"] }], outputs: [{ id: "o", from: "x", label: T("light") }], frames: [[0, 0], [0, 1], [1, 0], [1, 1]], table: true },
      { id: "b", type: "bits", ...box, n: 8, frames: [0, 65, 255], sum: true, hex: true, notes: [null, T("A"), null] },
    );
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  it("finds circuit mistakes at their place", () => {
    const bad = {
      ...led,
      parts: [
        { id: "bat", kind: "battery", a: [0, 0], b: [1, 2] },
        { id: "bat", kind: "laser", a: [0, 0], b: [0, 1] },
        { id: "g", kind: "ground", a: [0, 2], b: [0, 3] },
        { id: "p", kind: "pin", a: [5, 0] },
        { id: "r", kind: "resistor", a: [0, 0], b: [0, 1], color: "red", side: "inside" },
      ],
      wires: [[[0, 0], [2, 2]], [[0, 0]]],
      frames: [{ closed: { nope: 1 }, flow: [[1]], on: { r: 2 }, values: { r: "1 · 2" } }],
    };
    expect(check(bad).errors).toEqual(expect.arrayContaining([
      "badPoints el[0].parts[0].b", "dupId el[0].parts[1].id", "badKind el[0].parts[1].kind", "badPoints el[0].parts[2].b",
      "missingText el[0].parts[3].label", "badColor el[0].parts[4].color", "badSide el[0].parts[4].side",
      "badPoints el[0].wires[0][1]", "badPoints el[0].wires[1]", "badRef el[0].frames[0].closed.nope", "badFlow el[0].frames[0].flow",
      "badRef el[0].frames[0].on.r", "badFrames el[0].frames[0].values.r",
    ]));
  });

  it("knows each board's pins and keeps parts off power pins", () => {
    const r = check({ id: "p", type: "pinout", ...box, board: "esp32", pins: ["GP15"], parts: [{ id: "l", kind: "led", pin: "3V3" }, { id: "k", kind: "fan", pin: "D2" }], frames: [{ matrix: "1".repeat(25) }] });
    expect(r.errors).toEqual(["badPin el[0].pins[0]", "badPin el[0].parts[0].pin", "badKind el[0].parts[1].kind", "badMatrix el[0].frames[0].matrix"]);
    expect(check({ id: "p", type: "pinout", ...box, board: "uno" }).errors).toEqual(["badBoard el[0].board"]);
    expect(BOARDS.pico.top).toHaveLength(20);
    expect(BOARDS.pico.bottom).toHaveLength(20);
    expect(BOARDS.esp32.top.length + BOARDS.esp32.bottom.length).toBe(30);
  });

  it("checks signals, logic and registers", () => {
    expect(check({ id: "s", type: "signal", ...box, xr: [1, 0], yr: [0, 1], curve: [[1, 0], [0, 1]], adc: { bits: 20 }, threshold: [1, 2], readout: "code" }).errors).toEqual([
      "badRange el[0].xr", "badPoints el[0].curve[1]", "badAdc el[0].adc.bits", "badAdc el[0].adc", "badThreshold el[0].threshold", "badReadout el[0].readout",
    ]);
    expect(check({ id: "q", type: "gates", ...box, inputs: [{ id: "a", label: T("A") }], gates: [{ id: "n", kind: "not", in: ["a", "a"] }, { id: "x", kind: "and", in: ["a", "y"] }], outputs: [{ id: "o", from: "z", label: T("o") }], frames: [[0, 1]] }).errors).toEqual([
      "badGate el[0].gates[0].in", "badRef el[0].gates[1].in[1]", "badRef el[0].outputs[0].from", "badFrames el[0].frames[0]",
    ]);
    expect(check({ id: "q", type: "gates", ...box, inputs: [{ id: "a", label: T("A") }], gates: [], outputs: [{ id: "o", from: "a", label: T("o") }], frames: Array.from({ length: 9 }, () => [0]), table: true }).warnings).toEqual(["bigTable el[0].frames"]);
    expect(check({ id: "b", type: "bits", ...box, n: 4, frames: [16, 3.5], notes: [T("x")] }).errors).toEqual(["badFrames el[0].frames[0]", "badFrames el[0].frames[1]", "badNotes el[0].notes"]);
    expect(check({ id: "b", type: "bits", ...box, n: IOT_LIMITS.bits + 1, frames: [0] }).errors).toEqual(["badCount el[0].n"]);
  });

  it("lets every pack element use reveal, frame, focus and pass", () => {
    const anim = ["reveal", "frame", "focus", "pass"].map((prop) => ({ prop, keys: [{ at: 0, value: 0 }, { at: 1, value: 1 }] }));
    expect(check({ ...led, anim }).errors).toEqual([]);
  });
});
