// Gemini text generation for drafts (generateContent, JSON output) and the key check.
export const DRAFT_MODEL = "gemini-3.8-flash";
// On the emulators only, tests point this at a stand-in for Gemini; deployed functions always call Google.
const api = (): string => (process.env.FUNCTIONS_EMULATOR === "true" && process.env.GEMINI_API_BASE) || "https://generativelanguage.googleapis.com/v1beta";

/** USD per million tokens (standard tier). Output includes thinking. The price doubles on 2027-01-01. */
export function draftPrice(now = Date.now()): { input: number; output: number } {
  return now < Date.UTC(2027, 0, 1) ? { input: 0.75, output: 3.75 } : { input: 1.5, output: 7.5 };
}

export interface Turn { role: "user" | "model"; text: string }
export interface Usage { input: number; output: number }
export type Generate = (system: string, turns: Turn[]) => Promise<{ text: string; usage: Usage }>;

/** A generate function bound to one person's key. */
export function gemini(key: string, model = DRAFT_MODEL, fetcher: typeof fetch = fetch): Generate {
  return async (system, turns) => {
    const r = await fetcher(`${api()}/models/${model}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: turns.map((t) => ({ role: t.role, parts: [{ text: t.text }] })),
        generationConfig: { responseMimeType: "application/json", temperature: 0.7, maxOutputTokens: 24000 },
      }),
      signal: AbortSignal.timeout(150_000),
    });
    const j = (await r.json().catch(() => ({}))) as {
      candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
      error?: { message?: string; status?: string };
    };
    if (!r.ok) throw new GeminiError(r.status, j.error?.message ?? `HTTP ${r.status}`);
    const c = j.candidates?.[0];
    const text = (c?.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? "").join("");
    const u = j.usageMetadata ?? {};
    const usage = { input: u.promptTokenCount ?? 0, output: (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0) };
    if (!text) throw new GeminiError(502, `Gemini returned no text (${c?.finishReason ?? "no answer"}).`);
    return { text, usage };
  };
}

export class GeminiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Asks Google whether a key works, without generating anything (reading a model's details is free). */
export async function checkKey(key: string, fetcher: typeof fetch = fetch): Promise<"ok" | "rejected" | "unreachable"> {
  try {
    const r = await fetcher(`${api()}/models/${DRAFT_MODEL}`, { headers: { "x-goog-api-key": key }, signal: AbortSignal.timeout(15_000) });
    if (r.ok) return "ok";
    return r.status === 400 || r.status === 401 || r.status === 403 ? "rejected" : "unreachable";
  } catch {
    return "unreachable";
  }
}
