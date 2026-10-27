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
phone, mail, link, warning, key, cloud, chip, wifi, check, cross, spark.

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
| `code` | `code` (a string with \n), `highlight` (1-based lines), `size` |
| `chart` | `kind` bar/line, `data` (numbers), `labels`, `max`, `w`, `h` |
| `group` | `children` (elements positioned inside the group) |

Tones (brand colours, so brands re-theme everything): `fg`, `muted`, `accent`, `accent2`, `danger`, `ok`,
`surface`, `bg`.

A track animates one property: `{"prop": "x"|"y"|"scale"|"rotate"|"opacity"|"draw"|"reveal", "keys": [key, ...]}`.
A key: `{"at": when, "value": number, "ease"?: "linear"|"in"|"out"|"in-out"|"back"|"step"}`; the ease shapes the
move from the previous key. Before the first key and after the last, the value holds. `draw` (0 to 1) draws a
stroke (lines, paths, shapes). `reveal` (0 to 1) shows text word by word, types code, grows a chart.

**`at` can be a spoken word**: `{"word": {"en": "passes", "ar": "تمر"}, "offset": 0.2}`. Each language then
animates on its own narration, so one animation stays in sync in every language. This is the main tool.

Ready-made animations (`animate_element`, or the `animate` operation) expand into keyframes:
fade-in, fade-out, pop, rise, slide-in, grow, pulse, draw, type, move-to (with `to: {x, y}`).

Scene extras: `"transition": {"type": "cut"|"fade"|"slide"|"wipe"|"zoom", "dur"?: 0.4}` (how the scene comes
in); `"camera": [tracks for "x", "y" (the stage point at the centre) and "scale"]` to pan and zoom.

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
