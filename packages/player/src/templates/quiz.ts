import { h } from "../dom.ts";
import { icon } from "../icons.ts";
import { emphasis, part, show, txt } from "./common.ts";
import type { SceneOf, Template } from "./types.ts";

/** Shows the scene's question while it is read out. The player asks it for real when the scene ends. */
export const quiz: Template<SceneOf<"quiz">> = (scene, ctx) => {
  const check = scene.check;
  const kicker = h("p", { className: "ls-kicker" }, icon("spark", 26), " ", part(h("span", {}, ctx.t(scene.content.title) || ctx.labels.check), "title"));
  const prompt = part(txt(ctx, "h2", "ls-quiz-prompt", check?.prompt), "prompt");
  const options = (check?.options ?? []).map((o, i) =>
    h("li", { className: "ls-quiz-opt" }, h("span", { className: "ls-letter" }, ctx.labels.letters[i] ?? String(i + 1)), part(txt(ctx, "span", "", o.text), `option:${o.id}`)),
  );
  const root = h("div", { className: "ls-scene ls-t-quiz" }, kicker, prompt, h("ol", { className: "ls-quiz-opts" }, ...options));

  return {
    root,
    update(lt, cs) {
      show(ctx, kicker, lt, 0, 10);
      show(ctx, prompt, lt, 0.2, 18, emphasis(ctx, prompt, "prompt", cs));
      options.forEach((o, i) => {
        const id = check?.options[i]?.id ?? "";
        show(ctx, o, lt, Math.min(ctx.dur * 0.7, 1 + i * 0.25), 18, emphasis(ctx, o, id, cs));
      });
    },
  };
};
