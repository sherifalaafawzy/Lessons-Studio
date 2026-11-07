// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LessonPackage } from "@lessonstudio/spec";
import { chooseTier, createPlayer, cueState, layers, layoutFlow, STAGE, type Player } from "../src/index.ts";
import { labelsFor } from "../src/labels.ts";
import { loadExample } from "../../../scripts/lib/examples.mjs";

const load = (id: string): LessonPackage => loadExample(id).pkg as LessonPackage;

/** A hand-driven clock and animation frame queue, so playback is deterministic in tests. */
let nowMs = 0;
let frames: FrameRequestCallback[] = [];
beforeEach(() => {
  nowMs = 0;
  frames = [];
  globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => (frames.push(cb), frames.length);
  globalThis.cancelAnimationFrame = () => {};
});
function advance(seconds: number, steps = 20): void {
  for (let i = 0; i < steps; i++) {
    nowMs += (seconds * 1000) / steps;
    const run = frames;
    frames = [];
    for (const f of run) f(nowMs);
  }
}

let players: Player[] = [];
afterEach(() => {
  for (const p of players) p.destroy();
  players = [];
  document.body.replaceChildren();
});

function mk(id: string, opts: Parameters<typeof createPlayer>[2] = {}): { p: Player; root: ShadowRoot; pkg: LessonPackage } {
  const pkg = load(id);
  const host = document.createElement("div");
  document.body.append(host);
  const p = createPlayer(host, pkg, { tier: "full", orient: "landscape", now: () => nowMs, ...opts });
  players.push(p);
  return { p, root: host.shadowRoot!, pkg };
}
const stageHtml = (root: ShadowRoot): string => root.querySelector(".ls-stage")!.innerHTML;
function setWindow(w: number, h: number): void {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: w });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: h });
}
const sceneTimes = (pkg: LessonPackage, lang: string) => Object.fromEntries(pkg.timing[lang]!.scenes.map((s) => [s.id, s]));

describe("quality tiers", () => {
  it("picks the tier from device signals", () => {
    expect(chooseTier({})).toBe("full");
    expect(chooseTier({ memory: 8, cores: 8 })).toBe("full");
    expect(chooseTier({ reducedMotion: true })).toBe("lite");
    expect(chooseTier({ memory: 2, cores: 8 })).toBe("lite");
    expect(chooseTier({ memory: 4, cores: 2 })).toBe("lite");
    expect(chooseTier({ memory: 0.5 })).toBe("frames");
    expect(chooseTier({ saveData: true, memory: 8 })).toBe("frames");
    expect(chooseTier({ network: "2g" })).toBe("frames");
  });
});

describe("flow layout", () => {
  const pkg = load("prompt-injection");
  const how = pkg.scenes.scenes.find((s) => s.id === "how")!;
  if (how.template !== "flow") throw new Error("expected a flow scene");

  it("puts sources first", () => {
    expect(layers(how.content.nodes, how.content.edges)).toEqual([["you", "page"], ["agent"], ["files"]]);
  });

  it.each(["landscape", "portrait", "square"] as const)("mirrors every x in right-to-left (%s)", (orient) => {
    const ltr = layoutFlow(how.content.nodes, how.content.edges, { orient, dir: "ltr", top: 150, bottom: 130 });
    const rtl = layoutFlow(how.content.nodes, how.content.edges, { orient, dir: "rtl", top: 150, bottom: 130 });
    const { W } = STAGE[orient];
    for (const id of Object.keys(ltr.nodes)) {
      const a = ltr.nodes[id]!;
      const b = rtl.nodes[id]!;
      expect(b.y).toBe(a.y);
      expect(b.w).toBe(a.w);
      expect(b.x).toBeCloseTo(W - a.x - a.w, 0);
    }
    // In left-to-right the flow runs rightwards; mirrored, leftwards.
    expect(ltr.nodes.files!.x).toBeGreaterThan(ltr.nodes.you!.x);
    if (orient !== "portrait") expect(rtl.nodes.files!.x).toBeLessThan(rtl.nodes.you!.x);
  });

  it("keeps boxes on the stage", () => {
    for (const orient of ["landscape", "portrait", "square"] as const) {
      const { W, H } = STAGE[orient];
      for (const b of Object.values(layoutFlow(how.content.nodes, how.content.edges, { orient, dir: "ltr", top: 150, bottom: 130 }).nodes)) {
        expect(b.x).toBeGreaterThanOrEqual(0);
        expect(b.y).toBeGreaterThanOrEqual(0);
        expect(b.x + b.w).toBeLessThanOrEqual(W);
        expect(b.y + b.h).toBeLessThanOrEqual(H);
      }
    }
  });
});

describe("cue state", () => {
  it("depends only on the time", () => {
    const cues = [
      { action: "highlight" as const, target: "a", at: 1, found: true },
      { action: "pulse" as const, target: "b", at: 2, found: true },
      { action: "move" as const, target: "x>y", at: 2, found: true },
      { action: "reveal" as const, target: "c", at: 3, found: true },
    ];
    const s = cueState(cues, 2.2, "full");
    expect([...s.hi]).toEqual(["a"]);
    expect(s.pulse.has("b")).toBe(true);
    expect(s.moves[0]!.target).toBe("x>y");
    expect(s.at.get("c")).toBe(3);
    expect(s.hiAt.get("a")).toBe(1);
    // No motion outside the full tier.
    const lite = cueState(cues, 2.2, "lite");
    expect(lite.pulse.size + lite.moves.length).toBe(0);
    expect(cueState(cues, 0.5, "full").hi.size).toBe(0);
  });
});

describe("player", () => {
  it("draws the same frame for the same time, whatever came before", () => {
    const { p, root, pkg } = mk("prompt-injection");
    const times = [0, 3.2, 9.4, 14.1, 26, 33.3, 44, 55.5, pkg.timing.en!.duration];
    const once = times.map((t) => (p.renderAt(t), stageHtml(root)));
    // Again, in a scrambled order, after visiting other scenes.
    for (const [i, t] of [...times.entries()].reverse()) {
      p.renderAt(times[(i + 3) % times.length]!);
      p.renderAt(t);
      expect(stageHtml(root), `t=${t}`).toBe(once[i]);
    }
  });

  it("calls out a warning sign when the narration names it", () => {
    const { p, root, pkg } = mk("phishing-message", { tier: "lite" });
    const signs = sceneTimes(pkg, "en").signs!;
    const pressure = signs.words.find((w) => w.w === "Pressure")!;
    const callout = () => root.querySelectorAll<HTMLElement>(".ls-callout")[0]!;
    const line = () => root.querySelectorAll<HTMLElement>(".ls-msg-line")[1]!;

    p.renderAt(pressure.s - 0.05);
    expect(callout().style.opacity).toBe("0");
    expect(line().classList.contains("is-flag")).toBe(false);

    p.renderAt(pressure.s + 0.01);
    expect(callout().style.opacity).toBe("1");
    expect(line().classList.contains("is-flag")).toBe(true);
    expect(callout().classList.contains("is-hi")).toBe(true);
  });

  it("shows the caption being spoken, word by word", () => {
    const { p, root, pkg } = mk("prompt-injection");
    const w = sceneTimes(pkg, "en").how!.words.find((x) => x.w === "hides")!;
    p.renderAt(w.s + 0.01);
    const cap = root.querySelector(".ls-cap")!;
    expect(cap.textContent).toContain("hides");
    expect(cap.querySelector(".is-now")!.textContent).toBe("hides");
  });

  it("plays, stops at the quick check, and carries on after an answer", async () => {
    const events: string[] = [];
    const { p, root, pkg } = mk("prompt-injection", { onEvent: (e) => events.push(e.type === "check" ? `check:${e.correct}` : e.type) });
    const check = sceneTimes(pkg, "en").check!;
    p.seek(check.end - 0.5);
    await p.play();
    advance(1.5);
    expect(p.playing).toBe(false);
    const box = root.querySelector<HTMLElement>(".ls-check")!;
    expect(box.hidden).toBe(false);
    expect(p.time()).toBeLessThan(check.end);

    root.querySelectorAll<HTMLButtonElement>(".ls-opt")[0]!.click();
    expect(root.querySelector(".ls-fb")!.textContent).toBe("Correct");
    root.querySelector<HTMLButtonElement>(".ls-check .ls-go")!.click();
    await Promise.resolve();
    advance(1);
    expect(p.playing).toBe(true);
    expect(p.time()).toBeGreaterThan(check.end);
    expect(events).toContain("check:true");
  });

  it("explains a wrong answer with its own text", async () => {
    const answerWith = async (right: boolean) => {
      const pkg = load("prompt-injection");
      const scene = pkg.scenes.scenes.find((s) => s.check)!;
      scene.check!.explain = { en: "Correct — the page hid an instruction." };
      scene.check!.explainWrong = { en: "Not that one: the page hid an instruction." };
      const host = document.createElement("div");
      document.body.append(host);
      const p = createPlayer(host, pkg, { tier: "full", orient: "landscape", now: () => nowMs });
      players.push(p);
      const root = host.shadowRoot!;
      p.seek(sceneTimes(pkg, "en")[scene.id]!.end - 0.5);
      await p.play();
      advance(1.5);
      const at = scene.check!.options.findIndex((o) => (o.id === scene.check!.answer) === right);
      root.querySelectorAll<HTMLButtonElement>(".ls-opt")[at]!.click();
      return root.querySelector<HTMLElement>(".ls-explain")!;
    };
    const wrong = await answerWith(false);
    expect(wrong.hidden).toBe(false);
    expect(wrong.textContent).toBe("Not that one: the page hid an instruction.");
    // The verdict line above says "Correct", so the explanation keeps only its reason, from a capital.
    expect((await answerWith(true)).textContent).toBe("The page hid an instruction.");
  });

  it("takes the host's words for the check's button and the end, and counts in the lesson language's digits", async () => {
    // A host whose video is one step of a lesson: its own Continue moves on, so the card's button keeps watching,
    // and the end is the video's, not the lesson's. Egyptian Arabic, as Darsi's lessons are: its digits are ٠–٩.
    const pkg = load("prompt-injection");
    pkg.manifest.languages.find((l) => l.code === "ar")!.code = "ar-EG";
    pkg.timing["ar-EG"] = pkg.timing.ar!;
    delete pkg.timing.ar;
    const host = document.createElement("div");
    document.body.append(host);
    const p = createPlayer(host, pkg, {
      lang: "ar-EG", tier: "full", orient: "landscape", now: () => nowMs,
      labels: { next: "تابع المشاهدة", done: "انتهى الفيديو", score: "الإجابات الصحيحة: {n} من {m}" },
    });
    players.push(p);
    const root = host.shadowRoot!;
    const check = sceneTimes(pkg, "ar-EG").check!;
    p.seek(check.end - 0.5);
    await p.play();
    advance(1.5);
    const go = root.querySelector<HTMLButtonElement>(".ls-check .ls-go")!;
    expect(go.textContent).toBe("تابع المشاهدة");
    root.querySelectorAll<HTMLButtonElement>(".ls-opt")[0]!.click();
    go.click();
    await Promise.resolve();
    p.seek(p.duration - 0.3);
    await p.play();
    advance(1);
    expect(root.querySelector(".ls-end h3")!.textContent).toBe("انتهى الفيديو");
    const asked = pkg.scenes.scenes.filter((s) => s.check).length;
    const ar = (n: number) => String(n).replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)]!);
    expect(root.querySelector(".ls-score")!.textContent).toBe(`الإجابات الصحيحة: ${ar(1)} من ${ar(asked)}`);
  });

  it("keeps its own Arabic score free of a counted noun (no plural to agree with the numbers)", async () => {
    const { p, root } = mk("prompt-injection", { lang: "ar" });
    p.seek(p.duration - 0.3);
    await p.play();
    advance(1);
    expect(root.querySelector(".ls-end h3")!.textContent).toBe("اكتمل الدرس");
    expect(labelsFor("ar").score).toBe("الإجابات الصحيحة: {n} من {m}");
  });

  it("puts a quick check under the picture in a small player, so it is never cut off", async () => {
    const { p, root, pkg } = mk("prompt-injection");
    const wrap = root.querySelector<HTMLElement>(".ls-player")!;
    p.seek(sceneTimes(pkg, "en").check!.end - 0.5);
    await p.play();
    advance(1.5);
    expect(wrap.classList.contains("ls-asking")).toBe(true);
    root.querySelectorAll<HTMLButtonElement>(".ls-opt")[0]!.click();
    root.querySelector<HTMLButtonElement>(".ls-check .ls-go")!.click();
    await Promise.resolve();
    expect(wrap.classList.contains("ls-asking")).toBe(false);
  });

  it("asks in place of the picture in a page column too (laptops), and focuses the first answer once laid out", async () => {
    const pkg = load("prompt-injection");
    const host = document.createElement("div");
    // Darsi's lesson column on a laptop: compact, not narrow. The paused picture repeated the question with options
    // that did nothing, and pushed the real card under the page's Continue bar.
    Object.defineProperty(host, "clientWidth", { value: 528 });
    document.body.append(host);
    const p = createPlayer(host, pkg, { tier: "full", orient: "landscape", now: () => nowMs });
    players.push(p);
    const root = host.shadowRoot!;
    const wrap = root.querySelector<HTMLElement>(".ls-player")!;
    expect(wrap.classList.contains("ls-compact")).toBe(true);
    expect(wrap.classList.contains("ls-narrow")).toBe(false);
    const css = root.querySelector("style")!.textContent!;
    expect(css).toContain(".ls-asking:not(.ls-full):not(:fullscreen).ls-compact .ls-viewport{display:none}");
    expect(css).not.toContain(".ls-narrow .ls-viewport{display:none}");
    let askingAtFocus: boolean | null = null;
    root.addEventListener("focusin", () => { askingAtFocus ??= wrap.classList.contains("ls-asking"); });
    p.seek(sceneTimes(pkg, "en").check!.end - 0.5);
    await p.play();
    advance(1.5);
    expect(root.activeElement).toBe(root.querySelector(".ls-opt"));
    expect(askingAtFocus).toBe(true);
  });

  it("sizes its controls to the player: over the picture at every width, tighter on a phone", () => {
    const sized = (w: number) => {
      const pkg = load("prompt-injection");
      const host = document.createElement("div");
      Object.defineProperty(host, "clientWidth", { value: w });
      document.body.append(host);
      players.push(createPlayer(host, pkg, { tier: "full", orient: "landscape", now: () => nowMs }));
      const player = host.shadowRoot!.querySelector(".ls-player")!;
      const bar = player.querySelector(".ls-bar")!;
      // The progress line is its own strip, above the buttons, and it stays left to right.
      expect(bar.firstElementChild!.classList.contains("ls-track")).toBe(true);
      expect(bar.querySelector(".ls-track")!.getAttribute("dir")).toBe("ltr");
      expect(bar.querySelector(".ls-row")).toBeTruthy();
      return [...player.classList].filter((c) => /^ls-(float|compact|narrow|tiny)$/.test(c)).sort();
    };
    expect(sized(1000)).toEqual(["ls-float"]);
    expect(sized(528)).toEqual(["ls-compact", "ls-float"]);
    expect(sized(343)).toEqual(["ls-compact", "ls-float", "ls-narrow"]);
    // A landscape video on a 360 px phone (328 px) keeps every button on one row.
    expect(sized(328)).toEqual(["ls-compact", "ls-float", "ls-narrow"]);
    // A portrait video on a phone (256 px): seven buttons and the clock need about 310 px, so the next-scene and volume
    // buttons go (chapters and the phone's keys cover them) and the row wraps rather than overlapping the clock.
    expect(sized(256)).toEqual(["ls-compact", "ls-float", "ls-narrow", "ls-tiny"]);
    const css = document.querySelector("div")!.shadowRoot!.querySelector("style")!.textContent!;
    expect(css).toContain(".ls-tiny .ls-next,.ls-tiny .ls-volbox{display:none}");
    expect(css).toContain(".ls-tiny .ls-row{flex-wrap:wrap");
  });

  it("shows a visible pause icon while playing (the play button fills its icons, so it must be a filled shape)", async () => {
    const { p, root } = mk("prompt-injection");
    await p.play();
    const d = [...root.querySelectorAll(".ls-play path")].map((x) => x.getAttribute("d"));
    expect(d.length).toBeGreaterThan(0);
    for (const path of d) expect(path).toMatch(/z$/i);
  });

  it("goes full screen without the Fullscreen API (iPhone) by stretching over the page, and Escape leaves", () => {
    const { root } = mk("prompt-injection");
    const wrap = root.querySelector<HTMLElement>(".ls-player")!;
    const fs = root.querySelector<HTMLButtonElement>(".ls-fs")!;
    expect(fs.hidden).toBe(false);
    const css = root.querySelector("style")!.textContent!;
    expect(css).toContain("100dvh");
    expect(css).toContain("safe-area-inset-top");
    fs.click();
    expect(wrap.classList.contains("ls-full")).toBe(true);
    expect(fs.getAttribute("aria-pressed")).toBe("true");
    expect(document.documentElement.style.overflow).toBe("hidden");
    expect(document.body.style.position).toBe("fixed");
    wrap.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(wrap.classList.contains("ls-full")).toBe(false);
    expect(document.documentElement.style.overflow).toBe("");
    expect(document.body.style.position).toBe("");
  });

  it("lifts the host's containment while stretched over the page, so the fixed player isn't clipped to the host", () => {
    const { p, root } = mk("prompt-injection");
    const host = root.host as HTMLElement;
    const fs = root.querySelector<HTMLButtonElement>(".ls-fs")!;
    const css = root.querySelector("style")!.textContent!;
    expect(css).toContain(":host{display:block;contain:content}");
    expect(css).toContain(":host([data-ls-full]){contain:none}");
    expect(host.hasAttribute("data-ls-full")).toBe(false);
    fs.click();
    expect(host.hasAttribute("data-ls-full")).toBe(true);
    fs.click();
    expect(host.hasAttribute("data-ls-full")).toBe(false);
    fs.click();
    p.destroy();
    expect(host.hasAttribute("data-ls-full")).toBe(false);
    expect(document.body.style.position).toBe("");
  });

  it("uses a viewport overlay on iPhone even when requestFullscreen exists, and the button leaves it", async () => {
    const { p, root } = mk("prompt-injection");
    const wrap = root.querySelector<HTMLElement>(".ls-player")!;
    const fs = root.querySelector<HTMLButtonElement>(".ls-fs")!;
    const ua = vi.spyOn(navigator, "userAgent", "get").mockReturnValue(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.0.0 Mobile/15E148 Safari/604.1",
    );
    const enabled = Object.getOwnPropertyDescriptor(document, "fullscreenEnabled");
    Object.defineProperty(document, "fullscreenEnabled", { configurable: true, get: () => true });
    let calls = 0;
    const prev = HTMLElement.prototype.requestFullscreen;
    HTMLElement.prototype.requestFullscreen = function () {
      calls++;
      return Promise.resolve();
    };
    const width = window.innerWidth;
    const height = window.innerHeight;
    try {
      fs.click();
      expect(calls).toBe(0);
      expect(wrap.classList.contains("ls-full")).toBe(true);
      expect(document.body.style.overflow).toBe("hidden");
      root.querySelector<HTMLButtonElement>(".ls-play")!.click();
      expect(p.playing).toBe(true);

      setWindow(375, 812);
      window.dispatchEvent(new Event("resize"));
      expect(wrap.classList.contains("ls-turned")).toBe(true);
      setWindow(812, 375);
      window.dispatchEvent(new Event("orientationchange"));
      expect(wrap.classList.contains("ls-turned")).toBe(false);

      fs.click();
      expect(wrap.classList.contains("ls-full")).toBe(false);
      expect(fs.getAttribute("aria-pressed")).toBe("false");
      expect(document.body.style.position).toBe("");
    } finally {
      ua.mockRestore();
      HTMLElement.prototype.requestFullscreen = prev;
      if (enabled) Object.defineProperty(document, "fullscreenEnabled", enabled);
      else delete (document as { fullscreenEnabled?: boolean }).fullscreenEnabled;
      setWindow(width, height);
    }
  });

  it("uses the Fullscreen API where it works (one tap in, the screen turned, one tap or the system out), and the overlay when the call cannot fullscreen a div", async () => {
    const { root } = mk("prompt-injection");
    const host = root.host as HTMLElement;
    const wrap = root.querySelector<HTMLElement>(".ls-player")!;
    const fs = root.querySelector<HTMLButtonElement>(".ls-fs")!;
    const saved = {
      enabled: Object.getOwnPropertyDescriptor(document, "fullscreenEnabled"),
      current: Object.getOwnPropertyDescriptor(document, "fullscreenElement"),
      exit: Object.getOwnPropertyDescriptor(document, "exitFullscreen"),
      orientation: Object.getOwnPropertyDescriptor(screen, "orientation"),
    };
    const locks: string[] = [];
    let unlocks = 0;
    Object.defineProperty(screen, "orientation", { configurable: true, value: { lock: (o: string) => (locks.push(o), Promise.resolve()), unlock: () => { unlocks++; } } });
    Object.defineProperty(document, "fullscreenEnabled", { configurable: true, get: () => true });
    // As in a browser: the player is in a shadow root, so the document names the host and only the shadow root the player.
    let full: Element | null = null;
    Object.defineProperty(document, "fullscreenElement", { configurable: true, get: () => (full ? host : null) });
    Object.defineProperty(root, "fullscreenElement", { configurable: true, get: () => full });
    const change = (): void => { document.dispatchEvent(new Event("fullscreenchange")); };
    Object.defineProperty(document, "exitFullscreen", { configurable: true, value: () => { full = null; change(); return Promise.resolve(); } });
    const prev = HTMLElement.prototype.requestFullscreen;
    let mode: "ok" | "reject" | "throw" = "ok";
    HTMLElement.prototype.requestFullscreen = function (this: HTMLElement) {
      if (mode === "throw") throw new Error("no");
      if (mode === "reject") return Promise.reject(new Error("no"));
      full = this;
      change();
      return Promise.resolve();
    };
    const pageMode = () => ({ cls: wrap.classList.contains("ls-full"), attr: host.hasAttribute("data-ls-full"), body: document.body.style.position });
    try {
      fs.click();
      await Promise.resolve();
      // The browser's own full screen only: no page mode on top of it, and the screen turned to the picture.
      expect(pageMode()).toEqual({ cls: false, attr: false, body: "" });
      expect(locks).toEqual(["landscape"]);
      expect(fs.getAttribute("aria-pressed")).toBe("true");
      // One tap leaves (it took two, and the first left the player over the page, turned on its side).
      fs.click();
      expect(pageMode()).toEqual({ cls: false, attr: false, body: "" });
      expect(fs.getAttribute("aria-pressed")).toBe("false");
      expect(unlocks).toBe(1);
      // Leaving by the system (Escape, Android's back) is the same.
      fs.click();
      await Promise.resolve();
      full = null;
      change();
      expect(pageMode()).toEqual({ cls: false, attr: false, body: "" });
      expect(fs.getAttribute("aria-pressed")).toBe("false");

      mode = "reject";
      fs.click();
      await Promise.resolve();
      await Promise.resolve();
      expect(wrap.classList.contains("ls-full")).toBe(true);
      fs.click();
      expect(wrap.classList.contains("ls-full")).toBe(false);

      mode = "throw";
      fs.click();
      expect(wrap.classList.contains("ls-full")).toBe(true);
    } finally {
      HTMLElement.prototype.requestFullscreen = prev;
      delete (root as { fullscreenElement?: Element | null }).fullscreenElement;
      for (const [target, key, d] of [[document, "fullscreenEnabled", saved.enabled], [document, "fullscreenElement", saved.current], [document, "exitFullscreen", saved.exit], [screen, "orientation", saved.orientation]] as const) {
        if (d) Object.defineProperty(target, key, d);
        else delete (target as unknown as Record<string, unknown>)[key];
      }
    }
  });

  it("scrubs along the screen's y when turned on its side (iPhone page fullscreen)", () => {
    const { p, root } = mk("prompt-injection");
    const wrap = root.querySelector<HTMLElement>(".ls-player")!;
    const track = root.querySelector<HTMLElement>(".ls-track")!;
    const seekEl = root.querySelector<HTMLInputElement>(".ls-seek")!;
    wrap.classList.add("ls-full", "ls-turned");
    track.getBoundingClientRect = () => ({ left: 0, top: 100, width: 20, height: 400, right: 20, bottom: 500, x: 0, y: 100, toJSON: () => ({}) });
    const at = (type: string, y: number) => seekEl.dispatchEvent(new MouseEvent(type, { clientX: 5, clientY: y, bubbles: true }));
    at("pointerdown", 200);
    expect(p.time()).toBeCloseTo(p.duration / 4, 0);
    at("pointermove", 400);
    expect(p.time()).toBeCloseTo((p.duration * 3) / 4, 0);
    at("pointerup", 400);
  });
  it("lets the host ask the check instead", async () => {
    let asked = "";
    const { p, pkg } = mk("phishing-message", {
      onCheck: async (c) => {
        asked = c.id;
        return { correct: true };
      },
    });
    const turn = sceneTimes(pkg, "en").turn!;
    p.seek(turn.end - 0.2);
    await p.play();
    advance(0.5);
    await Promise.resolve();
    expect(asked).toBe("q-forward-code");
  });

  it("switches to Arabic, right to left, keeping its place in the lesson", async () => {
    const { p, root, pkg } = mk("prompt-injection");
    const en = sceneTimes(pkg, "en").defend!;
    p.seek(en.start + (en.end - en.start) / 2);
    await p.setLang("ar");
    const ar = sceneTimes(pkg, "ar").defend!;
    expect(p.lang).toBe("ar");
    expect(p.time()).toBeCloseTo(ar.start + (ar.end - ar.start) / 2, 1);
    const wrap = root.querySelector(".ls-player")!;
    expect(wrap.getAttribute("dir")).toBe("rtl");
    expect(wrap.getAttribute("lang")).toBe("ar");
    expect(root.querySelector(".ls-cap")!.getAttribute("dir")).toBe("rtl");
    // The Arabic title keeps "(Prompt injection)" together, brackets and all, in a left-to-right isolate.
    p.renderAt(1);
    expect([...root.querySelectorAll(".ls-th-title bdi")].map((b) => b.textContent)).toEqual(["(Prompt injection)"]);
    // Player labels in Arabic, and no middle dot anywhere.
    expect(root.querySelector(".ls-play")!.getAttribute("aria-label")).toBe("تشغيل");
    expect(root.querySelector(".ls-next")!.getAttribute("aria-label")).toBe("المشهد التالي");
    expect(root.querySelector(".ls-track")!.getAttribute("dir")).toBe("ltr");
    expect(root.querySelector(".ls-time")!.getAttribute("dir")).toBe("ltr");
    expect(root.querySelector(".ls-seek")!.getAttribute("dir")).toBe("ltr");
    expect(root.querySelector(".ls-player")!.textContent).not.toContain("·");
  });

  it("text tier shows the transcript, following the narration", () => {
    const { p, root, pkg } = mk("phishing-message", { tier: "text" });
    expect(root.querySelector<HTMLElement>(".ls-player")!.dataset.tier).toBe("text");
    expect(root.querySelector<HTMLElement>(".ls-transcript")!.hidden).toBe(false);
    const signs = sceneTimes(pkg, "en").signs!;
    p.renderAt(signs.sentences[1]!.start + 0.1);
    expect(root.querySelector(".ls-sent.is-now")!.textContent).toBe(signs.sentences[1]!.text);
    expect(stageHtml(root)).toBe("");
  });

  it("frames tier shows each scene's final state as a still", () => {
    const { p, root, pkg } = mk("prompt-injection", { tier: "frames" });
    const how = sceneTimes(pkg, "en").how!;
    p.renderAt(how.start + 0.1);
    const early = stageHtml(root);
    p.renderAt(how.end - 0.1);
    expect(stageHtml(root)).toBe(early);
    expect([...root.querySelectorAll<HTMLElement>(".ls-node")].every((n) => n.style.opacity === "1")).toBe(true);
  });

  it("shows a poster, not an empty frame, before the first play", () => {
    const { root } = mk("prompt-injection");
    const words = [...root.querySelectorAll<HTMLElement>(".ls-th-title .ls-word")];
    expect(words.length).toBeGreaterThan(0);
    expect(words.every((w) => w.style.opacity === "1")).toBe(true);
    expect(root.querySelector(".ls-time")!.textContent!.startsWith("0:00")).toBe(true);
  });

  it("discloses AI help", () => {
    const { root } = mk("prompt-injection");
    const badge = root.querySelector<HTMLElement>(".ls-ai")!;
    expect(badge.hidden).toBe(false);
    expect(badge.title).toBe("script, translation");
  });

  it("draws the AI badge on the picture dark enough to read (its 12 px text was 3.2:1 on the light stage)", () => {
    const { root } = mk("prompt-injection");
    expect(root.querySelector("style")!.textContent).toMatch(/\.ls-float \.ls-ai\{[^}]*background:rgba\(0,0,0,\.72\)/);
  });

  it("says the progress line's place as a time in the lesson's digits, not as raw seconds", async () => {
    const { p, root, pkg } = mk("prompt-injection");
    const seek = root.querySelector<HTMLInputElement>(".ls-seek")!;
    const len = pkg.timing.en!.duration;
    const mmss = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t) % 60).padStart(2, "0")}`;
    expect(seek.getAttribute("aria-valuetext")).toBe(`0:00 of ${mmss(len)}`);
    p.seek(6.4);
    expect(seek.getAttribute("aria-valuetext")).toBe(`0:06 of ${mmss(len)}`);
    // Egyptian Arabic, as Darsi's lessons are: its digits are ٠–٩.
    const eg = load("prompt-injection");
    eg.manifest.languages.find((l) => l.code === "ar")!.code = "ar-EG";
    eg.timing["ar-EG"] = eg.timing.ar!;
    const host = document.createElement("div");
    document.body.append(host);
    const q = createPlayer(host, eg, { lang: "ar-EG", tier: "full", orient: "landscape", now: () => nowMs });
    players.push(q);
    q.seek(6.4);
    const ar = (t: string) => t.replace(/[0-9]/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)]!);
    expect(host.shadowRoot!.querySelector(".ls-seek")!.getAttribute("aria-valuetext")).toBe(`${ar("0:06")} من ${ar(mmss(eg.timing["ar-EG"]!.duration))}`);
  });
});

describe("youtube-style controls", () => {
  const press = (root: ShadowRoot, key: string): void => {
    root.querySelector(".ls-player")!.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  };

  it("seeks with the video keys, the next button and a double tap, and keeps a scene mark per chapter", () => {
    const { p, root, pkg } = mk("prompt-injection");
    const scenes = pkg.timing.en!.scenes;
    expect(root.querySelectorAll(".ls-tick")).toHaveLength(scenes.length - 1);
    expect(root.querySelector(".ls-buf")).toBeTruthy();
    expect(root.querySelector(".ls-played")!.getAttribute("style")).toContain("scaleX(0)");
    expect(root.querySelector<HTMLElement>(".ls-bigplay")!.hidden).toBe(false);

    p.seek(30);
    press(root, "l");
    expect(p.time()).toBeCloseTo(40, 1);
    press(root, "j");
    expect(p.time()).toBeCloseTo(30, 1);
    press(root, "ArrowRight");
    expect(p.time()).toBeCloseTo(35, 1);
    press(root, "ArrowLeft");
    expect(p.time()).toBeCloseTo(30, 1);
    press(root, "ArrowDown");
    expect(root.querySelector<HTMLInputElement>(".ls-volr")!.value).toBe("0.95");
    press(root, "m");
    expect(root.querySelector(".ls-vol")!.getAttribute("aria-pressed")).toBe("true");
    expect(root.querySelector(".ls-vol")!.getAttribute("aria-label")).toBe("Unmute");
    press(root, "c");
    expect(root.querySelector(".ls-cc")!.getAttribute("aria-pressed")).toBe("false");
    press(root, "0");
    expect(p.time()).toBe(0);
    press(root, "5");
    expect(p.time()).toBeCloseTo(scenes.at(-1)!.end / 2, 0);

    p.seek(scenes[0]!.end - 1);
    root.querySelector<HTMLButtonElement>(".ls-next")!.click();
    expect(p.time()).toBeCloseTo(scenes[1]!.start + 0.01, 2);

    p.seek(scenes.at(-1)!.start + 0.2);
    expect(root.querySelector<HTMLButtonElement>(".ls-next")!.disabled).toBe(true);

    const vp = root.querySelector<HTMLElement>(".ls-viewport")!;
    vp.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: 320, bottom: 180, width: 320, height: 180, toJSON() { return {}; } });
    p.seek(30);
    const tap = (x: number) => {
      vp.dispatchEvent(new PointerEvent("pointerdown", { clientX: x, clientY: 40, pointerType: "touch", bubbles: true }));
      vp.dispatchEvent(new PointerEvent("pointerup", { clientX: x, clientY: 40, pointerType: "touch", bubbles: true }));
    };
    tap(30);
    tap(30);
    expect(p.time()).toBeCloseTo(20, 1);
    expect(root.querySelector(".ls-flash")!.classList.contains("is-back")).toBe(true);
    tap(280);
    tap(280);
    expect(p.time()).toBeCloseTo(30, 1);
  });

  it("hides the controls after three seconds of playback and shows them again when the pointer moves", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const { p, root } = mk("prompt-injection");
      const wrap = root.querySelector(".ls-player")!;
      await p.play();
      expect(wrap.classList.contains("ls-idle")).toBe(false);
      expect(root.querySelector<HTMLElement>(".ls-bigplay")!.hidden).toBe(true);
      vi.advanceTimersByTime(2990);
      expect(wrap.classList.contains("ls-idle")).toBe(false);
      vi.advanceTimersByTime(20);
      expect(wrap.classList.contains("ls-idle")).toBe(true);
      wrap.dispatchEvent(new Event("pointermove"));
      expect(wrap.classList.contains("ls-idle")).toBe(false);
      p.pause();
      expect(root.querySelector<HTMLElement>(".ls-bigplay")!.hidden).toBe(false);
      vi.advanceTimersByTime(4000);
      expect(wrap.classList.contains("ls-idle")).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("offers caption language, speed and chapters from the menus", () => {
    const { root, pkg } = mk("prompt-injection");
    root.querySelector<HTMLButtonElement>(".ls-set")!.click();
    const menu = root.querySelector(".ls-menu")!;
    expect(menu.textContent).toContain("Caption language");
    expect(menu.textContent).toContain("English");
    expect(menu.textContent).toContain("العربية");
    expect(menu.textContent).toContain("1.5×");
    root.querySelector<HTMLButtonElement>(".ls-chap")!.click();
    expect(root.querySelectorAll(".ls-menu .ls-mi")).toHaveLength(pkg.timing.en!.scenes.length);
  });
});

describe("narration audio", () => {
  const proto = HTMLMediaElement.prototype;
  const saved = { play: proto.play, pause: proto.pause, canPlayType: proto.canPlayType };
  afterEach(() => {
    proto.play = saved.play;
    proto.pause = saved.pause;
    proto.canPlayType = saved.canPlayType;
  });
  /** Lets the chain of plays, failures and retries settle. */
  const settle = async (): Promise<void> => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

  function withAudio(onEvent: (type: string) => void, fallback?: string): Player {
    const pkg = load("prompt-injection");
    pkg.manifest.languages[0]!.audio = "audio/en.opus";
    if (fallback) pkg.manifest.languages[0]!.audioFallback = fallback;
    const host = document.createElement("div");
    document.body.append(host);
    const p = createPlayer(host, pkg, { lang: "en", tier: "full", orient: "landscape", now: () => nowMs, onEvent: (e) => onEvent(e.type) });
    players.push(p);
    return p;
  }

  it("downloads nothing before play, and goes on silently with captions when the narration can't load", async () => {
    const asked: string[] = [];
    proto.pause = () => {};
    proto.play = function (this: HTMLMediaElement) {
      asked.push(this.src);
      return Promise.reject(new DOMException("no supported source", "NotSupportedError"));
    };
    const events: string[] = [];
    const p = withAudio((t) => events.push(t));
    p.seek(5);
    expect(asked).toEqual([]);
    await p.play();
    expect(asked).toEqual([expect.stringMatching(/audio\/en\.opus$/)]);
    expect(events).toContain("no-audio");
    expect(p.playing).toBe(true);
    const before = p.time();
    advance(1);
    expect(p.time() - before).toBeCloseTo(1, 1);
  });

  it("doesn't drop the narration when the browser only blocks autoplay", async () => {
    proto.play = () => Promise.reject(new DOMException("needs a gesture", "NotAllowedError"));
    const events: string[] = [];
    const p = withAudio((t) => events.push(t));
    await p.play();
    expect(events).not.toContain("no-audio");
    expect(p.playing).toBe(false);
  });

  it("picks the AAC file where only WebM Opus plays: the Opus files are Ogg (Safari before 18.4 played them silently)", async () => {
    const asked: string[] = [];
    proto.pause = () => {};
    proto.canPlayType = (type: string) => (/webm|mp4/.test(type) ? "probably" : "");
    proto.play = function (this: HTMLMediaElement) {
      asked.push(this.src);
      return Promise.resolve();
    };
    const events: string[] = [];
    const p = withAudio((t) => events.push(t), "audio/en.m4a");
    await p.play();
    expect(asked).toEqual([expect.stringMatching(/audio\/en\.m4a$/)]);
    expect(events).not.toContain("no-audio");
  });

  it("still picks the Opus file where Ogg Opus plays", async () => {
    const asked: string[] = [];
    proto.pause = () => {};
    proto.canPlayType = (type: string) => (/ogg/.test(type) ? "probably" : "");
    proto.play = function (this: HTMLMediaElement) {
      asked.push(this.src);
      return Promise.resolve();
    };
    const p = withAudio(() => {}, "audio/en.m4a");
    await p.play();
    expect(asked).toEqual([expect.stringMatching(/audio\/en\.opus$/)]);
  });

  it("tries the AAC file once when the Opus file won't play, from the same moment, before going on silently", async () => {
    const asked: string[] = [];
    proto.pause = () => {};
    proto.canPlayType = (type: string) => (/ogg/.test(type) ? "maybe" : "");
    let m4aPlays = true;
    proto.play = function (this: HTMLMediaElement) {
      asked.push(this.src);
      if (/\.m4a$/.test(this.src) && m4aPlays) return Promise.resolve();
      return Promise.reject(new DOMException("no supported source", "NotSupportedError"));
    };
    const events: string[] = [];
    const p = withAudio((t) => events.push(t), "audio/en.m4a");
    await p.play();
    await settle();
    expect(asked.map((s) => s.split("/").pop())).toEqual(["en.opus", "en.m4a"]);
    expect(events).not.toContain("no-audio");

    // Both files fail (offline): one retry only, then captions and no sound.
    asked.length = 0;
    events.length = 0;
    m4aPlays = false;
    const q = withAudio((t) => events.push(t), "audio/en.m4a");
    q.seek(5);
    await q.play();
    await settle();
    expect(asked.map((s) => s.split("/").pop())).toEqual(["en.opus", "en.m4a"]);
    expect(events.filter((e) => e === "no-audio")).toHaveLength(1);
    expect(q.playing).toBe(true);
    expect(q.time()).toBeCloseTo(5, 1);
  });
});

describe("menus from the keyboard", () => {
  const key = (root: ShadowRoot, k: string): void => {
    (root.activeElement as HTMLElement).dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, composed: true }));
  };

  it("moves through a menu with the arrow keys, Home and End, and Escape goes back to its button", () => {
    const { root } = mk("prompt-injection");
    const set = root.querySelector<HTMLButtonElement>(".ls-set")!;
    set.focus();
    set.click();
    const menu = root.querySelector<HTMLElement>(".ls-menu")!;
    expect(menu.hidden).toBe(false);
    expect(menu.getAttribute("aria-label")).toBe("Settings");
    const items = [...menu.querySelectorAll<HTMLElement>(".ls-mi")];
    // The current speed has the focus, and it is the menu's one tab stop.
    const on = items.findIndex((b) => b.textContent === "1×");
    expect(root.activeElement).toBe(items[on]);
    const stops = () => items.filter((b) => b.tabIndex === 0);
    expect(stops()).toEqual([items[on]]);
    key(root, "ArrowDown");
    expect(root.activeElement).toBe(items[on + 1]);
    expect(stops()).toEqual([items[on + 1]]);
    key(root, "ArrowUp");
    expect(root.activeElement).toBe(items[on]);
    key(root, "End");
    expect(root.activeElement).toBe(items.at(-1));
    key(root, "ArrowDown");
    expect(root.activeElement).toBe(items[0]);
    key(root, "ArrowUp");
    expect(root.activeElement).toBe(items.at(-1));
    key(root, "Home");
    expect(root.activeElement).toBe(items[0]);
    key(root, "Escape");
    expect(menu.hidden).toBe(true);
    expect(root.activeElement).toBe(set);
    expect(set.getAttribute("aria-expanded")).toBe("false");
    // Tab closes it from its button, so the browser moves on from there, not from the menu above the bar.
    set.click();
    key(root, "Tab");
    expect(menu.hidden).toBe(true);
    expect(root.activeElement).toBe(set);
  });

  it("follows the reading direction with left and right in Arabic, and an item chosen from the keyboard goes back to the button", async () => {
    const { p, root } = mk("prompt-injection");
    await p.setLang("ar");
    const chap = root.querySelector<HTMLButtonElement>(".ls-chap")!;
    chap.click();
    const items = [...root.querySelectorAll<HTMLElement>(".ls-menu .ls-mi")];
    expect(root.activeElement).toBe(items[0]);
    key(root, "ArrowLeft");
    expect(root.activeElement).toBe(items[1]);
    key(root, "ArrowRight");
    expect(root.activeElement).toBe(items[0]);
    // Enter or Space on a button clicks it with no detail.
    items[1]!.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 0 }));
    expect(root.querySelector<HTMLElement>(".ls-menu")!.hidden).toBe(true);
    expect(root.activeElement).toBe(chap);
    // A tap leaves the focus alone, so the controls can still fade while the video plays.
    chap.blur();
    chap.click();
    root.querySelectorAll<HTMLElement>(".ls-menu .ls-mi")[2]!.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
    expect(root.activeElement).not.toBe(chap);
  });

  it("draws a two-tone focus ring that shows on light and dark surfaces alike", () => {
    const { root } = mk("prompt-injection", { brand: "darsi-light" });
    const css = root.querySelector("style")!.textContent!;
    expect(css).toMatch(/\.ls-bigplay:focus-visible,[^{]*\{outline:3px solid var\(--ls-ring-out,#1e1a33\);outline-offset:2px;box-shadow:0 0 0 5px var\(--ls-ring-in,#ffc53d\)\}/);
    expect(css).toContain(".ls-brand-darsi-light{");
    expect(css).toMatch(/\.ls-brand-darsi-light\{[^}]*--ls-ring-in:#ffc53d;--ls-ring-out:#1e1a33\}/);
    // A focused menu item keeps the mark of the current choice.
    expect(css).toContain(".ls-mi.is-on:focus-visible{box-shadow:inset 0 0 0 2px var(--ls-accent),0 0 0 5px var(--ls-ring-in,#ffc53d)}");
  });
});

describe("canvas scenes", () => {
  const scene = (p: Player, pkg: LessonPackage, id: string) => {
    const i = pkg.scenes.scenes.findIndex((s) => s.id === id);
    return { i, st: p.duration ? pkg.timing[p.lang]!.scenes[i]! : null! };
  };

  it("eases keyframes and holds them before the first and after the last", async () => {
    const { compileTracks, valueAt, easeOf } = await import("../src/index.ts");
    const [c] = compileTracks([{ prop: "x", keys: [{ at: 1, value: 0 }, { at: 3, value: 100, ease: "linear" }] }], { id: "s", start: 0, end: 5, sentences: [], words: [] }, "en");
    expect(valueAt(c!, 0)).toBe(0);
    expect(valueAt(c!, 2)).toBe(50);
    expect(valueAt(c!, 4)).toBe(100);
    expect(valueAt(c!, 2, true)).toBe(0);
    expect(easeOf("back", 0.7)).toBeGreaterThan(1);
    expect(easeOf("step", 0.99)).toBe(0);
    expect(easeOf(undefined, 0.5)).toBeCloseTo(0.5);
  });

  it("draws the same frame for the same time, whatever came before", () => {
    const { p, root, pkg } = mk("how-ai-learns");
    const { st } = scene(p, pkg, "network");
    const times = [st.start + 1, st.start + 6.5, st.end - 0.5, st.start + 3.2];
    const frames = times.map((t) => { p.renderAt(t); return stageHtml(root); });
    for (const t of [...times].reverse()) p.renderAt(t);
    times.forEach((t, i) => { p.renderAt(t); expect(stageHtml(root)).toBe(frames[i]); });
  });

  it("anchors keyframes to the spoken word in each language", async () => {
    const { findWord } = await import("@lessonstudio/spec");
    const pkg = load("how-ai-learns");
    const i = pkg.scenes.scenes.findIndex((s) => s.id === "network");
    const en = findWord(pkg.timing.en!.scenes[i]!, "passes")!;
    const ar = findWord(pkg.timing.ar!.scenes[i]!, "تمر")!;
    expect(en).not.toBe(ar);
    for (const [lang, at] of [["en", en], ["ar", ar]] as const) {
      const { p, root } = mk("how-ai-learns", { lang });
      const dot = () => root.querySelector<HTMLElement>('[data-el="signal"]')!;
      p.renderAt(at - 0.2);
      expect(dot().style.opacity).toBe("0");
      p.renderAt(at + 0.05);
      expect(dot().style.opacity).toBe("1");
    }
  });

  it("mirrors free elements in Arabic, but not code or charts inside them", () => {
    const pos = (lang: string) => {
      const { p, root, pkg } = mk("how-ai-learns", { lang });
      const i = pkg.scenes.scenes.findIndex((s) => s.id === "network");
      p.renderAt(pkg.timing[lang]!.scenes[i]!.end - 0.2);
      return root.querySelector<HTMLElement>('[data-el="in1"]')!.style;
    };
    expect(pos("en").left).toBe("170px");
    expect(pos("ar").right).toBe("170px");
    const { p, root, pkg } = mk("how-ai-learns", { lang: "ar" });
    p.renderAt(pkg.timing.ar!.scenes[2]!.end - 0.2);
    expect(root.querySelector('[data-el="rule"]')!.getAttribute("dir")).toBe("ltr");
    expect(root.querySelector('[data-el="err"]')!.getAttribute("dir")).toBe("ltr");
  });

  it("types code and zooms the camera as the narration says", () => {
    const { p, root, pkg } = mk("how-ai-learns");
    const st = pkg.timing.en!.scenes[2]!;
    p.renderAt(st.start + 0.2);
    expect(root.querySelector(".ls-code-line")!.textContent).toBe("");
    p.renderAt(st.end - 0.2);
    expect([...root.querySelectorAll(".ls-code-line")].map((l) => l.textContent)).toEqual(["guess = model(x)", "error = guess - y", "w = w - 0.1 * error"]);
    expect(root.querySelector<HTMLElement>(".ls-shot")!.style.transform).toContain("scale(1.2)");
  });

  it("brings scenes in with their transition, and only in the full tier", () => {
    const { p, root, pkg } = mk("how-ai-learns");
    const last = pkg.timing.en!.scenes[3]!;
    p.renderAt(last.start + 0.1);
    expect(root.querySelector<HTMLElement>(".ls-wipe")!.style.transform).toMatch(/translateX\(\d/);
    const lite = mk("how-ai-learns", { tier: "lite" });
    lite.p.renderAt(last.start + 0.1);
    expect(lite.root.querySelector(".ls-wipe")).toBeNull();
  });
});
