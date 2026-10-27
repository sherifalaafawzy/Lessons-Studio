// The Lesson Studio server: MCP over HTTP on this PC (and online through ngrok, with sign-in).
// Run: npm start -w @lessonstudio/server. Settings come from .env.local (see README "Server and MCP").
import { loadConfig } from "./config.ts";
import { createHttpApp } from "./http.ts";
import { closeRenderer } from "./render.ts";
import { openStore } from "./stores/index.ts";

const config = loadConfig();
const store = await openStore(config);
const deps = { store, config };
const secure = config.publicUrl ? (await import("./oauth.ts")).secure(deps) : undefined;
const app = createHttpApp(deps, secure ? { secure } : {});

const server = app.listen(config.port, "127.0.0.1", () => {
  console.log(`Lesson Studio server on http://127.0.0.1:${config.port}/mcp (lessons: ${config.store === "file" ? `files in ${config.dataDir}` : "Firestore"})`);
  if (config.publicUrl) console.log(`Online through ngrok at ${config.publicUrl}/mcp; sign-in allowed for: ${config.allowedEmails.join(", ") || "nobody yet (set LS_ALLOWED_EMAILS)"}`);
  if (!config.chromiumPath) console.log("No Chromium found: render_frame needs CHROMIUM_PATH.");
});

const stop = async () => {
  server.close();
  await closeRenderer();
  process.exit(0);
};
process.on("SIGINT", () => void stop());
process.on("SIGTERM", () => void stop());
