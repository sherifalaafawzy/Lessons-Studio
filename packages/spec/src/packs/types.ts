/**
 * The element types of the technology packs, as one union, and the shape of a pack's validator. Each pack defines its
 * elements in packs/<id>/types.ts and checks them in packs/<id>/check.ts.
 */
import type { Lang, Text } from "../types.ts";
import type { CodePackElement } from "./code/types.ts";
import type { DataPackElement } from "./data/types.ts";
import type { IotPackElement } from "./iot/types.ts";
import type { NetworkPackElement } from "./network/types.ts";
import type { OptPackElement } from "./opt/types.ts";

export type PackElement = CodePackElement | DataPackElement | IotPackElement | NetworkPackElement | OptPackElement;

/** What a pack's validator gets: report errors and warnings at paths; `text` checks a Text for every lesson language. */
export interface PackCheckCtx {
  langs: Lang[];
  err: (code: string, path: string, detail?: string) => void;
  warn: (code: string, path: string, detail?: string) => void;
  text: (v: Text | undefined, path: string, required?: boolean) => void;
  /** The brand tones an element may use. */
  tones: readonly string[];
}
/** Checks one element of the pack's types (`q` is its path, e.g. "scenes[2].content.elements[1]"). */
export type PackCheck = (el: { type: string } & Record<string, unknown>, q: string, c: PackCheckCtx) => void;
