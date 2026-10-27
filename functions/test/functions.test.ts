// The functions' pure parts: sealed AI keys, draft requests, and the draft pipeline with a stand-in model.
import { describe, expect, it } from "vitest";
import { GALLERY } from "../../apps/studio/src/presets.ts";
import { keyShapeProblem, seal, statusOf, unseal } from "../src/keys.ts";
import { checkKey, draftPrice, gemini, type Generate } from "../src/gemini.ts";
import { DraftFailed, draft, readRequest, systemPrompt, userPrompt } from "../src/draft.ts";

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
