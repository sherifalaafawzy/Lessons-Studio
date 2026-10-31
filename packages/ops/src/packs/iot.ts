/**
 * Electronics and IoT pack: content computed when a lesson is made (never on the phone), and ready-made elements and
 * scenes with labels in English and Arabic. Seeded, so the same call always gives the same lesson.
 * - `solveCircuit`: a small DC solver (nodal analysis; an LED is a forward voltage) for every moment of a circuit.
 * - `circuitDef`: ready-made circuits (a torch, an LED and its resistor, series and parallel lamps, AND and OR switches,
 *   a light sensor read by a pin…), `circuit` builds the element with its frames.
 * - `sampleSignal`, `thresholdOut`, `movingAverage`: a sensor reading sampled, converted by an ADC and thresholded.
 * - `gateFrames`, `evalGates`: logic inputs in truth-table order; `bitsFrames`, `textBytes`: values for a register.
 * - `presets(langs, stage)`: gallery scenes; `element(type, langs, box)`: a default element of each type.
 */
import type { AnimProp, Element, Orient, PackElement, Scene, Text, Track, When } from "@lessonstudio/spec";
import { estimateTiming } from "@lessonstudio/spec";
import { compileExpr } from "@lessonstudio/spec/science";
import { presetKeys, shift } from "../presets.ts";
import { rng, tx } from "../science.ts";

export type CircuitElement = Extract<PackElement, { type: "circuit" }>;
export type PinoutElement = Extract<PackElement, { type: "pinout" }>;
export type SignalElement = Extract<PackElement, { type: "signal" }>;
export type GatesElement = Extract<PackElement, { type: "gates" }>;
export type BitsElement = Extract<PackElement, { type: "bits" }>;
export type CircuitPart = CircuitElement["parts"][number];
export type CircuitFrame = NonNullable<CircuitElement["frames"]>[number];
export type PinoutPart = NonNullable<PinoutElement["parts"]>[number];
export type PinoutFrame = NonNullable<PinoutElement["frames"]>[number];
export type GridPt = [number, number];
export interface Box { id: string; x: number; y: number; w: number; h: number }

const r2 = (v: number): number => Math.round(v * 100) / 100;
const r3 = (v: number): number => Math.round(v * 1000) / 1000;
const clamp = (v: number, lo = 0, hi = 1): number => (v < lo ? lo : v > hi ? hi : v);

/* ---------- the DC solver ---------- */

/** The solver's model. An LED conducts above its forward voltage, with 10 Ω inside, so it drops its nominal volts at 10 mA. */
export const MODEL = {
  /** Ohms inside a battery, a pin's driver and a closed switch. */
  batteryOhm: 0.05, pinOhm: 0.05, switchOhm: 0.01,
  ledOhm: 10,
  /** Forward voltage by colour, at 10 mA. */
  vf: { red: 2.0, yellow: 2.1, green: 2.2, blue: 3.0, white: 3.0 } as Record<string, number>,
  /** An LED is fully bright at 15 mA and burns out above 30 mA. */
  ledFull: 15, ledMax: 30,
  /** Defaults: volts of a battery and of a pin's high level; ohms of a resistor, a torch lamp, a buzzer, a small motor. */
  battery: 3, pin: 3.3, resistor: 220, lamp: 10, buzzer: 150, motor: 15,
  /** A light sensor: 100 kΩ in the dark, 1 kΩ in bright light. A thermistor: 10 kΩ at 25 °C, β 3950 (NTC). */
  ldrDark: 1e5, ldrBright: 1e3, ntc25: 1e4, beta: 3950,
  /** Every join leaks this much to ground (10 MΩ), so nothing floats. */
  gmin: 1e-7,
};

export interface CircuitDef { parts: CircuitPart[]; wires: GridPt[][] }
/** One situation to solve: switches and buttons, light on light sensors (0–1), temperatures (°C), output pins (1 high). */
export interface CircuitState {
  closed?: Record<string, boolean | number>;
  light?: Record<string, number>;
  temp?: Record<string, number>;
  pins?: Record<string, number>;
  /** Parts that have failed (a burnt-out LED): they conduct nothing. */
  broken?: string[];
}
export interface Solved {
  frame: CircuitFrame;
  /** Volts at each grid point ("c,r"), from ground. */
  volts: Record<string, number>;
  /** mA through each part, from a to b (a pin's: out of the pin). */
  mA: Record<string, number>;
}

/** Volts as a learner reads them: "3.3 V", "0.3 V", "12 V". */
export const fmtV = (v: number): string => (Math.abs(v) < 0.05 ? "0 V" : `${Math.abs(v) < 10 ? Math.abs(v).toFixed(1) : Math.round(Math.abs(v))} V`);
/** Current: "0.42 mA", "5.9 mA", "10 mA", "1.2 A". */
export function fmtI(mA: number): string {
  const a = Math.abs(mA);
  if (a >= 1000) return `${(a / 1000).toFixed(a >= 10000 ? 0 : 1)} A`;
  if (a >= 9.95) return `${Math.round(a)} mA`;
  if (a >= 1) return `${a.toFixed(1)} mA`;
  return a < 0.005 ? "0 mA" : `${a.toFixed(2)} mA`;
}
/** Resistance: "220 Ω", "4.7 kΩ", "10 kΩ", "1 MΩ". */
export function fmtR(ohm: number): string {
  const k = (v: number): string => (v < 10 ? String(Math.round(v * 10) / 10) : String(Math.round(v)));
  if (ohm >= 1e6) return `${k(ohm / 1e6)} MΩ`;
  if (ohm >= 1000) return `${k(ohm / 1000)} kΩ`;
  return `${k(ohm)} Ω`;
}

/** A light sensor's ohms (light 0 dark … 1 bright) and a thermistor's (°C). */
export const ldrOhms = (light: number): number => MODEL.ldrDark * (MODEL.ldrBright / MODEL.ldrDark) ** clamp(light);
export const ntcOhms = (c: number): number => MODEL.ntc25 * Math.exp(MODEL.beta * (1 / (c + 273.15) - 1 / 298.15));

/** Solves a small dense system A x = b (Gaussian elimination with partial pivoting). */
function solveLinear(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]!]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r]![c]!) > Math.abs(M[p]![c]!)) p = r;
    [M[c], M[p]] = [M[p]!, M[c]!];
    const d = M[c]![c]!;
    if (Math.abs(d) < 1e-300) continue;
    for (let r = c + 1; r < n; r++) {
      const f = M[r]![c]! / d;
      if (f) for (let k = c; k <= n; k++) M[r]![k]! -= f * M[c]![k]!;
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r]![n]!;
    for (let k = r + 1; k < n; k++) s -= M[r]![k]! * x[k]!;
    x[r] = Math.abs(M[r]![r]!) < 1e-300 ? 0 : s / M[r]![r]!;
  }
  return x;
}

const keyOf = (p: readonly number[]): string => `${p[0]},${p[1]}`;
const ptOf = (k: string): number[] => k.split(",").map(Number);

/**
 * Works out every moment of a circuit: node voltages by nodal analysis (batteries and pins as sources with a little
 * resistance, LEDs as forward voltages, found by switching each on or off until it agrees), the current in each part,
 * then in each wire segment (Kirchhoff's current law at every join; a loop of bare wire shares it evenly). Returns the
 * element's frame for each state, with the volts and currents for checking.
 */
export function solveCircuit(def: CircuitDef, states: CircuitState[] = [{}]): Solved[] {
  const pts = new Set<string>(["GND"]);
  const segs: { a: string; b: string; w: number; k: number }[] = [];
  def.wires.forEach((w, wi) => w.forEach((p, k) => {
    pts.add(keyOf(p));
    if (k) segs.push({ a: keyOf(w[k - 1]!), b: keyOf(p), w: wi, k: k - 1 });
  }));
  for (const p of def.parts) { pts.add(keyOf(p.a)); if (p.b) pts.add(keyOf(p.b)); }
  // A join is at a corner or an end of a wire, never in the middle of a straight run.
  for (const s of segs) {
    const [ax, ay] = ptOf(s.a) as [number, number];
    const [bx, by] = ptOf(s.b) as [number, number];
    for (const k of pts) {
      if (k === "GND") continue;
      const [x, y] = ptOf(k) as [number, number];
      const inside = ax === bx ? x === ax && y > Math.min(ay, by) && y < Math.max(ay, by) : y === ay && x > Math.min(ax, bx) && x < Math.max(ax, bx);
      if (inside) throw new Error(`circuit: wire ${s.w + 1} runs straight through (${x}, ${y}), where something else connects; give the wire a point there`);
    }
  }
  const grounds = def.parts.filter((p) => p.kind === "ground");
  for (const g of grounds) segs.push({ a: "GND", b: keyOf(g.a), w: -1, k: -1 });
  if (!grounds.length) {
    if (def.parts.some((p) => p.kind === "pin")) throw new Error("circuit: pins need a ground part for the current to come back through");
    const bat = def.parts.find((p) => p.kind === "battery");
    if (bat) segs.push({ a: "GND", b: keyOf(bat.b!), w: -1, k: -1 });
  }
  // Nets: points joined by wires.
  const up = new Map<string, string>([...pts].map((k) => [k, k]));
  const find = (k: string): string => { while (up.get(k) !== k) { up.set(k, up.get(up.get(k)!)!); k = up.get(k)!; } return k; };
  for (const s of segs) up.set(find(s.a), find(s.b));
  const roots = [...new Set([...pts].map(find))];
  const gnd = find("GND");
  const row = new Map<string, number>();
  for (const r of roots) if (r !== gnd) row.set(r, row.size);
  const netRow = (k: string): number => row.get(find(k)) ?? -1;
  const m = row.size;

  const vf = (p: CircuitPart): number => (p.value ?? MODEL.vf[p.color ?? "red"]!) - 0.01 * MODEL.ledOhm;
  const ohmsOf = (p: CircuitPart, st: CircuitState): number => {
    switch (p.kind) {
      case "ldr": return ldrOhms(st.light?.[p.id] ?? 0.5);
      case "thermistor": return ntcOhms(st.temp?.[p.id] ?? 25);
      case "lamp": return p.value ?? MODEL.lamp;
      case "buzzer": return p.value ?? MODEL.buzzer;
      case "motor": return p.value ?? MODEL.motor;
      default: return p.value ?? MODEL.resistor;
    }
  };

  return states.map((st) => {
    const isClosed = (id: string): boolean => { const v = st.closed?.[id]; return v === true || (typeof v === "number" && v >= 0.5); };
    const broken = new Set(st.broken ?? []);
    const lit = new Map(def.parts.filter((p) => p.kind === "led").map((p) => [p.id, !broken.has(p.id)]));
    const level = (p: CircuitPart): number => (p.mode === "in" ? 0 : st.pins?.[p.id] ?? 1);
    /** Each part as a branch from a to b: I = g · (Va − Vb − v); null when it conducts nothing. */
    const branch = (p: CircuitPart): { a: string; b: string; g: number; v: number } | null => {
      const a = keyOf(p.a);
      const b = p.b ? keyOf(p.b) : "GND";
      if (broken.has(p.id)) return null;
      switch (p.kind) {
        case "battery": return { a, b, g: 1 / MODEL.batteryOhm, v: p.value ?? MODEL.battery };
        case "pin": return p.mode === "in" ? null : { a, b, g: 1 / MODEL.pinOhm, v: level(p) * (p.value ?? MODEL.pin) };
        case "switch": case "button": return isClosed(p.id) ? { a, b, g: 1 / MODEL.switchOhm, v: 0 } : null;
        case "led": return lit.get(p.id) ? { a, b, g: 1 / MODEL.ledOhm, v: vf(p) } : null;
        case "ground": return null;
        default: return { a, b, g: 1 / ohmsOf(p, st), v: 0 };
      }
    };
    let V = new Map<string, number>();
    for (let round = 0; round < 40; round++) {
      const G = Array.from({ length: m }, () => new Array<number>(m).fill(0));
      const J = new Array<number>(m).fill(MODEL.gmin * 0);
      for (let i = 0; i < m; i++) G[i]![i] = MODEL.gmin;
      for (const p of def.parts) {
        const br = branch(p);
        if (!br) continue;
        const ia = netRow(br.a), ib = netRow(br.b);
        if (ia >= 0) { G[ia]![ia]! += br.g; J[ia]! += br.g * br.v; }
        if (ib >= 0) { G[ib]![ib]! += br.g; J[ib]! -= br.g * br.v; }
        if (ia >= 0 && ib >= 0) { G[ia]![ib]! -= br.g; G[ib]![ia]! -= br.g; }
      }
      const x = solveLinear(G, J);
      V = new Map([...pts].map((k) => [k, netRow(k) >= 0 ? x[netRow(k)]! : 0]));
      let changed = false;
      for (const p of def.parts) {
        if (p.kind !== "led" || broken.has(p.id)) continue;
        const d = V.get(keyOf(p.a))! - V.get(keyOf(p.b!))!;
        const on = lit.get(p.id)!;
        if (on && d < vf(p) - 1e-9) { lit.set(p.id, false); changed = true; break; }
        if (!on && d > vf(p) + 1e-6) { lit.set(p.id, true); changed = true; break; }
      }
      if (!changed) break;
    }
    // Currents in the parts, then in the wires: what each part sends into a point leaves it along the wires.
    const mA: Record<string, number> = {};
    const inj = new Map<string, number>([...pts].map((k) => [k, 0]));
    for (const p of def.parts) {
      const br = branch(p);
      const i = br ? br.g * (V.get(br.a)! - V.get(br.b)! - br.v) : 0;
      mA[p.id] = r3(i * 1000);
      if (br) { inj.set(br.a, inj.get(br.a)! - i); inj.set(br.b, inj.get(br.b)! + i); }
    }
    const segI = new Array<number>(segs.length).fill(0);
    for (const r of roots) {
      const mine = [...pts].filter((k) => find(k) === r);
      if (mine.length < 2) continue;
      const at = new Map(mine.map((k, i) => [k, i]));
      const n = mine.length - 1;
      const L = Array.from({ length: n }, () => new Array<number>(n).fill(0));
      const b = mine.slice(1).map((k) => inj.get(k)!);
      const list = segs.map((s, i) => [s, i] as const).filter(([s]) => at.has(s.a));
      for (const [s] of list) {
        const ia = at.get(s.a)! - 1, ib = at.get(s.b)! - 1;
        if (ia >= 0) L[ia]![ia]! += 1;
        if (ib >= 0) L[ib]![ib]! += 1;
        if (ia >= 0 && ib >= 0) { L[ia]![ib]! -= 1; L[ib]![ia]! -= 1; }
      }
      const phi = [0, ...solveLinear(L, b)];
      for (const [s, i] of list) segI[i] = phi[at.get(s.a)!]! - phi[at.get(s.b)!]!;
    }

    const frame: CircuitFrame = {};
    const put = <K extends keyof CircuitFrame>(k: K, id: string, v: NonNullable<CircuitFrame[K]> extends Record<string, infer T> ? T : never): void => {
      ((frame[k] ??= {} as never) as Record<string, unknown>)[id] = v;
    };
    const over: string[] = [];
    for (const p of def.parts) {
      const i = Math.abs(mA[p.id]!);
      const across = p.b ? Math.abs(V.get(keyOf(p.a))! - V.get(keyOf(p.b))!) : V.get(keyOf(p.a))!;
      switch (p.kind) {
        case "switch": case "button": put("closed", p.id, isClosed(p.id) ? 1 : 0); break;
        case "led":
          put("on", p.id, broken.has(p.id) ? 0 : r2(i < 0.05 ? 0 : clamp(Math.sqrt(i / MODEL.ledFull))));
          if (i > MODEL.ledMax || broken.has(p.id)) over.push(p.id);
          break;
        case "lamp": put("on", p.id, r2(clamp((across / (p.value ? 3 : MODEL.battery)) ** 2))); break;
        case "buzzer": put("on", p.id, i < 2 ? 0 : r2(clamp(i / 15))); break;
        case "motor": put("on", p.id, r2(clamp(i / 150))); break;
        case "ldr": put("sense", p.id, r2(clamp(st.light?.[p.id] ?? 0.5))); break;
        case "thermistor": put("sense", p.id, r2(clamp((st.temp?.[p.id] ?? 25) / 50))); break;
        case "pin": put("pins", p.id, p.mode === "in" ? (across > (p.value ?? MODEL.pin) / 2 ? 1 : 0) : level(p)); break;
      }
      if (p.show?.length) {
        const ohms = p.kind === "ldr" || p.kind === "thermistor" || p.kind === "resistor" || p.kind === "lamp" || p.kind === "buzzer" || p.kind === "motor" ? ohmsOf(p, st) : 0;
        put("values", p.id, p.show.map((s) => (s === "V" ? fmtV(across) : s === "I" ? fmtI(i) : fmtR(ohms))).join(", "));
      }
    }
    if (def.wires.length) frame.flow = def.wires.map((w, wi) => w.slice(1).map((_, k) => r2(1000 * segI[segs.findIndex((s) => s.w === wi && s.k === k)]!) || 0));
    if (over.length) frame.over = over;
    return { frame, volts: Object.fromEntries([...V].map(([k, v]) => [k, r3(v)])), mA };
  });
}

/** A circuit element with a frame for each state. */
export function circuit(box: Box, def: CircuitDef, states: CircuitState[] = [{}], o: { speed?: number } = {}): CircuitElement {
  return { ...box, type: "circuit", parts: def.parts, wires: def.wires, frames: solveCircuit(def, states).map((s) => s.frame), ...(o.speed ? { speed: o.speed } : {}) };
}

export type CircuitPreset = "torch" | "led" | "button-buzzer" | "series" | "parallel" | "and" | "or" | "pin-led" | "light-sensor" | "thermistor";
export const CIRCUIT_PRESETS: CircuitPreset[] = ["torch", "led", "button-buzzer", "series", "parallel", "and", "or", "pin-led", "light-sensor", "thermistor"];

/**
 * Ready-made circuits, labelled in English and Arabic. Ids: `bat`, `sw` (`a` and `b` for two switches), `btn`, `r`,
 * `led`, `lamp` (`l1`, `l2`), `buz`, `ldr`, `th`, and pins by their names (`gp15`, `gp26`, `gp27`, `v33`).
 * Options: a battery's `volts`, a resistor's `ohms`, an LED's `color`, and `resistor: false` to leave it out.
 */
export function circuitDef(name: CircuitPreset, langs: string[] = ["en", "ar"], o: { volts?: number; ohms?: number; color?: CircuitPart["color"]; resistor?: boolean } = {}): CircuitDef {
  const T = (en: string, ar: string): Text => tx(en, ar, langs);
  const volts = o.volts ?? 3;
  const bat: CircuitPart = { id: "bat", kind: "battery", a: [0, 0], b: [0, 2], label: T(`${volts} V`, `${volts} V`), value: volts, side: "left" };
  const sw = (id: string, a: GridPt, b: GridPt, en = "switch", ar = "مفتاح"): CircuitPart => ({ id, kind: "switch", a, b, label: T(en, ar), side: "above" });
  const lamp = (id: string, a: GridPt, b: GridPt, side: CircuitPart["side"] = "right"): CircuitPart => ({ id, kind: "lamp", a, b, label: T("lamp", "مصباح"), side, show: ["V"] });
  const ohms = (v: number): Text => T(fmtR(v), fmtR(v));
  const pin = (id: string, label: string, a: GridPt, side: CircuitPart["side"], mode: "out" | "in" = "out"): CircuitPart =>
    ({ id, kind: "pin", a, label: T(label, label), side, ...(mode === "in" ? { mode, show: ["V"] as ("V" | "I" | "R")[] } : {}) });
  switch (name) {
    case "torch":
      return { parts: [bat, sw("sw", [1, 0], [3, 0]), lamp("lamp", [4, 0], [4, 2])], wires: [[[0, 0], [1, 0]], [[3, 0], [4, 0]], [[4, 2], [0, 2]]] };
    case "led": {
      const r = o.ohms ?? 100;
      const led: CircuitPart = { id: "led", kind: "led", a: [5, 0], b: [5, 2], label: T("LED", "LED"), side: "right", color: o.color ?? "red", show: ["V", "I"] };
      if (o.resistor === false) return { parts: [bat, sw("sw", [1, 0], [2, 0]), led], wires: [[[0, 0], [1, 0]], [[2, 0], [5, 0]], [[5, 2], [0, 2]]] };
      return {
        parts: [bat, sw("sw", [1, 0], [2, 0]), { id: "r", kind: "resistor", a: [3, 0], b: [4, 0], label: ohms(r), value: r, side: "above", show: ["V"] }, led],
        wires: [[[0, 0], [1, 0]], [[2, 0], [3, 0]], [[4, 0], [5, 0]], [[5, 2], [0, 2]]],
      };
    }
    case "button-buzzer":
      return {
        parts: [bat, { id: "btn", kind: "button", a: [1, 0], b: [3, 0], label: T("button", "زر"), side: "above" }, { id: "buz", kind: "buzzer", a: [4, 0], b: [4, 2], label: T("buzzer", "جرس"), side: "right" }],
        wires: [[[0, 0], [1, 0]], [[3, 0], [4, 0]], [[4, 2], [0, 2]]],
      };
    case "series":
      return {
        parts: [bat, sw("sw", [1, 0], [2, 0]), lamp("l1", [3, 0], [4, 0], "above"), lamp("l2", [5, 0], [5, 2])],
        wires: [[[0, 0], [1, 0]], [[2, 0], [3, 0]], [[4, 0], [5, 0]], [[5, 2], [0, 2]]],
      };
    case "parallel":
      return {
        parts: [bat, sw("sw", [1, 0], [2, 0]), lamp("l1", [3, 0], [3, 2], "left"), lamp("l2", [5, 0], [5, 2])],
        wires: [[[0, 0], [1, 0]], [[2, 0], [3, 0], [5, 0]], [[5, 2], [3, 2], [0, 2]]],
      };
    case "and":
      return {
        parts: [bat, sw("a", [1, 0], [2, 0], "A", "A"), sw("b", [3, 0], [4, 0], "B", "B"), lamp("lamp", [5, 0], [5, 2])],
        wires: [[[0, 0], [1, 0]], [[2, 0], [3, 0]], [[4, 0], [5, 0]], [[5, 2], [0, 2]]],
      };
    case "or":
      return {
        parts: [{ ...bat, b: [0, 3] }, sw("a", [1, 0], [3, 0], "A", "A"), { ...sw("b", [1, 1], [3, 1], "B", "B"), side: "below" }, lamp("lamp", [4, 0], [4, 3])],
        wires: [[[0, 0], [1, 0], [1, 1]], [[3, 1], [3, 0], [4, 0]], [[4, 3], [0, 3]]],
      };
    case "pin-led": {
      const r = o.ohms ?? 220;
      return {
        parts: [pin("gp15", "GP15", [0, 0], "left"), { id: "r", kind: "resistor", a: [0, 0], b: [2, 0], label: ohms(r), value: r, side: "above" },
          { id: "led", kind: "led", a: [3, 0], b: [3, 2], label: T("LED", "LED"), side: "right", color: o.color ?? "red", show: ["I"] }, { id: "gnd", kind: "ground", a: [3, 2] }],
        wires: [[[2, 0], [3, 0]]],
      };
    }
    case "light-sensor":
      return {
        parts: [
          pin("v33", "3V3", [0, 0], "above"),
          { id: "ldr", kind: "ldr", a: [0, 0], b: [0, 1], label: T("LDR", "LDR"), side: "left", show: ["R"] },
          { id: "r", kind: "resistor", a: [0, 1], b: [0, 2], label: ohms(10000), value: 10000, side: "left" },
          { id: "g1", kind: "ground", a: [0, 2] },
          pin("gp26", "GP26", [1, 1], "right", "in"),
          pin("gp15", "GP15", [4, 0], "above"),
          { id: "r2", kind: "resistor", a: [4, 0], b: [4, 1], label: ohms(220), value: 220, side: "right" },
          { id: "led", kind: "led", a: [4, 1], b: [4, 2], label: T("LED", "LED"), side: "right", color: o.color ?? "yellow" },
          { id: "g2", kind: "ground", a: [4, 2] },
        ],
        wires: [[[0, 1], [1, 1]]],
      };
    case "thermistor":
      return {
        parts: [
          pin("v33", "3V3", [0, 0], "above"),
          { id: "r", kind: "resistor", a: [0, 0], b: [0, 1], label: ohms(10000), value: 10000, side: "left" },
          { id: "th", kind: "thermistor", a: [0, 1], b: [0, 2], label: T("thermistor", "ثرمستور"), side: "left", show: ["R"] },
          { id: "g1", kind: "ground", a: [0, 2] },
          pin("gp27", "GP27", [1, 1], "right", "in"),
        ],
        wires: [[[0, 1], [1, 1]]],
      };
  }
}

/**
 * The same circuit turned for a tall stage: columns become rows (a reflection across the diagonal, so nothing reads
 * backwards and the wiring is unchanged). Labels move with their parts: above becomes left, below becomes right.
 */
export function transposeCircuit(def: CircuitDef): CircuitDef {
  const t = (p: GridPt): GridPt => [p[1], p[0]];
  const side = { above: "left", below: "right", left: "above", right: "below" } as const;
  return {
    parts: def.parts.map((p) => ({ ...p, a: t(p.a), ...(p.b ? { b: t(p.b) } : {}), ...(p.side ? { side: side[p.side] } : {}) })),
    wires: def.wires.map((w) => w.map(t)),
  };
}

/* ---------- signals ---------- */

/** A reading as a function of time: a JavaScript function, or an expression in `x` (the time), like the plot's. */
export type Reading = ((t: number) => number) | string;
const fnOf = (f: Reading): ((t: number) => number) => {
  if (typeof f !== "string") return f;
  const g = compileExpr(f);
  return (t) => g(t, []);
};

/**
 * Samples a reading: the curve itself (`points` points across `xr`), and a sample every 1/`rate` time units. With
 * `noise`, each sample gets seeded noise of that size (a real sensor's jitter); `bits` adds an ADC over lo…hi
 * (default the value range `yr`).
 */
export function sampleSignal(fn: Reading, rate: number, bits: number | undefined, o: { xr: [number, number]; yr: [number, number]; points?: number; noise?: number; seed?: number; lo?: number; hi?: number }): Pick<SignalElement, "xr" | "yr" | "curve" | "samples" | "adc"> {
  const f = fnOf(fn);
  const [t0, t1] = o.xr;
  const n = Math.min(400, o.points ?? 160);
  const curve = Array.from({ length: n + 1 }, (_, i): [number, number] => { const t = t0 + ((t1 - t0) * i) / n; return [r3(t), r3(f(t))]; });
  const r = rng(o.seed ?? 11);
  const samples: [number, number][] = [];
  for (let k = 0; ; k++) {
    const t = t0 + k / rate;
    if (t > t1 + 1e-9 || samples.length >= 120) break;
    samples.push([r3(t), r3(f(t) + (o.noise ? (r() * 2 - 1) * o.noise : 0))]);
  }
  return { xr: o.xr, yr: o.yr, curve, samples, ...(bits ? { adc: { bits, ...(o.lo !== undefined ? { lo: o.lo } : {}), ...(o.hi !== undefined ? { hi: o.hi } : {}) } } : {}) };
}

/** What an ADC with `bits` bits reads for a value in lo…hi: the whole number (0 … 2ⁿ − 1). */
export const adcCode = (v: number, bits: number, lo: number, hi: number): number => Math.round(clamp((v - lo) / (hi - lo)) * (2 ** bits - 1));

/**
 * The digital output a program makes from samples: on at or above `on`, off at or below `off` (default `on`: one
 * threshold, which flickers with noise; two thresholds, hysteresis, don't). Returns the changes: [time, 0 or 1].
 */
export function thresholdOut(samples: [number, number][], on: number, off: number = on): [number, number][] {
  let state = 0;
  const out: [number, number][] = [];
  for (const [t, v] of samples) {
    const was = state;
    if (state === 0 && (off === on ? v > on : v >= on)) state = 1;
    else if (state === 1 && (off === on ? v <= on : v <= off)) state = 0;
    if (!out.length || state !== was) out.push([t, state]);
  }
  return out;
}

/** A trailing moving average over `k` samples. */
export function movingAverage(samples: [number, number][], k: number): [number, number][] {
  return samples.map(([t], i) => {
    const w = samples.slice(Math.max(0, i - k + 1), i + 1);
    return [t, r3(w.reduce((a, p) => a + p[1], 0) / w.length)];
  });
}

/* ---------- logic and bits ---------- */

/** Every combination of `n` inputs in truth-table order (00, 01, 10, 11), or the rows given. */
export function gateFrames(n: number, rows?: number[][]): number[][] {
  if (rows) return rows.map((r) => r.map((b) => (b ? 1 : 0)));
  return Array.from({ length: 2 ** n }, (_, v) => Array.from({ length: n }, (_, i) => (v >> (n - 1 - i)) & 1));
}

/** The value of every input, gate and output for one row of inputs. */
export function evalGates(el: Pick<GatesElement, "inputs" | "gates" | "outputs">, row: number[]): Record<string, number> {
  const v: Record<string, number> = {};
  el.inputs.forEach((x, i) => { v[x.id] = row[i] ? 1 : 0; });
  for (const g of el.gates) {
    const a = g.in.map((s) => v[s] ?? 0);
    const and = a.every(Boolean), or = a.some(Boolean), x = a.reduce((p, q) => p ^ q, 0);
    v[g.id] = Number({ and, or, not: !a[0], xor: !!x, nand: !and, nor: !or }[g.kind]);
  }
  for (const o of el.outputs) v[o.id] = v[o.from] ?? 0;
  return v;
}

/** Values for a register: the bits it needs (at least `n`), checked. */
export function bitsFrames(values: number[], n?: number): { n: number; frames: number[] } {
  const most = Math.max(0, ...values);
  const need = Math.max(1, Math.ceil(Math.log2(most + 1)));
  const bits = n ?? need;
  if (bits < need || bits > 16) throw new Error(`bits: ${most} needs ${need} bits (at most 16)`);
  for (const v of values) if (!Number.isInteger(v) || v < 0) throw new Error(`bits: ${v} is not a whole number from 0`);
  return { n: bits, frames: values };
}

/** The bytes of a text in UTF-8: a Latin letter takes one, an Arabic letter two. */
export const textBytes = (s: string): number[] => [...new TextEncoder().encode(s)];

/* ---------- tracks ---------- */

/**
 * The current's clock for circuits (and running buzzers and motors): `pass` runs from 0 at the scene's start to
 * `seconds` at its end, so about one per second when `seconds` is the scene's length (keyframe times stop at the
 * scene's end, so the clock can't simply count). `sceneSeconds` estimates it from the narration.
 */
export const flowClock = (seconds = 15): Track => ({ prop: "pass", keys: [{ at: 0, value: 0 }, { at: 600, value: Math.round(seconds * 10) / 10, ease: "linear" }] });
/** How long a scene's narration takes, estimated, in English if it has English (else its first language). */
export function sceneSeconds(narration: Text, lang = "en"): number {
  const n = typeof narration === "string" ? { [lang]: narration } : narration;
  const l = lang in n ? lang : Object.keys(n)[0]!;
  return estimateTiming([{ id: "s", template: "canvas", narration: n, content: { elements: [] } }], l).duration;
}
/** A property that moves to each value at its moment, over `blend` seconds (0: a jump). */
export function stepTrack(prop: AnimProp, list: { at: When; value: number }[], from = 0, blend = 0.4): Track {
  const keys: Track["keys"] = blend > 0 ? [] : [{ at: 0, value: from }];
  let prev = from;
  for (const k of list) {
    if (blend > 0) keys.push({ at: k.at, value: prev }, { at: shift(k.at, blend), value: k.value, ease: "in-out" });
    else keys.push({ at: k.at, value: k.value, ease: "step" });
    prev = k.value;
  }
  return { prop, keys };
}
/** `reveal` from 0 to 1 between two moments. */
export const revealTrack = (from: When, to: When): Track => ({ prop: "reveal", keys: [{ at: from, value: 0 }, { at: to, value: 1, ease: "linear" }] });

/* ---------- builders ---------- */

export function pinout(box: Box, board: PinoutElement["board"], o: { pins?: string[]; parts?: PinoutPart[]; frames?: PinoutFrame[]; name?: Text } = {}): PinoutElement {
  return { ...box, type: "pinout", board, ...(o.name ? { name: o.name } : {}), ...(o.pins ? { pins: o.pins } : {}), ...(o.parts ? { parts: o.parts } : {}), ...(o.frames ? { frames: o.frames } : {}) };
}

export function gates(box: Box, net: Pick<GatesElement, "inputs" | "gates" | "outputs">, frames: number[][] = gateFrames(net.inputs.length), table = true): GatesElement {
  return { ...box, type: "gates", ...net, frames, ...(table ? { table } : {}) };
}

export function bits(box: Box, values: number[], o: { n?: number; places?: boolean; dec?: boolean; hex?: boolean; sum?: boolean; label?: Text; notes?: (Text | null)[] } = {}): BitsElement {
  const b = bitsFrames(values, o.n);
  return { ...box, type: "bits", n: b.n, frames: b.frames, ...Object.fromEntries(Object.entries(o).filter(([k, v]) => k !== "n" && v !== undefined)) };
}

/** A temperature reading over a school day (8:00 to 16:00): sampled every 10 minutes, with a fan on above 30 °C, off below 28 °C. */
export function classroomDay(box: Box, langs: string[] = ["en", "ar"], o: { hysteresis?: boolean; noise?: number } = {}): SignalElement {
  const s = sampleSignal((t) => 24 + 8.5 * Math.exp(-(((t - 13.4) / 2.6) ** 2)), 6, undefined, { xr: [8, 16], yr: [20, 36], noise: o.noise ?? 0.6, seed: 4 });
  const [on, off] = o.hysteresis === false ? [30, 30] : [30, 28];
  return {
    ...box, type: "signal", ...s, unit: "°C",
    xLabel: tx("time (hours)", "الوقت (بالساعات)", langs), yLabel: tx("°C", "°C", langs),
    threshold: on === off ? on : [on, off], out: thresholdOut(s.samples!, on, off), outLabel: tx("fan", "المروحة", langs), readout: "value",
  };
}

/** A default element of each type, for "Add a pack element". */
export function element(type: "circuit" | "pinout" | "signal" | "gates" | "bits", langs: string[] = ["en", "ar"], box: Box = { id: type, x: 80, y: 160, w: 1120, h: 500 }): Element {
  const T = (en: string, ar: string): Text => tx(en, ar, langs);
  switch (type) {
    case "circuit": return circuit(box, circuitDef("led", langs), [{}, { closed: { sw: true } }]);
    case "pinout": return pinout(box, "pico", { pins: ["GP15"], parts: [{ id: "led", kind: "led", pin: "GP15", res: "220 Ω", label: T("LED", "LED") }], frames: [{ pins: { GP15: 0 } }, { pins: { GP15: 1 }, on: { led: 1 } }] });
    case "signal": return classroomDay(box, langs);
    case "gates": return gates(box, { inputs: [{ id: "a", label: T("A", "A") }, { id: "b", label: T("B", "B") }], gates: [{ id: "g", kind: "and", in: ["a", "b"] }], outputs: [{ id: "q", from: "g", label: T("lamp", "المصباح") }] });
    case "bits": return bits(box, [0, 1, 2, 65], { n: 8, sum: true });
  }
}

/* ---------- gallery scenes ---------- */

const STAGES: Record<Orient, [number, number]> = { landscape: [1280, 720], portrait: [720, 1280], square: [1080, 1080] };

/** Gallery scenes for the studio: an id, a name per language, and a scene laid out inside the stage. */
export function presets(langs: string[] = ["en", "ar"], stage: Orient = "landscape"): { id: string; name: Text; scene: Scene }[] {
  const [W, H] = STAGES[stage];
  const T = (en: string, ar: string): Text => tx(en, ar, langs);
  const word = (en: string, ar: string, offset = 0, occurrence?: number): When => ({ word: T(en, ar), ...(occurrence ? { occurrence } : {}), ...(offset ? { offset } : {}) });
  const tall = H > W;
  const head = (en: string, ar: string): Element => {
    const el: Element = { id: "h", type: "text", x: 60, y: 44, w: W - 120, size: tall ? 44 : 48, weight: 800, text: T(en, ar) };
    return { ...el, anim: presetKeys(el, "rise", 0.1) };
  };
  /** The body under the headline; a tall stage gives a squarer box, centred. */
  const body = (id: string, aspect = 0): Box => {
    const y = tall ? 200 : 140;
    let h = H - y - 40;
    const w = W - 80;
    if (aspect && h > w / aspect) { const h2 = Math.round(w / aspect); return { id, x: 40, y: y + Math.round((h - h2) / 2), w, h: h2 }; }
    h = Math.max(200, h);
    return { id, x: 40, y, w, h };
  };
  /** A gallery scene; `flowClock()` placeholders get the scene's estimated length. */
  const turn = (d: CircuitDef): CircuitDef => (tall ? transposeCircuit(d) : d);
  const cbox = (id: string, aspect: number): Box => body(id, tall ? 1 / aspect : aspect);
  const scene = (id: string, name: Text, narration: Text, elements: Element[]): { id: string; name: Text; scene: Scene } => {
    const secs = Math.round(sceneSeconds(narration) * 10) / 10;
    const timed = elements.map((el) => (el.anim ? { ...el, anim: el.anim.map((t) => (t.prop === "pass" && t.keys[1]?.at === 600 ? flowClock(secs) : t)) } : el));
    return { id, name, scene: { id, template: "canvas", narration: narration as Record<string, string>, content: { elements: timed } } };
  };
  const show = (at: When, dur = 1): Track => revealTrack(at, shift(at, dur));
  const withAnim = <E extends Element>(el: E, ...tracks: Track[]): E => ({ ...el, anim: tracks });

  const out: { id: string; name: Text; scene: Scene }[] = [];

  // 1. A closed loop: the torch.
  out.push(scene("iot-loop", T("A closed loop", "حلقة مغلقة"),
    T("A torch is a battery, a switch and a lamp in one loop. Close the switch, and current flows round the loop: the lamp lights. Open it, and the flow stops everywhere.",
      "المصباح اليدوي بطارية ومفتاح ومصباح في حلقة واحدة. أغلق المفتاح فيسري التيار في الحلقة ويضيء المصباح. افتحه فيتوقف السريان في كل مكان."),
    [head("Current needs a closed loop", "التيار يحتاج إلى حلقة مغلقة"),
      withAnim(circuit(cbox("c", 2.2), turn(circuitDef("torch", langs)), [{}, { closed: { sw: true } }, {}]),
        show(0.3, 1.4), stepTrack("frame", [{ at: word("Close", "أغلق"), value: 1 }, { at: word("Open", "افتحه"), value: 2 }]), flowClock())]));

  // 2. An LED and its resistor.
  out.push(scene("iot-led", T("An LED and its resistor", "ثنائي LED ومقاومته"),
    T("An LED needs a resistor. Close the switch: the resistor takes one volt, the LED takes the other two, and ten milliamps flow. That's just right.",
      "يحتاج الثنائي الباعث للضوء إلى مقاومة. أغلق المفتاح: تأخذ المقاومة فولتًا واحدًا، ويأخذ الثنائي فولتين، فيسري عشرة ملّي أمبير. هذا هو المقدار المناسب."),
    [head("An LED needs a resistor", "الثنائي يحتاج إلى مقاومة"),
      withAnim(circuit(cbox("c", 2.2), turn(circuitDef("led", langs)), [{}, { closed: { sw: true } }]),
        show(0.3, 1.4), stepTrack("frame", [{ at: word("Close", "أغلق"), value: 1 }]),
        stepTrack("focus", [{ at: word("volt", "فولتًا"), value: 3 }, { at: word("two", "فولتين"), value: 4 }, { at: word("right", "المناسب"), value: 0 }], 0, 0), flowClock())]));

  // 3. Without the resistor.
  out.push(scene("iot-no-resistor", T("Too much current", "تيار أكثر من اللازم"),
    T("Take the resistor out, and nothing holds the current back. Over a hundred milliamps rush through, and the LED burns out.",
      "أخرج المقاومة، ولن يبقى ما يحدّ من التيار. يندفع أكثر من مئة ملّي أمبير، فيحترق الثنائي."),
    [head("No resistor: the LED burns out", "بلا مقاومة يحترق الثنائي"),
      withAnim(circuit(cbox("c", 2.2), turn(circuitDef("led", langs, { resistor: false })), [{}, { closed: { sw: true } }, { closed: { sw: true }, broken: ["led"] }]),
        show(0.3, 1.2), stepTrack("frame", [{ at: word("rush", "يندفع"), value: 1 }, { at: word("burns", "فيحترق"), value: 2 }], 0, 0.3), flowClock())]));

  // 4. Series and parallel.
  out.push(scene("iot-parallel", T("Lamps side by side", "مصباحان متوازيان"),
    T("Two lamps side by side each get the battery's full three volts, so both shine brightly. The battery gives twice the current, and runs down twice as fast.",
      "يأخذ كل من المصباحين المتوازيين فولتات البطارية الثلاثة كاملة، فيضيء كلاهما بقوة. وتعطي البطارية ضعف التيار، فتفرغ أسرع بمرتين."),
    [head("Two lamps in parallel", "مصباحان على التوازي"),
      withAnim(circuit(cbox("c", 2.2), turn(circuitDef("parallel", langs)), [{}, { closed: { sw: true } }]),
        show(0.3, 1.2), stepTrack("frame", [{ at: word("lamps", "المصباحين"), value: 1 }]), stepTrack("focus", [{ at: word("twice", "ضعف"), value: 1 }], 0, 0), flowClock())]));

  // 5. A light sensor read by a pin; the program lights the lamp in the dark.
  out.push(scene("iot-light", T("A light-activated lamp", "مصباح يعمل في الظلام"),
    T("A light sensor's resistance falls in bright light. In daylight the input reads high, so the program keeps the lamp off. When it gets dark, the reading drops, and the program switches the LED on.",
      "تقلّ مقاومة حسّاس الضوء في الضوء الساطع. في النهار تقرأ المدخلة قيمة عالية، فيُبقي البرنامج المصباح مطفأً. وعندما يحلّ الظلام تنخفض القراءة، فيشغّل البرنامج الثنائي."),
    [head("Dark? The program lights the lamp", "حلّ الظلام؟ يضيء البرنامج المصباح"),
      withAnim(circuit(cbox("c", 1.5), turn(circuitDef("light-sensor", langs)), [{ light: { ldr: 1 }, pins: { v33: 1, gp15: 0 } }, { light: { ldr: 0.05 }, pins: { v33: 1, gp15: 1 } }]),
        show(0.3, 1.4), stepTrack("frame", [{ at: word("dark", "الظلام"), value: 1 }], 0, 0.8), stepTrack("focus", [{ at: word("sensor's", "حسّاس"), value: 2 }, { at: word("input", "المدخلة"), value: 5 }, { at: word("program", "البرنامج", 0, 2), value: 8 }], 0, 0), flowClock())]));

  // 6. A push button and a buzzer.
  out.push(scene("iot-buzzer", T("A push button", "زر ضغط"),
    T("A push button closes the loop only while it is held down. Press, and the buzzer sounds. Let go, and it stops.",
      "يغلق الزر الدائرة ما دمت تضغط عليه فقط. اضغط فيرنّ الجرس. اترك الزر فيتوقف."),
    [head("Only while you press", "ما دمت تضغط فقط"),
      withAnim(circuit(cbox("c", 2.2), turn(circuitDef("button-buzzer", langs)), [{}, { closed: { btn: true } }, {}]),
        show(0.3, 1.2), stepTrack("frame", [{ at: word("Press", "اضغط"), value: 1 }, { at: word("Let", "اترك"), value: 2 }], 0, 0.25), flowClock())]));

  // 7. A Pico's pins.
  const picoBox = body("board", tall ? 1.1 : 0);
  out.push(scene("iot-pico", T("A Pico's pins", "أطراف لوحة Pico"),
    T("This is a Pico. Each pin has a name. The LED is wired to pin GP15 through a resistor, and the button to GP14. When the program sets GP15 high, the LED lights.",
      "هذه لوحة Pico. لكل طرف اسم. الثنائي موصول بالطرف GP15 عبر مقاومة، والزر موصول بالطرف GP14. عندما يجعل البرنامج الطرف GP15 مرتفعًا يضيء الثنائي."),
    [head("Pins have names and jobs", "لكل طرف اسم ووظيفة"),
      withAnim(pinout(picoBox, "pico", {
        pins: ["GP15", "GP14", "GND"],
        parts: [{ id: "led", kind: "led", pin: "GP15", res: "220 Ω", label: T("LED", "LED") }, { id: "btn", kind: "button", pin: "GP14", label: T("button", "زر") }],
        frames: [{ pins: { GP15: 0 } }, { pins: { GP15: 1 }, on: { led: 1 } }],
      }), show(0.3, 1.5), stepTrack("focus", [{ at: word("GP15", "GP15"), value: 1 }, { at: word("GP14", "GP14"), value: 2 }, { at: word("high", "مرتفعًا"), value: 1 }], 0, 0),
      stepTrack("frame", [{ at: word("high", "مرتفعًا"), value: 1 }], 0, 0.3))]));

  // 8. A micro:bit.
  const heart = "0101011111111110111000100";
  out.push(scene("iot-microbit", T("A micro:bit", "لوحة micro:bit"),
    T("A micro:bit has twenty-five lights, two buttons and big pins for crocodile clips. Press button A, and the program draws a heart. Pin zero can light an LED of its own.",
      "في لوحة micro:bit خمسة وعشرون ضوءًا وزرّان وأطراف كبيرة لمشابك التمساح. اضغط الزر A فيرسم البرنامج قلبًا. ويستطيع الطرف صفر أن يضيء ثنائيًا خاصًا به."),
    [head("Lights, buttons and pins", "أضواء وأزرار وأطراف"),
      withAnim(pinout(body("board", tall ? 1.1 : 0), "microbit", {
        pins: ["0", "3V", "GND"],
        parts: [{ id: "led", kind: "led", pin: "0", res: "100 Ω", color: "green", label: T("LED", "LED") }],
        frames: [{}, { pins: { A: 1 }, matrix: heart }, { pins: { "0": 1 }, on: { led: 1 }, matrix: heart }],
      }), show(0.3, 1.5), stepTrack("frame", [{ at: word("Press", "اضغط"), value: 1 }, { at: word("own", "خاصًا"), value: 2 }], 0, 0.3),
      stepTrack("focus", [{ at: word("zero", "صفر"), value: 1 }], 0, 0))]));

  // 9. A temperature reading, sampled and thresholded with hysteresis.
  out.push(scene("iot-temperature", T("A reading and a threshold", "قراءة وعتبة"),
    T("A sensor reads the classroom's temperature every ten minutes. The program compares each reading with a threshold: the fan goes on above thirty degrees, and off only below twenty-eight. Two thresholds stop it flickering.",
      "يقرأ حسّاس حرارة الفصل كل عشر دقائق. يقارن البرنامج كل قراءة بعتبة: تعمل المروحة فوق ثلاثين درجة، ولا تتوقف إلا تحت ثمانٍ وعشرين. العتبتان تمنعانها من التذبذب."),
    [head("Fan on at 30 °C, off at 28 °C", "المروحة تعمل عند 30 درجة وتتوقف عند 28"),
      withAnim(classroomDay(body("sig"), langs), revealTrack(word("reads", "يقرأ"), word("Two", "العتبتان")),
        stepTrack("focus", [{ at: 0, value: 1 }, { at: word("every", "كل"), value: 2 }, { at: word("threshold", "بعتبة"), value: 4 }, { at: word("flickering", "التذبذب"), value: 0 }], 0, 0))]));

  // 10. An ADC with three bits.
  const adcSig = sampleSignal((t) => 1.65 + 1.4 * Math.sin(Math.PI * t), 8, 3, { xr: [0, 2], yr: [0, 3.3], lo: 0, hi: 3.3 });
  out.push(scene("iot-adc", T("An ADC's steps", "درجات المحوّل التناظري الرقمي"),
    T("An ADC turns a voltage into a whole number. With three bits it has only eight steps, so the reading jumps from step to step. Ten bits give 1024 steps, fine enough for most sensors.",
      "يحوّل المحوّل التناظري الرقمي الجهد إلى عدد صحيح. بثلاث بتات لا توجد إلا ثماني درجات، فتقفز القراءة من درجة إلى أخرى. وتعطي عشر بتات 1024 درجة، وهذا يكفي لمعظم الحساسات."),
    [head("Three bits: eight steps", "ثلاث بتات: ثماني درجات"),
      withAnim({ ...body("adc"), type: "signal", ...adcSig, unit: "V", xLabel: T("time (s)", "الزمن (ث)"), yLabel: T("volts", "فولت"), readout: "both" } as SignalElement,
        revealTrack(word("turns", "يحوّل"), word("jumps", "فتقفز", 1.5)), stepTrack("focus", [{ at: 0, value: 1 }, { at: word("number", "عدد"), value: 2 }, { at: word("eight", "ثماني"), value: 3 }], 0, 0))]));

  // 11. An AND gate and its truth table.
  out.push(scene("iot-and", T("An AND gate", "بوابة AND"),
    T("An AND gate gives 1 only when both inputs are 1. Watch the truth table fill in, row by row: only the last row lights the lamp.",
      "تعطي بوابة AND القيمة 1 فقط عندما يكون المدخلان كلاهما 1. راقب جدول الحقيقة يمتلئ صفًا بعد صف: الصف الأخير وحده يضيء المصباح."),
    [head("AND: both must be 1", "AND: يجب أن يكون كلاهما 1"),
      withAnim(gates(body("g"), { inputs: [{ id: "a", label: T("A", "A") }, { id: "b", label: T("B", "B") }], gates: [{ id: "and", kind: "and", in: ["a", "b"] }], outputs: [{ id: "lamp", from: "and", label: T("lamp", "المصباح") }] }),
        show(0.3, 1), { prop: "frame", keys: [{ at: word("Watch", "راقب"), value: 0 }, { at: word("lamp", "المصباح", 0.3), value: 3.49, ease: "linear" }] })]));

  // 12. The stair light: XOR.
  out.push(scene("iot-xor", T("The stair light", "ضوء الدرج"),
    T("A stair light has a switch at the bottom and one at the top. Flip either one, and the light changes. That's XOR: the output is 1 when the inputs differ.",
      "لضوء الدرج مفتاح في الأسفل وآخر في الأعلى. اقلب أيًّا منهما يتغيّر الضوء. هذه هي XOR: يكون الناتج 1 عندما يختلف المدخلان."),
    [head("XOR: 1 when they differ", "XOR: الناتج 1 عندما يختلفان"),
      withAnim(gates(body("g"), { inputs: [{ id: "lo", label: T("bottom", "الأسفل") }, { id: "hi", label: T("top", "الأعلى") }], gates: [{ id: "x", kind: "xor", in: ["lo", "hi"] }], outputs: [{ id: "light", from: "x", label: T("light", "الضوء") }] },
        gateFrames(2, [[0, 0], [1, 0], [1, 1], [0, 1]])),
        show(0.3, 1), { prop: "frame", keys: [{ at: word("Flip", "اقلب"), value: 0 }, { at: word("XOR", "XOR"), value: 3.49, ease: "linear" }] })]));

  // 13. A byte.
  out.push(scene("iot-byte", T("Eight bits, one byte", "ثماني بتات، بايت واحد"),
    T("Eight bits make a byte. Each bit has a place value: one, two, four, up to one hundred and twenty-eight. The letter A is stored as sixty-five: sixty-four plus one.",
      "ثماني بتات تصنع بايتًا. لكل بت قيمة منزلية: واحد، اثنان، أربعة، حتى مئة وثمانية وعشرين. يُخزَّن الحرف A على أنه خمسة وستون: أربعة وستون زائد واحد."),
    [head("Place values: 1, 2, 4 … 128", "القيم المنزلية: 1، 2، 4 … 128"),
      withAnim(bits(body("b", 3), [1, 2, 4, 128, 65], { n: 8, sum: true, label: T("1 byte", "بايت واحد"), notes: [null, null, null, null, T("the letter A", "الحرف A")] }),
        show(0.3, 1), stepTrack("frame", [{ at: word("two", "اثنان"), value: 1 }, { at: word("four", "أربعة"), value: 2 }, { at: word("hundred", "مئة"), value: 3 }, { at: word("letter", "الحرف"), value: 4 }], 0, 0.35))]));

  return out;
}
