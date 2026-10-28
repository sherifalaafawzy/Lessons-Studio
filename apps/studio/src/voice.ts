// Scenes' voices in the studio: each language's track put together in memory from its clips in the lesson's order (so
// the stage and the preview play at once after scenes move), recordings and files sent to the voiceClip function, and
// waveforms. The model is packages/ops/src/voice.ts.
import { effect, signal } from "@preact/signals";
import type { Lang } from "@lessonstudio/spec";
import { clipObject, type VoiceClip, type VoiceTrack } from "@lessonstudio/ops";
import { auth } from "./fb.ts";
import { emulators, mediaBucketUrl } from "./env.ts";
import { call } from "./ai.ts";
import { lang, lessonId, trackAudio, tracks } from "./editor.ts";
import { say } from "./state.ts";
import { t } from "./i18n.ts";

/** Clips are mono at 24 kHz (scripts/lib/voice.ts). */
const RATE = 24000;

/** The language whose track is loading now, for the timeline's note. */
export const trackLoading = signal<Lang | null>(null);

/** A clip's address in the bucket. */
export const clipUrl = (c: Pick<VoiceClip, "media">): string => `${mediaBucketUrl()}${encodeURIComponent(clipObject(c))}?alt=media`;

// Each clip is fetched and decoded once a visit, by its content.
const decoded = new Map<string, Promise<Float32Array>>();
function samplesOf(c: VoiceClip): Promise<Float32Array> {
  let p = decoded.get(c.media);
  if (!p) {
    p = fetch(clipUrl(c))
      .then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.arrayBuffer(); })
      .then((b) => new OfflineAudioContext(1, 1, RATE).decodeAudioData(b))
      .then((buf) => buf.getChannelData(0));
    p.catch(() => decoded.delete(c.media));
    decoded.set(c.media, p);
  }
  return p;
}

/** 16-bit mono PCM as a WAV file. */
function wav(pcm: Int16Array): Blob {
  const head = new DataView(new ArrayBuffer(44));
  const text = (at: number, s: string) => { for (let i = 0; i < s.length; i++) head.setUint8(at + i, s.charCodeAt(i)); };
  text(0, "RIFF"); head.setUint32(4, 36 + pcm.byteLength, true); text(8, "WAVE");
  text(12, "fmt "); head.setUint32(16, 16, true); head.setUint16(20, 1, true); head.setUint16(22, 1, true);
  head.setUint32(24, RATE, true); head.setUint32(28, RATE * 2, true); head.setUint16(32, 2, true); head.setUint16(34, 16, true);
  text(36, "data"); head.setUint32(40, pcm.byteLength, true);
  return new Blob([head.buffer, pcm.buffer as ArrayBuffer], { type: "audio/wav" });
}

/** A track as one WAV: each clip at its place, cut or padded to its part, silence where a scene has no voice. */
async function build(track: VoiceTrack): Promise<string> {
  const last = track.parts[track.parts.length - 1];
  const out = new Int16Array(Math.round((last ? last.start + last.seconds : 0) * RATE));
  const clips = await Promise.all(track.parts.map((p) => (p.clip ? samplesOf(p.clip) : null)));
  track.parts.forEach((p, i) => {
    const s = clips[i];
    if (!s) return;
    const at = Math.round(p.start * RATE);
    const n = Math.max(0, Math.min(s.length, Math.round(p.seconds * RATE), out.length - at));
    for (let j = 0; j < n; j++) out[at + j] = Math.max(-32768, Math.min(32767, Math.round(s[j]! * 32767)));
  });
  return URL.createObjectURL(wav(out));
}

let failedOnce = false;
// The stage language's track, rebuilt whenever its clips or their order change; decoded clips are reused, so a moved
// scene plays again at once.
effect(() => {
  const code = lang.value;
  const tr = tracks.value[code];
  const have = trackAudio.peek()[code];
  if (!tr || !tr.voiced || have?.key === tr.key) return;
  trackLoading.value = code;
  build(tr).then((url) => {
    const now = tracks.peek()[code];
    if (now?.key !== tr.key) { URL.revokeObjectURL(url); return; }
    const old = trackAudio.peek()[code];
    trackAudio.value = { ...trackAudio.peek(), [code]: { key: tr.key, url } };
    if (old) setTimeout(() => URL.revokeObjectURL(old.url), 5000);
  }, (e) => {
    if (!failedOnce) say(`${t("voiceLoadFailed")}: ${(e as Error).message}`, true);
    failedOnce = true;
  }).finally(() => { if (trackLoading.peek() === code) trackLoading.value = null; });
});

// Decoded once per clip, so waveforms keep the same array (and their drawn shape) between renders.
const peaksCache = new Map<string, Uint8Array>();
/** A clip's waveform peaks (PEAKS_RATE a second, 0–255). */
export function peaksOf(c: Pick<VoiceClip, "media" | "peaks">): Uint8Array {
  let out = peaksCache.get(c.media);
  if (!out) {
    const bin = atob(c.peaks);
    out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    peaksCache.set(c.media, out);
  }
  return out;
}

/** A waveform as one closed shape, one unit wide per peak and 100 high, mirrored about the middle. */
export function envelope(peaks: ArrayLike<number>): string {
  let most = 1;
  for (let i = 0; i < peaks.length; i++) most = Math.max(most, peaks[i]!);
  const half = (i: number): number => Math.max(0.6, (peaks[i]! / most) * 48);
  const d: string[] = ["M0 50"];
  for (let i = 0; i < peaks.length; i++) d.push(`L${i + 0.5} ${(50 - half(i)).toFixed(1)}`);
  d.push(`L${peaks.length} 50`);
  for (let i = peaks.length - 1; i >= 0; i--) d.push(`L${i + 0.5} ${(50 + half(i)).toFixed(1)}`);
  d.push("Z");
  return d.join("");
}

/** Sends a recording or file to the caller's upload folder, reporting progress (0–1); returns its path. */
export function upload(blob: Blob, onProgress: (f: number) => void): Promise<string> {
  const who = auth.currentUser;
  if (!who) return Promise.reject(new Error("Sign in first"));
  const type = (blob.type || "audio/webm").split(";")[0]!.trim();
  const ext = ({ "audio/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "m4a", "audio/mpeg": "mp3", "audio/wav": "wav", "audio/x-wav": "wav", "audio/x-m4a": "m4a", "video/webm": "webm", "video/mp4": "mp4" } as Record<string, string>)[type] ?? "audio";
  const path = `uploads/${who.uid}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const base = emulators
    ? `http://127.0.0.1:${import.meta.env.VITE_STORAGE_EMULATOR_PORT ?? 9289}/v0/b/demo-lessonstudio.appspot.com/o`
    : `https://firebasestorage.googleapis.com/v0/b/${import.meta.env.VITE_FIREBASE_STORAGE_BUCKET}/o`;
  // The Firebase SDK's own simple upload: the object's metadata and its bytes in one multipart request.
  const boundary = `ls-${Math.random().toString(36).slice(2)}`;
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=utf-8\r\n\r\n${JSON.stringify({ name: path, contentType: type })}\r\n--${boundary}\r\nContent-Type: ${type}\r\n\r\n`,
    blob,
    `\r\n--${boundary}--`,
  ]);
  return who.getIdToken().then((token) => new Promise<string>((ok, bad) => {
    const x = new XMLHttpRequest();
    x.open("POST", `${base}?name=${encodeURIComponent(path)}`);
    x.setRequestHeader("Authorization", `Firebase ${token}`);
    x.setRequestHeader("X-Goog-Upload-Protocol", "multipart");
    x.setRequestHeader("Content-Type", `multipart/related; boundary=${boundary}`);
    x.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
    x.onload = () => (x.status >= 200 && x.status < 300 ? ok(path) : bad(new Error(x.status === 403 ? t("uploadRefused") : `${t("uploadFailed")} (${x.status})`)));
    x.onerror = () => bad(new Error(t("uploadFailed")));
    x.send(body);
  }));
}

export interface VoiceResult { clip: VoiceClip | null; canUndo: boolean }

/** Makes an uploaded recording or file into the scene's voice in a language. */
export const addVoice = (scene: string, code: Lang, path: string, kind: "recorded" | "uploaded") =>
  call<VoiceResult>("voiceClip", { lesson: lessonId.value, scene, lang: code, action: "add", upload: path, kind }, 180_000);

/** Removes a scene's voice in a language, or undoes the last change to it. */
export const changeVoice = (scene: string, code: Lang, action: "remove" | "undo") =>
  call<VoiceResult>("voiceClip", { lesson: lessonId.value, scene, lang: code, action }, 60_000);
