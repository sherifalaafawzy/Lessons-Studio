# Lesson Studio

Short explainer lessons (30–120 s) on tech, AI and cyber security that play on old phones over weak connections.

The core idea, from [PLAN.md](PLAN.md) §1.1: don't ship video. Ship a **Lesson Package**, the recipe for the video: a scene spec, narration audio, word timings and small vector assets. The learner's phone draws it. MP4 is only an export.

This repository holds:
- the Lesson Package format (v0.2: templates, plus a free canvas with keyframes tied to spoken words);
- a deterministic player;
- three example lessons in English and Arabic;
- narration: Gemini TTS, with every word timed against the audio;
- one set of lesson operations, shared by the studio and an MCP server that lets any AI platform build lessons;
- the studio: a web app to make and animate lessons, live-synced with AI edits.

The studio, the AI pipeline and the services come next (PLAN.md §12).

## Try it

```bash
npx -y npm@11.13.0 install
npm run dev
```

Then open http://localhost:4310. In the playground you can:
- pick a lesson, language, quality tier and shape;
- use "Preview as: Low-end phone, 3G";
- see the package's checks and its download size.

## What's here

| Path | What it is |
|---|---|
| `packages/spec` | `@lessonstudio/spec`: TypeScript types, JSON Schemas (`schema/`), `validatePackage()`, `estimateTiming()`, captions and WebVTT. |
| `packages/player` | `@lessonstudio/player`: the on-device player. It is framework-free and runs inside a shadow root. Every frame is a pure function of time. |
| `packages/ops` | `@lessonstudio/ops`: lesson operations (apply, undo, rebase), presets, the operation schema, the stored form and the store interface. |
| `packages/narrate` | `@lessonstudio/narrate`: Gemini TTS requests (now or batch), WAV handling, word alignment and assembling the narration track. |
| `apps/playground` | A Vite page to play, inspect and check packages. |
| `apps/server` | The MCP server (stdio and HTTP), sign-in for online clients (OAuth 2.1), frame rendering and the in-chat preview. |
| `apps/studio` | The studio (Preact, Firebase): lessons, storyboard, stage with handles, narration, cues, animation on spoken words, live sync, undo, checks, device preview. |
| `examples/` | Hand-written packages in English and Arabic: `prompt-injection` (AI security), `phishing-message` (cyber safety) and `how-ai-learns` (a canvas lesson). |
| `firebase/`, `firebase.json`, `.firebaserc` | Firestore rules and indexes, and the emulators (project `demo-lessonstudio`; the real project is `lessons-studio-6b509`). |
| `scripts/` | `narrate.mjs`, `make-timing.mjs`, `check-examples.mjs`, `size.mjs`. |
| `e2e/` | Playwright tests (desktop and a 375 px phone). |
| `services/ai` | `align.py`, the word aligner (Python, faster-whisper), with pinned `requirements.txt`. |
| `services/` | The rest is a placeholder for the API, orchestrator and workers (PLAN.md §10). |

## A Lesson Package

```
<lesson-id>/
  manifest.json        id, languages (dir, duration, tracks), brand, provenance, AI disclosure
  scenes.json          scenes: template + content + narration per language + cues + checks
  timing/<lang>.json   scene, sentence and word times: measured from the narration, or estimated without it
  captions/<lang>.vtt  made from the timings
  audio/<lang>.opus    narration, Opus mono 16 kbit/s
  audio/<lang>.m4a     the same in AAC, for browsers without Opus (older iPhones)
```

- **Six templates:** `title-hook`, `steps`, `flow`, `message-mock`, `quiz` and `summary`.
- **Cues** tie motion to the words: "when the narrator says *hides*, highlight the web page". Each cue gives the word in every language, so Arabic and English stay in sync with their own narration.
- **Quality tiers:** the player picks one from the device (Save-Data, memory, cores, reduced motion), and the learner can override it.
  - Full: motion.
  - Lite: no motion.
  - Frames: a still per scene.
  - Text: the transcript.

## Narration

`npm run narrate` gives a lesson its voice:
1. **Voice each sentence on its own** with Gemini TTS (`gemini-3.8-flash-lite-tts` by default). A sentence's start and end are then exact.
   - By default the sentences go in one **batch at half price**. Batches usually finish in minutes; Google allows up to 24 hours. `--now` voices them at once, at full price.
   - The voice comes from each language's `voice` in the manifest (name, model and a style such as "clear, warm and calm"). Arabic also asks for Modern Standard Arabic.
   - Every voiced sentence is cached in `.cache/narrate/` under a hash of its text, voice and settings, so an edit only re-voices the sentences that changed.
2. **Time every word.** Gemini returns no timestamps, so `services/ai/align.py` force-aligns the script's own words with Whisper (faster-whisper, on this computer, free). It also transcribes each sentence and flags any the voice didn't read as written.
3. **Build the track:** fixed pauses between sentences and scenes, Opus and AAC files, the timing file (`"source": "aligned"`) and captions, and the manifest's duration, voice, assets and AI disclosure.

Narration costs about half a cent a minute in a batch (PLAN.md Appendix C).

**Setting up:**
- The API key: put `GEMINI_API_KEY=<your key>` in `.env.local` at the repository root. It's gitignored, and the tool never prints it.
- The aligner, once:
  ```bash
  python -m venv services/ai/.venv
  ```
  ```bash
  services/ai/.venv/Scripts/python -m pip install -r services/ai/requirements.txt
  ```
  The first run downloads Whisper small (about 480 MB). Without the aligner, sentence times are still exact and words are spread within each sentence (`"source": "tts"`).
- ffmpeg comes with `npm install` (`ffmpeg-static`).

**Common runs:**

| Command | What it does |
|---|---|
| `npm run narrate -- --estimate` | Sentences, minutes of speech and cost per lesson and language. Sends nothing. |
| `npm run narrate -- prompt-injection --lang en --now --limit 1` | Voices one sentence now: a cheap check of the key and the voice. |
| `npm run narrate` | Voices everything not yet voiced in one batch, waits for it, then builds every example. |
| `npm run narrate -- --no-wait` | Submits the batch and stops. Run `npm run narrate` later to collect it and build. |
| `npm run narrate -- --offline` | Builds from cached audio only. |
| `npm run narrate -- <id> --missing list.json` | Lists the sentences without audio and the WAV file each needs, e.g. to record them by hand. Build them with `--offline`. |

After editing a narrated lesson's script, run `npm run narrate -- <id>` again. Until then the checker reports `timingStale`, because the old timings no longer match the words.

## Animation (format v0.2)

Templates lay themselves out. For anything else there is the `canvas` template: free elements (text, shapes,
lines and arrows, SVG paths, icons, images, code, charts, groups) on a design stage, each with keyframe tracks
for x, y, scale, rotate, opacity, draw and reveal, and six easing curves.

**A keyframe can be tied to a spoken word** (`"at": {"word": {"en": "passes", "ar": "تمر"}}`). Each language
then animates on its own narration, so one animation stays in sync in every language. Any scene can also have
overlays (free elements over a template), a transition (cut, fade, slide, wipe, zoom) and a camera that pans
and zooms. In right-to-left languages, free elements mirror; code and charts keep reading left to right.

`apps/server/src/guide.md` explains the whole format; it's also what AI platforms read through MCP.

## Server and MCP

`apps/server` lets any AI platform build lessons through MCP, with the same operations the studio will use.

- **Tools:** `list_lessons`, `create_lesson`, `get_lesson`, `edit_lesson` (any batch of operations, all or
  nothing), `add_scene`, `animate_element` (ready-made animations tied to words), `undo`, `validate_lesson`,
  `estimate_cost`, `render_frame` (a picture from the real player), `preview_lesson` (plays the lesson inside the
  chat in clients that support MCP Apps).
- **Resources:** the format guide, the operation schema, a full example lesson, and each lesson's JSON.
- **Prompts:** `storyboard_lesson`, `translate_lesson`.

**On this PC** (Claude Code, Claude Desktop, Cursor, Gemini CLI, VS Code), the client starts the server itself:

```bash
claude mcp add lessonstudio -- node H:/htdocs/lessonstudio/apps/server/src/stdio.ts
```

For other clients, use command `node` with that same path as the argument. Or run the HTTP server and use
`http://127.0.0.1:4320/mcp`:

```bash
npm start -w @lessonstudio/server
```

**Online, for ChatGPT and claude.ai, through ngrok:**
1. In `.env.local` set `LS_PUBLIC_URL` (your ngrok domain), `MCP_TOKEN_SECRET` (32 or more random characters),
   and either `LS_ALLOWED_EMAILS` with the Firebase web config (Google sign-in) or `LS_APPROVE_PASSCODE`.
   `.env.example` lists every setting.
2. Start the server, then the tunnel:
   ```bash
   ngrok http 4320 --url https://your-domain.ngrok.app
   ```
3. Add `https://your-domain.ngrok.app/mcp` as a custom connector (in ChatGPT, developer mode). The client
   registers itself, opens the sign-in page, and you approve.

Sign-in is OAuth 2.1 with PKCE only. Codes are single use and last one minute; access tokens last an hour;
refresh tokens last 30 days and work once. Only allowlisted, verified Google accounts (or the passcode) can
approve. Without `LS_PUBLIC_URL` the server accepts nobody from outside this PC, and it always refuses a
foreign Host header.

**Where lessons live:** until the Firebase project exists, in `.data/lessons/` on this PC. With
`LS_STORE=firestore`, a project id and a service-account key in `.secrets/firebase-admin.json`, they live in
Firestore, one document per scene, so a change sends only what changed.

## The studio

```bash
npm run emulators
```
```bash
npm run studio
```

**Live:** https://lessons-studio-6b509.web.app (the studio, sign-in with Google) and https://lessons-studio-6b509.web.app/mcp (the MCP server), both on Firebase.

To work on it locally, open http://localhost:4330. `npm run studio` uses the Firebase project in `.env.local`; `npm run studio:emulators` (port 4332) uses the emulators, where the sign-in screen offers a test account.
- `npm run emulators` builds the functions, then starts Auth (9399), Firestore (8280) and Functions (5401), with the emulator UI on 4120, so they don't clash with other projects' emulators. It needs Java 21 (`JAVA_HOME`). On Windows, if the emulators fail with a pipe error in a folder with spaces, also set `JAVA_TOOL_OPTIONS=-Djdk.net.unixdomain.tmpdir=C:\Users\Public`.
- On the emulators, Gemini calls go to a stand-in that the tests run (`GEMINI_API_BASE` in `functions/.env.demo-lessonstudio`), never to Google.

**What you can do:**
- **Lessons:** start one
  - from a brief: it starts as a title, the idea in three steps, and a summary, already animated on their words;
  - with **Draft with AI**: topic, audience, languages, length; Gemini writes the storyboard with your own key, and it is checked before you see it;
  - from one of the example lessons (Prompt injection, Spot a phishing message, How an AI model learns), copied into your account;
  - from a lesson file (`{manifest, scenes}`, as `get_lesson` returns it);
  - or open one an AI made through MCP.
- **Scenes:** "Add a scene" opens a gallery of 14 ready-made scenes (title, steps, pipeline, attack chain, scam text, phishing email, quiz, summary, big number, two sides compared, process with arrows, a chart that grows, code that types itself, a callout over a screen). Each is designed, narrated in English and Arabic, and animated on its own words; point at one to watch it. Or start a blank scene of any template. Scenes reorder, copy and delete; the storyboard shows each one's last frame.
- **The stage:** the real player.
  - Point at any text, box or element to see it; click to select it (a template's text opens its field in the panel).
  - **Double-click any text to type over it**, in the stage's language: only that language changes. Enter keeps it, Escape drops it.
  - Add text, boxes, circles, arrows, icons, code and charts. Drag to move, drag the corner to resize; arrow keys nudge (Shift for 10 px); Delete removes.
  - **Convert to canvas** turns a template scene into free elements laid out exactly as the player draws it, keeping every language and the cues on its texts.
- **Narration:** per language, with a word count and an estimated length.
- **The timeline**, under the stage: the scene's spoken words on a ruler, a row per element (and the camera and cues) with a diamond for each moment something changes.
  - Drag a diamond to retime it; drop it on a word to start it there (in this language; the others keep their words). Drag a row's bar to move its whole animation.
  - Click a diamond to change its values and curve, anchor it to words in every language, or remove it.
- **Animation:** pick a ready-made animation and the spoken word in each language that starts it, or use the playhead. Cues (highlight, pulse, reveal, move) work the same way.
- **Broken anchors:** when you reword the narration and an animation's word is no longer said, the checks offer "Pick the new word", which moves every animation waiting for it at once.
- **Live with AI:** an edit made through MCP appears at once, with a banner naming the client and the changed scenes marked.
- **Undo and redo** (Ctrl+Z, Ctrl+Y) undo only your own change, even after someone else edited the same scene.
- **Checks:** the validator runs live; click an issue to go to its scene.
- **Settings:** your Gemini key (checked with Google, stored encrypted, never shown again), your account and user id, and the studio's language.
- **Connect your AI:** the MCP address and the steps for ChatGPT, claude.ai, Claude Code, Claude Desktop, Cursor, VS Code, Gemini CLI and the stdio server on this PC, each ready to copy.
- **Preview** as a low-end phone on 3G, or on a desktop, with the download size.
- **Language:** the studio itself is in English or Arabic, and lays out right to left in Arabic. On a phone it shows one panel at a time.

**How edits are stored:** each edit applies at once on screen, then goes to Firestore as one batch:
- the lesson document with its revision plus one;
- the scenes it changed;
- a history entry.

The rules refuse a batch with a stale revision. When another person or an AI saved first, the studio rebases your edit on their version and sends it again. An edit that no longer fits is dropped, and the studio says so. Firestore's offline cache keeps the lesson on the device and queues an edit made without signal.

**The Firebase project** (`lessons-studio-6b509`, Firestore in europe-west1): its web config is in `.env.local`, and the studio uses it while `VITE_EMULATORS=0`. Set `VITE_EMULATORS=1` to work on the emulators instead. After changing the rules or indexes, deploy them:
```bash
npx firebase deploy --only firestore:rules,firestore:indexes --project lessons-studio-6b509 --account sherifalaafawzy@gmail.com
```

## AI drafting and MCP in the cloud (Cloud Functions)

`functions/` holds four callables and the MCP server, in europe-west1. `npm --prefix functions run build` bundles them (esbuild) with the shared packages, the MCP code from `apps/server` and the scene gallery; only `firebase-functions` and `firebase-admin` are installed.
- `saveAiKey`, `removeAiKey`, `aiKeyStatus`: each person's own key, checked with Google, sealed with AES-256-GCM under a key derived from the `AI_KEYS_SECRET` secret and their uid, in `aiKeys/{uid}` (no client can read it). Clients only ever see "set, ends with …abcd".
- `draftLesson`: the brief goes to `gemini-3.8-flash` with the format guide and five gallery scenes as examples. The validator checks the answer; errors, and animations on words nobody says, go back to Gemini to fix (twice at most). A draft that still has errors is refused. The lesson is stored in the person's account and opens in the studio. About 3 to 5 cents a draft; at most 40 drafts a day per person.
- `mcp`: the same MCP server as the desktop one, with Google sign-in (OAuth) and the Firestore store, served through Hosting at **https://lessons-studio-6b509.web.app/mcp**. Hosting serves the studio itself (`apps/studio/dist`, built by the deploy) at the same address, and sends `/mcp`, `/authorize`, `/token`, `/register` and `/.well-known/**` to this function. Only the accounts in `LS_ALLOWED_EMAILS` (in `.env.local`; `*` for any verified Google account) may sign in. `render_frame` needs a browser, so only the desktop server draws frames.

`functions/build.mjs` writes `functions/.env.lessons-studio-6b509` from `.env.local` (the public address, the web config, the allowed accounts). The secrets live in Secret Manager.

**Deploying** needs the Blaze plan on the project (on since 27 Oct 2026). The secrets were set once with random values:
```bash
npx firebase functions:secrets:set AI_KEYS_SECRET --project lessons-studio-6b509 --account sherifalaafawzy@gmail.com
```
```bash
npx firebase functions:secrets:set MCP_TOKEN_SECRET --project lessons-studio-6b509 --account sherifalaafawzy@gmail.com
```
(each a random value of 32 characters or more, piped in, never shown), and every time:
```bash
npx firebase deploy --only functions,hosting,firestore --project lessons-studio-6b509 --account sherifalaafawzy@gmail.com
```

**Size:** the studio's code is 60 KB gzipped. The Firebase SDK is a separate cacheable chunk of 194 KB gzipped, the next thing to trim.

## Light on old phones and weak connections

- **Learners download a recipe, not a video:** about 6 KB per lesson language, plus about 110 KB per minute of
  Opus narration.
- **The player is 19 KB gzipped.** It draws only while playing, and the Lite, Frames and Text tiers are picked
  from the device (memory, cores, Save-Data, reduced motion).
- **Animation is transform and opacity only.** No filters or blur; keyframes are computed once per scene.
- **The validator warns about budgets:**
  - more than 300 KB per language;
  - an image over 120 KB;
  - more than 40 elements in a scene;
  - more than 12 things moving at once.
- **Images** come with a small copy, which the lower tiers and small screens load. The next scene's images are
  fetched ahead of time.
- **When narration can't load,** the lesson plays on silently with captions.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | The playground on port 4310. |
| `npm test` | Unit tests (Vitest): spec, validator, schemas, timing, captions, cues, player determinism, tiers, right-to-left layout, checks. |
| `npm run check` | Validates every example package. |
| `npm run narrate` | Narrates the examples (see "Narration"). |
| `npm run timing` | Rewrites estimated timings and captions after editing `scenes.json`. It leaves narrated languages alone. |
| `npm run size` | The player's gzipped size against its 30 KB budget, plus each package's download size. |
| `npm run e2e` | Playwright tests. Set `CHROMIUM_PATH` to an installed Chromium if Playwright's own build isn't downloaded. |
| `npm run typecheck` | `tsc` for every package (and `npx tsc -p apps/server` for the server). |
| `npm start -w @lessonstudio/server` | The MCP server over HTTP on port 4320. |
| `npm run emulators` | Builds the functions, then the Auth, Firestore and Functions emulators for the studio (Java 21). |
| `npm run studio` | The studio on port 4330, on the Firebase project in `.env.local`. |
| `npm run studio:emulators` | The studio on port 4332, on the emulators. |
| `npm --prefix functions run build` | Bundles the Cloud Functions into `functions/lib/`. |

## Measured on 27 Oct 2026

- **Player:** 51.5 KB minified, 19.0 KB gzipped, with the canvas renderer, transitions and camera (14.7 KB before them).
- **In-chat preview page:** 51 KB, 19 KB gzipped.
- **Canvas smoothness:** at 4× CPU slowdown, no frames over 50 ms in the busiest scene of `how-ai-learns`.
- **A 57–64 s lesson in one language:** about 6 KB gzipped without audio. Opus narration at 16 kbit/s would add about 120 KB per minute, against the plan's 300 KB target per lesson.
- **Narration size:** a 58 s English lesson came to 104 KB of Opus, about 110 KB for the whole language. That test used the Windows voice in place of Gemini.
- **Word timing accuracy:** checked against the Windows voice's own word events on the same 17 sentences (144 words), after correcting its event clock, which runs 1.56× fast. Word starts were within 55 ms at the median, 119 ms at the 90th percentile and 205 ms at worst. Aligning 17 sentences took about 30 s on this computer's CPU.
- **Smoothness:** at 4× CPU slowdown in headless Chromium, there were no long animation frames over 50 ms in 8 s of the busiest scene. This is a desktop CPU slowed down, not a real low-end phone; PLAN.md §16 item 3 still stands.
