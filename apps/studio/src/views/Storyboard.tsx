import { pick } from "@lessonstudio/spec";
import { edit, freeId, lang, leftTab, lesson, sceneId, selectScene, state, timings, tracks } from "../editor.ts";
import { Icon } from "../icons.tsx";
import { t } from "../i18n.ts";
import { ItemTools } from "./fields.tsx";
import { TEMPLATE_NAMES } from "./content.tsx";
import { MiniScene } from "./Gallery.tsx";

// Thumbnails cost a small player each, so only wide screens get them; phones list the scenes as text.
const wide = typeof matchMedia === "function" ? matchMedia("(min-width: 900px)") : null;

/** The scenes in order, as cards: pick one to edit, reorder, copy, delete, add. */
export function Storyboard() {
  const l = lesson.value;
  if (!l) return null;
  const scenes = l.scenes.scenes;
  const tm = timings.value[lang.value];
  const track = tracks.value[lang.value];
  const recent = state.value?.remote && Date.now() - state.value.remote.at < 8000 ? new Set(state.value.remote.scenes) : new Set<string>();
  const select = selectScene;
  return (
    <nav class="board" aria-label={t("storyboard")}>
      <ol>
        {scenes.map((s, i) => {
          const secs = tm?.scenes[i] ? tm.scenes[i]!.end - tm.scenes[i]!.start : 0;
          const text = s.narration[lang.value] ?? "";
          const part = track?.parts[i];
          const voice = part ? (part.clip ? "on" : part.stale ? "stale" : "none") : null;
          return (
            <li key={s.id} class={`card${s.id === sceneId.value ? " on" : ""}${recent.has(s.id) ? " fresh" : ""}`}>
              <button type="button" class="card-main" aria-current={s.id === sceneId.value} onClick={() => select(s.id)}>
                {wide?.matches ? <MiniScene scene={s} hoverPlay={false} /> : null}
                <span class="card-top"><span class="num">{i + 1}</span><span class="badge">{t(TEMPLATE_NAMES[s.template])}</span><span class="secs" dir="ltr">{secs.toFixed(0)} s</span>{voice ? <span class={`vdot ${voice}`} title={t(voice === "on" ? "voiceFits" : voice === "stale" ? "voiceChanged" : "voiceSilent")}><Icon name="mic" /></span> : null}</span>
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
      <button type="button" class="btn wide" onClick={() => { leftTab.value = "add"; }}>+ {t("addScene")}</button>
      <p class="f-hint">{t("lessonLength")}: <span dir="ltr">{tm ? `${Math.round(tm.duration)} s` : "–"}</span>{t("sep")}{pick(l.manifest.title, lang.value)}</p>
    </nav>
  );
}
