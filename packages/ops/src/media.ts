import type { Asset, Lang, Manifest, Scene, TimingFile } from "@lessonstudio/spec";
import { splitWords } from "@lessonstudio/spec";

/**
 * Where a lesson's media file (its narration) is kept in the studio's Storage bucket: named by its content, so a
 * file is stored once however many lessons use it, never changes, and caches for good. `scripts/darsi/push.ts`
 * uploads to it, the studio plays from it and the exportVideo function reads it.
 */
export function mediaObject(a: Pick<Asset, "path" | "sha256">): string {
  if (!/^[0-9a-f]{64}$/.test(a.sha256)) throw new Error(`Bad sha256 for ${a.path}`);
  const ext = /\.[a-z0-9]{1,8}$/i.exec(a.path)?.[0].toLowerCase() ?? "";
  return `media/${a.sha256}${ext}`;
}

/**
 * The player's `resolve` for a lesson whose media is in a Storage bucket: each manifest asset's path becomes the
 * address of its object under `bucketUrl` (the bucket's download address, ending in "/o/", e.g.
 * https://firebasestorage.googleapis.com/v0/b/<bucket>/o/). Paths that aren't assets go to `fallback`.
 */
export function mediaResolver(m: Manifest, bucketUrl: string, fallback: (path: string) => string): (path: string) => string {
  const byPath = new Map<string, Asset>();
  for (const a of m.assets ?? []) if (/^[0-9a-f]{64}$/.test(a.sha256)) byPath.set(a.path, a);
  return (path) => {
    const a = byPath.get(path);
    return a ? `${bucketUrl}${encodeURIComponent(mediaObject(a))}?alt=media` : fallback(path);
  };
}

/**
 * The measured timings that still fit the lesson: the same scenes in the same order, and in each scene the words of
 * its narration as they were spoken. Any other is stale (the script changed after it was voiced): that language then
 * plays from estimated timings, without its audio, until it is voiced again.
 */
export function currentTimings(scenes: Scene[], timings: Record<Lang, TimingFile | undefined>): Record<Lang, TimingFile> {
  const out: Record<Lang, TimingFile> = {};
  for (const [lang, t] of Object.entries(timings)) {
    if (!t || t.source === "estimated" || t.scenes.length !== scenes.length) continue;
    const fits = t.scenes.every((st, i) => {
      const s = scenes[i]!;
      if (st.id !== s.id) return false;
      return st.words.map((w) => w.w).join(" ") === splitWords(s.narration[lang] ?? "").join(" ");
    });
    if (fits) out[lang] = t;
  }
  return out;
}

/**
 * A narration's waveform, for the studio's timeline: the loudest sample in each 1/rate of a second, 0–255, in base64.
 * It is stored beside the language's measured timing (TimingDoc.peaks) with the sha256 of the audio file it was drawn
 * from, so the studio shows it only for the audio that plays. scripts/darsi/push.ts writes it.
 */
export interface Peaks {
  audio: string;
  rate: number;
  data: string;
}

/** The loudest sample in each 1/rate of a second of mono 16-bit audio, scaled to 0–255. */
export function peaksOf(samples: Int16Array, sampleRate: number, rate: number): Uint8Array {
  const step = sampleRate / rate;
  const out = new Uint8Array(Math.ceil(samples.length / step));
  for (let i = 0; i < out.length; i++) {
    let most = 0;
    for (let j = Math.floor(i * step), end = Math.min(samples.length, Math.floor((i + 1) * step)); j < end; j++) most = Math.max(most, Math.abs(samples[j]!));
    out[i] = Math.min(255, Math.round((most / 32768) * 255));
  }
  return out;
}
