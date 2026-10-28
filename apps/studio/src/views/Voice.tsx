import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { signal } from "@preact/signals";
import type { Lang, Scene } from "@lessonstudio/spec";
import { clipFits, type VoiceClip } from "@lessonstudio/ops";
import { lesson, recorder, state, timings } from "../editor.ts";
import { addVoice, changeVoice, clipUrl, envelope, peaksOf, upload } from "../voice.ts";
import { say } from "../state.ts";
import { t, type Key } from "../i18n.ts";
import { Icon } from "../icons.tsx";

const mmss = (s: number): string => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const KIND: Record<VoiceClip["kind"], Key> = { ai: "kindAi", recorded: "kindRecorded", uploaded: "kindUploaded" };
const ACCEPT = "audio/*,video/webm,video/mp4,.m4a,.mp3,.wav,.ogg,.opus,.webm,.aac,.flac";

/** A waveform drawn to fill its box (peaks 0–255). */
export function ClipWave({ peaks, class: cls }: { peaks: ArrayLike<number>; class?: string }) {
  const d = useMemo(() => envelope(peaks), [peaks]);
  return (
    <svg class={`clip-wave${cls ? ` ${cls}` : ""}`} viewBox={`0 0 ${Math.max(1, peaks.length)} 100`} preserveAspectRatio="none" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

/* ---------- one clip playing at a time, from the voice cards ---------- */

const playing = signal<{ id: string; at: number } | null>(null);
let audio: HTMLAudioElement | null = null;
let raf = 0;
function stopClip(): void {
  audio?.pause();
  audio = null;
  cancelAnimationFrame(raf);
  playing.value = null;
}
function playClip(id: string, clip: VoiceClip): void {
  stopClip();
  const a = new Audio(clipUrl(clip));
  audio = a;
  a.addEventListener("ended", stopClip);
  a.addEventListener("error", () => { stopClip(); say(t("voiceLoadFailed"), true); });
  void a.play();
  playing.value = { id, at: 0 };
  const tick = () => {
    if (audio !== a) return;
    playing.value = { id, at: a.currentTime / clip.seconds };
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
}

/** Whether a dragged item carries a file. */
const hasFile = (e: DragEvent): boolean => !!e.dataTransfer?.types.includes("Files");

/**
 * The scene's voice in each language: its take (play it, see its waveform), whether it still says what the script
 * says, and record, upload (or drop a file), remove and undo.
 */
export function VoicePanel({ scene }: { scene: Scene }) {
  const l = lesson.value;
  const [busy, setBusy] = useState<string | null>(null);
  const [drop, setDrop] = useState<string | null>(null);
  useEffect(() => stopClip, [scene.id]);
  if (!l) return null;
  const act = async (code: Lang, action: "remove" | "undo") => {
    setBusy(code);
    try {
      await changeVoice(scene.id, code, action);
      say(t(action === "remove" ? "voiceRemoved" : "voiceUndone"));
    } catch (e) {
      say((e as Error).message, true);
    }
    setBusy(null);
  };
  return (
    <div class="voices">
      {l.manifest.languages.map((g) => {
        const doc = state.value?.voice[g.code];
        const clip = doc?.clips[scene.id];
        const fits = clipFits(scene, g.code, clip);
        const canUndo = !!doc?.prev && scene.id in doc.prev;
        // An older lesson: one narration file for the whole language, not scene by scene.
        const legacy = !doc && !!g.audio && timings.value[g.code]?.source !== "estimated";
        const id = `${scene.id}:${g.code}`;
        const p = playing.value?.id === id ? playing.value : null;
        const status = fits ? "ok" : clip ? "stale" : "none";
        return (
          <div key={g.code} class={`vcard ${status}${drop === g.code ? " drop" : ""}`}
            onDragOver={(e) => { if (hasFile(e as DragEvent)) { e.preventDefault(); setDrop(g.code); } }}
            onDragLeave={() => setDrop(null)}
            onDrop={(e) => {
              const f = (e as DragEvent).dataTransfer?.files[0];
              setDrop(null);
              if (!f) return;
              e.preventDefault();
              recorder.value = { scene: scene.id, lang: g.code, file: f };
            }}>
            <div class="vcard-head">
              <span class="f-code" dir="ltr">{g.code.toUpperCase()}</span>
              <span class="vcard-name" lang={g.code} dir={g.dir}>{g.name}</span>
              {clip ? <span class={`vkind ${clip.kind}`}>{t(KIND[clip.kind])}{clip.voice ? ` ${clip.voice}` : ""}</span> : null}
              {clip ? <span class="vcard-dur" dir="ltr">{mmss(clip.seconds)}</span> : null}
            </div>
            {clip ? (
              <div class="vcard-wave" dir="ltr">
                <button type="button" class="vplay" aria-label={p ? t("pause") : t("playClip")} title={p ? t("pause") : t("playClip")}
                  onClick={() => (p ? stopClip() : playClip(id, clip))}><Icon name={p ? "pause" : "play"} /></button>
                <div class={`vcard-wavebox ${clip.kind}`}>
                  <ClipWave peaks={peaksOf(clip)} />
                  {p ? <span class="vprog" style={{ left: `${Math.min(100, p.at * 100)}%` }} /> : null}
                </div>
              </div>
            ) : (
              <div class="vcard-empty"><Icon name="mic" /><span>{drop === g.code ? t("dropAudio") : t("voiceNone")}</span></div>
            )}
            <p class={`vcard-status ${status}`}>
              {fits ? <><Icon name="check" /> {t("voiceFits")}</> : clip ? t("voiceStale") : legacy ? t("voiceLegacy") : t("voiceNoneHint")}
            </p>
            <div class="vcard-actions">
              <button type="button" class={`btn small${fits ? "" : " primary"}`} disabled={busy === g.code}
                onClick={() => { stopClip(); recorder.value = { scene: scene.id, lang: g.code }; }}>
                <Icon name="mic" /> {clip ? t("recAgainShort") : t("recordVoice")}
              </button>
              <label class={`btn small${busy === g.code ? " disabled" : ""}`}>
                <Icon name="upload" /> {t("uploadVoice")}
                <input type="file" accept={ACCEPT} class="sr" disabled={busy === g.code}
                  onChange={(e) => { const f = (e.target as HTMLInputElement).files?.[0]; (e.target as HTMLInputElement).value = ""; if (f) recorder.value = { scene: scene.id, lang: g.code, file: f }; }} />
              </label>
              <span class="spacer" />
              {canUndo ? <button type="button" class="link" disabled={busy === g.code} onClick={() => void act(g.code, "undo")}><Icon name="undo" /> {t("undo")}</button> : null}
              {clip ? <button type="button" class="btn ghost icon small danger-ico" disabled={busy === g.code} aria-label={t("remove")} title={t("remove")} onClick={() => { stopClip(); void act(g.code, "remove"); }}><Icon name="trash" /></button> : null}
            </div>
          </div>
        );
      })}
      <p class="f-hint">{t("voiceAbout")}</p>
    </div>
  );
}

/* ---------- the recorder ---------- */

type Phase = "ready" | "count" | "rec" | "review" | "saving";

/** Peaks a second in the recorder's waveforms, as in a clip's. */
const PEAKS = 40;

/** A take's length and waveform, decoded in the browser; null when this browser can't decode it. */
async function measure(blob: Blob): Promise<{ seconds: number; peaks: Uint8Array } | null> {
  try {
    const buf = await new OfflineAudioContext(1, 1, 8000).decodeAudioData(await blob.arrayBuffer());
    const s = buf.getChannelData(0);
    const step = buf.sampleRate / PEAKS;
    const peaks = new Uint8Array(Math.ceil(s.length / step));
    for (let i = 0; i < peaks.length; i++) {
      let m = 0;
      for (let j = Math.floor(i * step), e = Math.min(s.length, Math.floor((i + 1) * step)); j < e; j++) m = Math.max(m, Math.abs(s[j]!));
      peaks[i] = Math.min(255, Math.round(m * 255));
    }
    return { seconds: buf.duration, peaks };
  } catch {
    return null;
  }
}

const MAX_SECONDS = 300;
const mimeType = (): string | undefined =>
  typeof MediaRecorder === "undefined" ? undefined : ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4"].find((m) => MediaRecorder.isTypeSupported(m));

/**
 * Records a scene's script with the microphone, or takes an audio file: the script to read, a level meter, a count-in,
 * the take's waveform to review, then the take sent to the server, which cleans it up and times its words.
 */
export function Recorder({ scene: sceneId, lang: code, file, onClose }: { scene: string; lang: Lang; file?: File; onClose: () => void }) {
  const l = lesson.value;
  const scene = l?.scenes.scenes.find((s) => s.id === sceneId);
  const index = l?.scenes.scenes.findIndex((s) => s.id === sceneId) ?? -1;
  const track = l?.manifest.languages.find((g) => g.code === code);
  const [phase, setPhase] = useState<Phase>(file ? "review" : "ready");
  const [count, setCount] = useState(3);
  const [take, setTake] = useState<{ blob: Blob; kind: "recorded" | "uploaded"; name?: string } | null>(file ? { blob: file, kind: "uploaded", name: file.name } : null);
  const [look, setLook] = useState<{ seconds: number; peaks: Uint8Array } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [mic, setMic] = useState<string>(() => { try { return localStorage.getItem("ls-mic") ?? ""; } catch { return ""; } });
  const [sent, setSent] = useState<number | null>(null);
  const [listen, setListen] = useState<{ at: number } | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const meter = useRef<HTMLSpanElement>(null);
  const clock = useRef<HTMLSpanElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const live = useRef<number[]>([]);
  const player = useRef<HTMLAudioElement | null>(null);

  // The microphone, from opening until closing (not for a file): its level shows before recording, so you see it works.
  useEffect(() => {
    if (file) return;
    let gone = false;
    let ctx: AudioContext | null = null;
    let frame = 0;
    setError(null);
    navigator.mediaDevices?.getUserMedia({ audio: { ...(mic ? { deviceId: { exact: mic } } : {}), channelCount: 1, echoCancellation: false, noiseSuppression: true } })
      .then(async (s) => {
        if (gone) { s.getTracks().forEach((x) => x.stop()); return; }
        stream.current = s;
        setMics((await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "audioinput"));
        ctx = new AudioContext();
        const an = ctx.createAnalyser();
        an.fftSize = 1024;
        ctx.createMediaStreamSource(s).connect(an);
        const buf = new Float32Array(an.fftSize);
        let last = 0;
        const tick = (now: number) => {
          an.getFloatTimeDomainData(buf);
          let peak = 0;
          for (const v of buf) peak = Math.max(peak, Math.abs(v));
          const db = 20 * Math.log10(peak + 1e-6);
          const el = meter.current;
          if (el) {
            el.style.transform = `scaleX(${Math.max(0, Math.min(1, (db + 60) / 60))})`;
            el.dataset.level = db > -3 ? "loud" : db > -40 ? "good" : "quiet";
          }
          const r = rec.current;
          if (r?.state === "recording") {
            if (now - last >= 1000 / PEAKS) { live.current.push(Math.min(255, Math.round(peak * 255))); last = now; }
            const secs = live.current.length / PEAKS;
            if (clock.current) clock.current.textContent = mmss(secs);
            drawLive();
            if (secs >= MAX_SECONDS) r.stop();
          }
          frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      })
      .catch((e: Error) => setError(e.name === "NotAllowedError" ? t("micBlocked") : e.name === "NotFoundError" ? t("micNone") : e.message));
    return () => {
      gone = true;
      cancelAnimationFrame(frame);
      if (rec.current?.state === "recording") rec.current.stop();
      stream.current?.getTracks().forEach((x) => x.stop());
      stream.current = null;
      void ctx?.close();
    };
  }, [mic, file]);

  // The waveform as it is recorded: the newest at the end, the older scrolling away.
  const drawLive = () => {
    const c = canvas.current;
    if (!c) return;
    const w = c.clientWidth * devicePixelRatio, h = c.clientHeight * devicePixelRatio;
    if (c.width !== w) { c.width = w; c.height = h; }
    const g = c.getContext("2d")!;
    g.clearRect(0, 0, w, h);
    g.fillStyle = getComputedStyle(c).color;
    const bar = 3 * devicePixelRatio, gap = 2 * devicePixelRatio;
    const fit = Math.floor(w / (bar + gap));
    const show = live.current.slice(-fit);
    show.forEach((v, i) => {
      const bh = Math.max(2 * devicePixelRatio, (v / 255) * h * 0.92);
      g.fillRect(i * (bar + gap), (h - bh) / 2, bar, bh);
    });
  };

  // A take (recorded or chosen) is measured for its waveform; a new take replaces the old one's player.
  useEffect(() => {
    setLook(null);
    player.current?.pause();
    player.current = null;
    setListen(null);
    if (take) void measure(take.blob).then(setLook);
  }, [take]);
  useEffect(() => () => { player.current?.pause(); }, []);

  const start = () => {
    if (!stream.current || phase !== "ready") return;
    setPhase("count");
    setCount(3);
    let n = 3;
    const step = () => {
      n -= 1;
      if (n > 0) { setCount(n); setTimeout(step, 650); return; }
      const r = new MediaRecorder(stream.current!, { ...(mimeType() ? { mimeType: mimeType() } : {}), audioBitsPerSecond: 96000 });
      const chunks: Blob[] = [];
      r.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      r.onstop = () => {
        setTake({ blob: new Blob(chunks, { type: r.mimeType || "audio/webm" }), kind: "recorded" });
        setPhase("review");
      };
      live.current = [];
      rec.current = r;
      r.start(250);
      setPhase("rec");
    };
    setTimeout(step, 650);
  };
  const stop = () => { if (rec.current?.state === "recording") rec.current.stop(); };
  const again = () => { setTake(null); setError(null); setPhase(file ? "review" : "ready"); };
  const toggleListen = () => {
    if (!take) return;
    if (player.current && !player.current.paused) { player.current.pause(); setListen(null); return; }
    const a = player.current ?? new Audio(URL.createObjectURL(take.blob));
    player.current = a;
    a.onended = () => setListen(null);
    void a.play();
    const tick = () => {
      if (player.current !== a || a.paused) return;
      setListen({ at: look ? a.currentTime / look.seconds : 0 });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  const use = async () => {
    if (!take) return;
    player.current?.pause();
    setPhase("saving");
    setSent(0);
    setError(null);
    try {
      const path = await upload(take.blob, setSent);
      setSent(1);
      await addVoice(sceneId, code, path, take.kind);
      say(t("voiceSaved").replace("{n}", String(index + 1)));
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setPhase("review");
      setSent(null);
    }
  };

  // Space starts and stops; Enter uses the take; Escape closes. The recorder hears keys first, and keeps them from the
  // editor (Space would play the stage, R open Export).
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      e.stopPropagation();
      if (e.key === "Escape") { if (phase !== "saving") onClose(); return; }
      if (tag === "SELECT" || tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === " ") {
        e.preventDefault();
        if (phase === "ready") start();
        else if (phase === "rec") stop();
        else if (phase === "review") toggleListen();
      }
      if (e.key === "Enter" && phase === "review" && take) { e.preventDefault(); void use(); }
    };
    addEventListener("keydown", k, true);
    return () => removeEventListener("keydown", k, true);
  });

  if (!l || !scene || !track) return null;
  const script = scene.narration[code] ?? "";
  const words = script.trim() ? script.trim().split(/\s+/).length : 0;
  return (
    <div class="modal" role="dialog" aria-modal="true" aria-label={file ? t("useFileTitle") : t("recTitle")}>
      <div class="modal-box recorder">
        <div class="modal-head">
          <h2>{file ? t("useFileTitle") : t("recTitle")}</h2>
          <span class="badge">{t("scene")} {index + 1}{t("sep")}<span lang={code} dir={track.dir}>{track.name}</span></span>
          <button type="button" class="link" disabled={phase === "saving"} onClick={onClose}>{t("close")}</button>
        </div>

        <div class="rec-script">
          <div class="rec-script-head"><span>{t("recScript")}</span><span dir="ltr">{words} {t("words")}</span></div>
          <p lang={code} dir={track.dir}>{script || <em>{t("recNoScript")}</em>}</p>
        </div>

        {phase === "ready" || phase === "count" || phase === "rec" ? (
          <div class={`rec-stage ${phase}`}>
            <div class="rec-live" dir="ltr">
              {phase === "rec" ? <canvas ref={canvas} class="rec-canvas" /> : <p class="f-hint">{error ?? t("recHint")}</p>}
            </div>
            <div class="rec-controls" dir="ltr">
              <button type="button" class={`rec-btn ${phase}`} disabled={!!error || (phase === "ready" && !stream.current && !mics.length)}
                aria-label={phase === "rec" ? t("recStop") : t("recStart")} onClick={() => (phase === "rec" ? stop() : start())}>
                {phase === "count" ? <span class="rec-count">{count}</span> : <span class="rec-dot" />}
              </button>
              <div class="rec-side">
                <span class="rec-clock" ref={clock}>{phase === "rec" ? "0:00" : phase === "count" ? t("recGetReady") : t("recStart")}</span>
                <span class="rec-meter" aria-label={t("recLevel")}><span ref={meter} /></span>
              </div>
            </div>
            {mics.length > 1 && phase === "ready" ? (
              <label class="f-row rec-mic"><span>{t("recMic")}</span>
                <select value={mic} onChange={(e) => { const v = (e.target as HTMLSelectElement).value; setMic(v); try { localStorage.setItem("ls-mic", v); } catch { /* private mode */ } }}>
                  <option value="">{t("recMicDefault")}</option>
                  {mics.map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `${t("recMic")} ${i + 1}`}</option>)}
                </select>
              </label>
            ) : null}
          </div>
        ) : (
          <div class="rec-review" dir="ltr">
            <button type="button" class="vplay big" disabled={phase === "saving" || !take} aria-label={listen ? t("pause") : t("playClip")} onClick={toggleListen}>
              <Icon name={listen ? "pause" : "play"} />
            </button>
            <div class="rec-take">
              <div class="vcard-wavebox recorded">
                {look ? <ClipWave peaks={look.peaks} /> : <span class="f-hint">{take ? t("recNoPreview") : ""}</span>}
                {listen ? <span class="vprog" style={{ left: `${Math.min(100, listen.at * 100)}%` }} /> : null}
              </div>
              <span class="f-hint">{take?.name ? `${take.name}${t("sep")}` : ""}{look ? mmss(look.seconds) : ""}</span>
            </div>
          </div>
        )}

        {phase === "saving" ? (
          <div class="rec-saving">
            <span class={`rec-bar${sent === 1 ? " busy" : ""}`}><span style={{ transform: `scaleX(${sent ?? 0})` }} /></span>
            <span class="f-hint">{sent === 1 ? t("recProcessing") : `${t("recUploading")} ${Math.round((sent ?? 0) * 100)}%`}</span>
          </div>
        ) : null}
        {error && phase === "review" ? <p class="rec-error" role="alert">{error}</p> : null}

        <div class="modal-foot">
          {phase === "review" ? (
            <>
              {file ? null : <button type="button" class="btn" onClick={again}><Icon name="undo" /> {t("recAgain")}</button>}
              <button type="button" class="btn primary" disabled={!take} onClick={() => void use()}>{file ? t("recUseFile") : t("recUse")}</button>
            </>
          ) : phase === "saving" ? null : <span class="f-hint">{t("recKeys")}</span>}
        </div>
      </div>
    </div>
  );
}
