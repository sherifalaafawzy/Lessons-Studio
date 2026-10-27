import { useEffect, useRef, useState } from "preact/hooks";
import type { AnimProp, Ease, Element, Key, Scene, SceneTiming, Text, Track, When } from "@lessonstudio/spec";
import { EASES, normalizeWord, pick, resolveWhen, walkElements } from "@lessonstudio/spec";
import type { Op } from "@lessonstudio/ops";
import { currentScene, edit, elementId, lang, lesson, playhead, sceneTiming } from "../editor.ts";
import { t, type Key as Msg } from "../i18n.ts";
import { WordPicker, clean } from "./Animations.tsx";
import { dropWhen, r2, shiftWhen } from "../timeline.ts";
import { NumField, Select } from "./fields.tsx";

const LABEL = 112;
const SNAP = 8;

/** Keyframes of one track that happen at the same moment, across an element's properties: one diamond. */
interface Moment { key: string; when: When; at: number; found: boolean; keys: { prop: AnimProp; key: Key }[] }
interface Row { id: string; label: string; kind: "el" | "camera"; tracks: Track[]; moments: Moment[] }
interface Drag { row: string; moment: string | null; x0: number; t0: number; dt: number; snap: number | null; moved: boolean }

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
 * The scene's timeline: its spoken words on a ruler, a row per element (and the camera) with a diamond for each
 * moment something changes, and the cues. Drag a diamond to retime it, or onto a word to start it there; drag a
 * row's bar to move its whole animation. Click a diamond to edit it.
 */
export function Timeline({ onSeek }: { onSeek: (t: number) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [open, setOpen] = useState<{ row: string; moment: string } | null>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const scene = currentScene.value;
  const st = sceneTiming.value;
  const l = lesson.value;
  if (!scene || !st || !l) return null;
  const code = lang.value;
  const langs = l.manifest.languages.map((x) => x.code);
  const dir = l.manifest.languages.find((x) => x.code === code)?.dir ?? "ltr";
  const dur = Math.max(0.5, st.end - st.start);
  const track = Math.max(80, width - LABEL);
  const pps = track / dur;
  const x = (s: number): number => Math.max(0, Math.min(track, s * pps));
  const words = st.words.map((w, i) => ({ text: w.w, s: w.s - st.start, e: w.e - st.start, i }));

  const rows: Row[] = [];
  walkElements(scene, (el: Element) => {
    rows.push({ id: el.id, label: el.id, kind: "el", tracks: el.anim ?? [], moments: momentsOf(el.anim ?? [], st, code) });
  });
  if (scene.camera?.length) rows.push({ id: "camera", label: t("camera"), kind: "camera", tracks: scene.camera, moments: momentsOf(scene.camera, st, code) });
  const cues = (scene.cues ?? []).map((c, i) => {
    const at = c.at !== undefined ? Math.min(c.at, dur) : resolveWhen({ word: c.word ?? "" , ...(c.occurrence ? { occurrence: c.occurrence } : {}) }, st, code);
    return { i, cue: c, at: typeof at === "number" ? at : at.at, found: typeof at === "number" ? true : at.found };
  });

  /** The word nearest to a time, if it is within the snap distance; with its occurrence among equal words. */
  const snapTo = (s: number): { idx: number; text: string; occurrence: number } | null => {
    let best: (typeof words)[number] | null = null;
    for (const w of words) if (Math.abs(w.s - s) * pps <= SNAP && (!best || Math.abs(w.s - s) < Math.abs(best.s - s))) best = w;
    if (!best) return null;
    const norm = normalizeWord(clean(best.text));
    const occurrence = words.slice(0, best.i + 1).filter((w) => normalizeWord(clean(w.text)) === norm).length;
    return { idx: best.i, text: clean(best.text), occurrence };
  };

  const start = (e: PointerEvent, row: string, moment: string | null, t0: number) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ row, moment, x0: e.clientX, t0, dt: 0, snap: null, moved: false });
  };
  const move = (e: PointerEvent) => {
    if (!drag) return;
    const dx = e.clientX - drag.x0;
    let dt = dx / pps;
    const s = snapTo(drag.t0 + dt);
    if (s) dt = words[s.idx]!.s - drag.t0;
    setDrag({ ...drag, dt, snap: s ? s.idx : null, moved: drag.moved || Math.abs(dx) > 3 });
  };
  const end = () => {
    const d = drag;
    setDrag(null);
    if (!d) return;
    if (!d.moved) {
      if (d.row === "cues") return;
      if (d.moment) setOpen(open?.row === d.row && open.moment === d.moment ? null : { row: d.row, moment: d.moment });
      else elementId.value = rows.find((r) => r.id === d.row)?.kind === "el" ? d.row : elementId.value;
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
      const clean2 = Object.fromEntries(Object.entries(next).filter(([, v]) => v !== undefined));
      edit([{ op: "set", scene: scene.id, path: `/cues/${c.i}`, value: clean2 }]);
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

  const shiftOf = (row: string, moment: string | null): number => (drag && drag.moved && drag.row === row && (drag.moment === moment || drag.moment === null) ? drag.dt : 0);
  const openRow = open ? rows.find((r) => r.id === open.row) : undefined;
  const openMoment = openRow?.moments.find((m) => m.key === open!.moment);

  return (
    <div class="timeline" ref={box} dir="ltr" onPointerMove={(e) => move(e as PointerEvent)} onPointerUp={end} onPointerCancel={end}>
      <div class="tl-row tl-ruler">
        <span class="tl-label">{t("words")}</span>
        <div class="tl-track" onPointerDown={(e) => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); onSeek(Math.max(0, Math.min(dur, (e.clientX - r.left) / pps))); }}>
          {words.map((w) => (
            <span key={w.i} class={`tl-word${drag?.snap === w.i ? " snap" : ""}${playhead.value >= w.s && playhead.value < w.e ? " on" : ""}`} dir={dir} lang={code}
              style={{ left: `${x(w.s)}px`, maxWidth: `${Math.max(14, (w.e - w.s) * pps + 6)}px`, top: w.i % 2 ? "15px" : "1px" }} title={w.text}>{w.text}</span>
          ))}
          <span class="tl-head" style={{ left: `${x(playhead.value)}px` }} />
        </div>
      </div>
      <div class="tl-rows">
        {rows.map((row) => {
          const first = row.moments[0], last = row.moments[row.moments.length - 1];
          const bar = shiftOf(row.id, null);
          return (
            <div key={row.id} class={`tl-row${row.id === elementId.value ? " chosen" : ""}`}>
              <button type="button" class="tl-label" dir="ltr" title={row.label} onClick={() => { if (row.kind === "el") elementId.value = row.id; }}>{row.label}</button>
              <div class="tl-track">
                {first && last && last.at > first.at ? (
                  <span class="tl-bar" title={t("dragToMoveAll")} style={{ left: `${x(first.at + bar)}px`, width: `${x(last.at) - x(first.at)}px` }}
                    onPointerDown={(e) => start(e as PointerEvent, row.id, null, first.at)} />
                ) : null}
                {row.moments.map((m) => (
                  <button type="button" key={m.key} class={`tl-key${m.found ? "" : " lost"}${typeof m.when === "number" ? "" : " word"}${open?.row === row.id && open.moment === m.key ? " open" : ""}`}
                    style={{ left: `${x(m.at + shiftOf(row.id, m.key))}px` }}
                    aria-label={`${row.label} ${m.keys.map((k) => k.prop).join(", ")} ${typeof m.when === "number" ? `${m.at.toFixed(2)} s` : `«${pick(m.when.word, code)}»`}`}
                    onPointerDown={(e) => start(e as PointerEvent, row.id, m.key, m.at)} />
                ))}
                <span class="tl-head" style={{ left: `${x(playhead.value)}px` }} />
              </div>
            </div>
          );
        })}
        {cues.length ? (
          <div class="tl-row tl-cues">
            <span class="tl-label">{t("cuesShort")}</span>
            <div class="tl-track">
              {cues.map((c) => (
                <button type="button" key={c.i} class={`tl-cue ${c.cue.action}${c.found ? "" : " lost"}`} title={`${t(`act_${c.cue.action}` as Msg)} → ${c.cue.target}`}
                  style={{ left: `${x(c.at + (drag?.moved && drag.row === "cues" && drag.moment === String(c.i) ? drag.dt : 0))}px` }}
                  aria-label={`${c.cue.action} ${c.cue.target}`}
                  onPointerDown={(e) => start(e as PointerEvent, "cues", String(c.i), c.at)} />
              ))}
              <span class="tl-head" style={{ left: `${x(playhead.value)}px` }} />
            </div>
          </div>
        ) : null}
        {!rows.length && !cues.length ? <p class="f-hint">{t("timelineEmpty")}</p> : null}
      </div>
      {openRow && openMoment ? <MomentEditor scene={scene} row={openRow} m={openMoment} onClose={() => setOpen(null)} /> : null}
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
