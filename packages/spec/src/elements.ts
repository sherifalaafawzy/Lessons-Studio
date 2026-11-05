import type { Element, Scene } from "./types.ts";
import { PACKS, PACK_IDS, PACK_TYPES, packOf, type PackId } from "./packs/registry.ts";
export { TRACKS, TRACK_PACKS, packsForTrack, type TrackId } from "./packs/registry.ts";

/** Every free element in a scene (canvas elements, overlays, group children), depth-first. */
export function walkElements(scene: Scene, fn: (el: Element, path: string) => void): void {
  const walk = (list: Element[] | undefined, path: string): void => {
    (Array.isArray(list) ? list : []).forEach((el, i) => {
      const p = `${path}[${i}]`;
      fn(el, p);
      if (el && el.type === "group") walk(el.children, `${p}.children`);
    });
  };
  if (scene.template === "canvas") walk(scene.content?.elements, "content.elements");
  walk(scene.overlays, "overlays");
}

/** Elements the player's science kit draws (loaded only by lessons that use them). */
export const SCIENCE_TYPES = PACKS.science;
export { PACKS, PACK_IDS, PACK_TYPES, packOf, type PackId };

/** A package path: relative, no "..", no scheme, no backslash. */
export function relPathOk(p: unknown): boolean {
  return (
    typeof p === "string" && p.length > 0 && p.length <= 200 &&
    !/^[a-z][a-z0-9+.-]*:/i.test(p) && !p.startsWith("/") && !p.includes("\\") && !p.split("/").includes("..")
  );
}

/** The packs a lesson's scenes use (the player loads these, Darsi saves them with a course). */
export function packsUsed(scenes: readonly Scene[]): PackId[] {
  const used = new Set<PackId>();
  for (const sc of scenes) walkElements(sc, (el) => { const id = packOf(el.type); if (id) used.add(id); });
  return PACK_IDS.filter((id) => used.has(id));
}
