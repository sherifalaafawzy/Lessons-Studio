import type { Lang, TimingFile } from "@lessonstudio/spec";
import { applyOps, clone } from "./apply.ts";
import { titleOf, type OpDoc } from "./docs.ts";
import type { Lesson, Op } from "./types.ts";

/** Who is making a change, and through what: "studio", "mcp:<client name>" or "worker". */
export interface Actor {
  uid: string;
  via: string;
}

export interface LessonSummary {
  id: string;
  title: string;
  langs: string[];
  rev: number;
  updatedAt: number;
  updatedVia: string;
  status: "draft" | "published";
}

export interface Loaded {
  id: string;
  lesson: Lesson;
  rev: number;
  owner: string;
  members: string[];
  timings: Record<Lang, TimingFile>;
}

export class StoreError extends Error {
  code: "not-found" | "forbidden" | "conflict" | "exists";
  constructor(code: StoreError["code"], message: string) {
    super(message);
    this.code = code;
  }
}

/** Where lessons live. Firestore in the server (apps/server); MemoryStore for tests. */
export interface LessonStore {
  list(uid: string): Promise<LessonSummary[]>;
  get(id: string, uid: string): Promise<Loaded>;
  create(id: string, lesson: Lesson, actor: Actor): Promise<Loaded>;
  /** Applies a batch atomically. With `expectRev`, refuses (conflict) when someone else changed the lesson first. */
  apply(id: string, ops: Op[], actor: Actor, expectRev?: number): Promise<{ rev: number; lesson: Lesson; inverse: Op[] }>;
  setTiming(id: string, lang: Lang, timing: TimingFile | null, actor: Actor): Promise<void>;
  history(id: string, uid: string, limit?: number): Promise<OpDoc[]>;
  remove(id: string, uid: string): Promise<void>;
}

interface Entry {
  lesson: Lesson;
  rev: number;
  owner: string;
  members: string[];
  createdAt: number;
  updatedAt: number;
  updatedVia: string;
  timings: Record<Lang, TimingFile>;
  ops: OpDoc[];
}

/** Keeps lessons in memory, with the same rules as the Firestore store. */
export class MemoryStore implements LessonStore {
  private lessons = new Map<string, Entry>();
  private now: () => number;

  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  private entry(id: string, uid: string): Entry {
    const e = this.lessons.get(id);
    if (!e) throw new StoreError("not-found", `No lesson "${id}"`);
    if (!e.members.includes(uid)) throw new StoreError("forbidden", `Not allowed to open "${id}"`);
    return e;
  }

  async list(uid: string): Promise<LessonSummary[]> {
    return [...this.lessons.entries()]
      .filter(([, e]) => e.members.includes(uid))
      .map(([id, e]) => ({
        id, title: titleOf(e.lesson.manifest), langs: e.lesson.manifest.languages.map((l) => l.code),
        rev: e.rev, updatedAt: e.updatedAt, updatedVia: e.updatedVia, status: "draft" as const,
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async get(id: string, uid: string): Promise<Loaded> {
    const e = this.entry(id, uid);
    return { id, lesson: clone(e.lesson), rev: e.rev, owner: e.owner, members: [...e.members], timings: clone(e.timings) };
  }

  async create(id: string, lesson: Lesson, actor: Actor): Promise<Loaded> {
    if (this.lessons.has(id)) throw new StoreError("exists", `There is already a lesson "${id}"`);
    const now = this.now();
    this.lessons.set(id, {
      lesson: clone(lesson), rev: 1, owner: actor.uid, members: [actor.uid], createdAt: now, updatedAt: now,
      updatedVia: actor.via, timings: {}, ops: [],
    });
    return this.get(id, actor.uid);
  }

  async apply(id: string, ops: Op[], actor: Actor, expectRev?: number) {
    const e = this.entry(id, actor.uid);
    if (expectRev !== undefined && expectRev !== e.rev) throw new StoreError("conflict", `The lesson changed (now rev ${e.rev}, you had ${expectRev})`);
    const r = applyOps(e.lesson, ops);
    e.lesson = r.lesson;
    e.rev++;
    e.updatedAt = this.now();
    e.updatedVia = actor.via;
    e.ops.push({ rev: e.rev, uid: actor.uid, via: actor.via, ops: JSON.stringify(ops), inverse: JSON.stringify(r.inverse), at: e.updatedAt });
    return { rev: e.rev, lesson: clone(r.lesson), inverse: r.inverse };
  }

  async setTiming(id: string, lang: Lang, timing: TimingFile | null, actor: Actor): Promise<void> {
    const e = this.entry(id, actor.uid);
    if (timing) e.timings[lang] = clone(timing);
    else delete e.timings[lang];
  }

  async history(id: string, uid: string, limit = 50): Promise<OpDoc[]> {
    return this.entry(id, uid).ops.slice(-limit).reverse();
  }

  async remove(id: string, uid: string): Promise<void> {
    const e = this.entry(id, uid);
    if (e.owner !== uid) throw new StoreError("forbidden", "Only the owner can delete a lesson");
    this.lessons.delete(id);
  }
}
