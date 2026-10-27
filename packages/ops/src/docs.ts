import type { Manifest, Scene, TimingFile } from "@lessonstudio/spec";
import { pick } from "@lessonstudio/spec";
import { applyOps } from "./apply.ts";
import type { Lesson, Op } from "./types.ts";

/**
 * How a lesson is stored in Firestore. JSON is kept as strings: nothing inside is indexed, arrays of
 * arrays are fine, and a change to one scene sends only that scene's document to whoever is watching.
 *
 * lessons/{id}                 LessonDoc
 * lessons/{id}/scenes/{scene}  SceneDoc
 * lessons/{id}/timing/{lang}   TimingDoc (measured timings, after narration; written by the server)
 * lessons/{id}/ops/{rev}       OpDoc (history, and undo across sessions)
 *
 * Every change bumps `rev` by one and writes the lesson document, the scenes it changed and its OpDoc in
 * one batch. `sceneRevs` says which rev each scene document is at, so a reader knows when it has a whole,
 * consistent lesson, and the security rules check that scene writes come with their lesson's rev.
 */
export interface LessonDoc {
  owner: string;
  /** Who may open and edit it; the owner is always in it. */
  members: string[];
  title: string;
  langs: string[];
  rev: number;
  createdAt: number;
  updatedAt: number;
  /** Who made the last change: "studio", "mcp:<client>" or "worker". */
  updatedVia: string;
  manifest: string;
  order: string[];
  sceneRevs: Record<string, number>;
  /** A random id per commit: a reader tells its own write coming back from someone else's. */
  commit?: string;
  status: "draft" | "published";
  publishedRev?: number;
}

export interface SceneDoc {
  json: string;
  rev: number;
}

export interface TimingDoc {
  json: string;
  source: TimingFile["source"];
  rev: number;
}

export interface OpDoc {
  rev: number;
  uid: string;
  via: string;
  ops: string;
  inverse: string;
  at: number;
}

export const titleOf = (m: Manifest): string => pick(m.title, m.defaultLang) || m.id;

/** The lesson document for a lesson that is being created (rev 1, every scene at rev 1). */
export function lessonDoc(lesson: Lesson, meta: { owner: string; members: string[]; rev: number; createdAt: number; now: number; via: string }): LessonDoc {
  return {
    owner: meta.owner,
    members: [...new Set([meta.owner, ...meta.members])],
    title: titleOf(lesson.manifest),
    langs: lesson.manifest.languages.map((l) => l.code),
    rev: meta.rev,
    createdAt: meta.createdAt,
    updatedAt: meta.now,
    updatedVia: meta.via,
    manifest: JSON.stringify(lesson.manifest),
    order: lesson.scenes.scenes.map((s) => s.id),
    sceneRevs: Object.fromEntries(lesson.scenes.scenes.map((s) => [s.id, meta.rev])),
    status: "draft",
  };
}

export const sceneDoc = (s: Scene, rev: number): SceneDoc => ({ json: JSON.stringify(s), rev });

/** Rebuilds a lesson from its documents. A scene in `order` without a document is an error. */
export function lessonFromDocs(doc: Pick<LessonDoc, "manifest" | "order">, scenes: Record<string, SceneDoc>): Lesson {
  return {
    manifest: JSON.parse(doc.manifest) as Manifest,
    scenes: {
      version: "0.2",
      scenes: doc.order.map((id) => {
        const s = scenes[id];
        if (!s) throw new Error(`Scene "${id}" is missing`);
        return JSON.parse(s.json) as Scene;
      }),
    },
  };
}

/**
 * True when the scene documents a reader holds are exactly the ones the lesson document names. Listeners on
 * a document and on its subcollection deliver separately; until this holds, the reader waits for the rest.
 */
export function consistent(doc: Pick<LessonDoc, "order" | "sceneRevs">, scenes: Record<string, SceneDoc>): boolean {
  return doc.order.every((id) => scenes[id] !== undefined && scenes[id]!.rev === (doc.sceneRevs?.[id] ?? scenes[id]!.rev));
}

export interface Commit {
  rev: number;
  lesson: Lesson;
  inverse: Op[];
  doc: LessonDoc;
  /** Scene documents to write. */
  writes: [string, SceneDoc][];
  /** Scene documents to delete. */
  deletes: string[];
  op: OpDoc;
}

/**
 * What a batch of operations writes, from the lesson as stored. The server (in a transaction) and the
 * studio (in a batch the security rules check) both commit through this, so they store edits the same way.
 */
export function commit(
  prev: { doc: LessonDoc; lesson: Lesson },
  ops: Op[],
  actor: { uid: string; via: string },
  now: number,
  id: string = globalThis.crypto.randomUUID(),
): Commit {
  const r = applyOps(prev.lesson, ops);
  const rev = prev.doc.rev + 1;
  const ids = r.lesson.scenes.scenes.map((s) => s.id);
  const old = prev.doc.sceneRevs ?? {};
  const sceneRevs: Record<string, number> = {};
  for (const id of ids) sceneRevs[id] = r.scenes.has(id) || old[id] === undefined ? rev : old[id]!;
  const writes: [string, SceneDoc][] = r.lesson.scenes.scenes.filter((s) => sceneRevs[s.id] === rev).map((s) => [s.id, sceneDoc(s, rev)]);
  const deletes = Object.keys(old).filter((id) => !ids.includes(id));
  const doc: LessonDoc = {
    ...prev.doc,
    title: titleOf(r.lesson.manifest),
    langs: r.lesson.manifest.languages.map((l) => l.code),
    rev,
    updatedAt: now,
    updatedVia: actor.via,
    manifest: JSON.stringify(r.lesson.manifest),
    order: ids,
    sceneRevs,
    commit: id,
  };
  const op: OpDoc = { rev, uid: actor.uid, via: actor.via, ops: JSON.stringify(ops), inverse: JSON.stringify(r.inverse), at: now };
  return { rev, lesson: r.lesson, inverse: r.inverse, doc, writes, deletes, op };
}

/** An op log document's id: zero-padded, so ids sort by rev. */
export const opId = (rev: number): string => String(rev).padStart(8, "0");
