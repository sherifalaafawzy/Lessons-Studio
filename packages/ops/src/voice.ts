import type { Lang, Scene, SceneTiming, Sentence, TimingFile, Word } from "@lessonstudio/spec";
import { estimateTiming, splitWords } from "@lessonstudio/spec";
import { mediaObject } from "./media.ts";

/** Who made a scene's voice: an AI voice, a recording made in the studio, or a file someone uploaded. */
export type VoiceKind = "ai" | "recorded" | "uploaded";

/**
 * One scene's voice in one language: a clip in the Storage bucket (media/<sha256>.opus, mediaObject) and its timings,
 * counted from the clip's start. Kept per scene, so moving, copying or removing scenes keeps every scene's voice; the
 * language's track is put together in the lesson's order when it plays (voiceTrack).
 */
export interface VoiceClip {
  /** sha256 of the clip file. */
  media: string;
  /** "audio/ogg" (Opus). */
  type: string;
  bytes: number;
  seconds: number;
  /** The narration it speaks, as it was when voiced: the scene's words joined by single spaces. */
  text: string;
  words: Word[];
  sentences: Sentence[];
  /** How its word times were made: forced alignment, or measured sentences with the words spread within them. */
  timing: "aligned" | "tts";
  kind: VoiceKind;
  /** The AI voice's name, e.g. "Sulafat". */
  voice?: string;
  /** Its waveform, PEAKS_RATE peaks a second, 0–255, base64 (peaksOf). */
  peaks: string;
  /** When it was made (ms), and by whom (uid, or "script:darsi"). */
  at: number;
  by: string;
}

/** lessons/{id}/voice/{lang}: written by the server only. */
export interface VoiceDoc {
  /** By scene id. */
  clips: Record<string, VoiceClip>;
  /** What each scene had before its last change (null: nothing), so the change can be undone. */
  prev?: Record<string, VoiceClip | null>;
}

/** Where a clip lives in the bucket: media/<sha256>.opus. */
export const clipObject = (c: Pick<VoiceClip, "media">): string => mediaObject({ path: "clip.opus", sha256: c.media });

/** Peaks a second in a clip's waveform. */
export const PEAKS_RATE = 40;

/** The words a scene's clip has to say in a language. */
export const sceneText = (scene: Scene, lang: Lang): string => splitWords(scene.narration[lang] ?? "").join(" ");

/** Whether a clip still says what the scene's narration says. */
export const clipFits = (scene: Scene, lang: Lang, clip: VoiceClip | undefined): clip is VoiceClip => !!clip && clip.text === sceneText(scene, lang);

/** One scene in a language's track: its clip, or silence as long as reading its text would take. */
export interface TrackPart {
  scene: string;
  start: number;
  seconds: number;
  clip: VoiceClip | null;
  /** It has a clip, but the script changed since. */
  stale: boolean;
}

export interface VoiceTrack {
  parts: TrackPart[];
  timing: TimingFile;
  /** At least one scene has its voice. */
  voiced: boolean;
  /** Names the sound: the same key, the same audio. */
  key: string;
}

const r3 = (x: number): number => Math.round(x * 1000) / 1000;

/**
 * A language's voice track in the lesson's order: each scene's clip while it still fits the script, else silence for as
 * long as the text would take (with estimated word times), so the other scenes keep their voices. The timings are
 * "estimated" when no scene is voiced, then "aligned" if every clip was aligned, else "tts".
 */
export function voiceTrack(scenes: Scene[], lang: Lang, clips: Record<string, VoiceClip>): VoiceTrack {
  const parts: TrackPart[] = [];
  const out: SceneTiming[] = [];
  let t = 0;
  let aligned = true;
  for (const scene of scenes) {
    const have = clips[scene.id];
    const clip = clipFits(scene, lang, have) ? have : null;
    let st: SceneTiming;
    if (clip) {
      if (clip.timing !== "aligned") aligned = false;
      st = {
        id: scene.id, start: r3(t), end: r3(t + clip.seconds),
        sentences: clip.sentences.map((x) => ({ text: x.text, start: r3(t + x.start), end: r3(t + x.end) })),
        words: clip.words.map((w) => ({ w: w.w, s: r3(t + w.s), e: r3(t + w.e) })),
      };
    } else {
      const e = estimateTiming([scene], lang).scenes[0]!;
      st = {
        id: scene.id, start: r3(t), end: r3(t + e.end),
        sentences: e.sentences.map((x) => ({ text: x.text, start: r3(t + x.start), end: r3(t + x.end) })),
        words: e.words.map((w) => ({ w: w.w, s: r3(t + w.s), e: r3(t + w.e) })),
      };
    }
    parts.push({ scene: scene.id, start: st.start, seconds: r3(st.end - st.start), clip, stale: !clip && !!have });
    out.push(st);
    t = st.end;
  }
  const voiced = parts.some((p) => p.clip);
  return {
    parts,
    timing: { version: "0.1", lang, source: !voiced ? "estimated" : aligned ? "aligned" : "tts", duration: r3(t), scenes: out },
    voiced,
    key: parts.map((p) => (p.clip ? p.clip.media : `-${p.seconds}`)).join(","),
  };
}
