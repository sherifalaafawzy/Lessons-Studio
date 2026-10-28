// Voice clips with ffmpeg (scripts/lib/voice.ts) and timing a recording (packages/narrate record.ts).
import { describe, expect, it } from "vitest";
import { splitWords } from "@lessonstudio/spec";
import { speechRuns, timeRecording, toWav, type Pcm } from "../../packages/narrate/src/index.ts";
import { RATE, clipFromRecording, decode, makeClip, trackPcm } from "../lib/voice.ts";

/** Speech stand-in: a 220 Hz tone with a syllable rhythm, between pauses. `plan` is [seconds, speaking?] pairs. */
function fake(plan: [number, boolean][], rate = RATE): Pcm {
  const total = plan.reduce((n, [s]) => n + s, 0);
  const samples = new Int16Array(Math.round(total * rate));
  let i = 0;
  for (const [secs, on] of plan) {
    const n = Math.round(secs * rate);
    for (let k = 0; k < n; k++, i++) {
      const env = 0.6 + 0.4 * Math.sin((2 * Math.PI * 4 * k) / rate);
      samples[i] = on ? Math.round(9000 * env * Math.sin((2 * Math.PI * 220 * k) / rate)) : Math.round((Math.random() - 0.5) * 60);
    }
  }
  return { rate, samples };
}

describe("timing a recording", () => {
  it("finds the speech, and puts each sentence between the longest pauses", () => {
    const p = fake([[0.4, false], [1.5, true], [0.1, false], [0.8, true], [0.7, false], [2, true], [0.5, false]]);
    expect(speechRuns(p).length).toBe(2);
    const text = "First sentence is here. Second one is a bit longer than that.";
    const t = timeRecording(p, text)!;
    expect(t.sentences.map((s) => [s.start, s.end])).toEqual([[0.4, 2.8], [3.5, 5.5]]);
    expect(t.words.map((w) => w.w)).toEqual(splitWords(text));
    expect(t.words[0]!.s).toBe(0.4);
    expect(t.words[t.words.length - 1]!.e).toBe(5.5);
    expect(timeRecording(fake([[2, false]]), text)).toBeNull();
  });
});

describe("voice clips with ffmpeg", () => {
  it("cleans, times and encodes a recording, and puts a track together to the sample", async () => {
    const take = fake([[1.2, false], [1.5, true], [0.6, false], [1.4, true], [1.5, false]], 48000);
    const text = "Hello there. Welcome back.";
    const { clip, file } = await clipFromRecording(Buffer.from(toWav(take)), text, "recorded", "u1");
    expect(file.subarray(0, 4).toString("latin1")).toBe("OggS");
    expect(clip.media).toMatch(/^[0-9a-f]{64}$/);
    // Silence cut from the ends, then 0.3 s before and 0.6 s after: about 3.5 + 0.9 seconds.
    expect(clip.seconds).toBeGreaterThan(4);
    expect(clip.seconds).toBeLessThan(4.8);
    expect(clip.text).toBe("Hello there. Welcome back.");
    expect(clip.sentences).toHaveLength(2);
    expect(clip.words.every((w) => w.s >= 0.25 && w.e <= clip.seconds)).toBe(true);
    expect(Buffer.from(clip.peaks, "base64").length).toBe(Math.ceil(clip.seconds * 40));
    // Decoded again, it is the same length to within a few milliseconds.
    const back = await decode(file);
    expect(Math.abs(back.samples.length / RATE - clip.seconds)).toBeLessThan(0.03);

    const track = await trackPcm([
      { scene: "a", start: 0, seconds: clip.seconds, clip, stale: false },
      { scene: "b", start: clip.seconds, seconds: 2, clip: null, stale: false },
      { scene: "c", start: clip.seconds + 2, seconds: clip.seconds, clip, stale: false },
    ], async () => file);
    expect(track.samples.length).toBe(Math.round((clip.seconds * 2 + 2) * RATE));
    const quiet = track.samples.subarray(Math.round((clip.seconds + 0.2) * RATE), Math.round((clip.seconds + 1.8) * RATE));
    expect(Math.max(...quiet.map(Math.abs))).toBe(0);

    await expect(clipFromRecording(Buffer.from(toWav(fake([[3, false]]))), text, "uploaded", "u1")).rejects.toThrow("No speech");
    await expect(clipFromRecording(Buffer.from("not audio"), text, "uploaded", "u1")).rejects.toThrow("couldn't be read");
    expect((await makeClip(take, { text, words: [], sentences: [], timing: "tts", kind: "ai", voice: "Kore", by: "s" })).clip.voice).toBe("Kore");
  }, 30_000);
});
