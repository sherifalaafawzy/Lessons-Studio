// Where the text on the stage lives in the scene, so it can be edited in place.
import type { Element, Lang, Scene, Text } from "@lessonstudio/spec";

/**
 * The JSON pointer (from the scene) of the text behind a template part, as the player marks it with
 * data-part: "title", "kicker", "hook", "takeaway", "prompt", "from", "subject", "link", "step:0",
 * "point:2", "line:1", "node:<id>", "edge:<index>", "flag:<id>", "option:<id>". Null when the scene has no such part.
 */
export function partPath(scene: Scene, part: string): string | null {
  const i = part.indexOf(":");
  const kind = i < 0 ? part : part.slice(0, i);
  const key = i < 0 ? "" : part.slice(i + 1);
  const index = (n: number): string | null => (Number.isInteger(Number(key)) && Number(key) >= 0 && Number(key) < n ? key : null);
  const at = (base: string, n: number, rest = ""): string | null => { const k = index(n); return k === null ? null : `${base}/${k}${rest}`; };
  switch (scene.template) {
    case "title-hook":
      return ["kicker", "title", "hook"].includes(kind) && !key ? `/content/${kind}` : null;
    case "steps":
      return kind === "title" ? "/content/title" : kind === "step" ? at("/content/steps", scene.content.steps.length) : null;
    case "summary":
      return kind === "title" || kind === "takeaway" ? `/content/${kind}` : kind === "point" ? at("/content/points", scene.content.points.length) : null;
    case "flow": {
      if (kind === "title") return "/content/title";
      if (kind === "edge") return at("/content/edges", scene.content.edges.length, "/label");
      const n = kind === "node" ? scene.content.nodes.findIndex((x) => x.id === key) : -1;
      return n < 0 ? null : `/content/nodes/${n}/label`;
    }
    case "message-mock": {
      if (["from", "subject", "link"].includes(kind) && !key) return `/content/${kind}`;
      if (kind === "line") return at("/content/lines", scene.content.lines.length);
      const f = kind === "flag" ? (scene.content.flags ?? []).findIndex((x) => x.id === key) : -1;
      return f < 0 ? null : `/content/flags/${f}/label`;
    }
    case "quiz": {
      if (kind === "title") return "/content/title";
      if (kind === "prompt") return scene.check ? "/check/prompt" : null;
      const o = kind === "option" ? (scene.check?.options ?? []).findIndex((x) => x.id === key) : -1;
      return o < 0 ? null : `/check/options/${o}/text`;
    }
    case "canvas":
      return null;
  }
}

/** The JSON pointer of a free element: in a canvas scene's elements or the scene's overlays, groups included. */
export function elementPath(scene: Scene, id: string): string | null {
  const find = (list: Element[] | undefined, base: string): string | null => {
    for (const [i, el] of (list ?? []).entries()) {
      if (el.id === id) return `${base}/${i}`;
      if (el.type === "group") {
        const inner = find(el.children, `${base}/${i}/children`);
        if (inner) return inner;
      }
    }
    return null;
  };
  return (scene.template === "canvas" ? find(scene.content.elements, "/content/elements") : null) ?? find(scene.overlays, "/overlays");
}

/**
 * `old` with `value` in one language. A text that was the same in every language becomes one per language,
 * so the other languages keep their words; a text that didn't exist starts with `value` in every language.
 */
export function setText(old: Text | undefined, lang: Lang, value: string, langs: Lang[]): Text {
  if (old === undefined) return Object.fromEntries(langs.map((l) => [l, value]));
  if (typeof old === "string") return Object.fromEntries(langs.map((l) => [l, l === lang ? value : old]));
  return { ...old, [lang]: value };
}
