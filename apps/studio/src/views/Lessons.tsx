import { useEffect, useState } from "preact/hooks";
import { collection, doc, getDocs, onSnapshot, query, where, writeBatch } from "firebase/firestore";
import { dirOf } from "@lessonstudio/spec";
import { newLesson, type LessonDoc } from "@lessonstudio/ops";
import { db } from "../fb.ts";
import { go, say, user } from "../state.ts";
import { createLesson } from "../sync.ts";
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

/** What the lesson is about: title, languages, look. A first title scene is made from it. */
function Brief({ onClose }: { onClose: () => void }) {
  const [langs, setLangs] = useState<string[]>(["en", "ar"]);
  const [title, setTitle] = useState<Record<string, string>>({});
  const [brand, setBrand] = useState("studio-dark");
  const [stage, setStage] = useState<"landscape" | "portrait" | "square">("landscape");
  const [busy, setBusy] = useState(false);
  const ready = langs.length > 0 && langs.every((l) => (title[l] ?? "").trim());
  const create = async () => {
    setBusy(true);
    const first = (title.en ?? title[langs[0]!] ?? "lesson").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "lesson";
    const id = `${first}-${Math.random().toString(36).slice(2, 6)}`;
    const lesson = newLesson({
      id, title: Object.fromEntries(langs.map((l) => [l, title[l]!.trim()])),
      languages: langs.map((code) => ({ code, name: LANGS.find(([c]) => c === code)?.[1] ?? code })),
      brand, stage, createdBy: user.value!.uid, tool: "Lesson Studio",
    });
    try {
      await createLesson(db, id, lesson, user.value!.uid);
      go(`/lessons/${id}`);
    } catch (e) {
      say((e as Error).message, true);
      setBusy(false);
    }
  };
  return (
    <div class="modal" role="dialog" aria-modal="true" aria-label={t("newLesson")}>
      <form class="modal-box" onSubmit={(e) => { e.preventDefault(); if (ready && !busy) void create(); }}>
        <h2>{t("newLesson")}</h2>
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
        <p class="f-hint">{t("draftWithAiSoon")}</p>
        <div class="modal-foot">
          <button type="button" class="link" onClick={onClose}>{t("cancel")}</button>
          <button type="submit" class="btn primary" disabled={!ready || busy}>{busy ? t("creating") : t("create")}</button>
        </div>
      </form>
    </div>
  );
}
