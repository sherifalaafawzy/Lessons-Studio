/**
 * Validation of the electronics and IoT pack's elements (circuit, pinout, signal, gates, bits). The limits keep each
 * element light on old phones: a circuit is one element, but the phone still draws every part, wire and dot.
 * Shared codes where they fit (badBox, badCount, badId, dupId, badRange, badPoints, badFrames, missingText); every
 * other code comes with an English detail.
 */
import type { PackCheck, PackCheckCtx } from "../types.ts";

export const IOT_LIMITS = {
  /** Circuit parts and wires, points per wire, the grid's size, frames. */
  parts: 24, wires: 40, points: 16, grid: 24, frames: 40,
  /** Parts beside a board, labelled pins. */
  boardParts: 6, pins: 12,
  /** A signal's points: the curve and the average, the samples, the output's changes. */
  curve: 400, samples: 120, changes: 200,
  /** Logic: inputs, gates, outputs; frames (input rows). */
  inputs: 4, gates: 8, outputs: 3, rows: 16,
  /** A register's bits. */
  bits: 16,
};

export const CIRCUIT_KINDS = ["battery", "resistor", "led", "lamp", "switch", "button", "ldr", "thermistor", "buzzer", "motor", "ground", "pin"] as const;
export const LED_COLORS = ["red", "green", "yellow", "blue", "white"] as const;
export const GATE_KINDS = ["and", "or", "not", "xor", "nand", "nor"] as const;
export const BOARD_PARTS = ["led", "button", "buzzer", "motor", "sensor"] as const;
const ONE_ENDED = ["ground", "pin"];

/**
 * The boards' header pins as drawn: the board lies on its side, USB to the left, and each edge's pins run left to right.
 * A micro:bit has five big pads along its bottom edge. `extra` are pins that aren't on the header: the board's own LED
 * and a micro:bit's buttons.
 */
export const BOARDS = {
  pico: {
    name: "Pico",
    top: ["VBUS", "VSYS", "GND", "3V3_EN", "3V3", "ADC_VREF", "GP28", "AGND", "GP27", "GP26", "RUN", "GP22", "GND", "GP21", "GP20", "GP19", "GP18", "GND", "GP17", "GP16"],
    bottom: ["GP0", "GP1", "GND", "GP2", "GP3", "GP4", "GP5", "GND", "GP6", "GP7", "GP8", "GP9", "GND", "GP10", "GP11", "GP12", "GP13", "GND", "GP14", "GP15"],
    extra: ["LED"],
  },
  esp32: {
    name: "ESP32",
    top: ["VIN", "GND", "D13", "D12", "D14", "D27", "D26", "D25", "D33", "D32", "D35", "D34", "VN", "VP", "EN"],
    bottom: ["3V3", "GND", "D15", "D2", "D4", "RX2", "TX2", "D5", "D18", "D19", "D21", "RX0", "TX0", "D22", "D23"],
    extra: ["LED"],
  },
  microbit: { name: "micro:bit", top: [], bottom: ["0", "1", "2", "3V", "GND"], extra: ["A", "B"] },
} as const satisfies Record<string, { name: string; top: readonly string[]; bottom: readonly string[]; extra: readonly string[] }>;
/** Pins that are power or control, not signals: parts can't be wired to them. */
export const POWER_PINS = ["VBUS", "VSYS", "GND", "AGND", "3V3", "3V3_EN", "ADC_VREF", "RUN", "VIN", "EN", "3V", "LED", "A", "B"];

const ID = /^[A-Za-z0-9_-]{1,40}$/;
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const isPt = (p: unknown): p is [number, number] => Array.isArray(p) && p.length === 2 && isNum(p[0]) && isNum(p[1]);
const isGrid = (p: unknown): p is [number, number] =>
  isPt(p) && Number.isInteger(p[0]) && Number.isInteger(p[1]) && p[0] >= 0 && p[1] >= 0 && p[0] <= IOT_LIMITS.grid && p[1] <= IOT_LIMITS.grid;
const short = (v: unknown, n = 32): boolean => typeof v === "string" && v.trim().length > 0 && v.length <= n && !v.includes("·");
const oneOf = (v: unknown, list: readonly string[]): boolean => list.includes(v as string);

/** Ids unique and well formed; returns them. */
function ids(list: unknown[], q: string, c: PackCheckCtx, all = new Set<string>()): Set<string> {
  const seen = new Set<string>();
  list.forEach((x, i) => {
    const id = isObj(x) ? x.id : undefined;
    if (typeof id !== "string" || !ID.test(id)) c.err("badId", `${q}[${i}].id`);
    else if (seen.has(id) || all.has(id)) c.err("dupId", `${q}[${i}].id`, id);
    else { seen.add(id); all.add(id); }
  });
  return seen;
}

/** A map from ids to numbers in [lo, hi], or (`str`) to short strings. */
function byId(v: unknown, q: string, known: Set<string>, c: PackCheckCtx, what: string, str = false): void {
  if (v === undefined) return;
  if (!isObj(v)) return c.err("badFrames", q, `an object by ${what} id`);
  for (const [k, x] of Object.entries(v)) {
    if (!known.has(k)) c.err("badRef", `${q}.${k}`, `${k} is not a ${what} of this element`);
    else if (str ? !short(x) : !(isNum(x) && x >= 0 && x <= 1)) c.err("badFrames", `${q}.${k}`, str ? "a short string of at most 32 characters, without ·" : "a number from 0 to 1");
  }
}

function frameList(v: unknown, q: string, c: PackCheckCtx, required: boolean, max: number = IOT_LIMITS.frames): unknown[] {
  if (v === undefined) { if (required) c.err("badFrames", q, "at least one frame"); return []; }
  if (!Array.isArray(v) || !v.length || v.length > max) { c.err("badFrames", q, `1–${max} frames`); return []; }
  return v;
}

function frameProp(el: Record<string, unknown>, q: string, c: PackCheckCtx): void {
  if (el.frame !== undefined && !(isNum(el.frame) && el.frame >= 0)) c.err("badFrames", `${q}.frame`, "a frame number from 0");
}

function circuit(el: Record<string, unknown>, q: string, c: PackCheckCtx): void {
  const parts = arr(el.parts);
  if (!parts.length || parts.length > IOT_LIMITS.parts) c.err("badCount", `${q}.parts`, `1–${IOT_LIMITS.parts}`);
  const known = ids(parts, `${q}.parts`, c);
  const kinds = new Map<string, string>();
  parts.forEach((p, i) => {
    const pq = `${q}.parts[${i}]`;
    if (!isObj(p)) return c.err("badPart", pq, "a part: { id, kind, a, b }");
    if (!oneOf(p.kind, CIRCUIT_KINDS)) return c.err("badKind", `${pq}.kind`, `one of ${CIRCUIT_KINDS.join(", ")}`);
    kinds.set(String(p.id), String(p.kind));
    if (!isGrid(p.a)) c.err("badPoints", `${pq}.a`, `[column, row], whole numbers from 0 to ${IOT_LIMITS.grid}`);
    if (ONE_ENDED.includes(p.kind as string)) {
      if (p.b !== undefined) c.err("badPoints", `${pq}.b`, `a ${String(p.kind)} has one terminal, a`);
    } else if (!isGrid(p.b)) c.err("badPoints", `${pq}.b`, "a two-terminal part needs b, a grid point");
    else if (isGrid(p.a) && ((p.a[0] !== p.b[0] && p.a[1] !== p.b[1]) || (p.a[0] === p.b[0] && p.a[1] === p.b[1]))) c.err("badPoints", `${pq}.b`, "b must be in the same row or column as a, and not the same point");
    c.text(p.label as never, `${pq}.label`, p.kind === "pin");
    if (p.side !== undefined && !oneOf(p.side, ["above", "below", "left", "right"])) c.err("badSide", `${pq}.side`, "above, below, left or right");
    if (p.value !== undefined && !(isNum(p.value) && p.value > 0 && p.value <= 1e7)) c.err("badValue", `${pq}.value`, "a positive number (volts or ohms)");
    if (p.color !== undefined && (p.kind !== "led" || !oneOf(p.color, LED_COLORS))) c.err("badColor", `${pq}.color`, `LEDs only: ${LED_COLORS.join(", ")}`);
    if (p.mode !== undefined && (p.kind !== "pin" || !oneOf(p.mode, ["out", "in"]))) c.err("badMode", `${pq}.mode`, "pins only: out or in");
    if (p.show !== undefined && !(Array.isArray(p.show) && p.show.every((s) => oneOf(s, ["V", "I", "R"])))) c.err("badShow", `${pq}.show`, "a list of V, I and R");
  });
  const wires = arr(el.wires);
  if (!Array.isArray(el.wires) || wires.length > IOT_LIMITS.wires) c.err("badCount", `${q}.wires`, `0–${IOT_LIMITS.wires}`);
  const segs = wires.map((w, i) => {
    const wq = `${q}.wires[${i}]`;
    if (!Array.isArray(w) || w.length < 2 || w.length > IOT_LIMITS.points || !w.every(isGrid)) { c.err("badPoints", wq, `a wire is 2–${IOT_LIMITS.points} grid points`); return 0; }
    for (let k = 1; k < w.length; k++) {
      const [a, b] = [w[k - 1] as number[], w[k] as number[]];
      if ((a[0] !== b[0] && a[1] !== b[1]) || (a[0] === b[0] && a[1] === b[1])) c.err("badPoints", `${wq}[${k}]`, "each step of a wire goes along a row or a column");
    }
    return w.length - 1;
  });
  const of = (kk: string[]): Set<string> => new Set([...kinds].filter(([, k]) => kk.includes(k)).map(([id]) => id));
  frameList(el.frames, `${q}.frames`, c, false).forEach((f, i) => {
    const fq = `${q}.frames[${i}]`;
    if (!isObj(f)) return c.err("badFrames", fq, "a frame: { closed, on, sense, pins, flow, values, over }");
    byId(f.closed, `${fq}.closed`, of(["switch", "button"]), c, "switch or button");
    byId(f.on, `${fq}.on`, of(["led", "lamp", "buzzer", "motor"]), c, "LED, lamp, buzzer or motor");
    byId(f.sense, `${fq}.sense`, of(["ldr", "thermistor"]), c, "sensor");
    byId(f.pins, `${fq}.pins`, of(["pin"]), c, "pin");
    byId(f.values, `${fq}.values`, known, c, "part", true);
    if (f.flow !== undefined) {
      const ok = Array.isArray(f.flow) && f.flow.length === wires.length &&
        f.flow.every((row, w) => Array.isArray(row) && row.length === segs[w] && row.every((x) => isNum(x) && Math.abs(x) <= 1e5));
      if (!ok) c.err("badFlow", `${fq}.flow`, "flow[wire][segment] in mA, one number per segment of each wire");
    }
    if (f.over !== undefined && !(Array.isArray(f.over) && f.over.every((x) => known.has(x as string)))) c.err("badRef", `${fq}.over`, "ids of this element's parts");
  });
  if (el.speed !== undefined && !(isNum(el.speed) && el.speed > 0 && el.speed <= 100)) c.err("badSpeed", `${q}.speed`, "stage pixels per second per mA, above 0 and at most 100");
  frameProp(el, q, c);
}

function pinout(el: Record<string, unknown>, q: string, c: PackCheckCtx): void {
  const board = BOARDS[el.board as keyof typeof BOARDS];
  if (!board) return c.err("badBoard", `${q}.board`, `one of ${Object.keys(BOARDS).join(", ")}`);
  const header = new Set<string>([...board.top, ...board.bottom]);
  const all = new Set<string>([...header, ...board.extra]);
  c.text(el.name as never, `${q}.name`, false);
  const pins = arr(el.pins);
  if (el.pins !== undefined && (!Array.isArray(el.pins) || pins.length > IOT_LIMITS.pins)) c.err("badCount", `${q}.pins`, `0–${IOT_LIMITS.pins}`);
  pins.forEach((p, i) => { if (!header.has(p as string)) c.err("badPin", `${q}.pins[${i}]`, `${String(p)} is not a pin of the ${board.name}`); });
  const parts = arr(el.parts);
  if (el.parts !== undefined && (!Array.isArray(el.parts) || parts.length > IOT_LIMITS.boardParts)) c.err("badCount", `${q}.parts`, `0–${IOT_LIMITS.boardParts}`);
  const known = ids(parts, `${q}.parts`, c);
  parts.forEach((p, i) => {
    const pq = `${q}.parts[${i}]`;
    if (!isObj(p)) return c.err("badPart", pq, "a part: { id, kind, pin }");
    if (!oneOf(p.kind, BOARD_PARTS)) c.err("badKind", `${pq}.kind`, `one of ${BOARD_PARTS.join(", ")}`);
    if (!header.has(p.pin as string) || POWER_PINS.includes(p.pin as string)) c.err("badPin", `${pq}.pin`, `${String(p.pin)} is not a signal pin of the ${board.name}`);
    c.text(p.label as never, `${pq}.label`, false);
    if (p.color !== undefined && (p.kind !== "led" || !oneOf(p.color, LED_COLORS))) c.err("badColor", `${pq}.color`, `LEDs only: ${LED_COLORS.join(", ")}`);
    if (p.res !== undefined && !short(p.res, 12)) c.err("badValue", `${pq}.res`, "a resistor's value as written, at most 12 characters (\"220 Ω\")");
  });
  frameList(el.frames, `${q}.frames`, c, false).forEach((f, i) => {
    const fq = `${q}.frames[${i}]`;
    if (!isObj(f)) return c.err("badFrames", fq, "a frame: { pins, on, values, matrix }");
    byId(f.pins, `${fq}.pins`, all, c, "pin");
    byId(f.on, `${fq}.on`, known, c, "part");
    byId(f.values, `${fq}.values`, known, c, "part", true);
    if (f.matrix !== undefined && (el.board !== "microbit" || typeof f.matrix !== "string" || !/^[01]{25}$/.test(f.matrix))) c.err("badMatrix", `${fq}.matrix`, "a micro:bit's 25 lights, 25 characters 0 or 1");
  });
  frameProp(el, q, c);
}

function signal(el: Record<string, unknown>, q: string, c: PackCheckCtx): void {
  for (const k of ["xr", "yr"]) {
    const r = el[k];
    if (!isPt(r) || r[0] >= r[1]) c.err("badRange", `${q}.${k}`);
  }
  c.text(el.xLabel as never, `${q}.xLabel`, false);
  c.text(el.yLabel as never, `${q}.yLabel`, false);
  c.text(el.outLabel as never, `${q}.outLabel`, false);
  if (el.unit !== undefined && !short(el.unit, 8)) c.err("badUnit", `${q}.unit`, "a unit of at most 8 characters (°C, V, %)");
  const series = (k: string, max: number, required = false, bit = false): void => {
    const v = el[k];
    if (v === undefined) { if (required) c.err("badPoints", `${q}.${k}`, "[time, value] points"); return; }
    if (!Array.isArray(v) || !v.length || v.length > max || !v.every(isPt)) return c.err("badPoints", `${q}.${k}`, `1–${max} [time, value] points`);
    for (let i = 1; i < v.length; i++) if ((v[i] as number[])[0]! < (v[i - 1] as number[])[0]!) return c.err("badPoints", `${q}.${k}[${i}]`, "points in time order");
    if (bit && !v.every((p) => (p as number[])[1] === 0 || (p as number[])[1] === 1)) c.err("badPoints", `${q}.${k}`, "the output's values are 0 or 1");
  };
  series("curve", IOT_LIMITS.curve, true);
  series("samples", IOT_LIMITS.samples);
  series("avg", IOT_LIMITS.curve);
  series("out", IOT_LIMITS.changes, false, true);
  if (el.adc !== undefined) {
    const a = el.adc;
    if (!isObj(a) || !(Number.isInteger(a.bits) && (a.bits as number) >= 1 && (a.bits as number) <= IOT_LIMITS.bits)) c.err("badAdc", `${q}.adc.bits`, `whole bits, 1–${IOT_LIMITS.bits}`);
    else if ((a.lo !== undefined && !isNum(a.lo)) || (a.hi !== undefined && !isNum(a.hi)) || (isNum(a.lo) && isNum(a.hi) && a.lo >= a.hi)) c.err("badAdc", `${q}.adc`, "lo and hi are numbers, lo below hi");
    if (el.samples === undefined) c.err("badAdc", `${q}.adc`, "an ADC needs samples to convert");
  }
  const t = el.threshold;
  if (t !== undefined && !(isNum(t) || (isPt(t) && t[0] > t[1]))) c.err("badThreshold", `${q}.threshold`, "a number, or [on, off] with on above off");
  if (el.readout !== undefined && (!oneOf(el.readout, ["value", "code", "both"]) || el.samples === undefined || (el.readout !== "value" && el.adc === undefined))) c.err("badReadout", `${q}.readout`, "value (needs samples), code or both (need an adc)");
  if (el.window !== undefined && !(isNum(el.window) && el.window > 0)) c.err("badWindow", `${q}.window`, "the time shown at once, above 0");
  frameProp(el, q, c);
}

function gates(el: Record<string, unknown>, q: string, c: PackCheckCtx): void {
  const inputs = arr(el.inputs);
  const list = arr(el.gates);
  const outs = arr(el.outputs);
  if (!inputs.length || inputs.length > IOT_LIMITS.inputs) c.err("badCount", `${q}.inputs`, `1–${IOT_LIMITS.inputs}`);
  if (list.length > IOT_LIMITS.gates) c.err("badCount", `${q}.gates`, `0–${IOT_LIMITS.gates}`);
  if (!outs.length || outs.length > IOT_LIMITS.outputs) c.err("badCount", `${q}.outputs`, `1–${IOT_LIMITS.outputs}`);
  const all = new Set<string>();
  ids(inputs, `${q}.inputs`, c, all);
  ids(list, `${q}.gates`, c, all);
  ids(outs, `${q}.outputs`, c, all);
  const sources = new Set<string>();
  inputs.forEach((x, i) => { if (isObj(x)) { sources.add(String(x.id)); c.text(x.label as never, `${q}.inputs[${i}].label`); } });
  list.forEach((g, i) => {
    const gq = `${q}.gates[${i}]`;
    if (!isObj(g)) return c.err("badGate", gq, "a gate: { id, kind, in }");
    if (!oneOf(g.kind, GATE_KINDS)) c.err("badKind", `${gq}.kind`, `one of ${GATE_KINDS.join(", ")}`);
    const ins = arr(g.in);
    if (g.kind === "not" ? ins.length !== 1 : ins.length < 2 || ins.length > 3) c.err("badGate", `${gq}.in`, g.kind === "not" ? "NOT takes 1 input" : "this gate takes 2 or 3 inputs");
    ins.forEach((s, j) => { if (!sources.has(s as string)) c.err("badRef", `${gq}.in[${j}]`, `${String(s)} is not an input or a gate listed before this one`); });
    c.text(g.label as never, `${gq}.label`, false);
    sources.add(String(g.id));
  });
  outs.forEach((o, i) => {
    if (!isObj(o)) return c.err("badOutput", `${q}.outputs[${i}]`, "an output: { id, from, label }");
    if (!sources.has(o.from as string)) c.err("badRef", `${q}.outputs[${i}].from`, `${String(o.from)} is not an input or a gate`);
    c.text(o.label as never, `${q}.outputs[${i}].label`);
  });
  const fr = frameList(el.frames, `${q}.frames`, c, true, IOT_LIMITS.rows);
  fr.forEach((f, i) => {
    if (!Array.isArray(f) || f.length !== inputs.length || !f.every((b) => b === 0 || b === 1)) c.err("badFrames", `${q}.frames[${i}]`, "one bit (0 or 1) per input");
  });
  if (el.table !== undefined && typeof el.table !== "boolean") c.err("badTable", `${q}.table`, "true or false");
  if (el.table === true && fr.length > 8) c.warn("bigTable", `${q}.frames`, "a truth table shows at most 8 rows; the later frames won't get one");
  frameProp(el, q, c);
}

function bits(el: Record<string, unknown>, q: string, c: PackCheckCtx): void {
  const n = el.n;
  if (!(Number.isInteger(n) && (n as number) >= 1 && (n as number) <= IOT_LIMITS.bits)) return c.err("badCount", `${q}.n`, `1–${IOT_LIMITS.bits} bits`);
  const top = 2 ** (n as number) - 1;
  const v = frameList(el.frames, `${q}.frames`, c, true);
  v.forEach((x, i) => { if (!(Number.isInteger(x) && (x as number) >= 0 && (x as number) <= top)) c.err("badFrames", `${q}.frames[${i}]`, `a whole number from 0 to ${top}`); });
  for (const k of ["places", "dec", "hex", "sum"]) if (el[k] !== undefined && typeof el[k] !== "boolean") c.err("badFlag", `${q}.${k}`, "true or false");
  c.text(el.label as never, `${q}.label`, false);
  if (el.notes !== undefined) {
    if (!Array.isArray(el.notes) || el.notes.length !== v.length) c.err("badNotes", `${q}.notes`, "one note (or null) per frame");
    else el.notes.forEach((t, i) => { if (t !== null) c.text(t as never, `${q}.notes[${i}]`); });
  }
  frameProp(el, q, c);
}

export const check: PackCheck = (el, q, c) => {
  if (el.w === undefined || el.h === undefined) c.err("badBox", q, "w and h");
  switch (el.type) {
    case "circuit": return circuit(el, q, c);
    case "pinout": return pinout(el, q, c);
    case "signal": return signal(el, q, c);
    case "gates": return gates(el, q, c);
    case "bits": return bits(el, q, c);
  }
};
