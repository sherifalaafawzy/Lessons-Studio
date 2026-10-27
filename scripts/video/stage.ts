// A lesson on a headless stage: the real player in Chromium, moved to any moment with seek(t). The MP4 exporter, the
// contact sheets and the studio's "Export MP4" (a Cloud Function) draw their frames here, so a video looks exactly
// like the lesson in the player.
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import type { Browser, Page } from "playwright-core";
import type { LessonPackage, Orient } from "../../packages/spec/src/index.ts";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const LIB_DIR = join(ROOT, "apps", "studio", "public", "lib");
/** A made-up origin served from disk (page.route), so the page and the shared library are one origin with no server. */
const ORIGIN = "http://stage.localhost";
const TYPES: Record<string, string> = {
  ".svg": "image/svg+xml", ".json": "application/json", ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".woff2": "font/woff2",
};

/** The player as a global `LS.createPlayer`, built from source on first use (the Cloud Function passes it prebuilt). */
let player: Promise<string> | null = null;
const playerScript = (): Promise<string> => (player ??= import("esbuild").then(({ build }) => build({
  stdin: { contents: 'export { createPlayer } from "@lessonstudio/player";', resolveDir: ROOT, loader: "ts" },
  bundle: true, minify: true, format: "iife", globalName: "LS", target: "es2020", write: false, logLevel: "silent",
})).then((r) => r.outputFiles[0]!.text));

/** Chromium: CHROMIUM_PATH or Playwright's own here; on a server, the executable and flags it needs. */
export async function launch(o: { executablePath?: string; args?: string[] } = {}): Promise<Browser> {
  const { chromium } = await import("playwright-core");
  const executablePath = o.executablePath ?? process.env.CHROMIUM_PATH;
  return chromium.launch({ ...(executablePath ? { executablePath } : {}), args: [...(o.args ?? []), "--font-render-hinting=none", "--disable-lcd-text"] });
}

/** Noto Sans and Noto Sans Arabic as web fonts (from @fontsource-variable), for a machine without fonts: a server. */
export const FONT_FILES = ["noto-sans-latin-wght-normal.woff2", "noto-sans-latin-ext-wght-normal.woff2", "noto-sans-arabic-arabic-wght-normal.woff2"];
const FONTS = [
  ["Noto Sans", FONT_FILES[0], "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD"],
  ["Noto Sans", FONT_FILES[1], "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF"],
  ["Noto Sans Arabic", FONT_FILES[2], "U+0600-06FF,U+0750-077F,U+0870-088E,U+0890-0891,U+0897-08E1,U+08E3-08FF,U+200C-200E,U+2010-2011,U+204F,U+2E41,U+FB50-FDFF,U+FE70-FE74,U+FE76-FEFC"],
].map(([family, file, range]) => `@font-face{font-family:"${family}";font-weight:100 900;src:url(/fonts/${file}) format("woff2");unicode-range:${range}}`).join("");

export interface StageOptions {
  lang: string;
  /** Picture width in pixels; the height follows the lesson's shape. */
  width: number;
  orient?: Orient;
  captions?: boolean;
  /** Where the package's own relative files live on disk (images, audio), if it has any. */
  dir?: string;
  /** The player script, prebuilt (default: built from the repository's source). */
  player?: string;
  /** The shared library's folder (default: apps/studio/public/lib). */
  libDir?: string;
  /** A folder with FONT_FILES: the page loads them and the player's text uses them first. */
  fontDir?: string;
}

export interface Stage {
  readonly page: Page;
  readonly width: number;
  readonly height: number;
  readonly duration: number;
  /** Moves to a moment and waits until it is drawn (pictures included). */
  seek(t: number): Promise<void>;
  /** What is on the stage now, as a short key: the same key means the same picture. */
  key(): Promise<string>;
  shot(type?: "jpeg" | "png", quality?: number): Promise<Buffer>;
  close(): Promise<void>;
}

export async function openStage(browser: Browser, pkg: LessonPackage, o: StageOptions): Promise<Stage> {
  const orient = o.orient ?? pkg.manifest.stage ?? "landscape";
  const ratio = orient === "portrait" ? 16 / 9 : orient === "square" ? 1 : 9 / 16;
  const width = o.width;
  const height = Math.round(width * ratio);
  const page = await browser.newPage({ viewport: { width, height: height + 400 }, deviceScaleFactor: 1 });
  const js = (o.player ?? (await playerScript())).replace(/<\/script/gi, "<\\/script");
  const libDir = o.libDir ?? LIB_DIR;
  await page.route(`${ORIGIN}/**`, async (route) => {
    const path = decodeURIComponent(new URL(route.request().url()).pathname);
    if (path === "/") {
      return route.fulfill({
        contentType: "text/html",
        body: `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#fff}#p{width:${width}px}${o.fontDir ? FONTS : ""}</style></head>` +
          `<body><div id="p"></div><script>${js}</script></body></html>`,
      });
    }
    const [prefix, base] = path.startsWith("/lib/") ? ["/lib/", libDir] : path.startsWith("/fonts/") ? ["/fonts/", o.fontDir] : ["/files/", o.dir];
    const file = base ? normalize(join(base, path.slice(prefix.length))) : "";
    if (!base || !path.startsWith(prefix) || !file.startsWith(normalize(base))) return route.fulfill({ status: 404 });
    try {
      return route.fulfill({ body: await readFile(file), contentType: TYPES[extname(file)] ?? "application/octet-stream" });
    } catch {
      return route.fulfill({ status: 404 });
    }
  });
  await page.goto(`${ORIGIN}/`);
  await page.evaluate(async ({ pkg, lang, orient, captions, origin, fonts }) => {
    const host = document.getElementById("p")!;
    const g = globalThis as unknown as { LS: { createPlayer: (h: HTMLElement, p: unknown, o: unknown) => { seek(t: number): void; ready: Promise<void> } }; __p: unknown };
    const p = g.LS.createPlayer(host, { ...pkg, base: `${origin}/files/` }, { lang, tier: "full", orient, captions, library: `${origin}/lib/` });
    const style = document.createElement("style");
    // Only the picture: no controls, no big play button, nothing floating over it. With fonts given, they come first.
    style.textContent = ".ls-bar,.ls-bigplay,.ls-menu,.ls-tip{display:none!important}.ls-viewport{border-radius:0!important}" +
      (fonts ? '.ls-player{--ls-font:"Noto Sans","Noto Sans Arabic",sans-serif}' : "");
    host.shadowRoot!.append(style);
    g.__p = p;
    await p.ready;
    if (fonts) await document.fonts.ready;
  }, { pkg, lang: o.lang, orient, captions: o.captions ?? false, origin: ORIGIN, fonts: !!o.fontDir });
  const viewport = page.locator("#p .ls-viewport");
  const box = await viewport.boundingBox();
  if (!box) throw new Error("The player drew no picture");
  const clip = { x: Math.round(box.x), y: Math.round(box.y), width, height };

  return {
    page, width, height,
    duration: pkg.timing[o.lang]!.duration,
    async seek(t) {
      await page.evaluate((t) => new Promise<void>((ok) => {
        (globalThis as unknown as { __p: { seek(t: number): void } }).__p.seek(t);
        const imgs = [...document.getElementById("p")!.shadowRoot!.querySelectorAll("img")];
        // Fonts used for the first time on this frame load before the shot.
        Promise.all([...imgs.map((i) => (i.complete ? null : i.decode().catch(() => {}))), document.fonts.ready]).then(() => requestAnimationFrame(() => ok()));
      }), t);
    },
    key: () => page.evaluate(() => {
      const s = document.getElementById("p")!.shadowRoot!.querySelector(".ls-viewport")!.innerHTML;
      let h = 0;
      for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
      return `${s.length}:${h}`;
    }),
    shot: (type = "jpeg", quality = 90) => page.screenshot({ clip, type, ...(type === "jpeg" ? { quality } : {}) }),
    close: () => page.close(),
  };
}
