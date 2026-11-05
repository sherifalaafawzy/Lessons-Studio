# Technology packs

A pack is a group of canvas element types for one technology, drawn by a file the player loads only for lessons that use
one of them, and saved with a course downloaded for offline use. Lessons that use no pack download nothing more. The
first pack is **science** (`docs/science.md`); the others follow the same contract.

| Pack | Element types | Each pack's page |
|---|---|---|
| `science` | `math`, `plot`, `net`, `arch`, `table` | `docs/science.md` |
| `code` | `trace`, `flowchart`, `array`, `calltree`, `codediff` | `docs/packs/code.md` |
| `data` | `erd`, `query`, `pipeline`, `sheet` | `docs/packs/data.md` |
| `iot` | `circuit`, `pinout`, `signal`, `gates`, `bits` | `docs/packs/iot.md` |
| `network` | `topology`, `sequence`, `layers`, `packet` | `docs/packs/network.md` |
| `opt` | `graph`, `schedule`, `knapsack`, `lp`, `searchtree` | `docs/packs/opt.md` |

The type names are fixed in `packages/spec/src/packs/registry.ts`; the shared machinery reads them from there.
Science is a pack too (`math`, `plot`, `net`, `arch`, `table`). The studio lists every pack together. A lesson's
`track` puts that track's packs first.

| Track | Packs |
|---|---|
| `ai` | science |
| `cyber` | network |
| `iot` | iot |
| `code` | code |
| `data` | data |
| `data-science` | data, then science |
| `agents` | science (its agent and retrieval diagrams) |
| `opt` | opt |
| `aisec` | network, then science |

## What a pack is made of

| Part | File | What it does |
|---|---|---|
| Types | `packages/spec/src/packs/<id>/types.ts` | One interface per element type, extending `PackElementBase` (id, x, y, w, h, anim, tone, fixed…); the union `<Id>PackElement` |
| Validation | `packages/spec/src/packs/<id>/check.ts` | `check: PackCheck`: every field, with limits that keep it light. Report with `c.err`/`c.warn` at exact paths; check Text with `c.text`, tones against `c.tones` |
| Renderers | `packages/player/src/packs/<id>/index.ts` (and files beside it) | `kit: Kit`: `draw: { <type>: KitRenderer }` and the pack's `css` |
| Authoring | `packages/ops/src/packs/<id>.ts` | Content computed when a lesson is made (algorithms, simulations, traces), builders for elements, and `presets(langs)`: gallery scenes for the studio |
| Storyboards | `scripts/darsi/packs/<id>.ts` | `bodies`: design.json bodies for Darsi storyboards, named after the element types |
| Docs | `docs/packs/<id>.md` | Each element: fields, animation, right to left, an example; the presets and bodies |
| Example | `examples/pack-<id>/` from `scripts/examples/pack-<id>.ts` | A lesson using every element, English and Arabic |
| Tests | `packages/spec/test/packs/<id>.test.ts`, `packages/player/test/packs/<id>.test.ts`, `scripts/test/packs/<id>.test.ts` | Validation, the authoring maths, rendering (jsdom), the same frame for the same time, right to left, the bodies |

The shared parts already handle packs: the validator (`packs/check.ts`), the player (`packs.ts`: one dynamic import per
pack; `Player.ready` waits for the packs a lesson uses), the JSON schema (one generic entry), the converter
(`scripts/darsi/packs/index.ts`), `npm run size` (one line per pack) and Darsi's vendoring (`lessonstudio-pack-<id>.js`).

## Renderers

`KitRenderer = (el, box, ctx) => (s: KitState) => void`. The player has already placed and sized `box` to the element's
`x`, `y`, `w`, `h` (mirrored in right-to-left languages unless `fixed`). Build the DOM once; return a painter.

- **Every frame is a pure function of `KitState`** (`reveal`, `draw`, `frame`, `focus`, `pass`): no timers, no state
  carried between frames, no `Math.random`. Write through `ctx.wr.style`, `ctx.wr.attr` and `ctx.wr.cls`, which skip
  writes that change nothing. Measuring is allowed once, the first time the box is on screen (see `math.ts`), never
  per frame.
- **Animation means:**
  - `reveal` (0–1): parts come in, in reading order.
  - `frame` (from 0; fractions blend where blending makes sense, otherwise round): the step of an algorithm or a
    simulation.
  - `focus` (from 1; 0 none): light the n-th part.
  - `pass` (0 → 1 forward, 1 → 2 back, −1 hidden): something travelling through.
  - Say in the docs what each means for your elements.
- **Old phones:**
  - Motion is transform and opacity (SVG attributes for positions are fine).
  - No filters, blur, blend modes or blurred shadows; shadows are hard offsets (`var(--ls-shadow)`).
  - About 300 DOM nodes per element at most.
  - Rebuild a path only when its frame changes.
- **No SVG ids** (a scene can be drawn twice at once); clip with a nested `<svg>` viewport.
- **Colours** only through the tones (`var(--ls-accent)`, `--ls-accent2`, `--ls-ok`, `--ls-danger`, `--ls-fg`, `--ls-muted`,
  `--ls-line`, `--ls-card`, `--ls-surface`, `--ls-bg`, `--ls-on-accent`, `--ls-hi-fg`), so both brands (`studio-dark`,
  `darsi-light`) work.
- **CSS** classes start with the pack's prefix: `pc-` code, `pd-` data, `pi-` iot, `pn-` network, `po-` opt.
- **Text:** at least 32 px on the 1280 × 720 stage for anything a learner must read, and 28 px for ticks and notes. An
  upright phone shows the stage about 360 px wide, so 32 px becomes 9 px. Fewer, bigger labels beat many small ones.
  `npm run layout-check -- <lesson>` reports text under 32 px as an error.
- **Budget:** 15 KB gzipped per pack (`npm run size`).

## Right to left

- **Mirror** what has a reading order: flowcharts, topologies, pipelines, sequences, tables. Use
  `ctx.mirror && !el.fixed`.
- **Don't mirror:** code, numbers, maths, time axes, charts and maps. Geography never flips.
- **Text** goes through `rich(text, rtl)` (`../../dom.ts`), which isolates Latin words, numbers and codes in
  `<bdi dir="ltr">`.
- **SVG roots** get `direction="ltr"`, with text anchors chosen explicitly; Arabic still shapes and reads correctly
  inside `<text>`.
- Labels are `Text` (per language), and authoring helpers take `langs` (use `tx(en, ar, langs)` from
  `packages/ops/src/science.ts`).

## Authoring helpers and presets

- **Content is computed when the lesson is made** (in ops, in Node), seeded, and stored in the element as data: a sort's
  steps, Dijkstra's frontier, a circuit's currents, a query's rows. The phone only draws.
  - `@micropython/micropython-webassembly-pyscript` (1.29.0-6) and `sql.js` (1.14.2) are installed as dev dependencies
    for code traces and queries. They are authoring-time only, never in the player.
- **`presets(langs, stage = "landscape")`** returns gallery scenes: `{ id, name: Text, scene }`.
  - Each is a canvas scene with a headline and the element, laid out inside the stage (`landscape` 1280 × 720, `portrait`
    720 × 1280, `square` 1080 × 1080).
  - Real narration in every language of `langs`: write every Text with `tx(en, ar, langs)`, friendly Modern Standard
    Arabic, never "·".
  - Keyframes on spoken words.
  - It validates with no warnings. The studio's `apps/studio/test/packs.test.ts` checks every pack's presets in all three
    shapes and with en+ar+fr.
- **`element(type, langs, box)`** returns a sensible default element of each type (the studio's "Add a pack element").
- **Per-frame data** goes in a top-level `frames` (or `steps`) list, so the `train` preset plays it (`framesOf`).
  `type` (reveal), `forward` and `backward` (pass) work on every pack element.
- **Validation codes:** reuse the shared ones where they fit (`badBox`, `badTone`, `missingText`, `badCount`, `badId`,
  `dupId`, `badRange`, `badPoints`, `badFrames`). New codes need a clear English `detail`.

## Storyboard bodies

`bodies[<type>] = (spec, c: BodyCtx) => Element[]`.

- `c.at(k, offset)` is the moment sentence k starts, in every language.
- `c.T(text, what)` turns a design text (`{ en, "ar-EG" }`) into the lesson's Text.
- `c.box` is the body area under the headline; `c.langs` and `c.where` are there too.
- Science and pack bodies take the full width: nobody is drawn beside them.
- Name sentences in the spec (`"s": 2`, `"frames": [1, 3]`) and time everything to them.
- Throw an Error naming `c.where` when a spec is wrong.
