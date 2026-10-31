/**
 * A design.json body from a technology pack: turns the storyboard's spec into elements on the scene's body box, timed
 * to its sentences. Sentence numbers count from 0, as sentences.ts prints them.
 */
import type { Element, Lang, Text, When } from "../../../packages/spec/src/index.ts";

/** Text in a design: one string for both languages (numbers only), or { en, "ar-EG" }. */
export type AText = string | Record<string, string>;

export interface BodyCtx {
  /** The moment sentence k starts in every language (each on its own word), plus an offset in seconds. */
  at(k: number, offset?: number): When;
  /** Sentences in the scene. */
  n: number;
  /** A design text as the lesson's Text (English and Egyptian Arabic); throws when a language is missing. */
  T(t: AText, what: string): Text;
  /** The lesson's languages, e.g. ["en", "ar-EG"]. */
  langs: Lang[];
  /** Where the body goes: the whole width under the headline. */
  box: { x: number; y: number; w: number; h: number };
  /** "<lesson> scene <n>", for error messages. */
  where: string;
}

/** Builds a body's elements. Throw an Error naming `c.where` when the spec is wrong. */
export type BodyBuilder = (spec: unknown, c: BodyCtx) => Element[];
