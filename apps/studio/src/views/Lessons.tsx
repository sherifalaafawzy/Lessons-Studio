import { useEffect, useState } from "preact/hooks";
import { collection, doc, getDocs, onSnapshot, query, where, writeBatch } from "firebase/firestore";
import { dirOf, pick } from "@lessonstudio/spec";
import { newLesson, type Lesson, type LessonDoc } from "@lessonstudio/ops";
import { db } from "../fb.ts";
import { go, say, user } from "../state.ts";
import { createLesson } from "../sync.ts";
import { EXAMPLES, asNewLesson, newId, parseLessonFile } from "../examples.ts";
import { starterScenes } from "../presets.ts";
import { call, type AiStatus, type Drafted } from "../ai.ts";
import { t, viaName, ago } from "../i18n.ts";

interface Row { id: string; doc: LessonDoc }

const LANGS: [string, string][] = [
  ["en", "English"], ["ar", "العربية"], ["fr", "Français"], ["es", "Español"], ["pt", "Português"], ["sw", "Kiswahili"],
  ["ha", "Hausa"], ["ur", "اردو"], ["fa", "فارسی"], ["tr", "Türkçe"], ["hi", "हिन्दी"], ["id", "Bahasa Indonesia"],
];

/** The person's lessons (live), and a brief to start a new one. */
export function Lessons() {
  const uid = user.value!.uid;
  const [rows, setRows] = useState<Row[] | null>(null);
  const [brief, setBrief] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  useEffect(() => onSnapshot(
    query(collection(db, "lessons"), where("members", "array-contains", uid)),
    (s) => setRows(s.docs.map((d) => ({ id: d.id, doc: d.data() as LessonDoc })).sort((a, b) => b.doc.updatedAt - a.doc.updatedAt)),
    (e) => say(e.message, true),
  ), [uid]);

  const remove = async (r: Row) => {
    setConfirming(null);
    const ref = doc(db, "lessons", r.id);
    const b = writeBatch(db);
    for (const sub of ["scenes", "ops", "timing"]) for (const d of (await getDocs(collection(ref, sub))).docs) b.delete(d.ref);
    b.delete(ref);
    await b.commit().catch((e) => say(e.message, true));
  };

  return (
    <main class="lessons">
      <div class="lessons-head">
        <h1>{t("yourLessons")}</h1>
        <button type="button" class="btn primary" onClick={() => setBrief(true)}>+ {t("newLesson")}</button>
      </div>
      {rows === null ? <p>{t("loading")}</p> : rows.length === 0 ? <p class="empty-note">{t("noLessons")}</p> : (
        <ul class="lesson-list">
          {rows.map((r) => (
            <li key={r.id}>
              <a href={`/lessons/${r.id}`} onClick={(e) => { e.preventDefault(); go(`/lessons/${r.id}`); }}>
                <strong dir="auto">{r.doc.title}</strong>
                <span class="f-hint">{r.doc.langs.join(", ")}{t("sep")}{r.doc.order.length} {t("scenes")}{t("sep")}{t("lastChange")} {viaName(r.doc.updatedVia)}, {ago(r.doc.updatedAt)}</span>
              </a>
              {r.doc.owner !== uid ? null : confirming === r.id ? (
                <span class="confirm" role="alert">
                  <span dir="auto">{t("confirmDelete").replace("{title}", r.doc.title)}</span>
                  <button type="button" class="btn danger" onClick={() => void remove(r)}>{t("yes")}</button>
                  <button type="button" class="link" onClick={() => setConfirming(null)}>{t("no")}</button>
                </span>
              ) : <button type="button" class="tool danger" aria-label={t("delete")} title={t("delete")} onClick={() => setConfirming(r.id)}>✕</button>}
            </li>
          ))}
        </ul>
      )}
      {brief ? <Brief onClose={() => setBrief(false)} /> : null}
    </main>
  );
}

/** Starting a lesson: from a brief, from one of the example lessons, or from a lesson file. */
function Brief({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<"blank" | "ai" | "example" | "file">("blank");
  return (
    <div class="modal" role="dialog" aria-modal="true" aria-label={t("newLesson")}>
      <div class="modal-box">
        <h2>{t("newLesson")}</h2>
        <div class="seg" role="radiogroup" aria-label={t("startFrom")}>
          {(["blank", "ai", "example", "file"] as const).map((m) => (
            <button type="button" key={m} role="radio" aria-checked={mode === m} class={mode === m ? "on" : ""} onClick={() => setMode(m)}>
              {t(m === "blank" ? "startBlank" : m === "ai" ? "draftWithAi" : m === "example" ? "fromExample" : "importFile")}
            </button>
          ))}
        </div>
        {mode === "blank" ? <BlankBrief onClose={onClose} /> : mode === "ai" ? <AiDraft onClose={onClose} />
          : mode === "example" ? <FromExample onClose={onClose} /> : <FromFile onClose={onClose} />}
      </div>
    </div>
  );
}

async function createAndOpen(lesson: Lesson): Promise<void> {
  await createLesson(db, lesson.manifest.id, lesson, user.value!.uid);
  go(`/lessons/${lesson.manifest.id}`);
}

/** The example lessons, each copied into the person's own lessons to edit. */
function FromExample({ onClose }: { onClose: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const start = async (id: string) => {
    setBusy(id);
    const ex = EXAMPLES.find((e) => e.id === id)!;
    try {
      await createAndOpen(asNewLesson(await ex.load(), newId(ex.id), user.value!.uid, `from the example "${ex.id}"`));
    } catch (e) {
      say((e as Error).message, true);
      setBusy(null);
    }
  };
  return (
    <>
      <ul class="examples">
        {EXAMPLES.map((ex) => (
          <li key={ex.id}>
            <button type="button" class="example" disabled={busy !== null} onClick={() => void start(ex.id)}>
              <strong dir="auto">{pick(ex.manifest.title, "en")}</strong>
              <span dir="rtl" lang="ar">{pick(ex.manifest.title, "ar")}</span>
              <span class="f-hint" dir="auto">{pick(ex.manifest.summary ?? "", "en")}</span>
              <span class="f-hint">{ex.manifest.languages.map((l) => l.name).join(t("sep"))}{t("sep")}{t(ex.manifest.stage ?? "landscape")}{busy === ex.id ? `${t("sep")}${t("creating")}` : ""}</span>
            </button>
          </li>
        ))}
      </ul>
      <div class="modal-foot"><button type="button" class="link" onClick={onClose}>{t("cancel")}</button></div>
    </>
  );
}

/** A brief for Gemini, with the person's own key: it drafts the whole lesson, checked, in their account. */
function AiDraft({ onClose }: { onClose: () => void }) {
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [topic, setTopic] = useState("");
  const [audience, setAudience] = useState("");
  const [langs, setLangs] = useState<string[]>(["en", "ar"]);
  const [seconds, setSeconds] = useState(90);
  const [stage, setStage] = useState<"landscape" | "portrait" | "square">("landscape");
  const [brand, setBrand] = useState("studio-dark");
  const [busy, setBusy] = useState(false);
  useEffect(() => { call<AiStatus>("aiKeyStatus").then(setStatus, (e: Error) => setErr(e.message)); }, []);
  const ready = topic.trim().length >= 3 && langs.length > 0 && !busy;
  const run = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await call<Drafted>("draftLesson", {
        topic: topic.trim(), audience: audience.trim() || undefined, seconds, stage, brand,
        languages: langs.map((code) => ({ code, name: LANGS.find(([c]) => c === code)?.[1] ?? code })),
      });
      say(t("drafted").replace("{usd}", r.usd.toFixed(3)));
      go(`/lessons/${r.id}`);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };
  if (status && !status.gemini.set) {
    return (
      <>
        <p>{t("needKey")}</p>
        <div class="modal-foot">
          <button type="button" class="link" onClick={onClose}>{t("cancel")}</button>
          <button type="button" class="btn primary" onClick={() => go("/settings")}>{t("openSettings")}</button>
        </div>
      </>
    );
  }
  return (
    <form class="brief" onSubmit={(e) => { e.preventDefault(); if (ready) void run(); }}>
      <label class="f-row"><span>{t("topic")}</span>
        <textarea rows={3} dir="auto" value={topic} disabled={busy} placeholder={t("topicHint")} onInput={(e) => setTopic((e.target as HTMLTextAreaElement).value)} />
      </label>
      <label class="f-row"><span>{t("audience")}</span>
        <input dir="auto" value={audience} disabled={busy} placeholder={t("audienceHint")} onInput={(e) => setAudience((e.target as HTMLInputElement).value)} />
      </label>
      <fieldset class="f-text">
        <legend>{t("languages")} <span class="f-opt">{t("maxLangs")}</span></legend>
        <div class="chips">
          {LANGS.map(([code, name]) => (
            <label key={code} class={langs.includes(code) ? "chip on" : "chip"}>
              <input type="checkbox" class="sr" checked={langs.includes(code)} disabled={busy || (!langs.includes(code) && langs.length >= 4)}
                onChange={(e) => setLangs((e.target as HTMLInputElement).checked ? [...langs, code] : langs.filter((x) => x !== code))} />
              <span lang={code}>{name}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div class="f-grid4">
        <label class="f-row"><span>{t("length")}</span>
          <select value={seconds} disabled={busy} onChange={(e) => setSeconds(Number((e.target as HTMLSelectElement).value))}>
            {[60, 90, 120, 180].map((s) => <option key={s} value={s} dir="ltr">{s} s</option>)}
          </select></label>
        <label class="f-row"><span>{t("shape")}</span>
          <select value={stage} disabled={busy} onChange={(e) => setStage((e.target as HTMLSelectElement).value as typeof stage)}>
            <option value="landscape">{t("landscape")}</option><option value="portrait">{t("portrait")}</option><option value="square">{t("square")}</option>
          </select></label>
        <label class="f-row"><span>{t("look")}</span>
          <select value={brand} disabled={busy} onChange={(e) => setBrand((e.target as HTMLSelectElement).value)}>
            <option value="studio-dark">{t("brandDark")}</option><option value="darsi-light">{t("brandLight")}</option>
          </select></label>
      </div>
      <p class="f-hint">{busy ? t("drafting") : t("draftCost")}</p>
      {err ? <p class="f-hint warn" role="alert">{err}</p> : null}
      <div class="modal-foot">
        <button type="button" class="link" onClick={onClose} disabled={busy}>{t("cancel")}</button>
        <button type="submit" class="btn primary" disabled={!ready || !status}>{busy ? t("working") : t("draftIt")}</button>
      </div>
    </form>
  );
}

/** A lesson file (JSON), e.g. one an AI exported with get_lesson, or a backup. */
function FromFile({ onClose }: { onClose: () => void }) {
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const read = async (f: File) => {
    setErr(null);
    setBusy(true);
    try {
      const l = parseLessonFile(await f.text());
      await createAndOpen(asNewLesson(l, newId(pick(l.manifest.title, "en", l.manifest.defaultLang) || l.manifest.id), user.value!.uid, `imported from ${f.name}`));
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };
  return (
    <>
      <label class="f-row"><span>{t("chooseFile")}</span>
        <input type="file" accept=".json,application/json" disabled={busy}
          onChange={(e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) void read(f); }} />
      </label>
      <p class="f-hint">{t("importHint")}</p>
      {err ? <p class="f-hint warn" role="alert">{err}</p> : null}
      <div class="modal-foot"><button type="button" class="link" onClick={onClose}>{t("cancel")}</button></div>
    </>
  );
}

/** What the lesson is about: title, languages, look. Its first scenes are made from it. */
function BlankBrief({ onClose }: { onClose: () => void }) {
  const [langs, setLangs] = useState<string[]>(["en", "ar"]);
  const [title, setTitle] = useState<Record<string, string>>({});
  const [brand, setBrand] = useState("studio-dark");
  const [stage, setStage] = useState<"landscape" | "portrait" | "square">("landscape");
  const [busy, setBusy] = useState(false);
  const ready = langs.length > 0 && langs.every((l) => (title[l] ?? "").trim());
  const create = async () => {
    setBusy(true);
    const lesson = newLesson({
      id: newId(title.en ?? title[langs[0]!] ?? "lesson"), title: Object.fromEntries(langs.map((l) => [l, title[l]!.trim()])),
      languages: langs.map((code) => ({ code, name: LANGS.find(([c]) => c === code)?.[1] ?? code })),
      brand, stage, createdBy: user.value!.uid, tool: "Lesson Studio",
    });
    lesson.scenes.scenes = starterScenes({ langs, stage }, lesson.manifest.title);
    try {
      await createAndOpen(lesson);
    } catch (e) {
      say((e as Error).message, true);
      setBusy(false);
    }
  };
  return (
    <form class="brief" onSubmit={(e) => { e.preventDefault(); if (ready && !busy) void create(); }}>
      <fieldset class="f-text">
        <legend>{t("languages")}</legend>
        <div class="chips">
          {LANGS.map(([code, name]) => (
            <label key={code} class={langs.includes(code) ? "chip on" : "chip"}>
              <input type="checkbox" class="sr" checked={langs.includes(code)}
                onChange={(e) => setLangs((e.target as HTMLInputElement).checked ? [...langs, code] : langs.filter((x) => x !== code))} />
              <span lang={code}>{name}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset class="f-text">
        <legend>{t("fTitle")}</legend>
        {langs.map((l) => (
          <label key={l} class="f-lang">
            <span class="f-code">{l.toUpperCase()}</span>
            <input dir={dirOf(l)} lang={l} value={title[l] ?? ""} required onInput={(e) => setTitle({ ...title, [l]: (e.target as HTMLInputElement).value })} />
          </label>
        ))}
      </fieldset>
      <div class="f-grid4">
        <label class="f-row"><span>{t("look")}</span>
          <select value={brand} onChange={(e) => setBrand((e.target as HTMLSelectElement).value)}>
            <option value="studio-dark">{t("brandDark")}</option><option value="darsi-light">{t("brandLight")}</option>
          </select></label>
        <label class="f-row"><span>{t("shape")}</span>
          <select value={stage} onChange={(e) => setStage((e.target as HTMLSelectElement).value as typeof stage)}>
            <option value="landscape">{t("landscape")}</option><option value="portrait">{t("portrait")}</option><option value="square">{t("square")}</option>
          </select></label>
      </div>
      <div class="modal-foot">
        <button type="button" class="link" onClick={onClose}>{t("cancel")}</button>
        <button type="submit" class="btn primary" disabled={!ready || busy}>{busy ? t("creating") : t("create")}</button>
      </div>
    </form>
  );
}
