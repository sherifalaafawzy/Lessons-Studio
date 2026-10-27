import { useState } from "preact/hooks";
import type { Element, Scene } from "@lessonstudio/spec";
import { pick } from "@lessonstudio/spec";
import { currentScene, edit, elementId, lang } from "../editor.ts";
import { t } from "../i18n.ts";
import { Icon } from "../icons.tsx";

interface Layer { el: Element; depth: number; list: string; index: number; size: number }

/** A scene's free elements, front-most first (the canvas's own elements, then overlays on top), groups indented. */
export function layersOf(scene: Scene): Layer[] {
  const out: Layer[] = [];
  const walk = (list: Element[] | undefined, key: string, depth: number) => {
    const items = list ?? [];
    for (let i = items.length - 1; i >= 0; i--) {
      const el = items[i]!;
      out.push({ el, depth, list: key, index: i, size: items.length });
      if (el.type === "group") walk(el.children, `${key}/${el.id}`, depth + 1);
    }
  };
  walk(scene.overlays, "overlays", 0);
  if (scene.template === "canvas") walk(scene.content.elements, "elements", 0);
  return out;
}

const labelOf = (el: Element): string => {
  if (el.type === "text") return pick(el.text, lang.value) || el.id;
  if (el.type === "icon") return `${el.id} (${el.icon})`;
  return el.id;
};

/** The selected scene's layers: click to select, drag (or the arrows) to bring forward or send back. */
export function Layers() {
  const scene = currentScene.value;
  const [dragging, setDragging] = useState<Layer | null>(null);
  const [over, setOver] = useState<string | null>(null);
  if (!scene) return null;
  const layers = layersOf(scene);
  if (!layers.length) return <p class="insp-note">{t("layersEmpty")}</p>;
  const move = (l: Layer, to: number) => { edit([{ op: "moveElement", scene: scene.id, element: l.el.id, to }]); };
  return (
    <ul class="layers" aria-label={t("panelLayers")}>
      {layers.map((l) => (
        <li key={l.el.id} class={`${l.el.id === elementId.value ? "on" : ""}${over === l.el.id ? " drop" : ""}`}
          draggable onDragStart={(e) => { setDragging(l); e.dataTransfer?.setData("text/plain", l.el.id); }}
          onDragOver={(e) => { if (dragging && dragging.list === l.list && dragging !== l) { e.preventDefault(); setOver(l.el.id); } }}
          onDragLeave={() => setOver(null)}
          onDrop={(e) => { e.preventDefault(); setOver(null); if (dragging && dragging.list === l.list) move(dragging, l.index); setDragging(null); }}
          onDragEnd={() => { setDragging(null); setOver(null); }}>
          {Array.from({ length: l.depth }, (_, i) => <span key={i} class="nest" />)}
          <button type="button" class="layer-name" onClick={() => { elementId.value = l.el.id; }}><bdi>{labelOf(l.el)}</bdi></button>
          <span class="layer-type">{l.el.type}</span>
          <span class="tools">
            <button type="button" class="tool" title={t("bringForward")} aria-label={t("bringForward")} disabled={l.index >= l.size - 1} onClick={() => move(l, l.index + 1)}><Icon name="up" /></button>
            <button type="button" class="tool" title={t("sendBack")} aria-label={t("sendBack")} disabled={l.index <= 0} onClick={() => move(l, l.index - 1)}><Icon name="down" /></button>
          </span>
        </li>
      ))}
    </ul>
  );
}
