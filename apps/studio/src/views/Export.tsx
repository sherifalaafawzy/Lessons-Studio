import { useEffect, useState } from "preact/hooks";
import { pick } from "@lessonstudio/spec";
import { lang, lesson, lessonId } from "../editor.ts";
import { call, mcpAddress, type Exported } from "../ai.ts";
import { t, type Key } from "../i18n.ts";
import { Copy } from "./Settings.tsx";

function useEscape(onClose: () => void): void {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
  }, []);
}

/** Saves a file the browser downloads. */
function download(name: string, data: BlobPart, type: string): void {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** R: what the lesson can leave the studio as, today. */
export function Export({ onClose }: { onClose: () => void }) {
  useEscape(onClose);
  const l = lesson.value;
  if (!l) return null;
  const file = () => download(`${l.manifest.id}.json`, JSON.stringify({ manifest: l.manifest, scenes: l.scenes }, null, 2), "application/json");
  return (
    <div class="modal" role="dialog" aria-modal="true" aria-label={t("export")} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div class="modal-box">
        <div class="modal-head"><h2>{t("export")}</h2><span class="f-hint" dir="auto">{pick(l.manifest.title, lang.value)}</span></div>
        <div class="export-list">
          <div class="export-item">
            <div><strong>{t("lessonFile")}</strong><span class="f-hint">{t("lessonFileAbout")}</span></div>
            <button type="button" class="btn primary" onClick={file}>{t("download")}</button>
          </div>
          <div class="export-item">
            <div><strong>{t("forAiApps")}</strong><span class="f-hint">{t("forAiAppsAbout")}</span></div>
            <Copy text={mcpAddress()} />
          </div>
          <Mp4 />
        </div>
        <div class="modal-foot"><button type="button" class="link" onClick={onClose}>{t("close")}</button></div>
      </div>
    </div>
  );
}

/** The lesson as an MP4, made by the exportVideo function from what is saved, in the stage language. */
function Mp4() {
  const [size, setSize] = useState(360);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const id = lessonId.value;
  const make = async () => {
    if (!id) return;
    setBusy(true);
    setNote(null);
    try {
      const r = await call<Exported>("exportVideo", { lesson: id, lang: lang.value, size }, 900_000);
      const bin = atob(r.mp4);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      download(r.name, bytes, "video/mp4");
      setNote({ ok: true, text: t("mp4Saved").replace("{name}", r.name).replace("{mb}", (r.bytes / 1048576).toFixed(1)) });
    } catch (e) {
      setNote({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div class="export-item">
      <div>
        <strong>{t("videoMp4")}</strong>
        <span class="f-hint">{t("videoMp4About")}</span>
        {busy && <span class="f-hint" role="status">{t("makingMp4")}</span>}
        {note && <span class={note.ok ? "f-hint" : "f-hint warn"} role={note.ok ? "status" : "alert"}>{note.text}</span>}
      </div>
      <label class="export-size">
        <span class="sr">{t("mp4Size")}</span>
        <select value={size} disabled={busy} onChange={(e) => setSize(Number((e.target as HTMLSelectElement).value))} aria-label={t("mp4Size")}>
          <option value={360}>360p</option>
          <option value={240}>240p</option>
          <option value={144}>144p</option>
        </select>
      </label>
      <button type="button" class="btn primary" disabled={busy || !id} onClick={make}>{busy ? t("makingMp4") : t("makeMp4")}</button>
    </div>
  );
}

const KEYS: [string[], Key][] = [
  [["Space"], "keyPlay"], [["K"], "keyPlay"], [["J"], "back2"], [["L"], "fwd2"], [["←", "→"], "keyStep"], [["Shift", "←/→"], "keyStepSecond"],
  [["Home"], "keyStart"], [["End"], "keyEnd"], [["Shift", "L"], "loopScene"],
  [["Space", "drag"], "keyPan"], [["Ctrl", "wheel"], "zoom"], [["Ctrl", "0"], "fit"], [["Ctrl", "1"], "keyActual"], [["Ctrl", "+/−"], "keyZoomStep"],
  [["Ctrl", "Z"], "undo"], [["Ctrl", "Y"], "redo"], [["Ctrl", "K"], "commands"], [["R"], "export"], [["?"], "shortcuts"],
  [["↑↓←→"], "keyNudge"], [["Shift", "↑↓←→"], "keyNudge10"], [["Delete"], "keyDelete"], [["Esc"], "keyDeselect"],
  [["double-click"], "doubleClickToType"],
];

/** ?: every keyboard shortcut. */
export function Shortcuts({ onClose }: { onClose: () => void }) {
  useEscape(onClose);
  return (
    <div class="modal" role="dialog" aria-modal="true" aria-label={t("shortcuts")} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div class="modal-box">
        <h2>{t("shortcuts")}</h2>
        <dl class="keys-grid">
          {KEYS.map(([keys, label], i) => (
            <>
              <dt key={`k${i}`} dir="ltr">{keys.map((k) => <kbd key={k}>{k}</kbd>)}</dt>
              <dd key={`d${i}`}>{t(label)}</dd>
            </>
          ))}
        </dl>
        <div class="modal-foot"><button type="button" class="link" onClick={onClose}>{t("close")}</button></div>
      </div>
    </div>
  );
}
