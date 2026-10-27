import { useEffect, useState } from "preact/hooks";
import { pick } from "@lessonstudio/spec";
import { closeLesson, currentElement, currentScene, edit, elementId, lang, lesson, openLesson, state, sync } from "../editor.ts";
import { go, say } from "../state.ts";
import { t, viaName } from "../i18n.ts";
import { Checks } from "./Checks.tsx";
import { Inspector } from "./Inspector.tsx";
import { Preview } from "./Preview.tsx";
import { Stage } from "./Stage.tsx";
import { Storyboard } from "./Storyboard.tsx";
import { moveOps } from "./content.tsx";

/** The editor: storyboard, stage and inspector; on phones, one panel at a time. */
export function Editor({ id }: { id: string }) {
  const [preview, setPreview] = useState(false);
  const [panel, setPanel] = useState<"board" | "stage" | "inspector">("stage");
  useEffect(() => {
    openLesson(id);
    return closeLesson;
  }, [id]);

  // Keyboard: undo, redo, delete and nudge the selected element.
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z" && !typing) {
        e.preventDefault();
        const err = e.shiftKey ? sync.value?.redo() : sync.value?.undo();
        if (err) say(err, true);
      } else if (mod && e.key.toLowerCase() === "y" && !typing) {
        e.preventDefault();
        const err = sync.value?.redo();
        if (err) say(err, true);
      } else if (!typing && currentElement.value && currentScene.value) {
        const el = currentElement.value;
        const sc = currentScene.value;
        const step = e.shiftKey ? 10 : 1;
        const d: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
        if (d[e.key]) {
          e.preventDefault();
          edit(moveOps(sc, el, d[e.key]![0], d[e.key]![1]));
        } else if (e.key === "Delete" || e.key === "Backspace") {
          e.preventDefault();
          if (edit([{ op: "removeElement", scene: sc.id, element: el.id }])) elementId.value = null;
        } else if (e.key === "Escape") elementId.value = null;
      }
    };
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
  }, []);

  const s = state.value;
  const l = lesson.value;
  if (s?.status === "gone") {
    return <main class="empty"><p>{t("lessonGone")}</p><button type="button" class="btn" onClick={() => go("/")}>{t("backToLessons")}</button></main>;
  }
  if (!s || !l) return <main class="empty"><p>{s?.status === "error" ? `${t("cantOpen")}: ${s.error}` : t("loading")}</p></main>;
  const remote = s.remote && Date.now() - s.remote.at < 8000 ? s.remote : null;
  const status = s.status === "saving" ? t("saving") : s.status === "error" ? t("notSaved") : t("saved");

  return (
    <div class="editor">
      <header class="bar">
        <button type="button" class="link" onClick={() => go("/")}>← {t("lessons")}</button>
        <h1 dir="auto">{pick(l.manifest.title, lang.value)}</h1>
        <span class={`status ${s.status}`} role="status">{status}</span>
        <span class="spacer" />
        <button type="button" class="btn icon" disabled={!s.canUndo} aria-label={t("undo")} title={`${t("undo")} (Ctrl+Z)`} onClick={() => { const e = sync.value?.undo(); if (e) say(e, true); }}>↶</button>
        <button type="button" class="btn icon" disabled={!s.canRedo} aria-label={t("redo")} title={`${t("redo")} (Ctrl+Y)`} onClick={() => { const e = sync.value?.redo(); if (e) say(e, true); }}>↷</button>
        <label class="langsel">
          <span class="sr">{t("lessonLanguage")}</span>
          <select value={lang.value} onChange={(e) => { lang.value = (e.target as HTMLSelectElement).value; }} aria-label={t("lessonLanguage")}>
            {l.manifest.languages.map((g) => <option key={g.code} value={g.code} lang={g.code}>{g.name}</option>)}
          </select>
        </label>
        <Checks />
        <button type="button" class="btn primary" onClick={() => setPreview(true)}>{t("preview")}</button>
      </header>
      {remote ? <div class="ai-banner" role="status">{t("editedBy")} {viaName(remote.via)}{remote.scenes.length ? ` (${remote.scenes.join(", ")})` : ""}</div> : null}
      <nav class="tabs" aria-label={t("panels")}>
        {(["board", "stage", "inspector"] as const).map((p) => (
          <button type="button" key={p} aria-pressed={panel === p} class={panel === p ? "on" : ""} onClick={() => setPanel(p)}>{t(`panel_${p}`)}</button>
        ))}
      </nav>
      <div class={`panes show-${panel}`}>
        <Storyboard />
        <Stage />
        <Inspector />
      </div>
      {preview ? <Preview onClose={() => setPreview(false)} /> : null}
    </div>
  );
}
