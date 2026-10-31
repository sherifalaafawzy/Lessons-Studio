# The optimization pack

Five canvas element types for lessons about choosing the best plan under limits: shortest ways and routes, timetables,
packing, linear programs and search. The Optimization track uses them (H:\htdocs\darsi\docs\curriculum\opt.md), and its
school problems are built in, with the same numbers as Darsi's Labs: the shortest way to school, the bus route, exam
slots, the timetable, exam papers to print, the truck to a village school and the school garden.

| Type | Draws | `frame` steps | Right to left |
|---|---|---|---|
| `graph` | Places and roads on a map, with lengths; a path or route over them; a running total | Dijkstra, a route improving, a spanning tree, colouring | Never mirrored (geography doesn't flip); the notes card moves to the reading side |
| `schedule` | A timetable grid (rows × columns) or a Gantt chart (rows × time) | Items placed, moved and taken back as a solver works | The grid follows the language (periods right to left); Gantt time stays left to right |
| `knapsack` | Items as rows, the bag as a bar with its limit, the totals; or the dynamic programming table | Items going in and out; the table filling cell by cell | The bag layout mirrors; numbers and the table stay left to right |
| `lp` | A two-variable linear program: limit lines, what each rules out, the region that fits, its corners, the goal line | The goal line sliding to the best corner | Never mirrored (like a plot); the legend card moves to the reading side |
| `searchtree` | A search tree (backtracking, branch and bound) with each node's partial choice and bound | One more node per step, in visiting order | Mirrored (the first branch on the reading side) unless `fixed`; "42 ≤ 68" reads left to right |

Types: `packages/spec/src/packs/opt/types.ts`. Validation: `packages/spec/src/packs/opt/check.ts` (limits in
`OPT_LIMITS`). Renderers: `packages/player/src/packs/opt/` (12 KB gzipped). Authoring: `packages/ops/src/packs/opt.ts`
(`packs.opt` in `@lessonstudio/ops`). Storyboard bodies: `scripts/darsi/packs/opt.ts`.

## How it looks and moves

- Everything the learner reads is 32 px or more on the 1280 × 720 stage (34 px for place names); notes sit in a card,
  one line under the drawing (a strip) or beside it when the box is wide (with the total in big type).
- Every element keeps its steps in `frames` (the search tree in `steps`), so the studio's `train` preset plays them.
  `frame` is the step; without a `frame` track an element shows `frame` (default 0, its first step; `element()` and
  still uses set the last).
- Colours are the brand's tones only: done is `ok` (green), the step being taken is `accent`, waiting is a dashed
  `accent` ring, the answer is `accent2` (yellow) with a thick `accent` line, refused or clashing is `danger`.
- Text goes through `rich()`; numbers, formulas ("x + y ≤ 8", "2-opt") and codes stay left to right inside Arabic.

## `graph`

```json
{ "id": "map", "type": "graph", "x": 60, "y": 140, "w": 1160, "h": 540, "fit": "fill",
  "nodes": [ { "x": 1, "y": 5, "label": { "en": "Home", "ar": "البيت" }, "at": "b" },
             { "x": 9, "y": 5, "label": { "en": "School", "ar": "المدرسة" }, "at": "b", "shape": "square" } ],
  "edges": [ { "a": 0, "b": 1, "w": 13, "curve": 0.1, "pos": 0.3 } ],
  "frames": [ { "nodes": "f.", "edges": ".", "vals": [0, "∞"], "note": { "en": "Start at Home", "ar": "نبدأ من البيت" } },
              { "nodes": "pp", "edges": "p", "vals": [0, 13], "path": [0, 1], "total": 13 } ],
  "totalLabel": { "en": "Shortest way", "ar": "أقصر طريق" }, "unit": { "en": "km", "ar": "كم" } }
```

- **Nodes** are map coordinates, y up (north); `label` beside the dot (`at`: `t`, `b`, `l`, `r`), `shape` `square` for
  the school or the depot. `fit`: `keep` (default; for distances as the crow flies, like the bus route) or `fill`
  (stretched to the box; for road maps whose lengths are written on the roads).
- **Edges** join node indexes; `w` is written on the road (`weights: false` hides it), `curve` bends it (−0.5 to 0.5),
  `pos` moves its length along it (0.1–0.9) to keep labels apart.
- **Frames:**
  - `nodes`, one letter each: `.` idle, `f` waiting (the frontier), `c` chosen now, `v` done (settled), `p` on the answer;
  - `edges`, one letter each: `.` idle, `c` checked now, `t` taken (in the tree), `p` on the answer, `x` refused or
    closed (dashed danger), `o` a clash, `-` dimmed;
  - `vals` in the dots (a tentative distance, `"∞"`, a slot, a village's number), `colours` 1–6 (exam slots: accent, ok,
    accent2, muted, fg, hi-fg, always with the slot's number too);
  - `path` (node indexes; `loop` closes it), `cut` and `added` (pairs: the two roads a 2-opt swap takes out, dashed
    danger, and puts in, green), `total`, `note`.
- **Animation:** `reveal` brings the places in, then the roads, then the path; `frame` (rounded) is the step; `focus` n
  rings place n; `pass` 0 → 1 drives a bus along the frame's path (1 → 2 back; −1 hides it).

## `schedule`

```json
{ "id": "tt", "type": "schedule", "x": 60, "y": 140, "w": 1160, "h": 540,
  "rows": ["5A", "5B", "6A"], "cols": [{ "en": "Period 1", "ar": "الحصة 1" }, …],
  "items": [ { "label": { "en": "Maths", "ar": "رياضيات" }, "sub": { "en": "Musa", "ar": "موسى" }, "row": 2, "col": 0, "tone": "accent" } ],
  "blocked": [[0, 3]],
  "frames": [ { "at": [[2, 0]], "state": "n", "opts": [[2, 1]], "bad": [[0, 2]], "note": { … }, "total": 2 } ] }
```

- **Grid** (default): `rows` × `cols`; an item ends at (`row`, `col`); `frames[].at[i]` is `[row, col]` or null (not
  placed). Items sharing a cell (a clash) are drawn offset. `blocked` cells are hatched (a teacher away); `opts` tints
  the cells still possible for the lesson being decided, `bad` hatches the ones a rule or a dead end rules out.
- **Gantt** (`"kind": "gantt"`): `rows` are machines, `span` the time axis (`ticks`, `unit`); an item runs on `row` for
  `len` from `at` (`frames[].at[i]` a start time or null). A red line marks when the last job ends; a bar too short for
  its name keeps only its colour; an item overlapping another in its row is drawn lower.
- **States**, one letter per item: `.` placed, `n` just placed (accent outline), `g` a guess (dashed), `f` forced
  (propagation), `x` a clash (danger).
- **Animation:** `frame` blends places (items slide, fade in and out) and rounds states; `reveal` brings the rows in from
  the top; `focus` n rings item n. Grid columns follow the language; a Gantt chart is always left to right.

## `knapsack`

```json
{ "id": "truck", "type": "knapsack", "x": 60, "y": 140, "w": 1160, "h": 540,
  "items": [ { "label": { "en": "Solar panels", "ar": "ألواح شمسية" }, "w": 600, "v": 42 }, … ], "cap": 1000,
  "unit": { "en": "kg", "ar": "كغ" }, "vunit": { "en": "points", "ar": "نقطة" }, "per": 100, "perLabel": { "en": "per 100 kg", "ar": "لكل 100 كغ" },
  "frames": [ { "in": "n.....", "note": { … } } ] }
```

- **Bag** (default): the items as rows (weight, value and, with `per`, value per `per` of weight: the greedy rule's
  number), the bag as a bar filling from the bottom with its limit written over it, and the weight and value totals.
  Over the limit, the bar and the weight turn danger. In a narrow box the bag goes under the list.
- **States** (`in`), one letter per item: `.` out, `i` in the bag, `c` looked at now, `n` just put in, `x` won't fit.
- **Table** (`"show": "table"`): `table[k][c]` is the best value with the first k items and room c × `step`; rows are
  "—" (no items) then each item with its weight. `frames[].fill` cells are filled in reading order; between frames the
  cells fill one by one, the cell being filled in accent and the two it is read from (leave the item: the cell above;
  take it: the cell above and left by its weight) outlined. `trace` lights the cells read back for the best load.
- **Animation:** `frame` (blocks grow and slide between frames; cells fill); `reveal` brings the rows in; `focus` n
  rings item n (row n in the table).

## `lp`

```json
{ "id": "garden", "type": "lp", "x": 60, "y": 140, "w": 1160, "h": 540, "xr": [0, 9], "yr": [0, 8],
  "xLabel": { "en": "Tomato beds", "ar": "أحواض الطماطم" }, "yLabel": { "en": "Bean beds", "ar": "أحواض الفاصوليا" },
  "cons": [ { "a": 1, "b": 1, "c": 8, "label": { "en": "Land", "ar": "الأرض" } }, { "a": 2, "b": 1, "c": 14 }, { "a": 1, "b": 3, "c": 18 } ],
  "obj": { "a": 30, "b": 40, "label": { "en": "Profit", "ar": "الربح" } },
  "frames": [ { "level": 0 }, { "level": 96.7 }, { "level": 193.3 }, { "level": 290, "note": { … } } ] }
```

- Each limit a·x + b·y ≤ c (`op` `>=` for ≥) is a line with a numbered badge on the side it rules out (near the end
  farther from the region; `at` 0–1 places it); that side is shaded. x, y ≥ 0 always. The region that fits is computed
  on the phone by clipping (a few lines of geometry); its corners are the points on two of the lines (the axes count),
  numbered counterclockwise from the one nearest the origin, with their coordinates (not the origin's).
- The legend card lists each limit with its badge and line, written out ("Land: x + y ≤ 8"), then the goal with the
  line's current level ("Profit: 30x + 40y = 240") and the step's note. `vars` renames x and y; `ints` dots the
  whole-number plans that fit; `values` writes the goal's value at every corner.
- **Animation:** `reveal` brings limit i in at i ÷ (n + 2) (its line, then its shading), then the region, then the
  corners; `frame` blends the goal line's level, and the best corner lights up when the line reaches it; `focus` 1…n
  lights a limit, n + 1… a corner.

## `searchtree`

```json
{ "id": "tree", "type": "searchtree", "x": 60, "y": 140, "w": 1160, "h": 540, "frame": 0,
  "steps": [ { "p": -1, "label": "0", "sub": "≤ 68", "note": { … } },
             { "p": 0, "label": "42", "sub": "≤ 68", "edge": { "en": "+ solar", "ar": "+ الألواح" } },
             { "p": 1, "label": { "en": "1,100 kg", "ar": "1100 كغ" }, "edge": { "en": "+ desks", "ar": "+ المقاعد" }, "mark": "d" },
             { "p": 1, "label": "42", "edge": …, "mark": "l", "best": true, "val": 42 } ],
  "totalLabel": { "en": "Best so far", "ar": "الأفضل حتى الآن" } }
```

- `steps` in visiting order; `p` is the parent (−1 for the root, always an earlier step). `label` the partial choice
  or value, `sub` its bound (muted), `edge` the branch taken (on the line, toward the child's side). Marks: `x` pruned
  (grey, dashed, ✗), `d` a dead end (danger ✗), `l` a full plan (✓). `best` makes a step the best so far (green), worth
  `val`, shown in the strip with `totalLabel`; `note` is the step's explanation.
- Layout: leaves take the slots in turn, parents sit over their children. At most 31 steps, 5 levels below the root.
- **Animation:** `frame` k shows steps 0 … k, step k as the current one (accent ring) with its note; the next one fades
  in between frames. `reveal` brings the steps in in the same order. `focus` n rings step n. Marks ✗ and ✓ are drawn
  strokes, not font glyphs.

## Authoring helpers (`packs.opt` in `@lessonstudio/ops`)

- **Datasets** (the track's facts): `SHORTEST` (home, six villages and the school; road 8 is the bridge), `BUS` (the
  school and nine villages, km), `EXAMS` (eight exams, six pupils; `clashEdges`), `TRUCK` and `TRUCK_CAP`, `GARDEN`,
  `TIMETABLE` (rules `huda`, `test`, `art`, `lab`), `PRINTING`.
- **Algorithms → frames:**
  - `dijkstraFrames(nodes, edges, from, to, langs, { closed, unit })`: 13 km by Tala, Kesi and Mina; 14 km flooded.
  - `routeFrames(pts, langs)`: nearest neighbour (34.6 km), then 2-opt swaps (`twoOpt`) to 28.6 km; `bestTour`
    (Held–Karp) checks it.
  - `kruskalFrames(nodes, edges, langs)`: 7 roads, 25 km.
  - `colourFrames(nodes, edges, langs, { method: "greedy" | "dsatur", order })`: 4 slots, 3 slots; `fewestSlots`.
  - `knapsackGreedy(items, cap, langs, { best })`: 60 points (and the best, 65); `knapsackDP(items, cap, step, langs)`:
    the table and its read-back; `knapsackBest` (all 2ⁿ loads).
  - `branchAndBound(items, cap, langs, { short })`: depth first, take before leave, fractional bound.
  - `lp2d(cons, obj)`: vertex enumeration, corners counterclockwise, the best and the limits it uses up (`tight`);
    `lpLevels`.
  - `solveTimetable` and `timetableFrames(langs, rules)`: propagation and search (8 guesses and 3 dead ends with
    `huda` and `test`; 2 guesses with `art`; none with `lab`).
  - `flowShop`, `johnson`, `printingFrames(langs)`: 21 minutes in list order, 18 by Johnson's rule.
  - Notes are written in English, Modern Standard Arabic and, for `ar-EG`, Egyptian Arabic (`say(langs, en, ar, eg)`).
- **Builders** (an element in a box): `shortestWay(box, langs, { flooded })`, `pavedRoads`, `busRoute`, `examSlots(box,
  langs, method)`, `timetableGrid(box, langs, rules)` (rows and columns swap in a box under 900 px wide),
  `printingGantt`, `truckBag(box, langs, { best })`, `truckTable`, `truckTree(box, langs, loads = 3)`, `gardenLp(box,
  langs, { prices, ints, values })`.
- **`element(type, langs, box)`**: a default element of each type at its last step (the studio's "Add a pack element").
- **`presets(langs, stage)`**: ten gallery scenes, each a headline and one element with narration in every language and
  keyframes on spoken words: `opt-dijkstra`, `opt-route`, `opt-tree`, `opt-colour`, `opt-timetable`, `opt-gantt`,
  `opt-greedy`, `opt-dp`, `opt-lp`, `opt-bnb`.

## Storyboard bodies (`design.json`)

Sentences count from 0. `"s"` is the sentence the element comes in on; `"frames": [a, b]` plays its steps from sentence a
to the end of sentence b. Pack bodies take the full width.

```jsonc
// graph: map "shortest" (algo dijkstra | kruskal | none; closed roads), "bus" (the route), "exams" (dsatur | greedy),
// or your own { nodes: [{ id, x, y, text, at, square }], edges: [[from, to, length]] } with algo dijkstra | kruskal |
// dsatur | greedy | route | none, from, to, unit
{ "graph": { "map": "shortest", "algo": "dijkstra", "closed": [["kesi", "mina"]], "s": 0, "frames": [1, 2], "bus": 3,
             "focus": [{ "node": "tala", "s": 1 }] } }
// schedule: the timetable with its rules (huda, test, art, lab), or the printing (a Gantt chart)
{ "schedule": { "kind": "timetable", "rules": ["huda", "test", "art"], "frames": [1, 3], "focus": [{ "item": 9, "s": 2 }] } }
// knapsack: the truck (show bag or table; best: false stops at greedy), or your own items, cap, unit, vunit, step
{ "knapsack": { "show": "bag", "frames": [1, 3] } }
// lp: the garden (prices, ints, values), or your own cons, obj, x, y, xr, yr; each limit comes in on its sentence,
// then the region, then the goal line slides
{ "lp": { "limits": [0, 1, 2], "region": 3, "slide": [3, 3] } }
// searchtree: branch and bound on the truck's first `loads` (2–4; default 3), or your own items { text, short, w, v } and cap
{ "searchtree": { "loads": 3, "frames": [0, 2] } }
```

## Limits

16 places and 40 roads; 60 frames; 8 rows × 8 columns and 30 items; 8 knapsack items and 21 table columns; 6 limits
and 150 whole-number dots; 31 tree steps, 5 levels below the root. Keep labels short: 32 px text on a 1100 px box fits
about 50 characters on a line.

## Example and checks

`examples/pack-opt` (from `node scripts/examples/pack-opt.ts`, then `node scripts/make-timing.mjs pack-opt`): a title,
the ten presets and a summary, English and Arabic, 144 s and 139 s. Tests: `packages/spec/test/packs/opt.test.ts`
(validation), `packages/ops/test/packs/opt.test.ts` (the algorithms against brute force and the track's numbers, the
presets in every stage shape), `packages/player/test/packs/opt.test.ts` (rendering, the same frame for the same time,
right to left), `scripts/test/packs/opt.test.ts` (the bodies, and a real storyboard converted with every one).
