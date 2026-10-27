import { useEffect, useRef, useState } from "preact/hooks";
import { createPlayer, type Player, type Signals } from "@lessonstudio/player";
import { toPackage } from "@lessonstudio/ops";
import { LIBRARY } from "../env.ts";
import { lang, lesson, timings } from "../editor.ts";
import { t } from "../i18n.ts";

/** "Low-end phone, 3G": 2 GB of memory and a slow network, so the player picks its Lite tier, as such a phone would. */
const PHONE: Signals = { memory: 2, cores: 4, network: "3g" };

async function gzipSize(text: string): Promise<number | null> {
  if (typeof CompressionStream === "undefined") return null;
  const s = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
  return (await new Response(s).arrayBuffer()).byteLength;
}

/** The lesson as learners get it, from the first scene, on a desktop or a low-end phone, with its download size. */
export function Preview({ onClose }: { onClose: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const [device, setDevice] = useState<"phone" | "desktop">("phone");
  const [kb, setKb] = useState<number | null>(null);
  const l = lesson.value;
  useEffect(() => {
    if (!l || !host.current) return;
    const pkg = toPackage(l, timings.value);
    const p: Player = createPlayer(host.current, pkg, { library: LIBRARY,
      lang: lang.value, tier: "auto", orient: device === "phone" ? "auto" : "landscape",
      ...(device === "phone" ? { signals: PHONE } : { signals: {} }),
    });
    const files = [JSON.stringify(pkg.manifest), JSON.stringify(pkg.scenes), JSON.stringify(pkg.timing[lang.value])];
    void gzipSize(files.join("")).then((n) => setKb(n === null ? null : Math.round(n / 102.4) / 10));
    return () => p.destroy();
  }, [device, lang.value]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
  }, []);
  const audio = l?.manifest.languages.find((g) => g.code === lang.value)?.audio;
  return (
    <div class="modal" role="dialog" aria-modal="true" aria-label={t("preview")}>
      <div class="modal-box preview">
        <div class="modal-head">
          <h2>{t("preview")}</h2>
          <div class="seg" role="radiogroup" aria-label={t("device")}>
            <button type="button" role="radio" aria-checked={device === "phone"} class={device === "phone" ? "on" : ""} onClick={() => setDevice("phone")}>{t("phone3g")}</button>
            <button type="button" role="radio" aria-checked={device === "desktop"} class={device === "desktop" ? "on" : ""} onClick={() => setDevice("desktop")}>{t("desktop")}</button>
          </div>
          <button type="button" class="link" onClick={onClose}>{t("close")}</button>
        </div>
        <div class={`device ${device}`}><div ref={host} /></div>
        <p class="f-hint">
          {kb !== null ? <>{t("downloads")} <span dir="ltr">{kb} KB</span> {t("gzipped")}{audio ? "" : `, ${t("noAudioYet")}`}. </> : null}
          {device === "phone" ? t("phoneNote") : null}
        </p>
      </div>
    </div>
  );
}
