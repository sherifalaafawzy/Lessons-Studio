import { h } from "../dom.ts";
import { mountLayer } from "../canvas.ts";
import type { SceneOf, Template } from "./types.ts";

/** Free layout: the scene's own elements, animated by keyframes and cues. */
export const canvas: Template<SceneOf<"canvas">> = (scene, ctx) => {
  const layer = mountLayer(scene.content.elements, ctx);
  return { root: h("div", { className: "ls-scene ls-t-canvas" }, layer.root), update: layer.update };
};
