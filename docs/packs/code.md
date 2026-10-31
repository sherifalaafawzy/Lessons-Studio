# Code pack: programming

Five canvas element types for lessons about programming: variables, loops, conditions, functions, recursion, sorting,
searching and debugging, in Python (or SQL, or pseudocode). The player draws them with the code pack
(`packages/player/src/packs/code/`, about 11 KB gzipped), loaded only by lessons that use them. Everything an element
shows is computed when the lesson is made: programs are run for real in MicroPython (as Darsi's phones run Python),
sorts and searches are run step by step, and call trees come from real calls. The phone only draws.

| Type | Draws | Teaches | Mirrors in Arabic? |
|---|---|---|---|
| `trace` | A program running line by line: the line that ran lit, the variables after it (a function's own frame on top, changed values marked), the output | Variables, loops, conditions, functions and their own variables, return values, errors | The panels swap sides; the code and the variables stay left to right |
| `flowchart` | Start and end, steps, decisions with yes and no, input and output, loops; a token running through it | The logic of a program before the code: decisions, loops | Yes, unless `fixed`; a label with no Arabic letters (code) stays left to right |
| `array` | Values as boxes or bars that keep their identity, so swaps animate as moves; compares, swaps, finished slots, a pivot, a search range with lo, mid and hi, named pointers, counters | Sorting (bubble, selection, insertion, merge, quick), linear and binary search, how much work an algorithm does | No: numbers stay left to right |
| `calltree` | Recursion as a growing tree: calls in the order they are made, the running call marked, return values coming back up | Recursion, base cases, repeated work (fib), the order things happen (Hanoi) | Yes, unless `fixed`; the calls stay left to right |
| `codediff` | A bug and its fix in one code card: the changed lines swap in place, with what each version prints | Debugging: off by one, a variable reset in a loop, a wrong condition | The card keeps to the start side; the code stays left to right |

Types: `packages/spec/src/packs/code/types.ts`. Validation: `packages/spec/src/packs/code/check.ts` (limits in
`CODE_LIMITS`: 16 lines of 60 characters, 300 steps of 12 variables, 14 nodes and 20 arrows, 16 boxes or 32 bars, 300
frames, 3 counters, 40 calls).

**Text.** Everything a learner reads is at least 32 px on the 1280-wide stage: code is as big as fits, up to 42 px; the
panels, labels, notes, counters, indexes and pointers are 32 px. The validator warns (`smallText`) about a `size` under
32. So keep code short: beside the variables, about 30 characters a line fit at 32 px (about 54 across the whole stage),
and about 8 lines in Darsi's body. **Monospace** for code, values and calls; the lesson's font for labels and headings.

## Animation

| Prop | `trace` | `flowchart` | `array` | `calltree` | `codediff` |
|---|---|---|---|---|---|
| `reveal` (0–1) | Code lines top to bottom, then the panels | Nodes in `nodes` order; an arrow once both ends are in | Slots left to right; the note, counters and pointers from halfway | Calls in call order | Lines top to bottom, then the output |
| `frame` | k shows `steps[k]`; over the last 40% of a frame the light glides to the next line, then the panels change | | k shows `frames[k]`; between frames items slide (a mover to the right arcs over, one to the left under) and the marks of the frame being moved to show | k shows the run after `steps[k]`; between k and k + 1 a starting call pops in, or a returning call's value travels up to its parent | 0 the bug, 1 the fix: removed lines slide out, added ones in, shared ones move to their new places |
| `focus` (from 1) | Rings line n | Lights node n | Rings slot n | Rings call n | Rings line n of the version showing |
| `pass` | | 0 → 1 moves the token along `path`, one hop per equal share (1 → 2 back) | | | |

Without a `frame` track a trace shows its first step, an array its first frame, a code diff the bug, and a call tree
the **whole** run (every call returned). The studio's presets work: `type` reveals, `train` plays `frame` through
`steps` or `frames` (a code diff: bug to fix), `forward` runs a flowchart's token.

## Trace (`trace`)

```json
{ "id": "code", "type": "trace", "x": 80, "y": 160, "w": 1120, "h": 520,
  "code": "marks = [7, 5, 9]\ntotal = 0\nfor m in marks:\n    total = total + m\nprint(total)",
  "steps": [ { "line": 1, "vars": { "marks": "[7, 5, 9]" } }, { "line": 2, "vars": { "marks": "[7, 5, 9]", "total": "0" } }, … ],
  "output": "21\n", "labels": { "vars": { "en": "Variables", "ar": "المتغيرات" }, "out": { "en": "Output", "ar": "المخرجات" } } }
```

- **A step** is a line that ran and how things stood **after** it: `vars` (the program's variables, as Python writes
  them: `'Ada'`, `[7, 5, 9]`), and inside a function `fn`, `call` (`"area(4, 3)"`), `depth` and `locals` (its
  parameters and local variables). `out` says how many characters of `output` are printed by then; a `return` line has
  `ret`; the step where the program stops with `error` has `err` (the line turns red, the error shows in the console).
- **The variables panel** lists the program's variables in the order they first appear; while a function runs, its
  frame sits on top (the call as written, then its variables, then `return` and the value), outlined, with a stacked
  edge when calls are nested. A value that changed in this step is marked. More rows than fit end with `… +n`.
- **Layout:** in a wide box the code card is as wide as its code needs and the panels take the rest (their sides swap in
  right-to-left lessons unless `fixed`); in a tall box they stack under the code. Everything is as tall as it needs,
  from the top of the box. `panels` (`["vars", "out"]`) chooses them; `lang` (`python`, `sql`, `plain`) the colouring.
- **Hand-written steps** work too (pseudocode, SQL): give each step its `line` and `vars`.

## Flowchart (`flowchart`)

```json
{ "id": "flow", "type": "flowchart", "x": 80, "y": 160, "w": 1120, "h": 520,
  "nodes": [ { "id": "start", "kind": "start", "label": { "en": "Start", "ar": "ابدأ" } }, { "id": "set", "kind": "process", "label": "count = 1" },
             { "id": "test", "kind": "decision", "label": "count <= 3?" }, { "id": "show", "kind": "io", "label": "print(count)" },
             { "id": "add", "kind": "process", "label": "count = count + 1" }, { "id": "end", "kind": "end", "label": { "en": "End", "ar": "النهاية" } } ],
  "edges": [ { "from": "start", "to": "set" }, { "from": "set", "to": "test" }, { "from": "test", "to": "show", "label": { "en": "Yes", "ar": "نعم" } },
             { "from": "show", "to": "add" }, { "from": "add", "to": "test" }, { "from": "test", "to": "end", "label": { "en": "No", "ar": "لا" } } ],
  "path": ["start", "set", "test", "show", "add", "test", "show", "add", "test", "show", "add", "test", "end"] }
```

- **Kinds:** `start` and `end` (rounded, yellow), `process` (a box), `decision` (a diamond, at most two ways out),
  `io` (input or output, slanted). `tone` colours a shape.
- **Layout, top to bottom:** layers are the longest path from the start; an arrow to a node still on the path is a
  **loop**, drawn down, round the side (a gutter at the start side) and into the node it returns to. A decision's
  **first** arrow goes straight down, its **second** one lane to the side; arrows from a side lane come back in above
  the node they join. Each lane is as wide as its widest shape wants; rows are as tall as their tallest shape. Labels
  wrap; when the rows don't fit, the text shrinks (warned by the layout check under 32 px).
- **Edge labels** (yes, no) sit at the diamond's lower point for the way down, over the line for the way to the side.
- **The run:** `path` lists the nodes the token visits (loops repeat ids); consecutive ids must be joined by an arrow.
  The token travels each arrow and fades at its ends; the node it reaches lights up. `passAt(path, k)` (ops) is the
  `pass` value at which it reaches `path[k]`.

## Array (`array`)

```json
{ "id": "arr", "type": "array", "x": 80, "y": 230, "w": 1120, "h": 380, "values": [4, 2, 5, 1, 3], "index": true,
  "counters": [ { "en": "comparisons", "ar": "المقارنات" }, { "en": "swaps", "ar": "التبديلات" } ],
  "frames": [ { "order": [0, 1, 2, 3, 4], "count": [0, 0] }, { "compare": [0, 1], "note": "4 > 2", "count": [1, 0] },
              { "order": [1, 0, 2, 3, 4], "swap": [0, 1], "note": "4 > 2", "count": [1, 1] }, … ] }
```

- **Identity:** `order[slot]` is the item (index into `values`) in each slot; a frame without `order` keeps the one
  before. Items slide to their new slots between frames, so a swap reads as two items crossing.
- **Marks** (slots, from 0): `compare` (yellow), `swap` (orange: just moved), `done` (green: in its final place), `pivot`
  (red, with a `pivot` pointer), `found` (filled green); `lo`, `mid`, `hi` (pointers under the slots; slots outside
  lo…hi fade); `ptr` (up to 3 more pointers named as in the code: `{ "i": 0, "j": 3, "min": 2 }`). Pointers on one slot
  merge into one label, `lo=mid=hi`, as the code would say it.
- **On top:** the frame's `note` (code such as `a[3] = 17 < 23` stays left to right in Arabic) and the `counters` with
  each frame's `count`.
- `view`: `boxes` (default, up to 16) or `bars` (numbers ≥ 0, as tall as the values, up to 32). `index` shows each
  slot's index.

## Call tree (`calltree`)

```json
{ "id": "tree", "type": "calltree", "x": 80, "y": 160, "w": 1120, "h": 520,
  "calls": [ { "label": "fact(3)", "ret": "6" }, { "label": "fact(2)", "parent": 0, "ret": "2" }, { "label": "fact(1)", "parent": 1, "ret": "1" } ],
  "steps": [1, 2, 3, -3, -2, -1] }
```

- `calls` are in the order they are made; `parent` is the call that made it. Leaves are evenly spaced, parents sit over
  their children, one row per depth.
- `steps` is the run: `i + 1` when call i starts, `−(i + 1)` when it returns; a call starts after its parent and returns
  after its children. `callSteps(calls)` writes it (depth first); the validator checks a hand-written one.
- **Marks:** the running call is filled; the calls waiting for it are outlined; a returned call keeps its value in a
  badge and its line turns to dashes; `tone` colours a call (`accent2` for repeated work).

## Code diff (`codediff`)

```json
{ "id": "diff", "type": "codediff", "x": 80, "y": 185, "w": 1120, "h": 470,
  "before": "total = 0\nfor i in range(1, 5):\n    total = total + i\nprint(total)",
  "after": "total = 0\nfor i in range(1, 6):\n    total = total + i\nprint(total)",
  "labels": { "before": { "en": "The bug", "ar": "الخطأ" }, "after": { "en": "The fix", "ar": "الإصلاح" } },
  "output": { "before": "10", "after": "15" } }
```

- The lines are matched (longest common subsequence): shared lines stay (and move if lines were added or removed above
  them), the bug's own lines are marked red and slide out, the fix's are marked green and slide in. Line numbers follow
  the version showing. The heading and the output (up to 3 lines) cross-fade at the halfway point.

## Recording a program (`recordTrace`)

`recordTrace(code, { inputs, maxSteps })` in `packages/ops/src/packs/code.ts` runs the program in MicroPython (the
`@micropython/micropython-webassembly-pyscript` 1.29.0-6 settrace build, a dev dependency; Node only) and returns
`{ steps, output, error, calls, cut }`. `preparePython()` then `recordTraceSync()` do the same without waiting (the
storyboard bodies use them).

- **What a step shows:** the line that ran and how things stood after it. When a call returns, a step goes back to the
  line that made the call, now with the result (as Python Tutor does), so `room = area(4, 3)` shows `room` arriving on
  its own line.
- **MicroPython's quirks, handled** by rewriting the program first while keeping every line where it is (a line map
  sends each added line to 0): frames have no locals (each `def` gets a decorator that keeps the call's frame, and its
  locals are noted as they are assigned); a `while` test is reported only on the first pass (a one-line `while c:`
  becomes `while True:` with `if not (c): break` on the same line number); a `for` line is reported twice per turn
  (adjacent duplicates merge); the jump back at a loop's end and a function's own return are filed under the block's last
  line, which would light a line that never ran (a no-op tick ends each loop and function body, and the program).
- **Limits:** a program that runs more than 20,000 loop turns or calls stops (`cut`); `maxSteps` (default 120) keeps the
  first steps. `input()` takes `inputs` in turn and prints the prompt with the answer, as a console does. Values longer
  than 40 characters are cut with `...`; objects show as `<Dog>`.
- `traceCalls(rec)` turns the same run's calls into a call tree's `calls` (labels as written, return values).

## Other helpers and the gallery

- `sortFrames(algorithm, values, langs)`: every comparison and move of `bubble` (neighbours), `selection` (pointers i, j,
  min), `insertion` (pointer i), `merge` (lo, mid, hi of the part it merges) or `quick` (pivot, pointers i and j in
  lo…hi); notes like `5 > 2`; counters comparisons and swaps (moves for merge). The last frame has every slot done.
- `searchFrames("linear" | "binary", values, target, langs)`: each look, `lo = mid + 1` and `hi = mid - 1` as their own
  frames, `return 4` (or `return -1`) last; the counter is comparisons.
- `callTree("fib" | "factorial" | "hanoi", n, { repeats })`: the calls with their return values (`repeats` colours fib's
  repeated calls; a Hanoi call's badge is which move it makes, so the order of the moves shows); `callSteps(calls)`.
- Builders: `traceElement`, `flowchart`, `arrayElement`, `calltreeElement`, `codediffElement` (headings in English and
  Arabic), `loopChart`, `traceLabels`, `yesNo`, `passAt`; `element(type, langs, box)` gives a default of each type.
- `presets(langs, stage)`: `trace-loop` (adding up a list), `trace-function` (a function's own variables and its return),
  `flowchart-loop` (a counting loop, the token running round it), `array-bubble`, `array-binary`, `calltree-fib` (fib(4);
  fib(3) on a portrait stage), `calltree-factorial`, `codediff-range` (off by one). Each is laid out for the stage
  (landscape, portrait, square), narrated in English and Arabic, with every keyframe on a spoken word. The embedded runs
  (`SUM_RUN`, `AREA_RUN`) are recorded output; a test keeps them equal to `recordTrace`.

## Storyboard bodies (`scripts/darsi/packs/code.ts`)

Sentences count from 0. MicroPython loads when the converter imports the module, so programs are recorded at
conversion; a program that stops with an error, or runs too long, stops the conversion with the scene's name.

```jsonc
// a program, its steps played from sentence 1 to the end of sentence 3 (or pinned: "at": [[1, 0], [2, 4]]);
// "focus" rings line 3 on sentence 2; "error": true when the error is the point; "inputs" answer input()
{ "trace": { "code": "total = 0\nfor m in [7, 5]:\n    total = total + m\nprint(total)", "play": [1, 3], "focus": [{ "s": 2, "line": 3 }] }, "who": null }
// a flowchart: arrows ["from", "to"] or ["from", "to", "yes" | "no" | {en, ar-EG}]; the token runs "path" over "play" or "at" [sentence, path index]
{ "flowchart": { "nodes": [{ "id": "s", "kind": "start", "text": { "en": "Start", "ar-EG": "ابدأ" } }, { "id": "t", "kind": "decision", "text": "n > 0?" }, …],
                 "edges": [["s", "t"], ["t", "d", "yes"], ["d", "t"], ["t", "e", "no"]], "path": ["s", "t", "d", "t", "e"], "at": [[0, 0], [1, 2], [3, 4]] } }
// a sort or a search, every frame played over "play" (or pinned with "at"); "view": "bars", "index": true, "counters": false
{ "array": { "values": [5, 3, 8, 1], "sort": "bubble", "view": "bars", "play": [1, 3] } }
{ "array": { "values": [3, 8, 12, 17, 23, 31, 40], "search": { "kind": "binary", "target": 23 }, "index": true } }
// a call tree, ready-made or the calls a program makes ("code"); "focus" rings a call
{ "calltree": { "fn": "fib", "n": 4, "repeats": true, "play": [1, 3], "focus": [{ "s": 3, "call": 6 }] } }
{ "calltree": { "code": "def f(n):\n    return 1 if n < 2 else f(n - 1) + f(n - 2)\n\nf(3)" } }
// a bug and its fix, swapping on sentence "fix"; "run": true records what each prints (or "output": {before, after})
{ "codediff": { "before": "…", "after": "…", "fix": 2, "run": true, "focus": [{ "s": 1, "line": 2 }] } }
```

Limits in a body: a trace 10 lines of 40 characters and 80 steps; a code diff 8 lines of 48; 10 boxes or 12 bars and
60 frames; 15 calls (fib(4), factorial(6), hanoi(3)).

## Example and checks

`node scripts/examples/pack-code.ts` writes `examples/pack-code/` ("Watch your code think", English and Arabic): a loop
with a condition traced in MicroPython, the same logic as a flowchart with the token running through it, a function's own
variables, selection sort as bars, binary search, fib(4)'s calls recorded from a real run, and a bug fixed (outputs from
real runs). Then `node scripts/make-timing.mjs pack-code`.

Tests: `packages/spec/test/packs/code.test.ts` (validation), `packages/ops/test/packs/code.test.ts` (traces, sorts,
searches, call trees, presets), `packages/player/test/packs/code.test.ts` (rendering in jsdom, frame by frame, the same
frame for the same time, right to left), `scripts/test/packs/code.test.ts` (the bodies).
