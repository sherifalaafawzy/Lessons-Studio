// Sign-in for online MCP clients (ChatGPT, claude.ai, and any client reaching the server through ngrok).
// The MCP SDK verifies tokens but doesn't issue them, so this is a small OAuth 2.1 authorization server:
// dynamic client registration (RFC 7591) and client ID metadata documents, the authorization code flow with
// PKCE (S256 only), single-use codes, short-lived signed access tokens and rotating refresh tokens.
// People sign in with a Google account through Firebase Auth, and only allowlisted emails may approve.
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import express, { type Express, type Request, type RequestHandler, type Response } from "express";
import { SignJWT, jwtVerify } from "jose";
import { getOAuthProtectedResourceMetadataUrl, mcpAuthMetadataRouter, requireBearerAuth } from "@modelcontextprotocol/express";
import { OAuthError, OAuthErrorCode, type AuthInfo, type OAuthMetadata } from "@modelcontextprotocol/server";
import type { Config } from "./config.ts";
import { openKv, type Kv } from "./kv.ts";
import type { Deps } from "./mcp.ts";

const SCOPE = "lessons";
const ACCESS_TTL_S = 3600;
const REFRESH_TTL_MS = 30 * 24 * 3600 * 1000;
const CODE_TTL_MS = 60 * 1000;
const REQUEST_TTL_MS = 10 * 60 * 1000;

interface Client {
  client_id: string;
  client_name: string;
  redirect_uris: string[];
  token_endpoint_auth_method: "none" | "client_secret_post" | "client_secret_basic";
  secretHash?: string;
}
interface Code { clientId: string; redirectUri: string; challenge: string; uid: string; email: string; scope: string; resource: string }
interface Refresh { clientId: string; client: string; uid: string; scope: string; resource: string }
interface Who { uid: string; email: string }

const sha = (s: string): string => createHash("sha256").update(s).digest("hex");
const token = (): string => randomBytes(32).toString("base64url");
const same = (a: string, b: string): boolean => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};
const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** A redirect URI a client may register: https anywhere, or http on this machine (desktop clients). */
function redirectOk(u: string): boolean {
  try {
    const x = new URL(u);
    if (x.hash) return false;
    if (x.protocol === "https:") return true;
    return x.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(x.hostname);
  } catch {
    return false;
  }
}

/** Tiny fixed-window limiter per client address. */
function limiter(perMinute: number): RequestHandler {
  const hits = new Map<string, { n: number; at: number }>();
  return (req, res, next) => {
    const k = req.ip ?? "?";
    const now = Date.now();
    const h = hits.get(k);
    if (!h || now - h.at > 60_000) hits.set(k, { n: 1, at: now });
    else if (++h.n > perMinute) {
      res.status(429).json({ error: "slow_down", error_description: "Too many requests; try again in a minute." });
      return;
    }
    next();
  };
}

export interface OAuthParts {
  metadata: OAuthMetadata;
  verify(token: string): Promise<AuthInfo>;
  /** Exchanges an approved identity for a code (exported for tests). */
  issueCode(req: Record<string, string>, who: Who): Promise<string>;
}

export function oauthCore(config: Config, kv: Kv, verifyIdToken?: (t: string) => Promise<{ uid: string; email?: string; email_verified?: boolean }>) {
  const pub = config.publicUrl!;
  const resource = `${pub}/mcp`;
  const key = new TextEncoder().encode(config.tokenSecret!);
  const sign = (data: string): string => createHmac("sha256", config.tokenSecret!).update(data).digest("base64url");

  const metadata: OAuthMetadata = {
    issuer: pub,
    authorization_endpoint: `${pub}/authorize`,
    token_endpoint: `${pub}/token`,
    registration_endpoint: `${pub}/register`,
    scopes_supported: [SCOPE],
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
    code_challenge_methods_supported: ["S256"],
    client_id_metadata_document_supported: true,
    authorization_response_iss_parameter_supported: true,
  } as OAuthMetadata;

  /** A registered client, or one identified by its metadata document URL (fetched, https only). */
  async function client(id: string): Promise<Client | null> {
    if (/^https:\/\//.test(id)) {
      const cached = await kv.get<Client>("cimd", sha(id));
      if (cached) return cached;
      const u = new URL(id);
      if (/^(localhost|\d+\.\d+\.\d+\.\d+|\[.*\])$/.test(u.hostname)) return null;
      const r = await fetch(id, { signal: AbortSignal.timeout(5000), redirect: "error", headers: { accept: "application/json" } }).catch(() => null);
      if (!r?.ok) return null;
      const text = await r.text();
      if (text.length > 10_000) return null;
      let doc: { client_id?: string; client_name?: string; redirect_uris?: string[] };
      try { doc = JSON.parse(text); } catch { return null; }
      if (doc.client_id !== id || !Array.isArray(doc.redirect_uris) || !doc.redirect_uris.every(redirectOk)) return null;
      const c: Client = { client_id: id, client_name: String(doc.client_name ?? u.hostname).slice(0, 80), redirect_uris: doc.redirect_uris, token_endpoint_auth_method: "none" };
      await kv.put("cimd", sha(id), c, 10 * 60 * 1000);
      return c;
    }
    return kv.get<Client>("clients", id);
  }

  async function register(body: Record<string, unknown>): Promise<Record<string, unknown>> {
    const uris = body.redirect_uris;
    if (!Array.isArray(uris) || !uris.length || uris.length > 10 || !uris.every((u) => typeof u === "string" && redirectOk(u))) {
      throw new OAuthError("invalid_redirect_uri", "redirect_uris must be https URLs, or http on localhost");
    }
    const method = (body.token_endpoint_auth_method ?? "none") as Client["token_endpoint_auth_method"];
    if (!["none", "client_secret_post", "client_secret_basic"].includes(method)) throw new OAuthError("invalid_client_metadata", "Unsupported token_endpoint_auth_method");
    const c: Client = {
      client_id: `c_${randomBytes(16).toString("hex")}`,
      client_name: String(body.client_name ?? "An MCP client").slice(0, 80),
      redirect_uris: uris as string[],
      token_endpoint_auth_method: method,
    };
    let secret: string | undefined;
    if (method !== "none") {
      secret = token();
      c.secretHash = sha(secret);
    }
    await kv.put("clients", c.client_id, c);
    return {
      client_id: c.client_id, client_name: c.client_name, redirect_uris: c.redirect_uris, token_endpoint_auth_method: method,
      grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], client_id_issued_at: Math.floor(Date.now() / 1000),
      ...(secret ? { client_secret: secret, client_secret_expires_at: 0 } : {}),
    };
  }

  /** Checks an authorization request; returns the cleaned parameters, or why it's refused. */
  async function checkAuthorize(q: Record<string, unknown>): Promise<{ ok: true; params: Record<string, string>; client: Client } | { ok: false; error: string; redirect?: string }> {
    const s = (k: string): string => (typeof q[k] === "string" ? (q[k] as string) : "");
    const c = await client(s("client_id"));
    if (!c) return { ok: false, error: "Unknown client." };
    const redirectUri = s("redirect_uri") || (c.redirect_uris.length === 1 ? c.redirect_uris[0]! : "");
    // Never redirect to an address the client didn't register.
    if (!c.redirect_uris.includes(redirectUri)) return { ok: false, error: "That redirect address isn't registered for this client." };
    const back = (error: string): { ok: false; error: string; redirect: string } => {
      const u = new URL(redirectUri);
      u.searchParams.set("error", error);
      if (s("state")) u.searchParams.set("state", s("state"));
      u.searchParams.set("iss", pub);
      return { ok: false, error, redirect: u.href };
    };
    if (s("response_type") !== "code") return back("unsupported_response_type");
    if (s("code_challenge_method") !== "S256" || !/^[A-Za-z0-9_-]{43,128}$/.test(s("code_challenge"))) return back("invalid_request");
    const res = s("resource");
    if (res && res.replace(/\/$/, "") !== resource && res.replace(/\/$/, "") !== pub) return back("invalid_target");
    const scope = s("scope") || SCOPE;
    if (!scope.split(" ").every((x) => x === SCOPE)) return back("invalid_scope");
    return {
      ok: true, client: c,
      params: { client_id: c.client_id, redirect_uri: redirectUri, code_challenge: s("code_challenge"), state: s("state"), scope, resource },
    };
  }

  async function issueCode(p: Record<string, string>, who: Who): Promise<string> {
    const code = token();
    const rec: Code = { clientId: p.client_id!, redirectUri: p.redirect_uri!, challenge: p.code_challenge!, uid: who.uid, email: who.email, scope: p.scope!, resource };
    await kv.put("codes", sha(code), rec, CODE_TTL_MS);
    const u = new URL(p.redirect_uri!);
    u.searchParams.set("code", code);
    if (p.state) u.searchParams.set("state", p.state);
    u.searchParams.set("iss", pub);
    return u.href;
  }

  /** The signed copy of an authorization request that the approval page posts back, so it can't be altered. */
  const seal = (p: Record<string, string>): string => {
    const body = Buffer.from(JSON.stringify({ ...p, t: Date.now() })).toString("base64url");
    return `${body}.${sign(body)}`;
  };
  const unseal = (v: string): Record<string, string> | null => {
    const [body, mac] = v.split(".");
    if (!body || !mac || !same(mac, sign(body))) return null;
    const p = JSON.parse(Buffer.from(body, "base64url").toString()) as Record<string, string> & { t: number };
    return Date.now() - Number(p.t) > REQUEST_TTL_MS ? null : p;
  };

  async function identify(body: Record<string, unknown>): Promise<Who | string> {
    if (typeof body.passcode === "string" && config.approvePasscode) {
      return same(body.passcode, config.approvePasscode) ? { uid: config.localUid, email: "passcode" } : "That passcode isn't right.";
    }
    if (typeof body.idToken === "string" && verifyIdToken) {
      try {
        const t = await verifyIdToken(body.idToken);
        const email = (t.email ?? "").toLowerCase();
        if (!t.email_verified || !(config.allowedEmails.includes("*") || config.allowedEmails.includes(email))) return `${email || "This account"} isn't allowed to use Lesson Studio.`;
        return { uid: t.uid, email };
      } catch {
        return "The sign-in couldn't be checked; try again.";
      }
    }
    return "Sign in first.";
  }

  async function tokens(c: { client_id: string; client_name: string }, uid: string, scope: string, aud: string) {
    const access = await new SignJWT({ cid: c.client_id, cn: c.client_name, scope })
      .setProtectedHeader({ alg: "HS256", typ: "at+jwt" })
      .setIssuer(pub).setAudience(aud).setSubject(uid).setIssuedAt().setExpirationTime(`${ACCESS_TTL_S}s`)
      .sign(key);
    const refresh = token();
    await kv.put("refresh", sha(refresh), { clientId: c.client_id, client: c.client_name, uid, scope, resource: aud } satisfies Refresh, REFRESH_TTL_MS);
    return { access_token: access, token_type: "Bearer", expires_in: ACCESS_TTL_S, refresh_token: refresh, scope };
  }

  /** Client authentication at the token endpoint. */
  async function authClient(req: Request): Promise<Client | null> {
    let id = String(req.body?.client_id ?? "");
    let secret = typeof req.body?.client_secret === "string" ? req.body.client_secret : undefined;
    const basic = /^Basic (.+)$/i.exec(req.headers.authorization ?? "");
    if (basic) {
      const [u, p] = Buffer.from(basic[1]!, "base64").toString().split(":");
      id = decodeURIComponent(u ?? "");
      secret = decodeURIComponent(p ?? "");
    }
    const c = await client(id);
    if (!c) return null;
    if (c.token_endpoint_auth_method === "none") return c;
    return secret && c.secretHash && same(sha(secret), c.secretHash) ? c : null;
  }

  async function tokenEndpoint(req: Request, res: Response): Promise<void> {
    res.set("Cache-Control", "no-store");
    const fail = (status: number, error: string, desc: string) => { res.status(status).json({ error, error_description: desc }); };
    const c = await authClient(req);
    if (!c) return fail(401, "invalid_client", "Unknown client or wrong secret");
    const b = req.body ?? {};
    if (b.grant_type === "authorization_code") {
      const code = await kv.take<Code>("codes", sha(String(b.code ?? "")));
      if (!code || code.clientId !== c.client_id) return fail(400, "invalid_grant", "The code is unknown, used or expired");
      if (b.redirect_uri !== undefined && b.redirect_uri !== code.redirectUri) return fail(400, "invalid_grant", "redirect_uri doesn't match");
      const verifier = String(b.code_verifier ?? "");
      if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier) || !same(createHash("sha256").update(verifier).digest("base64url"), code.challenge)) {
        return fail(400, "invalid_grant", "PKCE check failed");
      }
      res.json(await tokens(c, code.uid, code.scope, code.resource));
      return;
    }
    if (b.grant_type === "refresh_token") {
      // Rotation: a refresh token works once and is replaced.
      const r = await kv.take<Refresh>("refresh", sha(String(b.refresh_token ?? "")));
      if (!r || r.clientId !== c.client_id) return fail(400, "invalid_grant", "The refresh token is unknown, used or expired");
      res.json(await tokens(c, r.uid, r.scope, r.resource));
      return;
    }
    fail(400, "unsupported_grant_type", "Use authorization_code or refresh_token");
  }

  async function verify(t: string): Promise<AuthInfo> {
    try {
      const { payload } = await jwtVerify(t, key, { issuer: pub, audience: resource, algorithms: ["HS256"], typ: "at+jwt" });
      return {
        token: t, clientId: String(payload.cid), scopes: String(payload.scope ?? "").split(" ").filter(Boolean),
        expiresAt: payload.exp!, resource: new URL(resource), extra: { uid: payload.sub, client: payload.cn },
      };
    } catch {
      throw new OAuthError(OAuthErrorCode.InvalidToken, "The access token is invalid or expired");
    }
  }

  return { metadata, resource, register, checkAuthorize, issueCode, seal, unseal, identify, tokenEndpoint, verify };
}

function approvalPage(config: Config, clientName: string, sealed: string, nonce: string): string {
  const fb = config.firebaseWeb;
  const google = fb
    ? `<button id="google" type="button">Sign in with Google</button>
<script type="module" nonce="${nonce}">
import { initializeApp } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js";
const auth = getAuth(initializeApp(${JSON.stringify({ apiKey: fb.apiKey, authDomain: fb.authDomain, projectId: fb.projectId })}));
document.getElementById("google").onclick = async () => {
  try { const c = await signInWithPopup(auth, new GoogleAuthProvider()); window.approve({ idToken: await c.user.getIdToken() }); }
  catch (e) { window.say("Sign-in didn't finish: " + (e.code || e.message)); }
};
</script>`
    : "";
  const pass = config.approvePasscode
    ? `<form id="pass"><label>Passcode <input name="passcode" type="password" autocomplete="current-password" required minlength="12"></label> <button>Approve</button></form>`
    : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sign in to Lesson Studio</title>
<style>body{font:16px system-ui,sans-serif;max-width:480px;margin:10vh auto;padding:0 16px;color:#1e1a33;background:#f4f1ea}
h1{font-size:22px}button{font:inherit;padding:10px 16px;border-radius:10px;border:2px solid #1e1a33;background:#ff6a2b;cursor:pointer}
#deny{background:#fff}#msg{min-height:1.4em;color:#a8340a}input{font:inherit;padding:8px}</style></head><body>
<h1>${esc(clientName)} wants to build lessons for you</h1>
<p>It will be able to read, create and edit your Lesson Studio lessons.</p>
${google}${pass}${!google && !pass ? "<p>Sign-in isn't set up on this server yet.</p>" : ""}
<p><button id="deny" type="button">Don't allow</button></p><p id="msg" role="status"></p>
<script nonce="${nonce}">
const sealed = ${JSON.stringify(sealed)};
window.say = (t) => { document.getElementById("msg").textContent = t; };
window.approve = async (proof) => {
  const r = await fetch("/authorize/approve", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ request: sealed, ...proof }) });
  const j = await r.json();
  if (j.redirect) location.href = j.redirect; else window.say(j.error || "That didn't work.");
};
document.getElementById("deny").onclick = () => window.approve({ deny: true });
const f = document.getElementById("pass");
if (f) f.onsubmit = (e) => { e.preventDefault(); window.approve({ passcode: new FormData(f).get("passcode") }); };
</script></body></html>`;
}

/** Adds the OAuth routes and returns the gate for /mcp (main.ts passes this to createHttpApp). */
export function secure({ config }: Deps): (app: Express) => RequestHandler {
  return (app) => {
    app.set("trust proxy", config.trustProxy);
    let core: ReturnType<typeof oauthCore> | null = null;
    const ready = (async () => {
      const kv = await openKv(config);
      let verifyIdToken: ((t: string) => Promise<{ uid: string; email?: string; email_verified?: boolean }>) | undefined;
      if (config.firebaseWeb) {
        const { getApps, initializeApp, cert, applicationDefault } = await import("firebase-admin/app");
        const { getAuth } = await import("firebase-admin/auth");
        const fbApp = getApps()[0] ?? initializeApp({
          ...(config.firebaseProject ? { projectId: config.firebaseProject } : {}),
          ...(process.env.FIREBASE_AUTH_EMULATOR_HOST ? {} : { credential: config.firebaseKeyFile ? cert(config.firebaseKeyFile) : applicationDefault() }),
        });
        verifyIdToken = (t) => getAuth(fbApp).verifyIdToken(t, true);
      }
      core = oauthCore(config, kv, verifyIdToken);
      return core;
    })();
    const c = async () => core ?? (await ready);
    const form = express.urlencoded({ extended: false, limit: "16kb" });

    // Discovery: protected resource metadata for /mcp, and this authorization server's metadata. Mounted at once
    // (answers wait for the setup above), so a server that has just started never says "not found".
    let meta: RequestHandler | null = null;
    app.use((req, res, next) => {
      if (!req.path.startsWith("/.well-known/")) { next(); return; }
      c().then((k) => {
        meta ??= mcpAuthMetadataRouter({ oauthMetadata: k.metadata, resourceServerUrl: new URL(k.resource), scopesSupported: [SCOPE], resourceName: "Lesson Studio" });
        meta(req, res, next);
      }, next);
    });

    app.post("/register", limiter(10), async (req, res) => {
      try {
        res.status(201).json(await (await c()).register(req.body ?? {}));
      } catch (e) {
        res.status(400).json({ error: (e as OAuthError).code ?? "invalid_client_metadata", error_description: (e as Error).message });
      }
    });

    app.get("/authorize", limiter(30), async (req, res) => {
      const k = await c();
      const r = await k.checkAuthorize(req.query as Record<string, unknown>);
      if (!r.ok) {
        if (r.redirect) { res.redirect(303, r.redirect); return; }
        res.status(400).type("text/plain").send(r.error);
        return;
      }
      const nonce = randomBytes(16).toString("base64");
      res.set({
        "Cache-Control": "no-store",
        "X-Frame-Options": "DENY",
        "Content-Security-Policy":
          `default-src 'none'; script-src 'nonce-${nonce}' https://www.gstatic.com https://apis.google.com; connect-src 'self' https://*.googleapis.com; ` +
          "frame-src https://*.firebaseapp.com https://accounts.google.com; style-src 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
      });
      res.type("html").send(approvalPage(config, r.client.client_name, k.seal(r.params), nonce));
    });

    app.post("/authorize/approve", limiter(10), express.json({ limit: "16kb" }), async (req, res) => {
      const k = await c();
      const p = k.unseal(String(req.body?.request ?? ""));
      if (!p) { res.status(400).json({ error: "This sign-in page has expired; start again from your AI app." }); return; }
      if (req.body?.deny) {
        const u = new URL(p.redirect_uri!);
        u.searchParams.set("error", "access_denied");
        if (p.state) u.searchParams.set("state", p.state);
        u.searchParams.set("iss", config.publicUrl!);
        res.json({ redirect: u.href });
        return;
      }
      const who = await k.identify(req.body ?? {});
      if (typeof who === "string") { res.status(403).json({ error: who }); return; }
      res.json({ redirect: await k.issueCode(p, who) });
    });

    app.post("/token", limiter(30), form, (req, res) => { void c().then((k) => k.tokenEndpoint(req, res)); });

    const metadataUrl = getOAuthProtectedResourceMetadataUrl(new URL(`${config.publicUrl}/mcp`));
    const gate = requireBearerAuth({ verifier: { verifyAccessToken: async (t: string) => (await c()).verify(t) }, requiredScopes: [SCOPE], resourceMetadataUrl: metadataUrl });
    return gate;
  };
}
