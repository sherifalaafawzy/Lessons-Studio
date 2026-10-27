import type { Element, Scene } from "./types.ts";

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
