# Lesson Studio: how to build a lesson

A lesson is a short explainer (30 to 120 seconds) that the learner's phone draws itself from a small
recipe: scenes, narration and animation. It is never a video file, so it stays tiny on old phones and weak
connections. You build it by editing that recipe with operations, and every frame is a pure function of time.

## Workflow
1. `create_lesson` with a title and languages (for example English and Arabic). It starts with one title scene.
2. Add scenes with `add_scene` (or `edit_lesson` and `addScene`). Each scene has narration in **every** language.
3. Animate: tie motion to spoken words with `animate_element`, or use keyframes and cues through `edit_lesson`.
4. `validate_lesson` until there are no errors. Warnings are worth fixing too.
5. Look at your work with `render_frame` (a picture at any moment), or `preview_lesson` (plays in the chat when the client supports MCP Apps).
6. `undo` reverts the last edit if something went wrong.

Keep scenes short: one idea, at most about 70 words of narration. Prefer 4 to 8 scenes.

## Text and languages
- A text is either one string for every language (names, code, numbers) or one per language:
  `{"en": "Web page", "ar": "صفحة ويب"}`. Every language of the lesson needs its version.
- Right-to-left languages (Arabic, Persian, Urdu, Hebrew) mirror layouts automatically. Free elements
  mirror left and right too, except those marked `"fixed": true`; code and charts always read left to right.
- Arabic: Modern Standard Arabic, friendly. Never use "·" as a separator (it reads as a zero); use "،".
  Latin terms inside Arabic are fine: "حقن الأوامر (Prompt injection)".
- Security lessons teach defence and awareness, never step-by-step attacks.

## Scenes
Every scene: `{"id", "template", "narration": {"en": "...", "ar": "..."}, "content": {...}}`, plus optional
`cues`, `check` (a quick quiz shown when the scene ends), `overlays` (free elements on top), `transition`,
`camera`, `background` (a tone) and `mirror` (false to stop right-to-left mirroring).

Templates (fast, they lay themselves out and adapt to every screen shape):

| template | content | cue targets |
|---|---|---|
| `title-hook` | `{kicker?, title, hook?, icon?}` | `kicker`, `title`, `hook` |
| `steps` | `{title?, steps: [text, ...]}` (1 to 8) | `"1"`…`"n"`, `title` |
| `flow` | `{title?, nodes: [{id, label, icon?, tone?}], edges: [{from, to, label?}]}` | node ids, edges as `"from>to"`, `title` |
| `message-mock` | `{kind: "sms"\|"chat"\|"email", from, time?, subject?, lines: [text], link?, flags?: [{id, line, label}]}` | flag ids, `from`, `link` |
| `quiz` | `{title?}` and the scene's `check` | `prompt`, option ids |
| `summary` | `{title?, points: [text, ...], takeaway?}` | `"1"`…`"n"`, `takeaway`, `title` |
| `canvas` | `{elements: [element, ...]}`: free layout, see below | element ids |

Flow node tones: `neutral`, `trusted`, `system`, `danger`. Icons: user, page, bot, server, data, lock, shield,
phone, mail, link, warning, key, cloud, chip, wifi, check, cross, spark; and the shared library's 115 (for example
banknote, clock, school, users, flag, file, filter, hand, circlecheck, circlex, package, pencil, ruler, thermometer,
cloudrain, sprout, database, brain, cpu, search, megaphone, profile; the player fetches them once, about 6 KB).

A check: `{"type": "single-choice", "id", "prompt": text, "options": [{"id", "text"}], "answer": "<option id>", "explain"?: text}`.

## Cues: motion on a spoken word
`{"word": {"en": "trusts", "ar": "تثق"}, "action": "highlight"|"pulse"|"reveal"|"move", "target": "<id>"}`.
The word is matched in each language's narration (case, punctuation and Arabic diacritics ignored; an Arabic
word may carry a prefix such as و or ال). Use `"at": 2.5` (seconds into the scene) instead of a word when
needed, and `"occurrence": 2` for the second time a word is said. `move` sends a packet along a flow edge.

## Canvas: free elements and keyframes
The design stage is 1280×720 (landscape), 720×1280 (portrait) or 1080×1080 (square): the lesson's `stage`.
Positions are pixels from the top-left. Every element: `{"id", "type", "x", "y", "w"?, "h"?, "rotate"?,
"scale"?, "opacity"?, "tone"?, "fixed"?, "anim"?: [track, ...]}`.

| type | extra fields |
|---|---|
| `text` | `text`, `size` (px, default 40), `weight` 400/600/700/800, `align` start/center/end |
| `shape` | `shape` rect/ellipse/pill, `w`, `h`, `fill`, `stroke` (tones), `strokeWidth`, `radius` |
| `line` | `x2`, `y2` (the end point), `arrow` none/end/both, `strokeWidth`, `dash` |
| `path` | `d` (SVG path in its own 0 0 w h box), `w`, `h`, `fill`, `strokeWidth` |
| `icon` | `icon` (from the list above), `w`, `h` |
| `image` | `src`, `small` (a ~480 px copy), `alt`, `fit` cover/contain, `w`, `h` |

The shared library has a cast for any lesson, as `image` sources: `@lib/v1/cast/<who>_<mood>.svg`, where who is
amina, okafor, salma, joseph or farah (teachers) and mood is smile, talking, curious or happy (head and shoulders,
about 400 × 410 on the stage), plus the Darsi mark, `@lib/v1/brand/darsi-mark.svg`.
| `code` | `code` (a string with \n), `highlight` (1-based lines), `size` |
| `chart` | `kind` bar/line, `data` (numbers), `labels`, `max`, `w`, `h` |
| `group` | `children` (elements positioned inside the group) |
| `math`, `plot`, `net`, `arch`, `table` | the science elements (equations, plots, networks, model diagrams, tables): see below; they need `w` and `h` |

Tones (brand colours, so brands re-theme everything): `fg`, `muted`, `accent`, `accent2`, `danger`, `ok`,
`surface`, `bg`, `line` (the outline colour).

A track animates one property: `{"prop": "x"|"y"|"scale"|"rotate"|"opacity"|"draw"|"reveal"|"frame"|"focus"|"pass", "keys": [key, ...]}`
(the last three are for the science elements, below).
A key: `{"at": when, "value": number, "ease"?: "linear"|"in"|"out"|"in-out"|"back"|"step"}`; the ease shapes the
move from the previous key. Before the first key and after the last, the value holds. `draw` (0 to 1) draws a
stroke (lines, paths, shapes). `reveal` (0 to 1) shows text word by word, types code, grows a chart.

**`at` can be a spoken word**: `{"word": {"en": "passes", "ar": "تمر"}, "offset": 0.2}`. Each language then
animates on its own narration, so one animation stays in sync in every language. This is the main tool.

Ready-made animations (`animate_element`, or the `animate` operation) expand into keyframes:
fade-in, fade-out, pop, rise, slide-in, grow, pulse, draw, type, move-to (with `to: {x, y}`), and for the science
elements train, forward and backward.

Scene extras: `"transition": {"type": "cut"|"fade"|"slide"|"wipe"|"zoom", "dur"?: 0.4}` (how the scene comes
in); `"camera": [tracks for "x", "y" (the stage point at the centre) and "scale"]` to pan and zoom.

## Science elements: equations, plots, networks, model diagrams, tables
For lessons about AI, maths and data. The phone draws them from data (no images), so they stay light. Each needs `w`
and `h`. Networks and diagrams mirror in right-to-left languages (unless `fixed`); equations and plots read left to
right; tables follow the language, with numbers and `ltr` columns left to right.

**Equation** (`math`): `{"id": "eq", "type": "math", "x": 80, "y": 170, "w": 1120, "h": 140, "size": 64,
"tex": "\\g{1}{y} = \\sigma\\left(\\g{2}{w_1 x_1 + w_2 x_2} \\g{3}{+ \\c{accent}{b}}\\right)"}` (in JSON, a TeX
backslash is written `\\`). `tex` is one string, or one per language with the same `\g` parts. `align`
start/center/end; `size` 12 to 200 (the equation shrinks to fit its box); `"notation": "arabic"` sets right-to-left
languages right to left with Arabic-Indic digits (write that language's `tex` with Arabic letters).
- The TeX subset: letters and numbers, `+ - = < > ( ) [ ] , ; : ! ' | /`, `^` and `_` (braces for more than one
  character), `\frac{a}{b}`, `\sqrt{x}`, `\sqrt[n]{x}`, `\sum_{i=1}^{n}`, `\prod`, `\int`, `\max_x`, `\min`, `\lim`,
  `\argmax`, Greek (`\alpha` to `\omega`, `\Sigma`), `\cdot \times \le \ge \ne \approx \to \in \partial \nabla \infty
  \ldots`, `\hat \bar \vec \tilde \dot`, `\mathbf`, `\text{…}`, `\mathrm`, `\operatorname{softmax}`, `\log \ln \exp
  \sin \cos \tanh`, `\left( … \right)`, `\begin{bmatrix} a & b \\ c & d \end{bmatrix}` (also matrix, pmatrix,
  vmatrix, cases; up to 6 × 6), spaces `\, \; \quad`. At most 400 characters; anything else is an error that names
  the place.
- Lesson Studio's own: `\g{n}{…}` is part n (n from 1): `reveal` brings the parts in in order and `focus` lights one.
  `\c{tone}{…}` colours a part (fg, muted, accent, accent2, danger, ok). `\w{key}` is a word from the element's
  `words`, in the lesson's language: `"words": {"loss": {"en": "loss", "ar": "الخسارة"}}`.

**Plot** (`plot`): axes with series. `{"id": "p", "type": "plot", "x": 200, "y": 150, "w": 880, "h": 500,
"xr": [-4, 4], "yr": [-1.2, 1.2], "grid": true, "xLabel": {"en": "Input", "ar": "المدخل"}, "series": [{"kind": "fn",
"fn": "sigmoid(x)", "tone": "accent", "label": {"en": "sigmoid", "ar": "السيجمويد"}}]}`. `xTicks`/`yTicks` list the
axis numbers. Up to 8 series:
- `fn`: y as an expression in `x` and the parameters `a b c d`: `+ - * / ^`, brackets, `sin cos tan tanh exp log ln
  log2 log10 sqrt abs floor ceil round sign sigmoid relu step`, `max(p, q)`, `min`, `pow`, and `pi`, `e` (write
  `2*pi`). `"params": [[a, b], [a, b], ...]` gives the parameters per frame (frames blend: a line turning as it fits).
- `line`, `area`, `dots`: `"pts": [[x, y], ...]` (up to 400), or `"frames"` (one point list per frame). Dots take
  colours from `"cls"` (0 accent, 1 ok, 2 danger, 3 accent2) or `"clsFrames"`.
- `heat`: a grid over the plot, rows from the top (up to 32 × 32), class ids 0–3, or values 0–1 with `"scale": true`;
  `"frames"` for a decision map changing as a model trains.
- `hline`/`vline`: `"at": value` (a threshold). `marker`: `"pts"`, one position per frame, `"trail": true`.
- `tone`, `dash` and a `label` per language on any series but `heat`. `frame` is the frame shown when no track moves it.

**Network** (`net`): `{"id": "n", "type": "net", "x": 180, "y": 150, "w": 920, "h": 500, "layers": [2, 4, 1],
"labels": {"in": ["x₁", "x₂"], "out": ["y"]}, "values": true}`. Up to 8 layers of 10, 40 neurons, 200 lines.
`weights[frame][layer][from][to]` and `acts[frame][layer][neuron]` (−1 to 1) are optional; without them the lines show
a sample pattern. `labels.layers` names each layer; `values` writes activations in the neurons.

**Model diagram** (`arch`): blocks and arrows, laid out automatically. `{"id": "m", "type": "arch", "x": 40, "y": 150,
"w": 1200, "h": 470, "blocks": [{"id": "in", "kind": "input", "label": {"en": "Tokens", "ar": "الرموز"}}, {"id": "att",
"kind": "attn", "label": {"en": "Attention", "ar": "الانتباه"}, "note": "8 heads"}, {"id": "out", "kind": "softmax",
"label": {"en": "Next token", "ar": "الرمز التالي"}}], "edges": [{"from": "in", "to": "att"}, {"from": "att", "to":
"out"}, {"from": "in", "to": "out", "skip": true}], "groups": [{"id": "g", "label": {"en": "Block", "ar": "كتلة"},
"repeat": 6, "blocks": ["att"]}], "flow": "right"}`.
- Kinds: input, output, embed, dense, conv, pool, attn, norm, ffn, add, concat, softmax, act, rnn, store, tool, model,
  box. Up to 24 blocks; every block needs a label.
- `skip` arrows (residual connections, a tool's result going back) go around the blocks between; the other arrows must
  not loop. A group gets a dashed frame and "× repeat". `flow`: right (default), down (better on portrait stages), up.

**Table** (`table`): `{"id": "t", "type": "table", "x": 240, "y": 160, "w": 800, "h": 360, "size": 32,
"cols": [{"en": "Model", "ar": "النموذج"}, {"en": "Accuracy", "ar": "الدقة"}], "rows": [[{"en": "Small",
"ar": "صغيرة"}, "81%"], [{"en": "Bigger", "ar": "أكبر"}, "93%"]], "ltr": [1]}`. Up to 12 rows of 8 columns; a cell is a
string, a number, or text per language.

**Their animation** (keyframes like any other, anchored to spoken words):
- `reveal` 0 → 1 brings them in: an equation's `\g` parts in order, a plot's lines drawn left to right and dots in
  order, a network layer by layer, a diagram's blocks along the arrows, a table row by row.
- `frame` (from 0; fractions blend) picks a snapshot of a plot or network that has frames (training rounds).
- `focus` lights the n-th part (from 1; 0 lights none): an equation's `\g` part, a plot's series, a network's layer,
  a diagram's block (in `blocks` order), a table's row. Use `"ease": "step"` so it switches at once.
- `pass` on a network or diagram: 0 → 1 sends data forward, 1 → 2 sends the error back, −1 hides it (the default).
- Presets: `type` (reveal), `train` (frame from the first to the last, on plots and networks), `forward` and
  `backward` (a pass, on networks and diagrams).

Example: light a diagram's third block when "attention" is said, then send data through on "repeats":
`{"prop": "focus", "keys": [{"at": {"word": {"en": "attention", "ar": "الانتباه"}}, "value": 3, "ease": "step"}]}` and
`animate_element` with preset `forward` at `{"en": "repeats", "ar": "وتتكرر"}`.

The resource `lessonstudio://examples/inside-a-neural-network` is a complete lesson with all five: an equation built
term by term, activation functions, a network trained for real (weights per frame), its decision map and loss curve,
gradient descent, a CNN and a transformer, and a table, in English and Arabic.

## Technology packs: programming, data, IoT, networks, optimization
Five more packs of element types, one per technology, drawn by a file the phone downloads only for lessons that use
them. The contract is `lessonstudio://docs/packs` (`docs/packs.md`); each pack's fields, animation, right-to-left rules
and an example are in `lessonstudio://docs/packs/<id>` (`docs/packs/<id>.md`), listed with the resources once the pack
has its page. The science elements above are a pack too (`lessonstudio://docs/science`).

| pack | element types |
|---|---|
| `code` | `trace`, `flowchart`, `array`, `calltree`, `codediff` |
| `data` | `erd`, `query`, `pipeline`, `sheet` |
| `iot` | `circuit`, `pinout`, `signal`, `gates`, `bits` |
| `network` | `topology`, `sequence`, `layers`, `packet` |
| `opt` | `graph`, `schedule`, `knapsack`, `lp`, `searchtree` |

- Add one like any free element: `addElement` with `{"id", "type": "<a type above>", "x", "y", "w", "h", ...its own
  fields}`. Every pack element needs `w` and `h`; its texts are per language like everywhere else.
- Read the pack's page before writing one: its fields are its own, and `validate_lesson` reports the pack's errors at
  exact paths (for example `scenes[2].content.elements[1].rows[3]`). Fix them with `updateElement`.
- Animate with keyframes (`setKeyframe` or `setTrack`) on `reveal`, `frame`, `focus` and `pass`; the pack's page says
  what each does for its elements. The motion presets (fade-in, pop, rise…) work too.
- Put computed content (an algorithm's steps, a query's rows, a circuit's currents) in the element as data: the
  phone only draws.

## Operations (`edit_lesson`)
A batch applies whole or not at all, and can be undone. The main ones:
`addScene {scene, at?}`, `removeScene`, `moveScene {to}`, `duplicateScene {id}`, `replaceScene {value}`,
`setNarration {scene, lang, text}`, `set|insert|remove {scene, path, value?}` (JSON Pointer inside a scene,
e.g. `"/content/title/ar"`, `"/cues/-"` to append), `addCue`, `addElement {scene, element, at?, parent?}`,
`updateElement {scene, element, props}` (null removes a prop), `removeElement`, `moveElement {to}` (drawing
order), `setKeyframe {scene, element, prop, key}`, `removeKeyframe`, `setTrack {keys or null}`,
`animate {scene, element, preset, at, dur?}`, `setCamera {scene, tracks}`, `setMeta`, `addLanguage`,
`removeLanguage`. The full schema is the `lessonstudio://ops-schema` resource.

## Light on old phones
- Animate transform and opacity only (that's all the format can do, on purpose).
- At most 40 elements in a scene, and at most 12 things moving at the same moment.
- Images: WebP, under 120 KB, never with text inside (one image serves every language). Give a `small` copy.
- A lesson in one language should stay under 300 KB, narration included.
- `validate_lesson` warns about all of these.

## Example
The resource `lessonstudio://examples/how-ai-learns` is a complete canvas lesson in English and Arabic:
connections drawn on "connects", a signal travelling on "passes", code typed while the narrator explains,
a chart that grows, and a camera that zooms in.
