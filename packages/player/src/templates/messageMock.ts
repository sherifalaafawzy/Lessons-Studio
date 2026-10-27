import { h } from "../dom.ts";
import { icon } from "../icons.ts";
import { schedule } from "../motion.ts";
import { emphasis, part, show, txt } from "./common.ts";
import type { SceneOf, Template } from "./types.ts";

/** A phone message or email, with its warning signs called out as the narration names them. */
export const messageMock: Template<SceneOf<"message-mock">> = (scene, ctx) => {
  const c = scene.content;
  const flags = c.flags ?? [];
  const from = h(
    "div",
    { className: "ls-msg-from" },
    h("span", { className: "ls-avatar" }, icon(c.kind === "email" ? "mail" : "user", 28)),
    part(txt(ctx, "span", "ls-msg-name", c.from), "from"),
    c.time ? h("span", { className: "ls-msg-time", dir: "ltr" }, c.time) : null,
  );
  const subject = c.subject ? part(txt(ctx, "p", "ls-msg-subject", c.subject), "subject") : null;
  const lines = c.lines.map((l, i) => part(txt(ctx, "p", "ls-msg-line", l), `line:${i}`));
  const link = c.link !== undefined ? part(h("p", { className: "ls-msg-line ls-msg-link", dir: "ltr" }, ctx.t(c.link)), "link") : null;
  const bubble = h("div", { className: "ls-bubble" }, subject, ...lines, link);
  const phone = h("div", { className: `ls-phone ls-kind-${c.kind}` }, from, bubble);

  const callouts = flags.map((f) => h("li", { className: "ls-callout" }, icon("warning", 30), part(txt(ctx, "span", "", f.label), `flag:${f.id}`)));
  const list = h("ul", { className: "ls-callouts" }, ...callouts);
  const root = h("div", { className: "ls-scene ls-t-message" }, phone, list);

  const lineEl = (line: number | "from" | "link"): HTMLElement | null =>
    line === "from" ? from : line === "link" ? link : lines[line] ?? null;
  const targets = flags.map((f) => f.id);

  return {
    root,
    update(lt, cs) {
      show(ctx, phone, lt, 0.05, 30);
      lines.forEach((l, i) => show(ctx, l, lt, 0.35 + i * 0.18, 8));
      if (link) show(ctx, link, lt, 0.35 + lines.length * 0.18, 8);
      const at = schedule(targets, cs, ctx.words, ctx.dur, 0.9, true);
      const flagged = new Set<HTMLElement>();
      flags.forEach((f, i) => {
        show(ctx, callouts[i]!, lt, at[i]!, 18, emphasis(ctx, callouts[i]!, f.id, cs));
        const el = lineEl(f.line);
        if (el && lt >= at[i]!) flagged.add(el);
      });
      for (const el of [from, link, ...lines]) if (el) ctx.wr.cls(el, "is-flag", flagged.has(el));
      ctx.wr.cls(from, "is-hi", cs.hi.has("from"));
      if (link) ctx.wr.cls(link, "is-hi", cs.hi.has("link"));
    },
  };
};
