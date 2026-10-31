/**
 * design.json bodies for the electronics and IoT pack: `circuit`, `pinout`, `signal`, `gates`, `bits`
 * (docs/packs/iot.md has every field). Everything is timed to the scene's sentences, counted from 0.
 */
import type { Element, Text, Track, When } from "../../../packages/spec/src/index.ts";
import {
  CIRCUIT_PRESETS, bits, circuit, circuitDef, flowClock, gateFrames, gates, movingAverage, pinout, revealTrack, sampleSignal, stepTrack, thresholdOut,
  type CircuitDef, type CircuitPart, type CircuitPreset, type CircuitState, type PinoutFrame, type PinoutPart, type SignalElement,
} from "../../../packages/ops/src/packs/iot.ts";
import type { AText, BodyBuilder, BodyCtx } from "./types.ts";

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const with_ = <E extends Element>(el: E, ...tracks: (Track | null)[]): E => ({ ...el, anim: tracks.filter((t): t is Track => !!t) });
/** The element comes in on sentence `s` (default 0). */
const enter = (c: BodyCtx, s: number | undefined, dur = 1.2): Track => { const at = c.at(s ?? 0, s === undefined ? 0.2 : 0); return revealTrack(at, shift(at, dur)); };
const shift = (w: When, by: number): When => (typeof w === "number" ? Math.round((w + by) * 1000) / 1000 : { ...w, offset: Math.round(((w.offset ?? 0) + by) * 1000) / 1000 });
/** From the start of sentence a to the end of sentence b (the next sentence's start, or 2.5 s after the last one starts). */
const span = (c: BodyCtx, a: number, b: number): [When, When] => [c.at(a), c.at(Math.min(b + 1, c.n - 1), b + 1 > c.n - 1 ? 2.5 : 0)];
const sentence = (c: BodyCtx, s: unknown, what: string): number => {
  if (!Number.isInteger(s) || (s as number) < 0 || (s as number) >= c.n) throw new Error(`${c.where}: ${what} needs a sentence number from 0 to ${c.n - 1}`);
  return s as number;
};
const label = (c: BodyCtx, t: AText | undefined, what: string): Text | undefined => (t === undefined ? undefined : c.T(t, what));
const focusTrack = (c: BodyCtx, list: { at: number; value: number }[] | undefined): Track | null =>
  list?.length ? stepTrack("focus", list.map((f) => ({ at: c.at(f.at), value: f.value })), 0, 0) : null;

interface CircuitSpec {
  preset?: CircuitPreset; volts?: number; ohms?: number; color?: CircuitPart["color"]; resistor?: boolean;
  parts?: (Omit<CircuitPart, "label"> & { label?: AText })[]; wires?: [number, number][][];
  /** The first state is the start; each later one comes on its sentence `s`. */
  states?: (CircuitState & { s?: number })[];
  focus?: { part: string; s: number }[];
  s?: number;
}

/** A circuit (a preset or parts and wires), solved for each state, with current flowing. */
function circuitBody(spec: unknown, c: BodyCtx): Element[] {
  if (!isObj(spec)) throw new Error(`${c.where}: circuit needs { preset } or { parts, wires }`);
  const s = spec as CircuitSpec;
  let def: CircuitDef;
  if (s.preset) {
    if (!CIRCUIT_PRESETS.includes(s.preset)) throw new Error(`${c.where}: circuit preset ${s.preset} is not one of ${CIRCUIT_PRESETS.join(", ")}`);
    def = circuitDef(s.preset, c.langs, { ...(s.volts ? { volts: s.volts } : {}), ...(s.ohms ? { ohms: s.ohms } : {}), ...(s.color ? { color: s.color } : {}), ...(s.resistor === false ? { resistor: false } : {}) });
  } else {
    if (!Array.isArray(s.parts) || !Array.isArray(s.wires)) throw new Error(`${c.where}: circuit needs a preset, or parts and wires`);
    def = { parts: s.parts.map((p, i) => ({ ...p, ...(p.label !== undefined ? { label: c.T(p.label, `circuit part ${i + 1} label`) } : {}) }) as CircuitPart), wires: s.wires };
  }
  const states = s.states?.length ? s.states : [{}];
  states.forEach((st, i) => { if (i) sentence(c, st.s, `circuit state ${i + 1}`); });
  let el;
  try {
    el = circuit({ id: "circuit", ...c.box }, def, states.map(({ s: _s, ...st }) => st));
  } catch (e) {
    throw new Error(`${c.where}: ${e instanceof Error ? e.message : String(e)}`);
  }
  const ids = def.parts.map((p) => p.id);
  const focus = s.focus?.map((f) => {
    const n = ids.indexOf(f.part);
    if (n < 0) throw new Error(`${c.where}: circuit focus names ${f.part}, not a part (${ids.join(", ")})`);
    return { at: sentence(c, f.s, "circuit focus"), value: n + 1 };
  });
  return [with_(el, enter(c, s.s, 1.4), states.length > 1 ? stepTrack("frame", states.slice(1).map((st, i) => ({ at: c.at(st.s!), value: i + 1 }))) : null, focusTrack(c, focus), flowClock(5.5 * c.n))];
}

interface PinoutSpec {
  board: "pico" | "esp32" | "microbit"; pins?: string[];
  parts?: (Omit<PinoutPart, "label"> & { label?: AText })[];
  states?: (PinoutFrame & { s?: number })[];
  focus?: { pin: string; s: number }[];
  s?: number;
}

/** A board with labelled pins and parts wired to them; states light pins and parts on their sentences. */
function pinoutBody(spec: unknown, c: BodyCtx): Element[] {
  if (!isObj(spec) || typeof spec.board !== "string") throw new Error(`${c.where}: pinout needs { board: "pico" | "esp32" | "microbit" }`);
  const s = spec as unknown as PinoutSpec;
  const states = s.states?.length ? s.states : [{}];
  states.forEach((st, i) => { if (i) sentence(c, st.s, `pinout state ${i + 1}`); });
  const pins = [...(s.pins ?? [])];
  for (const f of s.focus ?? []) if (!pins.includes(f.pin)) pins.push(f.pin);
  const el = pinout({ id: "board", ...c.box }, s.board, {
    ...(pins.length ? { pins } : {}),
    ...(s.parts ? { parts: s.parts.map((p, i) => ({ ...p, ...(p.label !== undefined ? { label: c.T(p.label, `pinout part ${i + 1} label`) } : {}) }) as PinoutPart) } : {}),
    frames: states.map(({ s: _s, ...f }) => f),
  });
  const focus = s.focus?.map((f) => ({ at: sentence(c, f.s, "pinout focus"), value: pins.indexOf(f.pin) + 1 }));
  return [with_(el, enter(c, s.s, 1.5), states.length > 1 ? stepTrack("frame", states.slice(1).map((st, i) => ({ at: c.at(st.s!), value: i + 1 })), 0, 0.3) : null, focusTrack(c, focus), flowClock(5.5 * c.n))];
}

interface SignalSpec {
  /** The reading: an expression in x (the time), as the plot's. */
  fn: string; xr: [number, number]; yr: [number, number];
  /** Samples per time unit; ADC bits; seeded noise on the samples. */
  rate?: number; bits?: number; noise?: number; lo?: number; hi?: number;
  threshold?: number | [number, number];
  /** A moving average over this many samples. */
  avg?: number;
  xLabel?: AText; yLabel?: AText; outLabel?: AText; unit?: string; readout?: "value" | "code" | "both"; window?: number;
  /** The cursor draws time from the start of sentence a to the end of sentence b (default: the whole scene). */
  frames?: [number, number];
  /** Layers built up on sentences: 1 the reading, 2 samples, 3 ADC steps, 4 threshold and output, 5 average. */
  focus?: { layer: number; s: number }[];
}

/** A sensor reading drawn over time: sampled, converted, thresholded, averaged. */
function signalBody(spec: unknown, c: BodyCtx): Element[] {
  if (!isObj(spec) || typeof spec.fn !== "string" || !Array.isArray(spec.xr) || !Array.isArray(spec.yr)) throw new Error(`${c.where}: signal needs { fn, xr, yr }`);
  const s = spec as unknown as SignalSpec;
  let sig;
  try {
    sig = sampleSignal(s.fn, s.rate ?? 4, s.bits, { xr: s.xr, yr: s.yr, ...(s.noise ? { noise: s.noise } : {}), ...(s.lo !== undefined ? { lo: s.lo } : {}), ...(s.hi !== undefined ? { hi: s.hi } : {}) });
  } catch (e) {
    throw new Error(`${c.where}: signal fn: ${e instanceof Error ? e.message : String(e)}`);
  }
  const samples = sig.samples!;
  const el: SignalElement = {
    id: "signal", ...c.box, type: "signal", ...sig,
    ...(s.unit ? { unit: s.unit } : {}), ...(s.readout ? { readout: s.readout } : {}), ...(s.window ? { window: s.window } : {}),
    ...(s.xLabel ? { xLabel: label(c, s.xLabel, "signal x label")! } : {}), ...(s.yLabel ? { yLabel: label(c, s.yLabel, "signal y label")! } : {}),
  };
  if (s.threshold !== undefined) {
    const [on, off] = typeof s.threshold === "number" ? [s.threshold, s.threshold] : s.threshold;
    el.threshold = s.threshold;
    el.out = thresholdOut(samples, on, off);
    if (s.outLabel) el.outLabel = c.T(s.outLabel, "signal output label");
  }
  if (s.avg) el.avg = movingAverage(samples, s.avg);
  const [a, b] = s.frames ?? [0, c.n - 1];
  const [from, to] = span(c, sentence(c, a, "signal frames"), sentence(c, b, "signal frames"));
  const focus = s.focus?.map((f) => {
    if (!(Number.isInteger(f.layer) && f.layer >= 0 && f.layer <= 5)) throw new Error(`${c.where}: signal focus layer is 0–5`);
    return { at: sentence(c, f.s, "signal focus"), value: f.layer };
  });
  return [with_(el, revealTrack(from, to), focusTrack(c, focus))];
}

interface GatesSpec {
  inputs: { id: string; label: AText }[];
  gates: { id: string; kind: "and" | "or" | "not" | "xor" | "nand" | "nor"; in: string[]; label?: AText }[];
  outputs: { id: string; from: string; label: AText }[];
  /** Input rows in order (default: every combination); stepped through from the start of sentence a to the end of b. */
  rows?: number[][]; table?: boolean; frames?: [number, number];
  focus?: { gate: string; s: number }[];
  s?: number;
}

/** Logic gates and their truth table, the rows played across sentences. */
function gatesBody(spec: unknown, c: BodyCtx): Element[] {
  if (!isObj(spec) || !Array.isArray(spec.inputs) || !Array.isArray(spec.outputs)) throw new Error(`${c.where}: gates needs { inputs, gates, outputs }`);
  const s = spec as unknown as GatesSpec;
  const net = {
    inputs: s.inputs.map((x, i) => ({ id: x.id, label: c.T(x.label, `gates input ${i + 1}`) })),
    gates: (s.gates ?? []).map((g, i) => ({ id: g.id, kind: g.kind, in: g.in, ...(g.label !== undefined ? { label: c.T(g.label, `gate ${i + 1}`) } : {}) })),
    outputs: s.outputs.map((o, i) => ({ id: o.id, from: o.from, label: c.T(o.label, `gates output ${i + 1}`) })),
  };
  const rows = gateFrames(net.inputs.length, s.rows);
  const el = gates({ id: "gates", ...c.box }, net, rows, s.table !== false);
  const [a, b] = s.frames ?? [Math.min(1, c.n - 1), c.n - 1];
  const [from, to] = span(c, sentence(c, a, "gates frames"), sentence(c, b, "gates frames"));
  const ids = net.gates.map((g) => g.id);
  const focus = s.focus?.map((f) => {
    if (!ids.includes(f.gate)) throw new Error(`${c.where}: gates focus names ${f.gate}, not a gate (${ids.join(", ")})`);
    return { at: sentence(c, f.s, "gates focus"), value: ids.indexOf(f.gate) + 1 };
  });
  return [with_(el, enter(c, s.s, 1), { prop: "frame", keys: [{ at: from, value: 0 }, { at: to, value: rows.length - 0.51, ease: "linear" }] }, focusTrack(c, focus))];
}

interface BitsSpec {
  n?: number;
  /** Each value comes on its sentence; the first is shown from the start. */
  values: { v: number; s?: number; note?: AText }[];
  places?: boolean; hex?: boolean; sum?: boolean; label?: AText;
  focus?: { bit: number; s: number }[];
  s?: number;
}

/** A register whose bits flip to each value on its sentence. */
function bitsBody(spec: unknown, c: BodyCtx): Element[] {
  if (!isObj(spec) || !Array.isArray(spec.values) || !spec.values.length) throw new Error(`${c.where}: bits needs { values: [{ v, s }] }`);
  const s = spec as unknown as BitsSpec;
  s.values.forEach((v, i) => { if (i) sentence(c, v.s, `bits value ${i + 1}`); });
  let el;
  try {
    el = bits({ id: "bits", ...c.box }, s.values.map((v) => v.v), {
      ...(s.n ? { n: s.n } : {}), ...(s.places === false ? { places: false } : {}), ...(s.hex ? { hex: true } : {}), ...(s.sum ? { sum: true } : {}),
      ...(s.label ? { label: c.T(s.label, "bits label") } : {}),
      ...(s.values.some((v) => v.note) ? { notes: s.values.map((v, i) => (v.note ? c.T(v.note, `bits note ${i + 1}`) : null)) } : {}),
    });
  } catch (e) {
    throw new Error(`${c.where}: ${e instanceof Error ? e.message : String(e)}`);
  }
  const focus = s.focus?.map((f) => ({ at: sentence(c, f.s, "bits focus"), value: f.bit }));
  return [with_(el, enter(c, s.s, 1), s.values.length > 1 ? stepTrack("frame", s.values.slice(1).map((v, i) => ({ at: c.at(v.s!), value: i + 1 })), 0, 0.35) : null, focusTrack(c, focus))];
}

export const bodies: Record<string, BodyBuilder> = { circuit: circuitBody, pinout: pinoutBody, signal: signalBody, gates: gatesBody, bits: bitsBody };
