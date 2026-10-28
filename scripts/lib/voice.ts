// Voice clips on a server or this PC, with ffmpeg: a recording cleaned up and timed, a clip encoded for the bucket, and a
// language's track put together from its clips for an MP4. The voice model is packages/ops/src/voice.ts.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import type { LanguageTrack, Sentence, TimingFile, Word } from "../../packages/spec/src/index.ts";
import { PEAKS_RATE, peaksOf, sceneText, type Lesson, type TrackPart, type VoiceClip, type VoiceKind } from "../../packages/ops/src/index.ts";
import { timeRecording, type Pcm } from "../../packages/narrate/src/index.ts";

/** Clips are mono at 24 kHz, Gemini's own rate; stored as Opus at 48 kbit/s, about 6 KB a second. */
export const RATE = 24000;
const LEAD = 0.3;
const TAIL = 0.6;
/** Recordings and uploads: at most this long. */
export const MAX_SECONDS = 300;

async function ffmpegPath(): Promise<string> {
  return process.env.FFMPEG_PATH ?? ((await import("ffmpeg-static")).default as unknown as string);
}

async function run(args: string[], input?: Buffer): Promise<Buffer> {
  const r = spawnSync(await ffmpegPath(), ["-v", "error", ...args], { input, maxBuffer: 512 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`ffmpeg: ${r.stderr?.toString().trim().slice(-400) || r.error?.message || `exit ${r.status}`}`);
  return r.stdout as Buffer;
}

const toPcm = (b: Buffer): Pcm => ({ rate: RATE, samples: new Int16Array(b.buffer.slice(b.byteOffset, b.byteOffset + (b.length & ~1))) });

/** Any audio (or video with sound) as mono 16-bit PCM at 24 kHz; `filter` is an ffmpeg audio filter chain. */
export async function decode(input: Buffer, filter?: string): Promise<Pcm> {
  return toPcm(await run(["-i", "pipe:0", "-vn", ...(filter ? ["-af", filter] : []), "-ac", "1", "-ar", String(RATE), "-f", "s16le", "pipe:1"], input));
}

/** A recording or an upload, ready to use: silence cut from both ends, the level evened out, then a short lead-in and tail. */
export async function clean(input: Buffer): Promise<Pcm> {
  const trim = "silenceremove=start_periods=1:start_duration=0.05:start_threshold=-50dB";
  const p = await decode(input, `${trim},areverse,${trim},areverse,loudnorm=I=-18:TP=-2:LRA=11,aresample=${RATE}`);
  const out = new Int16Array(Math.round((LEAD + TAIL) * RATE) + p.samples.length);
  out.set(p.samples, Math.round(LEAD * RATE));
  return { rate: RATE, samples: out };
}

/** A clip as stored: Ogg Opus. */
export async function encodeClip(p: Pcm): Promise<Buffer> {
  const raw = Buffer.from(p.samples.buffer, p.samples.byteOffset, p.samples.byteLength);
  return run(["-f", "s16le", "-ar", String(p.rate), "-ac", "1", "-i", "pipe:0", "-c:a", "libopus", "-b:a", "48k", "-application", "voip", "-f", "ogg", "pipe:1"], raw);
}

/** A clip's record, and the file to put at media/<sha256>.opus. */
export async function makeClip(p: Pcm, o: {
  text: string; words: Word[]; sentences: Sentence[]; timing: VoiceClip["timing"]; kind: VoiceKind; voice?: string; by: string; at?: number;
}): Promise<{ clip: VoiceClip; file: Buffer }> {
  const file = await encodeClip(p);
  const clip: VoiceClip = {
    media: createHash("sha256").update(file).digest("hex"), type: "audio/ogg", bytes: file.length,
    seconds: Math.round((p.samples.length / p.rate) * 1000) / 1000,
    text: o.text, words: o.words, sentences: o.sentences, timing: o.timing, kind: o.kind,
    ...(o.voice ? { voice: o.voice } : {}),
    peaks: Buffer.from(peaksOf(p.samples, p.rate, PEAKS_RATE)).toString("base64"),
    at: o.at ?? Date.now(), by: o.by,
  };
  return { clip, file };
}

/**
 * Each scene's voice, cut from a language's whole narration (made by `npm run narrate`) at the scenes' starts, with the
 * narration's measured word times. `timing` must fit the lesson's script (currentTimings).
 */
export async function clipsFromNarration(lesson: Lesson, track: LanguageTrack, timing: TimingFile, audio: Buffer, by: string, at = Date.now()): Promise<{ scene: string; clip: VoiceClip; file: Buffer }[]> {
  const pcm = await decode(audio);
  const out: { scene: string; clip: VoiceClip; file: Buffer }[] = [];
  for (const [i, scene] of lesson.scenes.scenes.entries()) {
    const st = timing.scenes[i]!;
    const from = i === 0 ? 0 : st.start;
    const to = i === timing.scenes.length - 1 ? pcm.samples.length / RATE : timing.scenes[i + 1]!.start;
    const samples = pcm.samples.slice(Math.round(from * RATE), Math.round(to * RATE));
    const r3 = (x: number): number => Math.round((x - from) * 1000) / 1000;
    const voice = (scene.speaker && track.voices?.[scene.speaker]?.name) || track.voice?.name;
    const { clip, file } = await makeClip({ rate: RATE, samples }, {
      text: sceneText(scene, track.code),
      words: st.words.map((w) => ({ w: w.w, s: r3(w.s), e: r3(w.e) })),
      sentences: st.sentences.map((x) => ({ text: x.text, start: r3(x.start), end: r3(x.end) })),
      timing: timing.source === "aligned" ? "aligned" : "tts", kind: "ai", ...(voice ? { voice } : {}), by, at,
    });
    out.push({ scene: scene.id, clip, file });
  }
  return out;
}

/** A recording or upload of a scene's script, cleaned up, timed and encoded. Throws a message for people when it can't be used. */
export async function clipFromRecording(input: Buffer, text: string, kind: VoiceKind, by: string): Promise<{ clip: VoiceClip; file: Buffer }> {
  let p: Pcm;
  try {
    p = await clean(input);
  } catch {
    throw new Error("That file couldn't be read as audio. Try a WAV, MP3, M4A, OGG or WebM file.");
  }
  if (p.samples.length > MAX_SECONDS * RATE) throw new Error(`A scene's voice can be up to ${MAX_SECONDS / 60} minutes long.`);
  const timed = timeRecording(p, text);
  if (!timed || !timed.words.length && text) throw new Error("No speech was heard in that recording. Check the microphone and try again.");
  return makeClip(p, { text, words: timed.words, sentences: timed.sentences, timing: "tts", kind, by });
}

/**
 * A language's track as one PCM, from its parts (voiceTrack): each clip at its place, cut or padded to its part's
 * length so the sound and the timings agree to the sample, and silence where a scene has no voice.
 */
export async function trackPcm(parts: TrackPart[], read: (clip: VoiceClip) => Promise<Buffer>): Promise<Pcm> {
  const end = parts.length ? parts[parts.length - 1]!.start + parts[parts.length - 1]!.seconds : 0;
  const out = new Int16Array(Math.round(end * RATE));
  for (const part of parts) {
    if (!part.clip) continue;
    const p = await decode(await read(part.clip));
    const at = Math.round(part.start * RATE);
    out.set(p.samples.subarray(0, Math.max(0, Math.min(p.samples.length, Math.round(part.seconds * RATE), out.length - at))), at);
  }
  return { rate: RATE, samples: out };
}
