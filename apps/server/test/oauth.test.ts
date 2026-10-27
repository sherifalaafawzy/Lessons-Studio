import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHash, randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { loadConfig } from "../src/config.ts";
import { createHttpApp } from "../src/http.ts";
import { secure } from "../src/oauth.ts";
import { FileStore } from "../src/stores/file.ts";

const PORT = 45000 + Math.floor(Math.random() * 5000);
const BASE = `http://127.0.0.1:${PORT}`;
const PASSCODE = "correct horse battery";
const REDIRECT = "http://127.0.0.1:9999/callback";
let server: Server;
let dir: string;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "ls-oauth-"));
  const config = loadConfig({
    LS_STORE: "file", LS_DATA_DIR: dir, LS_PUBLIC_URL: BASE, MCP_TOKEN_SECRET: randomBytes(32).toString("hex"),
    LS_APPROVE_PASSCODE: PASSCODE, LS_LOCAL_UID: "owner-1",
  });
  const deps = { store: new FileStore(dir), config };
  const app = createHttpApp(deps, { secure: secure(deps) });
  await new Promise<void>((ok) => { server = app.listen(PORT, "127.0.0.1", () => ok()); });
  await new Promise((ok) => setTimeout(ok, 200));
});
afterAll(() => {
  server?.close();
  rmSync(dir, { recursive: true, force: true });
});

const pkce = () => {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
};
const form = (o: Record<string, string>) => ({ method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(o).toString() });
const json = (o: unknown) => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(o) });

async function register(): Promise<string> {
  const r = await fetch(`${BASE}/register`, json({ client_name: "Test AI", redirect_uris: [REDIRECT] }));
  expect(r.status).toBe(201);
  return (await r.json()).client_id;
}

/** Runs the browser part: open the approval page, approve with the passcode, return the redirect. */
async function authorize(clientId: string, challenge: string, proof: Record<string, unknown> = { passcode: PASSCODE }) {
  const q = new URLSearchParams({ response_type: "code", client_id: clientId, redirect_uri: REDIRECT, code_challenge: challenge, code_challenge_method: "S256", state: "xyz", resource: `${BASE}/mcp`, scope: "lessons" });
  const page = await fetch(`${BASE}/authorize?${q}`);
  expect(page.status).toBe(200);
  expect(page.headers.get("x-frame-options")).toBe("DENY");
  const html = await page.text();
  expect(html).toContain("Test AI wants to build lessons for you");
  const sealed = /const sealed = ("[^"]+")/.exec(html)![1]!;
  return fetch(`${BASE}/authorize/approve`, json({ request: JSON.parse(sealed), ...proof }));
}

describe("sign-in for online MCP clients", () => {
  it("publishes discovery documents and challenges anonymous calls", async () => {
    const prm = await (await fetch(`${BASE}/.well-known/oauth-protected-resource/mcp`)).json();
    expect(prm.resource).toBe(`${BASE}/mcp`);
    expect(prm.authorization_servers).toEqual([BASE]);
    const as = await (await fetch(`${BASE}/.well-known/oauth-authorization-server`)).json();
    expect(as.code_challenge_methods_supported).toEqual(["S256"]);
    expect(as.registration_endpoint).toBe(`${BASE}/register`);
    const anon = await fetch(`${BASE}/mcp`, json({ jsonrpc: "2.0", id: 1, method: "tools/list" }));
    expect(anon.status).toBe(401);
    expect(anon.headers.get("www-authenticate")).toContain("resource_metadata=");
  });

  it("signs in with PKCE, then the token works for MCP and refreshes once", async () => {
    const clientId = await register();
    const { verifier, challenge } = pkce();
    expect((await authorize(clientId, challenge, { passcode: "wrong passcode!!" })).status).toBe(403);
    const approved = await (await authorize(clientId, challenge)).json();
    const redirect = new URL(approved.redirect);
    expect(redirect.origin + redirect.pathname).toBe(REDIRECT);
    expect(redirect.searchParams.get("state")).toBe("xyz");
    expect(redirect.searchParams.get("iss")).toBe(BASE);
    const code = redirect.searchParams.get("code")!;

    const bad = await fetch(`${BASE}/token`, form({ grant_type: "authorization_code", code, client_id: clientId, redirect_uri: REDIRECT, code_verifier: pkce().verifier }));
    expect(bad.status).toBe(400);
    // A failed attempt used the code up: it's single use.
    const reused = await fetch(`${BASE}/token`, form({ grant_type: "authorization_code", code, client_id: clientId, redirect_uri: REDIRECT, code_verifier: verifier }));
    expect((await reused.json()).error).toBe("invalid_grant");

    const fresh = pkce();
    const code2 = new URL((await (await authorize(clientId, fresh.challenge)).json()).redirect).searchParams.get("code")!;
    const tok = await (await fetch(`${BASE}/token`, form({ grant_type: "authorization_code", code: code2, client_id: clientId, redirect_uri: REDIRECT, code_verifier: fresh.verifier }))).json();
    expect(tok.token_type).toBe("Bearer");

    const client = new Client({ name: "test", version: "1" });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${BASE}/mcp`), { requestInit: { headers: { authorization: `Bearer ${tok.access_token}` } } }));
    const made = await client.callTool({ name: "create_lesson", arguments: { title: "Online", languages: [{ code: "en", name: "English" }] } });
    expect(made.isError).toBeFalsy();
    const list = await client.callTool({ name: "list_lessons", arguments: {} });
    const lessons = JSON.parse((list.content as { text: string }[])[0]!.text);
    expect(lessons.map((l: { id: string; updatedVia: string }) => [l.id, l.updatedVia])).toEqual([["online", "mcp:Test AI"]]);
    await client.close();

    const r1 = await (await fetch(`${BASE}/token`, form({ grant_type: "refresh_token", refresh_token: tok.refresh_token, client_id: clientId }))).json();
    expect(r1.access_token).toBeTruthy();
    const r2 = await fetch(`${BASE}/token`, form({ grant_type: "refresh_token", refresh_token: tok.refresh_token, client_id: clientId }));
    expect((await r2.json()).error).toBe("invalid_grant");
  });

  it("refuses forged tokens, unknown redirects and tampered requests", async () => {
    const forged = await fetch(`${BASE}/mcp`, { ...json({ jsonrpc: "2.0", id: 1, method: "tools/list" }), headers: { "content-type": "application/json", authorization: "Bearer eyJhbGciOiJIUzI1NiJ9.e30.x" } });
    expect(forged.status).toBe(401);
    const clientId = await register();
    const q = new URLSearchParams({ response_type: "code", client_id: clientId, redirect_uri: "https://evil.example/cb", code_challenge: pkce().challenge, code_challenge_method: "S256" });
    const r = await fetch(`${BASE}/authorize?${q}`, { redirect: "manual" });
    expect(r.status).toBe(400);
    const plain = new URLSearchParams({ response_type: "code", client_id: clientId, redirect_uri: REDIRECT, code_challenge: "x", code_challenge_method: "plain", state: "s" });
    const noPkce = await fetch(`${BASE}/authorize?${plain}`, { redirect: "manual" });
    expect(noPkce.status).toBe(303);
    expect(noPkce.headers.get("location")).toContain("error=invalid_request");
    const tampered = await fetch(`${BASE}/authorize/approve`, json({ request: "eyJ4IjoxfQ.forged", passcode: PASSCODE }));
    expect(tampered.status).toBe(400);
    const badReg = await fetch(`${BASE}/register`, json({ client_name: "x", redirect_uris: ["http://evil.example/cb"] }));
    expect(badReg.status).toBe(400);
  });
});
