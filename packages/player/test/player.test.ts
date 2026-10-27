// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LessonPackage } from "@lessonstudio/spec";
import { chooseTier, createPlayer, cueState, layers, layoutFlow, STAGE, type Player } from "../src/index.ts";
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
    // The Arabic title keeps "Prompt injection" together in an isolate.
    p.renderAt(1);
    expect([...root.querySelectorAll(".ls-th-title bdi")].map((b) => b.textContent)).toEqual(["Prompt injection"]);
    // Player labels in Arabic, and no middle dot anywhere.
    expect(root.querySelector(".ls-play")!.getAttribute("aria-label")).toBe("تشغيل");
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
});

describe("narration audio", () => {
  const proto = HTMLMediaElement.prototype;
  const saved = { play: proto.play, pause: proto.pause };
  afterEach(() => {
    proto.play = saved.play;
    proto.pause = saved.pause;
  });

  function withAudio(onEvent: (type: string) => void): Player {
    const pkg = load("prompt-injection");
    pkg.manifest.languages[0]!.audio = "audio/en.opus";
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
