import type { Check, Lang, LessonPackage, ResolvedCue, Text, TimingFile } from "@lessonstudio/spec";
import { LIBRARY_ICONS_PATH, captionChunks, needsLibraryIcon, pick, resolveCues, walkElements, type CaptionChunk } from "@lessonstudio/spec";
import type { ElementBox } from "./canvas.ts";
import { AudioClock, SilentClock, pickAudio, type Clock } from "./clock.ts";
import { h, rich, Writer } from "./dom.ts";
import { icon, loadLibraryIcons } from "./icons.ts";
import { aiParts, labelsFor, type Labels } from "./labels.ts";
import { STAGE, autoOrient, type Orient } from "./layout.ts";
import { ensureTiming, resolvePath } from "./load.ts";
import { clamp01, cueState, ease, fix } from "./motion.ts";
import { CSS } from "./styles.ts";
import { mountScene, type Mounted } from "./templates/index.ts";
import { chooseTier, MIN_FRAME_MS, readSignals, type Signals, type Tier } from "./tier.ts";

export type PlayerEvent =
  | { type: "play" }
  | { type: "pause" }
  | { type: "scene"; id: string; index: number }
  | { type: "check"; id: string; correct: boolean }
  | { type: "ended" }
  | { type: "tier"; tier: Tier }
  | { type: "lang"; lang: Lang }
  /** The narration couldn't load; the lesson goes on with captions and no sound. */
  | { type: "no-audio" };

export interface PlayerOptions {
  /** Lesson language. Default: the manifest's defaultLang. Its timing must be loaded. */
  lang?: Lang;
  /** "auto" picks from the device (Save-Data, memory, cores, reduced motion). */
  tier?: Tier | "auto";
  /** "auto": portrait on narrow, tall screens. */
  orient?: Orient | "auto";
  /** Brand kit; default from the manifest, else "studio-dark". */
  brand?: string;
  /** Captions start on (default true). */
  captions?: boolean;
  rate?: number;
  /**
   * Keep the learner's settings (speed, captions, volume, caption size) and their place in this lesson between visits,
   * in localStorage. For learner-facing players; editors leave it off.
   */
  remember?: boolean;
  /** Where the shared library ("@lib/" paths: cast, extended icons) lives; default Lesson Studio's Hosting. */
  library?: string;
  labels?: Partial<Labels>;
  /** Device signals for "auto" tier; read from the browser when absent. */
  signals?: Signals;
  /** Let the host ask checks with its own UI. Resolve when the learner has answered. */
  onCheck?: (check: Check, info: { lang: Lang; scene: string }) => Promise<{ correct: boolean }>;
  onEvent?: (e: PlayerEvent) => void;
  /** Time source for the silent clock, in milliseconds (tests). */
  now?: () => number;
  fetch?: typeof fetch;
}

export interface Player {
  readonly host: HTMLElement;
  readonly lang: Lang;
  readonly tier: Tier;
  readonly orient: Orient;
  readonly duration: number;
  readonly playing: boolean;
  time(): number;
  play(): Promise<void>;
  pause(): void;
  toggle(): void;
  seek(t: number): void;
  /** Draws the frame at time t. The same t always gives the same frame. */
  renderAt(t: number): void;
  setLang(lang: Lang): Promise<void>;
  setTier(tier: Tier | "auto"): void;
  setOrient(orient: Orient | "auto"): void;
  setRate(rate: number): void;
  setCaptions(on: boolean): void;
  /** The scene on screen. */
  readonly sceneIndex: number;
  /** Boxes of the free elements on screen, in CSS pixels from the viewport's top-left (for editors to draw handles). */
  boxes(): ElementBox[];
  /** The id of the free element under a point (client coordinates), or null. */
  elementAt(x: number, y: number): string | null;
  /** Boxes of the template's editable text parts on screen (see `part` in templates/common.ts), like boxes(). */
  parts(): ElementBox[];
  /** The editable part under a point (client coordinates), or null. */
  partAt(x: number, y: number): string | null;
  destroy(): void;
  /** Settles once the shared library's icons the lesson uses are in (immediately when it uses none). */
  readonly ready: Promise<void>;
}

const RATES = [0.75, 1, 1.25, 1.5, 2];
const CAP_SIZES = [0.85, 1, 1.25];

interface Prefs { rate: number; captions: boolean; volume: number; muted: boolean; capSize: number; capBg: boolean }
function readJson<T>(key: string): Partial<T> {
  try { return JSON.parse(localStorage.getItem(key) ?? "{}") as Partial<T>; } catch { return {}; }
}
function writeJson(key: string, v: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* private mode, or storage full */ }
}
const hoverable = (): boolean => typeof matchMedia === "function" && matchMedia("(hover: hover)").matches;
const EPS = 0.01;

function clock(t: number): string {
  const s = Math.max(0, Math.floor(t));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Puts a player for `pkg` into `host` (inside a shadow root, so the page's CSS can't reach it). */
export function createPlayer(host: HTMLElement, pkg: LessonPackage, o: PlayerOptions = {}): Player {
  const m = pkg.manifest;
  const scenes = pkg.scenes.scenes;
  if (o.library) pkg.library = o.library;
  const wr = new Writer();
  const loaded = (l: Lang | undefined): l is Lang => !!l && !!pkg.timing[l] && m.languages.some((x) => x.code === l);
  let lang: Lang = loaded(o.lang) ? o.lang : loaded(m.defaultLang) ? m.defaultLang : Object.keys(pkg.timing)[0]!;
  if (!pkg.timing[lang]) throw new Error("createPlayer: load a language's timing first (loadPackage does).");

  let tierPref: Tier | "auto" = o.tier ?? "auto";
  let tier: Tier = tierPref === "auto" ? chooseTier(o.signals ?? readSignals()) : tierPref;
  let orientPref: Orient | "auto" = o.orient ?? "auto";
  let orient: Orient = "landscape";
  /** How much the stage is scaled on screen, set by fit(). */
  let stageScale = 1;
  const design = STAGE[m.stage ?? "landscape"];
  const prefs: Partial<Prefs> = o.remember ? readJson<Prefs>("ls-player") : {};
  let rate = o.rate ?? prefs.rate ?? 1;
  let captionsOn = o.captions ?? prefs.captions ?? true;
  let volume = prefs.volume ?? 1;
  let muted = prefs.muted ?? false;
  let capSize = prefs.capSize ?? 1;
  let capBg = prefs.capBg ?? true;
  /** Quick-check answers this time through: right or not. */
  const results = new Map<string, boolean>();
  /** The learner opened the transcript (the text tier always shows it). */
  let transcriptOpen = false;
  let labels = labelsFor(lang, o.labels);
  const brand = o.brand ?? m.brand ?? "studio-dark";

  // Per-language state, rebuilt by setLang.
  let timing: TimingFile = pkg.timing[lang]!;
  let cues: ResolvedCue[][] = [];
  let chunks: CaptionChunk[] = [];
  let clk: Clock;

  const answered = new Set<string>();
  let current: { index: number; mounted: Mounted; key: string } | null = null;
  let capIndex = -2;
  let capWords: HTMLElement[] = [];
  let sentIndex = "";
  let raf = 0;
  let lastDraw = -Infinity;
  let prevT = 0;
  let checkOpen = false;
  let ended = false;
  /** The learner asked to play and hasn't paused since: what to do if the narration fails. */
  let wantPlay = false;

  /* ---------- DOM ---------- */
  const root = host.shadowRoot ?? host.attachShadow({ mode: "open" });
  root.replaceChildren();
  const stage = h("div", { className: "ls-stage", "aria-hidden": "true" });
  const cap = h("p", { className: "ls-cap" });
  const captionsBox = h("div", { className: "ls-captions", "aria-hidden": "true" }, cap);
  const bigPlay = h("button", { className: "ls-bigplay", type: "button" }, icon("play", 38));
  const viewport = h("div", { className: "ls-viewport" }, stage, captionsBox, bigPlay);
  const checkBox = h("div", { className: "ls-check", hidden: true });
  const endBox = h("div", { className: "ls-end", hidden: true });

  const playBtn = h("button", { className: "ls-btn ls-play", type: "button" });
  const timeEl = h("span", { className: "ls-time", dir: "ltr" });
  const seekEl = h("input", { className: "ls-seek", type: "range", min: 0, step: 0.1, dir: "ltr" });
  const ticks = h("div", { className: "ls-ticks" });
  const chapBtn = h("button", { className: "ls-btn ls-chap", type: "button", "aria-haspopup": "menu" }, icon("chapters", 22));
  const volBtn = h("button", { className: "ls-btn ls-vol", type: "button" });
  const volEl = h("input", { className: "ls-volr", type: "range", min: 0, max: 1, step: 0.05, dir: "ltr" });
  const setBtn = h("button", { className: "ls-btn ls-set", type: "button", "aria-haspopup": "menu" }, icon("gear", 22));
  const ccBtn = h("button", { className: "ls-btn ls-cc", type: "button" }, icon("cc", 22));
  const trBtn = h("button", { className: "ls-btn ls-tr", type: "button" }, icon("list", 22));
  const fsBtn = h("button", { className: "ls-btn ls-fs", type: "button" }, icon("full", 22));
  const aiBadge = h("span", { className: "ls-ai" });
  // Scrubbing shows where you'd land: the chapter, the time and (on the Full tier) the frame itself.
  const pvStage = h("div", { className: "ls-pvs" });
  const pv = h("div", { className: "ls-pv", hidden: true }, pvStage);
  const tipText = h("span", { className: "ls-tipt" });
  const tip = h("div", { className: "ls-tip", hidden: true }, pv, tipText);
  const bar = h(
    "div",
    { className: "ls-bar" },
    playBtn, timeEl, h("div", { className: "ls-track" }, ticks, seekEl, tip), chapBtn, volBtn, volEl, setBtn, ccBtn, trBtn, fsBtn, aiBadge,
  );
  const menu = h("div", { className: "ls-menu", hidden: true, role: "menu" });
  const main = h("div", { className: "ls-main" }, viewport, checkBox, endBox, menu, bar);
  const transcriptBox = h("div", { className: "ls-transcript", hidden: true });
  const wrap = h("div", { className: `ls-player ls-brand-${brand} ls-landscape` }, main, transcriptBox);
  root.append(h("style", null, CSS), wrap);

  const emit = (e: PlayerEvent): void => o.onEvent?.(e);

  /* ---------- language ---------- */
  function track() {
    return m.languages.find((l) => l.code === lang)!;
  }

  function makeClock(): Clock {
    const tr = track();
    const src = pickAudio(tr.audio, tr.audioFallback);
    const c: Clock = src ? new AudioClock(resolvePath(pkg, src), () => finish(), () => noAudio(c)) : new SilentClock(o.now);
    c.setRate(rate);
    c.setVolume(muted ? 0 : volume);
    return c;
  }

  /** Audio-first, not audio-only: when the narration fails, carry on from the same moment with captions and no sound. */
  function noAudio(failed: Clock): void {
    if (clk !== failed) return;
    const t = failed.time();
    failed.destroy();
    clk = new SilentClock(o.now);
    clk.setRate(rate);
    clk.seek(t);
    emit({ type: "no-audio" });
    if (wantPlay) void play();
    else syncButtons();
  }

  function applyLang(): void {
    timing = pkg.timing[lang]!;
    cues = scenes.map((s, i) => {
      const st = timing.scenes[i]!;
      return resolveCues(s, st, lang).map((c) => ({ ...c, at: c.at - st.start }));
    });
    chunks = captionChunks(timing);
    labels = labelsFor(lang, o.labels);
    const dir = track().dir;
    wrap.setAttribute("lang", lang);
    wrap.setAttribute("dir", dir);
    cap.setAttribute("dir", dir);
    seekEl.max = String(timing.duration);
    ticks.replaceChildren(
      ...timing.scenes.slice(1).map((s) => h("span", { className: "ls-tick", style: `left:${fix((s.start / timing.duration) * 100, 2)}%` })),
    );
    playBtn.setAttribute("aria-label", labels.play);
    bigPlay.setAttribute("aria-label", labels.play);
    seekEl.setAttribute("aria-label", labels.seek);
    for (const [b, l] of [[chapBtn, labels.chapters], [volBtn, labels.mute], [setBtn, labels.settings], [ccBtn, labels.captions], [trBtn, labels.transcript], [fsBtn, labels.fullscreen]] as const) {
      b.setAttribute("aria-label", l);
      b.title = l;
    }
    volEl.setAttribute("aria-label", labels.volume);
    const parts = aiParts(m.ai, labels);
    aiBadge.hidden = parts.length === 0;
    aiBadge.textContent = labels.ai;
    aiBadge.title = parts.join(labels.sep);
    buildTranscript();
    current = null;
    capIndex = -2;
    sentIndex = "";
  }

  function buildTranscript(): void {
    transcriptBox.replaceChildren(
      ...timing.scenes.map((s, i) =>
        h(
          "div",
          { className: "ls-tr-scene" },
          ...s.sentences.map((se, j) => {
            const b = h("button", { className: "ls-sent", type: "button", "data-k": `${i}:${j}` }, ...rich(se.text, track().dir === "rtl"));
            b.addEventListener("click", () => seek(se.start));
            return b;
          }),
        ),
      ),
    );
  }

  /* ---------- drawing ---------- */
  function sceneAt(t: number): number {
    let i = 0;
    while (i + 1 < timing.scenes.length && timing.scenes[i + 1]!.start <= t) i++;
    return i;
  }

  function ctxFor(i: number, scale = stageScale) {
    const st = timing.scenes[i]!;
    const { W, H } = STAGE[orient];
    const dir = track().dir;
    return {
      lang,
      dir,
      tier,
      orient,
      W,
      H,
      dur: st.end - st.start,
      words: st.words.map((w) => ({ w: w.w, s: w.s - st.start, e: w.e - st.start })),
      wr,
      labels,
      t: (x: Parameters<typeof pick>[0]) => pick(x, lang, m.defaultLang),
      design,
      mirror: dir === "rtl" && scenes[i]!.mirror !== false,
      first: i === 0,
      scale,
      url: (path: string) => resolvePath(pkg, path),
    };
  }

  function mount(i: number): Mounted {
    const mounted = mountScene(scenes[i]!, ctxFor(i));
    stage.replaceChildren(mounted.root);
    emit({ type: "scene", id: scenes[i]!.id, index: i });
    prefetch(i + 1);
    return mounted;
  }

  /** Starts downloading the next scene's pictures, so they are there when it begins. */
  function prefetch(i: number): void {
    const next = scenes[i];
    if (!next || typeof Image === "undefined") return;
    walkElements(next, (el) => {
      if (el.type !== "image") return;
      const src = el.small && (tier !== "full" || stageScale < 0.6) ? el.small : el.src;
      new Image().src = resolvePath(pkg, src);
    });
  }

  function renderAt(tIn: number): void {
    const t = Math.min(Math.max(tIn, 0), timing.duration);
    const i = sceneAt(t);
    const st = timing.scenes[i]!;
    const key = `${i}|${orient}|${tier}|${lang}`;
    if (tier !== "text") {
      if (!current || current.key !== key) current = { index: i, mounted: mount(i), key };
      const dur = st.end - st.start;
      const lt = tier === "frames" ? dur : t - st.start;
      current.mounted.update(lt, cueState(cues[i] ?? [], lt, tier));
    }
    drawCaptions(t);
    drawTranscript(t);
    seekEl.value = String(Math.round(t * 10) / 10);
    timeEl.textContent = `${clock(t)} / ${clock(timing.duration)}`;
    prevT = t;
  }

  function drawCaptions(t: number): void {
    let k = -1;
    for (let j = 0; j < chunks.length && chunks[j]!.start <= t; j++) k = j;
    const c = k >= 0 ? chunks[k] : undefined;
    const visible = captionsOn && tier !== "text" && !!c && t <= c.end + 1.2;
    captionsBox.hidden = !visible;
    if (!visible || !c) return;
    if (k !== capIndex) {
      capIndex = k;
      capWords = c.words.map((w) => h("span", null, w.w));
      const kids: (Node | string)[] = [];
      capWords.forEach((s, j) => kids.push(...(j ? [" ", s] : [s])));
      cap.replaceChildren(...kids);
    }
    c.words.forEach((w, j) => {
      wr.cls(capWords[j]!, "is-said", w.e <= t);
      wr.cls(capWords[j]!, "is-now", w.s <= t && t < w.e);
    });
  }

  function drawTranscript(t: number): void {
    if (transcriptBox.hidden) return;
    const i = sceneAt(t);
    const ss = timing.scenes[i]!.sentences;
    let j = 0;
    while (j + 1 < ss.length && ss[j + 1]!.start <= t) j++;
    const k = `${i}:${j}`;
    if (k === sentIndex) return;
    sentIndex = k;
    for (const b of transcriptBox.querySelectorAll<HTMLElement>(".ls-sent")) {
      const on = b.dataset.k === k;
      b.classList.toggle("is-now", on);
      if (on && tier === "text") b.scrollIntoView?.({ block: "nearest" });
    }
  }

  /**
   * What a paused player shows. At the very start that is a poster (the first scene once its
   * title is in) rather than the empty frame at 0 s; renderAt(t) itself stays a pure function of t.
   */
  function still(t: number): void {
    if (t > 0.05 || clk.playing) return renderAt(t);
    const st = timing.scenes[0]!;
    renderAt(Math.min(st.end - EPS, st.start + 3));
    captionsBox.hidden = true;
    seekEl.value = "0";
    timeEl.textContent = `${clock(0)} / ${clock(timing.duration)}`;
    prevT = t;
  }

  /* ---------- layout ---------- */
  function fit(): void {
    const next = orientPref === "auto"
      ? autoOrient(host.clientWidth, window.innerWidth || 0, window.innerHeight || 0)
      : orientPref;
    if (next !== orient) {
      orient = next;
      wrap.classList.remove("ls-landscape", "ls-portrait", "ls-square");
      wrap.classList.add(`ls-${orient}`);
    }
    const { W, H } = STAGE[orient];
    const k = viewport.clientWidth ? viewport.clientWidth / W : 1;
    stageScale = k;
    stage.style.width = `${W}px`;
    stage.style.height = `${H}px`;
    stage.style.transform = `scale(${fix(k, 4)})`;
    wrap.style.setProperty("--ls-cap-size", `${Math.round(Math.max(15, Math.min(24, 34 * k)) * capSize)}px`);
    wrap.style.setProperty("--ls-ar", fix(W / H, 4));
    // Wide players on the Full tier float their controls over the picture and fade them while playing. Smaller ones
    // drop the least-used controls (compact), and phones put the seek bar on a row of its own (narrow).
    const w = isFull() ? wrap.clientWidth : host.clientWidth;
    wrap.classList.toggle("ls-float", tier === "full" && w >= 520);
    wrap.classList.toggle("ls-compact", w < 720);
    wrap.classList.toggle("ls-narrow", w < 480);
  }

  /* ---------- playback ---------- */
  function syncButtons(): void {
    const on = clk.playing;
    playBtn.replaceChildren(icon(on ? "pause" : "play", 22));
    playBtn.setAttribute("aria-label", on ? labels.pause : labels.play);
    bigPlay.hidden = on || checkOpen || ended;
    volBtn.replaceChildren(icon(muted || volume === 0 ? "muted" : "vol", 22));
    volBtn.setAttribute("aria-pressed", String(muted));
    volEl.value = String(muted ? 0 : volume);
    fsBtn.setAttribute("aria-pressed", String(isFull()));
    // A quick check or the end screen in a small player sits under the picture instead of over it, so it is never cut off.
    wrap.classList.toggle("ls-asking", checkOpen || ended);
    ccBtn.setAttribute("aria-pressed", String(captionsOn));
    trBtn.setAttribute("aria-pressed", String(!transcriptBox.hidden));
    wrap.dataset.tier = tier;
  }

  function loop(): void {
    raf = 0;
    if (!clk.playing) return;
    const t = clk.time();
    const due = scenes.findIndex((s, i) => {
      if (!s.check || answered.has(s.check.id)) return false;
      const end = timing.scenes[i]!.end;
      return prevT < end - EPS && t >= end - EPS;
    });
    if (due >= 0) {
      const end = timing.scenes[due]!.end - EPS;
      wantPlay = false;
      clk.pause();
      clk.seek(end);
      renderAt(end);
      void ask(due);
      syncButtons();
      return;
    }
    if (t >= timing.duration) return finish();
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (now - lastDraw >= MIN_FRAME_MS[tier]) {
      lastDraw = now;
      renderAt(t);
    }
    raf = requestAnimationFrame(loop);
  }

  async function play(): Promise<void> {
    if (checkOpen) return;
    if (ended || clk.time() >= timing.duration - EPS) {
      ended = false;
      endBox.hidden = true;
      seek(0);
    }
    wantPlay = true;
    const c = clk;
    try {
      await c.play();
    } catch (e) {
      // A source that can't play rejects here. Either this or its error event swaps in the silent clock,
      // which then plays; the other finds it already swapped and does nothing.
      if (clk === c && (e as Error)?.name === "NotSupportedError") return noAudio(c);
      if (clk !== c) return;
      wantPlay = false;
      return syncButtons();
    }
    emit({ type: "play" });
    syncButtons();
    wake();
    if (!raf) raf = requestAnimationFrame(loop);
  }

  function pause(): void {
    wantPlay = false;
    if (!clk.playing) return;
    clk.pause();
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    renderAt(clk.time());
    emit({ type: "pause" });
    syncButtons();
    savePlace();
    wake();
  }

  function seek(t: number): void {
    const to = Math.min(Math.max(t, 0), timing.duration);
    if (checkOpen) closeCheck();
    if (ended && to < timing.duration) {
      ended = false;
      endBox.hidden = true;
    }
    clk.seek(to);
    still(to);
    syncButtons();
  }

  function finish(): void {
    wantPlay = false;
    clk.pause();
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    renderAt(timing.duration);
    ended = true;
    const again = h("button", { className: "ls-go", type: "button" }, labels.replay);
    again.addEventListener("click", () => void play());
    const asked = scenes.filter((x) => x.check).length;
    const right = [...results.values()].filter(Boolean).length;
    const score = results.size ? h("p", { className: "ls-score" }, labels.score.replace("{n}", String(right)).replace("{m}", String(asked))) : null;
    endBox.replaceChildren(h("div", { className: "ls-card" }, h("h3", null, labels.done), score, again));
    if (o.remember) writeJson(`ls-pos:${m.id}`, { t: 0 });
    endBox.hidden = false;
    emit({ type: "ended" });
    syncButtons();
  }

  /* ---------- checks ---------- */
  async function ask(i: number): Promise<void> {
    const check = scenes[i]!.check!;
    checkOpen = true;
    if (o.onCheck) {
      const r = await o.onCheck(check, { lang, scene: scenes[i]!.id });
      checkOpen = false;
      answered.add(check.id);
      results.set(check.id, r.correct);
      emit({ type: "check", id: check.id, correct: r.correct });
      void play();
      return;
    }
    const rtl = track().dir === "rtl";
    const t = (x: Parameters<typeof pick>[0]): string => pick(x, lang, m.defaultLang);
    const fb = h("p", { className: "ls-fb", "aria-live": "polite" });
    const explain = h("p", { className: "ls-explain", hidden: true }, ...rich(t(check.explain), rtl));
    const go = h("button", { className: "ls-go", type: "button", disabled: true }, labels.next);
    const opts = check.options.map((op, j) => {
      const b = h(
        "button",
        { className: "ls-opt", type: "button", role: "radio", "aria-checked": "false" },
        h("span", { className: "ls-letter" }, labels.letters[j] ?? String(j + 1)),
        h("span", null, ...rich(t(op.text), rtl)),
      );
      b.addEventListener("click", () => {
        if (answered.has(check.id)) return;
        const correct = op.id === check.answer;
        answered.add(check.id);
        opts.forEach((x, n) => {
          x.setAttribute("aria-checked", String(n === j));
          x.classList.toggle("is-right", check.options[n]!.id === check.answer);
          x.classList.toggle("is-wrong", n === j && !correct);
        });
        fb.textContent = correct ? labels.correct : labels.wrong;
        fb.className = `ls-fb ${correct ? "is-right" : "is-wrong"}`;
        explain.hidden = !check.explain;
        go.disabled = false;
        go.focus();
        results.set(check.id, correct);
        emit({ type: "check", id: check.id, correct });
      });
      return b;
    });
    go.addEventListener("click", () => {
      closeCheck();
      void play();
    });
    const titleId = `ls-q-${check.id}`;
    checkBox.replaceChildren(
      h(
        "div",
        { className: "ls-card", role: "dialog", "aria-labelledby": titleId },
        h("p", { className: "ls-kicker" }, icon("spark", 18), " ", labels.check),
        h("h3", { id: titleId }, ...rich(t(check.prompt), rtl)),
        h("div", { className: "ls-opts", role: "radiogroup", "aria-labelledby": titleId }, ...opts),
        fb,
        explain,
        go,
      ),
    );
    checkBox.hidden = false;
    opts[0]?.focus();
    syncButtons();
  }

  function closeCheck(): void {
    checkOpen = false;
    checkBox.hidden = true;
    checkBox.replaceChildren();
  }

  /* ---------- wiring ---------- */
  // Keys, as on video sites: Space/K, J/L ±5 s, ←/→ ±2 s, Home/End, 0–9 jump, C captions, T transcript, F full screen, M mute.
  const onKey = (e: KeyboardEvent): void => {
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === "Escape" && !menu.hidden) { closeMenu(); return; }
    if (e.key === "Escape" && wrap.classList.contains("ls-full")) { setPageFull(false); return; }
    if (tag === "INPUT" && /^(Arrow|Home|End|Page)/.test(e.key)) return;
    if (tag === "BUTTON" && (e.key === " " || e.key === "Enter")) return;
    const t = clk.time();
    const keys: Record<string, () => void> = {
      " ": toggle, k: toggle, j: () => seek(t - 5), l: () => seek(t + 5), ArrowLeft: () => seek(t - 2), ArrowRight: () => seek(t + 2),
      Home: () => seek(0), End: () => seek(timing.duration), c: () => setCaptions(!captionsOn), t: () => trBtn.click(), f: toggleFull,
      m: () => setVolume(volume || 1, !muted),
    };
    const f = keys[e.key.length === 1 ? e.key.toLowerCase() : e.key] ?? (/^[0-9]$/.test(e.key) ? () => seek((timing.duration * Number(e.key)) / 10) : undefined);
    if (!f) return;
    e.preventDefault();
    f();
    wake();
  };
  const onVisibility = (): void => {
    if (document.hidden) { pause(); savePlace(); }
  };
  function toggle(): void {
    if (clk.playing) pause();
    else void play();
  }
  function setCaptions(on: boolean): void {
    captionsOn = on;
    capIndex = -2;
    renderAt(clk.time());
    syncButtons();
    savePrefs();
  }
  function setVolume(v: number, mute: boolean): void {
    volume = v;
    muted = mute;
    clk.setVolume(muted ? 0 : volume);
    syncButtons();
    savePrefs();
  }
  function savePrefs(): void {
    if (o.remember) writeJson("ls-player", { rate, captions: captionsOn, volume, muted, capSize, capBg });
  }
  function savePlace(): void {
    if (o.remember) writeJson(`ls-pos:${m.id}`, { t: Math.round(clk.time() * 10) / 10 });
  }
  // Phones without the Fullscreen API on elements (iPhone Safari) get the player stretched over the page instead.
  function isFull(): boolean {
    return (typeof document !== "undefined" && document.fullscreenElement === wrap) || wrap.classList.contains("ls-full");
  }
  function setPageFull(on: boolean): void {
    wrap.classList.toggle("ls-full", on);
    document.documentElement.style.overflow = on ? "hidden" : "";
    onFull();
  }
  function toggleFull(): void {
    if (document.fullscreenElement) void document.exitFullscreen();
    else if (wrap.classList.contains("ls-full")) setPageFull(false);
    else if (document.fullscreenEnabled && wrap.requestFullscreen) void wrap.requestFullscreen().catch(() => setPageFull(true));
    else setPageFull(true);
  }
  const onFull = (): void => { fit(); still(clk.time()); syncButtons(); };

  /** While playing, the floating controls fade after a moment without the pointer moving. */
  let idle = 0;
  function wake(): void {
    wrap.classList.remove("ls-idle");
    clearTimeout(idle);
    if (clk.playing) idle = window.setTimeout(() => { if (clk.playing && menu.hidden) wrap.classList.add("ls-idle"); }, 2500);
  }

  /** A scene's name for chapters: its title (or kicker, subject, question, first text), else its first words. */
  function sceneName(i: number): string {
    const sc = scenes[i]!;
    const c = sc.content as { title?: Text; kicker?: Text; subject?: Text };
    let name = pick(c.title ?? c.kicker ?? c.subject ?? sc.check?.prompt ?? "", lang, m.defaultLang);
    if (!name) walkElements(sc, (el) => { if (!name && el.type === "text") name = pick(el.text, lang, m.defaultLang); });
    if (!name) name = `${(sc.narration[lang] ?? "").split(/\s+/).slice(0, 6).join(" ")}…`;
    return name.length > 48 ? `${name.slice(0, 46)}…` : name;
  }

  /* ---------- scrub preview ---------- */
  let pvKey = "";
  let pvM: Mounted | null = null;
  function showTipAt(t: number): void {
    const i = sceneAt(t);
    tipText.textContent = `${clock(t)}${labels.sep}${sceneName(i)}`;
    tip.style.left = `${fix((t / timing.duration) * 100, 2)}%`;
    tip.hidden = false;
    pv.hidden = tier !== "full" || !hoverable();
    if (pv.hidden) return;
    const st = timing.scenes[i]!;
    const { W, H } = STAGE[orient];
    const key = `${i}|${orient}|${lang}`;
    if (pvKey !== key) {
      pvM = mountScene(scenes[i]!, ctxFor(i, 160 / W));
      pvStage.replaceChildren(pvM.root);
      pvStage.style.cssText = `width:${W}px;height:${H}px;transform:scale(${fix(160 / W, 4)})`;
      pv.style.height = `${Math.round((160 * H) / W)}px`;
      pvKey = key;
    }
    const lt = t - st.start;
    pvM!.update(lt, cueState(cues[i] ?? [], lt, "full"));
  }

  /* ---------- menus: chapters, settings ---------- */
  function closeMenu(): void {
    menu.hidden = true;
  }
  function openMenu(kind: "chapters" | "settings"): void {
    if (!menu.hidden && menu.dataset.kind === kind) return closeMenu();
    menu.dataset.kind = kind;
    const item = (label: string, on: boolean, act: () => void, extra?: string): HTMLElement => {
      const b = h("button", { className: on ? "ls-mi is-on" : "ls-mi", type: "button", role: "menuitemradio", "aria-checked": String(on) },
        h("span", null, label), extra ? h("span", { className: "ls-mt", dir: "ltr" }, extra) : null);
      b.addEventListener("click", () => { act(); closeMenu(); });
      return b;
    };
    const head = (x: string) => h("p", { className: "ls-mh" }, x);
    const row = (...kids: HTMLElement[]) => h("div", { className: "ls-mrow" }, ...kids);
    if (kind === "chapters") {
      const now = sceneAt(clk.time());
      menu.replaceChildren(head(labels.chapters), ...timing.scenes.map((sc, i) => item(sceneName(i), i === now, () => seek(sc.start + EPS), clock(sc.start))));
    } else {
      menu.replaceChildren(
        head(labels.speed), row(...RATES.map((r) => item(`${r}×`, r === rate, () => setRate(r)))),
        head(labels.captionSize), row(...CAP_SIZES.map((z, n) => item(labels.sizes[n]!, z === capSize, () => { capSize = z; fit(); savePrefs(); }))),
        item(labels.captionBg, capBg, () => { capBg = !capBg; wrap.classList.toggle("ls-nocapbg", !capBg); savePrefs(); }),
      );
    }
    menu.hidden = false;
    (menu.querySelector<HTMLElement>(".is-on") ?? menu.querySelector<HTMLElement>("button"))?.focus();
  }

  playBtn.addEventListener("click", toggle);
  bigPlay.addEventListener("click", (e) => {
    e.stopPropagation();
    void play();
  });
  viewport.addEventListener("click", toggle);
  seekEl.addEventListener("input", () => { seek(Number(seekEl.value)); showTipAt(Number(seekEl.value)); });
  chapBtn.addEventListener("click", () => openMenu("chapters"));
  setBtn.addEventListener("click", () => openMenu("settings"));
  volBtn.addEventListener("click", () => setVolume(volume || 1, !muted));
  volEl.addEventListener("input", () => setVolume(Number(volEl.value), Number(volEl.value) === 0));
  fsBtn.addEventListener("click", toggleFull);
  fsBtn.hidden = typeof document === "undefined";
  document.addEventListener("fullscreenchange", onFull);
  seekEl.addEventListener("pointermove", (e) => {
    const r = seekEl.getBoundingClientRect();
    if (r.width) showTipAt(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * timing.duration);
  });
  seekEl.addEventListener("pointerleave", () => { tip.hidden = true; });
  seekEl.addEventListener("change", () => { tip.hidden = true; });
  wrap.addEventListener("pointermove", wake);
  root.addEventListener("pointerdown", (e) => {
    const el = e.target as Node;
    if (!menu.hidden && !menu.contains(el) && !chapBtn.contains(el) && !setBtn.contains(el)) closeMenu();
  });
  ccBtn.addEventListener("click", () => setCaptions(!captionsOn));
  trBtn.addEventListener("click", () => {
    if (tier === "text") return;
    transcriptOpen = !transcriptOpen;
    transcriptBox.hidden = !transcriptOpen;
    sentIndex = "";
    renderAt(clk.time());
    syncButtons();
  });
  wrap.tabIndex = -1;
  wrap.addEventListener("keydown", onKey);
  document.addEventListener("visibilitychange", onVisibility);
  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => { fit(); still(clk.time()); }) : null;
  ro?.observe(host);

  function applyTier(): void {
    transcriptBox.hidden = !(transcriptOpen || tier === "text");
    sentIndex = "";
    current = null;
    emit({ type: "tier", tier });
  }

  function setRate(r: number): void {
    rate = r;
    clk.setRate(r);
    syncButtons();
    savePrefs();
  }

  /* ---------- start ---------- */
  applyLang();
  clk = makeClock();
  fit();
  applyTier();
  still(0);
  wrap.classList.toggle("ls-nocapbg", !capBg);
  syncButtons();
  // Icons from the shared library load once; the scene on screen is drawn again when they arrive.
  let gone = false;
  const usesLibrary = scenes.some((sc) => {
    const c = sc.content as { icon?: string; nodes?: { icon?: string }[] };
    let any = !!c.icon && needsLibraryIcon(c.icon);
    for (const n of c.nodes ?? []) if (n.icon && needsLibraryIcon(n.icon)) any = true;
    walkElements(sc, (el) => { if (el.type === "icon" && needsLibraryIcon(el.icon)) any = true; });
    return any;
  });
  const ready: Promise<void> = usesLibrary
    ? loadLibraryIcons(resolvePath(pkg, LIBRARY_ICONS_PATH), o.fetch ?? fetch).then(() => {
        if (gone) return;
        current = null;
        pvKey = "";
        still(clk.time());
      })
    : Promise.resolve();

  // Back where the learner left off (not in the first or last seconds).
  const place = o.remember ? readJson<{ t: number }>(`ls-pos:${m.id}`).t ?? 0 : 0;
  if (place > 5 && place < timing.duration - 5) seek(place);

  return {
    host,
    get lang() { return lang; },
    get tier() { return tier; },
    get orient() { return orient; },
    get duration() { return timing.duration; },
    get playing() { return clk.playing; },
    get sceneIndex() { return sceneAt(clk.time()); },
    ready,
    boxes() {
      const v = viewport.getBoundingClientRect();
      return [...stage.querySelectorAll<HTMLElement>("[data-el]")].map((el) => {
        const r = el.getBoundingClientRect();
        return { id: el.dataset.el!, x: r.left - v.left, y: r.top - v.top, w: r.width, h: r.height };
      });
    },
    elementAt(x: number, y: number) {
      for (const el of root.elementsFromPoint?.(x, y) ?? []) {
        const hit = (el as HTMLElement).closest?.("[data-el]") as HTMLElement | null;
        if (hit && stage.contains(hit)) return hit.dataset.el ?? null;
      }
      return null;
    },
    parts() {
      const v = viewport.getBoundingClientRect();
      return [...stage.querySelectorAll<HTMLElement>("[data-part]")].map((el) => {
        const r = el.getBoundingClientRect();
        return { id: el.dataset.part!, x: r.left - v.left, y: r.top - v.top, w: r.width, h: r.height };
      });
    },
    partAt(x: number, y: number) {
      for (const el of root.elementsFromPoint?.(x, y) ?? []) {
        const hit = (el as HTMLElement).closest?.("[data-part]") as HTMLElement | null;
        if (hit && stage.contains(hit)) return hit.dataset.part ?? null;
      }
      return null;
    },
    time: () => clk.time(),
    play,
    pause,
    toggle,
    seek,
    renderAt,
    setRate,
    setCaptions,
    async setLang(next: Lang) {
      if (next === lang || !m.languages.some((l) => l.code === next)) return;
      await ensureTiming(pkg, next, o.fetch);
      const wasPlaying = clk.playing;
      const t = clk.time();
      const i = sceneAt(t);
      const st = timing.scenes[i]!;
      const frac = clamp01((t - st.start) / (st.end - st.start));
      clk.destroy();
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      if (checkOpen) closeCheck();
      lang = next;
      applyLang();
      clk = makeClock();
      const nst = timing.scenes[i]!;
      seek(nst.start + frac * (nst.end - nst.start));
      emit({ type: "lang", lang });
      if (wasPlaying) void play();
    },
    setTier(next: Tier | "auto") {
      tierPref = next;
      tier = next === "auto" ? chooseTier(o.signals ?? readSignals()) : next;
      applyTier();
      renderAt(clk.time());
      syncButtons();
    },
    setOrient(next: Orient | "auto") {
      orientPref = next;
      fit();
      renderAt(clk.time());
    },
    destroy() {
      gone = true;
      if (wrap.classList.contains("ls-full")) document.documentElement.style.overflow = "";
      document.removeEventListener("fullscreenchange", onFull);
      clearTimeout(idle);
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      clk.destroy();
      ro?.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      root.replaceChildren();
    },
  };
}
