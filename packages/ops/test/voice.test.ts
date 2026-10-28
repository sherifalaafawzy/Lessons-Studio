import { describe, expect, it } from "vitest";
import type { Scene } from "@lessonstudio/spec";
import { estimateTiming, splitWords, validatePackage } from "@lessonstudio/spec";
import { applyOps, clipFits, newLesson, toPackage, voiceTrack, type Lesson, type VoiceClip } from "../src/index.ts";

const lesson = (): Lesson => {
  const l = newLesson({ id: "voices", title: { en: "Voices", ar: "أصوات" }, languages: [{ code: "en", name: "English" }, { code: "ar", name: "العربية" }], createdBy: "t" }, "2026-10-28");
  l.scenes.scenes.push(
    { id: "a", template: "steps", narration: { en: "One. Two.", ar: "واحد. اثنان." }, content: { steps: ["One", "Two"] } },
    { id: "b", template: "steps", narration: { en: "Three words here.", ar: "ثلاث كلمات هنا." }, content: { steps: ["Three"] } },
  );
  return l;
};
/** A clip of a scene's narration, `seconds` long, its words spread over the middle. */
const clip = (scene: Scene, lang: string, seconds: number, media: string): VoiceClip => {
  const words = splitWords(scene.narration[lang]!);
  const step = (seconds - 1) / words.length;
  return {
    media, type: "audio/ogg", bytes: 100, seconds, text: words.join(" "),
    words: words.map((w, i) => ({ w, s: 0.5 + i * step, e: 0.5 + (i + 1) * step })),
    sentences: [{ text: scene.narration[lang]!, start: 0.5, end: seconds - 0.5 }],
    timing: "aligned", kind: "recorded", peaks: "", at: 1, by: "u",
  };
};

describe("voice track", () => {
  it("puts each scene's clip in the lesson's order, and keeps it there when scenes move", () => {
    const l = lesson();
    const [intro, a, b] = l.scenes.scenes as [Scene, Scene, Scene];
    const clips = { a: clip(a, "en", 4, "a".repeat(64)), b: clip(b, "en", 6, "b".repeat(64)) };
    const t1 = voiceTrack(l.scenes.scenes, "en", clips);
    const introSecs = estimateTiming([intro], "en").scenes[0]!.end;
    expect(t1.parts.map((p) => [p.scene, p.start, p.seconds, !!p.clip])).toEqual([["intro", 0, introSecs, false], ["a", introSecs, 4, true], ["b", introSecs + 4, 6, true]]);
    expect(t1.timing.source).toBe("aligned");
    expect(t1.timing.scenes[2]!.words[0]!.s).toBe(introSecs + 4 + 0.5);

    // Moving b first: both keep their voices, now in the new order.
    const moved = applyOps(l, [{ op: "moveScene", scene: "b", to: 0 }]).lesson;
    const t2 = voiceTrack(moved.scenes.scenes, "en", clips);
    expect(t2.parts.map((p) => [p.scene, p.start, !!p.clip])).toEqual([["b", 0, true], ["intro", 6, false], ["a", 6 + introSecs, true]]);
    expect(t2.key).not.toBe(t1.key);
    // The track validates as a package: the words are the script's words, the scenes in order.
    const pkg = toPackage(moved, { en: t2.timing });
    expect(validatePackage(pkg).errors).toEqual([]);
  });

  it("silences only the scene whose script changed, and says so", () => {
    const l = lesson();
    const clips = { a: clip(l.scenes.scenes[1]!, "en", 4, "a".repeat(64)) };
    const edited = applyOps(l, [{ op: "setNarration", scene: "a", lang: "en", text: "Something else." }]).lesson;
    const t = voiceTrack(edited.scenes.scenes, "en", clips);
    expect(t.parts[1]).toMatchObject({ scene: "a", clip: null, stale: true });
    expect(t.voiced).toBe(false);
    expect(t.timing.source).toBe("estimated");
    expect(clipFits(edited.scenes.scenes[1]!, "en", clips.a)).toBe(false);
    expect(clipFits(l.scenes.scenes[1]!, "en", clips.a)).toBe(true);
  });

  it("keeps a copied scene silent until it is voiced, and names the sound by its clips", () => {
    const l = lesson();
    const clips = { a: clip(l.scenes.scenes[1]!, "en", 4, "a".repeat(64)) };
    const copied = applyOps(l, [{ op: "duplicateScene", scene: "a", id: "a2" }]).lesson;
    const t = voiceTrack(copied.scenes.scenes, "en", clips);
    expect(t.parts.find((p) => p.scene === "a2")).toMatchObject({ clip: null, stale: false });
    expect(voiceTrack(copied.scenes.scenes, "en", clips).key).toBe(t.key);
    expect(voiceTrack(copied.scenes.scenes, "ar", clips).voiced).toBe(false);
  });
});
