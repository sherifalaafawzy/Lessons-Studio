import type { Express, RequestHandler } from "express";
import { createMcpExpressApp } from "@modelcontextprotocol/express";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { createMcpHandler, type AuthInfo } from "@modelcontextprotocol/server";
import type { Actor } from "@lessonstudio/ops";
import { buildServer, type Deps } from "./mcp.ts";

/** Who an authenticated request acts as. Tokens carry the user's id and the client's name (see oauth.ts). */
export function actorOf(auth: AuthInfo | undefined, localUid: string): Actor {
  const extra = (auth?.extra ?? {}) as { uid?: string; client?: string };
  if (auth && extra.uid) return { uid: extra.uid, via: `mcp:${extra.client ?? auth.clientId}` };
  return { uid: localUid, via: "mcp:local" };
}

export interface HttpOptions {
  /** Puts authentication in front of /mcp and adds the OAuth routes (oauth.ts). Absent: this PC only, no sign-in. */
  secure?: (app: Express) => RequestHandler;
  /** In Cloud Functions: no local-host check (Google's front end routes by host), and always behind sign-in. */
  cloud?: boolean;
}

/**
 * The HTTP face: Streamable HTTP at /mcp (stateless, so it suits the 2026-07-28 protocol and 2025-era
 * clients alike), bound to this PC. Online access goes through ngrok to this port, and then needs a token.
 */
export function createHttpApp(deps: Deps, o: HttpOptions = {}): Express {
  const { config } = deps;
  const hosts = ["localhost", "127.0.0.1", "[::1]"];
  if (config.publicUrl) hosts.push(new URL(config.publicUrl).hostname);
  const app = o.cloud ? createMcpExpressApp({ host: "0.0.0.0", jsonLimit: "2mb" }) : createMcpExpressApp({ host: "127.0.0.1", allowedHosts: hosts, jsonLimit: "2mb" });
  app.disable("x-powered-by");
  // Sign-in pages, tokens and MCP answers are personal or short-lived: no proxy or CDN (Firebase Hosting) may keep them.
  app.use((_req, res, next) => { res.set("Cache-Control", "no-store"); next(); });

  const handler = createMcpHandler((ctx) => buildServer(deps, actorOf(ctx.authInfo, config.localUid)));
  const node = toNodeHandler(handler, { onerror: (e) => console.error("mcp:", e.message) });

  app.get("/health", (_req, res) => { res.json({ ok: true, store: config.store, public: !!config.publicUrl }); });
  const gate: RequestHandler = o.secure ? o.secure(app) : (_req, _res, next) => next();
  app.all("/mcp", gate, (req, res) => { void node(req as never, res as never, req.body); });
  return app;
}
