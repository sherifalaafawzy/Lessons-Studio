// Lesson Studio's Cloud Functions (europe-west1):
// - saveAiKey, removeAiKey, aiKeyStatus: each person's own AI key, sealed (keys.ts); clients only ever see its status.
// - draftLesson: a brief becomes a checked lesson in the person's account, with their key (draft.ts).
// - mcp: the MCP server for AI apps, with OAuth sign-in, served at https://<project>.web.app/mcp through Hosting.
// - exportVideo: a lesson as an MP4 at 360p, 240p or 144p, rendered on the server (video.ts).
import { setGlobalOptions } from "firebase-functions/v2";
import { HttpsError, onCall, onRequest, type CallableRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import type { Express } from "express";
import GUIDE from "../../apps/server/src/guide.md";
import { FirestoreStore } from "../../apps/server/src/stores/firestore.ts";
import { keyShapeProblem, seal, statusOf, unseal, type Sealed } from "./keys.ts";
import { DRAFT_MODEL, GeminiError, checkKey, draftPrice, gemini } from "./gemini.ts";
import { DraftFailed, draft, readRequest, slug } from "./draft.ts";
import { readExport, renderVideo } from "./video.ts";
import { StoreError, toPackage } from "@lessonstudio/ops";

setGlobalOptions({ region: "europe-west1", maxInstances: 4 });
if (!getApps().length) initializeApp();
const db = getFirestore();

const AI_KEYS_SECRET = defineSecret("AI_KEYS_SECRET");
const MCP_TOKEN_SECRET = defineSecret("MCP_TOKEN_SECRET");

/** At most this many drafts per person per day: the key is theirs, but a stuck client shouldn't spend it. */
const DRAFTS_PER_DAY = 40;

interface KeyDoc { gemini?: Sealed & { last4: string; setAt: number }; drafts?: { day: string; n: number } }

function signedIn(req: CallableRequest): string {
  if (!req.auth?.uid) throw new HttpsError("unauthenticated", "Sign in first.");
  return req.auth.uid;
}
const keyRef = (uid: string) => db.collection("aiKeys").doc(uid);

export const aiKeyStatus = onCall(async (req) => {
  const uid = signedIn(req);
  const d = (await keyRef(uid).get()).data() as KeyDoc | undefined;
  return { gemini: statusOf(d?.gemini), model: DRAFT_MODEL, price: draftPrice() };
});

export const saveAiKey = onCall({ secrets: [AI_KEYS_SECRET] }, async (req) => {
  const uid = signedIn(req);
  const provider = String(req.data?.provider ?? "");
  const key = String(req.data?.key ?? "").trim();
  const shape = keyShapeProblem(provider, key);
  if (shape) throw new HttpsError("invalid-argument", shape);
  const ok = await checkKey(key);
  if (ok === "rejected") throw new HttpsError("invalid-argument", "Google didn't accept this key. Copy it again from aistudio.google.com/apikey or Google Cloud's Credentials page.");
  if (ok === "unreachable") throw new HttpsError("unavailable", "Couldn't reach Google to check the key. Try again in a minute.");
  const gemini = { ...seal(AI_KEYS_SECRET.value(), uid, key), last4: key.slice(-4), setAt: Date.now() };
  await keyRef(uid).set({ gemini }, { merge: true });
  return { gemini: statusOf(gemini) };
});

/** Chromium and ffmpeg need room: 8 GiB and 4 CPUs, one export at a time per instance. */
export const exportVideo = onCall({ timeoutSeconds: 900, memory: "8GiB", cpu: 4, concurrency: 1, maxInstances: 3 }, async (req) => {
  const uid = signedIn(req);
  const ask = readExport(req.data);
  if (typeof ask === "string") throw new HttpsError("invalid-argument", ask);
  let loaded;
  try {
    loaded = await new FirestoreStore(db).get(ask.lesson, uid);
  } catch (e) {
    if (e instanceof StoreError) throw new HttpsError(e.code === "forbidden" ? "permission-denied" : "not-found", e.message);
    throw e;
  }
  const pkg = toPackage(loaded.lesson, loaded.timings);
  if (!pkg.timing[ask.lang]) throw new HttpsError("invalid-argument", `The lesson has no ${ask.lang}.`);
  const { mp4, seconds } = await renderVideo(pkg, ask.lang, ask.size);
  return { name: `${ask.lesson}-${ask.lang}-${ask.size}p.mp4`, mp4: mp4.toString("base64"), bytes: mp4.length, seconds };
});

export const removeAiKey = onCall(async (req) => {
  const uid = signedIn(req);
  const { FieldValue } = await import("firebase-admin/firestore");
  await keyRef(uid).set({ gemini: FieldValue.delete() }, { merge: true });
  return { gemini: statusOf(undefined) };
});

export const draftLesson = onCall({ secrets: [AI_KEYS_SECRET], timeoutSeconds: 540, memory: "512MiB" }, async (req) => {
  const uid = signedIn(req);
  const r = readRequest(req.data);
  if (typeof r === "string") throw new HttpsError("invalid-argument", r);
  const today = new Date().toISOString().slice(0, 10);
  const key = await db.runTransaction(async (tx) => {
    const d = (await tx.get(keyRef(uid))).data() as KeyDoc | undefined;
    if (!d?.gemini) throw new HttpsError("failed-precondition", "Add your Gemini key in Settings first.");
    const n = d.drafts?.day === today ? d.drafts.n : 0;
    if (n >= DRAFTS_PER_DAY) throw new HttpsError("resource-exhausted", `That's ${DRAFTS_PER_DAY} drafts today; more tomorrow.`);
    tx.set(keyRef(uid), { drafts: { day: today, n: n + 1 } }, { merge: true });
    return unseal(AI_KEYS_SECRET.value(), uid, d.gemini);
  });
  const id = `${slug(r.topic)}-${Math.random().toString(36).slice(2, 6)}`;
  try {
    const out = await draft(r, { generate: gemini(key), guide: GUIDE, uid, id, model: DRAFT_MODEL });
    await new FirestoreStore(db).create(id, out.lesson, { uid, via: `ai:${DRAFT_MODEL}` });
    const price = draftPrice();
    const usd = (out.usage.input * price.input + out.usage.output * price.output) / 1e6;
    return { id, attempts: out.attempts, warnings: out.warnings.length, usage: out.usage, usd: Math.round(usd * 10000) / 10000 };
  } catch (e) {
    if (e instanceof DraftFailed) throw new HttpsError("aborted", `${e.message} Try again, or change the brief.`);
    if (e instanceof GeminiError) {
      if (e.status === 429) throw new HttpsError("resource-exhausted", "Gemini says this key is over its limit right now. Try again later, or check its quota in AI Studio.");
      if (e.status === 400 || e.status === 403) throw new HttpsError("permission-denied", `Gemini refused the request: ${e.message}`);
      throw new HttpsError("unavailable", `Gemini didn't answer: ${e.message}`);
    }
    throw e;
  }
});

// The MCP server: the same code as the desktop server (apps/server), with sign-in and the Firestore store.
// Its settings come from functions/.env.<project> (public URL, allowed accounts, the web config for sign-in).
let app: Promise<Express> | null = null;
async function mcpApp(): Promise<Express> {
  process.env.MCP_TOKEN_SECRET = MCP_TOKEN_SECRET.value();
  const { loadConfig } = await import("../../apps/server/src/config.ts");
  const { createHttpApp } = await import("../../apps/server/src/http.ts");
  const { secure } = await import("../../apps/server/src/oauth.ts");
  const config = loadConfig({ ...process.env, LS_STORE: "firestore", LS_TRUST_PROXY: "1" });
  const deps = { store: new FirestoreStore(db), config };
  return createHttpApp(deps, { secure: secure(deps), cloud: true });
}

export const mcp = onRequest({ secrets: [MCP_TOKEN_SECRET], timeoutSeconds: 120, memory: "512MiB", invoker: "public" }, async (req, res) => {
  const a = await (app ??= mcpApp().catch((e) => { app = null; throw e; }));
  a(req as never, res as never);
});
