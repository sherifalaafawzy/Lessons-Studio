/**
 * Gemini TTS prices in US dollars per 1M tokens (ai.google.dev/pricing, checked 27 Oct 2026; PLAN.md Appendix C).
 * They hold until 31 Dec 2026 and double from 1 Jan 2027. Audio is 25 tokens a second.
 */
export const PRICES: Record<string, { input: number; audio: number; batchInput: number; batchAudio: number }> = {
  "gemini-3.8-flash-lite-tts": { input: 0.5, audio: 6, batchInput: 0.25, batchAudio: 3 },
  "gemini-3.8-flash-tts": { input: 0.5, audio: 9, batchInput: 0.25, batchAudio: 4.5 },
};
export const AUDIO_TOKENS_PER_SECOND = 25;

/** Dollars for `seconds` of narration from `chars` characters of text, or null for a model without a known price. */
export function ttsCost(model: string, seconds: number, chars: number, batch: boolean): number | null {
  const p = PRICES[model];
  if (!p) return null;
  const audio = seconds * AUDIO_TOKENS_PER_SECOND;
  const input = chars / 4;
  return (audio * (batch ? p.batchAudio : p.audio) + input * (batch ? p.batchInput : p.input)) / 1e6;
}

/** The same from the token counts the API reported. */
export function billed(model: string, audioTokens: number, inputTokens: number, batch: boolean): number | null {
  const p = PRICES[model];
  if (!p) return null;
  return (audioTokens * (batch ? p.batchAudio : p.audio) + inputTokens * (batch ? p.batchInput : p.input)) / 1e6;
}
