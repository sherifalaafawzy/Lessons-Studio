import { useEffect, useState } from "preact/hooks";
import { pick } from "@lessonstudio/spec";
import {
  closeLesson, currentElement, currentScene, dockHeight, edit, elementId, lang, leftTab, lesson, lessonTime, loopScene, openLesson,
  playhead, recorder, sceneTiming, seekLesson, stagePlayer, state, sync, togglePlay, viewScale, zoom, type LeftTab,
} from "../editor.ts";
import { Recorder } from "./Voice.tsx";
import { go, say } from "../state.ts";
import { t, viaName, type Key } from "../i18n.ts";
import { Icon, type IconName } from "../icons.tsx";
import { Checks } from "./Checks.tsx";
import { Inspector } from "./Inspector.tsx";
import { Preview } from "./Preview.tsx";
import { Stage } from "./Stage.tsx";
import { Storyboard } from "./Storyboard.tsx";
import { AddPanel } from "./Gallery.tsx";
import { Layers } from "./Layers.tsx";
import { Transport, stepZoom } from "./Transport.tsx";
import { Timeline } from "./Timeline.tsx";
import { Palette } from "./Palette.tsx";
import { Export, Shortcuts } from "./Export.tsx";
import { moveOps } from "./content.tsx";

export type Modal = null | "preview" | "palette" | "keys" | "export";

const typingIn = (el: EventTarget | null): boolean => {
  const n = el as HTMLElement | null;
  return !!n && (/^(INPUT|TEXTAREA|SELECT)$/.test(n.tagName) || n.isContentEditable);
};

const LEFT: { key: LeftTab; icon: IconName; label: Key }[] = [
  { key: "scenes", icon: "scenes", label: "panelScenes" },
  { key: "add", icon: "add", label: "panelAdd" },
  { key: "layers", icon: "layers", label: "panelLayers" },
];

/**
 * The editor, laid out like a video editor: a rail of panels, the scene list (or the gallery, or layers), the canvas,
 * the inspector, the transport and the timeline dock. On phones, one panel at a time.
 */
export function Editor({ id }: { id: string }) {
  const [modal, setModal] = useState<Modal>(null);
  const [panel, setPanel] = useState<"board" | "stage" | "inspector">("stage");
  useEffect(() => {
    openLesson(id);
    return () => { recorder.value = null; closeLesson(); };
  }, [id]);

  // Keyboard: an editor's keys. Space is the Stage's (tap to play, hold to pan).
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (typingIn(e.target)) return;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      const el = currentElement.value;
      const sc = currentScene.value;
      const st = sceneTiming.value;
      const now = lessonTime.value;
      const run = (f: () => void) => { e.preventDefault(); f(); };
      if (mod && key === "z") run(() => { const err = e.shiftKey ? sync.value?.redo() : sync.value?.undo(); if (err) say(err, true); });
      else if (mod && key === "y") run(() => { const err = sync.value?.redo(); if (err) say(err, true); });
      else if (mod && key === "k") run(() => setModal("palette"));
      else if (mod && key === "0") run(() => { zoom.value = "fit"; });
      else if (mod && key === "1") run(() => { zoom.value = 1; });
      else if (mod && (key === "=" || key === "+")) run(() => { zoom.value = stepZoom(viewScale.value, 1); });
      else if (mod && key === "-") run(() => { zoom.value = stepZoom(viewScale.value, -1); });
      else if (mod || e.altKey) return;
      else if (e.key === "?") run(() => setModal("keys"));
      else if (key === "r") run(() => setModal("export"));
      else if (key === "k") run(togglePlay);
      else if (key === "j") run(() => seekLesson(now - 2));
      else if (key === "l" && e.shiftKey) run(() => { loopScene.value = !loopScene.value; });
      else if (key === "l") run(() => seekLesson(now + 2));
      else if (e.key === "Home" && st) run(() => { stagePlayer.value?.pause(); playhead.value = 0; });
      else if (e.key === "End" && st) run(() => { stagePlayer.value?.pause(); playhead.value = Math.max(0, st.end - st.start - 0.05); });
      else if (el && sc) {
        const step = e.shiftKey ? 10 : 1;
        const d: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
        if (d[e.key]) run(() => edit(moveOps(sc, el, d[e.key]![0], d[e.key]![1])));
        else if (e.key === "Delete" || e.key === "Backspace") run(() => { if (edit([{ op: "removeElement", scene: sc.id, element: el.id }])) elementId.value = null; });
        else if (e.key === "Escape") elementId.value = null;
      } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        // No element selected: the arrows step through time (Shift: a second at a time).
        run(() => seekLesson(now + (e.key === "ArrowRight" ? 1 : -1) * (e.shiftKey ? 1 : 0.1)));
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
  const left = leftTab.value;

  return (
    <div class="editor">
      <header class="bar">
        <button type="button" class="link" onClick={() => go("/")}>← {t("lessons")}</button>
        <h1 dir="auto">{pick(l.manifest.title, lang.value)}</h1>
        <span class={`status ${s.status}`} role="status">{status}</span>
        <span class="spacer" />
        <button type="button" class="btn icon ghost" disabled={!s.canUndo} aria-label={t("undo")} title={`${t("undo")} (Ctrl+Z)`} onClick={() => { const e = sync.value?.undo(); if (e) say(e, true); }}><Icon name="undo" /></button>
        <button type="button" class="btn icon ghost" disabled={!s.canRedo} aria-label={t("redo")} title={`${t("redo")} (Ctrl+Y)`} onClick={() => { const e = sync.value?.redo(); if (e) say(e, true); }}><Icon name="redo" /></button>
        <label class="langsel">
          <span class="sr">{t("lessonLanguage")}</span>
          <select value={lang.value} onChange={(e) => { lang.value = (e.target as HTMLSelectElement).value; }} aria-label={t("lessonLanguage")}>
            {l.manifest.languages.map((g) => <option key={g.code} value={g.code} lang={g.code}>{g.name}</option>)}
          </select>
        </label>
        <Checks />
        <button type="button" class="btn icon ghost" aria-label={t("commands")} title={`${t("commands")} (Ctrl+K)`} onClick={() => setModal("palette")}><Icon name="command" /></button>
        <button type="button" class="btn" onClick={() => setModal("preview")}><Icon name="preview" /> {t("preview")}</button>
        <button type="button" class="btn primary" title={`${t("export")} (R)`} onClick={() => setModal("export")}><Icon name="export" /> {t("export")}</button>
      </header>
      {remote ? <div class="ai-banner" role="status">{t("editedBy")} {viaName(remote.via)}{remote.scenes.length ? ` (${remote.scenes.join(", ")})` : ""}</div> : null}
      <nav class="tabs" aria-label={t("panels")}>
        {(["board", "stage", "inspector"] as const).map((p) => (
          <button type="button" key={p} aria-pressed={panel === p} class={panel === p ? "on" : ""} onClick={() => setPanel(p)}>{t(`panel_${p}`)}</button>
        ))}
      </nav>
      <div class={`ws show-${panel}${left ? "" : " no-left"}`}>
        <nav class="rail" aria-label={t("tools")}>
          {LEFT.map((x) => (
            <button type="button" key={x.key} aria-pressed={left === x.key} title={t(x.label)} aria-label={t(x.label)}
              onClick={() => { leftTab.value = left === x.key ? null : x.key; }}><Icon name={x.icon} /></button>
          ))}
          <span class="rail-sep" />
          <button type="button" title={`${t("shortcuts")} (?)`} aria-label={t("shortcuts")} onClick={() => setModal("keys")}><Icon name="keyboard" /></button>
        </nav>
        <div class="left">
          <div class="left-head"><h2>{t(LEFT.find((x) => x.key === (left ?? "scenes"))!.label)}</h2></div>
          {(left ?? "scenes") === "scenes" ? <Storyboard /> : left === "add" ? <AddPanel /> : <Layers />}
        </div>
        <Stage />
        <Inspector />
      </div>
      <Transport />
      <Dock />
      {modal === "preview" ? <Preview onClose={() => setModal(null)} /> : null}
      {modal === "palette" ? <Palette onClose={() => setModal(null)} open={setModal} /> : null}
      {modal === "keys" ? <Shortcuts onClose={() => setModal(null)} /> : null}
      {modal === "export" ? <Export onClose={() => setModal(null)} /> : null}
      {recorder.value ? <Recorder key={`${recorder.value.scene}:${recorder.value.lang}:${recorder.value.file?.name ?? ""}`} {...recorder.value} onClose={() => { recorder.value = null; }} /> : null}
    </div>
  );
}

/** The timeline, docked under the canvas; drag its top edge to make it taller or shorter. */
function Dock() {
  const [active, setActive] = useState(false);
  const down = (e: PointerEvent) => {
    const y0 = e.clientY, h0 = dockHeight.value;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setActive(true);
    const move = (ev: PointerEvent) => { dockHeight.value = Math.max(110, Math.min(innerHeight * 0.6, h0 - (ev.clientY - y0))); };
    const up = () => { setActive(false); removeEventListener("pointermove", move); removeEventListener("pointerup", up); };
    addEventListener("pointermove", move);
    addEventListener("pointerup", up);
  };
  return (
    <section class="dock" style={{ blockSize: `${dockHeight.value}px` }} aria-label={t("timeline")}>
      <div class={`dock-grip${active ? " active" : ""}`} role="separator" aria-orientation="horizontal" aria-label={t("resizeDock")} onPointerDown={(e) => down(e as PointerEvent)} />
      <Timeline />
    </section>
  );
}
