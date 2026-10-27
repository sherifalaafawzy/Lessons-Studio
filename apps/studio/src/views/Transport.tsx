import { guides, lang, lessonTime, loopScene, playing, rate, seekLesson, stagePlayer, timings, togglePlay, viewScale, zoom } from "../editor.ts";
import { t } from "../i18n.ts";
import { Icon } from "../icons.tsx";
import { ZOOM_MAX, ZOOM_MIN } from "./Stage.tsx";

/** "01:23.45": minutes, seconds and hundredths, the way editors show time. */
export function timecode(s: number): string {
  const v = Math.max(0, s);
  const m = Math.floor(v / 60);
  const sec = v - m * 60;
  return `${String(m).padStart(2, "0")}:${sec.toFixed(2).padStart(5, "0")}`;
}

const ZOOMS = [0.25, 0.5, 0.75, 1, 1.5, 2, 4];
/** The next zoom step up or down from the current scale. */
export function stepZoom(k: number, dir: 1 | -1): number {
  const next = dir > 0 ? ZOOMS.find((z) => z > k + 1e-3) : [...ZOOMS].reverse().find((z) => z < k - 1e-3);
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next ?? k));
}

/** Playback and view controls under the canvas. */
export function Transport() {
  const tm = timings.value[lang.value];
  const dur = tm?.duration ?? 0;
  const now = lessonTime.value;
  const g = guides.value;
  const k = viewScale.value;
  const toggle = (key: keyof typeof g) => { guides.value = { ...g, [key]: !g[key] }; };
  return (
    <div class="transport" role="toolbar" aria-label={t("transport")} dir="ltr">
      <div class="grp">
        <button type="button" class="btn ghost icon" title={`${t("back2")} (J)`} aria-label={t("back2")} onClick={() => seekLesson(now - 2)}><Icon name="back" /></button>
        <button type="button" class="btn ghost icon" title={`${t("stepBack")} (←)`} aria-label={t("stepBack")} onClick={() => seekLesson(now - 0.1)}><Icon name="stepBack" /></button>
        <button type="button" class="play-btn" title={`${playing.value ? t("pause") : t("play")} (Space, K)`} aria-label={playing.value ? t("pause") : t("play")} onClick={togglePlay}>
          <Icon name={playing.value ? "pause" : "play"} />
        </button>
        <button type="button" class="btn ghost icon" title={`${t("stepFwd")} (→)`} aria-label={t("stepFwd")} onClick={() => seekLesson(now + 0.1)}><Icon name="stepFwd" /></button>
        <button type="button" class="btn ghost icon" title={`${t("fwd2")} (L)`} aria-label={t("fwd2")} onClick={() => seekLesson(now + 2)}><Icon name="fwd" /></button>
      </div>
      <div class="grp">
        <span class="timecode" aria-label={t("time")}>{timecode(now)} <small>/ {timecode(dur)}</small></span>
      </div>
      <div class="grp">
        <button type="button" class="btn ghost icon" aria-pressed={loopScene.value} title={`${t("loopScene")} (Shift+L)`} aria-label={t("loopScene")} onClick={() => { loopScene.value = !loopScene.value; }}><Icon name="loop" /></button>
        <select aria-label={t("speed")} value={rate.value} onChange={(e) => { rate.value = Number((e.target as HTMLSelectElement).value); stagePlayer.value?.setRate(rate.value); }}>
          {[0.5, 0.75, 1, 1.25, 1.5, 2].map((r) => <option key={r} value={r}>{r}×</option>)}
        </select>
      </div>
      <span class="spacer" />
      <div class="grp">
        <button type="button" class="btn ghost icon" aria-pressed={g.safe} title={t("safeAreas")} aria-label={t("safeAreas")} onClick={() => toggle("safe")}><Icon name="safe" /></button>
        <button type="button" class="btn ghost icon" aria-pressed={g.center} title={t("centreLines")} aria-label={t("centreLines")} onClick={() => toggle("center")}><Icon name="center" /></button>
        <button type="button" class="btn ghost icon" aria-pressed={g.thirds} title={t("thirds")} aria-label={t("thirds")} onClick={() => toggle("thirds")}><Icon name="thirds" /></button>
      </div>
      <div class="grp">
        <button type="button" class="btn ghost icon" title={`${t("zoomOut")} (Ctrl −)`} aria-label={t("zoomOut")} onClick={() => { zoom.value = stepZoom(k, -1); }}><Icon name="zoomOut" /></button>
        <select class="zoom-val" aria-label={t("zoom")} value={zoom.value === "fit" ? "fit" : String(zoom.value)}
          onChange={(e) => { const v = (e.target as HTMLSelectElement).value; zoom.value = v === "fit" ? "fit" : Number(v); }}>
          <option value="fit">{t("fit")} ({Math.round(k * 100)}%)</option>
          {ZOOMS.map((z) => <option key={z} value={String(z)}>{Math.round(z * 100)}%</option>)}
          {zoom.value !== "fit" && !ZOOMS.includes(zoom.value) ? <option value={String(zoom.value)}>{Math.round(zoom.value * 100)}%</option> : null}
        </select>
        <button type="button" class="btn ghost icon" title={`${t("zoomIn")} (Ctrl +)`} aria-label={t("zoomIn")} onClick={() => { zoom.value = stepZoom(k, 1); }}><Icon name="zoomIn" /></button>
        <button type="button" class="btn ghost icon" title={`${t("fit")} (Ctrl 0)`} aria-label={t("fit")} onClick={() => { zoom.value = "fit"; }}><Icon name="fit" /></button>
      </div>
    </div>
  );
}
