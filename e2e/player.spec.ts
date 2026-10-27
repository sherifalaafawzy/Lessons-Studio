import { expect, test, type Page } from "@playwright/test";
import { existsSync, readdirSync, readFileSync } from "node:fs";

/** The playground puts the player on window.player once a lesson is ready. */
async function open(page: Page, query: string): Promise<void> {
  await page.goto(`/?${query}`);
  await page.waitForFunction(() => "player" in window);
}
const call = <T>(page: Page, fn: string, ...args: unknown[]): Promise<T> =>
  page.evaluate(([f, a]) => (window as any).player[f as string](...(a as unknown[])), [fn, args] as const) as Promise<T>;
const timeOf = (page: Page): Promise<number> => page.evaluate(() => (window as any).player.time());
const scenes = async (page: Page, lesson: string, lang: string) =>
  (await (await page.request.get(`/examples/${lesson}/timing/${lang}.json`)).json()).scenes as { id: string; start: number; end: number }[];

for (const lesson of ["prompt-injection", "phishing-message"]) {
  for (const lang of ["en", "ar"]) {
    test(`${lesson} plays and seeks in ${lang}`, async ({ page }, info) => {
      await open(page, `lesson=${lesson}&lang=${lang}`);
      const wrap = page.locator("#player .ls-player");
      await expect(wrap).toHaveAttribute("dir", lang === "ar" ? "rtl" : "ltr");
      await expect(page.locator("#report")).toHaveText(/0 errors, 0 warnings/);

      await page.locator("#player .ls-bigplay").click();
      await page.waitForTimeout(1500);
      expect(await timeOf(page)).toBeGreaterThan(0.8);
      await call(page, "pause");

      // Seek with the slider, as a learner would, into the second scene.
      const s = await scenes(page, lesson, lang);
      const target = (s[1]!.start + s[1]!.end) / 2;
      await page.locator("#player .ls-seek").evaluate((el: HTMLInputElement, v) => {
        el.value = String(v);
        el.dispatchEvent(new Event("input", { bubbles: true }));
      }, target);
      expect(Math.abs((await timeOf(page)) - target)).toBeLessThan(0.2);
      await expect(page.locator("#log")).toContainText(`scene ${s[1]!.id}`);
      await page.locator("#player .ls-bigplay").evaluate((b: HTMLElement) => (b.hidden = true));
      await page.locator("#player").screenshot({ path: `e2e/screenshots/${lesson}-${lang}-${info.project.name}.png` });
    });
  }
}

test("a flow diagram mirrors in Arabic", async ({ page }) => {
  const pos = async (lang: string) => {
    await open(page, `lesson=prompt-injection&lang=${lang}&orient=landscape&tier=lite`);
    const s = (await scenes(page, "prompt-injection", lang)).find((x) => x.id === "how")!;
    await call(page, "seek", s.end - 0.2);
    const stage = (await page.locator("#player .ls-stage").boundingBox())!;
    const you = (await page.locator("#player .ls-node").first().boundingBox())!;
    return { x: you.x - stage.x, w: you.width, stageW: stage.width };
  };
  const en = await pos("en");
  const ar = await pos("ar");
  expect(Math.abs(ar.x - (en.stageW - en.x - en.w))).toBeLessThan(3);
});

test("the quick check pauses the lesson and continues after an answer", async ({ page }) => {
  await open(page, "lesson=phishing-message&lang=ar");
  const s = (await scenes(page, "phishing-message", "ar")).find((x) => x.id === "turn")!;
  await call(page, "seek", s.end - 0.6);
  await call(page, "play");
  const card = page.locator("#player .ls-check .ls-card");
  await expect(card).toBeVisible();
  expect(await page.evaluate(() => (window as any).player.playing)).toBe(false);
  await page.locator("#player .ls-opt").first().click();
  await expect(page.locator("#player .ls-fb")).toHaveText("إجابة صحيحة");
  await page.locator("#player .ls-check .ls-go").click();
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => (window as any).player.playing)).toBe(true);
  expect(await timeOf(page)).toBeGreaterThan(s.end);
});

for (const [lesson, sceneId] of [["prompt-injection", "how"], ["how-ai-learns", "network"]] as const) test(`playback stays smooth with the CPU slowed 4× (${lesson})`, async ({ page }, info) => {
  await open(page, `lesson=${lesson}&lang=en`);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await page.evaluate(() => {
    const w = window as any;
    w.__long = [] as number[];
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) w.__long.push(Math.round(e.duration));
      }).observe({ type: "long-animation-frame", buffered: false });
    } catch {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) w.__long.push(Math.round(e.duration));
      }).observe({ type: "longtask", buffered: false });
    }
  });
  // First prove the observer sees a slow frame, so an empty list below means something.
  const caught = await page.evaluate(async () => {
    const w = window as any;
    const before = w.__long.length;
    await new Promise<void>((r) => requestAnimationFrame(() => { const t = performance.now(); while (performance.now() - t < 120) {} r(); }));
    await new Promise((r) => setTimeout(r, 300));
    const seen = w.__long.slice(before).some((d: number) => d > 100);
    w.__long.length = 0;
    return seen;
  });
  expect(caught).toBe(true);
  // Start in the busiest scene: moving packets and drawing arrows, or a canvas with lines being drawn and a moving signal.
  const s = (await scenes(page, lesson, "en")).find((x) => x.id === sceneId)!;
  await call(page, "seek", s.start);
  await call(page, "play");
  await page.waitForTimeout(8000);
  const long: number[] = await page.evaluate(() => (window as any).__long.filter((d: number) => d > 50));
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  info.annotations.push({ type: "long frames over 50 ms", description: JSON.stringify(long) });
  expect(long).toEqual([]);
});

/** The example languages that have narration (`npm run narrate`). */
const narrated = readdirSync("examples").flatMap((id) => {
  const path = `examples/${id}/manifest.json`;
  if (!existsSync(path)) return [];
  const m = JSON.parse(readFileSync(path, "utf8")) as { languages: { code: string; audio?: string }[] };
  return m.languages.filter((l) => l.audio).map((l) => ({ id, lang: l.code, audio: l.audio! }));
});

test.describe("narration", () => {
  test.skip(!narrated.length, "No example has narration yet: run `npm run narrate`.");

  for (const n of narrated) {
    test(`${n.id} ${n.lang}: the narration downloads on play and the lesson follows it`, async ({ page }) => {
      const asked: string[] = [];
      page.on("request", (r) => { if (r.url().includes("/audio/")) asked.push(r.url()); });
      await open(page, `lesson=${n.id}&lang=${n.lang}`);
      await page.waitForTimeout(500);
      expect(asked, "nothing streams before the learner presses play").toEqual([]);
      await page.locator("#player .ls-bigplay").click();
      await expect.poll(() => timeOf(page), { timeout: 10_000 }).toBeGreaterThan(1.5);
      expect(asked.some((u) => u.endsWith(n.audio))).toBe(true);
      await expect(page.locator("#log")).not.toContainText("no audio");
      await expect(page.locator("#player .ls-cap .is-now")).toHaveCount(1);
      // Seeking while playing moves the narration too.
      await call(page, "seek", 20);
      await expect.poll(() => timeOf(page), { timeout: 5_000 }).toBeGreaterThan(20.4);
      expect(await timeOf(page)).toBeLessThan(23);
    });
  }

  test("when the narration can't load, the lesson goes on silently with captions", async ({ page }) => {
    const n = narrated[0]!;
    await page.route("**/audio/**", (r) => r.fulfill({ status: 404, body: "" }));
    await open(page, `lesson=${n.id}&lang=${n.lang}`);
    await page.locator("#player .ls-bigplay").click();
    await expect(page.locator("#log")).toContainText("no audio");
    await expect.poll(() => timeOf(page), { timeout: 10_000 }).toBeGreaterThan(1.5);
    expect(await page.evaluate(() => (window as any).player.playing)).toBe(true);
    await expect(page.locator("#player .ls-captions")).toBeVisible();
  });
});

test("a canvas lesson animates on the spoken word, in each language", async ({ page }) => {
  for (const [lang, word] of [["en", "passes"], ["ar", "تمر"]] as const) {
    await open(page, `lesson=how-ai-learns&lang=${lang}&tier=full&orient=landscape`);
    const t = (await (await page.request.get(`/examples/how-ai-learns/timing/${lang}.json`)).json()) as { scenes: { id: string; words: { w: string; s: number }[] }[] };
    const net = t.scenes.find((s) => s.id === "network")!;
    const at = net.words.find((w) => w.w.replace(/[.,،]/g, "").endsWith(word))!.s;
    const dot = page.locator('#player [data-el="signal"]');
    await call(page, "seek", at - 0.3);
    await expect(dot).toHaveCSS("opacity", "0");
    await call(page, "seek", at + 0.6);
    await expect(dot).toHaveCSS("opacity", "1");
    // Mirrored in Arabic: the inputs sit on the right of the stage.
    const stage = (await page.locator("#player .ls-stage").boundingBox())!;
    const input = (await page.locator('#player [data-el="in1"]').boundingBox())!;
    const right = input.x - stage.x > stage.width / 2;
    expect(right).toBe(lang === "ar");
  }
});
