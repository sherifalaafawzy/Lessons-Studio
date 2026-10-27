import type { Scene, Tone } from "@lessonstudio/spec";
import { TONES, splitWords } from "@lessonstudio/spec";
import { currentElement, currentScene, edit, elementId, lesson, sceneTiming } from "../editor.ts";
import { t, type Key } from "../i18n.ts";
import { ElementAnimations, SceneCues } from "./Animations.tsx";
import { ElementForm, QuizForm, TEMPLATE_NAMES, TemplateForm } from "./content.tsx";
import { Check, NumField, Section, Select } from "./fields.tsx";

/** Narration per language: what is said in the scene. Words and seconds help keep scenes short. */
function Narration({ scene }: { scene: Scene }) {
  const langs = lesson.value?.manifest.languages ?? [];
  const st = sceneTiming.value;
  return (
    <div class="narr">
      {langs.map((l) => {
        const text = scene.narration[l.code] ?? "";
        const words = splitWords(text).length;
        return (
          <label class="f-lang" key={l.code}>
            <span class="f-code" dir="ltr">{l.code.toUpperCase()}</span>
            <textarea rows={4} dir={l.dir} lang={l.code} value={text}
              onBlur={(e) => { const v = (e.target as HTMLTextAreaElement).value.trim(); if (v !== text) edit([{ op: "setNarration", scene: scene.id, lang: l.code, text: v }]); }} />
            <span class={words > 70 ? "f-hint warn" : "f-hint"} dir="ltr">{words} {t("words")}{words > 70 ? `${t("sep")}${t("tooLong")}` : ""}</span>
          </label>
        );
      })}
      {st ? <p class="f-hint">{t("estimated")}: <span dir="ltr">{(st.end - st.start).toFixed(1)} s</span></p> : null}
    </div>
  );
}

function SceneLook({ scene }: { scene: Scene }) {
  const tr = scene.transition;
  return (
    <>
      <div class="f-grid4">
        <Select label={t("transition")} value={tr?.type ?? "fade"} options={(["fade", "cut", "slide", "wipe", "zoom"] as const).map((x) => [x, t(`tr_${x}` as Key)])}
          onChange={(v) => edit([{ op: "set", scene: scene.id, path: "/transition", value: { type: v, ...(tr?.dur !== undefined ? { dur: tr.dur } : {}) } }])} />
        <NumField label={t("seconds")} value={tr?.dur} min={0} max={3} step={0.1} placeholder="0.4"
          onCommit={(v) => edit([{ op: "set", scene: scene.id, path: "/transition", value: { type: tr?.type ?? "fade", ...(v !== undefined ? { dur: v } : {}) } }])} />
        <Select label={t("background")} value={scene.background} empty={t("auto")} options={TONES.map((x) => [x, t(`tone_${x}` as Key)] as [Tone, string])}
          onChange={(v) => edit([v ? { op: "set", scene: scene.id, path: "/background", value: v } : { op: "remove", scene: scene.id, path: "/background" }])} />
      </div>
      <Check label={t("mirrorRtl")} value={scene.mirror !== false}
        onChange={(v) => edit([v ? { op: "remove", scene: scene.id, path: "/mirror" } : { op: "set", scene: scene.id, path: "/mirror", value: false }])} />
    </>
  );
}

/** Everything about what's selected: the scene, or the element inside it. */
export function Inspector() {
  const scene = currentScene.value;
  const el = currentElement.value;
  if (!scene) return <aside class="inspector" />;
  return (
    <aside class="inspector" aria-label={t("inspector")}>
      {el ? (
        <>
          <div class="insp-head">
            <button type="button" class="link" onClick={() => { elementId.value = null; }}>← {t("scene")}</button>
            <h2 dir="ltr">{el.id} <small>{el.type}</small></h2>
            <button type="button" class="link danger" onClick={() => { if (edit([{ op: "removeElement", scene: scene.id, element: el.id }])) elementId.value = null; }}>{t("remove")}</button>
          </div>
          <Section title={t("animations")}><ElementAnimations scene={scene} el={el} /></Section>
          <Section title={t("properties")}><ElementForm scene={scene} el={el} /></Section>
        </>
      ) : (
        <>
          <div class="insp-head"><h2>{t("scene")} <small dir="ltr">{scene.id}</small> <span class="badge">{t(TEMPLATE_NAMES[scene.template])}</span></h2></div>
          <Section title={t("narration")}><Narration scene={scene} /></Section>
          {scene.template !== "canvas" ? <Section title={t("content")}><TemplateForm scene={scene} /></Section> : null}
          <Section title={t("cues")} open={!!scene.cues?.length}><SceneCues scene={scene} /></Section>
          <Section title={t("quickCheck")} open={!!scene.check}><QuizForm scene={scene} /></Section>
          <Section title={t("look")} open={false}><SceneLook scene={scene} /></Section>
        </>
      )}
    </aside>
  );
}
