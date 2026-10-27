import { useEffect, useRef, useState } from "preact/hooks";
import { createPlayer, type ElementBox, type Player } from "@lessonstudio/player";
import { toPackage } from "@lessonstudio/ops";
import { currentScene, edit, elementId, findElement, lang, lesson, orient, playhead, sceneId, sceneTiming, timings } from "../editor.ts";
import { t } from "../i18n.ts";
import { ELEMENT_KINDS, addElement, designSize, moveOps } from "./content.tsx";

const ORIENT = { landscape: [1280, 720], portrait: [720, 1280], square: [1080, 1080] } as const;

interface Drag {
  id: string;
  kind: "move" | "size";
  x0: number;
  y0: number;
  dx: number;
  dy: number;
  k: number;
  flip: number;
  node: HTMLElement | null;
  box: ElementBox;
}

/**
 * The real player as the canvas: select an element by clicking it, drag it to move, drag the corner to resize.
 * Moves preview live on the player's element and are stored as one edit when the pointer is released.
 */
export function Stage() {
  const host = useRef<HTMLDivElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const player = useRef<Player | null>(null);
  const [boxes, setBoxes] = useState<ElementBox[]>([]);
  const [view, setView] = useState({ left: 0, top: 0, width: 0, height: 0 });
  const [playing, setPlaying] = useState(false);
  const drag = useRef<Drag | null>(null);
  const [, force] = useState(0);
  const l = lesson.value;
  const json = l ? JSON.stringify(l) : "";

  /** Puts the player at the playhead and measures the element boxes for the handles. */
  const show = () => {
    const p = player.current;
    const st = sceneTiming.value;
    if (!p || !st) return;
    if (!p.playing) p.seek(Math.min(st.end - 0.02, st.start + playhead.value));
    requestAnimationFrame(measure);
  };
  const measure = () => {
    const p = player.current;
    const vp = host.current?.shadowRoot?.querySelector<HTMLElement>(".ls-viewport");
    if (!p || !vp || !wrap.current) return;
    const a = vp.getBoundingClientRect();
    const b = wrap.current.getBoundingClientRect();
    setView({ left: a.left - b.left, top: a.top - b.top, width: a.width, height: a.height });
    setBoxes(p.boxes());
  };

  // A fresh player whenever the lesson, the language or the shape changes (it mounts one scene, so it's cheap).
  useEffect(() => {
    if (!l || !host.current) return;
    player.current?.destroy();
    const pkg = toPackage(l, timings.value);
    // The player announces its first scene while it is being created, so handlers read it through `made`.
    let made: Player | null = null;
    const p = createPlayer(host.current, pkg, {
      lang: lang.value, tier: "full", orient: orient.value, captions: true,
      onEvent: (e) => {
        if (e.type === "play") setPlaying(true);
        if (e.type === "pause" || e.type === "ended") setPlaying(false);
        if (e.type === "scene" && made?.playing) sceneId.value = l.scenes.scenes[e.index]?.id ?? sceneId.value;
      },
    });
    made = p;
    player.current = p;
    // The editor has its own play button and scrubber; keep the stage to the picture and captions.
    const style = document.createElement("style");
    style.textContent = ".ls-bar,.ls-bigplay,.ls-transcript{display:none!important}.ls-player{border-radius:10px}";
    host.current.shadowRoot?.append(style);
    show();
    const ro = new ResizeObserver(() => requestAnimationFrame(measure));
    ro.observe(host.current);
    return () => ro.disconnect();
  }, [json, lang.value, orient.value]);
  useEffect(() => () => { player.current?.destroy(); player.current = null; }, []);

  // Follow the playhead and the selected scene while paused.
  useEffect(show, [sceneId.value, playhead.value]);

  // While playing, the player's clock moves the playhead.
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      const p = player.current;
      const tm = timings.value[lang.value];
      if (!p || !tm) return;
      const now = p.time();
      const i = tm.scenes.findIndex((s) => now >= s.start && now < s.end);
      if (i >= 0) {
        playhead.value = now - tm.scenes[i]!.start;
        if (lesson.value?.scenes.scenes[i]) sceneId.value = lesson.value.scenes.scenes[i]!.id;
      }
      measure();
    }, 120);
    return () => window.clearInterval(id);
  }, [playing]);

  const scene = currentScene.value;
  const st = sceneTiming.value;
  const dur = st ? st.end - st.start : 0;
  const dir = l?.manifest.languages.find((g) => g.code === lang.value)?.dir ?? "ltr";

  /** Screen pixels per design pixel, and whether left and right are swapped (mirrored right-to-left element). */
  const geometry = (id: string): { k: number; flip: number } => {
    const [sw, sh] = ORIENT[orient.value];
    const [dw, dh] = designSize();
    const el = scene ? currentElementOf(id) : null;
    const flip = dir === "rtl" && scene?.mirror !== false && !el?.fixed ? -1 : 1;
    return { k: (view.width / sw) * Math.min(sw / dw, sh / dh), flip };
  };
  const currentElementOf = (id: string) => findElement(scene, id);

  const onDown = (e: PointerEvent, kind: "move" | "size", forced?: string) => {
    const p = player.current;
    if (!p || p.playing) return;
    const id = forced ?? p.elementAt(e.clientX, e.clientY);
    if (!id) {
      elementId.value = null;
      return;
    }
    elementId.value = id;
    const box = p.boxes().find((b) => b.id === id);
    if (!box) return;
    const { k, flip } = geometry(id);
    const node = host.current?.shadowRoot?.querySelector<HTMLElement>(`[data-el="${CSS.escape(id)}"]`) ?? null;
    drag.current = { id, kind, x0: e.clientX, y0: e.clientY, dx: 0, dy: 0, k, flip, node, box };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
  };
  const onMove = (e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    d.dx = e.clientX - d.x0;
    d.dy = e.clientY - d.y0;
    // Live preview on the player's own element (translate composes with its animated transform).
    if (d.node && d.kind === "move") d.node.style.translate = `${d.dx / d.k}px ${d.dy / d.k}px`;
    force((n) => n + 1);
  };
  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.node) d.node.style.translate = "";
    const el = currentElementOf(d.id);
    if (!scene || !el || (Math.abs(d.dx) < 2 && Math.abs(d.dy) < 2)) { force((n) => n + 1); return; }
    const mx = (d.dx / d.k) * d.flip;
    const my = d.dy / d.k;
    edit(d.kind === "move" ? moveOps(scene, el, mx, my) : moveOps(scene, el, 0, 0, mx, my));
  };

  const sel = boxes.find((b) => b.id === elementId.value);
  const d = drag.current;
  const shown = sel && d && d.id === sel.id
    ? d.kind === "move"
      ? { ...sel, x: sel.x + d.dx, y: sel.y + d.dy }
      : d.flip < 0 ? { ...sel, x: sel.x + d.dx, w: Math.max(8, sel.w - d.dx), h: Math.max(8, sel.h + d.dy) } : { ...sel, w: Math.max(8, sel.w + d.dx), h: Math.max(8, sel.h + d.dy) }
    : sel;
  const words = st?.words ?? [];

  return (
    <section class="stage" aria-label={t("stage")}>
      <div class="palette" role="toolbar" aria-label={t("addElement")}>
        <span class="palette-label">{t("add")}:</span>
        {ELEMENT_KINDS.map((k) => (
          <button type="button" key={k.key} class="chip" disabled={!scene}
            onClick={() => { if (!scene) return; const id = addElement(scene, k.key); if (id) elementId.value = id; }}>{t(k.label)}</button>
        ))}
        <span class="spacer" />
        <select aria-label={t("shape")} value={orient.value} onChange={(e) => { orient.value = (e.target as HTMLSelectElement).value as typeof orient.value; }}>
          <option value="landscape">{t("landscape")}</option><option value="portrait">{t("portrait")}</option><option value="square">{t("square")}</option>
        </select>
      </div>
      <div class={`stage-wrap ${orient.value}`} ref={wrap}>
        <div ref={host} class="stage-player" />
        <div class="overlay" style={{ left: `${view.left}px`, top: `${view.top}px`, width: `${view.width}px`, height: `${view.height}px` }}
          onPointerDown={(e) => onDown(e as PointerEvent, "move")} onPointerMove={(e) => onMove(e as PointerEvent)} onPointerUp={onUp} onPointerCancel={onUp}>
          {!playing ? boxes.map((b) => (
            <div key={b.id} class={b.id === elementId.value ? "hbox hidden-box" : "hbox"} style={{ left: `${b.x}px`, top: `${b.y}px`, width: `${b.w}px`, height: `${b.h}px` }} />
          )) : null}
          {shown && !playing ? (
            <div class="sel" style={{ left: `${shown.x}px`, top: `${shown.y}px`, width: `${shown.w}px`, height: `${shown.h}px` }}>
              <span class="sel-name" dir="ltr">{shown.id}</span>
              <span class={geometry(shown.id).flip < 0 ? "grip bl" : "grip br"} role="slider" aria-label={t("resize")}
                onPointerDown={(e) => { e.stopPropagation(); onDown(e as PointerEvent, "size", shown.id); }} />
            </div>
          ) : null}
        </div>
      </div>
      <div class="scrub">
        <button type="button" class="btn icon" aria-label={playing ? t("pause") : t("play")}
          onClick={() => {
            const p = player.current;
            if (!p) return;
            if (p.playing) p.pause();
            else { if (st) p.seek(st.start + playhead.value); void p.play(); }
          }}>{playing ? "❚❚" : "▶"}</button>
        <input type="range" dir="ltr" min={0} max={dur || 1} step={0.05} value={Math.min(playhead.value, dur)} aria-label={t("time")}
          onInput={(e) => { player.current?.pause(); playhead.value = Number((e.target as HTMLInputElement).value); }} />
        <span class="time" dir="ltr">{playhead.value.toFixed(1)} / {dur.toFixed(1)} s</span>
      </div>
      <div class="words" dir={dir} lang={lang.value} aria-label={t("narrationWords")}>
        {words.map((w, i) => {
          const s = w.s - (st?.start ?? 0);
          const on = playhead.value >= s && playhead.value < w.e - (st?.start ?? 0);
          return <button type="button" key={i} class={on ? "word on" : "word"} onClick={() => { player.current?.pause(); playhead.value = s + 0.01; }}>{w.w}</button>;
        })}
      </div>
    </section>
  );
}
