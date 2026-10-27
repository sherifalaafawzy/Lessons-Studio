import { mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { Lang, TimingFile } from "@lessonstudio/spec";
import { applyOps, clone, StoreError, titleOf, type Actor, type Lesson, type LessonStore, type LessonSummary, type Loaded, type Op, type OpDoc } from "@lessonstudio/ops";

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

const ID = /^[a-z0-9][a-z0-9-]{1,63}$/;

/** Lessons as JSON files on this PC (.data/lessons), for working before the Firebase project exists. */
export class FileStore implements LessonStore {
  private dir: string;
  private now: () => number;

  constructor(dataDir: string, now: () => number = Date.now) {
    this.dir = join(dataDir, "lessons");
    this.now = now;
    mkdirSync(this.dir, { recursive: true });
  }

  private path(id: string): string {
    if (!ID.test(id)) throw new StoreError("not-found", `No lesson "${id}"`);
    return join(this.dir, `${id}.json`);
  }

  private read(id: string, uid: string): Entry {
    const p = this.path(id);
    if (!existsSync(p)) throw new StoreError("not-found", `No lesson "${id}"`);
    const e = JSON.parse(readFileSync(p, "utf8")) as Entry;
    if (!e.members.includes(uid)) throw new StoreError("forbidden", `Not allowed to open "${id}"`);
    return e;
  }

  /** Writes through a temporary file, so a crash never leaves half a lesson. */
  private write(id: string, e: Entry): void {
    const p = this.path(id);
    writeFileSync(`${p}.tmp`, JSON.stringify(e));
    renameSync(`${p}.tmp`, p);
  }

  async list(uid: string): Promise<LessonSummary[]> {
    const out: LessonSummary[] = [];
    for (const f of readdirSync(this.dir).filter((n) => n.endsWith(".json"))) {
      const e = JSON.parse(readFileSync(join(this.dir, f), "utf8")) as Entry;
      if (!e.members.includes(uid)) continue;
      out.push({
        id: f.slice(0, -5), title: titleOf(e.lesson.manifest), langs: e.lesson.manifest.languages.map((l) => l.code),
        rev: e.rev, updatedAt: e.updatedAt, updatedVia: e.updatedVia, status: "draft",
      });
    }
    return out.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async get(id: string, uid: string): Promise<Loaded> {
    const e = this.read(id, uid);
    return { id, lesson: e.lesson, rev: e.rev, owner: e.owner, members: e.members, timings: e.timings };
  }

  async create(id: string, lesson: Lesson, actor: Actor): Promise<Loaded> {
    if (existsSync(this.path(id))) throw new StoreError("exists", `There is already a lesson "${id}"`);
    const now = this.now();
    this.write(id, { lesson: clone(lesson), rev: 1, owner: actor.uid, members: [actor.uid], createdAt: now, updatedAt: now, updatedVia: actor.via, timings: {}, ops: [] });
    return this.get(id, actor.uid);
  }

  async apply(id: string, ops: Op[], actor: Actor, expectRev?: number) {
    const e = this.read(id, actor.uid);
    if (expectRev !== undefined && expectRev !== e.rev) throw new StoreError("conflict", `The lesson changed (now rev ${e.rev}, you had ${expectRev})`);
    const r = applyOps(e.lesson, ops);
    e.lesson = r.lesson;
    e.rev++;
    e.updatedAt = this.now();
    e.updatedVia = actor.via;
    e.ops.push({ rev: e.rev, uid: actor.uid, via: actor.via, ops: JSON.stringify(ops), inverse: JSON.stringify(r.inverse), at: e.updatedAt });
    e.ops = e.ops.slice(-200);
    this.write(id, e);
    return { rev: e.rev, lesson: r.lesson, inverse: r.inverse };
  }

  async setTiming(id: string, lang: Lang, timing: TimingFile | null, actor: Actor): Promise<void> {
    const e = this.read(id, actor.uid);
    if (timing) e.timings[lang] = timing;
    else delete e.timings[lang];
    this.write(id, e);
  }

  async history(id: string, uid: string, limit = 50): Promise<OpDoc[]> {
    return this.read(id, uid).ops.slice(-limit).reverse();
  }

  async remove(id: string, uid: string): Promise<void> {
    const e = this.read(id, uid);
    if (e.owner !== uid) throw new StoreError("forbidden", "Only the owner can delete a lesson");
    rmSync(this.path(id));
  }
}
