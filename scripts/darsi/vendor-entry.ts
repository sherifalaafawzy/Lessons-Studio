// What Darsi takes from the player (vendor-player.mjs builds this into Darsi's src/vendor).
import { packsUsed as used, type PackId, type ScenesFile } from "../../packages/spec/src/core.ts";
import { PACK_LOADERS } from "../../packages/player/src/packs.ts";

export { createPlayer } from "../../packages/player/src/index.ts";

/** The technology packs a lesson's scenes.json needs (science, code, data, iot, network, opt). */
export function packsUsed(file: ScenesFile | null | undefined): PackId[] {
  return used(file?.scenes ?? []);
}

/** Loads packs ahead of time (a course saved for offline use), so their lessons draw without a connection. */
export const prefetchPacks = (ids: readonly string[]): Promise<void> =>
  Promise.all(ids.map((id) => (PACK_LOADERS as Record<string, () => Promise<unknown>>)[id]?.().catch(() => {}))).then(() => {});
