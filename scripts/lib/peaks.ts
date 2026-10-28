// A narration file's waveform for the studio's timeline (packages/ops peaksOf), decoded with ffmpeg.
import { spawnSync } from "node:child_process";
import { PEAKS_RATE, peaksOf } from "../../packages/ops/src/index.ts";

export { PEAKS_RATE };
const DECODE_RATE = 8000;

/** The loudest moment in each 1/PEAKS_RATE of a second of an audio file (Opus, AAC, WAV…), 0–255. */
export async function filePeaks(file: string): Promise<Uint8Array> {
  const ffmpeg = process.env.FFMPEG_PATH ?? ((await import("ffmpeg-static")).default as unknown as string);
  const r = spawnSync(ffmpeg, ["-v", "error", "-i", file, "-ac", "1", "-ar", String(DECODE_RATE), "-f", "s16le", "-"], { maxBuffer: 256 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`ffmpeg couldn't decode ${file}: ${r.stderr?.toString().slice(-400)}`);
  const pcm = r.stdout as Buffer;
  const samples = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.length / 2));
  return peaksOf(samples, DECODE_RATE, PEAKS_RATE);
}
