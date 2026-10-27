import type { Browser } from "playwright-core";
import type { LessonPackage, Orient } from "@lessonstudio/spec";
import { inlineScript, playerScript } from "./bundle.ts";

let browser: Promise<Browser> | null = null;

function launch(executablePath: string | undefined): Promise<Browser> {
  if (!browser) {
    browser = import("playwright-core").then(({ chromium }) =>
      chromium.launch({ ...(executablePath ? { executablePath } : {}), args: ["--font-render-hinting=none"] }),
    );
    browser.catch(() => { browser = null; });
  }
  return browser;
}

export interface FrameOptions {
  lang: string;
  /** Seconds from the start of the lesson. */
  t: number;
  orient: Orient;
  /** Width of the picture in pixels (default 960). */
  width?: number;
  captions?: boolean;
}

/**
 * A PNG of the lesson at one moment, drawn by the real player in headless Chromium with renderAt(t).
 * The same call always gives the same picture: this is also how MP4 export will draw frames.
 */
export async function renderFrame(pkg: LessonPackage, o: FrameOptions, executablePath?: string): Promise<Buffer> {
  const b = await launch(executablePath);
  const page = await b.newPage({ viewport: { width: o.width ?? 960, height: 1200 }, deviceScaleFactor: 1 });
  try {
    const js = await playerScript();
    await page.setContent(
      `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#fff}#p{width:${o.width ?? 960}px}</style></head>` +
        `<body><div id="p"></div><script>${inlineScript(js)}</script></body></html>`,
    );
    await page.evaluate(({ pkg, o }) => {
      const host = document.getElementById("p")!;
      const g = globalThis as unknown as { LS: { createPlayer: (h: HTMLElement, p: unknown, opts: unknown) => { seek(t: number): void } } };
      const player = g.LS.createPlayer(host, pkg, { lang: o.lang, tier: "full", orient: o.orient, captions: o.captions ?? true });
      const style = document.createElement("style");
      style.textContent = ".ls-bigplay{display:none!important}";
      host.shadowRoot!.append(style);
      // seek, not renderAt: the clock moves too, so a later redraw (after a resize) draws the same moment.
      player.seek(o.t);
    }, { pkg, o });
    await page.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))));
    // Let pictures inside the scene finish loading before the shot.
    await page.waitForFunction(() => [...(document.getElementById("p")!.shadowRoot?.querySelectorAll("img") ?? [])].every((i) => i.complete), null, { timeout: 5000 }).catch(() => {});
    return await page.locator("#p .ls-viewport").screenshot({ type: "png" });
  } finally {
    await page.close();
  }
}

export async function closeRenderer(): Promise<void> {
  if (browser) await (await browser).close().catch(() => {});
  browser = null;
}
