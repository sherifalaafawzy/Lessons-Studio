// The functions on the local emulators: AI keys, drafting with a stand-in for Gemini, and the MCP server.
// Set LS_FUNCTIONS_EMULATOR=1 with `npm run emulators` running (Auth 9399, Firestore 8280, Functions 5401); skipped otherwise.
import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GALLERY } from "../../apps/studio/src/presets.ts";

const on = !!process.env.LS_FUNCTIONS_EMULATOR;
const PROJECT = "demo-lessonstudio";
const FN = `http://127.0.0.1:5401/${PROJECT}/europe-west1`;
const FIRESTORE = `http://127.0.0.1:8280/v1/projects/${PROJECT}/databases/(default)/documents`;
const KEY = "AIzaSyStandInKeyForTests0123456789";

const scenes = ["title", "sms", "quiz", "summary"].map((id, i) => GALLERY.find((g) => g.id === id)!.make({ id: `s${i + 1}`, langs: ["en", "ar"], stage: "landscape" }));
const draftJson = JSON.stringify({ title: { en: "Spot a scam", ar: "اكتشف الاحتيال" }, summary: { en: "Signs of a scam", ar: "علامات الاحتيال" }, scenes });

let stub: Server;
const seen: { path: string; key: string | undefined }[] = [];

/** A test account, with access to the private studio (the `studio` claim) unless `access` is false. */
async function signUp(access = true): Promise<{ token: string; uid: string }> {
  const AUTH = "http://127.0.0.1:9399/identitytoolkit.googleapis.com/v1";
  const post = (url: string, body: unknown, headers: Record<string, string> = {}) =>
    fetch(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) }).then((r) => r.json());
  const email = `fn-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`;
  const j = (await post(`${AUTH}/accounts:signUp?key=demo-key`, { email, password: "secret-123", returnSecureToken: true })) as { idToken: string; localId: string };
  if (!access) return { token: j.idToken, uid: j.localId };
  // As the Admin SDK would (the emulator accepts "owner"), then sign in again for a token that carries the claim.
  await post(`${AUTH}/projects/demo-lessonstudio/accounts:update`, { localId: j.localId, customAttributes: JSON.stringify({ studio: true }) }, { authorization: "Bearer owner" });
  const k = (await post(`${AUTH}/accounts:signInWithPassword?key=demo-key`, { email, password: "secret-123", returnSecureToken: true })) as { idToken: string };
  return { token: k.idToken, uid: j.localId };
}
async function callFn(name: string, data: unknown, token?: string): Promise<{ result?: any; error?: { status: string; message: string } }> {
  const r = await fetch(`${FN}/${name}`, { method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ data }) });
  return (await r.json()) as never;
}
const owner = { authorization: "Bearer owner" };

describe.skipIf(!on)("functions on the emulators", () => {
  beforeAll(async () => {
    // A stand-in for Gemini: accepts KEY, and answers every draft with a clean lesson.
    stub = createServer((req, res) => {
      seen.push({ path: req.url ?? "", key: req.headers["x-goog-api-key"] as string | undefined });
      const ok = req.headers["x-goog-api-key"] === KEY;
      res.setHeader("content-type", "application/json");
      if (!ok) { res.statusCode = 400; res.end(JSON.stringify({ error: { message: "API key not valid" } })); return; }
      if (req.method === "GET") { res.end(JSON.stringify({ name: "models/gemini-3.8-flash" })); return; }
      res.end(JSON.stringify({ candidates: [{ content: { parts: [{ text: draftJson }] } }], usageMetadata: { promptTokenCount: 12000, candidatesTokenCount: 4000, thoughtsTokenCount: 2000 } }));
    });
    await new Promise<void>((r) => stub.listen(4599, "127.0.0.1", () => r()));
  });
  afterAll(() => { stub?.close(); });

  it("only signed-in people with access to the studio can use them", async () => {
    expect((await callFn("aiKeyStatus", {})).error?.status).toBe("UNAUTHENTICATED");
    expect((await callFn("draftLesson", { topic: "x" })).error?.status).toBe("UNAUTHENTICATED");
    const { token } = await signUp(false);
    for (const name of ["aiKeyStatus", "saveAiKey", "draftLesson", "exportVideo"]) expect((await callFn(name, {}, token)).error?.status).toBe("PERMISSION_DENIED");
  });

  it("a key is checked, stored sealed, shown only as its last four characters, and removed", async () => {
    const { token, uid } = await signUp();
    expect((await callFn("aiKeyStatus", {}, token)).result.gemini).toEqual({ set: false });
    const bad = await callFn("saveAiKey", { provider: "gemini", key: "AIzaSyWrongKeyForTests000000000000" }, token);
    expect(bad.error?.message).toContain("didn't accept");
    const saved = await callFn("saveAiKey", { provider: "gemini", key: KEY }, token);
    expect(saved.result.gemini).toMatchObject({ set: true, last4: "6789" });
    const status = await callFn("aiKeyStatus", {}, token);
    expect(JSON.stringify(status)).not.toContain(KEY.slice(0, 20));
    // In Firestore the key is sealed, and no client can read it.
    const doc = await (await fetch(`${FIRESTORE}/aiKeys/${uid}`, { headers: owner })).text();
    expect(doc).not.toContain(KEY.slice(4, 20));
    expect(doc).toContain("tag");
    const asClient = await fetch(`${FIRESTORE}/aiKeys/${uid}`, { headers: { authorization: `Bearer ${token}` } });
    expect(asClient.status).toBe(403);
    expect((await callFn("removeAiKey", {}, token)).result.gemini).toEqual({ set: false });
  });

  it("drafting needs a key, then stores a checked lesson in the person's account", async () => {
    const { token, uid } = await signUp();
    const brief = { topic: "Spot a scam message", languages: [{ code: "en", name: "English" }, { code: "ar", name: "العربية" }], seconds: 90 };
    expect((await callFn("draftLesson", brief, token)).error?.message).toContain("Settings");
    await callFn("saveAiKey", { provider: "gemini", key: KEY }, token);
    const out = await callFn("draftLesson", brief, token);
    expect(out.error).toBeUndefined();
    expect(out.result).toMatchObject({ attempts: 1, usage: { input: 12000, output: 6000 } });
    expect(out.result.usd).toBeCloseTo((12000 * 0.75 + 6000 * 3.75) / 1e6, 4);
    expect(seen.some((s) => s.path.includes(":generateContent") && s.key === KEY)).toBe(true);
    const lesson = (await (await fetch(`${FIRESTORE}/lessons/${out.result.id}`, { headers: owner })).json()) as { fields: Record<string, any> };
    expect(lesson.fields.owner.stringValue).toBe(uid);
    expect(lesson.fields.updatedVia.stringValue).toBe("ai:gemini-3.8-flash");
    expect(lesson.fields.order.arrayValue.values.length).toBe(4);
  });

  it("the MCP server answers, and asks AI apps to sign in", async () => {
    const health = await fetch(`${FN}/mcp/health`);
    expect(await health.json()).toMatchObject({ ok: true, store: "firestore", public: true });
    const r = await fetch(`${FN}/mcp/mcp`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) });
    expect(r.status).toBe(401);
    expect(r.headers.get("www-authenticate")).toContain("resource_metadata");
    const meta = await fetch(`${FN}/mcp/.well-known/oauth-authorization-server`);
    expect(((await meta.json()) as { code_challenge_methods_supported: string[] }).code_challenge_methods_supported).toEqual(["S256"]);
  });
});
