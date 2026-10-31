import { useState } from "preact/hooks";
import type { AnimProp, Cue, CueAction, Element, Scene, Text, When } from "@lessonstudio/spec";
import { pick, targetsOf } from "@lessonstudio/spec";
import type { Ease } from "@lessonstudio/spec";
import { EASES } from "@lessonstudio/spec";
import { PRESETS, framesOf, presetKeys, type Preset } from "@lessonstudio/ops";
import { edit, lang, lesson, playhead, sceneIndex, timings } from "../editor.ts";
import { t, type Key } from "../i18n.ts";
import { focusParts, usableProps } from "../science.ts";
import { NumField, Select } from "./fields.tsx";

export const clean = (w: string): string => w.replace(/[.,،;؛:!?؟"'“”«»()]/g, "");

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

/** The ready-made animations that work on an element (the operation's own rules decide; move-to works on anything). */
export function usablePresets(el: Element): Preset[] {
  return (Object.keys(PRESETS) as Preset[]).filter((p) => {
    if (p === "move-to") return true;
    try { presetKeys(el, p, 0); return true; } catch { return false; }
  });
}

/** A keyframe's curve when nothing else is chosen: a part lights up at once; frames and data flow at an even pace. */
const easeFor = (prop: AnimProp): Ease => (prop === "focus" ? "step" : prop === "frame" || prop === "pass" ? "linear" : "in-out");

/** An element's animations: what moves, and when (a time or a spoken word). */
export function ElementAnimations({ scene, el }: { scene: Scene; el: Element }) {
  const presets = usablePresets(el);
  const props = usableProps(el);
  const [chosen, setPreset] = useState<Preset>("fade-in");
  const preset = presets.includes(chosen) ? chosen : presets[0]!;
  const [mode, setMode] = useState<"time" | "word">("word");
  const [word, setWord] = useState<Text | undefined>(undefined);
  const [dur, setDur] = useState<number | undefined>(undefined);
  const [to, setTo] = useState<{ x?: number; y?: number }>({});
  const [kprop, setKprop] = useState<AnimProp>("opacity");
  const prop = props.includes(kprop) ? kprop : props[0]!;
  const [kval, setKval] = useState<number | undefined>(undefined);
  const [kease, setKease] = useState<Ease | undefined>(undefined);
  const langs = lesson.value?.manifest.languages ?? [];
  const wordReady = word && typeof word === "object" && langs.every((l) => (word as Record<string, string>)[l.code]);
  const when = (): When => (mode === "time" ? Math.round(playhead.value * 100) / 100 : { word: word! });
  const add = () => {
    if (edit([{ op: "animate", scene: scene.id, element: el.id, preset, at: when(), ...(dur !== undefined ? { dur } : {}), ...(preset === "move-to" ? { to } : {}) }])) setWord(undefined);
  };
  const ease = kease ?? easeFor(prop);
  const addKey = () => {
    if (kval === undefined) return;
    if (edit([{ op: "setKeyframe", scene: scene.id, element: el.id, prop, key: { at: when(), value: kval, ...(ease !== "in-out" ? { ease } : {}) } }])) setWord(undefined);
  };
  // Plots and networks know their frame count; a pack element's is in its own data (0: not known here).
  const frames = prop === "frame" && (el.type === "plot" || el.type === "net") ? framesOf(el) : 0;
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
        <Select label={t("animation")} value={preset} options={presets.map((k) => [k, t(`preset_${k.replace("-", "_")}` as Key)])} onChange={setPreset} />
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
        <div class="kf-add" role="group" aria-label={t("oneKeyframe")}>
          <h4 class="f-sub">{t("oneKeyframe")}</h4>
          <div class="f-grid4">
            <Select label={t("kfProp")} value={prop} options={props.map((x) => [x, t(`prop_${x}` as Key)])} onChange={(v) => { setKprop(v); setKval(undefined); setKease(undefined); }} />
            <KeyValue key={prop} el={el} prop={prop} frames={frames} value={kval} onChange={setKval} />
            <Select label={t("ease")} value={ease} options={EASES.map((e) => [e, t(`ease_${e}` as Key)] as [Ease, string])} onChange={setKease} />
          </div>
          <button type="button" class="btn" disabled={kval === undefined || (mode === "word" && !wordReady)} onClick={addKey}>{t("addKeyframe")}</button>
        </div>
      </div>
    </div>
  );
}

/**
 * A keyframe's value. Light up names the parts it can light (a block, a series, a row, an equation's \g part), data
 * flow names the moments of a pass, and a frame says how many there are.
 */
function KeyValue(p: { el: Element; prop: AnimProp; frames: number; value: number | undefined; onChange: (v: number | undefined) => void }) {
  const choose = (v: number | "") => p.onChange(v === "" ? undefined : v);
  const parts = p.prop === "focus" ? focusParts(p.el, lang.value) : [];
  if (p.prop === "focus" && parts.length) {
    return <Select<number | ""> label={t("kfValue")} value={p.value} empty="—" onChange={choose}
      options={[[0, t("focusNone")], ...parts.map((x, i): [number, string] => [i + 1, `${i + 1}. ${x || `${t("netLayer")} ${i + 1}`}`])]} />;
  }
  if (p.prop === "pass") {
    return <Select<number | ""> label={t("kfValue")} value={p.value} empty="—" onChange={choose}
      options={[[0, t("passStart")], [1, t("passOut")], [2, t("passBack")], [-1, t("passOff")]]} />;
  }
  const unit = p.prop === "opacity" || p.prop === "draw" || p.prop === "reveal" ? { min: 0, max: 1, step: 0.05 }
    : p.prop === "scale" ? { min: 0, step: 0.05 }
    : p.prop === "frame" ? { min: 0, ...(p.frames ? { max: p.frames - 1 } : {}), step: 1 } : p.prop === "focus" ? { min: 0, step: 1 } : { step: 1 };
  return <NumField label={t("kfValue")} value={p.value} {...unit} onCommit={p.onChange}
    placeholder={p.prop === "frame" && p.frames ? t("frameRange").replace("{n}", String(p.frames - 1)) : undefined} />;
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
