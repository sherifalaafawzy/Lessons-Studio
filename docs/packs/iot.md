# The IoT pack: circuits, boards, signals, logic and bits

Five canvas element types for electronics and IoT lessons: the circuit inside every device, a microcontroller's pins,
a sensor reading turned into numbers and decisions, logic gates, and bits. Darsi's IoT track uses them (current and
LEDs, logic, binary, the microcontroller loop, thresholds and hysteresis), with the numbers its courses use: a red LED
takes about 2 V and wants 10–20 mA, (3 − 2) ÷ 0.01 = 100 Ω, a Pico or ESP32 pin is 3.3 V, an Uno reads 10 bits.

| Type | Draws | Mirrors in Arabic? |
|---|---|---|
| `circuit` | A schematic on a grid, current flowing as arrowheads, LEDs and lamps glowing, values beside parts | No: a schematic is a drawing in space |
| `pinout` | A Pico, ESP32 DevKit or micro:bit with labelled pins, and parts wired to them on a ground rail | No |
| `signal` | A sensor reading over time: samples, an ADC's steps, a threshold, the digital output, an average | No: time runs left to right |
| `gates` | Logic gates from a netlist, signals lit where they are 1, a truth table that fills in | No: inputs left, outputs right |
| `bits` | A register of bits with place values, the decimal value and the sum | No: most significant bit first, left to right |

Files: types `packages/spec/src/packs/iot/types.ts`; validation `…/iot/check.ts` (limits in `IOT_LIMITS`, the boards'
pins in `BOARDS`); renderers `packages/player/src/packs/iot/` (13.5 KB gzipped); authoring
`packages/ops/src/packs/iot.ts`; storyboard bodies `scripts/darsi/packs/iot.ts`; example `examples/pack-iot`
(`node scripts/examples/pack-iot.ts`, then `node scripts/make-timing.mjs pack-iot`).

Text is 32 px on the stage. Labels are `Text` per language; numbers, units and pin names stay left to right inside
Arabic (isolated with U+2066 … U+2069), and Arabic labels are set right to left.

## Circuits (`circuit`)

```json
{ "id": "c", "type": "circuit", "x": 40, "y": 140, "w": 1200, "h": 540,
  "parts": [
    { "id": "bat", "kind": "battery", "a": [0, 0], "b": [0, 2], "label": "3 V", "value": 3 },
    { "id": "sw", "kind": "switch", "a": [1, 0], "b": [2, 0], "label": { "en": "switch", "ar": "مفتاح" } },
    { "id": "r", "kind": "resistor", "a": [3, 0], "b": [4, 0], "label": "100 Ω", "value": 100, "show": ["V"] },
    { "id": "led", "kind": "led", "a": [5, 0], "b": [5, 2], "label": "LED", "color": "red", "show": ["V", "I"] }],
  "wires": [[[0, 0], [1, 0]], [[2, 0], [3, 0]], [[4, 0], [5, 0]], [[5, 2], [0, 2]]],
  "frames": [ … from solveCircuit … ] }
```

- **Grid.** Points are `[column, row]`, whole numbers. A part sits between `a` and `b`, in one row or column; its
  leads run to its points. `ground` and `pin` have one point. Wires are polylines; they join where they share a point
  (a corner or an end; the solver refuses a wire running straight through a join). A dot marks three or more ends
  meeting. The grid is fitted to the box, leaving room for every label.
- **Parts:** `battery` (`a` is +), `resistor`, `led` (`a` is the long leg; `color` red, green, yellow, blue, white),
  `lamp`, `switch`, `button`, `ldr` (light sensor), `thermistor`, `buzzer`, `motor`, `ground`, `pin` (a
  microcontroller pin, `label` its name; `mode` out or in).
- **Labels** go on `side` (above, below, left, right), by default away from the middle; values go with them. The
  extras (an LDR's light arrows, a buzzer's dome and sound, an open switch's lever) go on the other side.
- **Frames** (one per moment, made by `solveCircuit`): `closed` (switches and buttons, 0–1), `on` (LED and lamp
  brightness, buzzer and motor), `sense` (light on an LDR, heat on a thermistor), `pins` (1 high), `flow` (mA in each
  wire segment, signed along the wire), `values` ("2.0 V, 10 mA"), `over` (parts past their limit, or burnt out: red,
  and crossed out when dark).

Animation:

- `reveal`: the parts come in in order, then the wires draw.
- `frame`: the moment. Fractions blend: a switch swings shut, an LED fades up, the current fades in.
- `focus` n: lights the n-th part.
- `pass`: the flow's clock in seconds. Arrowheads move along the wires at `speed` × mA px/s (default 6, so 10 mA is
  60 px/s), between 14 and 220. Below 0 they stand still, showing the direction. Buzzers pulse and motors turn with
  it too. `flowClock(seconds)` (ops) runs it from 0 to the scene's length: keyframe times stop at the scene's end, so
  a clock can't simply count, and `sceneSeconds(narration)` estimates the length. The renderer uses an exact
  scene time instead if the player ever passes one (`KitState.t`).

## The solver and ready-made circuits (ops)

`solveCircuit(def, states)` works out each state by nodal analysis:

- A battery or pin is a source with 0.05 Ω inside, and a closed switch is 0.01 Ω.
- An LED is its forward voltage at 10 mA (red 2.0, yellow 2.1, green 2.2, blue and white 3.0 V) with 10 Ω inside. Each
  LED is switched on or off until it agrees; current in the wrong direction lights nothing.
- An LDR is 100 kΩ in the dark and 1 kΩ in bright light. A thermistor is 10 kΩ at 25 °C (NTC, β 3950).
- Wire currents follow Kirchhoff's current law at every join.

A state is `{ closed, light, temp, pins, broken }`. `circuit(box, def, states)` returns the element.

`circuitDef(name, langs, { volts, ohms, color, resistor })` gives circuits labelled in English and Arabic:

- `torch`: battery, switch and lamp.
- `led`: LED and resistor; `resistor: false` gives 109 mA, which burns the LED out.
- `button-buzzer`.
- `series` and `parallel` lamps (1.5 V each at a quarter of the brightness, or 3 V each at twice the battery current).
- `and` and `or` switches.
- `pin-led`: a pin, 220 Ω and an LED.
- `light-sensor`: an LDR divider read by GP26, and GP15 lighting an LED.
- `thermistor`: a divider read by GP27.

`transposeCircuit(def)` turns a circuit for a tall stage.

## Boards (`pinout`)

`board`: `pico`, `esp32` (a 30-pin DevKit) or `microbit`, drawn on its side with USB to the left. `pins` lists the
pins to label, in `focus` order. A part's pin is labelled too, and so is the GND its rail joins.

`parts`: `{ id, kind: led | button | buzzer | motor | sensor, pin, label, color, res: "220 Ω" }`.

- Each part hangs from its pin's wire (through its resistor) to a ground rail joined to a GND pin. A sensor module
  also takes 3V3.
- The wires turn at staggered heights, so none cross.

Frames:

- `pins`: levels, 1 high. A high pin and its wire light up. `LED` is the board's own LED (D2 on an ESP32); `A` and `B`
  are a micro:bit's buttons.
- `on`: by part id; a button's `on` is pressed.
- `values`: readouts beside parts.
- `matrix`: a micro:bit's 25 lights.

Animation: `reveal` brings in the board, then the labels, then the parts. `frame` picks the moment, and `focus` n
rings the n-th pin of `pins`.

## Signals (`signal`)

`xr`, `yr`, `curve` (the analog reading), and optionally:

- `samples` and `adc` (`bits`, `lo`, `hi`). The steps hold each sample at its quantized level; the ADC's numbers sit on
  the right, with level lines up to 4 bits.
- `threshold` (a number, or `[on, off]` for hysteresis), `out` (the digital output, drawn under the plot) and
  `outLabel`.
- `avg`, a moving average.
- `readout`: `value`, `code` or `both` ("1.65 V → 4"), for the latest sample.
- `unit`, `xLabel`, `yLabel` (written level over the axis, so Arabic reads), and `window` (time shown at once; the view
  scrolls like a serial plotter).

Animation:

- `reveal` draws time: a cursor sweeps left to right, and what is left of it shows (one clipping viewport, nothing
  rebuilt). With a `frame` track, the cursor is at time `xr[0] + frame` instead.
- `focus` n builds the layers up to n and lights the n-th: 1 the reading, 2 the samples, 3 the ADC's steps, 4 the
  threshold and output, 5 the average. 0 shows them all.
- The `train` preset doesn't apply; use `type` (reveal).

Ops:

- `sampleSignal(fn, rate, bits, { xr, yr, noise, seed, lo, hi })`: `fn` is a function or an expression in `x`. The
  noise is seeded.
- `thresholdOut(samples, on, off)`: one threshold flickers on a noisy reading; two don't.
- `movingAverage(samples, k)` and `adcCode(v, bits, lo, hi)`.
- `classroomDay(box, langs)`: a school day's temperature, sampled every 10 minutes, with the fan on above 30 °C and off
  below 28 °C.

## Logic gates (`gates`)

`inputs` (`{ id, label }`), `gates` (`{ id, kind: and | or | not | xor | nand | nor, in, label }`; inputs are inputs or
earlier gates), `outputs` (`{ id, from, label }`), `frames` (one bit per input) and `table`.

- Laid out in columns by depth, with each wire on its own track. Shapes are ANSI with the name written inside.
- The truth table sits beside the gates, or under them in a tall box. It fills in up to the current row, which is
  lit; it shows at most 8 rows.

Animation:

- `frame`: the input row (whole rows only).
- `pass` 0 → 1: carries the new row's values through the columns, one column after another.
- `reveal`: the columns come in from the left. `focus` n lights the n-th gate.

Ops:

- `gateFrames(n)` gives every combination in table order; `gateFrames(n, rows)` gives your own order (a stair light
  flips one switch at a time).
- `evalGates(net, row)`.

## Registers (`bits`)

`n` bits (up to 16), `frames` (a value per frame), and:

- `places` (default on): 1, 2, 4 … above the bits, as powers of two past 8 bits.
- `dec` (default on): "= 65", beside the bits, or under them in a narrow box.
- `hex`.
- `sum`: "64 + 1 = 65".
- `label`, and `notes`: one per frame, or null.

Animation:

- `frame`: the value. Between frames, each bit that changes flips over: it squashes and opens with its new value.
- `reveal`: the bits come in from the left. `focus` n lights the n-th bit, counted from the left.

Ops: `bitsFrames(values, n)` checks the values and sizes the register. `textBytes(s)` gives UTF-8 bytes: a Latin letter
is 1 byte, an Arabic letter 2.

## Gallery scenes and default elements

`presets(langs, stage)` gives 13 gallery scenes, each with English and Arabic narration and keyframes on spoken words.
On a tall stage the circuits are turned with `transposeCircuit`.

| Scene | Shows |
|---|---|
| `iot-loop` | A closed loop: a torch's switch opens and closes |
| `iot-led` | An LED and its resistor (1 V and 10 mA) |
| `iot-no-resistor` | Without the resistor, 109 mA burns the LED out |
| `iot-parallel` | Two lamps in parallel |
| `iot-light` | A light-activated lamp: an LDR read by a pin |
| `iot-buzzer` | A push button and a buzzer |
| `iot-pico` | A Pico's pins: an LED on GP15 and a button on GP14 |
| `iot-microbit` | A micro:bit: a heart on button A, an LED on pin 0 |
| `iot-temperature` | A reading with hysteresis (30 °C and 28 °C) |
| `iot-adc` | A 3-bit ADC's eight steps |
| `iot-and` | An AND gate and its truth table |
| `iot-xor` | The stair light (XOR) |
| `iot-byte` | A byte's place values and the letter A |

`element(type, langs, box)` gives a default element of each type.

## Storyboard bodies (design.json)

Sentences count from 0; every state, focus and sweep is timed to one.

```json
"3": { "circuit": { "preset": "torch", "states": [{ "closed": { "sw": true } }, { "s": 3 }], "focus": [{ "part": "bat", "s": 1 }] } },
"4": { "pinout": { "board": "pico", "parts": [{ "id": "led", "kind": "led", "pin": "GP15", "res": "220 Ω", "label": { "en": "LED", "ar-EG": "LED" } }],
                   "states": [{}, { "s": 2, "pins": { "GP15": 1 }, "on": { "led": 1 } }], "focus": [{ "pin": "GP15", "s": 1 }] } },
"5": { "signal": { "fn": "25 + 6*sin(x)", "xr": [0, 6], "yr": [15, 35], "rate": 2, "threshold": [30, 28], "outLabel": { "en": "fan", "ar-EG": "المروحة" },
                   "unit": "°C", "readout": "value", "frames": [0, 2], "focus": [{ "layer": 2, "s": 1 }, { "layer": 4, "s": 2 }] } },
"9": { "bits": { "n": 8, "values": [{ "v": 1 }, { "v": 65, "s": 1, "note": { "en": "the letter A", "ar-EG": "حرف A" } }], "sum": true } },
"10": { "gates": { "inputs": [{ "id": "a", "label": "A" }, { "id": "b", "label": "B" }], "gates": [{ "id": "and", "kind": "and", "in": ["a", "b"] }],
                   "outputs": [{ "id": "q", "from": "and", "label": { "en": "lamp", "ar-EG": "اللمبة" } }], "frames": [1, 3] } }
```

- **`circuit`**:
  - A `preset` (with `volts`, `ohms`, `color`, `resistor`), or your own `parts` and `wires`.
  - `states`: the first is the start, and each later one comes on its sentence `s`.
  - `focus` (`{ part, s }`) and `s` (when the circuit comes in).
- **`pinout`**: `board`, `pins`, `parts`, `states` (frames with `s`), `focus` (`{ pin, s }`).
- **`signal`**:
  - The reading: `fn`, `xr`, `yr`, `rate`, `bits`, `noise`, `lo`, `hi`.
  - What is drawn from it: `threshold`, `avg` (samples to average), `unit`, `readout`, `window`, and the labels.
  - Timing: `frames` [a, b] sweeps the cursor from the start of sentence a to the end of sentence b; `focus`
    (`{ layer, s }`).
- **`gates`**: `inputs`, `gates`, `outputs`, `rows` (default: all of them), `table` (default on), `frames` [a, b] to
  play the rows over, and `focus` (`{ gate, s }`).
- **`bits`**: `n`, `values` (`{ v, s, note }`), `places`, `hex`, `sum`, `label`, `focus` (`{ bit, s }`).

A body takes the full width, with nobody drawn beside it. A wrong spec throws an error naming the scene.
