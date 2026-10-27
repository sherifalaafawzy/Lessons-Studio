# Plan: AI Byte-Sized Course Video Creator ("Lesson Studio")

**Status:** Draft v0.1 · **Date:** 27 Oct 2026
**One-line vision:** A creator studio with excellent UX that turns a topic, a document, an uploaded video or an avatar into short (30–120 s) explainer lessons on tech, AI and cybersecurity, and delivers them so cheaply and so lightly that they run on old phones over weak connections.

> **Assumption:** this is the content engine for the teacher-upskilling PWA (AI, IoT, cybersecurity; multilingual RTL/LTR; offline-friendly). Nothing below depends on that. It can stand alone as a product.

---

## 1. Key findings that shape the plan (read first)

These are the points where the plan differs from the obvious approach.

### 1.1 Video is the wrong delivery format for the target market
The explainer videos that inspired this (dark UI, animated diagrams, karaoke captions) are **vector graphics, text and a voice track**. Rendering them to MP4 and shipping them throws away most of what makes them cheap. Shipping the *recipe* (a scene spec, compressed audio, small vector assets) and rendering on the learner's device gives:

- Roughly 10–50x smaller payloads than MP4 (targets in §9).
- Crisp text and diagrams at any screen size, with RTL support.
- Per-learner options for free: language, captions, speed, high contrast, data saver.
- Zero server-side render cost per view.

**Decision:** the primary artifact is a **Lesson Package** (open format, §6). MP4 is an *export target* for WhatsApp, YouTube and TikTok distribution, not the core format.

### 1.2 Gemini 3.8 Live Avatar is real, but it is not the batch or low-bandwidth tool
Checked on 27 Oct 2026 against several sources (re-verify before committing; this moves fast):

- Announced 24 Sep 2026 as **Gemini 3.8 Live with Live Avatar**, a real-time layer that adds a lip-synced, expressive video avatar to the Gemini 3.8 Live conversational model.
- Reported as available in **Gemini Enterprise**. Custom avatars (from a reference image) are **enterprise-allowlist only**. Preset avatars exist.
- Reported **not** to be a standalone Gemini API model ID, and **no published pricing**. Pricing and regional availability were not published in the reviewed sources.
- Reported to support **a few minutes of continuous interaction**, not long sessions.
- It is **real-time, interactive** video generation. That is the opposite of both goals: batch pricing doesn't apply to a live session, and streaming generated video is bandwidth-heavy.
- Output carries SynthID watermarking, according to the reviewed sources.

**Decision:** Live Avatar is a **later optional module** (a live "ask the tutor" session for institutions with Gemini Enterprise access). It is **not** the avatar for pre-produced byte-sized lessons. The default lesson avatar is a lightweight pre-computed or client-rendered one (§7).

### 1.3 "Batch to save money" works, but only for the right steps
Batch and off-peak processing applies to the *offline* steps: script generation, translation, TTS, image generation, quality checks. Most major model providers offer a discounted asynchronous batch tier (historically around 50% off with up to ~24 h turnaround; **verify current rates and which models, especially TTS, are eligible**). It does not apply to live sessions. The studio must therefore expose an explicit **"Instant" vs "Batch (cheaper, ready in hours)"** choice and show the cost before the creator commits.

### 1.4 The bigger savings come from not generating things
Ranked by impact: (1) render on-device instead of server-side; (2) reuse and cache (same narration in the same voice is generated once); (3) templates instead of generated layouts; (4) batch tiers; (5) a cheaper model for easy steps and a stronger model only where quality matters (routing). Model prices matter less than architecture.

---

## 2. Goals and non-goals

### Goals
1. A creator can go from **topic or document → reviewed, publishable lesson in under 15 minutes**, with the creator in control at every step.
2. Support four **input paths**: AI-generated, uploaded video, uploaded avatar/presenter, and hybrid (mix of the three in one lesson).
3. Lessons play well on **2–3 year-old low-end Android phones** and on **2G/3G-class or intermittent connections**.
4. **Multilingual from day one** (Arabic RTL and LTR languages first-class), including captions and narration.
5. **Cost per finished lesson** is known, shown up front, and low enough to be sustainable for a self-funded team.
6. Content that is **accurate, labelled as AI-assisted, and reviewable**.

### Non-goals (for now)
- Photoreal cinematic video generation (diffusion video). Imprecise for diagrams and text, and expensive.
- Long-form courses or livestreaming.
- A general-purpose video editor. We build a lesson editor.
- Building our own foundation models.

---

## 3. Users

| Persona | Needs | Design implication |
|---|---|---|
| **Course creator / instructional designer** | Speed, control, trust in accuracy, brand consistency | Storyboard-first studio, approve-before-spend, templates, brand kit |
| **Subject expert (teacher, engineer)** | Not a designer or video editor | Edit text, not timelines; AI handles layout |
| **Learner on a low-end phone** | Lessons that load fast, work offline, cost little data | Lesson Package, data saver, offline download, audio-optional |
| **Reviewer / institution** | Quality, safety, compliance, audit trail | Review queue, version history, provenance and AI-disclosure metadata |

---

## 4. Product scope

### 4.1 Creator Studio (web app, TypeScript PWA)

**Core flow:** `Brief → Storyboard → Approve → Generate → Review → Publish/Export`

1. **Brief.** Topic, audience, level, language(s), target length, tone. Optional sources: upload PDF/slides/URL/video.
2. **Storyboard (the center of the UX).** AI proposes 4–10 beats. Each beat is a card with narration text, a visual type and an estimated duration. The creator edits text, reorders, deletes, regenerates a single beat, or locks a beat so regeneration never touches it. **Nothing expensive runs until the storyboard is approved.**
3. **Cost and mode panel.** Before generation: estimated cost, time, and the Instant/Batch toggle. After: actual cost per lesson.
4. **Generate.** Voice, visuals and captions are built per scene, previewed as soon as each is ready (progressive, not all-or-nothing).
5. **Review.** Live preview in the real player, with device and bandwidth emulation ("preview as: low-end phone, 3G"). Fact-check pass (§11) shows flagged claims with sources.
6. **Publish/Export.** Lesson Package (default), MP4 (9:16, 1:1, 16:9), captions (VTT/SRT), PDF/PPTX handout (matches the teacher-slides need).

**UX principles ("super UI/UX" made concrete):**
- **Edit meaning, not pixels.** Changing a sentence regenerates that beat's audio and visuals. There is no raw timeline to fight with by default (an advanced timeline view exists).
- **Always-visible preview**, always the true player, never a mock.
- **Reversible and cheap to try.** Undo history, per-beat versions, "try another take" with a cost chip on every generative button.
- **Progressive disclosure.** Simple surface for subject experts, an Advanced drawer for designers (easing, timing, scene JSON).
- **Templates over blank canvas.** Scene templates for the common explainer shapes (§5).
- **Brand kit.** Fonts, colours, logo, caption style, avatar and voice presets applied automatically.
- **RTL and LTR as first-class.** The studio UI and the lesson output mirror correctly. Mixed-direction text (Arabic with English technical terms and code) is tested explicitly.
- **Accessibility.** Keyboard navigation, screen-reader support, contrast checks, captions always generated.
- **Mobile-capable.** Reviewing and approving lessons works on a phone, since many creators will have only that.

### 4.2 Learner Player (PWA component, embeddable)
- Plays Lesson Packages offline-first. Tap-to-advance micro-scenes, scrubbing, speed control (0.75x–1.5x).
- **Captions always on by default**, audio optional (works muted in classrooms and on shared devices).
- **Data Saver mode:** audio-only plus static scene frames, or text-only.
- Resume playback, download for offline, background sync of progress.
- Interactive checks between scenes (the quiz/question types from the main course product).

### 4.3 Inputs

| Path | What the user provides | What the system does |
|---|---|---|
| **A. AI-generated** | Topic and/or source documents | Script → storyboard → scenes → voice → captions |
| **B. Uploaded video** | A talking-head or screen recording | Transcribe, segment into beats, add captions, translate, overlay diagrams and callouts, compress to low-bandwidth variants (§9) |
| **C. Uploaded avatar/presenter** | An image, a short consented video, or a rigged character | Drive with TTS audio (§7) |
| **D. Hybrid** | Any mix | Beats can each use a different source type |

### 4.4 Outputs
Lesson Package (primary), MP4 variants, captions, per-language audio tracks, PDF/PPTX handout, embeddable player snippet, shareable link.

---

## 5. Scene template library (tech, AI and cyber focus)

A template is a parameterised, hand-designed scene. AI fills in content, so layouts are always clean.

- **Title and hook card** (with animated kinetic type)
- **Step-by-step explainer** (numbered cards with progress bar)
- **Architecture diagram** (nodes, edges, animated data packets)
- **Pipeline / flow** (e.g., RAG pipeline: ingest → embed → retrieve → answer)
- **Attack chain / kill chain** (stage-by-stage highlight)
- **Prompt-injection / agent-attack walkthrough**
- **Network and device map** (IoT topology, with a simple 3D option)
- **Terminal and code typing** (with line highlight)
- **Before/after and good/bad comparison**
- **Phishing or fake-message example** (phone or email mockup)
- **Concept metaphor** (3D prop: lock, shield, key, server rack; optional)
- **Quiz and recall card**
- **Call to action / summary card**

3D is **optional and lazy-loaded** (Three.js, procedural geometry first, glTF only when justified), because it is the most expensive item for old devices (§9).

---

## 6. The Lesson Package format

An open, versioned, self-describing bundle.

```
lesson-<id>/
  manifest.json        # id, version, languages, durations, tracks, licences, provenance, AI-disclosure
  scenes.json          # scene spec: templates, content, timing cues, quiz hooks
  audio/<lang>.opus    # narration, mono, 12–24 kbps
  timing/<lang>.json   # word timings and visemes, drives captions and avatar
  captions/<lang>.vtt
  assets/              # SVG, AVIF/WebP, small fonts (subsetted), optional glTF
  poster.avif          # first-frame preview
```

**Rules:**
- The player renders every frame as a **pure function of time `t`**. This makes it seekable and deterministic, so the same code that plays on a phone also renders MP4 exports headlessly.
- Assets are content-addressed (hash names) so they cache and deduplicate across lessons.
- Fonts are subsetted per language and loaded on demand.
- Provenance and AI-disclosure metadata are part of the manifest (§11).

**Scene spec example:**
```json
{
  "version": "0.1",
  "lang": "ar",
  "dir": "rtl",
  "scenes": [
    {
      "id": "s1",
      "template": "attack-flow",
      "narration": "A prompt injection hides instructions inside content the model trusts.",
      "content": {
        "nodes": ["User", "Web page", "LLM agent", "Internal API"],
        "edges": [["User", "LLM agent"], ["Web page", "LLM agent"], ["LLM agent", "Internal API"]]
      },
      "cues": [
        { "word": "hides", "action": "highlight", "target": "Web page" },
        { "word": "trusts", "action": "pulse", "target": "LLM agent" }
      ],
      "check": { "type": "single-choice", "id": "q1" }
    }
  ]
}
```

---

## 7. Avatar strategy (tiered, cheapest first)

| Tier | What it is | Cost / weight | When to use |
|---|---|---|---|
| **0. No avatar** | Narration plus animated diagrams | Lowest | Default. Often the best teaching format |
| **1. Vector character** | 2D SVG/Lottie character, mouth driven by visemes from TTS timings | Tiny (KBs), renders on-device | Branded mascot or friendly presenter, great for low-end devices |
| **2. Photo/video avatar, pre-rendered** | Lip-sync model animates an uploaded consented image; batch-rendered on GPU | Moderate; rendered once, shipped as small video clip | Creators who want a human presenter |
| **3. Uploaded real presenter** | The creator's own recorded video, processed and compressed | Depends on source | Authentic teacher voice |
| **4. Live interactive avatar (Gemini 3.8 Live Avatar)** | Real-time tutor in a live session | Highest; real-time compute and bandwidth; enterprise-gated; short sessions | **Later pilot only**, for institutions with access |

**Rules for all avatars:**
- Consent and rights are recorded for every likeness (who, what, where it may be used). No third-party likeness or cloned voices without documented consent.
- Avatar and synthetic voice use is disclosed to learners (§11).
- Avoid a "fake human" feel. A clearly stylised presenter is often more trustworthy and cheaper.
- Evaluate lip-sync and avatar models for **licence terms and Arabic/low-resource language quality** before committing. Do not assume parity with English.

---

## 8. AI generation pipeline and cost control

### 8.1 Pipeline stages

1. **Ingest** (uploads, URLs, documents) → text extraction → chunking.
2. **Script and storyboard** (LLM, structured output against the scene schema).
3. **Translation and localisation** (LLM plus glossary of technical terms per language, human review for priority languages).
4. **Voice (TTS)** with word and viseme timings. Voice and language set per lesson.
5. **Visual fill**: templates are filled from the spec; images are generated only when a template needs one, preferring vector/procedural assets.
6. **Captions** from timings.
7. **Quality checks** (automated, then human): layout lint, reading speed, contrast, fact-check flags, term consistency.
8. **Package and export.**

### 8.2 Model routing

| Step | Default | Escalate to stronger model when |
|---|---|---|
| Outline and storyboard | Mid-tier LLM | Complex topic, creator rates output poorly |
| Fact-check and claim extraction | Strong LLM (accuracy matters most) | Always strong for security and technical claims |
| Translation | Mid-tier plus glossary | Legal/safety-critical or low-resource language |
| Layout and scene fill | Template filler (deterministic) plus small LLM | Never needs the biggest model |
| Captions, timings, lint | No LLM | n/a |

Keep model access behind a provider-agnostic interface so models can be swapped as prices and quality change. Maintain a small **evaluation set** per language and per template to catch regressions when swapping.

### 8.3 Cost levers (in order of impact)

1. **On-device rendering.** The learner's phone does the "video" work.
2. **Cache and dedupe.** Hash (text, voice, language, settings) → audio file. Re-generate only changed beats.
3. **Templates.** Deterministic layouts need no generation.
4. **Batch/async mode** for non-urgent work (§1.3). Queue jobs, run off-peak, notify when ready.
5. **Routing** (§8.2).
6. **Open-weight models** for some steps (TTS, captioning, translation drafts, small LLM tasks) on spot or rented GPUs or CPU, once quality is verified per language.
7. **Per-lesson cost cap** with a visible meter. Creators see spend before and after.

### 8.4 Cost model (fill in with real numbers in Phase 0)

```
cost_per_lesson =
    script_tokens   * llm_price
  + translate_tokens * n_languages * llm_price
  + narration_chars * n_languages * tts_price
  + generated_images * image_price
  + avatar_render_seconds * gpu_price          # tier 2 only
  + storage + egress (CDN)
```
Instrument every provider call with tokens/characters/seconds and cost from day one, so the model reflects reality.

---

## 9. Low-bandwidth and old-device design

### 9.1 Targets (to validate with real devices; these are goals, not measured results)

| Item | Target |
|---|---|
| Lesson Package, 60–90 s lesson, one language | **≤ 300 KB** (audio is the bulk: Opus mono at ~16 kbps is roughly 120 KB per minute) |
| Time to first scene on 3G-class connection | **≤ 3 s** with `poster` and first audio chunk streaming |
| Player JavaScript (initial, gzip) | **≤ 150 KB**; 3D bundle lazy-loaded only when a lesson needs it |
| Runtime | **≥ 30 fps on a low-end Android reference device**; automatic fallback to 15 fps / reduced effects |
| Memory | Stays within a conservative budget on 2 GB RAM devices |
| MP4 export, low-data variant | 240p/360p, ~15 fps, H.264 for broad hardware decode; static/flat graphics compress very well, so ~1–2 MB per minute is a plausible goal |

### 9.2 Techniques
- **Audio-first design.** A lesson must work with audio and captions only. Narration carries the content.
- **Vector over raster.** SVG, CSS transforms and canvas for diagrams; AVIF/WebP for the few raster assets.
- **Adaptive quality ladder:** `Full` (animations + optional 3D) → `Lite` (2D, fewer effects) → `Frames` (audio + static key frames) → `Text` (captions + transcript). The player picks automatically from device capability and network, and the learner can override ("Data Saver").
- **PWA offline-first:** service worker caches the player and downloaded lessons; background sync for progress; explicit "download this course on Wi-Fi" flow.
- **Streaming and chunked audio** so playback starts before the full file arrives.
- **Font strategy:** system fonts first, subsetted web fonts per language (Arabic fonts are large, so subset aggressively).
- **No autoplay of heavy assets**, no always-on video backgrounds, no large lottie files.
- **Respect `Save-Data`**, reduced motion and prefers-contrast signals.
- **Distribution channels that fit the context:** shareable low-data MP4 and audio-only versions for WhatsApp/Telegram, plus print/PDF handouts. Local sideloading (USB/SD/shared hotspot) for schools with poor connectivity is worth testing.
- **CDN with regional presence**, long cache lifetimes on content-addressed assets.
- **Test on the real thing:** maintain a device lab (or remote device farm) with 2–3 representative low-end Android phones and throttled-network profiles in CI.

---

## 10. Architecture

Follows a polyglot split by strength: **TypeScript** (frontend), **Python** (ML/AI), **Go** (execution and orchestration), **FastAPI** as the Python API framework.

```
┌─────────────────────────── Creator Studio (TS, React PWA) ───────────────────────────┐
│ Storyboard UI · Preview (real Player) · Brand kit · Cost meter · Review queue         │
└───────────────┬──────────────────────────────────────────────────────────────────────┘
                │ HTTPS/WebSocket
┌───────────────▼───────────────┐    ┌──────────────────────────────────────────┐
│ Studio API (FastAPI)          │    │ Learner Player (TS, embeddable, PWA)     │
│ auth, projects, versions,     │    │ renders Lesson Packages, offline-first   │
│ cost tracking, schema valid.  │    └──────────────────▲───────────────────────┘
└───────┬───────────────┬───────┘                       │ CDN
        │ jobs          │ metadata                      │
┌───────▼───────┐  ┌────▼─────┐   ┌─────────────────────┴───────┐
│ Orchestrator  │  │ Postgres │   │ Object storage (S3-compat)   │
│ (Go): queue,  │  │          │   │ packages, assets, exports    │
│ retries,      │  └──────────┘   └──────────────────────────────┘
│ batch/instant │
└───┬───────┬───┘
    │       │
┌───▼───┐ ┌─▼────────────────────────────┐ ┌──────────────────────────┐
│ AI    │ │ Render workers (Go + headless │ │ Media workers (Python/   │
│ svc   │ │ Chromium + ffmpeg): MP4 export│ │ ffmpeg): transcode, ASR, │
│ (Py)  │ │                               │ │ lip-sync (GPU, batch)    │
└───────┘ └───────────────────────────────┘ └──────────────────────────┘
```

**Key design points**
- **Single source of truth:** the scene spec plus the player. Preview, learner playback and MP4 export all use the same renderer, so what the creator approves is what ships.
- **Deterministic render:** no wall-clock timers inside scenes. All animation is `f(t)`.
- **Provider abstraction layer** for LLM, TTS, image and avatar providers, with per-call cost logging and a fallback chain.
- **Job model:** every job is idempotent, content-hashed, resumable, and tagged `instant` or `batch`.
- **Export paths:** server-side (headless Chromium, frames → ffmpeg) is the reliable default. Client-side export using the browser's WebCodecs is an optional later feature for offline creators.
- **Storage and privacy:** uploaded media stays in object storage; AI calls receive only the necessary text or short snippets; retention and deletion are explicit.
- **Rust** only later, if a true low-latency hot path appears.

---

## 11. Quality, safety, legal

- **Accuracy.** Tech, AI and security content can be wrong in plausible-looking ways. Pipeline includes a claim-extraction and verification pass against provided sources, flags uncited claims, and requires **human approval before publish** for institutional content. Keep a lightweight "last reviewed" date on each lesson, because tech content ages fast.
- **Security content responsibility.** Teach defence and awareness. No step-by-step operational attack instructions. Add a content policy and automated checks for this.
- **AI-content disclosure and provenance.** Mark AI-generated narration, avatars and visuals in the manifest and visibly in the player. Check current transparency obligations (for example the EU AI Act's rules on labelling synthetic media and their application dates, which have been subject to change) and the platform rules of each distribution channel.
- **Likeness, voice and rights.** Written consent for any real person's face or voice; no cloning without it. Track licences for fonts, music, 3D assets, stock imagery. Prefer CC0, procedural or purchased assets.
- **Learner data.** Collect the minimum. Offline progress stored locally and synced when available. Be careful with data about minors and with data-protection law in each target country.
- **Language quality.** Machine translation and TTS can be noticeably weaker in some languages and dialects. Require native-speaker review for launch languages and publish a quality tier per language.
- **Bias and cultural fit.** Examples, names, metaphors and imagery should be localised, not just translated.

---

## 12. Roadmap

Durations are rough planning guesses for a small team using AI-assisted development. Re-estimate after Phase 0.

| Phase | Scope | Exit criteria |
|---|---|---|
| **0. Discovery (≈2 wks)** | Interview 8–10 creators and learners; collect device and network facts; pick launch languages; benchmark TTS and translation quality per language; confirm provider terms and prices; real cost model | Written decisions on languages, providers, budgets; reference device list |
| **1. Player and spec (≈3–4 wks)** | Lesson Package v0.1, deterministic player, 5–6 templates, captions sync, RTL/LTR, offline PWA, low-end device tests | A hand-authored lesson plays smoothly on the reference low-end phone within the size/time targets |
| **2. Studio v1 + AI script (≈4–6 wks)** | Brief → storyboard → generate pipeline, TTS, cache, cost meter, brand kit, MP4 export (server-side) | A creator completes a lesson in <15 min; cost per lesson tracked within ±10% of estimate |
| **3. Batch + scale-out (≈2–3 wks)** | Instant/Batch mode, job orchestration, retries, multi-language packages, review queue | Batch lessons cost measurably less; failed jobs resume without duplicate spend |
| **4. Uploads + avatars (≈4–6 wks)** | Video upload path (ASR → beats → captions → compress), vector avatar (tier 1), consented photo avatar (tier 2, batch GPU) | Uploaded 3-min video becomes captioned, low-data lesson; avatar consent flow audited |
| **5. Quality and safety (≈3 wks, partly parallel)** | Fact-check pass, content policy checks, disclosure, accessibility audit, evaluation sets | Pass internal red-team and accessibility review; reviewer workflow in use |
| **6. Live tutor pilot (optional, ≈3–4 wks)** | Evaluate Gemini 3.8 Live Avatar (if access) or voice-only live tutor for institutions; session cost and bandwidth measured | Go/no-go based on measured cost per session and learner value |
| **7. Hardening and launch** | Load tests, monitoring, backup, docs, creator onboarding | Pilot cohort live with real learners |

**Build order rationale:** the player and spec come first because they are the part most expensive to change later and the real source of the low-bandwidth advantage. The studio UX comes second, then cost optimisation, then the avatar and upload work.

---

## 13. Success metrics

**Creator:** time-to-first-published-lesson, % of storyboards approved without regeneration, edits per lesson, lessons published per creator per month.
**Learner:** lesson completion rate, replay rate, quiz improvement, share of sessions on Lite/Frames/Text tiers, offline-play share.
**Performance:** package size (p50/p95), time-to-first-scene (p95 on 3G profile), dropped-frame rate on reference devices, crash-free sessions.
**Economics:** cost per finished lesson (by language), % of jobs run in batch, cache hit rate, egress per learner-hour.
**Quality:** reviewer rejection rate, factual-error reports per 1,000 views, caption accuracy per language.

---

## 14. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| AI factual errors in technical or security content | Harm, loss of trust | Source-grounded generation, claim verification, mandatory human review, review dates |
| Weak Arabic (or other low-resource) TTS/translation quality | Poor learning experience | Benchmark early, glossary, native review, per-language quality tier, human voice option |
| Provider price changes, deprecations, access limits (including Gemini Live Avatar's enterprise gating) | Cost and roadmap disruption | Provider abstraction, evaluation sets, avoid hard dependencies on gated features |
| Avatar likeness, deepfake and consent issues | Legal and reputational | Consent records, disclosure, stylised avatars by default, no cloning without consent |
| LLM-generated layouts look broken | Unprofessional output | Template-driven layout, automated lint, preview before spend |
| Old-device performance (3D, large fonts) | Lessons don't play | Quality ladder, lazy 3D, device-lab CI, strict budgets |
| Scope creep into a general video editor | Delay | Non-goals list, ruthless template-first approach |
| Self-funding constraint | Runway | Cost caps, batch/open-weight models, narrow launch scope (few languages, few templates) |
| Licensing of open models and assets | Legal exposure | Licence register per asset and model, legal check before commercial use |

---

## 15. Open questions

1. Launch languages and dialects (for example Modern Standard Arabic vs. regional dialects; which LTR languages)?
2. Who is the first paying or pilot customer, and do they need Gemini Enterprise-level avatar capability, or is a stylised avatar enough?
3. Budget ceiling per lesson and per creator per month?
4. Human voice recordings for premium lessons, or fully synthetic?
5. Open format: publish the Lesson Package spec as an open standard (adoption, trust) or keep it proprietary?
6. Hosting regions and data-residency needs of target countries?
7. Does the studio ship inside the main teacher-upskilling product or as a separate creator tool first?

---

## 16. Next actions (first 10 working days)

1. Pick 3 pilot topics (one each for AI, IoT, cybersecurity) and write the storyboards by hand to validate templates.
2. Define Lesson Package v0.1 schema and a minimal deterministic player; render one scene in Arabic RTL with captions.
3. Buy or borrow 2–3 low-end Android devices; set up throttled-network test profiles.
4. Run TTS and translation bake-offs on the pilot scripts in the launch languages; log quality and cost.
5. Instrument cost logging in the first prototype so the cost model uses real numbers.
6. Re-verify Gemini Live Avatar availability, pricing and terms, and decide whether to apply for access for the later pilot.

---

## Appendix A: Why on-device rendering beats MP4 (rough numbers)

| Delivery | 60 s lesson, one language | Notes |
|---|---|---|
| 720×1280 H.264 MP4 (typical social export) | ~5–15 MB (the uploaded examples were ~1.8 MB per 29 s up to ~14.6 MB per 136 s) | Fixed resolution, fixed language, baked captions |
| Low-data MP4 (360p, 15 fps) | ~1–2 MB (goal) | For WhatsApp/low-end distribution |
| Lesson Package (Full tier) | ~150–300 KB (goal) | Audio dominates; language-switchable; vector crisp |
| Frames tier (audio + stills) | ~150–250 KB | Weakest device and network |
| Text tier (captions + transcript) | ~5–20 KB | Last-resort fallback |

*Package figures are design targets based on typical Opus bitrates and small vector assets, not measurements. Validate in Phase 1.*

## Appendix B: Verified facts and sources (as of 27 Oct 2026; re-verify)

- Google announced **Gemini 3.8 Live with Live Avatar** on 24 Sep 2026, available in **Gemini Enterprise**; custom avatars via enterprise allowlisting; announcement did not specify API pricing or general API availability.
- **Gemini 3.8 Live** and **3.8 Live Extended Thinking** shipped on the Live API on 15 Sep 2026 (audio endpoints; reported as having no avatar model ID or rate-card line).
- Reviewed sources say **pricing and regional availability were not published**, and describe Live Avatar as supporting a few minutes of continuous interaction.
- Sources reviewed include Google's announcement as summarised by independent trackers (orcarouter.ai, sessionwatcher.com, techjacksolutions.com, uravation.com, ecosistemastartup.com). **Primary Google documentation should be checked directly before any commitment.**

---

## Appendix C: Verified 27 Oct 2026 (checks made while setting up this repo)

Sources: Google's Gemini API pricing page (https://ai.google.dev/gemini-api/docs/pricing) and speech-generation page (https://ai.google.dev/gemini-api/docs/speech-generation), read on 27 Oct 2026, plus the secondary sources named below. Re-check before relying on any number.

1. **TTS can be batched (answers the question in §1.3).** The pricing page lists batch rates for TTS. Prices are per 1M tokens, and audio is 25 tokens per second.

   | Model | Standard (text in / audio out) | Batch (text in / audio out) | Note |
   |---|---|---|---|
   | `gemini-3.8-flash-lite-tts` | $0.50 / $6.00 | $0.25 / **$3.00** | through 31 Dec 2026; double from 1 Jan 2027 |
   | `gemini-3.8-flash-tts` | $0.50 / $9.00 | $0.25 / $4.50 | through 31 Dec 2026; double from 1 Jan 2027 |

   - That's about **$0.0045 per minute of narration** in batch with Flash-Lite in 2026, or $0.009 in 2027.
   - Arabic: the speech page lists Standard Arabic (Arabic script) and Egyptian Arabic for both 3.8 models, which also support voice design.
2. **TTS returns no word timings.** The speech page documents audio output only: WAV or raw PCM, 24 kHz mono. So `timing/<lang>.json` (§6) needs its own step:
   - voice each sentence in its own request, which gives exact sentence start and end times;
   - force-align the words against the audio, with speech recognition that returns word timestamps;
   - take visemes from the alignment, or fall back to loudness.
   - v0.1 ships *estimated* timings from `estimateTiming()` in `packages/spec`, marked `"source": "estimated"`.
3. **Live Avatar now has a reported price** (updates §1.2 and Appendix B).
   - Secondary sources quote Google Cloud's rate card: avatar video at $1.00 per 1M tokens, at 6,192 tokens per second of speech, billed only while the avatar speaks. That's about **$0.37 per minute of speech**, plus audio output ($12 per 1M tokens, about $0.018 per minute) and inputs.
   - Those sources: eesel.ai "Gemini 3.8 Live Avatar review", a Medium "Tokenomics Daily" piece, choosely.ai and datanorth.ai. One says these are introductory rates through 31 Dec 2026.
   - **Access:** reported as Gemini Enterprise only. One developer report found the model served in us-central1 but not europe-west4.
   - **Faces:** prebuilt Kira, Ben and Leo; custom faces need allowlisting.
   - `gemini-3.8-live` does appear on the Gemini API pricing page, for audio only, with no avatar line.
   - Still real-time only, with no batch discount. This supports the decision to keep it a later pilot.
4. **Pictures:** `gemini-nano-banana-2.1` costs $0.0336 per 1K picture standard, or $0.0168 in batch (pricing page).
5. **Generated video clips:** `gemini-omni-1.1-flash` costs about $0.10 per second at 720p (pricing page). Clips are 3–10 s and can be extended to 40 s. Its docs say audio references can't be uploaded, so it can't lip-sync to our own narration. This supports the non-goal in §2.
