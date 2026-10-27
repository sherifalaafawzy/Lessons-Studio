import { describe, expect, it } from "vitest";
import { splitWords, validatePackage, toVtt, type LessonPackage, type NarrationVoice } from "@lessonstudio/spec";
import {
  alignWords, assemble, audioOf, batchBody, batchOutput, batchState, decodeAudio, GeminiError, lineKey, linesOf,
  parseJsonl, parseWav, seconds, similarity, speak, spreadWords, toWav, trimSilence, ttsCost, ttsRequest, voiceFor,
  type Clip, type Pcm,
} from "../src/index.ts";
import { loadExample } from "../../../scripts/lib/examples.mjs";

const VOICE: NarrationVoice = { provider: "gemini", model: "gemini-3.8-flash-lite-tts", name: "Charon", style: "Calm." };
const b64 = (b: Uint8Array): string => Buffer.from(b).toString("base64");

/** A tone of `sec` seconds at 24 kHz, with silence around it. */
function tone(sec: number, silence = 0.3, rate = 24000): Pcm {
  const pad = Math.round(silence * rate);
  const body = Math.round(sec * rate);
  const s = new Int16Array(pad * 2 + body);
  for (let i = 0; i < body; i++) s[pad + i] = Math.round(8000 * Math.sin((2 * Math.PI * 220 * i) / rate));
  return { rate, samples: s };
}

describe("audio", () => {
  it("round-trips WAV and reads Gemini's raw L16", () => {
    const p = tone(0.5);
    const back = parseWav(toWav(p));
    expect(back.rate).toBe(24000);
    expect(Array.from(back.samples)).toEqual(Array.from(p.samples));
    const raw = new Uint8Array(p.samples.buffer.slice(0));
    expect(decodeAudio(raw, "audio/L16;codec=pcm;rate=24000").samples.length).toBe(p.samples.length);
    expect(decodeAudio(toWav(p), "audio/wav").samples.length).toBe(p.samples.length);
    expect(() => decodeAudio(raw, "audio/mpeg")).toThrow(/Unsupported/);
  });

  it("trims the silence around speech, keeping a short pad", () => {
    const t = trimSilence(tone(1, 0.5));
    expect(seconds(t)).toBeGreaterThan(1);
    expect(seconds(t)).toBeLessThan(1.12);
    expect(trimSilence({ rate: 24000, samples: new Int16Array(2400) }).samples.length).toBe(0);
  });
});

describe("Gemini requests", () => {
  it("builds the TTS request with the voice and a style that is not read aloud", () => {
    const req = ttsRequest("Hello.", VOICE) as any;
    expect(req.contents[0].parts[0]).toEqual({ text: "Hello.", speechMetadata: { style: "Calm." } });
    expect(req.generationConfig).toEqual({ responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Charon" } } } });
    expect((ttsRequest("x", { provider: "gemini", name: "voice_abc" }) as any).generationConfig.speechConfig.voiceConfig).toEqual({ voice: "voice_abc" });
  });

  it("reads audio and token counts from a response, and says why when there is no audio", () => {
    const pcm = tone(0.2, 0);
    const res = { candidates: [{ content: { parts: [{ inlineData: { mimeType: "audio/wav", data: b64(toWav(pcm)) } }] } }], usageMetadata: { candidatesTokenCount: 5, promptTokenCount: 3 } };
    const a = audioOf(res);
    expect(a.pcm.samples.length).toBe(pcm.samples.length);
    expect([a.tokens, a.inputTokens]).toEqual([5, 3]);
    expect(() => audioOf({ candidates: [{ finishReason: "OTHER", content: { parts: [] } }] })).toThrow(/no audio \(OTHER\)/);
  });

  it("retries when rate-limited, waiting as long as the API asks, and never sends the key in the URL", async () => {
    const calls: { url: string; headers: any }[] = [];
    const waits: number[] = [];
    const ok = { candidates: [{ content: { parts: [{ inlineData: { mimeType: "audio/L16;rate=24000", data: b64(new Uint8Array(480)) } }] } }] };
    const replies = [
      new Response(JSON.stringify({ error: { code: 429, message: "slow down", details: [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "7s" }] } }), { status: 429 }),
      new Response(JSON.stringify(ok), { status: 200 }),
    ];
    const fetcher = (async (url: string, init: RequestInit) => {
      calls.push({ url, headers: init.headers });
      return replies.shift()!;
    }) as unknown as typeof fetch;
    const s = await speak({ key: "test-key", fetch: fetcher, sleep: async (ms) => { waits.push(ms); } }, "Hi.", VOICE);
    expect(s.pcm.samples.length).toBe(240);
    expect(waits).toEqual([7000]);
    expect(calls[0]!.url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash-lite-tts:generateContent");
    expect(calls[0]!.headers["x-goog-api-key"]).toBe("test-key");
    expect(calls.every((c) => !c.url.includes("test-key"))).toBe(true);
  });

  it("gives up on errors that a retry won't fix", async () => {
    const fetcher = (async () => new Response(JSON.stringify({ error: { message: "API key not valid" } }), { status: 400 })) as unknown as typeof fetch;
    await expect(speak({ key: "k", fetch: fetcher, sleep: async () => {} }, "Hi.", VOICE)).rejects.toBeInstanceOf(GeminiError);
  });

  it("builds a batch and reads every shape of its status and results", () => {
    const body = batchBody("narrate", [{ key: "a", request: { x: 1 } }]) as any;
    expect(body.batch.input_config.requests.requests).toEqual([{ request: { x: 1 }, metadata: { key: "a" } }]);
    expect(batchState({ metadata: { state: "BATCH_STATE_RUNNING" } })).toEqual({ state: "running", done: false });
    expect(batchState({ state: "JOB_STATE_SUCCEEDED" }).done).toBe(true);
    expect(batchState({ done: true, error: { message: "boom" } })).toEqual({ state: "failed", done: true, error: "boom" });
    const nested = batchOutput({ response: { inlinedResponses: { inlinedResponses: [{ metadata: { key: "a" }, response: { r: 1 } }, { metadata: { key: "b" }, error: { message: "no" } }] } } });
    expect(nested).toEqual({ items: [{ index: 0, key: "a", response: { r: 1 } }, { index: 1, key: "b", error: "no" }] });
    expect(batchOutput({ dest: { inlinedResponses: [{ response: { r: 2 } }] } })).toEqual({ items: [{ index: 0, response: { r: 2 } }] });
    expect(batchOutput({ response: { responsesFile: "files/abc" } })).toEqual({ file: "files/abc" });
    expect(parseJsonl('{"key":"a","response":{"r":1}}\n{"key":"b","error":{"message":"x"}}\n')).toEqual([
      { index: 0, key: "a", response: { r: 1 } },
      { index: 1, key: "b", error: "x" },
    ]);
  });

  it("prices a minute of narration as PLAN.md Appendix C says", () => {
    expect(ttsCost("gemini-3.8-flash-lite-tts", 60, 0, true)).toBeCloseTo(0.0045, 6);
    expect(ttsCost("gemini-3.8-flash-lite-tts", 60, 0, false)).toBeCloseTo(0.009, 6);
    expect(ttsCost("unknown", 60, 0, true)).toBeNull();
  });
});

describe("plan", () => {
  const { pkg } = loadExample("prompt-injection") as { pkg: LessonPackage };

  it("splits each scene into the sentences the timings use", () => {
    const lines = linesOf(pkg.scenes.scenes, "ar");
    expect(lines.length).toBe(pkg.scenes.scenes.length);
    expect(lines.flat().map((l) => l.text).join(" ")).toBe(pkg.scenes.scenes.map((s) => s.narration.ar!.replace(/\s+/g, " ").trim()).join(" "));
  });

  it("keys a sentence by its text, voice and settings", async () => {
    const a = await lineKey(VOICE, "en", "Hello.");
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(await lineKey(VOICE, "en", "Hello.")).toBe(a);
    expect(await lineKey({ ...VOICE, name: "Kore" }, "en", "Hello.")).not.toBe(a);
    expect(await lineKey({ ...VOICE, style: "Fast." }, "en", "Hello.")).not.toBe(a);
  });

  it("asks for Modern Standard Arabic in Arabic", () => {
    expect(voiceFor("ar", { name: "Sulafat" }, { provider: "gemini", name: "Charon", style: "Warm." })).toEqual({
      provider: "gemini", model: "gemini-3.8-flash-lite-tts", name: "Sulafat", style: "Modern Standard Arabic (fusha). Warm.",
    });
    expect(voiceFor("en", undefined, { provider: "gemini", name: "Charon" }).style).toBeUndefined();
  });
});

describe("word alignment", () => {
  const script = ["A", "prompt", "injection", "hides", "instructions."];

  it("takes each word's times from the aligner", () => {
    const heard = [
      { w: " A", s: 0.1, e: 0.2 }, { w: " prompt", s: 0.2, e: 0.6 }, { w: " injection", s: 0.6, e: 1.2 },
      { w: " hides", s: 1.3, e: 1.7 }, { w: " instructions.", s: 1.7, e: 2.5 },
    ];
    const a = alignWords(script, heard, 2.6);
    expect(a.matched).toBe(1);
    expect(a.words).toEqual([
      { w: "A", s: 0.1, e: 0.2 }, { w: "prompt", s: 0.2, e: 0.6 }, { w: "injection", s: 0.6, e: 1.2 },
      { w: "hides", s: 1.3, e: 1.7 }, { w: "instructions.", s: 1.7, e: 2.5 },
    ]);
  });

  it("copes with words split or joined differently, and with a word not heard", () => {
    const heard = [
      { w: "A", s: 0, e: 0.1 }, { w: "prom", s: 0.2, e: 0.4 }, { w: "pt", s: 0.4, e: 0.6 },
      { w: "injectionhides", s: 0.6, e: 1.6 },
    ];
    const a = alignWords(script, heard, 2.4);
    expect(a.words[1]).toEqual({ w: "prompt", s: 0.2, e: 0.6 });
    expect(a.words[2]!.s).toBe(0.6);
    expect(a.words[3]!.e).toBe(1.6);
    // "instructions." was never heard: it gets the time left after "hides".
    expect(a.words[4]).toEqual({ w: "instructions.", s: 1.6, e: 2.4 });
    expect(a.matched).toBeLessThan(1);
  });

  it("matches Arabic with and without diacritics", () => {
    const ar = ["حقن", "الأوامر", "يُخفي", "تعليمات."];
    const heard = [{ w: "حقن", s: 0, e: 0.3 }, { w: "الاوامر", s: 0.3, e: 0.8 }, { w: "يخفي", s: 0.9, e: 1.2 }, { w: "تعليمات", s: 1.2, e: 1.8 }];
    const a = alignWords(ar, heard, 2);
    expect(a.matched).toBe(1);
    expect(a.words.map((w) => [w.s, w.e])).toEqual([[0, 0.3], [0.3, 0.8], [0.9, 1.2], [1.2, 1.8]]);
  });

  it("keeps words in order and inside the clip, whatever it is given", () => {
    const heard = [{ w: "injection", s: 1.0, e: 0.9 }, { w: "prompt", s: 1.5, e: 3.5 }];
    const a = alignWords(script, heard, 2);
    for (let i = 0; i < a.words.length; i++) {
      const w = a.words[i]!;
      expect(w.e).toBeGreaterThanOrEqual(w.s);
      expect(w.e).toBeLessThanOrEqual(2);
      if (i) expect(w.s).toBeGreaterThanOrEqual(a.words[i - 1]!.s);
    }
    expect(alignWords(script, [], 2).words).toEqual(spreadWords(script, 0, 2));
  });

  it("says how close a transcript is to the script", () => {
    expect(similarity("A prompt injection hides instructions.", "a prompt injection hides instructions")).toBe(1);
    expect(similarity("A prompt injection hides instructions.", "a prompt hides")).toBeLessThan(0.7);
  });
});

describe("assembly", () => {
  it("places every sentence with its pauses and makes a timing file the validator accepts", () => {
    const { pkg } = loadExample("phishing-message") as { pkg: LessonPackage };
    const lang = "en";
    const scenes = linesOf(pkg.scenes.scenes, lang).map((lines, i) => ({
      id: pkg.scenes.scenes[i]!.id,
      clips: lines.map((l): Clip => {
        const words = splitWords(l.text);
        const pcm = tone(0.3 * words.length, 0);
        return { text: l.text, pcm, words: spreadWords(words, 0, seconds(pcm)) };
      }),
    }));
    const { timing, pcm } = assemble(scenes, lang, "aligned");
    expect(timing.duration).toBeCloseTo(seconds(pcm), 3);
    const first = timing.scenes[0]!;
    expect(first.start).toBe(0);
    expect(first.sentences[0]!.start).toBe(0.35);
    expect(first.sentences[1]!.start).toBeCloseTo(first.sentences[0]!.end + 0.45, 3);
    expect(timing.scenes[1]!.start).toBe(first.end);
    // The audio is where the timing says: silent in the lead, sound once the first sentence starts.
    const at = (t: number) => Math.abs(pcm.samples[Math.round(t * 24000) + 100]!);
    expect(at(0.1)).toBe(0);

    const narrated: LessonPackage = JSON.parse(JSON.stringify(pkg));
    narrated.timing[lang] = timing;
    const track = narrated.manifest.languages.find((l) => l.code === lang)!;
    track.duration = timing.duration;
    track.audio = "audio/en.opus";
    const r = validatePackage(narrated);
    expect(r.errors).toEqual([]);
    expect(toVtt(timing, "ltr")).toContain("WEBVTT");
  });
});
