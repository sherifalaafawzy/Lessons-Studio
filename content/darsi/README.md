# Darsi tutorial videos

The 12 lesson videos from Darsi's three course packs (`H:\htdocs\darsi\trainings\*.zip`), as Lesson Studio lessons in
English and Egyptian Arabic (`ar-EG`, right to left):

| Pack | Lessons |
|---|---|
| AI basics | AI-1-1-1 … AI-1-1-4 |
| Passwords and phishing | CY-1-1-1 … CY-1-1-4 |
| Sensors | IOT-1-2-1 … IOT-1-2-4 |

## Files

- `source/<ID>.json`: the pack's storyboard, unchanged (scenes with beat, voice, narration, on-screen text, visual, icons;
  chapters; checkpoints). English only.
- `<id>/ar-EG.json`: the Egyptian Arabic, written for these videos.
- `<id>/design.json`: what each scene shows on screen.
- `lessons/<id>/{manifest,scenes}.json`: the lessons, **generated**. Never edit them by hand; change the files above
  and convert again.

The shared library (cast, extended icons, the Darsi mark) is in `apps/studio/public/lib/v1/`, built from the AI pack by
`scripts/build-library.mjs`. Lessons refer to it as `@lib/v1/...`.

## Commands

```bash
node scripts/darsi/sentences.ts CY-1-1-2          # the storyboard sentence by sentence (with the Arabic, once written)
node scripts/darsi/convert.ts CY-1-1-2            # writes lessons/cy-1-1-2/ and checks it (no ID: all 12)
node scripts/darsi/sheet.ts cy-1-1-2              # out/sheets/cy-1-1-2-en.png: every scene as it ends
node scripts/darsi/sheet.ts cy-1-1-2 --lang ar-EG # the same in Arabic
node scripts/darsi/sheet.ts cy-1-1-2 --at 0.5     # mid-scene instead
```

`sheet.ts` needs Chromium: set `CHROMIUM_PATH` to Playwright's `chrome.exe` if it isn't found.

The converter must report **0 errors and 0 warnings** for every lesson. The lessons are 2.5 to 3 minutes, so the
validator's `longLesson` note (over 150 s) is expected and not counted.

## How the converter builds a scene

| Beat | Scene |
|---|---|
| Title | The title card: the track, the lesson title and subtitle, the Darsi mark. Nothing to design. |
| Checkpoint ◆ | The quiz, from the storyboard's checkpoint (prompt, options, answer, the correct feedback). Nothing to design. |
| Recap | The summary: `points` and `takeaway` from design.json. |
| Hook | The speaking cast member, their first sentence in a speech bubble, and the design's body. |
| Everything else | The headline (the on-screen text) and the design's body. A cast member stands on the right when they speak (and on "Try it tomorrow"). |

Every animation starts on a word said in that sentence, in each language separately, so the Arabic animates on its own
words. The word is picked automatically: the first word of the sentence that is said only once in the scene.

## ar-EG.json

```json
{
  "title": "اكشف رسالة النصب",
  "subtitle": "خمس علامات تحذير، وتعمل إيه بعدها",
  "scenes": {
    "1": { "narration": "…" },
    "3": { "narration": "…", "on_screen_text": "…" }
  },
  "checkpoints": [
    { "prompt": "…", "options": ["…", "…"], "feedback_correct": "…", "feedback_wrong": "…" }
  ]
}
```

- **Every scene** needs `narration`; scenes with on-screen text in the storyboard need `on_screen_text`.
- **The same sentence breaks as the English.** Each scene's Arabic narration must split into exactly as many sentences
  as the English (`.`, `!`, `?`, `؟`, `…` end a sentence). The converter refuses a scene that doesn't.
  `sentences.ts` shows both side by side.
- **Checkpoints** in the storyboard's order, options in the same order.
- **Egyptian Arabic**, the way an Egyptian teacher would explain it to colleagues: friendly, clear, spoken. Not Modern
  Standard Arabic, and not slang that a teacher wouldn't say in a training.
- **Terms as Egyptian teachers say them:**

  | English | Egyptian Arabic |
  |---|---|
  | AI | الذكاء الاصطناعي |
  | chatbot | شات بوت |
  | (AI) model | نموذج |
  | data, examples | بيانات، أمثلة |
  | phishing, scam | النصب (رسالة نصب) |
  | password | الباسورد |
  | PIN | الرقم السري |
  | code (one-time) | كود |
  | link, email, app | لينك، إيميل، التطبيق |
  | phone | الموبايل (a call: تليفون، مكالمة) |
  | two-step sign-in | التحقق بخطوتين |
  | sensor | حساس |
  | IoT | إنترنت الأشياء |
  | Wi-Fi | الواي فاي |
  | pupils | التلاميذ |
  | head teacher | مدير المدرسة |
  | class(room) | الفصل |
  | tomorrow | بكرة |

- **Digits** are Western (0–9), as in Darsi. Spoken numbers in narration are written as words, like the English.
- **Never "·"** in Arabic (it reads as a zero). Separate with "،".
- **Quotes** are « ».
- Keep names (Salma, Okafor…) as Arabic names: سلمى، أوكافور، أمينة، جوزيف، فرح.

## design.json

```json
{ "scenes": { "4": { "list": [ { "icon": "clock", "text": { "en": "Urgency or threats", "ar-EG": "استعجال أو تهديد" }, "s": 1 } ] } } }
```

Keys are scene numbers. Text is `{ "en": "…", "ar-EG": "…" }` (a plain string is the same in both languages: numbers only).
`s` is the sentence (counted from 0, as `sentences.ts` prints them) whose start brings the item in. Without `s`, the
item comes in on the English sentence that names it, else in order.

**One body per scene:**

| Key | Shows | Good for | Limits |
|---|---|---|---|
| `cards` | Icon cards in a row, a label under each. `"arrows": true` chains them with arrows. | Who, what, a sequence of events | 2–4 cards, labels ≤ 5 words |
| `list` | Rows of icon + text. `"aside": "<icon>"` puts a big icon in the empty half. | Signs, examples, tips, try-it steps | 2–5 rows, ≤ 9 words each |
| `steps` | Numbered steps (Lesson Studio's steps template). | A habit, a procedure | 2–4 steps, ≤ 8 words each |
| `message` | A phone message or email, with warning flags called out. | Phishing examples | 1–3 lines; flags ≤ 4 |
| `compare` | Two columns, each with a title, icon, colour and items. | Yes/no, before/after, AI/not AI | ≤ 3 items per column, ≤ 6 words each |
| `big` | One big number or word, with a label. | "10 mm", "24 hours" | Value ≤ 8 characters |
| `chart` | A bar or line chart that draws itself, with values on the bars. | Readings, rainfall, results | ≤ 8 values |
| `flow` | Nodes and arrows (the flow template). | Pipelines | 3–5 nodes |

```jsonc
// cards
{ "cards": [ { "icon": "banknote", "text": {…}, "s": 0, "tone": "ok" } ], "arrows": true }
// list
{ "list": [ { "icon": "pencil", "text": {…}, "s": 0 } ], "aside": "warning" }
// steps
{ "steps": [ { "text": {…}, "s": 1 } ] }
// message: line is 0-based, or "from" or "link"
{ "message": { "kind": "sms", "from": {…}, "time": "09:41", "lines": [ {…} ], "link": "bit.ly/…",
  "flags": [ { "line": 0, "text": {…}, "s": 2 }, { "line": "link", "text": {…}, "s": 3 } ] } }
// compare: tone is "ok" (green), "danger" (red) or "accent" (orange)
{ "compare": { "left":  { "title": {…}, "icon": "circlecheck", "tone": "ok", "s": 0, "items": [ { "icon": "…", "text": {…}, "s": 1 } ] },
               "right": { "title": {…}, "icon": "circlex", "tone": "danger", "s": 2, "items": [ … ] } } }
// big
{ "big": { "value": "10 mm", "label": {…}, "icon": "ruler", "s": 1 } }
// chart
{ "chart": { "kind": "bar", "data": [3, 0, 12, 7, 5], "labels": [ {"en": "Mon", "ar-EG": "الاتنين"}, … ], "unit": {…}, "s": 1 } }
// flow: tone is "neutral", "trusted", "system" or "danger"
{ "flow": { "nodes": [ { "id": "data", "icon": "database", "text": {…}, "s": 0 } ], "edges": [ ["data", "model"] ] } }
```

**Also, per scene:**

- `headline`: replaces the on-screen text (`null`: none).
- `who`: a cast member (`amina`, `okafor`, `salma`, `joseph`, `farah`) on the right, or `null` for nobody.
  `mood`: `smile`, `talking`, `curious` or `happy`.
- `quote`: the hook's speech bubble, if not the first sentence.
- `tone` on an item: `ok`, `danger` or `accent` (the default).
- Recap: `points` (3–4 items, ≤ 6 words each; usually all with the `s` of the sentence that lists them) and `takeaway`
  (one line, ≤ 12 words).

**Icons:** the player's 18 (`user page bot server data lock shield phone mail link warning key cloud chip wifi check
cross spark`) and the library's 115 (`packages/spec/src/library-icons.ts`). The storyboard's `icons` are a good start.

## What good looks like

- Every scene **says something on screen**: no bare icons. A viewer with the sound off follows the lesson.
- On-screen words are **short**: the narration carries the detail.
- Items come in **as they are said** (`s`), never all at once at the start.
- **Both languages** checked on the contact sheets: nothing cut off, nothing overlapping, the Arabic right to left.
- `cy-1-1-2` is the reference lesson.
