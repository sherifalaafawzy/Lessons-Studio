import type { Scene, SceneTiming } from "@lessonstudio/spec";
import { cameraTransform, compileTracks, mountLayer } from "../canvas.ts";
import { h } from "../dom.ts";
import { clamp01, ease, fix } from "../motion.ts";
import { canvas } from "./canvas.ts";
import { flow } from "./flow.ts";
import { messageMock } from "./messageMock.ts";
import { quiz } from "./quiz.ts";
import { steps } from "./steps.ts";
import { summary } from "./summary.ts";
import { titleHook } from "./titleHook.ts";
import type { Ctx, Mounted } from "./types.ts";

function template(scene: Scene, ctx: Ctx): Mounted {
  switch (scene.template) {
    case "title-hook": return titleHook(scene, ctx);
    case "steps": return steps(scene, ctx);
    case "flow": return flow(scene, ctx);
    case "message-mock": return messageMock(scene, ctx);
    case "quiz": return quiz(scene, ctx);
    case "summary": return summary(scene, ctx);
    case "canvas": return canvas(scene, ctx);
  }
}

/**
 * Mounts a scene: its template, then what any scene can add on top: overlays, a camera, a background
 * and the way it comes in. Still a pure function of time.
 */
export function mountScene(scene: Scene, ctx: Ctx): Mounted {
  const inner = template(scene, ctx);
  const timing: SceneTiming = { id: scene.id, start: 0, end: ctx.dur, sentences: [], words: ctx.words };
  const layer = scene.overlays?.length ? mountLayer(scene.overlays, ctx) : null;
  const camera = compileTracks(scene.camera, timing, ctx.lang);
  const shot = h("div", { className: "ls-shot" }, inner.root, layer?.root);
  if (scene.background) shot.style.background = `var(--ls-${scene.background === "surface" ? "card" : scene.background})`;

  // Transitions move only the incoming scene, with transform and opacity (cheap on old phones).
  const tr = scene.transition ?? { type: "fade" as const };
  const dur = tr.dur ?? (tr.type === "fade" ? 0.3 : 0.45);
  const moving = ctx.tier === "full" && !ctx.first && tr.type !== "cut" && dur > 0;
  const wipe = moving && tr.type === "wipe" ? h("div", { className: "ls-wipe" }) : null;
  const root = h("div", { className: "ls-cut" }, shot, wipe);
  const side = ctx.dir === "rtl" ? -1 : 1;

  return {
    root,
    update(lt, cs) {
      inner.update(lt, cs);
      layer?.update(lt, cs);
      ctx.wr.style(shot, "transform", cameraTransform(camera, lt, ctx));
      const p = moving ? ease(clamp01(lt / dur)) : 1;
      let op = 1;
      let tf = "none";
      if (tr.type === "fade") op = p;
      else if (tr.type === "slide" && p < 1) { op = p; tf = `translateX(${fix((1 - p) * 0.08 * ctx.W * side, 1)}px)`; }
      else if (tr.type === "zoom" && p < 1) { op = p; tf = `scale(${fix(1.06 - 0.06 * p, 4)})`; }
      ctx.wr.style(root, "opacity", fix(op));
      ctx.wr.style(root, "transform", tf);
      if (wipe) ctx.wr.style(wipe, "transform", `translateX(${fix(p * 100 * side, 2)}%)`);
    },
  };
}

export type { Ctx, Mounted } from "./types.ts";
