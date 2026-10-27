import { h } from "../dom.ts";
import { clamp01, fix, schedule } from "../motion.ts";
import { emphasis, show, txt } from "./common.ts";
import type { SceneOf, Template } from "./types.ts";

/** Numbered steps that appear as the narration reaches them, with a progress bar. */
export const steps: Template<SceneOf<"steps">> = (scene, ctx) => {
  const c = scene.content;
  const title = c.title ? txt(ctx, "h2", "ls-title", c.title) : null;
  const items = c.steps.map((s, i) =>
    h("li", { className: "ls-step" }, h("span", { className: "ls-num" }, String(i + 1)), txt(ctx, "span", "ls-step-text", s)),
  );
  const fill = h("div", { className: "ls-progress-fill" });
  const root = h(
    "div",
    { className: "ls-scene ls-t-steps" },
    title,
    h("ol", { className: "ls-steps" }, ...items),
    h("div", { className: "ls-progress" }, fill),
  );
  const targets = c.steps.map((_, i) => String(i + 1));

  return {
    root,
    update(lt, cs) {
      if (title) show(ctx, title, lt, 0, 14, emphasis(ctx, title, "title", cs));
      const at = schedule(targets, cs, ctx.words, ctx.dur);
      let now = -1;
      items.forEach((li, i) => {
        if (lt >= at[i]!) now = i;
        show(ctx, li, lt, at[i]!, 26, emphasis(ctx, li, targets[i]!, cs));
      });
      items.forEach((li, i) => ctx.wr.cls(li, "is-now", i === now));
      ctx.wr.style(fill, "transform", `scaleX(${fix(clamp01(lt / ctx.dur))})`);
    },
  };
};
