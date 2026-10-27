import type { Dir, TimingFile, Word } from "./types.ts";

export interface CaptionChunk {
  scene: string;
  start: number;
  end: number;
  words: Word[];
  text: string;
}

const EPS = 1e-6;

/**
 * Caption lines: each sentence cut into chunks of at most `maxChars` characters, never across sentences.
 * A long sentence is cut into chunks of similar length, so no word is left alone on a line.
 */
export function captionChunks(timing: TimingFile, maxChars = 42): CaptionChunk[] {
  const out: CaptionChunk[] = [];
  for (const sc of timing.scenes) {
    for (const se of sc.sentences) {
      const ws = sc.words.filter((w) => w.s >= se.start - EPS && w.e <= se.end + EPS);
      const total = ws.reduce((a, w, i) => a + w.w.length + (i ? 1 : 0), 0);
      const pieces = Math.max(1, Math.ceil(total / maxChars));
      const target = total / pieces;
      let cur: Word[] = [];
      let len = 0;
      let made = 0;
      const flush = (): void => {
        if (!cur.length) return;
        out.push({ scene: sc.id, start: cur[0]!.s, end: cur[cur.length - 1]!.e, words: cur, text: cur.map((w) => w.w).join(" ") });
        cur = [];
        len = 0;
        made++;
      };
      for (const w of ws) {
        const next = len + (len ? 1 : 0) + w.w.length;
        if (len && (next > maxChars || (next > target + 4 && made < pieces - 1))) flush();
        len += (len ? 1 : 0) + w.w.length;
        cur.push(w);
      }
      flush();
    }
  }
  return out;
}

const pad = (n: number, d = 2): string => String(n).padStart(d, "0");

export function vttTime(sec: number): string {
  const ms = Math.round(sec * 1000);
  return `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor(ms / 60000) % 60)}:${pad(Math.floor(ms / 1000) % 60)}.${pad(ms % 1000, 3)}`;
}

/** WebVTT captions. Right-to-left cues start with U+200F so a line that opens with a Latin word still reads right to left. */
export function toVtt(timing: TimingFile, dir: Dir = "ltr", maxChars = 42): string {
  const mark = dir === "rtl" ? "‏" : "";
  const cues = captionChunks(timing, maxChars).map(
    (c, i) => `${i + 1}\n${vttTime(c.start)} --> ${vttTime(c.end)}\n${mark}${c.text}\n`,
  );
  return `WEBVTT\n\n${cues.join("\n")}`;
}

/** The transcript: each scene's sentences, in order. */
export function transcript(timing: TimingFile): { scene: string; sentences: { text: string; start: number; end: number }[] }[] {
  return timing.scenes.map((s) => ({ scene: s.id, sentences: s.sentences }));
}
