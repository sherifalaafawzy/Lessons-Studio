import { useState } from "preact/hooks";
import type { Scene, Tone } from "@lessonstudio/spec";
import { TONES, splitWords } from "@lessonstudio/spec";
import { currentElement, currentScene, edit, elementId, lesson, rightTab, sceneTiming, type RightTab } from "../editor.ts";
import { say } from "../state.ts";
import { convertToCanvas } from "../convert.ts";
import { t, type Key } from "../i18n.ts";
import { ElementAnimations, SceneCues } from "./Animations.tsx";
import { ElementForm, QuizForm, TEMPLATE_NAMES, TemplateForm } from "./content.tsx";
import { Check, NumField, Section, Select, TextField } from "./fields.tsx";
import { VoicePanel } from "./Voice.tsx";

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

/** Turns a template scene into free elements, after saying what that means. */
function ToCanvas({ scene }: { scene: Scene }) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const go = async () => {
    const l = lesson.value;
    if (!l) return;
    setBusy(true);
    try {
      edit([{ op: "replaceScene", scene: scene.id, value: await convertToCanvas(l, scene) }]);
    } catch (e) {
      say((e as Error).message, true);
    }
    setBusy(false);
    setAsking(false);
  };
  if (!asking) return <button type="button" class="btn small" onClick={() => setAsking(true)}>{t("toCanvas")}</button>;
  return (
    <div class="confirm-box" role="alert">
      <p>{t("toCanvasAbout")}</p>
      <button type="button" class="btn primary small" disabled={busy} onClick={() => void go()}>{busy ? t("working") : t("toCanvas")}</button>
      <button type="button" class="link" onClick={() => setAsking(false)}>{t("cancel")}</button>
    </div>
  );
}

/** Everything about what's selected: the scene, or the element inside it. */
const TABS: RightTab[] = ["design", "animate", "scene", "lesson"];

/** Everything about what's selected, in four tabs: how it looks, how it moves, the scene, the lesson. */
export function Inspector() {
  const scene = currentScene.value;
  const el = currentElement.value;
  const tab = rightTab.value;
  if (!scene) return <aside class="inspector" />;
  const head = el ? (
    <div class="insp-head">
      <button type="button" class="link" onClick={() => { elementId.value = null; }}>← {t("scene")}</button>
      <h2 dir="ltr">{el.id} <small>{el.type}</small></h2>
      <button type="button" class="link danger" onClick={() => { if (edit([{ op: "removeElement", scene: scene.id, element: el.id }])) elementId.value = null; }}>{t("remove")}</button>
    </div>
  ) : (
    <div class="insp-head"><h2>{t("scene")} <small dir="ltr">{scene.id}</small> <span class="badge">{t(TEMPLATE_NAMES[scene.template])}</span></h2></div>
  );
  return (
    <aside class="inspector" aria-label={t("inspector")}>
      <div class="insp-tabs" role="tablist" aria-label={t("inspector")}>
        {TABS.map((x) => (
          <button type="button" role="tab" key={x} aria-selected={tab === x} onClick={() => { rightTab.value = x; }}>{t(`tab_${x}` as Key)}</button>
        ))}
      </div>
      <div class="insp-body" role="tabpanel">
        {tab === "lesson" ? <LessonTab /> : <>
          {tab === "scene" ? <div class="insp-head"><h2>{t("scene")} <small dir="ltr">{scene.id}</small> <span class="badge">{t(TEMPLATE_NAMES[scene.template])}</span></h2></div> : head}
          {tab === "design" ? (
            el ? <Section title={t("properties")}><ElementForm scene={scene} el={el} /></Section>
              : scene.template === "canvas" ? <p class="insp-note">{t("pickElement")}</p>
              : <>
                  <ToCanvas scene={scene} />
                  <Section title={t("content")}><TemplateForm scene={scene} /></Section>
                </>
          ) : tab === "animate" ? (
            <>
              {el ? <Section title={t("animations")}><ElementAnimations scene={scene} el={el} /></Section> : <p class="insp-note">{t("pickToAnimate")}</p>}
              <Section title={t("cues")} open={!!scene.cues?.length || !el}><SceneCues scene={scene} /></Section>
            </>
          ) : (
            <>
              <Section title={t("narration")}><Narration scene={scene} /></Section>
              <Section title={t("narrationAudio")}><VoicePanel scene={scene} /></Section>
              <Section title={t("quickCheck")} open={!!scene.check}><QuizForm scene={scene} /></Section>
              <Section title={t("look")} open={false}><SceneLook scene={scene} /></Section>
            </>
          )}
        </>}
      </div>
    </aside>
  );
}

/** The lesson as a whole: its title and summary in each language, its look and shape, and what AI did. */
function LessonTab() {
  const l = lesson.value;
  if (!l) return null;
  const m = l.manifest;
  const ai = m.ai;
  return (
    <>
      <Section title={t("lessonDetails")}>
        <TextField label={t("fTitle")} value={m.title} onCommit={(v) => { if (v) edit([{ op: "setMeta", title: v }]); }} />
        <TextField label={t("summary")} value={m.summary} optional multiline onCommit={(v) => { if (v) edit([{ op: "setMeta", summary: v }]); }} />
        <div class="f-grid4">
          <Select label={t("look")} value={m.brand ?? "studio-dark"} options={[["studio-dark", t("brandDark")], ["darsi-light", t("brandLight")]]}
            onChange={(v) => edit([{ op: "setMeta", brand: v }])} />
          <Select label={t("shape")} value={m.stage ?? "landscape"} options={[["landscape", t("landscape")], ["portrait", t("portrait")], ["square", t("square")]]}
            onChange={(v) => edit([{ op: "setMeta", stage: v as "landscape" | "portrait" | "square" }])} />
        </div>
      </Section>
      <Section title={t("languages")}>
        <ul class="lang-list">
          {m.languages.map((g) => (
            <li key={g.code}><strong lang={g.code} dir={g.dir}>{g.name}</strong> <span class="badge" dir="ltr">{g.code}</span> <span class="f-hint">{g.dir === "rtl" ? t("rtl") : t("ltr")}{g.quality ? `${t("sep")}${g.quality}` : ""}</span></li>
          ))}
        </ul>
      </Section>
      <Section title={t("aiUse")} open={false}>
        <dl class="facts">
          <dt>{t("aiScript")}</dt><dd>{ai.script}</dd>
          <dt>{t("aiTranslation")}</dt><dd>{ai.translation}</dd>
          <dt>{t("aiNarration")}</dt><dd>{ai.narration}</dd>
          <dt>{t("aiVisuals")}</dt><dd>{ai.visuals}</dd>
        </dl>
      </Section>
    </>
  );
}
