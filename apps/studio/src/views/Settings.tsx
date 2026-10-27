import { useEffect, useState } from "preact/hooks";
import { call, type AiStatus, type KeyStatus } from "../ai.ts";
import { emulators } from "../fb.ts";
import { go, say, user } from "../state.ts";
import { ago, t, uiLang } from "../i18n.ts";

/** Your AI keys, your account, and the studio's language. */
export function Settings() {
  const u = user.value!;
  return (
    <main class="page">
      <button type="button" class="link" onClick={() => go("/")}>← {t("backToLessons")}</button>
      <h1>{t("settings")}</h1>
      <AiKeys />
      <section class="card-sec">
        <h2>{t("account")}</h2>
        <dl class="facts">
          <dt>{t("email")}</dt><dd dir="ltr">{u.email ?? "–"}</dd>
          <dt>{t("userId")}</dt><dd dir="ltr"><code>{u.uid}</code> <Copy text={u.uid} /></dd>
        </dl>
        <p class="f-hint">{t("userIdHint")}</p>
      </section>
      <section class="card-sec">
        <h2>{t("studioLanguage")}</h2>
        <div class="seg" role="radiogroup" aria-label={t("studioLanguage")}>
          {(["en", "ar"] as const).map((l) => (
            <button type="button" key={l} role="radio" aria-checked={uiLang.value === l} class={uiLang.value === l ? "on" : ""} lang={l}
              onClick={() => { uiLang.value = l; }}>{l === "en" ? "English" : "العربية"}</button>
          ))}
        </div>
      </section>
    </main>
  );
}

function AiKeys() {
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  useEffect(() => { call<AiStatus>("aiKeyStatus").then(setStatus, (e: Error) => setErr(e.message)); }, []);
  const g: KeyStatus | undefined = status?.gemini;
  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await call<{ gemini: KeyStatus }>("saveAiKey", { provider: "gemini", key: key.trim() });
      setStatus({ ...status!, gemini: r.gemini });
      setEditing(false);
      say(t("keySaved"));
    } catch (e) {
      setErr((e as Error).message);
    }
    setKey("");
    setBusy(false);
  };
  const remove = async () => {
    setConfirming(false);
    try {
      const r = await call<{ gemini: KeyStatus }>("removeAiKey");
      setStatus({ ...status!, gemini: r.gemini });
      say(t("keyRemoved"));
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  return (
    <section class="card-sec">
      <h2>{t("aiKeys")}</h2>
      <p>{t("aiKeysAbout")}</p>
      <div class="key-row">
        <strong>Google Gemini</strong>
        {!status ? <span class="f-hint">{err ? "" : t("loading")}</span>
          : g?.set ? <span dir="auto">{t("keySet").replace("{last4}", g.last4 ?? "")}{g.setAt ? `${t("sep")}${ago(g.setAt)}` : ""}</span>
          : <span class="f-hint">{t("noKey")}</span>}
      </div>
      {status && !editing ? (
        <div class="row-actions">
          <button type="button" class="btn small" onClick={() => setEditing(true)}>{g?.set ? t("replaceKey") : t("addKey")}</button>
          {g?.set ? (confirming
            ? <span class="confirm" role="alert">{t("removeKeyQ")} <button type="button" class="btn danger small" onClick={() => void remove()}>{t("yes")}</button> <button type="button" class="link" onClick={() => setConfirming(false)}>{t("no")}</button></span>
            : <button type="button" class="link danger" onClick={() => setConfirming(true)}>{t("remove")}</button>) : null}
        </div>
      ) : null}
      {editing ? (
        <form class="key-form" onSubmit={(e) => { e.preventDefault(); if (key.trim() && !busy) void save(); }}>
          <label class="f-row"><span>{t("geminiKey")}</span>
            <input type="password" autocomplete="off" spellcheck={false} dir="ltr" value={key} onInput={(e) => setKey((e.target as HTMLInputElement).value)} placeholder="AIza…" />
          </label>
          <p class="f-hint">{t("getKeyAt")} <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" dir="ltr">aistudio.google.com/apikey</a></p>
          <div class="row-actions">
            <button type="submit" class="btn primary small" disabled={!key.trim() || busy}>{busy ? t("checkingKey") : t("saveKey")}</button>
            <button type="button" class="link" onClick={() => { setEditing(false); setKey(""); }}>{t("cancel")}</button>
          </div>
        </form>
      ) : null}
      {err ? <p class="f-hint warn" role="alert">{err}</p> : null}
      {status ? <p class="f-hint">{t("keyUse").replace("{model}", status.model).replace("{in}", String(status.price.input)).replace("{out}", String(status.price.output))}</p> : null}
      {emulators ? <p class="f-hint">{t("keyEmulators")}</p> : null}
    </section>
  );
}

/** A button that copies text and says so. */
export function Copy({ text, label }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" class="btn small" onClick={() => {
      void navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); }, () => say(t("cantCopy"), true));
    }}>{done ? t("copied") : label ?? t("copy")}</button>
  );
}
