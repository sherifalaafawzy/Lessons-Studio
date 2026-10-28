import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { AnimProp, Ease, Element, Key, Scene, SceneTiming, Text, Track, When } from "@lessonstudio/spec";
import { EASES, normalizeWord, pick, resolveWhen, walkElements } from "@lessonstudio/spec";
import type { Op } from "@lessonstudio/ops";
import {
  currentScene, edit, elementId, freeId, insertScene, lang, leftTab, lesson, lessonTime, playing, rightTab, sceneId, sceneTiming,
  recorder, seekLesson, selectScene, timings, tracks, wave,
} from "../editor.ts";
import { envelope, peaksOf, trackLoading } from "../voice.ts";
import { ClipWave } from "./Voice.tsx";
import { t, type Key as Msg } from "../i18n.ts";
import { GALLERY } from "../presets.ts";
import { Icon } from "../icons.tsx";
import { WordPicker, clean } from "./Animations.tsx";
import { TEMPLATE_NAMES } from "./content.tsx";
import { MiniScene, PRESET_MIME } from "./Gallery.tsx";
import { dropWhen, insertionIndex, moveTarget, r2, shiftWhen, ticksFor, timelinePps } from "../timeline.ts";
import { timecode } from "./Transport.tsx";
import { NumField, Select } from "./fields.tsx";

const LABEL = 112;
const SNAP = 8;

/** Keyframes of one track that happen at the same moment, across an element's properties: one diamond. */
interface Moment { key: string; when: When; at: number; found: boolean; keys: { prop: AnimProp; key: Key }[] }
interface Row { id: string; label: string; kind: "el" | "camera"; tracks: Track[]; moments: Moment[] }
interface Drag { row: string; moment: string | null; x0: number; t0: number; dt: number; snap: number | null; moved: boolean }
interface ClipDrag { id: string; from: number; x0: number; at: number; copy: boolean; moved: boolean }

function momentsOf(tracks: Track[], st: SceneTiming, code: string): Moment[] {
  const by = new Map<string, Moment>();
  for (const tr of tracks) {
    for (const k of tr.keys) {
      const id = JSON.stringify(k.at);
      let m = by.get(id);
      if (!m) {
        const r = resolveWhen(k.at, st, code);
        m = { key: id, when: k.at, at: r.at, found: r.found, keys: [] };
        by.set(id, m);
      }
      m.keys.push({ prop: tr.prop, key: k });
    }
  }
  return [...by.values()].sort((a, b) => a.at - b.at);
}

/** The ops that move one moment (or, with `moment` null, every keyframe of the row) to new times. */
function moveOps(scene: Scene, row: Row, map: (w: When) => When, moment: string | null): Op[] {
  const tracks = row.tracks.map((tr) => ({ prop: tr.prop, keys: tr.keys.map((k) => (moment === null || JSON.stringify(k.at) === moment ? { ...k, at: map(k.at) } : k)) }));
  return row.kind === "camera"
    ? [{ op: "setCamera", scene: scene.id, tracks }]
    : tracks.map((tr) => ({ op: "setTrack", scene: scene.id, element: row.id, prop: tr.prop, keys: tr.keys }));
}

/**
 * The lesson's timeline: a time ruler, every scene as a clip (drag to reorder, Alt+drag to copy, drop a gallery
 * scene between clips), each scene's voice (its waveform, or a place to record one), the spoken words, and for the selected scene a row per element (and the camera and cues)
 * with a diamond for each moment something changes. Drag a diamond to retime it, or onto a word to start it there;
 * drag a row's bar to move its whole animation; click a diamond to edit it. Ctrl+wheel zooms.
 */
export function Timeline() {
  const scroller = useRef<HTMLDivElement>(null);
  const [vw, setVw] = useState(800);
  const [zoomX, setZoomX] = useState(1);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [clip, setClip] = useState<ClipDrag | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const [scrub, setScrub] = useState(false);
  const [open, setOpen] = useState<{ row: string; moment: string } | null>(null);
  const track = tracks.value[lang.value];
  const voice = wave.value;
  const voicePath = useMemo(() => (voice ? envelope(voice.peaks) : null), [voice]);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(() => requestAnimationFrame(() => setVw(el.clientWidth)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const l = lesson.value;
  const code = lang.value;
  const tm = timings.value[code];
  const scene = currentScene.value;
  const st = sceneTiming.value;
  const dur = Math.max(1, tm?.duration ?? 1);
  const pps = timelinePps(vw - LABEL - 20, dur, zoomX);
  const x = (abs: number): number => Math.max(0, abs * pps);
  const now = lessonTime.value;

  // Ctrl+wheel zooms around the pointer.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const mx = e.clientX - el.getBoundingClientRect().left - LABEL;
      setZoomX((z) => {
        const next = Math.min(64, Math.max(1, z * Math.exp(-e.deltaY * 0.002)));
        const at = el.scrollLeft + mx;
        requestAnimationFrame(() => { el.scrollLeft = at * (next / z) - mx; });
        return next;
      });
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, []);

  // While playing, keep the playhead in view.
  useEffect(() => {
    const el = scroller.current;
    if (!el || !playing.value) return;
    const px = x(now);
    if (px < el.scrollLeft || px > el.scrollLeft + el.clientWidth - LABEL - 40) el.scrollLeft = Math.max(0, px - (el.clientWidth - LABEL) / 3);
  }, [now]);

  if (!l || !tm) return null;
  const langs = l.manifest.languages.map((g) => g.code);
  const dir = l.manifest.languages.find((g) => g.code === code)?.dir ?? "ltr";
  const clips = tm.scenes.map((s, i) => ({ start: s.start, end: s.end, scene: l.scenes.scenes[i]! })).filter((c) => c.scene);
  const off = st?.start ?? 0;
  const allWords = tm.scenes.flatMap((s, si) => s.words.map((w, i) => ({ text: w.w, s: w.s, e: w.e, si, i })));
  const sceneIdx = l.scenes.scenes.findIndex((s) => s.id === sceneId.value);
  const words = st ? st.words.map((w, i) => ({ text: w.w, s: w.s - off, e: w.e - off, i })) : [];
  const ticks = ticksFor(pps);
  const contentW = Math.ceil(dur * pps) + 24;

  const rows: Row[] = [];
  if (scene && st) {
    walkElements(scene, (el: Element) => {
      rows.push({ id: el.id, label: el.id, kind: "el", tracks: el.anim ?? [], moments: momentsOf(el.anim ?? [], st, code) });
    });
    if (scene.camera?.length) rows.push({ id: "camera", label: t("camera"), kind: "camera", tracks: scene.camera, moments: momentsOf(scene.camera, st, code) });
  }
  const sceneDur = st ? st.end - st.start : 0;
  const cues = scene && st ? (scene.cues ?? []).map((c, i) => {
    const r = c.at !== undefined ? { at: Math.min(c.at, sceneDur), found: true } : resolveWhen({ word: c.word ?? "", ...(c.occurrence ? { occurrence: c.occurrence } : {}) }, st, code);
    return { i, cue: c, at: r.at, found: r.found };
  }) : [];

  /** The selected scene's word nearest to a (scene) time, within the snap distance, with its occurrence. */
  const snapTo = (s: number): { idx: number; text: string; occurrence: number } | null => {
    let best: (typeof words)[number] | null = null;
    for (const w of words) if (Math.abs(w.s - s) * pps <= SNAP && (!best || Math.abs(w.s - s) < Math.abs(best.s - s))) best = w;
    if (!best) return null;
    const norm = normalizeWord(clean(best.text));
    const occurrence = words.slice(0, best.i + 1).filter((w) => normalizeWord(clean(w.text)) === norm).length;
    return { idx: best.i, text: clean(best.text), occurrence };
  };
  /** A pointer's time in the lesson. */
  const timeAt = (clientX: number): number => {
    const el = scroller.current!;
    return (clientX - el.getBoundingClientRect().left - LABEL + el.scrollLeft) / pps;
  };

  /** Pressing the time ruler, the waveform or the words moves the playhead there, and dragging scrubs. */
  const scrubFrom = (e: PointerEvent) => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); setScrub(true); seekLesson(timeAt(e.clientX)); };

  /* ---------- keyframes and cues (the selected scene) ---------- */
  const start = (e: PointerEvent, row: string, moment: string | null, t0: number) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ row, moment, x0: e.clientX, t0, dt: 0, snap: null, moved: false });
  };
  const move = (e: PointerEvent) => {
    if (scrub) { seekLesson(timeAt(e.clientX)); return; }
    if (clip) {
      const at = timeAt(e.clientX);
      setClip({ ...clip, at, moved: clip.moved || Math.abs(e.clientX - clip.x0) > 4, copy: e.altKey });
      return;
    }
    if (!drag) return;
    const dx = e.clientX - drag.x0;
    let dt = dx / pps;
    const s = snapTo(drag.t0 + dt);
    if (s) dt = words[s.idx]!.s - drag.t0;
    setDrag({ ...drag, dt, snap: s ? s.idx : null, moved: drag.moved || Math.abs(dx) > 3 });
  };
  const end = () => {
    if (scrub) { setScrub(false); return; }
    if (clip) { endClip(); return; }
    const d = drag;
    setDrag(null);
    if (!d || !scene) return;
    if (!d.moved) {
      if (d.row === "cues") return;
      if (d.moment) setOpen(open?.row === d.row && open.moment === d.moment ? null : { row: d.row, moment: d.moment });
      return;
    }
    if (d.row === "cues") {
      const c = cues.find((q) => String(q.i) === d.moment);
      if (!c) return;
      const s = d.snap !== null ? snapTo(words[d.snap]!.s) : null;
      // A cue on a time takes the new time; a cue on a word moves only onto another word.
      if (c.cue.at === undefined && !s) return;
      const next = c.cue.at !== undefined
        ? { ...c.cue, at: r2(Math.max(0, d.t0 + d.dt)) }
        : { ...c.cue, word: setLang(c.cue.word, code, s!.text, langs), occurrence: s!.occurrence > 1 ? s!.occurrence : undefined };
      edit([{ op: "set", scene: scene.id, path: `/cues/${c.i}`, value: Object.fromEntries(Object.entries(next).filter(([, v]) => v !== undefined)) }]);
      return;
    }
    const row = rows.find((r) => r.id === d.row);
    if (!row) return;
    if (d.moment === null) {
      edit(moveOps(scene, row, (w) => shiftWhen(w, d.dt), null));
      return;
    }
    const m = row.moments.find((q) => q.key === d.moment);
    if (!m) return;
    const s = d.snap !== null ? snapTo(words[d.snap]!.s) : null;
    const to = dropWhen(m.when, m.at, m.at + d.dt, s ? { text: s.text, occurrence: s.occurrence } : null, code, langs);
    edit(moveOps(scene, row, () => to, d.moment));
    setOpen(null);
  };

  /* ---------- scene clips ---------- */
  const startClip = (e: PointerEvent, id: string, from: number) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setClip({ id, from, x0: e.clientX, at: timeAt(e.clientX), copy: e.altKey, moved: false });
  };
  const endClip = () => {
    const c = clip;
    setClip(null);
    if (!c) return;
    if (!c.moved) { selectScene(c.id); return; }
    const before = insertionIndex(c.at, clips);
    if (c.copy) {
      const id = freeId(c.id, l.scenes.scenes.map((s) => s.id));
      if (edit([{ op: "duplicateScene", scene: c.id, id, at: before }])) selectScene(id);
    } else if (moveTarget(c.from, before) !== c.from) {
      edit([{ op: "moveScene", scene: c.id, to: moveTarget(c.from, before) }]);
    }
  };
  const dropPreset = (e: DragEvent) => {
    const id = e.dataTransfer?.getData(PRESET_MIME);
    const at = dropAt;
    setDropAt(null);
    const p = GALLERY.find((g) => g.id === id);
    if (!p || at === null) return;
    e.preventDefault();
    insertScene(p.id, (sid) => p.make({ id: sid, langs, stage: l.manifest.stage ?? "landscape" }), at);
  };
  const marker = clip?.moved ? insertionIndex(clip.at, clips) : dropAt;
  const markerX = marker === null ? null : marker >= clips.length ? x(dur) : x(clips[marker]!.start);

  const shiftOf = (row: string, moment: string | null): number => (drag && drag.moved && drag.row === row && (drag.moment === moment || drag.moment === null) ? drag.dt : 0);
  const openRow = open ? rows.find((r) => r.id === open.row) : undefined;
  const openMoment = openRow?.moments.find((m) => m.key === open!.moment);

  const tickEls = [];
  for (let s = 0; s <= dur + 1e-6; s += ticks.step) {
    const labelled = Math.abs(s / ticks.label - Math.round(s / ticks.label)) < 1e-6;
    tickEls.push(<span key={s} class={labelled ? "tick big" : "tick"} style={{ left: `${x(s)}px` }}>{labelled ? timecode(s).replace(/\.00$/, "") : null}</span>);
  }

  return (
    <div class="timeline" dir="ltr" onPointerMove={(e) => move(e as PointerEvent)} onPointerUp={end} onPointerCancel={end}>
      <div class="tl-bar-head">
        <strong>{t("timeline")}</strong>
        <span class="f-hint">{t("timelineHint")}</span>
        <span class="spacer" />
        <button type="button" class="btn ghost icon" aria-label={t("zoomOut")} title={t("zoomOut")} disabled={zoomX <= 1} onClick={() => setZoomX(Math.max(1, zoomX / 1.5))}><Icon name="zoomOut" /></button>
        <input type="range" class="tl-zoom" min={0} max={6} step={0.05} value={Math.log2(zoomX)} aria-label={t("timelineZoom")}
          onInput={(e) => setZoomX(2 ** Number((e.target as HTMLInputElement).value))} />
        <button type="button" class="btn ghost icon" aria-label={t("zoomIn")} title={t("zoomIn")} disabled={zoomX >= 64} onClick={() => setZoomX(Math.min(64, zoomX * 1.5))}><Icon name="zoomIn" /></button>
        <button type="button" class="btn ghost icon" aria-label={t("fitLesson")} title={t("fitLesson")} onClick={() => setZoomX(1)}><Icon name="fit" /></button>
      </div>
      <div class="tl-scroll" ref={scroller}>
        <div class="tl-content" style={{ width: `${LABEL + contentW}px` }}>
          <div class="tl-sticky">
            <div class="tl-row tl-time">
              <span class="tl-label">{t("timeRuler")}</span>
              <div class="tl-track" style={{ width: `${contentW}px` }} onPointerDown={(e) => scrubFrom(e as PointerEvent)}>
                {tickEls}
              </div>
            </div>
            <div class="tl-row tl-scenes">
              <span class="tl-label">{t("panelScenes")}</span>
              <div class="tl-track" style={{ width: `${contentW}px` }}
                onDragOver={(e) => { if (e.dataTransfer?.types.includes(PRESET_MIME)) { e.preventDefault(); setDropAt(insertionIndex(timeAt(e.clientX), clips)); } }}
                onDragLeave={() => setDropAt(null)} onDrop={(e) => dropPreset(e as DragEvent)}>
                {clips.map((c, i) => {
                  const w = Math.max(6, x(c.end) - x(c.start) - 2);
                  const s = c.scene;
                  const text = (s.narration[code] ?? "").split(/\s+/).slice(0, 8).join(" ");
                  return (
                    <div key={s.id} class={`clip tpl-${s.template}${s.id === sceneId.value ? " on" : ""}${clip?.id === s.id && clip.moved ? " lifting" : ""}`}
                      style={{ left: `${x(c.start) + 1}px`, width: `${w}px` }} role="button" tabIndex={0}
                      aria-label={`${t("scene")} ${i + 1}: ${t(TEMPLATE_NAMES[s.template])}`} title={`${i + 1}. ${t(TEMPLATE_NAMES[s.template])}${t("sep")}${timecode(c.end - c.start)}`}
                      onPointerDown={(e) => startClip(e as PointerEvent, s.id, i)}
                      onKeyDown={(e) => { if (e.key === "Enter") selectScene(s.id); }}>
                      {w > 150 ? <MiniScene scene={s} hoverPlay={false} /> : null}
                      <span class="clip-text">
                        <span class="clip-name"><b>{i + 1}</b> {t(TEMPLATE_NAMES[s.template])}</span>
                        {w > 90 ? <span class="clip-words" dir={dir} lang={code}>{text}</span> : null}
                      </span>
                      {s.transition && s.transition.type !== "cut" ? <span class="clip-tr" title={s.transition.type} /> : null}
                      {s.check ? <span class="clip-check" title={t("quickCheck")}>?</span> : null}
                    </div>
                  );
                })}
                <button type="button" class="clip-add" style={{ left: `${x(dur) + 4}px` }} aria-label={t("addScene")} title={t("addScene")} onClick={() => { leftTab.value = "add"; }}>+</button>
                {markerX !== null ? <span class="clip-marker" style={{ left: `${markerX}px` }} /> : null}
              </div>
            </div>
            {track ? (
              <div class="tl-row tl-voice">
                <span class="tl-label">{t("narrationAudio")}{trackLoading.value === code ? <span class="tl-spin" role="status" aria-label={t("voiceLoading")} title={t("voiceLoading")} /> : null}</span>
                <div class="tl-track" style={{ width: `${contentW}px` }} onPointerDown={(e) => scrubFrom(e as PointerEvent)}>
                  {track.parts.map((p, i) => {
                    const w = Math.max(3, x(p.start + p.seconds) - x(p.start) - 2);
                    const where = `${t("scene")} ${i + 1}${t("sep")}${timecode(p.seconds)}`;
                    return p.clip ? (
                      <div key={p.scene} class={`vseg ${p.clip.kind}${p.scene === sceneId.value ? " on" : ""}`} style={{ left: `${x(p.start) + 1}px`, width: `${w}px` }}
                        title={`${where}${t("sep")}${t(p.clip.kind === "ai" ? "kindAi" : p.clip.kind === "recorded" ? "kindRecorded" : "kindUploaded")}`}>
                        <ClipWave peaks={peaksOf(p.clip)} />
                      </div>
                    ) : (
                      <button type="button" key={p.scene} class={`vseg empty${p.stale ? " stale" : ""}`} style={{ left: `${x(p.start) + 1}px`, width: `${w}px` }}
                        title={`${where}${t("sep")}${p.stale ? t("voiceChanged") : t("voiceSilent")}${t("sep")}${t("recordVoice")}`}
                        aria-label={`${t("recordVoice")}: ${t("scene")} ${i + 1}`}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={() => { selectScene(p.scene); recorder.value = { scene: p.scene, lang: code }; }}>
                        <Icon name="mic" />{w > 84 ? <span>{p.stale ? t("voiceChanged") : t("voiceSilent")}</span> : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : voice && voicePath ? (
              <div class="tl-row tl-voice">
                <span class="tl-label">{t("narrationAudio")}</span>
                <div class="tl-track" style={{ width: `${contentW}px` }} onPointerDown={(e) => scrubFrom(e as PointerEvent)}>
                  <svg class="tl-wave" viewBox={`0 0 ${voice.peaks.length} 100`} preserveAspectRatio="none"
                    style={{ width: `${x(voice.peaks.length / voice.rate)}px` }} role="img" aria-label={t("narrationAudio")}>
                    <path d={voicePath} />
                  </svg>
                </div>
              </div>
            ) : null}
            <div class="tl-row tl-ruler">
              <span class="tl-label">{t("words")}</span>
              <div class="tl-track" style={{ width: `${contentW}px` }} onPointerDown={(e) => scrubFrom(e as PointerEvent)}>
                {allWords.map((w) => {
                  const mine = w.si === sceneIdx;
                  return (
                    <span key={`${w.si}-${w.i}`} class={`tl-word${mine ? "" : " other"}${mine && drag?.snap === w.i ? " snap" : ""}${now >= w.s && now < w.e ? " on" : ""}`} dir={dir} lang={code}
                      style={{ left: `${x(w.s)}px`, maxWidth: `${Math.max(14, (w.e - w.s) * pps + 6)}px`, top: w.i % 2 ? "15px" : "1px" }} title={w.text}>{w.text}</span>
                  );
                })}
              </div>
            </div>
          </div>
          {rows.map((row) => {
            const first = row.moments[0], last = row.moments[row.moments.length - 1];
            const bar = shiftOf(row.id, null);
            return (
              <div key={row.id} class={`tl-row${row.id === elementId.value ? " chosen" : ""}`}>
                <button type="button" class="tl-label" dir="ltr" title={row.label}
                  onClick={() => { if (row.kind === "el") { elementId.value = row.id; rightTab.value = "animate"; } }}>{row.label}</button>
                <div class="tl-track" style={{ width: `${contentW}px` }}>
                  <span class="tl-span" style={{ left: `${x(off)}px`, width: `${x(off + sceneDur) - x(off)}px` }} />
                  {first && last && last.at > first.at ? (
                    <span class="tl-bar" title={t("dragToMoveAll")} style={{ left: `${x(off + first.at + bar)}px`, width: `${x(off + last.at) - x(off + first.at)}px` }}
                      onPointerDown={(e) => start(e as PointerEvent, row.id, null, first.at)} />
                  ) : null}
                  {row.moments.map((m) => (
                    <button type="button" key={m.key} class={`tl-key${m.found ? "" : " lost"}${typeof m.when === "number" ? "" : " word"}${open?.row === row.id && open.moment === m.key ? " open" : ""}`}
                      style={{ left: `${x(off + m.at + shiftOf(row.id, m.key))}px` }}
                      aria-label={`${row.label} ${m.keys.map((k) => k.prop).join(", ")} ${typeof m.when === "number" ? `${m.at.toFixed(2)} s` : `«${pick(m.when.word, code)}»`}`}
                      onPointerDown={(e) => start(e as PointerEvent, row.id, m.key, m.at)} />
                  ))}
                </div>
              </div>
            );
          })}
          {cues.length ? (
            <div class="tl-row tl-cues">
              <span class="tl-label">{t("cuesShort")}</span>
              <div class="tl-track" style={{ width: `${contentW}px` }}>
                {cues.map((c) => (
                  <button type="button" key={c.i} class={`tl-cue ${c.cue.action}${c.found ? "" : " lost"}`} title={`${t(`act_${c.cue.action}` as Msg)} → ${c.cue.target}`}
                    style={{ left: `${x(off + c.at + (drag?.moved && drag.row === "cues" && drag.moment === String(c.i) ? drag.dt : 0))}px` }}
                    aria-label={`${c.cue.action} ${c.cue.target}`}
                    onPointerDown={(e) => start(e as PointerEvent, "cues", String(c.i), c.at)} />
                ))}
              </div>
            </div>
          ) : null}
          {scene && !rows.length && !cues.length ? <p class="f-hint tl-empty">{t("timelineEmpty")}</p> : null}
          <span class="tl-playhead" style={{ left: `${LABEL + x(now)}px` }} />
        </div>
      </div>
      {openRow && openMoment && scene ? <MomentEditor scene={scene} row={openRow} m={openMoment} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}

function setLang(w: Text | undefined, code: string, text: string, langs: string[]): Text {
  const base: Record<string, string> = w === undefined ? {} : typeof w === "string" ? Object.fromEntries(langs.map((l) => [l, w])) : { ...w };
  base[code] = text;
  return base;
}

/** One moment of an element's animation: each property's value and curve, when it happens, or remove it. */
function MomentEditor({ scene, row, m, onClose }: { scene: Scene; row: Row; m: Moment; onClose: () => void }) {
  const [word, setWord] = useState<Text | undefined>(typeof m.when === "number" ? undefined : m.when.word);
  const save = (map: (k: Key, prop: AnimProp) => Key | null) => {
    const tracks = row.tracks.map((tr) => ({
      prop: tr.prop,
      keys: tr.keys.flatMap((k) => (JSON.stringify(k.at) === m.key ? (map(k, tr.prop) ?? []) : [k])),
    }));
    const ops: Op[] = row.kind === "camera"
      ? [{ op: "setCamera", scene: scene.id, tracks: tracks.filter((tr) => tr.keys.length) }]
      : tracks.map((tr) => ({ op: "setTrack", scene: scene.id, element: row.id, prop: tr.prop, keys: tr.keys.length ? tr.keys : null }));
    if (edit(ops)) onClose();
  };
  const at = (when: When) => save((k) => ({ ...k, at: when }));
  const langs = lesson.value?.manifest.languages ?? [];
  const wordReady = word && typeof word === "object" && langs.every((x) => (word as Record<string, string>)[x.code]);
  return (
    <div class="tl-editor" role="dialog" aria-label={t("keyframe")}>
      <div class="tl-ed-head">
        <strong dir="ltr">{row.label}</strong>
        <span class="f-hint" dir="ltr">{m.at.toFixed(2)} s{typeof m.when === "number" ? "" : `${t("sep")}«${pick(m.when.word, lang.value)}»${m.when.offset ? ` ${m.when.offset > 0 ? "+" : ""}${m.when.offset} s` : ""}`}</span>
        <button type="button" class="link" onClick={onClose}>{t("close")}</button>
      </div>
      {m.keys.map(({ prop, key }) => (
        <div class="f-grid4" key={prop}>
          <NumField label={t(`prop_${prop}` as Msg)} value={key.value} step={prop === "opacity" || prop === "draw" || prop === "reveal" || prop === "scale" ? 0.05 : 1}
            onCommit={(v) => { if (v !== undefined) save((k, p) => (p === prop ? { ...k, value: v } : k)); }} />
          <Select label={t("ease")} value={key.ease ?? "in-out"} options={EASES.map((e) => [e, t(`ease_${e}` as Msg)] as [Ease, string])}
            onChange={(v) => save((k, p) => (p === prop ? { ...k, ease: v as Ease } : k))} />
        </div>
      ))}
      <div class="tl-ed-when">
        {typeof m.when === "number" ? (
          <NumField label={t("seconds")} value={m.when} min={0} max={600} step={0.05} onCommit={(v) => { if (v !== undefined) at(r2(v)); }} />
        ) : (
          <NumField label={t("offset")} value={m.when.offset ?? 0} min={-10} max={10} step={0.05}
            onCommit={(v) => { const w = m.when as Exclude<When, number>; const { offset: _o, ...rest } = w; at(v ? { ...rest, offset: r2(v) } : rest); }} />
        )}
        <p class="f-hint">{t("startOnWord")}</p>
        <WordPicker value={word} onChange={setWord} />
        <div class="tl-ed-actions">
          <button type="button" class="btn small" disabled={!wordReady} onClick={() => at({ word: word! })}>{t("anchorHere")}</button>
          {typeof m.when === "number" ? null : <button type="button" class="link" onClick={() => at(r2(m.at))}>{t("useTimeInstead")}</button>}
          <span class="spacer" />
          <button type="button" class="link danger" onClick={() => save(() => null)}>{t("remove")}</button>
        </div>
      </div>
    </div>
  );
}

