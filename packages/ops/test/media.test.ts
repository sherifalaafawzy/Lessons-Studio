import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { Manifest, ScenesFile, TimingFile } from "@lessonstudio/spec";
import { applyOps, currentTimings, mediaObject, mediaResolver, toPackage, type Lesson } from "../src/index.ts";

// A narrated Darsi lesson (English and Egyptian Arabic), as scripts/darsi/push.ts sends it to the studio.
const DIR = fileURLToPath(new URL("../../../content/darsi/lessons/cy-1-1-2/", import.meta.url));
const read = <T>(p: string): T => JSON.parse(readFileSync(DIR + p, "utf8")) as T;
const lesson = (): Lesson => ({ manifest: read<Manifest>("manifest.json"), scenes: read<ScenesFile>("scenes.json") });
const measured = (): Record<string, TimingFile> => ({ en: read<TimingFile>("timing/en.json"), "ar-EG": read<TimingFile>("timing/ar-EG.json") });
const BUCKET = "https://firebasestorage.googleapis.com/v0/b/b.example/o/";

describe("lesson media", () => {
  it("names a file by its content, with its extension", () => {
    const a = lesson().manifest.assets!.find((x) => x.path === "audio/en.opus")!;
    expect(mediaObject(a)).toBe(`media/${a.sha256}.opus`);
    expect(() => mediaObject({ path: "audio/en.opus", sha256: "../secret" })).toThrow();
  });

  it("resolves the narration to its object in the bucket, and anything else to the fallback", () => {
    const m = lesson().manifest;
    const r = mediaResolver(m, BUCKET, (p) => `fallback:${p}`);
    const sha = m.assets!.find((x) => x.path === "audio/ar-EG.m4a")!.sha256;
    expect(r("audio/ar-EG.m4a")).toBe(`${BUCKET}media%2F${sha}.m4a?alt=media`);
    expect(r("images/x.webp")).toBe("fallback:images/x.webp");
  });

  it("keeps measured timings while they fit the script", () => {
    const l = lesson();
    expect(Object.keys(currentTimings(l.scenes.scenes, measured())).sort()).toEqual(["ar-EG", "en"]);
    const pkg = toPackage(l, currentTimings(l.scenes.scenes, measured()));
    expect(pkg.manifest.languages.map((g) => [g.code, g.audio, pkg.timing[g.code]!.source])).toEqual([
      ["en", "audio/en.opus", "aligned"], ["ar-EG", "audio/ar-EG.opus", "aligned"],
    ]);
  });

  it("drops a language's measured timings, and so its audio, once its narration changes", () => {
    const l = lesson();
    const first = l.scenes.scenes[0]!.id;
    const edited = applyOps(l, [{ op: "setNarration", scene: first, lang: "en", text: "Something else entirely." }]).lesson;
    const now = currentTimings(edited.scenes.scenes, measured());
    expect(Object.keys(now)).toEqual(["ar-EG"]);
    const pkg = toPackage(edited, now);
    const en = pkg.manifest.languages.find((g) => g.code === "en")!;
    expect(pkg.timing.en!.source).toBe("estimated");
    expect(en.audio).toBeUndefined();
    expect(en.audioFallback).toBeUndefined();
    expect(pkg.manifest.languages.find((g) => g.code === "ar-EG")!.audio).toBe("audio/ar-EG.opus");
    // The stored lesson keeps its audio: voicing it again brings it back.
    expect(edited.manifest.languages.find((g) => g.code === "en")!.audio).toBe("audio/en.opus");
  });

  it("drops every language's measured timings when the scenes change", () => {
    const l = lesson();
    const s = l.scenes.scenes[1]!.id;
    const moved = applyOps(l, [{ op: "moveScene", scene: s, to: 0 }]).lesson;
    expect(currentTimings(moved.scenes.scenes, measured())).toEqual({});
    expect(toPackage(moved).manifest.languages.every((g) => g.audio === undefined)).toBe(true);
  });
});
