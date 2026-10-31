import type { Dir, Element, Lang, Scene, Text } from "@lessonstudio/spec";
import type { Writer } from "../dom.ts";
import type { Labels } from "../labels.ts";
import type { Orient } from "../layout.ts";
import type { CueState } from "../motion.ts";
import type { Tier } from "../tier.ts";

export interface LocalWord { w: string; s: number; e: number }

/** What a template knows when it mounts. Word times are local to the scene. */
export interface Ctx {
  lang: Lang;
  dir: Dir;
  tier: Tier;
  orient: Orient;
  W: number;
  H: number;
  /** The scene's length in seconds. */
  dur: number;
  words: LocalWord[];
  wr: Writer;
  labels: Labels;
  /** Text in the lesson language (falling back to the default language). */
  t: (x: Text | undefined) => string;
  /** The stage canvas scenes are designed on (manifest.stage). */
  design: { W: number; H: number };
  /** Free elements mirror left and right (a right-to-left language, unless the scene opts out). */
  mirror: boolean;
  /** The scene that opens the lesson comes in without a transition. */
  first: boolean;
  /** How much the stage is scaled on screen (1 = logical pixels). */
  scale: number;
  /** A package path resolved to a URL. */
  url: (path: string) => string;
  /** The science kit, once loaded (only lessons with math, plot, net, arch or table elements load it). */
  kit?: Kit;
}

/** What a science element draws at a moment: the element's animated values (see AnimProp). */
export interface KitState {
  reveal: number; draw: number; frame: number; focus: number; pass: number;
  /** Seconds into the scene, for motion paced by the clock (current flowing in a wire). Still a pure function of time. */
  t: number;
}
/** Draws one science element into its positioned box and returns how to paint a moment. */
export type KitRenderer = (el: Element, box: HTMLElement, ctx: Ctx) => (s: KitState) => void;
export interface Kit { draw: Record<string, KitRenderer>; css: string }

/**
 * A mounted scene. `update` must set every animated property from `lt` and `cs` alone,
 * so the same time always gives the same frame (PLAN.md §6, §10).
 */
export interface Mounted {
  root: HTMLElement;
  update(lt: number, cs: CueState): void;
}

export type Template<S extends Scene = Scene> = (scene: S, ctx: Ctx) => Mounted;

export type SceneOf<T extends Scene["template"]> = Extract<Scene, { template: T }>;
