// The studio's voice clips: a recording or upload made into a scene's voice, removing one, and undoing the last change
// (voiceClip in index.ts). The model is packages/ops/src/voice.ts; the sound work is scripts/lib/voice.ts.
import type { VoiceClip, VoiceDoc } from "@lessonstudio/ops";

export interface VoiceRequest {
  lesson: string;
  scene: string;
  lang: string;
  action: "add" | "remove" | "undo";
  /** add: the recording or file, uploaded by the caller to uploads/<uid>/. */
  upload?: string;
  kind?: "recorded" | "uploaded";
}

/** What a request may ask for; uploads only from the caller's own folder. */
export function readVoiceRequest(data: unknown, uid: string): VoiceRequest | string {
  const d = (data ?? {}) as Record<string, unknown>;
  const lesson = String(d.lesson ?? ""), scene = String(d.scene ?? ""), lang = String(d.lang ?? ""), action = String(d.action ?? "");
  if (!/^[a-z0-9][a-z0-9-]{1,63}$/.test(lesson)) return "Which lesson?";
  if (!/^[A-Za-z0-9_-]{1,60}$/.test(scene)) return "Which scene?";
  if (!/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(lang)) return "Which language?";
  if (action === "remove" || action === "undo") return { lesson, scene, lang, action };
  if (action !== "add") return "Add, remove or undo?";
  const upload = String(d.upload ?? "");
  if (!new RegExp(`^uploads/${uid}/[A-Za-z0-9._-]{1,100}$`).test(upload)) return "Which upload?";
  const kind = d.kind === "uploaded" ? "uploaded" : "recorded";
  return { lesson, scene, lang, action, upload, kind };
}

/**
 * The voice document after a change to one scene: a new clip, none (remove), or "undo", which swaps the clip with the
 * one it replaced. Every change keeps what it replaced, so it can be undone in turn.
 */
export function changeVoice(doc: VoiceDoc | undefined, scene: string, change: VoiceClip | null | "undo"): VoiceDoc {
  const clips = { ...(doc?.clips ?? {}) };
  const prev = { ...(doc?.prev ?? {}) };
  const now = clips[scene] ?? null;
  const next = change === "undo" ? (scene in prev ? prev[scene]! : now) : change;
  if (change === "undo" && !(scene in prev)) return { clips, prev };
  prev[scene] = now;
  if (next) clips[scene] = next;
  else delete clips[scene];
  return { clips, prev };
}
