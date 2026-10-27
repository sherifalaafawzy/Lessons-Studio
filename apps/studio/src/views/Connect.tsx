import type { ComponentChildren } from "preact";
import { mcpAddress } from "../ai.ts";
import { emulators } from "../fb.ts";
import { go, user } from "../state.ts";
import { t, type Key } from "../i18n.ts";
import { Copy } from "./Settings.tsx";

/** How to connect an AI app to Lesson Studio through MCP, app by app, with everything ready to copy. */
export function Connect() {
  const url = mcpAddress();
  const uid = user.value!.uid;
  const repo = "H:/htdocs/lessonstudio";
  const cursor = JSON.stringify({ mcpServers: { lessonstudio: { url } } }, null, 2);
  const vscode = JSON.stringify({ servers: { lessonstudio: { type: "http", url } } }, null, 2);
  const gemini = JSON.stringify({ mcpServers: { lessonstudio: { httpUrl: url } } }, null, 2);
  const local = JSON.stringify({
    mcpServers: {
      lessonstudio: {
        command: "node", args: [`${repo}/apps/server/src/stdio.ts`],
        env: { LS_STORE: "firestore", LS_LOCAL_UID: uid, LS_FIREBASE_PROJECT: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? "lessons-studio-6b509" },
      },
    },
  }, null, 2);
  return (
    <main class="page connect">
      <button type="button" class="link" onClick={() => go("/")}>← {t("backToLessons")}</button>
      <h1>{t("connectTitle")}</h1>
      <p>{t("connectAbout")}</p>
      <div class="addr">
        <code dir="ltr">{url}</code> <Copy text={url} />
      </div>
      <p class="f-hint">{t(emulators ? "connectEmulators" : "connectSignIn")}</p>

      <App name="ChatGPT" steps={["cgpt1", "cgpt2", "cgpt3"]} />
      <App name="claude.ai" steps={["claude1", "claude2", "claude3"]} />
      <App name="Claude Code" steps={["cc1", "cc2"]}>
        <Snippet text={`claude mcp add --transport http lessonstudio ${url}`} />
      </App>
      <App name="Claude Desktop" steps={["cd1"]} />
      <App name="Cursor" steps={["cursor1"]}><Snippet text={cursor} /></App>
      <App name="VS Code" steps={["vscode1"]}><Snippet text={vscode} /></App>
      <App name="Gemini CLI" steps={["gemini1"]}><Snippet text={gemini} /></App>
      <App name={t("thisPc")} steps={["local1", "local2"]}><Snippet text={local} /></App>

      <section class="card-sec">
        <h2>{t("testIt")}</h2>
        <p>{t("testItAbout")}</p>
        <Snippet text={t("testPrompt")} />
      </section>
    </main>
  );
}

function App(p: { name: string; steps: string[]; children?: ComponentChildren }) {
  return (
    <section class="card-sec">
      <h2>{p.name}</h2>
      <ol>{p.steps.map((s) => <li key={s}>{t(`step_${s}` as Key)}</li>)}</ol>
      {p.children}
    </section>
  );
}

function Snippet({ text }: { text: string }) {
  return (
    <div class="snippet">
      <pre dir="ltr"><code>{text}</code></pre>
      <Copy text={text} />
    </div>
  );
}
