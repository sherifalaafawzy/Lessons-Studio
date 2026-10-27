# Services

PLAN.md §10 places these here, from Phase 2 on:

| Service | Language | Job |
|---|---|---|
| `api/` | Python, FastAPI | Auth, projects, versions, cost tracking, package validation (the same rules as `packages/spec`, from its JSON Schemas). |
| `orchestrator/` | Go | Job queue, retries, Instant vs Batch, content-hashed and resumable jobs. |
| `ai/` | Python | Script and storyboard, translation with a glossary, TTS (`gemini-3.8-flash-lite-tts`, batch at $3 per 1M audio tokens in 2026), and word alignment. **Started:** `align.py` does the word alignment today, run by `npm run narrate`; TTS lives in `packages/narrate` for now. |
| `render/` | Go plus headless Chromium and ffmpeg | MP4 export by calling the player's `renderAt(t)` frame by frame. |
| `media/` | Python plus ffmpeg | Transcoding uploads, speech recognition, and low-data versions. |

Only `ai/align.py` runs today. The player and the spec came first (PLAN.md §12, "Build order rationale").
