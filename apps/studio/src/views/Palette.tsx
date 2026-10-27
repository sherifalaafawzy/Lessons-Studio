import { useEffect, useRef, useState } from "preact/hooks";
import { TEMPLATES, pick } from "@lessonstudio/spec";
import {
  currentScene, elementId, guides, insertScene, lang, leftTab, lesson, loopScene, rightTab, selectScene, sync, togglePlay, zoom,
} from "../editor.ts";
import { go, say } from "../state.ts";
import { t, uiLang } from "../i18n.ts";
import { GALLERY } from "../presets.ts";
import { ELEMENT_KINDS, TEMPLATE_NAMES, addElement, newScene } from "./content.tsx";
import type { Modal } from "./Editor.tsx";

interface Command { id: string; label: string; group: string; run: () => void }

/** Every action in one list, built from the lesson as it is now. */
function commands(open: (m: Modal) => void): Command[] {
  const l = lesson.value;
  if (!l) return [];
  const langs = l.manifest.languages.map((x) => x.code);
  const stage = l.manifest.stage ?? "landscape";
  const scene = currentScene.value;
  const g = guides.value;
  const out: Command[] = [];
  const add = (id: string, label: string, group: string, run: () => void) => out.push({ id, label, group, run });
  l.scenes.scenes.forEach((s, i) => {
    const words = (s.narration[lang.value] ?? "").split(/\s+/).slice(0, 7).join(" ");
    add(`go-${s.id}`, `${t("goToScene")} ${i + 1}: ${words}`, t("panelScenes"), () => selectScene(s.id));
  });
  for (const p of GALLERY) add(`preset-${p.id}`, `${t("addScene")}: ${p.name[uiLang.value]}`, t("panelAdd"), () => { insertScene(p.id, (id) => p.make({ id, langs, stage })); leftTab.value = "scenes"; });
  for (const tp of TEMPLATES) add(`blank-${tp}`, `${t("addBlankScene")}: ${t(TEMPLATE_NAMES[tp])}`, t("panelAdd"), () => { insertScene(tp === "title-hook" ? "intro" : tp, (id) => newScene(tp, id)); });
  if (scene) for (const k of ELEMENT_KINDS) add(`el-${k.key}`, `${t("addElement")}: ${t(k.label)}`, t("canvas"), () => { const id = addElement(scene, k.key); if (id) elementId.value = id; });
  add("play", t("playPause"), t("transport"), togglePlay);
  add("loop", `${t("loopScene")}: ${loopScene.value ? t("on") : t("off")}`, t("transport"), () => { loopScene.value = !loopScene.value; });
  add("fit", t("fit"), t("zoom"), () => { zoom.value = "fit"; });
  add("z100", "100%", t("zoom"), () => { zoom.value = 1; });
  add("safe", `${t("safeAreas")}: ${g.safe ? t("on") : t("off")}`, t("canvas"), () => { guides.value = { ...g, safe: !g.safe }; });
  add("center", `${t("centreLines")}: ${g.center ? t("on") : t("off")}`, t("canvas"), () => { guides.value = { ...g, center: !g.center }; });
  add("thirds", `${t("thirds")}: ${g.thirds ? t("on") : t("off")}`, t("canvas"), () => { guides.value = { ...g, thirds: !g.thirds }; });
  for (const x of l.manifest.languages) if (x.code !== lang.value) add(`lang-${x.code}`, `${t("lessonLanguage")}: ${x.name}`, t("languages"), () => { lang.value = x.code; });
  for (const [k, label] of [["design", "tab_design"], ["animate", "tab_animate"], ["scene", "tab_scene"], ["lesson", "tab_lesson"]] as const) {
    add(`tab-${k}`, `${t("inspector")}: ${t(label)}`, t("inspector"), () => { rightTab.value = k; });
  }
  add("undo", t("undo"), t("lessonDetails"), () => { const e = sync.value?.undo(); if (e) say(e, true); });
  add("redo", t("redo"), t("lessonDetails"), () => { const e = sync.value?.redo(); if (e) say(e, true); });
  add("preview", t("preview"), t("lessonDetails"), () => open("preview"));
  add("export", t("export"), t("lessonDetails"), () => open("export"));
  add("keys", t("shortcuts"), t("help"), () => open("keys"));
  add("lessons", t("backToLessons"), t("studio"), () => go("/"));
  add("settings", t("settings"), t("studio"), () => go("/settings"));
  add("connect", t("connectAi"), t("studio"), () => go("/connect"));
  return out;
}

/** Ranks commands by how well they match: every word must appear; earlier matches rank higher. */
export function matchCommands<C extends { label: string; group: string }>(list: C[], q: string): C[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return list;
  return list
    .map((c) => ({ c, hay: `${c.label} ${c.group}`.toLowerCase() }))
    .filter(({ hay }) => words.every((w) => hay.includes(w)))
    .sort((a, b) => a.hay.indexOf(words[0]!) - b.hay.indexOf(words[0]!))
    .map(({ c }) => c);
}

/** Ctrl+K: type to find any action, Enter to run it. */
export function Palette({ onClose, open }: { onClose: () => void; open: (m: Modal) => void }) {
  const [q, setQ] = useState("");
  const [i, setI] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); }, []);
  const list = matchCommands(commands(open), q).slice(0, 60);
  const run = (c: Command | undefined) => { if (!c) return; onClose(); c.run(); };
  const title = pick(lesson.value?.manifest.title ?? "", lang.value);
  return (
    <div class="modal" role="dialog" aria-modal="true" aria-label={t("commands")} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div class="modal-box palette-box">
        <input ref={input} value={q} aria-label={t("commands")} placeholder={`${t("typeCommand")} (${title})`} role="combobox" aria-expanded="true" aria-controls="cmd-list"
          onInput={(e) => { setQ((e.target as HTMLInputElement).value); setI(0); }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setI(Math.min(list.length - 1, i + 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setI(Math.max(0, i - 1)); }
            else if (e.key === "Enter") { e.preventDefault(); run(list[i]); }
            else if (e.key === "Escape") { e.preventDefault(); onClose(); }
          }} />
        <ul class="cmd-list" id="cmd-list" role="listbox">
          {list.map((c, n) => (
            <li key={c.id} role="option" aria-selected={n === i}>
              <button type="button" class={n === i ? "on" : ""} onMouseEnter={() => setI(n)} onClick={() => run(c)}>
                <span dir="auto">{c.label}</span><span class="cmd-group">{c.group}</span>
              </button>
            </li>
          ))}
          {!list.length ? <li class="insp-note">{t("noCommand")}</li> : null}
        </ul>
      </div>
    </div>
  );
}
