// The in-chat preview (MCP Apps): plays a lesson with the real player inside Claude, ChatGPT or any host
// that supports MCP Apps. The host sends the preview_lesson result; its structuredContent holds the package.
//
// A small client for the MCP Apps protocol (spec 2026-01-26, the version @modelcontextprotocol/ext-apps
// 2.0.3 names as latest) instead of that package's App class, which brings 600 KB of schemas with it.
// JSON-RPC 2.0 over postMessage with the host: ui/initialize, then ui/notifications/initialized; the host
// sends ui/notifications/tool-result; the view reports its size and asks the host to open links.
import { createPlayer, type Player } from "@lessonstudio/player";
import type { LessonPackage } from "@lessonstudio/spec";

const PROTOCOL = "2026-01-26";
const host = document.getElementById("p")!;
const note = document.getElementById("note")!;
let player: Player | null = null;
let nextId = 1;
const waiting = new Map<number, (result: unknown) => void>();

const post = (msg: Record<string, unknown>): void => window.parent.postMessage({ jsonrpc: "2.0", ...msg }, "*");
const request = (method: string, params: unknown): Promise<unknown> =>
  new Promise((done) => {
    const id = nextId++;
    waiting.set(id, done);
    post({ id, method, params });
  });

interface ToolResult {
  isError?: boolean;
  structuredContent?: { package?: LessonPackage; lang?: string; studio?: string };
}

function show(r: ToolResult): void {
  const data = r.structuredContent;
  if (r.isError || !data?.package) {
    note.textContent = "This lesson couldn't be shown.";
    return;
  }
  player?.destroy();
  player = createPlayer(host, data.package, { lang: data.lang ?? data.package.manifest.defaultLang, tier: "auto", orient: "landscape" });
  note.textContent = "";
  if (data.studio) {
    const a = document.createElement("a");
    a.href = data.studio;
    a.textContent = "Open in Lesson Studio";
    a.addEventListener("click", (e) => {
      e.preventDefault();
      void request("ui/open-link", { url: data.studio });
    });
    note.append(a);
  }
}

window.addEventListener("message", (e) => {
  if (e.source !== window.parent) return;
  const m = e.data as { jsonrpc?: string; id?: number; method?: string; params?: unknown; result?: unknown; error?: unknown };
  if (!m || m.jsonrpc !== "2.0") return;
  if (m.id !== undefined && !m.method) {
    waiting.get(m.id)?.(m.result);
    waiting.delete(m.id);
    return;
  }
  if (m.method === "ui/notifications/tool-result") show(m.params as ToolResult);
  // Requests from the host (e.g. ui/resource-teardown) need an answer.
  if (m.id !== undefined && m.method) post({ id: m.id, result: {} });
});

let lastHeight = 0;
const reportSize = (): void => {
  const height = Math.ceil(document.documentElement.scrollHeight);
  if (height === lastHeight) return;
  lastHeight = height;
  post({ method: "ui/notifications/size-changed", params: { width: Math.ceil(document.documentElement.scrollWidth), height } });
};

void request("ui/initialize", { appInfo: { name: "Lesson Studio preview", version: "0.1.0" }, appCapabilities: {}, protocolVersion: PROTOCOL })
  .then(() => {
    post({ method: "ui/notifications/initialized", params: {} });
    // Sizes go to the host only once the handshake is done.
    new ResizeObserver(reportSize).observe(document.body);
  });
