/**
 * Electronics and IoT pack: the element types `circuit`, `pinout`, `signal`, `gates`, `bits` (docs/packs/iot.md).
 * Each interface extends PackElementBase and has `type` set to one of them. Everything that needs maths (currents,
 * samples, logic sequences) is computed when the lesson is made (packages/ops/src/packs/iot.ts) and stored here as data.
 */
import type { Text } from "../../types.ts";
import type { PackElementBase } from "../base.ts";

/** A point on a circuit's grid: [column, row], whole numbers from 0. */
export type GridPt = [number, number];
export type CircuitKind =
  | "battery" | "resistor" | "led" | "lamp" | "switch" | "button" | "ldr" | "thermistor" | "buzzer" | "motor" | "ground" | "pin";
export type LedColor = "red" | "green" | "yellow" | "blue" | "white";
/** Where a part's label goes (default: the side away from the middle of the circuit). */
export type LabelSide = "above" | "below" | "left" | "right";

export interface CircuitPart {
  /** /^[A-Za-z0-9_-]{1,40}$/, unique in the element. */
  id: string;
  kind: CircuitKind;
  /** The first terminal: + of a battery, the long leg (anode) of an LED; the only one of `ground` and `pin`. */
  a: GridPt;
  /** The second terminal of a two-terminal part, in the same row or column as `a`. */
  b?: GridPt;
  /** A name beside the part ("R1", "220 Ω", a pin's name "GP15"). */
  label?: Text;
  side?: LabelSide;
  /** For the solver (ops): a battery's volts (3), a pin's high level (3.3), ohms of a resistor (220), lamp, buzzer or motor. */
  value?: number;
  /** An LED's colour (default red). */
  color?: LedColor;
  /** A pin: an output that drives the wire (default), or an input that reads it. */
  mode?: "out" | "in";
  /** Values the solver writes beside the part each frame: volts across it, its current, its resistance. */
  show?: ("V" | "I" | "R")[];
}

/** One moment of a circuit, as the solver worked it out. */
export interface CircuitFrame {
  /** Switches and buttons: 1 closed (pressed), 0 open; fractions swing between. Missing: open. */
  closed?: Record<string, number>;
  /** How bright an LED or a lamp is, how hard a buzzer sounds or a motor turns (0–1). */
  on?: Record<string, number>;
  /** Light on a light sensor, heat on a thermistor (0–1). */
  sense?: Record<string, number>;
  /** Pins: 1 high, 0 low (what an output drives, what an input reads). */
  pins?: Record<string, number>;
  /** Current in mA in each segment of each wire (flow[w][k]: positive from point k of wires[w] to point k + 1). */
  flow?: number[][];
  /** What a part shows beside it ("2.0 V, 10 mA"): numbers and units, the same in every language. */
  values?: Record<string, string>;
  /** Parts over their limit (an LED above 30 mA), drawn in the danger colour. */
  over?: string[];
}

/**
 * A schematic on a grid: parts between grid points, joined by wires. `frame` picks the moment (switch positions,
 * LEDs, values; fractions blend); current flows as arrowheads along the wires, as fast as the current (`speed`), moved
 * by `pass` (the flow's clock in seconds; below 0 they stand still). `reveal` brings the parts in, then the wires;
 * `focus` lights the n-th part. Never mirrored: a schematic is a drawing in space.
 */
export interface CircuitElement extends PackElementBase {
  type: "circuit";
  parts: CircuitPart[];
  /** Polylines of grid points; wires join where they share a point (a corner or an end). */
  wires: GridPt[][];
  frames?: CircuitFrame[];
  frame?: number;
  /** How fast current moves: stage pixels per second per mA (default 6). */
  speed?: number;
}

export type Board = "pico" | "esp32" | "microbit";
export type PinoutPartKind = "led" | "button" | "buzzer" | "motor" | "sensor";

/** A part beside the board, wired to one of its pins (and to the ground rail; a sensor module to 3V3 too). */
export interface PinoutPart {
  id: string;
  kind: PinoutPartKind;
  /** The board pin it is wired to ("GP15", "D2", "0"). */
  pin: string;
  label?: Text;
  color?: LedColor;
  /** A resistor on its wire, as written beside it ("220 Ω"). */
  res?: string;
}

export interface PinoutFrame {
  /** Pin levels: 1 high (lit), 0 low. "LED" is the board's own LED (Pico; D2 on an ESP32); "A" and "B" a micro:bit's buttons. */
  pins?: Record<string, number>;
  /** By part id: an LED's brightness, a buzzer or motor running, a button pressed (0–1). */
  on?: Record<string, number>;
  /** Readouts beside parts, by part id ("2870", "28 °C"). */
  values?: Record<string, string>;
  /** A micro:bit's 5 × 5 lights: 25 characters, "1" on and "0" off, row by row from the top. */
  matrix?: string;
}

/**
 * A microcontroller board drawn simply (a Pico, an ESP32 DevKit or a micro:bit), with the pins in `pins` labelled,
 * and parts wired to its pins beside it (breadboard-lite: a ground rail, and a 3V3 rail for sensors). `frame` picks
 * the moment (levels, lit LEDs, readouts); `reveal` brings in the board, the labels, then each part with its wire;
 * `focus` lights the n-th pin of `pins`. Never mirrored.
 */
export interface PinoutElement extends PackElementBase {
  type: "pinout";
  board: Board;
  /** The name printed on the board (default "Pico", "ESP32", "micro:bit"). */
  name?: Text;
  /** Pins to label, in `focus` order. Pins wired to parts are always labelled. */
  pins?: string[];
  parts?: PinoutPart[];
  frames?: PinoutFrame[];
  frame?: number;
}

/**
 * A sensor reading over time, always left to right: the analog curve, the samples taken at the sampling rate, the
 * steps an ADC with `adc.bits` bits turns them into, a threshold (or two, with hysteresis), the digital output under
 * the plot, and a moving average. `reveal` draws time (a cursor sweeps from start to end); with a `frame` track the
 * cursor is at time `frame` instead. With `window`, the view scrolls along with the cursor. `focus` n builds the
 * layers up to n (1 reading, 2 samples, 3 ADC steps, 4 threshold and output, 5 average) and lights the n-th.
 */
export interface SignalElement extends PackElementBase {
  type: "signal";
  /** The axes' ranges: time [start, end], value [min, max]. */
  xr: [number, number];
  yr: [number, number];
  xLabel?: Text;
  yLabel?: Text;
  /** The reading's unit, written after numbers ("°C", "V", "%"). */
  unit?: string;
  /** The analog reading: [time, value] points, in time order. */
  curve: [number, number][];
  /** The samples: [time, value read]. */
  samples?: [number, number][];
  /** An analog-to-digital converter: `bits` bits over the values lo…hi (default the value axis). */
  adc?: { bits: number; lo?: number; hi?: number };
  /** A threshold, or [on, off] for hysteresis (on above the first, off below the second). */
  threshold?: number | [number, number];
  /** The digital output: [time, 0 or 1] at each change, from the start. */
  out?: [number, number][];
  /** Names the output ("Fan", "المروحة"). */
  outLabel?: Text;
  /** A moving average: [time, value] points. */
  avg?: [number, number][];
  /** A readout of the latest sample: its value, its ADC number, or both. */
  readout?: "value" | "code" | "both";
  /** Time shown at once; the view scrolls with the cursor (a serial plotter). Default: all of it. */
  window?: number;
  frame?: number;
}

export type GateKind = "and" | "or" | "not" | "xor" | "nand" | "nor";

/**
 * Logic gates from a netlist, laid out left to right in every language: inputs (switches showing 1 or 0), gates in
 * columns, output lamps. `frame` picks the input row (frames[k], one bit per input); wires and gates light where the
 * signal is 1. With `table`, a truth table beside fills in row by row as the frames go. `reveal` brings the columns in
 * from the left; `focus` lights the n-th gate; `pass` 0 → 1 carries a new row's values through the columns.
 */
export interface GatesElement extends PackElementBase {
  type: "gates";
  inputs: { id: string; label: Text }[];
  /** Each gate's inputs are ids of inputs or of gates listed before it. NOT takes one, the others two or three. */
  gates: { id: string; kind: GateKind; in: string[]; label?: Text }[];
  outputs: { id: string; from: string; label: Text }[];
  /** The input bits per frame, in `inputs` order. */
  frames: number[][];
  table?: boolean;
  frame?: number;
}

/**
 * A register of `n` bits, most significant first and always left to right, with place values (1, 2, 4, …) above and
 * the decimal value beside (hex too, or the sum of the place values that are on). `frame` picks the value; bits
 * that change flip over between frames. `reveal` brings the bits in from the left; `focus` lights the n-th bit.
 */
export interface BitsElement extends PackElementBase {
  type: "bits";
  n: number;
  /** The value per frame, 0 … 2ⁿ − 1. */
  frames: number[];
  /** Place values above the bits (default true). */
  places?: boolean;
  /** "= 161" beside the bits (default true). */
  dec?: boolean;
  hex?: boolean;
  /** "128 + 32 + 1 = 161" under the bits. */
  sum?: boolean;
  /** A name before the register ("1 byte"). */
  label?: Text;
  /** What each value means, one per frame ("the letter A"; null for none). */
  notes?: (Text | null)[];
  frame?: number;
}

export type IotPackElement = CircuitElement | PinoutElement | SignalElement | GatesElement | BitsElement;
export type { PackElementBase };
