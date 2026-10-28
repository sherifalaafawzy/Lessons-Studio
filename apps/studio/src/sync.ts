import { collection, doc, onSnapshot, writeBatch, type Firestore, type Unsubscribe } from "firebase/firestore";
import type { Lang, TimingFile } from "@lessonstudio/spec";
import {
  applyOps, commit, consistent, lessonDoc, lessonFromDocs, opId, rebase, sceneDoc, type Lesson, type LessonDoc, type Op, type Peaks, type SceneDoc, type TimingDoc,
} from "@lessonstudio/ops";

export type SyncStatus = "loading" | "saved" | "saving" | "error" | "gone";

export interface SyncState {
  /** What the editor shows: the stored lesson plus this person's edits not stored yet. */
  lesson: Lesson | null;
  rev: number;
  status: SyncStatus;
  error?: string;
  /** The last change someone else made (an AI through MCP, or another person). */
  remote?: { via: string; at: number; scenes: string[] };
  /** Set when edits couldn't be applied after someone else's change. */
  dropped?: string;
  /** Timings measured from the narration (lessons/{id}/timing/{lang}, written by the server), by language. */
  measured: Record<Lang, TimingFile>;
  /** The narration's waveform beside each measured timing, where the server drew one. */
  peaks: Record<Lang, Peaks>;
  canUndo: boolean;
  canRedo: boolean;
}

interface Outbox {
  id: string;
  ops: Op[];
  acked: boolean;
}

/**
 * One open lesson: live from Firestore, edited optimistically. Edits apply at once to what the editor shows,
 * then go to Firestore one batch at a time (packages/ops commit(), checked by the security rules). When
 * someone else changes the lesson first, the batch is refused, and the edits not yet stored are rebased on
 * the newer lesson and sent again. Undo and redo are edits too, so they sync like any other.
 */
export class LessonSync {
  private db: Firestore;
  private id: string;
  private actor: { uid: string; via: string };
  private now: () => number;
  private unsubs: Unsubscribe[] = [];
  private docData: LessonDoc | null = null;
  private sceneDocs: Record<string, SceneDoc> = {};
  private base: { doc: LessonDoc; lesson: Lesson } | null = null;
  private outbox: Outbox | null = null;
  private queued: Op[][] = [];
  private waitForSnapshot = false;
  private undoStack: { ops: Op[]; inverse: Op[] }[] = [];
  private redoStack: { ops: Op[]; inverse: Op[] }[] = [];
  private fns = new Set<(s: SyncState) => void>();
  state: SyncState = { lesson: null, rev: 0, status: "loading", measured: {}, peaks: {}, canUndo: false, canRedo: false };

  constructor(db: Firestore, id: string, actor: { uid: string; via?: string }, now: () => number = Date.now) {
    this.db = db;
    this.id = id;
    this.actor = { uid: actor.uid, via: actor.via ?? "studio" };
    this.now = now;
  }

  start(): this {
    const ref = doc(this.db, "lessons", this.id);
    this.unsubs.push(
      onSnapshot(ref, (s) => {
        if (!s.exists()) {
          this.set({ status: "gone", lesson: null });
          return;
        }
        this.docData = s.data() as LessonDoc;
        this.update();
      }, (e) => this.set({ status: "error", error: e.message })),
      onSnapshot(collection(ref, "scenes"), (s) => {
        for (const ch of s.docChanges()) {
          if (ch.type === "removed") delete this.sceneDocs[ch.doc.id];
          else this.sceneDocs[ch.doc.id] = ch.doc.data() as SceneDoc;
        }
        this.update();
      }, (e) => this.set({ status: "error", error: e.message })),
      onSnapshot(collection(ref, "timing"), (s) => {
        const measured = { ...this.state.measured };
        const peaks = { ...this.state.peaks };
        for (const ch of s.docChanges()) {
          const id = ch.doc.id;
          delete measured[id];
          delete peaks[id];
          if (ch.type === "removed") continue;
          const d = ch.doc.data() as TimingDoc;
          measured[id] = JSON.parse(d.json) as TimingFile;
          if (d.peaks) peaks[id] = d.peaks;
        }
        this.set({ measured, peaks });
      }, () => { /* without timings the lesson plays from estimates, silently */ }),
    );
    return this;
  }

  stop(): void {
    for (const u of this.unsubs) u();
    this.unsubs = [];
    this.fns.clear();
  }

  subscribe(fn: (s: SyncState) => void): () => void {
    this.fns.add(fn);
    fn(this.state);
    return () => this.fns.delete(fn);
  }

  private set(p: Partial<SyncState>): void {
    // Once the lesson is gone, a listener error (it's no longer readable) changes nothing.
    if (this.state.status === "gone" && p.status === "error") return;
    this.state = { ...this.state, ...p, canUndo: this.undoStack.length > 0, canRedo: this.redoStack.length > 0 };
    for (const fn of this.fns) fn(this.state);
  }

  /** A new snapshot: once the lesson document and its scenes agree, it becomes the base. */
  private update(): void {
    const d = this.docData;
    if (!d || !consistent(d, this.sceneDocs)) return;
    const prev = this.base;
    this.base = { doc: d, lesson: lessonFromDocs(d, this.sceneDocs) };
    const mine = this.outbox !== null && d.commit === this.outbox.id;
    if (prev && d.rev > prev.doc.rev && !mine && d.commit !== prev.doc.commit) {
      const scenes = Object.entries(d.sceneRevs ?? {}).filter(([, r]) => r === d.rev).map(([id]) => id);
      if (d.updatedVia !== this.actor.via || !this.outbox) this.set({ remote: { via: d.updatedVia, at: this.now(), scenes } });
    }
    if (mine && this.outbox!.acked) this.outbox = null;
    this.waitForSnapshot = false;
    this.recompute();
    this.flush();
  }

  /** The editor's view: the base plus edits not yet in it. Edits that no longer apply are dropped and reported. */
  private recompute(): void {
    if (!this.base) return;
    const included = this.outbox !== null && this.base.doc.commit === this.outbox.id;
    const batches = [...(this.outbox && !included ? [this.outbox.ops] : []), ...this.queued];
    const r = rebase(this.base.lesson, batches);
    if (r.dropped.length) {
      this.queued = this.queued.filter((b) => !r.dropped.some((d) => d.ops === b));
      this.set({ dropped: `${r.dropped.length} of your changes no longer fit after someone else's edit: ${r.dropped[0]!.error}` });
    }
    const busy = this.outbox !== null || this.queued.length > 0;
    this.set({ lesson: r.lesson, rev: this.base.doc.rev, status: busy ? "saving" : "saved" });
  }

  /** Applies operations now and stores them soon. Returns an error message, or null when they applied. */
  edit(ops: Op[], o: { undoable?: boolean } = {}): string | null {
    if (!this.state.lesson || !ops.length) return "The lesson isn't loaded yet";
    let r;
    try {
      r = applyOps(this.state.lesson, ops);
    } catch (e) {
      return (e as Error).message;
    }
    if (o.undoable !== false) {
      this.undoStack.push({ ops, inverse: r.inverse });
      if (this.undoStack.length > 100) this.undoStack.shift();
      this.redoStack = [];
    }
    this.queued.push(ops);
    this.set({ lesson: r.lesson, status: "saving", dropped: undefined });
    this.flush();
    return null;
  }

  undo(): string | null {
    const step = this.undoStack.pop();
    if (!step) return null;
    const err = this.edit(step.inverse, { undoable: false });
    if (err) {
      this.set({});
      return `Can't undo: ${err}`;
    }
    this.redoStack.push(step);
    this.set({});
    return null;
  }

  redo(): string | null {
    const step = this.redoStack.pop();
    if (!step) return null;
    const err = this.edit(step.ops, { undoable: false });
    if (err) {
      this.set({});
      return `Can't redo: ${err}`;
    }
    this.undoStack.push(step);
    this.set({});
    return null;
  }

  /** Sends the queued edits as one batch, when nothing else is on its way. */
  private flush(): void {
    if (this.outbox || !this.queued.length || !this.base || this.waitForSnapshot) return;
    const ops = this.queued.flat();
    let c;
    try {
      c = commit(this.base, ops, this.actor, this.now());
    } catch (e) {
      // They applied to the view but not to the stored lesson: someone's change got in between.
      this.queued = [];
      this.set({ dropped: `Some changes no longer fit: ${(e as Error).message}` });
      this.recompute();
      return;
    }
    const box: Outbox = { id: c.doc.commit!, ops, acked: false };
    this.outbox = box;
    this.queued = [];
    const ref = doc(this.db, "lessons", this.id);
    const b = writeBatch(this.db);
    b.set(ref, c.doc);
    for (const [sid, sd] of c.writes) b.set(doc(ref, "scenes", sid), sd);
    for (const sid of c.deletes) b.delete(doc(ref, "scenes", sid));
    b.set(doc(ref, "ops", opId(c.rev)), c.op);
    b.commit().then(
      () => {
        if (this.outbox !== box) return;
        box.acked = true;
        if (this.base?.doc.commit === box.id) {
          this.outbox = null;
          this.recompute();
          this.flush();
        }
      },
      (e: { code?: string; message?: string }) => {
        if (this.outbox !== box) return;
        // Refused (someone else saved first, so our rev was stale): try again on the newer lesson.
        this.outbox = null;
        this.queued.unshift(ops);
        if (e.code === "permission-denied" || e.code === "aborted" || e.code === "failed-precondition") {
          this.waitForSnapshot = true;
          this.recompute();
        } else {
          this.set({ status: "error", error: e.message ?? String(e) });
        }
      },
    );
  }
}

/** Creates a lesson document and its scenes in one batch (rev 1). */
export async function createLesson(db: Firestore, id: string, lesson: Lesson, uid: string, now = Date.now()): Promise<void> {
  const ref = doc(db, "lessons", id);
  const b = writeBatch(db);
  b.set(ref, lessonDoc(lesson, { owner: uid, members: [], rev: 1, createdAt: now, now, via: "studio" }));
  for (const s of lesson.scenes.scenes) b.set(doc(ref, "scenes", s.id), sceneDoc(s, 1));
  await b.commit();
}
