/** Mono 16-bit PCM: what Gemini TTS returns (24 kHz), and what a lesson's narration is assembled from. */
export interface Pcm {
  rate: number;
  samples: Int16Array;
}

export const seconds = (p: Pcm): number => p.samples.length / p.rate;

export function fromBase64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const tag = (b: Uint8Array, at: number): string => String.fromCharCode(b[at]!, b[at + 1]!, b[at + 2]!, b[at + 3]!);

/** Reads a 16-bit PCM WAV file. Stereo is mixed down. A data size of 0 or 0xFFFFFFFF (streamed WAV) means "to the end". */
export function parseWav(b: Uint8Array): Pcm {
  if (b.length < 12 || tag(b, 0) !== "RIFF" || tag(b, 8) !== "WAVE") throw new Error("Not a WAV file");
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let at = 12;
  let rate = 0;
  let channels = 0;
  let bits = 0;
  while (at + 8 <= b.length) {
    const id = tag(b, at);
    let size = dv.getUint32(at + 4, true);
    const body = at + 8;
    if (id === "fmt ") {
      if (dv.getUint16(body, true) !== 1 && dv.getUint16(body, true) !== 0xfffe) throw new Error("WAV is not PCM");
      channels = dv.getUint16(body + 2, true);
      rate = dv.getUint32(body + 4, true);
      bits = dv.getUint16(body + 14, true);
    } else if (id === "data") {
      if (!rate || bits !== 16 || channels < 1) throw new Error("Only 16-bit PCM WAV is supported");
      if (size === 0 || size === 0xffffffff || body + size > b.length) size = b.length - body;
      const frames = Math.floor(size / (2 * channels));
      const samples = new Int16Array(frames);
      for (let i = 0; i < frames; i++) {
        let sum = 0;
        for (let c = 0; c < channels; c++) sum += dv.getInt16(body + (i * channels + c) * 2, true);
        samples[i] = Math.round(sum / channels);
      }
      return { rate, samples };
    }
    at = body + size + (size & 1);
  }
  throw new Error("WAV has no data");
}

/** Raw little-endian 16-bit mono samples (Gemini's "audio/L16"). */
export function parseL16(b: Uint8Array, rate: number): Pcm {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const samples = new Int16Array(Math.floor(b.length / 2));
  for (let i = 0; i < samples.length; i++) samples[i] = dv.getInt16(i * 2, true);
  return { rate, samples };
}

/** Audio bytes with their MIME type, as an API returns them. */
export function decodeAudio(bytes: Uint8Array, mime = ""): Pcm {
  if (bytes.length >= 12 && tag(bytes, 0) === "RIFF") return parseWav(bytes);
  const m = /^audio\/(?:l16|pcm)\b(.*)$/i.exec(mime.trim());
  if (m) return parseL16(bytes, Number(/rate=(\d+)/i.exec(m[1] ?? "")?.[1] ?? 24000));
  throw new Error(`Unsupported audio type "${mime}"`);
}

export function toWav(p: Pcm): Uint8Array {
  const data = p.samples.length * 2;
  const b = new Uint8Array(44 + data);
  const dv = new DataView(b.buffer);
  const put = (at: number, s: string) => { for (let i = 0; i < 4; i++) b[at + i] = s.charCodeAt(i); };
  put(0, "RIFF");
  dv.setUint32(4, 36 + data, true);
  put(8, "WAVE");
  put(12, "fmt ");
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true);
  dv.setUint16(22, 1, true);
  dv.setUint32(24, p.rate, true);
  dv.setUint32(28, p.rate * 2, true);
  dv.setUint16(32, 2, true);
  dv.setUint16(34, 16, true);
  put(36, "data");
  dv.setUint32(40, data, true);
  for (let i = 0; i < p.samples.length; i++) dv.setInt16(44 + i * 2, p.samples[i]!, true);
  return b;
}

export interface TrimOptions {
  /** Loudness, as a fraction of full scale, below which a 10 ms window counts as silence. */
  threshold?: number;
  /** Silence kept before and after the speech, in seconds. */
  pad?: number;
}

/** Cuts the silence a TTS clip starts and ends with, so the pauses between sentences are ours. */
export function trimSilence(p: Pcm, o: TrimOptions = {}): Pcm {
  const threshold = (o.threshold ?? 0.012) * 32768;
  const pad = Math.round((o.pad ?? 0.04) * p.rate);
  const win = Math.max(1, Math.round(p.rate / 100));
  const loud = (from: number): boolean => {
    let sum = 0;
    const to = Math.min(p.samples.length, from + win);
    for (let i = from; i < to; i++) sum += p.samples[i]! * p.samples[i]!;
    return Math.sqrt(sum / Math.max(1, to - from)) > threshold;
  };
  let a = 0;
  while (a < p.samples.length && !loud(a)) a += win;
  if (a >= p.samples.length) return { rate: p.rate, samples: new Int16Array(0) };
  let z = Math.floor((p.samples.length - 1) / win) * win;
  while (z > a && !loud(z)) z -= win;
  const from = Math.max(0, a - pad);
  const to = Math.min(p.samples.length, z + win + pad);
  return { rate: p.rate, samples: p.samples.slice(from, to) };
}
