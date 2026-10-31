import { describe, expect, it } from "vitest";
import type { Orient } from "@lessonstudio/spec";
import { walkElements } from "@lessonstudio/spec";
import { check, newLesson, type Lesson } from "../../src/draft.ts";
import {
  CIRCUIT_PRESETS, adcCode, bitsFrames, circuitDef, element, evalGates, fmtI, fmtR, fmtV, gateFrames, ldrOhms, movingAverage, ntcOhms, presets,
  sampleSignal, solveCircuit, textBytes, thresholdOut,
} from "../../src/packs/iot.ts";

const lesson = (langs: string[], stage: Orient = "landscape"): Lesson =>
  newLesson({ id: "iot-tests", title: Object.fromEntries(langs.map((l) => [l, "IoT"])), languages: langs.map((code) => ({ code, name: code })), stage, createdBy: "u" }, "2026-10-28");

describe("IoT pack: the DC solver", () => {
  it("gives an LED and its resistor ten milliamps, as the course works it out: (3 − 2) ÷ 100 Ω", () => {
    const [open, closed] = solveCircuit(circuitDef("led"), [{}, { closed: { sw: true } }]);
    expect(open!.mA.led).toBe(0);
    expect(open!.frame.flow!.flat().every((f) => f === 0)).toBe(true);
    expect(closed!.mA.led).toBeCloseTo(10, 0);
    expect(closed!.frame.values).toEqual({ r: "1.0 V", led: "2.0 V, 10 mA" });
    expect(closed!.frame.on!.led).toBeGreaterThan(0.7);
    // The same current all the way round, out of + and back into −.
    for (const f of closed!.frame.flow!) for (const x of f) expect(Math.abs(x)).toBeCloseTo(10, 0);
    expect(closed!.frame.flow![0]![0]).toBeGreaterThan(0); // from the battery's + towards the switch
  });

  it("burns an LED out without a resistor, and lights nothing the wrong way round", () => {
    const [on, dead] = solveCircuit(circuitDef("led", ["en"], { resistor: false }), [{ closed: { sw: true } }, { closed: { sw: true }, broken: ["led"] }]);
    expect(on!.mA.led).toBeGreaterThan(100);
    expect(on!.frame.over).toEqual(["led"]);
    expect(dead!.mA.led).toBe(0);
    expect(dead!.frame.on!.led).toBe(0);
    const def = circuitDef("led");
    const flipped = { ...def, parts: def.parts.map((p) => (p.id === "led" ? { ...p, a: p.b!, b: p.a } : p)) };
    expect(solveCircuit(flipped, [{ closed: { sw: true } }])[0]!.mA.led).toBe(0);
  });

  it("shares the volts in series and the current in parallel", () => {
    const [s] = solveCircuit(circuitDef("series"), [{ closed: { sw: true } }]);
    expect(s!.frame.values).toEqual({ l1: "1.5 V", l2: "1.5 V" });
    expect(s!.frame.on!.l1).toBeCloseTo(0.25, 1);
    const [p] = solveCircuit(circuitDef("parallel"), [{ closed: { sw: true } }]);
    expect(p!.frame.values).toEqual({ l1: "3.0 V", l2: "3.0 V" });
    expect(Math.abs(p!.mA.bat!)).toBeCloseTo(2 * p!.mA.l1!, 0);
    // The battery's wire carries both lamps' current; each branch carries one.
    expect(Math.abs(p!.frame.flow![1]![0]!)).toBeCloseTo(2 * Math.abs(p!.frame.flow![1]![1]!), 0);
  });

  it("makes AND from switches in series and OR from switches side by side", () => {
    const states = [{}, { closed: { a: true } }, { closed: { b: true } }, { closed: { a: true, b: true } }];
    const lit = (name: "and" | "or"): number[] => solveCircuit(circuitDef(name), states).map((s) => (s.frame.on!.lamp! > 0.5 ? 1 : 0));
    expect(lit("and")).toEqual([0, 0, 0, 1]);
    expect(lit("or")).toEqual([0, 1, 1, 1]);
  });

  it("reads a light sensor and a thermistor through a voltage divider on an input pin", () => {
    const [day, night] = solveCircuit(circuitDef("light-sensor"), [{ light: { ldr: 1 }, pins: { v33: 1, gp15: 0 } }, { light: { ldr: 0.05 }, pins: { v33: 1, gp15: 1 } }]);
    expect(day!.frame.pins).toMatchObject({ gp26: 1, gp15: 0 });
    expect(day!.frame.values!.gp26).toBe("3.0 V");
    expect(day!.mA.led).toBe(0);
    expect(night!.frame.pins).toMatchObject({ gp26: 0, gp15: 1 });
    expect(night!.mA.led).toBeGreaterThan(5);
    expect(ldrOhms(0)).toBeCloseTo(100000);
    expect(ldrOhms(1)).toBeCloseTo(1000);
    expect(ntcOhms(25)).toBeCloseTo(10000);
    expect(ntcOhms(35)).toBeLessThan(ntcOhms(25));
    const [cool, warm] = solveCircuit(circuitDef("thermistor"), [{ temp: { th: 20 } }, { temp: { th: 40 } }]);
    expect(Number.parseFloat(warm!.frame.values!.gp27!)).toBeLessThan(Number.parseFloat(cool!.frame.values!.gp27!));
  });

  it("solves every ready-made circuit, and refuses a join in the middle of a wire", () => {
    for (const name of CIRCUIT_PRESETS) expect(() => solveCircuit(circuitDef(name), [{}]), name).not.toThrow();
    expect(() => solveCircuit({ parts: [{ id: "b", kind: "battery", a: [0, 0], b: [0, 2] }, { id: "r", kind: "resistor", a: [2, 0], b: [2, 2] }], wires: [[[0, 0], [4, 0]], [[0, 2], [2, 2]], [[4, 0], [4, 2], [2, 2]]] }, [{}])).toThrow(/runs straight through \(2, 0\)/);
    expect(() => solveCircuit({ parts: [{ id: "p", kind: "pin", a: [0, 0] }, { id: "r", kind: "resistor", a: [0, 0], b: [0, 1] }], wires: [] }, [{}])).toThrow(/ground/);
  });

  it("writes values as a learner reads them", () => {
    expect([fmtV(0), fmtV(0.3), fmtV(3.3), fmtV(12.4)]).toEqual(["0 V", "0.3 V", "3.3 V", "12 V"]);
    expect([fmtI(0), fmtI(0.42), fmtI(5.94), fmtI(9.98), fmtI(109.3), fmtI(1234)]).toEqual(["0 mA", "0.42 mA", "5.9 mA", "10 mA", "109 mA", "1.2 A"]);
    expect([fmtR(220), fmtR(4700), fmtR(10000), fmtR(1e6)]).toEqual(["220 Ω", "4.7 kΩ", "10 kΩ", "1 MΩ"]);
  });
});

describe("IoT pack: signals, logic and bits", () => {
  it("samples a reading at its rate and converts it with an ADC", () => {
    const s = sampleSignal("1.65 + 1.65*sin(pi*x)", 4, 10, { xr: [0, 2], yr: [0, 3.3], lo: 0, hi: 3.3 });
    expect(s.samples).toHaveLength(9);
    expect(s.samples![2]).toEqual([0.5, 3.3]);
    expect(s.adc).toEqual({ bits: 10, lo: 0, hi: 3.3 });
    expect(adcCode(3.3, 10, 0, 3.3)).toBe(1023);
    expect(adcCode(1.65, 10, 0, 3.3)).toBe(512);
    expect(adcCode(1.65, 12, 0, 3.3)).toBe(2048);
    expect(adcCode(5, 3, 0, 3.3)).toBe(7);
    // Seeded noise: the same call gives the same samples.
    const n = (): number[] => sampleSignal((t) => t, 2, undefined, { xr: [0, 5], yr: [0, 5], noise: 0.5 }).samples!.map((p) => p[1]);
    expect(n()).toEqual(n());
  });

  it("thresholds a noisy reading: one threshold flickers, two (hysteresis) don't", () => {
    const wobble: [number, number][] = [29.8, 30.2, 29.9, 30.3, 29.7, 30.4, 31, 32, 31, 29.5, 28.5, 27.9, 27].map((v, i) => [i, v]);
    expect(thresholdOut(wobble, 30).length).toBeGreaterThan(5);
    expect(thresholdOut(wobble, 30, 28)).toEqual([[0, 0], [1, 1], [11, 0]]);
    expect(movingAverage([[0, 1], [1, 3], [2, 5]], 2)).toEqual([[0, 1], [1, 2], [2, 4]]);
  });

  it("lists inputs in truth-table order and works the gates out", () => {
    expect(gateFrames(2)).toEqual([[0, 0], [0, 1], [1, 0], [1, 1]]);
    expect(gateFrames(3)).toHaveLength(8);
    const net = {
      inputs: [{ id: "a", label: "A" }, { id: "b", label: "B" }],
      gates: (["and", "or", "xor", "nand", "nor"] as const).map((kind) => ({ id: kind, kind, in: ["a", "b"] })).concat([{ id: "not", kind: "not" as never, in: ["a"] }]),
      outputs: [{ id: "q", from: "xor", label: "Q" }],
    };
    const table = gateFrames(2).map((r) => evalGates(net, r));
    expect(table.map((v) => [v.and, v.or, v.xor, v.nand, v.nor, v.not, v.q])).toEqual([[0, 0, 0, 1, 1, 1, 0], [0, 1, 1, 1, 0, 1, 1], [0, 1, 1, 1, 0, 0, 1], [1, 1, 0, 0, 0, 0, 0]]);
  });

  it("sizes registers and counts bytes", () => {
    expect(bitsFrames([0, 65, 255])).toEqual({ n: 8, frames: [0, 65, 255] });
    expect(bitsFrames([612], 10).n).toBe(10);
    expect(() => bitsFrames([256], 8)).toThrow(/9 bits/);
    expect(textBytes("A")).toEqual([65]);
    expect(textBytes("ب")).toHaveLength(2);
  });
});

describe("IoT pack: gallery scenes and default elements", () => {
  const all = presets(["en", "ar"]);
  it("has a scene for every element type, named in English and Arabic", () => {
    const types = new Set<string>();
    for (const p of all) walkElements(p.scene, (el) => types.add(el.type));
    expect([...types]).toEqual(expect.arrayContaining(["circuit", "pinout", "signal", "gates", "bits"]));
    expect(new Set(all.map((p) => p.id)).size).toBe(all.length);
    for (const p of all) expect((p.name as Record<string, string>).ar).toBeTruthy();
    expect(JSON.stringify(all)).not.toContain("·");
  });

  for (const stage of ["landscape", "portrait", "square"] as const) {
    it(`validates with no warnings: ${stage}, en+ar, ar and en+ar+fr`, () => {
      for (const langs of [["en", "ar"], ["ar"], ["en", "ar", "fr"]]) {
        for (const p of presets(langs, stage)) {
          const l = lesson(langs, stage);
          l.scenes.scenes = [{ ...p.scene, id: "s" }];
          const r = check(l);
          expect(r.errors, `${p.id} ${langs}`).toEqual([]);
          expect(r.warnings, `${p.id} ${langs}`).toEqual([]);
        }
      }
    });
  }

  it("keys its animations on spoken words in every language", () => {
    for (const p of all) {
      const words: unknown[] = [];
      walkElements(p.scene, (el) => { for (const t of el.anim ?? []) for (const k of t.keys) if (typeof k.at !== "number") words.push(k.at); });
      expect(words.length, p.id).toBeGreaterThan(0);
    }
  });

  it("makes a default element of every type that validates", () => {
    for (const type of ["circuit", "pinout", "signal", "gates", "bits"] as const) {
      const l = lesson(["en", "ar"]);
      l.scenes.scenes = [{ id: "s", template: "canvas", narration: { en: "A default element.", ar: "عنصر افتراضي." }, content: { elements: [element(type, ["en", "ar"])] } }];
      const r = check(l);
      expect(r.errors, type).toEqual([]);
      expect(r.warnings, type).toEqual([]);
    }
  });
});
