// @vitest-environment jsdom
// The shared library in the player: "@lib/" paths resolve against it, and its icons load once and draw.
import { describe, expect, it } from "vitest";
import type { LessonPackage } from "@lessonstudio/spec";
import { createPlayer, resolvePath } from "../src/index.ts";

const pkg = (): LessonPackage => ({
  manifest: {
    spec: "lesson-package", version: "0.2", id: "lib", rev: 1, title: "Library", defaultLang: "en",
    languages: [{ code: "en", dir: "ltr", name: "English", duration: 3, timing: "timing/en.json" }],
    provenance: { createdAt: "2026-10-27", createdBy: "t", tool: "test" },
    ai: { script: "human", translation: "none", narration: "none", visuals: "human", avatar: "none" },
  },
  scenes: { version: "0.2", scenes: [{ id: "s", template: "canvas", narration: { en: "Hello there." }, content: { elements: [
    { id: "who", type: "image", src: "@lib/v1/cast/salma_talking.svg", x: 0, y: 0, w: 200, h: 200 },
    { id: "money", type: "icon", icon: "banknote", x: 300, y: 0, w: 80, h: 80 },
  ] } }] },
  timing: { en: { version: "0.1", lang: "en", source: "manual", duration: 3, scenes: [{ id: "s", start: 0, end: 3, sentences: [], words: [{ w: "Hello", s: 0.3, e: 0.7 }, { w: "there.", s: 0.8, e: 1.2 }] }] } },
});

describe("the shared library", () => {
  it("resolves @lib/ paths against the library, other paths against the package", () => {
    const p = { ...pkg(), base: "https://cdn.example/lessons/lib/", library: "https://lib.example/lib/" };
    expect(resolvePath(p, "@lib/v1/cast/salma_talking.svg")).toBe("https://lib.example/lib/v1/cast/salma_talking.svg");
    expect(resolvePath(p, "audio/en.opus")).toBe("https://cdn.example/lessons/lib/audio/en.opus");
    expect(resolvePath(pkg(), "@lib/v1/icons.json")).toBe("https://lessons-studio-6b509.web.app/lib/v1/icons.json");
  });

  it("fetches the library's icons once and draws them; the cast is an image from the library", async () => {
    const asked: string[] = [];
    const fetch = (async (url: string) => {
      asked.push(url);
      return new Response(JSON.stringify({ banknote: ["M2 6h20v12H2z", "M12 10a2 2 0 1 0 0 4"] }), { status: 200 });
    }) as unknown as typeof globalThis.fetch;
    const host = document.createElement("div");
    document.body.append(host);
    const p = createPlayer(host, pkg(), { tier: "full", library: "https://lib.example/lib/", fetch, now: () => 0 });
    await p.ready;
    expect(asked).toEqual(["https://lib.example/lib/v1/icons.json"]);
    const root = host.shadowRoot!;
    const icon = root.querySelector('[data-el="money"] svg');
    expect(icon?.getAttribute("data-icon")).toBe("banknote");
    expect(icon?.querySelectorAll("path").length).toBe(2);
    expect(root.querySelector<HTMLImageElement>('[data-el="who"] img')?.src).toBe("https://lib.example/lib/v1/cast/salma_talking.svg");
    p.destroy();
  });
});

describe("package files with their own addresses", () => {
  it("asks resolve() for every package path, and still serves @lib from the library", async () => {
    const { resolvePath } = await import("../src/load.ts");
    const files: Record<string, string> = { "audio/en.opus": "https://storage.example/o/lessons%2Fa%2Faudio%2Fen.opus?alt=media" };
    const pkg = { manifest: {}, scenes: { scenes: [] }, timing: {}, library: "https://lib.example/lib/", resolve: (p: string) => files[p] ?? `missing:${p}` } as never;
    expect(resolvePath(pkg, "audio/en.opus")).toBe(files["audio/en.opus"]);
    expect(resolvePath(pkg, "@lib/v1/icons.json")).toBe("https://lib.example/lib/v1/icons.json");
    expect(() => resolvePath(pkg, "https://evil.example/x")).toThrow(/Bad package path/);
  });
});
