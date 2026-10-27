import type { NarrationVoice } from "@lessonstudio/spec";
import { decodeAudio, fromBase64, type Pcm } from "./pcm.ts";

/**
 * Gemini TTS through generateContent, one request per sentence, either now or in a batch at half price.
 * Request and batch shapes follow ai.google.dev (speech generation and batch mode pages, checked 27 Oct 2026).
 */
export const DEFAULT_MODEL = "gemini-3.8-flash-lite-tts";
const BASE = "https://generativelanguage.googleapis.com";

/** The generateContent body that voices `text`. The style is metadata for the model and is never read aloud. */
export function ttsRequest(text: string, v: NarrationVoice): Record<string, unknown> {
  const part: Record<string, unknown> = { text };
  if (v.style) part.speechMetadata = { style: v.style };
  // Designed and replicated voices have ids ("voice_…", "voicekey_…"); the 30 prebuilt ones have names.
  const voiceConfig = /^voice(key)?_/.test(v.name) ? { voice: v.name } : { prebuiltVoiceConfig: { voiceName: v.name } };
  return {
    contents: [{ role: "user", parts: [part] }],
    generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig } },
  };
}

export interface Spoken {
  pcm: Pcm;
  /** Audio tokens billed (25 a second), when the API reports them. */
  tokens?: number;
  inputTokens?: number;
}

/** The audio in a generateContent response, or an error that says why there is none. */
export function audioOf(res: any): Spoken {
  const cand = res?.candidates?.[0];
  const parts: any[] = cand?.content?.parts ?? [];
  const part = parts.find((p) => (p?.inlineData ?? p?.inline_data)?.data);
  if (!part) {
    const why = res?.promptFeedback?.blockReason ?? cand?.finishReason ?? "no audio part";
    throw new Error(`The model returned no audio (${why})`);
  }
  const d = part.inlineData ?? part.inline_data;
  const u = res?.usageMetadata ?? {};
  const out: Spoken = { pcm: decodeAudio(fromBase64(d.data), d.mimeType ?? d.mime_type ?? "") };
  if (typeof u.candidatesTokenCount === "number") out.tokens = u.candidatesTokenCount;
  if (typeof u.promptTokenCount === "number") out.inputTokens = u.promptTokenCount;
  return out;
}

/* ---------- batch ---------- */

export interface BatchRequest {
  key: string;
  request: Record<string, unknown>;
}

export function batchBody(displayName: string, items: BatchRequest[]): Record<string, unknown> {
  return {
    batch: {
      display_name: displayName,
      input_config: { requests: { requests: items.map((i) => ({ request: i.request, metadata: { key: i.key } })) } },
    },
  };
}

export type BatchState = "pending" | "running" | "succeeded" | "failed" | "cancelled" | "expired";
const STATES: BatchState[] = ["pending", "running", "succeeded", "failed", "cancelled", "expired"];

/** The state of a batch, from either shape the API returns (an operation with metadata, or the batch itself). */
export function batchState(op: any): { state: BatchState; done: boolean; error?: string } {
  const raw = String(op?.metadata?.state ?? op?.state ?? "").replace(/^(JOB|BATCH)_STATE_/, "").toLowerCase();
  let state: BatchState = STATES.includes(raw as BatchState) ? (raw as BatchState) : op?.done ? "succeeded" : "pending";
  if (op?.error) state = "failed";
  const done = state !== "pending" && state !== "running";
  return op?.error ? { state, done, error: String(op.error.message ?? JSON.stringify(op.error)) } : { state, done };
}

export interface BatchItem {
  index: number;
  key?: string;
  response?: unknown;
  error?: string;
}

const item = (x: any, index: number): BatchItem => {
  const out: BatchItem = { index };
  const key = x?.metadata?.key ?? x?.key;
  if (typeof key === "string") out.key = key;
  if (x?.response) out.response = x.response;
  if (x?.error) out.error = String(x.error.message ?? JSON.stringify(x.error));
  else if (!x?.response && x?.code !== undefined) out.error = String(x.message ?? x.code);
  return out;
};

/** A finished batch's results: inline items, or the name of a results file to download. */
export function batchOutput(op: any): { items: BatchItem[] } | { file: string } {
  const out = op?.response ?? op?.dest ?? op?.metadata?.output ?? {};
  const inl = out.inlinedResponses;
  const list = Array.isArray(inl) ? inl : Array.isArray(inl?.inlinedResponses) ? inl.inlinedResponses : null;
  if (list) return { items: list.map(item) };
  const file = out.responsesFile ?? out.fileName;
  return typeof file === "string" ? { file } : { items: [] };
}

/** A JSONL results file: one response or status object per line. */
export function parseJsonl(text: string): BatchItem[] {
  return text.split("\n").filter((l) => l.trim()).map((l, i) => item(JSON.parse(l), i));
}

/* ---------- HTTP ---------- */

export interface GeminiClient {
  key: string;
  fetch?: typeof fetch;
  base?: string;
  sleep?: (ms: number) => Promise<void>;
}

export class GeminiError extends Error {
  status: number;
  /** Seconds the API asked us to wait, if it said. */
  retryAfter?: number;
  constructor(status: number, message: string, retryAfter?: number) {
    super(message);
    this.status = status;
    if (retryAfter !== undefined) this.retryAfter = retryAfter;
  }
}

async function call(c: GeminiClient, method: string, path: string, body?: unknown): Promise<any> {
  const headers: Record<string, string> = { "x-goog-api-key": c.key };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const init: RequestInit = { method, headers };
  if (body !== undefined) init.body = JSON.stringify(body);
  const r = await (c.fetch ?? fetch)(`${c.base ?? BASE}/${path}`, init);
  const text = await r.text();
  if (r.ok) return path.includes(":download") ? text : text ? JSON.parse(text) : null;
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  const retry = (json?.error?.details ?? []).find((d: any) => String(d?.["@type"] ?? "").endsWith("RetryInfo"))?.retryDelay;
  const msg = json?.error?.message ?? text.slice(0, 300) ?? r.statusText;
  throw new GeminiError(r.status, `Gemini API ${r.status}: ${msg}`, retry ? parseFloat(retry) : undefined);
}

const RETRY = new Set([429, 500, 502, 503, 504]);

/** Voices one sentence now, retrying when the API is busy or rate-limited. */
export async function speak(c: GeminiClient, text: string, v: NarrationVoice, tries = 5): Promise<Spoken> {
  const model = v.model ?? DEFAULT_MODEL;
  const sleep = c.sleep ?? ((ms: number) => new Promise<void>((ok) => setTimeout(ok, ms)));
  for (let n = 1; ; n++) {
    try {
      return audioOf(await call(c, "POST", `v1beta/models/${model}:generateContent`, ttsRequest(text, v)));
    } catch (e) {
      const status = e instanceof GeminiError ? e.status : 0;
      const empty = e instanceof Error && e.message.startsWith("The model returned no audio");
      if (n >= tries || !(RETRY.has(status) || empty)) throw e;
      const wait = e instanceof GeminiError && e.retryAfter !== undefined ? e.retryAfter : Math.min(60, 2 ** n);
      await sleep(wait * 1000);
    }
  }
}

/** Submits a batch; returns its name ("batches/…"). */
export async function submitBatch(c: GeminiClient, model: string, displayName: string, items: BatchRequest[]): Promise<string> {
  const op = await call(c, "POST", `v1beta/models/${model}:batchGenerateContent`, batchBody(displayName, items));
  const name = op?.name ?? op?.metadata?.name;
  if (typeof name !== "string") throw new Error("The batch API returned no batch name");
  return name;
}

export const getBatch = (c: GeminiClient, name: string): Promise<any> => call(c, "GET", `v1beta/${name}`);

export const downloadResults = (c: GeminiClient, file: string): Promise<string> =>
  call(c, "GET", `download/v1beta/${file}:download?alt=media`);
