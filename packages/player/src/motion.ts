import type { ResolvedCue } from "@lessonstudio/spec";
import type { Tier } from "./tier.ts";

export const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
/** Ease-out cubic. */
export const ease = (p: number): number => 1 - (1 - p) ** 3;
/** Rounds for style strings, so equal times always write equal values. */
export const fix = (x: number, d = 3): string => String(Math.round(x * 10 ** d) / 10 ** d);

export const PULSE_S = 0.7;
export const MOVE_S = 1.1;

/**
 * How far something has entered (0 → 1) at local time `lt`, given it starts at `at`.
 * Full tier eases it in; the other tiers just switch it on.
 */
export function enter(lt: number, at: number, tier: Tier, dur = 0.45): number {
  if (tier !== "full") return lt >= at ? 1 : 0;
  return ease(clamp01((lt - at) / dur));
}

/** Everything the cues say at one moment of a scene. Times are local to the scene. */
export interface CueState {
  /** Targets highlighted by now. */
  hi: Set<string>;
  /** When each target is revealed, for targets that have a reveal cue. */
  at: Map<string, number>;
  /** When each target is first highlighted. */
  hiAt: Map<string, number>;
  /** Targets pulsing now, with their phase 0 → 1 (full tier only). */
  pulse: Map<string, number>;
  /** Packets travelling now, with progress 0 → 1 (full tier only). */
  moves: { target: string; p: number }[];
}

/** A pure function of the cues and the time: no history. */
export function cueState(cues: ResolvedCue[], lt: number, tier: Tier): CueState {
  const s: CueState = { hi: new Set(), at: new Map(), hiAt: new Map(), pulse: new Map(), moves: [] };
  for (const c of cues) {
    if (c.action === "reveal" && !s.at.has(c.target)) s.at.set(c.target, c.at);
    if (c.action === "highlight" && !s.hiAt.has(c.target)) s.hiAt.set(c.target, c.at);
    if (c.action === "highlight" && lt >= c.at) s.hi.add(c.target);
    if (tier !== "full") continue;
    const d = lt - c.at;
    if (c.action === "pulse" && d >= 0 && d < PULSE_S) s.pulse.set(c.target, d / PULSE_S);
    if (c.action === "move" && d >= 0 && d < MOVE_S) s.moves.push({ target: c.target, p: ease(d / MOVE_S) });
  }
  return s;
}

/** 1 → 1.08 → 1 over a pulse. */
export const pulseScale = (phase: number | undefined): number => (phase === undefined ? 1 : 1 + 0.08 * Math.sin(Math.PI * phase));

/**
 * When each of `n` items appears: its reveal cue's time (or, with `byHighlight`, its first highlight), else spread across the narration
 * (item i appears as the narration reaches i/n of its words), never later than near the end.
 */
export function schedule(targets: string[], cs: CueState, words: { s: number }[], dur: number, first = 0.3, byHighlight = false): number[] {
  const n = targets.length;
  return targets.map((t, i) => {
    const cued = cs.at.get(t) ?? (byHighlight ? cs.hiAt.get(t) : undefined);
    if (cued !== undefined) return cued;
    if (words.length) return i === 0 ? Math.min(first, words[0]!.s) : words[Math.floor((i * words.length) / n)]!.s;
    return first + (i * Math.max(0, dur * 0.8 - first)) / n;
  });
}
