import type { Dir, Lang, Scene, Text } from "@lessonstudio/spec";
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
}

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
