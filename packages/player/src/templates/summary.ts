import { h } from "../dom.ts";
import { icon } from "../icons.ts";
import { schedule } from "../motion.ts";
import { emphasis, part, show, txt } from "./common.ts";
import type { SceneOf, Template } from "./types.ts";

/** Key points with ticks, then the one-line takeaway. */
export const summary: Template<SceneOf<"summary">> = (scene, ctx) => {
  const c = scene.content;
  const title = c.title ? part(txt(ctx, "h2", "ls-title", c.title), "title") : null;
  const points = c.points.map((p, i) => h("li", { className: "ls-point" }, icon("check", 34), part(txt(ctx, "span", "", p), `point:${i}`)));
  const takeaway = c.takeaway ? part(txt(ctx, "p", "ls-takeaway", c.takeaway), "takeaway") : null;
  const root = h("div", { className: "ls-scene ls-t-summary" }, title, h("ul", { className: "ls-points" }, ...points), takeaway);
  const targets = c.points.map((_, i) => String(i + 1));

  return {
    root,
    update(lt, cs) {
      if (title) show(ctx, title, lt, 0, 14, emphasis(ctx, title, "title", cs));
      const at = schedule(targets, cs, ctx.words, ctx.dur);
      points.forEach((p, i) => show(ctx, p, lt, at[i]!, 22, emphasis(ctx, p, targets[i]!, cs)));
      if (takeaway) {
        const tAt = cs.at.get("takeaway") ?? Math.max(0, ctx.dur - 2.5);
        show(ctx, takeaway, lt, tAt, 26, emphasis(ctx, takeaway, "takeaway", cs));
      }
    },
  };
};
