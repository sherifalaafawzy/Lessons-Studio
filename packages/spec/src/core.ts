/**
 * What the player needs at run time, without the validator (and the science parsers it pulls in): a light entry,
 * @lessonstudio/spec/core, so the core player and its science kit share as little as possible.
 */
export * from "./types.ts";
export { pick, dirOf, hasText, normalizeWord, splitWords } from "./text.ts";
export { findWord, resolveCues, resolveWhen, type ResolvedCue } from "./cues.ts";
export { walkElements, SCIENCE_TYPES, relPathOk, PACKS, PACK_IDS, PACK_TYPES, packOf, packsUsed, type PackId } from "./elements.ts";
export { captionChunks, toVtt, vttTime, transcript, type CaptionChunk } from "./captions.ts";
export {
  CAST, MOODS, DEFAULT_LIBRARY, LIBRARY_ICONS, LIBRARY_ICONS_PATH, MARK_PATH, castPath, isIcon, isLibPath, needsLibraryIcon,
  type CastMember, type Mood, type LibraryIcon,
} from "./library.ts";
