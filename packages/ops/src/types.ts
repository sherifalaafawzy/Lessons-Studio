import type { AnimProp, Asset, Cue, Element, Key, LanguageTrack, Manifest, Orient, Scene, ScenesFile, Text, Track, When } from "@lessonstudio/spec";

/** A lesson being edited: what the studio, the MCP server and the worker share. Timings live beside it. */
export interface Lesson {
  manifest: Manifest;
  scenes: ScenesFile;
}

/** Ready-made animations, expanded into keyframes (so the format stays plain keyframes). */
export type Preset =
  | "fade-in" | "fade-out" | "pop" | "rise" | "slide-in" | "grow" | "pulse"
  | "draw" | "type" | "move-to";

/**
 * One edit. Paths are JSON Pointers inside a scene ("/content/title/en", "/cues/0"); "-" appends to an array.
 * Every operation is checked when applied, and a batch applies whole or not at all.
 */
export type Op =
  /* lesson */
  | { op: "setMeta"; title?: Text; summary?: Text; brand?: string; stage?: Orient; level?: number; topic?: string; defaultLang?: string }
  | { op: "addLanguage"; code: string; name: string; dir?: "ltr" | "rtl"; quality?: LanguageTrack["quality"]; voice?: LanguageTrack["voice"] }
  | { op: "removeLanguage"; code: string }
  | { op: "attachAsset"; asset: Asset }
  | { op: "detachAsset"; path: string }
  /* scenes */
  | { op: "addScene"; scene: Scene; at?: number }
  | { op: "removeScene"; scene: string }
  | { op: "moveScene"; scene: string; to: number }
  | { op: "duplicateScene"; scene: string; id: string; at?: number }
  | { op: "replaceScene"; scene: string; value: Scene }
  | { op: "setNarration"; scene: string; lang: string; text: string }
  /* anything inside a scene */
  | { op: "set"; scene: string; path: string; value: unknown }
  | { op: "insert"; scene: string; path: string; value: unknown }
  | { op: "remove"; scene: string; path: string }
  /* cues */
  | { op: "addCue"; scene: string; cue: Cue }
  /* free elements */
  | { op: "addElement"; scene: string; element: Element; at?: number; parent?: string; overlay?: boolean }
  | { op: "updateElement"; scene: string; element: string; props: Record<string, unknown> }
  | { op: "removeElement"; scene: string; element: string }
  | { op: "moveElement"; scene: string; element: string; to: number }
  /* keyframes */
  | { op: "setKeyframe"; scene: string; element: string; prop: AnimProp; key: Key }
  | { op: "removeKeyframe"; scene: string; element: string; prop: AnimProp; at: When }
  | { op: "setTrack"; scene: string; element: string; prop: AnimProp; keys: Key[] | null }
  | { op: "animate"; scene: string; element: string; preset: Preset; at: When; dur?: number; to?: { x?: number; y?: number } }
  | { op: "setCamera"; scene: string; tracks: Track[] | null }
  /* undo records (also usable directly) */
  | { op: "replaceManifest"; value: Manifest }
  | { op: "restore"; lesson: Lesson };

export type OpName = Op["op"];

export class OpError extends Error {
  /** Which operation in the batch failed (0-based). */
  index: number;
  constructor(index: number, message: string) {
    super(`Operation ${index + 1}: ${message}`);
    this.index = index;
  }
}
