import { h } from "../dom.ts";
import { icon } from "../icons.ts";
import { emphasis, kinetic, show, txt } from "./common.ts";
import type { SceneOf, Template } from "./types.ts";

/** Title and hook card, with the title arriving word by word. */
export const titleHook: Template<SceneOf<"title-hook">> = (scene, ctx) => {
  const c = scene.content;
  const badge = c.icon ? h("div", { className: "ls-th-icon" }, icon(c.icon, 88)) : null;
  const kicker = c.kicker ? txt(ctx, "p", "ls-kicker", c.kicker) : null;
  const title = kinetic(ctx, "h1", "ls-th-title", c.title);
  const hook = c.hook ? txt(ctx, "p", "ls-th-hook", c.hook) : null;
  const root = h("div", { className: "ls-scene ls-t-title-hook" }, badge, kicker, title.el, hook);
  const step = 0.09;
  const hookAt = 0.35 + title.words.length * step + 0.25;

  return {
    root,
    update(lt, cs) {
      if (badge) show(ctx, badge, lt, 0, 16);
      if (kicker) show(ctx, kicker, lt, 0.12, 12, emphasis(ctx, kicker, "kicker", cs));
      const ts = emphasis(ctx, title.el, "title", cs);
      ctx.wr.style(title.el, "transform", ts === 1 ? "none" : `scale(${ts.toFixed(3)})`);
      title.words.forEach((w, i) => show(ctx, w, lt, 0.35 + i * step, 30));
      if (hook) show(ctx, hook, lt, hookAt, 18, emphasis(ctx, hook, "hook", cs));
    },
  };
};
