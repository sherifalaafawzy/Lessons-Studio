import type { Firestore } from "firebase-admin/firestore";
import type { Lang, TimingFile } from "@lessonstudio/spec";
import {
  commit, lessonDoc, lessonFromDocs, opId, sceneDoc, StoreError, type Actor, type Lesson, type LessonDoc, type LessonStore,
  type LessonSummary, type Loaded, type Op, type OpDoc, type SceneDoc, type TimingDoc,
} from "@lessonstudio/ops";

/**
 * Lessons in Firestore, in the shapes packages/ops/src/docs.ts describes. Every change is one transaction
 * with a rev check, writing only the documents that changed, so a studio watching the lesson receives just those.
 */
export class FirestoreStore implements LessonStore {
  private db: Firestore;
  private now: () => number;

  constructor(db: Firestore, now: () => number = Date.now) {
    this.db = db;
    this.now = now;
  }

  private ref(id: string) {
    if (!/^[a-z0-9][a-z0-9-]{1,63}$/.test(id)) throw new StoreError("not-found", `No lesson "${id}"`);
    return this.db.collection("lessons").doc(id);
  }

  private member(doc: LessonDoc | undefined, id: string, uid: string): LessonDoc {
    if (!doc) throw new StoreError("not-found", `No lesson "${id}"`);
    if (!doc.members.includes(uid)) throw new StoreError("forbidden", `Not allowed to open "${id}"`);
    return doc;
  }

  async list(uid: string): Promise<LessonSummary[]> {
    const snap = await this.db.collection("lessons").where("members", "array-contains", uid).limit(200).get();
    return snap.docs
      .map((d) => {
        const x = d.data() as LessonDoc;
        return { id: d.id, title: x.title, langs: x.langs, rev: x.rev, updatedAt: x.updatedAt, updatedVia: x.updatedVia, status: x.status };
      })
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async get(id: string, uid: string): Promise<Loaded> {
    const ref = this.ref(id);
    const [doc, scenes, timing] = await Promise.all([ref.get(), ref.collection("scenes").get(), ref.collection("timing").get()]);
    const d = this.member(doc.data() as LessonDoc | undefined, id, uid);
    const sc: Record<string, SceneDoc> = {};
    for (const s of scenes.docs) sc[s.id] = s.data() as SceneDoc;
    const timings: Record<Lang, TimingFile> = {};
    for (const t of timing.docs) timings[t.id] = JSON.parse((t.data() as TimingDoc).json) as TimingFile;
    return { id, lesson: lessonFromDocs(d, sc), rev: d.rev, owner: d.owner, members: d.members, timings };
  }

  async create(id: string, lesson: Lesson, actor: Actor): Promise<Loaded> {
    const ref = this.ref(id);
    await this.db.runTransaction(async (tx) => {
      if ((await tx.get(ref)).exists) throw new StoreError("exists", `There is already a lesson "${id}"`);
      const now = this.now();
      tx.create(ref, lessonDoc(lesson, { owner: actor.uid, members: [], rev: 1, createdAt: now, now, via: actor.via }));
      for (const s of lesson.scenes.scenes) tx.set(ref.collection("scenes").doc(s.id), sceneDoc(s, 1));
    });
    return this.get(id, actor.uid);
  }

  async apply(id: string, ops: Op[], actor: Actor, expectRev?: number) {
    const ref = this.ref(id);
    return this.db.runTransaction(async (tx) => {
      const [doc, scenes] = await Promise.all([tx.get(ref), tx.get(ref.collection("scenes"))]);
      const d = this.member(doc.data() as LessonDoc | undefined, id, actor.uid);
      if (expectRev !== undefined && expectRev !== d.rev) throw new StoreError("conflict", `The lesson changed (now rev ${d.rev}, you had ${expectRev})`);
      const sc: Record<string, SceneDoc> = {};
      for (const s of scenes.docs) sc[s.id] = s.data() as SceneDoc;
      // The same commit the studio makes, so both store edits the same way.
      const c = commit({ doc: d, lesson: lessonFromDocs(d, sc) }, ops, actor, this.now());
      tx.set(ref, c.doc);
      for (const [sid, sd] of c.writes) tx.set(ref.collection("scenes").doc(sid), sd);
      // Scene documents no longer in the lesson, including strays a whole-lesson undo leaves behind.
      const keep = new Set(c.doc.order);
      for (const s of scenes.docs) if (!keep.has(s.id)) tx.delete(s.ref);
      tx.set(ref.collection("ops").doc(opId(c.rev)), c.op);
      return { rev: c.rev, lesson: c.lesson, inverse: c.inverse };
    });
  }

  async setTiming(id: string, lang: Lang, timing: TimingFile | null, actor: Actor): Promise<void> {
    const ref = this.ref(id);
    const d = this.member((await ref.get()).data() as LessonDoc | undefined, id, actor.uid);
    const t = ref.collection("timing").doc(lang);
    if (timing) await t.set({ json: JSON.stringify(timing), source: timing.source, rev: d.rev } satisfies TimingDoc);
    else await t.delete();
  }

  async history(id: string, uid: string, limit = 50): Promise<OpDoc[]> {
    const ref = this.ref(id);
    this.member((await ref.get()).data() as LessonDoc | undefined, id, uid);
    const snap = await ref.collection("ops").orderBy("rev", "desc").limit(limit).get();
    return snap.docs.map((d) => d.data() as OpDoc);
  }

  async remove(id: string, uid: string): Promise<void> {
    const ref = this.ref(id);
    const d = this.member((await ref.get()).data() as LessonDoc | undefined, id, uid);
    if (d.owner !== uid) throw new StoreError("forbidden", "Only the owner can delete a lesson");
    await this.db.recursiveDelete(ref);
  }
}
