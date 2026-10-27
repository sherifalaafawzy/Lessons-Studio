// Runs against the Firebase emulators (Firestore and Auth) when FIRESTORE_EMULATOR_HOST is set; skipped otherwise.
import { afterAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { initializeApp, deleteApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { newLesson, type Op } from "@lessonstudio/ops";
import { FirestoreStore } from "../src/stores/firestore.ts";
import { FileKv } from "../src/kv.ts";
import { loadConfig } from "../src/config.ts";
import { oauthCore } from "../src/oauth.ts";

const on = !!process.env.FIRESTORE_EMULATOR_HOST;
const PROJECT = "demo-lessonstudio";
let app: App | null = null;
const dirs: string[] = [];
afterAll(async () => {
  if (app) await deleteApp(app);
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});
const fb = (): App => (app ??= initializeApp({ projectId: PROJECT }, `test-${randomBytes(4).toString("hex")}`));

describe.skipIf(!on)("Firestore store (emulator)", () => {
  it("creates, edits in transactions, refuses stale and foreign edits, and undoes", async () => {
    const db = getFirestore(fb());
    const store = new FirestoreStore(db);
    const id = `t-${randomBytes(4).toString("hex")}`;
    const me = { uid: "u1", via: "studio" };
    const lesson = newLesson({ id, title: { en: "Cloud", ar: "سحابة" }, languages: [{ code: "en", name: "English" }, { code: "ar", name: "العربية" }], createdBy: "u1" }, "2026-10-27");
    await store.create(id, lesson, me);
    await expect(store.create(id, lesson, me)).rejects.toMatchObject({ code: "exists" });

    const add: Op[] = [
      { op: "addScene", scene: { id: "s2", template: "steps", narration: { en: "One. Two.", ar: "واحد. اثنان." }, content: { steps: ["One", "Two"] } } },
      { op: "addScene", scene: { id: "s3", template: "summary", narration: { en: "Done.", ar: "تم." }, content: { points: ["Done"] } } },
    ];
    const r = await store.apply(id, add, { uid: "u1", via: "mcp:claude" }, 1);
    expect(r.rev).toBe(2);
    await expect(store.apply(id, [{ op: "removeScene", scene: "s2" }], me, 1)).rejects.toMatchObject({ code: "conflict" });
    await expect(store.apply(id, [{ op: "removeScene", scene: "s2" }], { uid: "stranger", via: "studio" })).rejects.toMatchObject({ code: "forbidden" });
    await store.apply(id, [{ op: "removeScene", scene: "s2" }], me, 2);

    // Only changed scene documents are written; removed ones are deleted.
    const sceneIds = (await db.collection("lessons").doc(id).collection("scenes").get()).docs.map((d) => d.id).sort();
    expect(sceneIds).toEqual(["intro", "s3"]);

    const hist = await store.history(id, "u1");
    expect(hist.map((h) => h.via)).toEqual(["studio", "mcp:claude"]);
    const undo = await store.apply(id, JSON.parse(hist[0]!.inverse), me, 3);
    expect(undo.lesson.scenes.scenes.map((s) => s.id)).toEqual(["intro", "s2", "s3"]);
    const loaded = await store.get(id, "u1");
    expect(loaded.rev).toBe(4);
    expect(loaded.lesson).toEqual(undo.lesson);
    expect((await store.list("u1")).some((l) => l.id === id && l.updatedVia === "studio")).toBe(true);

    await store.setTiming(id, "en", { version: "0.1", lang: "en", source: "aligned", duration: 3, scenes: [] }, me);
    expect((await store.get(id, "u1")).timings.en?.source).toBe("aligned");
    await store.remove(id, "u1");
    await expect(store.get(id, "u1")).rejects.toMatchObject({ code: "not-found" });
  }, 30_000);
});

describe.skipIf(!on || !process.env.FIREBASE_AUTH_EMULATOR_HOST)("Google sign-in check (Auth emulator)", () => {
  it("lets only verified, allowlisted accounts approve", async () => {
    const auth = getAuth(fb());
    // The token the Auth emulator itself issues: unsigned, for our demo project. verifyIdToken accepts these
    // only in emulator mode, and still looks the user up there (we ask it to check revocation).
    const users = new Map<string, string>();
    const signIn = async (email: string): Promise<string> => {
      const u = await auth.getUser(users.get(email)!);
      const now = Math.floor(Date.now() / 1000);
      const part = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
      return `${part({ alg: "none", typ: "JWT" })}.${part({
        iss: `https://securetoken.google.com/${PROJECT}`, aud: PROJECT, sub: u.uid, user_id: u.uid, email: u.email,
        email_verified: u.emailVerified, auth_time: now, iat: now, exp: now + 3600, firebase: { identities: {}, sign_in_provider: "password" },
      })}.`;
    };
    const tag = randomBytes(3).toString("hex");
    const make = async (name: string, verified: boolean) => {
      const u = await auth.createUser({ email: `${name}-${tag}@example.com`, password: "secret-123", emailVerified: verified });
      users.set(u.email!, u.uid);
      return u;
    };
    const ok = await make("teacher", true);
    await make("other", true);
    await make("unverified", false);

    const dir = mkdtempSync(join(tmpdir(), "ls-kv-"));
    dirs.push(dir);
    const config = loadConfig({ LS_STORE: "file", LS_DATA_DIR: dir, LS_PUBLIC_URL: "https://studio.example.ngrok.app", MCP_TOKEN_SECRET: "x".repeat(40), LS_ALLOWED_EMAILS: `Teacher-${tag}@example.com,unverified-${tag}@example.com` });
    const core = oauthCore(config, new FileKv(dir), (t) => auth.verifyIdToken(t));
    expect(await core.identify({ idToken: await signIn(`teacher-${tag}@example.com`) })).toEqual({ uid: ok.uid, email: `teacher-${tag}@example.com` });
    expect(await core.identify({ idToken: await signIn(`other-${tag}@example.com`) })).toMatch(/isn't allowed/);
    expect(await core.identify({ idToken: await signIn(`unverified-${tag}@example.com`) })).toMatch(/isn't allowed/);
    expect(await core.identify({ idToken: "not-a-token" })).toMatch(/couldn't be checked/);
    expect(await core.identify({ passcode: "anything at all" })).toBe("Sign in first.");
  }, 30_000);
});
