// Rules and live sync against the Firestore emulator. Set LS_FIRESTORE_EMULATOR=127.0.0.1:8280 (npm run emulators); skipped otherwise.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, setDoc, updateDoc, writeBatch, type Firestore } from "firebase/firestore";
import { lessonDoc, newLesson, sceneDoc, type Lesson } from "@lessonstudio/ops";
import { createLesson, LessonSync, type SyncState } from "../src/sync.ts";

const host = process.env.LS_FIRESTORE_EMULATOR;
// Its own project: these tests clear all data, so they must never share the studio's demo project.
const PROJECT = "demo-lessonstudio-test";
let env: RulesTestEnvironment;

const lesson = (): Lesson => {
  const l = newLesson({ id: "l1", title: { en: "Sync", ar: "مزامنة" }, languages: [{ code: "en", name: "English" }, { code: "ar", name: "العربية" }], createdBy: "alice" }, "2026-10-27");
  l.scenes.scenes.push({ id: "s2", template: "steps", narration: { en: "One. Two.", ar: "واحد. اثنان." }, content: { steps: ["One", "Two"] } });
  return l;
};
const db = (uid: string): Firestore => env.authenticatedContext(uid).firestore() as unknown as Firestore;

async function until(fn: () => boolean, ms = 5000): Promise<void> {
  const t0 = Date.now();
  while (!fn()) {
    if (Date.now() - t0 > ms) throw new Error("timed out waiting");
    await new Promise((r) => setTimeout(r, 20));
  }
}
function open(uid: string, id = "l1"): { sync: LessonSync; state: () => SyncState } {
  const sync = new LessonSync(db(uid), id, { uid }).start();
  let s: SyncState = sync.state;
  sync.subscribe((x) => { s = x; });
  return { sync, state: () => s };
}
const narration = (s: SyncState, scene: string) => s.lesson?.scenes.scenes.find((x) => x.id === scene)?.narration.en;

beforeAll(async () => {
  if (!host) return;
  const [h, p] = host.split(":");
  env = await initializeTestEnvironment({ projectId: PROJECT, firestore: { host: h!, port: Number(p), rules: readFileSync("firebase/firestore.rules", "utf8") } });
});
afterAll(async () => { await env?.cleanup(); });

describe.skipIf(!host)("security rules", () => {
  beforeEach(async () => { await env.clearFirestore(); });

  it("lets an owner create a lesson, and keeps it from everyone else", async () => {
    await assertSucceeds(createLesson(db("alice"), "l1", lesson(), "alice"));
    await assertSucceeds(getDoc(doc(db("alice"), "lessons/l1")));
    await assertFails(getDoc(doc(db("bob"), "lessons/l1")));
    await assertFails(getDoc(doc(db("bob"), "lessons/l1/scenes/intro")));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore() as unknown as Firestore, "lessons/l1")));
    // Nobody creates a lesson in someone else's name.
    const l = lesson();
    await assertFails(setDoc(doc(db("bob"), "lessons/l2"), lessonDoc(l, { owner: "alice", members: [], rev: 1, createdAt: 1, now: 1, via: "studio" })));
  });

  it("only accepts whole batches with the next rev", async () => {
    const alice = db("alice");
    await createLesson(alice, "l1", lesson(), "alice");
    const ref = doc(alice, "lessons/l1");
    // A scene written without its lesson moving to the next rev.
    await assertFails(setDoc(doc(ref, "scenes/s2"), { json: "{}", rev: 2 }));
    // A lesson update that skips or repeats a rev.
    await assertFails(updateDoc(ref, { rev: 1, title: "x" }));
    await assertFails(updateDoc(ref, { rev: 3, title: "x" }));
    // Adding a member, or taking the lesson over.
    await assertFails(updateDoc(ref, { rev: 2, members: ["alice", "bob"] }));
    await assertFails(updateDoc(ref, { rev: 2, owner: "bob" }));
    // The right shape: lesson rev 2 with its scene and op log entry.
    const cur = (await getDoc(ref)).data()!;
    const b = writeBatch(alice);
    b.set(ref, { ...cur, rev: 2, sceneRevs: { ...cur.sceneRevs, s2: 2 } });
    b.set(doc(ref, "scenes/s2"), sceneDoc(lesson().scenes.scenes[1]!, 2));
    b.set(doc(ref, "ops/00000002"), { rev: 2, uid: "alice", via: "studio", ops: "[]", inverse: "[]", at: 1 });
    await assertSucceeds(b.commit());
    // Timings come from the server only; OAuth state is server only.
    await assertFails(setDoc(doc(ref, "timing/en"), { json: "{}", source: "aligned", rev: 2 }));
    await assertFails(getDoc(doc(alice, "oauth_clients/x")));
  });

  it("lets only the owner delete a lesson", async () => {
    await createLesson(db("alice"), "l1", lesson(), "alice");
    await env.withSecurityRulesDisabled(async (c) => { await updateDoc(doc(c.firestore() as unknown as Firestore, "lessons/l1"), { members: ["alice", "bob"] }); });
    await assertFails(deleteDoc(doc(db("bob"), "lessons/l1")));
    const alice = db("alice");
    const ref = doc(alice, "lessons/l1");
    const b = writeBatch(alice);
    b.delete(ref);
    b.delete(doc(ref, "scenes/intro"));
    b.delete(doc(ref, "scenes/s2"));
    await assertSucceeds(b.commit());
  });
});

describe.skipIf(!host)("live sync", () => {
  beforeEach(async () => {
    await env.clearFirestore();
    await createLesson(db("alice"), "l1", lesson(), "alice");
    await env.withSecurityRulesDisabled(async (c) => { await updateDoc(doc(c.firestore() as unknown as Firestore, "lessons/l1"), { members: ["alice", "bob"] }); });
  });

  it("two people editing at once both keep their changes", async () => {
    const a = open("alice");
    const b = open("bob");
    await until(() => !!a.state().lesson && !!b.state().lesson);
    expect(a.sync.edit([{ op: "setNarration", scene: "intro", lang: "en", text: "Alice wrote this." }])).toBeNull();
    expect(b.sync.edit([{ op: "setNarration", scene: "s2", lang: "en", text: "Bob wrote this." }])).toBeNull();
    await until(() => a.state().status === "saved" && b.state().status === "saved" && a.state().rev === 3 && b.state().rev === 3);
    for (const s of [a.state(), b.state()]) {
      expect(narration(s, "intro")).toBe("Alice wrote this.");
      expect(narration(s, "s2")).toBe("Bob wrote this.");
    }
    a.sync.stop();
    b.sync.stop();
  });

  it("shows an AI's edit as it lands, and says who made it", async () => {
    const a = open("alice");
    await until(() => !!a.state().lesson);
    // The MCP server commits with the Admin SDK; the same commit() shape, with rules bypassed.
    await env.withSecurityRulesDisabled(async (c) => {
      const fs = c.firestore() as unknown as Firestore;
      const { commit, lessonFromDocs, opId } = await import("@lessonstudio/ops");
      const ref = doc(fs, "lessons/l1");
      const d = (await getDoc(ref)).data() as import("@lessonstudio/ops").LessonDoc;
      const scenes: Record<string, import("@lessonstudio/ops").SceneDoc> = {};
      for (const id of d.order) scenes[id] = (await getDoc(doc(ref, "scenes", id))).data() as import("@lessonstudio/ops").SceneDoc;
      const cm = commit({ doc: d, lesson: lessonFromDocs(d, scenes) }, [{ op: "setNarration", scene: "s2", lang: "en", text: "Claude wrote this." }], { uid: "alice", via: "mcp:Claude" }, Date.now());
      const b = writeBatch(fs);
      b.set(ref, cm.doc);
      for (const [sid, sd] of cm.writes) b.set(doc(ref, "scenes", sid), sd);
      b.set(doc(ref, "ops", opId(cm.rev)), cm.op);
      await b.commit();
    });
    await until(() => narration(a.state(), "s2") === "Claude wrote this.");
    expect(a.state().remote).toMatchObject({ via: "mcp:Claude", scenes: ["s2"] });
    a.sync.stop();
  });

  it("undo and redo are stored like any edit", async () => {
    const a = open("alice");
    await until(() => !!a.state().lesson);
    a.sync.edit([{ op: "setNarration", scene: "intro", lang: "en", text: "Changed." }]);
    await until(() => a.state().status === "saved" && a.state().rev === 2);
    expect(a.sync.undo()).toBeNull();
    await until(() => a.state().status === "saved" && a.state().rev === 3);
    expect(narration(a.state(), "intro")).toBe("Sync.");
    expect(a.sync.redo()).toBeNull();
    await until(() => a.state().status === "saved" && a.state().rev === 4);
    const stored = await getDoc(doc(db("alice"), "lessons/l1/scenes/intro"));
    expect(JSON.parse(stored.data()!.json).narration.en).toBe("Changed.");
    a.sync.stop();
  });

  it("drops, and reports, an edit that no longer fits", async () => {
    const a = open("alice");
    const b = open("bob");
    await until(() => !!a.state().lesson && !!b.state().lesson);
    a.sync.edit([{ op: "removeScene", scene: "s2" }]);
    b.sync.edit([{ op: "setNarration", scene: "s2", lang: "en", text: "Too late." }]);
    await until(() => a.state().status === "saved" && b.state().status === "saved" && a.state().rev === b.state().rev && a.state().rev >= 2);
    const ids = (s: SyncState) => s.lesson!.scenes.scenes.map((x) => x.id);
    // Whoever saved first wins; the other side's edit was rebased or dropped, never half-applied.
    expect(ids(a.state())).toEqual(ids(b.state()));
    if (!ids(a.state()).includes("s2")) expect(b.state().dropped ?? "").toMatch(/no longer fit|No scene/);
    a.sync.stop();
    b.sync.stop();
  });
});
