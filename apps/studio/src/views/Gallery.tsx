import { useEffect, useRef, useState } from "preact/hooks";
import type { Scene, TemplateId } from "@lessonstudio/spec";
import { TEMPLATES } from "@lessonstudio/spec";
import { createPlayer, type Player } from "@lessonstudio/player";
import { toPackage } from "@lessonstudio/ops";
import { lang, lesson, orient } from "../editor.ts";
import { t, uiLang } from "../i18n.ts";
import { GALLERY, type ScenePreset } from "../presets.ts";
import { TEMPLATE_NAMES } from "./content.tsx";

/** "Add a scene": ready-made scenes with a live preview, or a blank scene of any template. */
export function Gallery(p: { onPreset: (preset: ScenePreset) => void; onBlank: (template: TemplateId) => void; onClose: () => void }) {
  const l = lesson.value;
  if (!l) return null;
  const langs = l.manifest.languages.map((x) => x.code);
  const stage = l.manifest.stage ?? "landscape";
  return (
    <div class="modal" role="dialog" aria-modal="true" aria-label={t("addScene")} onKeyDown={(e) => { if (e.key === "Escape") p.onClose(); }}>
      <div class="modal-box gallery">
        <h2>{t("addScene")}</h2>
        <p class="f-hint">{t("galleryHint")}</p>
        <ul class="gal-grid">
          {GALLERY.map((g) => (
            <li key={g.id}>
              <button type="button" class="gal-card" onClick={() => p.onPreset(g)}>
                <MiniScene scene={g.make({ id: "preview", langs, stage })} />
                <span class="gal-name">{g.name[uiLang.value]}</span>
                <span class="badge">{t(TEMPLATE_NAMES[g.template])}</span>
              </button>
            </li>
          ))}
        </ul>
        <h3>{t("blankScene")}</h3>
        <div class="tpl-pick" role="group" aria-label={t("chooseTemplate")}>
          {TEMPLATES.map((tp) => <button type="button" key={tp} class="chip" onClick={() => p.onBlank(tp)}>{t(TEMPLATE_NAMES[tp])}</button>)}
        </div>
        <div class="modal-foot"><button type="button" class="link" onClick={p.onClose}>{t("cancel")}</button></div>
      </div>
    </div>
  );
}

const ASPECT = { landscape: "16 / 9", portrait: "9 / 16", square: "1" };

/** One scene in a small player: its last frame, and it plays while pointed at. Mounted once it scrolls into view. */
export function MiniScene({ scene, hoverPlay = true }: { scene: Scene; hoverPlay?: boolean }) {
  const host = useRef<HTMLSpanElement>(null);
  const player = useRef<Player | null>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setSeen(true); io.disconnect(); } });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const json = JSON.stringify(scene);
  useEffect(() => {
    const l = lesson.value;
    if (!seen || !l || !host.current) return;
    const pkg = toPackage({ manifest: l.manifest, scenes: { version: "0.2", scenes: [scene] } });
    const p = createPlayer(host.current, pkg, { lang: lang.value, tier: "full", orient: orient.value, captions: false });
    const style = document.createElement("style");
    style.textContent = ".ls-bar,.ls-bigplay,.ls-transcript,.ls-captions{display:none!important}.ls-player{border-radius:8px}";
    host.current.shadowRoot?.append(style);
    p.seek(Math.max(0, p.duration - 0.05));
    player.current = p;
    return () => { p.destroy(); player.current = null; };
  }, [seen, json, lang.value, orient.value, lesson.value?.manifest.brand]);
  const end = () => { const p = player.current; if (p) { p.pause(); p.seek(Math.max(0, p.duration - 0.05)); } };
  return (
    <span class="mini" ref={host} aria-hidden="true" style={{ aspectRatio: ASPECT[orient.value] }}
      onMouseEnter={hoverPlay ? () => { const p = player.current; if (p) { p.seek(0); void p.play(); } } : undefined}
      onMouseLeave={hoverPlay ? end : undefined} />
  );
}
