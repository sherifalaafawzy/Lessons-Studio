import type { Check, Lang, LessonPackage, ResolvedCue, TimingFile } from "@lessonstudio/spec";
import { captionChunks, pick, resolveCues, walkElements, type CaptionChunk } from "@lessonstudio/spec";
import type { ElementBox } from "./canvas.ts";
import { AudioClock, SilentClock, pickAudio, type Clock } from "./clock.ts";
import { h, rich, Writer } from "./dom.ts";
import { icon } from "./icons.ts";
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
  destroy(): void;
}

const RATES = [0.75, 1, 1.25, 1.5];
const EPS = 0.01;

function clock(t: number): string {
  const s = Math.max(0, Math.floor(t));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Puts a player for `pkg` into `host` (inside a shadow root, so the page's CSS can't reach it). */
export function createPlayer(host: HTMLElement, pkg: LessonPackage, o: PlayerOptions = {}): Player {
  const m = pkg.manifest;
  const scenes = pkg.scenes.scenes;
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
  let rate = o.rate ?? 1;
  let captionsOn = o.captions ?? true;
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
  const main = h("div", { className: "ls-main" }, viewport, checkBox, endBox);

  const playBtn = h("button", { className: "ls-btn ls-play", type: "button" });
  const timeEl = h("span", { className: "ls-time", dir: "ltr" });
  const seekEl = h("input", { className: "ls-seek", type: "range", min: 0, step: 0.1, dir: "ltr" });
  const ticks = h("div", { className: "ls-ticks" });
  const speedBtn = h("button", { className: "ls-btn ls-speed", type: "button", dir: "ltr" });
  const ccBtn = h("button", { className: "ls-btn ls-cc", type: "button" }, icon("cc", 22));
  const trBtn = h("button", { className: "ls-btn ls-tr", type: "button" }, icon("list", 22));
  const aiBadge = h("span", { className: "ls-ai" });
  const bar = h(
    "div",
    { className: "ls-bar" },
    playBtn, timeEl, h("div", { className: "ls-track" }, ticks, seekEl), speedBtn, ccBtn, trBtn, aiBadge,
  );
  const transcriptBox = h("div", { className: "ls-transcript", hidden: true });
  const wrap = h("div", { className: `ls-player ls-brand-${brand} ls-landscape` }, main, bar, transcriptBox);
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
    speedBtn.setAttribute("aria-label", labels.speed);
    ccBtn.setAttribute("aria-label", labels.captions);
    trBtn.setAttribute("aria-label", labels.transcript);
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

  function mount(i: number): Mounted {
    const st = timing.scenes[i]!;
    const { W, H } = STAGE[orient];
    const dir = track().dir;
    const ctx = {
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
      scale: stageScale,
      url: (path: string) => resolvePath(pkg, path),
    };
    const mounted = mountScene(scenes[i]!, ctx);
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
    wrap.style.setProperty("--ls-cap-size", `${Math.round(Math.max(15, Math.min(24, 34 * k)))}px`);
  }

  /* ---------- playback ---------- */
  function syncButtons(): void {
    const on = clk.playing;
    playBtn.replaceChildren(icon(on ? "pause" : "play", 22));
    playBtn.setAttribute("aria-label", on ? labels.pause : labels.play);
    bigPlay.hidden = on || checkOpen || ended;
    speedBtn.textContent = `${rate}×`;
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
    endBox.replaceChildren(h("div", { className: "ls-card" }, h("h3", null, labels.done), again));
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
  const onKey = (e: KeyboardEvent): void => {
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === "BUTTON" || tag === "INPUT") return;
    if (e.key === " " || e.key === "k") {
      e.preventDefault();
      toggle();
    } else if (e.key === "c") setCaptions(!captionsOn);
  };
  const onVisibility = (): void => {
    if (document.hidden) pause();
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
  }

  playBtn.addEventListener("click", toggle);
  bigPlay.addEventListener("click", (e) => {
    e.stopPropagation();
    void play();
  });
  viewport.addEventListener("click", toggle);
  seekEl.addEventListener("input", () => seek(Number(seekEl.value)));
  speedBtn.addEventListener("click", () => setRate(RATES[(RATES.indexOf(rate) + 1) % RATES.length]!));
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
  }

  /* ---------- start ---------- */
  applyLang();
  clk = makeClock();
  fit();
  applyTier();
  still(0);
  syncButtons();

  return {
    host,
    get lang() { return lang; },
    get tier() { return tier; },
    get orient() { return orient; },
    get duration() { return timing.duration; },
    get playing() { return clk.playing; },
    get sceneIndex() { return sceneAt(clk.time()); },
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
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      clk.destroy();
      ro?.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      root.replaceChildren();
    },
  };
}
