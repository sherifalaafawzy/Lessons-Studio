import { useState } from "preact/hooks";
import type { TemplateId } from "@lessonstudio/spec";
import { TEMPLATES, pick } from "@lessonstudio/spec";
import { edit, elementId, freeId, lang, lesson, playhead, sceneId, state, timings } from "../editor.ts";
import { t } from "../i18n.ts";
import { ItemTools } from "./fields.tsx";
import { TEMPLATE_NAMES, newScene } from "./content.tsx";

/** The scenes in order, as cards: pick one to edit, reorder, copy, delete, add. */
export function Storyboard() {
  const l = lesson.value;
  const [adding, setAdding] = useState(false);
  if (!l) return null;
  const scenes = l.scenes.scenes;
  const tm = timings.value[lang.value];
  const recent = state.value?.remote && Date.now() - state.value.remote.at < 8000 ? new Set(state.value.remote.scenes) : new Set<string>();
  // A scene opens at its end, with everything in place: the useful frame for laying it out.
  const select = (id: string) => {
    const i = lesson.value?.scenes.scenes.findIndex((s) => s.id === id) ?? -1;
    const st = timings.value[lang.value]?.scenes[i];
    sceneId.value = id;
    elementId.value = null;
    playhead.value = st ? Math.max(0, st.end - st.start - 0.05) : 0;
  };
  const add = (template: TemplateId) => {
    const id = freeId(template === "title-hook" ? "intro" : template, scenes.map((s) => s.id));
    const at = Math.max(0, scenes.findIndex((s) => s.id === sceneId.value) + 1) || scenes.length;
    if (edit([{ op: "addScene", scene: newScene(template, id), at }])) select(id);
    setAdding(false);
  };
  return (
    <nav class="board" aria-label={t("storyboard")}>
      <h2>{t("storyboard")}</h2>
      <ol>
        {scenes.map((s, i) => {
          const secs = tm?.scenes[i] ? tm.scenes[i]!.end - tm.scenes[i]!.start : 0;
          const text = s.narration[lang.value] ?? "";
          return (
            <li key={s.id} class={`card${s.id === sceneId.value ? " on" : ""}${recent.has(s.id) ? " fresh" : ""}`}>
              <button type="button" class="card-main" aria-current={s.id === sceneId.value} onClick={() => select(s.id)}>
                <span class="card-top"><span class="num">{i + 1}</span><span class="badge">{t(TEMPLATE_NAMES[s.template])}</span><span class="secs" dir="ltr">{secs.toFixed(0)} s</span></span>
                <span class="card-text" dir={l.manifest.languages.find((g) => g.code === lang.value)?.dir} lang={lang.value}>{text.length > 90 ? `${text.slice(0, 88)}…` : text}</span>
              </button>
              <ItemTools
                onUp={i > 0 ? () => edit([{ op: "moveScene", scene: s.id, to: i - 1 }]) : undefined}
                onDown={i < scenes.length - 1 ? () => edit([{ op: "moveScene", scene: s.id, to: i + 1 }]) : undefined}
                onCopy={() => { const id = freeId(s.id, scenes.map((x) => x.id)); if (edit([{ op: "duplicateScene", scene: s.id, id }])) select(id); }}
                onRemove={scenes.length > 1 ? () => edit([{ op: "removeScene", scene: s.id }]) : undefined} />
            </li>
          );
        })}
      </ol>
      {adding ? (
        <div class="tpl-pick" role="group" aria-label={t("chooseTemplate")}>
          {TEMPLATES.map((tp) => <button type="button" key={tp} class="chip" onClick={() => add(tp)}>{t(TEMPLATE_NAMES[tp])}</button>)}
          <button type="button" class="link" onClick={() => setAdding(false)}>{t("cancel")}</button>
        </div>
      ) : (
        <button type="button" class="btn wide" onClick={() => setAdding(true)}>+ {t("addScene")}</button>
      )}
      <p class="f-hint">{t("lessonLength")}: <span dir="ltr">{tm ? `${Math.round(tm.duration)} s` : "–"}</span>{t("sep")}{pick(l.manifest.title, lang.value)}</p>
    </nav>
  );
}
