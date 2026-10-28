// The functions' pure parts: sealed AI keys, draft requests, the draft pipeline with a stand-in model, and the
// narration an MP4 export reads from the bucket.
import { describe, expect, it } from "vitest";
import { GALLERY } from "../../apps/studio/src/presets.ts";
import { keyShapeProblem, seal, statusOf, unseal } from "../src/keys.ts";
import { checkKey, draftPrice, gemini, type Generate } from "../src/gemini.ts";
import { DraftFailed, draft, readRequest, systemPrompt, userPrompt } from "../src/draft.ts";
import { fetchNarration } from "../src/video.ts";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { toPackage } from "@lessonstudio/ops";

const SECRET = "x".repeat(40);

describe("AI keys", () => {
  it("seal and open again, only for the same person", () => {
    const s = seal(SECRET, "alice", "AIzaSyExampleKey1234567890");
    expect(JSON.stringify(s)).not.toContain("AIzaSy");
    expect(unseal(SECRET, "alice", s)).toBe("AIzaSyExampleKey1234567890");
    expect(() => unseal(SECRET, "bob", s)).toThrow();
    expect(() => unseal("y".repeat(40), "alice", s)).toThrow();
    expect(() => seal("short", "alice", "k")).toThrow("32");
  });

  it("status never carries the key", () => {
    const st = statusOf({ ...seal(SECRET, "a", "AIzaSyExampleKey1234567890"), last4: "7890", setAt: 5 } as never);
    expect(st).toEqual({ set: true, last4: "7890", setAt: 5 });
    expect(statusOf(undefined)).toEqual({ set: false });
  });

  it("checks the shape before asking Google", async () => {
    expect(keyShapeProblem("gemini", "AIzaSyExampleKey1234567890")).toBeNull();
    expect(keyShapeProblem("gemini", "not a key")).toContain("doesn't look like");
    expect(keyShapeProblem("openai", "AIzaSyExampleKey1234567890")).toContain("Unknown provider");
    const answer = (status: number) => (async () => new Response("{}", { status })) as unknown as typeof fetch;
    expect(await checkKey("k", answer(200))).toBe("ok");
    expect(await checkKey("k", answer(400))).toBe("rejected");
    expect(await checkKey("k", answer(503))).toBe("unreachable");
  });

  it("takes Vertex AI keys too, and asks Vertex AI about them", async () => {
    expect(keyShapeProblem("gemini", "AQ.Ab8RN6-example_key-1234567890abcdefgh")).toBeNull();
    const calls: { url: string; method?: string }[] = [];
    const fetcher = (async (url: string, init: RequestInit) => {
      calls.push({ url, method: init.method });
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "{}" }] } }] }), { status: 200 });
    }) as unknown as typeof fetch;
    expect(await checkKey("AQ.example", fetcher)).toBe("ok");
    await gemini("AQ.example", "gemini-3.8-flash", fetcher)("system", [{ role: "user", text: "hi" }]);
    expect(calls).toEqual([
      { url: "https://aiplatform.googleapis.com/v1/publishers/google/models/gemini-3.8-flash:countTokens", method: "POST" },
      { url: "https://aiplatform.googleapis.com/v1/publishers/google/models/gemini-3.8-flash:generateContent", method: "POST" },
    ]);
  });

  it("prices drafts by date", () => {
    expect(draftPrice(Date.UTC(2026, 9, 27))).toEqual({ input: 0.75, output: 3.75 });
    expect(draftPrice(Date.UTC(2027, 0, 2))).toEqual({ input: 1.5, output: 7.5 });
  });
});

describe("draft requests", () => {
  it("accepts a clean brief and refuses a bad one", () => {
    const ok = readRequest({ topic: "Spotting phishing", languages: [{ code: "en", name: "English" }, { code: "ar", name: "العربية" }], seconds: 90 });
    expect(ok).toMatchObject({ topic: "Spotting phishing", seconds: 90, stage: "landscape" });
    expect(readRequest({ topic: "x", languages: [{ code: "en" }], seconds: 90 })).toContain("topic");
    expect(readRequest({ topic: "Phishing", languages: [], seconds: 90 })).toContain("languages");
    expect(readRequest({ topic: "Phishing", languages: [{ code: "EN!" }], seconds: 90 })).toContain("code");
    expect(readRequest({ topic: "Phishing", languages: [{ code: "en" }], seconds: 900 })).toContain("seconds");
  });

  it("tells the model the format, the rules and the brief", () => {
    const s = systemPrompt("THE GUIDE", "portrait");
    expect(s).toContain("THE GUIDE");
    expect(s).toContain("720×1280");
    expect(s).toContain('"template":"canvas"');
    const u = userPrompt({ topic: "Phishing", languages: [{ code: "en", name: "English" }], seconds: 60 });
    expect(u).toContain("about 144 narrated words");
  });
});

const BRIEF = { topic: "Spot a scam message", languages: [{ code: "en", name: "English" }, { code: "ar", name: "العربية" }], seconds: 90, stage: "landscape" as const };
const scenes = (ids: string[]) => ids.map((id, i) => GALLERY.find((g) => g.id === id)!.make({ id: `s${i + 1}`, langs: ["en", "ar"], stage: "landscape" }));
const good = JSON.stringify({ title: { en: "Spot a scam", ar: "اكتشف الاحتيال" }, summary: { en: "Signs of a scam", ar: "علامات الاحتيال" }, scenes: scenes(["title", "sms", "quiz", "summary"]) });

/** A model that answers from a list, and records what it was asked. */
function model(answers: string[]): Generate & { asked: string[][] } {
  const asked: string[][] = [];
  const f = (async (_system: string, turns: { text: string }[]) => {
    asked.push(turns.map((t) => t.text));
    return { text: answers[Math.min(asked.length - 1, answers.length - 1)]!, usage: { input: 1000, output: 500 } };
  }) as Generate & { asked: string[][] };
  f.asked = asked;
  return f;
}
const opts = (generate: Generate) => ({ generate, guide: "guide", uid: "alice", id: "spot-a-scam-abcd", model: "gemini-test" });

describe("drafting", () => {
  it("a clean draft becomes the person's lesson, with honest AI disclosure", async () => {
    const m = model([good]);
    const out = await draft(BRIEF, opts(m));
    expect(out.attempts).toBe(1);
    expect(out.lesson.manifest.id).toBe("spot-a-scam-abcd");
    expect(out.lesson.manifest.provenance.createdBy).toBe("alice");
    expect(out.lesson.manifest.ai).toMatchObject({ script: "ai", translation: "ai" });
    expect(out.lesson.scenes.scenes.map((s) => s.template)).toEqual(["title-hook", "message-mock", "quiz", "summary"]);
    expect(out.usage).toEqual({ input: 1000, output: 500 });
  });

  it("problems go back to the model, which fixes them", async () => {
    const broken = JSON.parse(good);
    broken.scenes[1].cues[0].word.ar = "كلمة-غير-منطوقة";
    delete broken.scenes[2].narration.ar;
    const m = model([JSON.stringify(broken), "not json at all", good]);
    const out = await draft(BRIEF, opts(m));
    expect(out.attempts).toBe(3);
    expect(m.asked[1]!.at(-1)).toContain("cueWordMissing");
    expect(m.asked[1]!.at(-1)).toContain("missingNarration");
    expect(m.asked[2]!.at(-1)).toContain("not valid JSON");
    expect(out.usage).toEqual({ input: 3000, output: 1500 });
  });

  it("a draft that never validates is refused", async () => {
    const broken = JSON.parse(good);
    delete broken.scenes[0].narration.ar;
    await expect(draft(BRIEF, opts(model([JSON.stringify(broken)])))).rejects.toBeInstanceOf(DraftFailed);
    await expect(draft(BRIEF, opts(model(["{}"])))).rejects.toThrow("usable lesson");
  });

  it("the Gemini call asks for JSON and adds up thinking as output", async () => {
    let body: Record<string, unknown> = {};
    const fetcher = (async (_url: string, init: RequestInit) => {
      body = JSON.parse(String(init.body));
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: "thinking…", thought: true }, { text: '{"ok":1}' }] } }],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, thoughtsTokenCount: 7 },
      }), { status: 200 });
    }) as unknown as typeof fetch;
    const out = await gemini("key", "m", fetcher)("sys", [{ role: "user", text: "hi" }]);
    expect(out).toEqual({ text: '{"ok":1}', usage: { input: 10, output: 12 } });
    expect(body).toMatchObject({ generationConfig: { responseMimeType: "application/json" }, systemInstruction: { parts: [{ text: "sys" }] } });
  });
});

describe("MP4 export narration", () => {
  const dir = "content/darsi/lessons/cy-1-1-2/";
  const json = (p: string) => JSON.parse(readFileSync(dir + p, "utf8"));
  const lesson = { manifest: json("manifest.json"), scenes: json("scenes.json") };
  const measured = { en: json("timing/en.json"), "ar-EG": json("timing/ar-EG.json") };

  it("puts the language's narration where the renderer looks for it, read from the bucket by content", async () => {
    const out = mkdtempSync(join(tmpdir(), "ls-test-"));
    try {
      const asked: string[] = [];
      const read = async (o: string) => { asked.push(o); return readFileSync(dir + "audio/ar-EG.opus"); };
      expect(await fetchNarration(toPackage(lesson, measured), "ar-EG", out, read)).toBe(true);
      const sha = lesson.manifest.assets.find((a: { path: string }) => a.path === "audio/ar-EG.opus").sha256;
      expect(asked).toEqual([`media/${sha}.opus`]);
      expect(readFileSync(join(out, "audio/ar-EG.opus")).equals(readFileSync(dir + "audio/ar-EG.opus"))).toBe(true);
      // A file that isn't the one the timings were measured from.
      await expect(fetchNarration(toPackage(lesson, measured), "en", out, read)).rejects.toThrow("sha256");
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });

  it("stays silent without measured timings, as the studio plays it", async () => {
    const out = mkdtempSync(join(tmpdir(), "ls-test-"));
    try {
      let asked = 0;
      expect(await fetchNarration(toPackage(lesson), "en", out, async () => { asked++; return Buffer.alloc(0); })).toBe(false);
      expect(asked).toBe(0);
      expect(existsSync(join(out, "audio"))).toBe(false);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });
});
