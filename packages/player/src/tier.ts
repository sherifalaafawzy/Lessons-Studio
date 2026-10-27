/**
 * The quality ladder (PLAN.md §9.2): Full → Lite → Frames → Text.
 * - full: motion, moving packets, pulses.
 * - lite: no motion; things appear in their final state at their time.
 * - frames: one still per scene, plus captions.
 * - text: no stage; the transcript follows the narration.
 */
export type Tier = "full" | "lite" | "frames" | "text";
export const TIERS: Tier[] = ["full", "lite", "frames", "text"];

export interface Signals {
  saveData?: boolean;
  /** navigator.deviceMemory, in GB. */
  memory?: number;
  /** navigator.hardwareConcurrency. */
  cores?: number;
  reducedMotion?: boolean;
  /** navigator.connection.effectiveType: "slow-2g", "2g", "3g", "4g". */
  network?: string;
}

/** Picks the tier from what the device tells us. The learner can always override it. */
export function chooseTier(s: Signals): Tier {
  if (s.saveData || s.network === "slow-2g" || s.network === "2g") return "frames";
  if (s.memory !== undefined && s.memory < 1) return "frames";
  if (s.reducedMotion) return "lite";
  if ((s.memory !== undefined && s.memory <= 2) || (s.cores !== undefined && s.cores <= 2)) return "lite";
  return "full";
}

interface NavExtra {
  deviceMemory?: number;
  connection?: { saveData?: boolean; effectiveType?: string };
}

export function readSignals(win: Window = window): Signals {
  const nav = win.navigator as Navigator & NavExtra;
  const s: Signals = {};
  if (nav.connection?.saveData) s.saveData = true;
  if (nav.connection?.effectiveType) s.network = nav.connection.effectiveType;
  if (typeof nav.deviceMemory === "number") s.memory = nav.deviceMemory;
  if (typeof nav.hardwareConcurrency === "number") s.cores = nav.hardwareConcurrency;
  if (win.matchMedia?.("(prefers-reduced-motion: reduce)").matches) s.reducedMotion = true;
  return s;
}

/** How often each tier redraws while playing, in milliseconds (0: every animation frame). */
export const MIN_FRAME_MS: Record<Tier, number> = { full: 0, lite: 100, frames: 250, text: 250 };
