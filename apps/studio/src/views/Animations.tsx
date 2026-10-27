import { useState } from "preact/hooks";
import type { AnimProp, Cue, CueAction, Element, Scene, Text, When } from "@lessonstudio/spec";
import { pick, targetsOf } from "@lessonstudio/spec";
import { PRESETS, type Preset } from "@lessonstudio/ops";
import { edit, lang, lesson, playhead, sceneIndex, timings } from "../editor.ts";
import { t, type Key } from "../i18n.ts";
import { NumField, Select } from "./fields.tsx";

const clean = (w: string): string => w.replace(/[.,،;؛:!?؟"'“”«»()]/g, "");

/** The scene's spoken words in each language, to pick the moment something happens. */
export function WordPicker(p: { value: Text | undefined; onChange: (v: Text) => void }) {
  const langs = lesson.value?.manifest.languages ?? [];
  const i = sceneIndex.value;
  const cur = typeof p.value === "string" ? Object.fromEntries(langs.map((l) => [l.code, p.value as string])) : { ...(p.value ?? {}) };
  return (
    <div class="words-pick">
      {langs.map((l) => {
        const words = timings.value[l.code]?.scenes[i]?.words ?? [];
        return (
          <div class="words-row" key={l.code} dir={l.dir} lang={l.code}>
            <span class="f-code" dir="ltr">{l.code.toUpperCase()}</span>
            {words.map((w, k) => {
              const word = clean(w.w);
              const on = (cur[l.code] ?? "") === word;
              return (
                <button type="button" key={k} class={on ? "word on" : "word"} aria-pressed={on}
                  onClick={() => p.onChange({ ...cur, [l.code]: word })}>{w.w}</button>
              );
            })}
          </div>
        );
      })}
      {langs.some((l) => !cur[l.code]) ? <p class="f-hint warn">{t("pickEveryLang")}</p> : null}
    </div>
  );
}

const whenText = (w: When): string => (typeof w === "number" ? `${w.toFixed(1)} s` : `«${pick(w.word, lang.value)}»${w.offset ? ` ${w.offset > 0 ? "+" : ""}${w.offset} s` : ""}`);

/** An element's animations: what moves, and when (a time or a spoken word). */
export function ElementAnimations({ scene, el }: { scene: Scene; el: Element }) {
  const [preset, setPreset] = useState<Preset>("fade-in");
  const [mode, setMode] = useState<"time" | "word">("word");
  const [word, setWord] = useState<Text | undefined>(undefined);
  const [dur, setDur] = useState<number | undefined>(undefined);
  const [to, setTo] = useState<{ x?: number; y?: number }>({});
  const langs = lesson.value?.manifest.languages ?? [];
  const wordReady = word && typeof word === "object" && langs.every((l) => (word as Record<string, string>)[l.code]);
  const add = () => {
    const at: When = mode === "time" ? Math.round(playhead.value * 100) / 100 : { word: word! };
    if (edit([{ op: "animate", scene: scene.id, element: el.id, preset, at, ...(dur !== undefined ? { dur } : {}), ...(preset === "move-to" ? { to } : {}) }])) setWord(undefined);
  };
  const tracks = el.anim ?? [];
  return (
    <div class="anims">
      {tracks.length === 0 ? <p class="f-hint">{t("noAnimations")}</p> : null}
      {tracks.map((tr) => (
        <div class="anim" key={tr.prop}>
          <strong>{t(`prop_${tr.prop}` as Key)}</strong>
          <span class="keys">{tr.keys.map((k, i) => <span key={i} class="key">{whenText(k.at)} → {k.value}</span>)}</span>
          <button type="button" class="tool danger" aria-label={t("remove")} onClick={() => edit([{ op: "setTrack", scene: scene.id, element: el.id, prop: tr.prop as AnimProp, keys: null }])}>✕</button>
        </div>
      ))}
      <div class="anim-add">
        <Select label={t("animation")} value={preset} options={(Object.keys(PRESETS) as Preset[]).map((k) => [k, t(`preset_${k.replace("-", "_")}` as Key)])} onChange={setPreset} />
        <div class="seg" role="radiogroup" aria-label={t("when")}>
          <button type="button" role="radio" aria-checked={mode === "word"} class={mode === "word" ? "on" : ""} onClick={() => setMode("word")}>{t("onAWord")}</button>
          <button type="button" role="radio" aria-checked={mode === "time"} class={mode === "time" ? "on" : ""} onClick={() => setMode("time")}>{t("atPlayhead")} ({playhead.value.toFixed(1)} s)</button>
        </div>
        {mode === "word" ? <WordPicker value={word} onChange={setWord} /> : null}
        <div class="f-grid4">
          <NumField label={t("seconds")} value={dur} min={0} max={10} step={0.1} placeholder={String(PRESETS[preset].dur)} onCommit={setDur} />
          {preset === "move-to" ? <><NumField label={t("fX")} value={to.x} onCommit={(x) => setTo({ ...to, x })} /><NumField label={t("fY")} value={to.y} onCommit={(y) => setTo({ ...to, y })} /></> : null}
        </div>
        <button type="button" class="btn" disabled={mode === "word" && !wordReady} onClick={add}>{t("addAnimation")}</button>
      </div>
    </div>
  );
}

const ACTIONS: CueAction[] = ["highlight", "pulse", "reveal", "move"];

/** Cues: something happens to a part of the scene when a word is spoken. */
export function SceneCues({ scene }: { scene: Scene }) {
  const targets = [...targetsOf(scene)];
  const [action, setAction] = useState<CueAction>("highlight");
  const [target, setTarget] = useState<string | undefined>(targets[0]);
  const [word, setWord] = useState<Text | undefined>(undefined);
  const langs = lesson.value?.manifest.languages ?? [];
  const ready = !!target && word && typeof word === "object" && langs.every((l) => (word as Record<string, string>)[l.code]);
  const cues = scene.cues ?? [];
  return (
    <div class="anims">
      {cues.length === 0 ? <p class="f-hint">{t("noCues")}</p> : null}
      {cues.map((c: Cue, i) => (
        <div class="anim" key={i}>
          <strong>{t(`act_${c.action}` as Key)}</strong>
          <span class="keys"><span class="key">{c.target}</span> {c.word !== undefined ? `«${pick(c.word, lang.value)}»` : `${c.at} s`}</span>
          <button type="button" class="tool danger" aria-label={t("remove")} onClick={() => edit([{ op: "remove", scene: scene.id, path: `/cues/${i}` }])}>✕</button>
        </div>
      ))}
      <div class="anim-add">
        <div class="f-grid4">
          <Select label={t("action")} value={action} options={ACTIONS.map((a) => [a, t(`act_${a}` as Key)])} onChange={setAction} />
          <Select label={t("target")} value={target} options={targets.map((x) => [x, x])} onChange={setTarget} />
        </div>
        <WordPicker value={word} onChange={setWord} />
        <button type="button" class="btn" disabled={!ready}
          onClick={() => { if (edit([{ op: "addCue", scene: scene.id, cue: { word: word!, action, target: target! } }])) setWord(undefined); }}>{t("addCue")}</button>
      </div>
    </div>
  );
}
