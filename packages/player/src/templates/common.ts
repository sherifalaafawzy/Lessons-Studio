import type { Text } from "@lessonstudio/spec";
import { h, rich, units } from "../dom.ts";
import { enter, fix, pulseScale, type CueState } from "../motion.ts";
import type { Ctx } from "./types.ts";

/**
 * Marks an element as an editable part of the scene's content (editors find it with player.parts()):
 * "title", "kicker", "hook", "takeaway", "prompt", "from", "subject", "link", or kind:key such as "step:0",
 * "point:2", "line:1", "node:<id>", "edge:<index>", "flag:<id>", "option:<id>".
 */
export function part<E extends HTMLElement>(el: E, id: string): E {
  el.dataset.part = id;
  return el;
}

/** A block of text in the lesson language, with Latin runs isolated in right-to-left text. */
export function txt(ctx: Ctx, tag: "p" | "h1" | "h2" | "h3" | "span" | "div", cls: string, value: Text | undefined): HTMLElement {
  return h(tag, { className: cls }, ...rich(ctx.t(value), ctx.dir === "rtl"));
}

/** Text split into word spans for kinetic type. Spaces stay plain text nodes. */
export function kinetic(ctx: Ctx, tag: "h1" | "h2" | "p", cls: string, value: Text | undefined): { el: HTMLElement; words: HTMLElement[] } {
  const words: HTMLElement[] = [];
  const el = h(tag, { className: cls });
  for (const u of units(ctx.t(value), ctx.dir === "rtl")) {
    const only = u[0];
    if (u.length === 1 && only && only.nodeType === 3 && !only.textContent?.trim()) {
      el.append(only);
      continue;
    }
    const span = h("span", { className: "ls-word" }, ...u);
    words.push(span);
    el.append(span);
  }
  return { el, words };
}

/** Fades and lifts an element in. Every call sets both properties. */
export function show(ctx: Ctx, el: Element, lt: number, at: number, lift = 22, extraScale = 1): number {
  const p = enter(lt, at, ctx.tier);
  ctx.wr.style(el, "opacity", fix(p));
  const y = (1 - p) * lift;
  ctx.wr.style(el, "transform", y || extraScale !== 1 ? `translateY(${fix(y, 1)}px) scale(${fix(extraScale)})` : "none");
  return p;
}

/** Highlight class and pulse scale for a target. */
export function emphasis(ctx: Ctx, el: Element, target: string, cs: CueState): number {
  ctx.wr.cls(el, "is-hi", cs.hi.has(target));
  return pulseScale(cs.pulse.get(target));
}
