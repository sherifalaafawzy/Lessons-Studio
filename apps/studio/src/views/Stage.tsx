import { useEffect, useRef, useState } from "preact/hooks";
import type { Text } from "@lessonstudio/spec";
import { createPlayer, type ElementBox, type Player } from "@lessonstudio/player";
import { getAt } from "@lessonstudio/ops";
import {
  currentScene, edit, elementId, findElement, guides, lang, lesson, loopScene, orient, partId, playhead, playing, sceneId,
  sceneTiming, stagePlayer, studioPackage, timings, togglePlay, trackAudio, viewScale, zoom,
} from "../editor.ts";
import { elementPath, partPath, setText } from "../parts.ts";
import { HANDLES, angleFrom, resizeBox, snapMove, type Guide, type Handle, type Rect } from "../snap.ts";
import { t } from "../i18n.ts";
import { LIBRARY } from "../env.ts";
import { ELEMENT_KINDS, addElement, designSize, moveOps } from "./content.tsx";

const ORIENT = { landscape: [1280, 720], portrait: [720, 1280], square: [1080, 1080] } as const;
export const ZOOM_MIN = 0.1;
export const ZOOM_MAX = 4;

/** A drag on the canvas: moving, resizing by a handle, rotating, or moving a line's end. Screen pixels. */
interface Drag {
  id: string;
  kind: "move" | "resize" | "rotate" | "end";
  handle?: Handle;
  x0: number;
  y0: number;
  dx: number;
  dy: number;
  k: number;
  flip: number;
  node: HTMLElement | null;
  box: ElementBox;
  /** The previewed box (move and resize, after snapping), and the guides it lines up with. */
  rect: Rect;
  guides: Guide[];
  /** Rotation: the pointer's starting angle around the box's centre, and the change so far. */
  a0: number;
  turn: number;
}

const typingIn = (el: EventTarget | null): boolean => {
  const n = el as HTMLElement | null;
  return !!n && (/^(INPUT|TEXTAREA|SELECT)$/.test(n.tagName) || n.isContentEditable);
};

/**
 * The real player as the canvas, on a pasteboard you can zoom (Ctrl+wheel, the transport) and pan (Space+drag,
 * or scroll). Click an element to select it, drag it to move it, drag the corner to resize; double-click text to type.
 * Moves preview live on the player's element and are stored as one edit when the pointer is released.
 */
export function Stage() {
  const host = useRef<HTMLDivElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const board = useRef<HTMLDivElement>(null);
  const player = useRef<Player | null>(null);
  /** What the stage's player was made for, besides its sound. */
  const madeFor = useRef("");
  const [boxes, setBoxes] = useState<ElementBox[]>([]);
  const [parts, setParts] = useState<ElementBox[]>([]);
  const [hover, setHover] = useState<string | null>(null);
  const [typing, setTyping] = useState<Typing | null>(null);
  const [view, setView] = useState({ left: 0, top: 0, width: 0, height: 0 });
  const [room, setRoom] = useState({ w: 800, h: 450 });
  const [space, setSpace] = useState(false);
  const pan = useRef<{ x: number; y: number; sl: number; st: number; moved: boolean } | null>(null);
  const spaceUsed = useRef(false);
  const drag = useRef<Drag | null>(null);
  const [, force] = useState(0);
  const l = lesson.value;
  const json = l ? JSON.stringify(l) : "";
  const isPlaying = playing.value;

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
    setParts(p.parts());
  };

  // A fresh player whenever the lesson, the language or the shape changes (it mounts one scene, so it's cheap). When
  // only the sound changed (a voice track finished loading) while playing, it carries on from the same moment.
  useEffect(() => {
    if (!l || !host.current) return;
    const what = `${json}|${lang.value}|${orient.value}`;
    const resumeAt = madeFor.current === what && player.current?.playing ? player.current.time() : null;
    madeFor.current = what;
    player.current?.destroy();
    const pkg = studioPackage(l, timings.value);
    // The player announces its first scene while it is being created, so handlers read it through `made`.
    let made: Player | null = null;
    const p = createPlayer(host.current, pkg, {
      lang: lang.value, tier: "full", orient: orient.value, captions: true, library: LIBRARY,
      onEvent: (e) => {
        if (e.type === "play") playing.value = true;
        if (e.type === "pause" || e.type === "ended") playing.value = false;
        if (e.type === "scene" && made?.playing) sceneId.value = l.scenes.scenes[e.index]?.id ?? sceneId.value;
      },
    });
    made = p;
    player.current = p;
    stagePlayer.value = p;
    playing.value = false;
    // The editor has its own transport; keep the stage to the picture and captions.
    const style = document.createElement("style");
    style.textContent = ".ls-bar,.ls-bigplay,.ls-transcript,.ls-menu{display:none!important}.ls-player{border-radius:10px}.ls-float .ls-captions{padding-bottom:10px!important}";
    host.current.shadowRoot?.append(style);
    show();
    if (resumeAt !== null) {
      p.seek(resumeAt);
      void p.play();
    }
    const ro = new ResizeObserver(() => requestAnimationFrame(measure));
    ro.observe(host.current);
    return () => ro.disconnect();
  }, [json, timings.value, trackAudio.value, lang.value, orient.value]);
  useEffect(() => () => { player.current?.destroy(); player.current = null; stagePlayer.value = null; playing.value = false; }, []);

  // Follow the playhead and the selected scene while paused.
  useEffect(show, [sceneId.value, playhead.value]);

  // While playing, the player's clock moves the playhead; with loop on, the scene repeats.
  useEffect(() => {
    if (!isPlaying) return;
    const loopIndex = lesson.value?.scenes.scenes.findIndex((s) => s.id === sceneId.value) ?? -1;
    const id = window.setInterval(() => {
      const p = player.current;
      const tm = timings.value[lang.value];
      if (!p || !tm) return;
      let now = p.time();
      if (loopScene.value && loopIndex >= 0) {
        const s = tm.scenes[loopIndex]!;
        if (now >= s.end - 0.06 || now < s.start) { p.seek(s.start); now = s.start; }
      }
      const i = tm.scenes.findIndex((s) => now >= s.start && now < s.end);
      if (i >= 0) {
        playhead.value = now - tm.scenes[i]!.start;
        if (lesson.value?.scenes.scenes[i]) sceneId.value = lesson.value.scenes.scenes[i]!.id;
      }
      measure();
    }, 100);
    return () => window.clearInterval(id);
  }, [isPlaying]);

  // The room the pasteboard gives the stage, for "fit".
  useEffect(() => {
    const el = board.current;
    if (!el) return;
    const ro = new ResizeObserver(() => requestAnimationFrame(() => setRoom({ w: Math.max(80, el.clientWidth - 56), h: Math.max(60, el.clientHeight - 56) })));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const [sw, sh] = ORIENT[orient.value];
  const fitK = Math.max(ZOOM_MIN, Math.min(room.w / sw, room.h / sh));
  const k = zoom.value === "fit" ? fitK : zoom.value;
  useEffect(() => { viewScale.value = k; }, [k]);

  // Ctrl+wheel zooms around the pointer (the browser's own page zoom is kept away from the canvas).
  useEffect(() => {
    const el = board.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const cur = viewScale.value;
      const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, cur * Math.exp(-e.deltaY * 0.0015)));
      const r = el.getBoundingClientRect();
      const mx = e.clientX - r.left, my = e.clientY - r.top;
      const ax = el.scrollLeft + mx, ay = el.scrollTop + my;
      zoom.value = next;
      requestAnimationFrame(() => { el.scrollLeft = ax * (next / cur) - mx; el.scrollTop = ay * (next / cur) - my; });
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, []);

  // Space: a tap plays or pauses; held, the pointer pans the pasteboard.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code !== "Space" || typingIn(e.target)) return;
      e.preventDefault();
      if (e.repeat) return;
      spaceUsed.current = false;
      setSpace(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.code !== "Space" || typingIn(e.target)) return;
      e.preventDefault();
      setSpace(false);
      if (!spaceUsed.current) togglePlay();
    };
    addEventListener("keydown", down);
    addEventListener("keyup", up);
    return () => { removeEventListener("keydown", down); removeEventListener("keyup", up); };
  }, []);
  const panDown = (e: PointerEvent) => {
    if (!space && e.button !== 1) return;
    const el = board.current!;
    pan.current = { x: e.clientX, y: e.clientY, sl: el.scrollLeft, st: el.scrollTop, moved: false };
    spaceUsed.current = true;
    el.setPointerCapture(e.pointerId);
    e.preventDefault();
  };
  const panMove = (e: PointerEvent) => {
    const p = pan.current;
    if (!p) return;
    const el = board.current!;
    el.scrollLeft = p.sl - (e.clientX - p.x);
    el.scrollTop = p.st - (e.clientY - p.y);
  };
  const panUp = () => { pan.current = null; };

  const scene = currentScene.value;
  const dir = l?.manifest.languages.find((g) => g.code === lang.value)?.dir ?? "ltr";

  /** Screen pixels per design pixel, and whether left and right are swapped (mirrored right-to-left element). */
  const geometry = (id: string): { k: number; flip: number } => {
    const [dw, dh] = designSize();
    const el = scene ? currentElementOf(id) : null;
    const flip = dir === "rtl" && scene?.mirror !== false && !el?.fixed ? -1 : 1;
    return { k: (view.width / sw) * Math.min(sw / dw, sh / dh), flip };
  };
  const currentElementOf = (id: string) => findElement(scene, id);

  const onDown = (e: PointerEvent, kind: Drag["kind"], forced?: string, handle?: Handle) => {
    const p = player.current;
    if (!p || p.playing || typing || space) return;
    const id = forced ?? p.elementAt(e.clientX, e.clientY);
    if (!id) {
      // A template's own text: select it, and show its field in the inspector.
      const part = p.partAt(e.clientX, e.clientY);
      elementId.value = null;
      partId.value = part;
      const path = part && scene ? partPath(scene, part) : null;
      if (path) showField(path);
      return;
    }
    elementId.value = id;
    const box = p.boxes().find((b) => b.id === id);
    if (!box) return;
    const g = geometry(id);
    const node = host.current?.shadowRoot?.querySelector<HTMLElement>(`[data-el="${CSS.escape(id)}"]`) ?? null;
    const ov = (e.currentTarget as HTMLElement).closest(".overlay")!.getBoundingClientRect();
    const a0 = angleFrom(ov.left + box.x + box.w / 2, ov.top + box.y + box.h / 2, e.clientX, e.clientY);
    drag.current = { id, kind, handle, x0: e.clientX, y0: e.clientY, dx: 0, dy: 0, k: g.k, flip: g.flip, node, box, rect: { ...box }, guides: [], a0, turn: 0 };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
  };
  const onMove = (e: PointerEvent) => {
    const d = drag.current;
    if (!d) {
      const p = player.current;
      if (p && !p.playing) setHover(p.elementAt(e.clientX, e.clientY) ?? p.partAt(e.clientX, e.clientY));
      return;
    }
    d.dx = e.clientX - d.x0;
    d.dy = e.clientY - d.y0;
    // Snap to the stage and to the other elements, unless Alt is held.
    const stageRect = { x: 0, y: 0, w: view.width, h: view.height };
    const others = e.altKey ? [] : boxes.filter((b) => b.id !== d.id);
    const tol = e.altKey ? -1 : 6;
    if (d.kind === "move") {
      const m = snapMove(d.box, d.dx, d.dy, stageRect, others, tol);
      d.rect = { ...d.box, x: d.box.x + m.dx, y: d.box.y + m.dy };
      d.guides = m.guides;
      // Live preview on the player's own element (translate composes with its animated transform).
      if (d.node) d.node.style.translate = `${m.dx / d.k}px ${m.dy / d.k}px`;
    } else if (d.kind === "resize" && d.handle) {
      const r = resizeBox(d.box, d.handle, d.dx, d.dy, stageRect, others, e.shiftKey, tol);
      d.rect = r.rect;
      d.guides = r.guides;
    } else if (d.kind === "rotate") {
      const ov = (e.currentTarget as HTMLElement).closest(".overlay")!.getBoundingClientRect();
      const a = angleFrom(ov.left + d.box.x + d.box.w / 2, ov.top + d.box.y + d.box.h / 2, e.clientX, e.clientY, e.shiftKey ? 15 : 0);
      d.turn = ((a - d.a0 + 540) % 360) - 180;
      if (d.node) d.node.style.rotate = `${d.turn}deg`;
    } else {
      d.rect = { ...d.box, w: Math.max(8, d.box.w + d.dx * d.flip), h: Math.max(8, d.box.h + d.dy) };
    }
    force((n) => n + 1);
  };
  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.node) { d.node.style.translate = ""; d.node.style.rotate = ""; }
    const el = currentElementOf(d.id);
    if (!scene || !el || (Math.abs(d.dx) < 2 && Math.abs(d.dy) < 2)) { force((n) => n + 1); return; }
    const r = (v: number) => Math.round(v);
    if (d.kind === "move") {
      edit(moveOps(scene, el, ((d.rect.x - d.box.x) / d.k) * d.flip, (d.rect.y - d.box.y) / d.k));
    } else if (d.kind === "rotate") {
      const deg = (el.rotate ?? 0) + d.turn * d.flip;
      edit([{ op: "updateElement", scene: scene.id, element: el.id, props: { rotate: r(((deg + 540) % 360) - 180) } }]);
    } else if (d.kind === "resize") {
      // Screen to design: a mirrored element's x counts from the right edge, so its right edge moves it.
      const dsx = d.rect.x - d.box.x, dsw = d.rect.w - d.box.w, s = el.scale ?? 1;
      const props: Record<string, number> = {
        x: r(el.x + (d.flip === 1 ? dsx : -(dsx + dsw)) / d.k),
        y: r(el.y + (d.rect.y - d.box.y) / d.k),
        w: Math.max(8, r(d.rect.w / d.k / s)),
      };
      if (el.type !== "text") props.h = Math.max(8, r(d.rect.h / d.k / s));
      edit([{ op: "updateElement", scene: scene.id, element: el.id, props }]);
    } else {
      edit(moveOps(scene, el, 0, 0, (d.dx / d.k) * d.flip, d.dy / d.k));
    }
  };

  /** Double-click: type over a text on the stage, in the stage's language. */
  const onDouble = (e: MouseEvent) => {
    const p = player.current;
    if (!p || p.playing || !scene) return;
    const elId = p.elementAt(e.clientX, e.clientY);
    const part = elId ? null : p.partAt(e.clientX, e.clientY);
    const el = elId ? currentElementOf(elId) : null;
    const base = elId && el?.type === "text" ? elementPath(scene, elId) : null;
    const path = base ? `${base}/text` : part ? partPath(scene, part) : null;
    const box = elId ? boxes.find((b) => b.id === elId) : parts.find((b) => b.id === part);
    const node = host.current?.shadowRoot?.querySelector<HTMLElement>(elId ? `[data-el="${CSS.escape(elId)}"]` : `[data-part="${CSS.escape(part ?? "")}"]`);
    if (!path || !box || !node) return;
    const value = getAt(scene, path) as Text | undefined;
    // The size of the type on screen: its CSS size times the player's scale.
    const cs = getComputedStyle(node);
    const scale = node.offsetWidth ? node.getBoundingClientRect().width / node.offsetWidth : 1;
    setTyping({ path, box, scene: scene.id, old: value, text: typeof value === "string" ? value : value?.[lang.value] ?? "", font: parseFloat(cs.fontSize) * scale, weight: cs.fontWeight });
    e.preventDefault();
  };
  const commitTyping = (text: string | null) => {
    const ty = typing;
    setTyping(null);
    const l2 = lesson.value;
    if (!ty || text === null || !l2) return;
    const v = text.trim();
    if (!v || v === ty.text) return;
    edit([{ op: "set", scene: ty.scene, path: ty.path, value: setText(ty.old, lang.value, v, l2.manifest.languages.map((x) => x.code)) }]);
  };

  const sel = boxes.find((b) => b.id === elementId.value);
  const selPart = !elementId.value ? parts.find((b) => b.id === partId.value) : undefined;
  const hov = hover && hover !== elementId.value && hover !== partId.value ? boxes.find((b) => b.id === hover) ?? parts.find((b) => b.id === hover) : undefined;
  const d = drag.current;
  const live = sel && d && d.id === sel.id ? d : null;
  const shown = live && live.kind !== "rotate" ? { ...sel!, ...live.rect } : sel;
  const selEl = sel ? currentElementOf(sel.id) : null;
  const g = guides.value;

  return (
    <section class="stage" aria-label={t("stage")}>
      <div class="canvas-bar">
        <div class="palette" role="toolbar" aria-label={t("addElement")}>
          <span class="palette-label">{t("add")}:</span>
          {ELEMENT_KINDS.map((kind) => (
            <button type="button" key={kind.key} class="chip" disabled={!scene}
              onClick={() => { if (!scene) return; const id = addElement(scene, kind.key); if (id) elementId.value = id; }}>{t(kind.label)}</button>
          ))}
        </div>
        <span class="spacer" />
        <select aria-label={t("shape")} value={orient.value} onChange={(e) => { orient.value = (e.target as HTMLSelectElement).value as typeof orient.value; }}>
          <option value="landscape">{t("landscape")}</option><option value="portrait">{t("portrait")}</option><option value="square">{t("square")}</option>
        </select>
      </div>
      <div ref={board} class={`pasteboard${space ? " space" : ""}${pan.current ? " panning" : ""}`}
        onPointerDown={(e) => panDown(e as PointerEvent)} onPointerMove={(e) => panMove(e as PointerEvent)} onPointerUp={panUp} onPointerCancel={panUp}>
        <div class={`stage-wrap ${orient.value}`} ref={wrap} style={{ width: `${Math.round(sw * k)}px` }}>
          <div ref={host} class="stage-player" />
          <div class="overlay" style={{ left: `${view.left}px`, top: `${view.top}px`, width: `${view.width}px`, height: `${view.height}px` }}
            onPointerDown={(e) => onDown(e as PointerEvent, "move")} onPointerMove={(e) => onMove(e as PointerEvent)} onPointerUp={onUp} onPointerCancel={onUp}
            onPointerLeave={() => setHover(null)} onDblClick={(e) => onDouble(e as MouseEvent)}>
            {g.safe || g.center || g.thirds ? (
              <div class="guides" aria-hidden="true">
                {g.safe ? <><div class="safe" style={{ inset: "5%" }} /><div class="safe" style={{ inset: "10%" }} /></> : null}
                {g.center ? <><div class="line" style={{ insetInlineStart: "50%", insetBlock: 0, inlineSize: "1px" }} /><div class="line" style={{ insetBlockStart: "50%", insetInline: 0, blockSize: "1px" }} /></> : null}
                {g.thirds ? [1, 2].flatMap((n) => [
                  <div key={`v${n}`} class="line" style={{ left: `${(n * 100) / 3}%`, top: 0, bottom: 0, width: "1px" }} />,
                  <div key={`h${n}`} class="line" style={{ top: `${(n * 100) / 3}%`, left: 0, right: 0, height: "1px" }} />,
                ]) : null}
              </div>
            ) : null}
            {hov && !isPlaying && !typing ? <div class="pbox" style={{ left: `${hov.x}px`, top: `${hov.y}px`, width: `${hov.w}px`, height: `${hov.h}px` }} /> : null}
            {selPart && !isPlaying && !typing ? (
              <div class="sel part" style={{ left: `${selPart.x - 3}px`, top: `${selPart.y - 3}px`, width: `${selPart.w + 6}px`, height: `${selPart.h + 6}px` }}>
                <span class="sel-name">{t("doubleClickToType")}</span>
              </div>
            ) : null}
            {typing ? <TypeOver key={typing.path} typing={typing} dir={dir} lang={lang.value} onDone={commitTyping} /> : null}
            {!isPlaying ? boxes.map((b) => (
              <div key={b.id} class={b.id === elementId.value ? "hbox hidden-box" : "hbox"} style={{ left: `${b.x}px`, top: `${b.y}px`, width: `${b.w}px`, height: `${b.h}px` }} />
            )) : null}
            {live?.guides.map((g, i) => (
              <div key={i} class="snap-guide" style={g.axis === "x" ? { left: `${g.at}px`, top: 0, bottom: 0, width: "1px" } : { top: `${g.at}px`, left: 0, right: 0, height: "1px" }} />
            ))}
            {shown && !isPlaying ? (
              <div class="sel" style={{ left: `${shown.x}px`, top: `${shown.y}px`, width: `${shown.w}px`, height: `${shown.h}px`, ...(live?.kind === "rotate" ? { rotate: `${live.turn}deg` } : {}) }}>
                <span class="sel-name" dir="ltr">{shown.id}{live?.kind === "rotate" ? ` ${Math.round(((selEl?.rotate ?? 0) + live.turn * live.flip + 540) % 360 - 180)}°` : ""}</span>
                {selEl?.type === "line" ? (
                  <span class={geometry(shown.id).flip < 0 ? "grip bl" : "grip br"} role="slider" aria-label={t("resize")}
                    onPointerDown={(e) => { e.stopPropagation(); onDown(e as PointerEvent, "end", shown.id); }} />
                ) : (
                  <>
                    {HANDLES.map((h) => (
                      <span key={h} class={`grip h-${h}`} role="slider" aria-label={`${t("resize")} (${h})`}
                        onPointerDown={(e) => { e.stopPropagation(); onDown(e as PointerEvent, "resize", shown.id, h); }} />
                    ))}
                    <span class="rot" role="slider" aria-label={t("rotate")} title={`${t("rotate")} (Shift: 15°)`}
                      onPointerDown={(e) => { e.stopPropagation(); onDown(e as PointerEvent, "rotate", shown.id); }} />
                  </>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

interface Typing {
  scene: string;
  path: string;
  old: Text | undefined;
  text: string;
  box: ElementBox;
  font: number;
  weight: string;
}

/** A text box over the text being edited. Enter or leaving it keeps the change; Escape drops it; Shift+Enter starts a new line. */
function TypeOver(p: { typing: Typing; dir: "ltr" | "rtl"; lang: string; onDone: (text: string | null) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const done = useRef(false);
  const finish = (v: string | null) => { if (!done.current) { done.current = true; p.onDone(v); } };
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  const b = p.typing.box;
  return (
    <textarea ref={ref} class="type-over" dir={p.dir} lang={p.lang} defaultValue={p.typing.text} aria-label={t("typeHere")}
      style={{ left: `${b.x - 6}px`, top: `${b.y - 6}px`, width: `${Math.max(b.w + 12, 200)}px`, minHeight: `${b.h + 12}px`, fontSize: `${Math.max(12, p.typing.font)}px`, fontWeight: p.typing.weight }}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") { e.preventDefault(); finish(null); }
        else if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); finish((e.target as HTMLTextAreaElement).value); }
      }}
      onBlur={(e) => finish((e.target as HTMLTextAreaElement).value)} />
  );
}

/** Opens the inspector's field for a path, and flashes it. */
export function showField(path: string): void {
  requestAnimationFrame(() => {
    const f = document.querySelector<HTMLElement>(`.inspector [data-path="${CSS.escape(path)}"]`);
    if (!f) return;
    f.closest("details")?.setAttribute("open", "");
    f.scrollIntoView({ block: "nearest", behavior: "smooth" });
    f.classList.remove("flash");
    void f.offsetWidth;
    f.classList.add("flash");
  });
}
