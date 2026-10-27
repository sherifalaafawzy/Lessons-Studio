// MCP over stdio, for AI tools on this PC (Claude Code, Claude Desktop, Cursor, Gemini CLI, VS Code).
// They start it themselves, e.g.: claude mcp add lessonstudio -- node H:/htdocs/lessonstudio/apps/server/src/stdio.ts
// stdout carries the protocol, so everything else goes to stderr.
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { loadConfig } from "./config.ts";
import { buildServer } from "./mcp.ts";
import { openStore } from "./stores/index.ts";

const config = loadConfig({ ...process.env, LS_PUBLIC_URL: "" });
const store = await openStore(config);
serveStdio(() => buildServer({ store, config }, { uid: config.localUid, via: "mcp:stdio" }), {
  onerror: (e) => console.error("mcp:", e.message),
});
console.error(`Lesson Studio MCP (stdio); lessons: ${config.store === "file" ? config.dataDir : "Firestore"}`);
